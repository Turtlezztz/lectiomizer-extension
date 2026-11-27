import { createRoot } from 'react-dom/client';
import { SettingsProvider } from '@/lib/settings';
import { Popup } from './Popup';
import '@/styles/app.css';

createRoot(document.getElementById('root')!).render(
  <SettingsProvider>
    <Popup />
  </SettingsProvider>,
);
