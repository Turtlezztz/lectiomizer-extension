#!/usr/bin/env node
// Builds Lectiomizer locally and publishes a GitHub release for the version in package.json.
//
//   npm run release              # build, sign Firefox, tag v<version>, publish the release
//   npm run release -- --draft   # same, but leave the release as a draft to edit first
//   npm run release -- --xpi path/to/signed.xpi   # use an XPI you already signed (skips AMO)
//
// Firefox only installs signed add-ons, so the Firefox build is signed on addons.mozilla.org
// as an *unlisted* (self-distributed) version. Put the AMO API credentials
// (https://addons.mozilla.org/developers/addon/api/key/) in .env or the environment:
//   AMO_JWT_ISSUER=user:12345:678
//   AMO_JWT_SECRET=…
// The signed XPI and an updates.json are attached to the release; the Firefox manifest's
// update_url points at the latest release's updates.json, so installed copies update themselves.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO = 'Turtlezztz/lectiomizer-extension';
const GECKO_ID = 'lectiomizer@local.extension';
// Set this to the extension's Chrome Web Store page to link it from the release notes.
const CHROME_WEB_STORE_URL = process.env.CHROME_WEB_STORE_URL || '';

const args = process.argv.slice(2);
const draft = args.includes('--draft');
const xpiArg = args.includes('--xpi') ? args[args.indexOf('--xpi') + 1] : null;

const root = resolve(import.meta.dirname, '..');
process.chdir(root);
if (existsSync('.env')) process.loadEnvFile('.env');

const run = (cmd, cmdArgs, opts = {}) => execFileSync(cmd, cmdArgs, { stdio: 'inherit', ...opts });
const out = (cmd, cmdArgs) => execFileSync(cmd, cmdArgs, { encoding: 'utf8' }).trim();
const tryOut = (cmd, cmdArgs) => {
  try {
    return out(cmd, cmdArgs);
  } catch {
    return null;
  }
};
const fail = (msg) => {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
};
const step = (msg) => console.log(`\n▸ ${msg}`);

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const tag = `v${version}`;
const outDir = '.output';
const releaseDir = join(outDir, 'release', version);

// ── Preflight ────────────────────────────────────────────────────────────────
step(`Releasing ${tag}`);
if (out('git', ['status', '--porcelain', '--untracked-files=no'])) fail('Commit or stash your changes first.');
const branch = out('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
if (branch !== 'main') fail(`Release from main (you are on ${branch}).`);
if (tryOut('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}`])) fail(`Tag ${tag} already exists. Bump the version in package.json first.`);
if (tryOut('gh', ['release', 'view', tag, '--repo', REPO])) fail(`A GitHub release ${tag} already exists.`);
const amoKey = process.env.AMO_JWT_ISSUER || process.env.WEB_EXT_API_KEY;
const amoSecret = process.env.AMO_JWT_SECRET || process.env.WEB_EXT_API_SECRET;
if (!xpiArg && !(amoKey && amoSecret)) {
  fail('Set AMO_JWT_ISSUER and AMO_JWT_SECRET (in .env) to sign the Firefox build, or pass --xpi <signed.xpi>.');
}
if (xpiArg && !existsSync(xpiArg)) fail(`No such file: ${xpiArg}`);

// ── Check and build ──────────────────────────────────────────────────────────
step('Typecheck and tests');
run('npm', ['run', 'typecheck']);
run('npm', ['test']);

step('Build and zip (Chrome + Firefox)');
run('npx', ['wxt', 'zip']);
run('npx', ['wxt', 'zip', '-b', 'firefox']);
const chromeZip = join(outDir, `lectiomizer-${version}-chrome.zip`);
const sourcesZip = join(outDir, `lectiomizer-${version}-sources.zip`);
for (const f of [chromeZip, sourcesZip]) if (!existsSync(f)) fail(`Expected ${f} after building.`);

rmSync(releaseDir, { recursive: true, force: true });
mkdirSync(releaseDir, { recursive: true });
const assets = {
  chrome: join(releaseDir, `lectiomizer-${version}-chrome.zip`),
  firefox: join(releaseDir, `lectiomizer-${version}-firefox.xpi`),
  sources: join(releaseDir, `lectiomizer-${version}-sources.zip`),
  updates: join(releaseDir, 'updates.json'),
};
copyFileSync(chromeZip, assets.chrome);
copyFileSync(sourcesZip, assets.sources);

// ── Sign Firefox ─────────────────────────────────────────────────────────────
if (xpiArg) {
  step(`Using the signed XPI ${xpiArg}`);
  copyFileSync(xpiArg, assets.firefox);
} else {
  step('Signing the Firefox build on addons.mozilla.org (unlisted). This can take a few minutes.');
  const signedDir = join(releaseDir, 'signed');
  run('npx', [
    'web-ext', 'sign',
    '--source-dir', join(outDir, 'firefox-mv2'),
    '--artifacts-dir', signedDir,
    '--channel', 'unlisted',
    '--upload-source-code', sourcesZip,
    '--approval-timeout', String(30 * 60 * 1000),
    '--no-config-discovery',
  ], { env: { ...process.env, WEB_EXT_API_KEY: amoKey, WEB_EXT_API_SECRET: amoSecret } });
  const xpi = readdirSync(signedDir).find((f) => f.endsWith('.xpi'));
  if (!xpi) fail(`AMO did not return a signed .xpi in ${signedDir}.`);
  copyFileSync(join(signedDir, xpi), assets.firefox);
  rmSync(signedDir, { recursive: true, force: true });
}

// Firefox checks this file (via update_url) to update copies installed from GitHub.
const downloadBase = `https://github.com/${REPO}/releases/download/${tag}`;
writeFileSync(assets.updates, `${JSON.stringify({
  addons: { [GECKO_ID]: { updates: [{ version, update_link: `${downloadBase}/lectiomizer-${version}-firefox.xpi` }] } },
}, null, 2)}\n`);

// ── Release notes ────────────────────────────────────────────────────────────
const prevTag = tryOut('git', ['describe', '--tags', '--abbrev=0', 'HEAD^']);
// Before the first tag, fall back to the previous "Release x.y.z" commit.
const since = prevTag ?? tryOut('git', ['log', '--format=%H', '-1', '--grep=^Release ', 'HEAD^']);
const changes = out('git', ['log', '--format=%s', '--no-merges', since ? `${since}..HEAD` : 'HEAD'])
  .split('\n')
  .filter((s) => s && !/^Release \d/.test(s))
  .map((s) => `- ${s}`)
  .join('\n');

const chromeStore = CHROME_WEB_STORE_URL
  ? `Lectiomizer is also on the [Chrome Web Store](${CHROME_WEB_STORE_URL}), which installs it in one click and keeps it updated.`
  : 'Lectiomizer is also on the Chrome Web Store, which installs it in one click and keeps it updated.';

const notes = `${changes ? `## What's new\n\n${changes}\n\n` : ''}## Install

### Firefox

1. Download **lectiomizer-${version}-firefox.xpi** below.
2. Firefox asks whether to add Lectiomizer. Choose **Add**. If it saves the file instead, open \`about:addons\`, click the gear icon and choose **Install Add-on From File…**.

Firefox 142 or newer. The add-on is signed by Mozilla and updates itself from these releases.

### Chrome, Edge, Brave

${chromeStore}

To install it from here instead:

1. Download **lectiomizer-${version}-chrome.zip** below and unzip it.
2. Open \`chrome://extensions\` and turn on **Developer mode**.
3. Click **Load unpacked** and choose the unzipped folder.

A copy installed this way does not update itself. Download the next release to update it.
`;
const notesFile = join(releaseDir, 'notes.md');
writeFileSync(notesFile, notes);

// ── Publish ──────────────────────────────────────────────────────────────────
step('Pushing main and the tag');
run('git', ['push', 'origin', 'main']);
run('git', ['tag', '-a', tag, '-m', `Lectiomizer ${version}`]);
run('git', ['push', 'origin', tag]);

step(draft ? 'Creating a draft GitHub release' : 'Publishing the GitHub release');
run('gh', [
  'release', 'create', tag,
  '--repo', REPO,
  '--title', `Lectiomizer ${version}`,
  '--notes-file', notesFile,
  '--verify-tag',
  ...(draft ? ['--draft'] : ['--latest']),
  assets.firefox, assets.chrome, assets.updates, assets.sources,
]);

console.log(`\n✔ ${tag} ${draft ? 'drafted' : 'released'}: https://github.com/${REPO}/releases/tag/${tag}`);
