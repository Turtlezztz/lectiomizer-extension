// Calendar sync settings and status, shared by the background script, the
// content script that reads the Skema, and the settings UI.
import { storedObject } from '../settings.js';

// The OAuth client id is injected at build time (.env).
export const GOOGLE_CLIENT_ID = typeof __GOOGLE_CLIENT_ID__ === 'string' ? __GOOGLE_CLIENT_ID__ : '';

export const WEEK_CHOICES = [1, 2, 4, 8];
// How often an open Lectio tab fetches the Skema on its own.
export const INTERVALS = [
  { minutes: 15, label: 'Hvert kvarter' },
  { minutes: 30, label: 'Hver halve time' },
  { minutes: 60, label: 'Hver time' },
  { minutes: 180, label: 'Hver 3. time' },
  { minutes: 360, label: 'Hver 6. time' },
  { minutes: 1440, label: 'Hver dag' },
];

export const CALENDAR_DEFAULTS = { connected: false, email: '', calendarId: '', weeks: 4, cancelled: true, interval: 60 };
export const [loadCalendar, saveCalendar] = storedObject('calendar', CALENDAR_DEFAULTS);

// { state: 'idle'|'syncing'|'ok'|'error', message, startedAt, checkedAt, syncedAt, lessons, weeks, reconnect }
export const [loadCalendarStatus, saveCalendarStatus] = storedObject('calendarStatus', {});

// An interval that is no longer offered falls back to the hourly default.
export function intervalOf(settings) {
  return INTERVALS.find(choice => choice.minutes === settings.interval) || INTERVALS.find(choice => choice.minutes === CALENDAR_DEFAULTS.interval);
}

// When the next automatic fetch (or retry after an error) is due; 0 if Lectio
// has never been checked.
export function nextSyncAt(settings, status) {
  return status.checkedAt ? status.checkedAt + intervalOf(settings).minutes * 60000 : 0;
}
