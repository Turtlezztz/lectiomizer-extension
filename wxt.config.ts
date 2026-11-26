import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: ({ browser }) => ({
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
    action: { default_title: 'Åbn Lectiomizer' },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'lectiomizer@local.extension',
              strict_min_version: '142.0',
              data_collection_permissions: { required: ['none'], optional: ['websiteContent'] },
            },
          },
        }
      : {}),
  }),
});
