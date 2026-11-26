// App-side access to background state: notification history, check status,
// sync preferences and Google Calendar status. Live-updates via storage events.
import { useEffect, useState } from 'react';
import { extApi, getItem, isExtension, onItemChange } from '../storage';
import { CALENDAR_STATUS_KEY, HISTORY_KEY, SYNC_DEFAULTS, SYNC_KEY, savePrefs, type AccountState, type CalendarStatus, type History, type Notice, type SyncPrefs } from './store';

function useStored<T>(key: string, fallback: T): T {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    let alive = true;
    getItem<T>(key, fallback).then((v) => alive && setValue(v));
    const off = onItemChange<T>(key, (v) => setValue(v ?? fallback));
    return () => {
      alive = false;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return value;
}

/** Talk to the background script. Outside the extension (dev) it explains why nothing happens. */
export async function send<T = { ok: boolean; message?: string }>(message: Record<string, unknown>): Promise<T> {
  if (!isExtension) return { ok: false, message: 'Virker kun når Lectiomizer kører som udvidelse.' } as T;
  return extApi.runtime.sendMessage(message);
}

export function usePrefs(): [SyncPrefs, (patch: Partial<SyncPrefs>) => Promise<SyncPrefs>] {
  const stored = useStored<Partial<SyncPrefs>>(SYNC_KEY, {});
  return [{ ...SYNC_DEFAULTS, ...stored }, savePrefs];
}

export function useCalendarStatus(): CalendarStatus {
  return useStored<CalendarStatus>(CALENDAR_STATUS_KEY, {});
}

export function useAccount(): AccountState {
  const history = useStored<History>(HISTORY_KEY, { accounts: {} });
  if (!isExtension) return demoAccount;
  return (history.current && history.accounts[history.current]) || {};
}

export function useNotices(): { notices: Notice[]; unread: number; account: AccountState } {
  const account = useAccount();
  const notices = account.messages || [];
  return { notices, unread: notices.filter((n) => !n.read).length, account };
}

// ------------------------------------------------------------- dev demo data
const h = 3_600_000;
const t0 = Date.now();
const demoAccount: AccountState = {
  status: { state: 'ok', checkedAt: t0 - 12 * 60_000, message: '' },
  messages: [
    {
      id: 'd1', kind: 'changed', createdAt: t0 - 0.3 * h, read: false,
      lesson: { id: 'absid:102', start: '2026-11-16T10:00', end: '2026-11-16T11:30', title: 'Prøve', holds: ['3a Ma'], rooms: ['B14'], teachers: ['tn'], href: 'https://www.lectio.dk/lectio/123/aktivitet/aktivitetforside2.aspx?absid=102' },
      before: { id: 'absid:102', start: '2026-11-16T10:00', end: '2026-11-16T11:30', title: 'Prøve', holds: ['3a Ma'], rooms: ['B21'], teachers: ['tn'] },
    },
    { id: 'd2', kind: 'message', createdAt: t0 - 2 * h, read: false, item: { id: 'm1', title: 'Ekskursion fredag', href: 'https://www.lectio.dk/lectio/123/beskeder2.aspx?type=showthread&id=0', description: 'Lene Madsen' } },
    {
      id: 'd3', kind: 'cancelled', createdAt: t0 - 5 * h, read: false,
      lesson: { id: 'absid:103', start: '2026-11-17T08:15', end: '2026-11-17T09:45', holds: ['3a En'], rooms: ['C03'], href: 'https://www.lectio.dk/lectio/123/aktivitet/aktivitetforside2.aspx?absid=103' },
    },
    { id: 'd4', kind: 'assignment', createdAt: t0 - 26 * h, read: true, item: { id: 'a1', title: 'Rapport om energi', href: 'https://www.lectio.dk/lectio/123/ElevAflevering.aspx?exerciseid=1001', description: '3a Fy · Frist: 27/11-2026 23:59' } },
    { id: 'd5', kind: 'restored', createdAt: t0 - 50 * h, read: true, lesson: { id: 'absid:104', start: '2026-11-18T12:10', end: '2026-11-18T13:40', holds: ['3a Fy'], rooms: ['Lab 2'] } },
  ],
};
