import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getItem, isExtension, onItemChange, setItem } from './storage';
import { applySubjectColors, type SubjectColors } from './subjects';

export interface School {
  id: string;
  name: string;
}

export interface Settings {
  school: School | null;
  theme: 'system' | 'light' | 'dark';
  sidebarCollapsed: boolean;
  /** Colours the user picked per subject (subjectKey → colour id). */
  subjectColors: SubjectColors;
  /** Add a "Sendt med Lectiomizer" link under messages sent from the app. */
  messageSignature: boolean;
}

// Outside the extension (dev harness) the fixtures belong to a demo school.
const DEFAULTS: Settings = { school: isExtension ? null : { id: '123', name: 'Demo Gymnasium' }, theme: 'system', sidebarCollapsed: false, subjectColors: {}, messageSignature: true };
const KEY = 'settings';

const Ctx = createContext<{ settings: Settings; update: (patch: Partial<Settings>) => void; ready: boolean } | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    getItem<Partial<Settings>>(KEY, {}).then((s) => {
      setSettings({ ...DEFAULTS, ...s });
      setReady(true);
    });
    return onItemChange<Partial<Settings>>(KEY, (s) => setSettings({ ...DEFAULTS, ...s }));
  }, []);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.classList.toggle('dark', settings.theme === 'dark' || (settings.theme === 'system' && media.matches));
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings.theme]);
  useEffect(() => applySubjectColors(settings.subjectColors), [settings.subjectColors]);
  const update = (patch: Partial<Settings>) =>
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      setItem(KEY, next);
      return next;
    });
  return <Ctx.Provider value={{ settings, update, ready }}>{children}</Ctx.Provider>;
}

export function useSettings() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSettings outside SettingsProvider');
  return ctx;
}
