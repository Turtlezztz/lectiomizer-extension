// `npm run dev:app` — runs the app page outside the extension, backed by
// captured Lectio pages in ./fixtures (gitignored: they hold personal data).
// Capture: POST raw HTML to /__capture?url=<lectio url> (see scripts/capture.md).
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const dir = resolve(__dirname, 'fixtures');
const indexFile = resolve(dir, 'index.json');
const readIndex = (): Record<string, string> => (existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : {});
// Match on path + query, ignoring host and param order.
const norm = (raw: string) => {
  const u = new URL(raw, 'https://www.lectio.dk');
  const params = [...u.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  return u.pathname.toLowerCase() + (params.length ? '?' + new URLSearchParams(params).toString().toLowerCase() : '');
};

function fixtures(): Plugin {
  return {
    name: 'lectio-fixtures',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost');
        if (url.pathname === '/__capture') {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Private-Network', 'true');
          if (req.method === 'OPTIONS') return res.end();
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const target = url.searchParams.get('url')!;
          mkdirSync(dir, { recursive: true });
          const file = createHash('sha1').update(norm(target)).digest('hex').slice(0, 16) + '.html';
          writeFileSync(resolve(dir, file), Buffer.concat(chunks));
          const index = readIndex();
          index[norm(target)] = file;
          writeFileSync(indexFile, JSON.stringify(index, null, 1));
          return res.end('ok');
        }
        if (url.pathname === '/__lectio') {
          const target = url.searchParams.get('url')!;
          const index = readIndex();
          const key = norm(target);
          // Exact match, else same path ignoring query (e.g. other weeks).
          const file = index[key] || Object.entries(index).find(([k]) => k.split('?')[0] === key.split('?')[0])?.[1];
          if (!file) {
            res.statusCode = 404;
            return res.end(`No fixture for ${key}`);
          }
          res.setHeader('content-type', 'text/html; charset=utf-8');
          res.setHeader('x-lectio-url', target);
          return res.end(readFileSync(resolve(dir, file)));
        }
        next();
      });
    },
  };
}

export default defineConfig({
  root: resolve(__dirname, 'src/entrypoints/app'),
  publicDir: resolve(__dirname, 'public'),
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  plugins: [react(), tailwindcss(), fixtures()],
  server: { port: 5199, strictPort: true, cors: true },
});
