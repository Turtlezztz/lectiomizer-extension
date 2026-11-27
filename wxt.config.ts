import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

const OPTIONAL_HOSTS = ['https://auth.openai.com/*', 'https://api.openai.com/*', 'http://127.0.0.1/*'];

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  // The sources zip for Mozilla's review: never captured Lectio pages (personal data) or scratch files.
  zip: { excludeSources: ['fixtures/**', 'scripts/tmp-*', '.idea/**', '.claude/**', '.impeccable/**', '.env*'] },
  vite: () => ({ plugins: [tailwindcss()] }),
  hooks: {
    // The toolbar popup (entrypoints/popup) is attached at runtime by the background
    // (action.setPopup), so it can be turned off and stays off until a school is chosen.
    'build:manifestGenerated': (_wxt, manifest) => {
      delete (manifest as any).action?.default_popup;
      delete (manifest as any).browser_action?.default_popup;
    },
  },
  manifest: ({ browser, manifestVersion }) => ({
    name: 'Lectiomizer',
    description: 'Et nyt, hurtigt Lectio – dit skema, opgaver, beskeder og karakterer samlet ét sted.',
    permissions: ['storage', 'alarms', 'tabs', 'notifications', 'identity', ...(browser === 'firefox' ? [] : ['offscreen'])],
    host_permissions: [
      'https://www.lectio.dk/*',
      'https://lectio.dk/*',
      // Google Calendar sync (only used after the user connects).
      'https://www.googleapis.com/*',
      'https://oauth2.googleapis.com/*',
    ],
    // Asked for when the student turns them on: the Assistent (Sign in with
    // ChatGPT + Responses API) and the MCP bridge to a local MCP server.
    ...(manifestVersion === 2 ? { optional_permissions: OPTIONAL_HOSTS as any } : { optional_host_permissions: OPTIONAL_HOSTS }),
    action: { default_title: 'Åbn Lectiomizer' },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'lectiomizer@local.extension',
              strict_min_version: '142.0',
              // Copies installed from a GitHub release update themselves (see scripts/release.mjs).
              update_url: 'https://github.com/Turtlezztz/lectiomizer-extension/releases/latest/download/updates.json',
              // websiteContent (the schedule, sent to Google Calendar) is asked for at install:
              // the runtime prompt for it failed in Firefox. The Assistent's is still asked on use.
              data_collection_permissions: { required: ['websiteContent'], optional: ['personalCommunications'] },
            },
          },
        }
      : {}),
  }),
});
