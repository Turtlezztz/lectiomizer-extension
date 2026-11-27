import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getItem, isExtension, onItemChange, setItem } from './storage';
import { applySubjectColors, applySubjectNames, type SubjectColors, type SubjectLinksMap, type SubjectNames } from './subjects';

export interface School {
  id: string;
  name: string;
}

export interface Settings {
  school: School | null;
  theme: 'system' | 'light' | 'dark';
  sidebarCollapsed: boolean;
  /** Which foldable menu groups are open (both folded by default). */
  navOpen?: { study?: boolean; school?: boolean };
  /** Colours the user picked per subject (subjectKey → colour id). */
  subjectColors: SubjectColors;
  /** Own display names per subject (subjectKey → name), see subjectLabel(). */
  subjectNames?: SubjectNames;
  /** Own links per subject (subjectKey → links), see subjectLinks(). */
  subjectLinks?: SubjectLinksMap;
  /** Add a "Sendt med Lectiomizer" link under messages sent from the app. */
  messageSignature: boolean;
  /** The toolbar button shows the small popup (default) instead of opening the app directly. */
  toolbarPopup?: boolean;
  /** Accent colour preset (default coral), applied as `data-accent` on <html>, see app.css. */
  accent?: 'coral' | 'blue' | 'green' | 'violet' | 'pink';
  /** Spacing density, applied as the `density-compact` class on <html>. */
  density?: 'normal' | 'compact';
  /** Page the app opens on (default the overview). */
  startPage?: 'home' | 'schedule' | 'assignments' | 'homework' | 'messages';
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
  // Set while rendering, so pages rendered below already see the names.
  applySubjectNames(settings.subjectNames);
  useEffect(() => {
    const el = document.documentElement;
    if (settings.accent && settings.accent !== 'coral') el.dataset.accent = settings.accent;
    else delete el.dataset.accent;
    el.classList.toggle('density-compact', settings.density === 'compact');
  }, [settings.accent, settings.density]);
  const update = (patch: Partial<Settings>) =>
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      // Leaving a school: drop its saved offline pages (grades, absence, …).
      if ('school' in patch && prev.school && prev.school.id !== patch.school?.id) {
        const left = prev.school.id;
        void import('./lectio/offline').then((m) => m.clearSavedPages(left)).catch(() => {});
      }
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
