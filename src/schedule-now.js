// Marks the current time in Lectio's week schedule: a line through today's
// column and a faint one through the other days.
// Lectio places modules and lessons in em from the top of the day, so the
// scale is read from their own times instead of assumed.
import { isoWeek, parseTooltip } from './readers/schedule.js';

const CLOCK = /(?<!\d)(\d{1,2})[:.](\d{2})(?!\d)/g;
const pad = n => String(n).padStart(2, '0');
const localDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const em = value => /^-?\d*\.?\d+em$/.test(value || '') ? parseFloat(value) : NaN;
const median = values => {
  const sorted = values.sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// One container per column in the last row: the time column, then the days.
const containers = table => Array.from(table.rows[table.rows.length - 1]?.cells || [], cell => cell.querySelector(':scope > .s2skemabrikcontainer'));

// Lessons carry their times in the tooltip, the time column's modules in their text.
function timesOf(el) {
  const tooltip = el.getAttribute('data-tooltip');
  if (tooltip) {
    const tip = parseTooltip(tooltip);
    if (!tip || tip.start.slice(0, 10) !== tip.end.slice(0, 10)) return null;
    return [tip.start, tip.end].map(stamp => Number(stamp.slice(11, 13)) * 60 + Number(stamp.slice(14, 16)));
  }
  if (el.matches('.s2skemabrik')) return null;
  const times = Array.from(el.textContent.matchAll(CLOCK), ([, h, m]) => Number(h) * 60 + Number(m)).filter(t => t < 24 * 60);
  return times.length ? [times[0], times[1] ?? times[0]] : null;
}

// Each placed element gives its top at its start time and its bottom at its end
// time. The median of the pairwise slopes keeps one odd element from tilting
// the scale. Returns minutes after midnight → em, or null without two times.
export function scheduleScale(table) {
  const points = [];
  for (const container of containers(table)) {
    for (const el of container?.children || []) {
      const top = em(el.style.top);
      const span = Number.isNaN(top) ? null : timesOf(el);
      if (!span) continue;
      points.push([span[0], top]);
      const height = em(el.style.height);
      if (span[1] > span[0] && !Number.isNaN(height)) points.push([span[1], top + height]);
    }
  }
  const slopes = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (points[i][0] !== points[j][0]) slopes.push((points[j][1] - points[i][1]) / (points[j][0] - points[i][0]));
    }
  }
  if (!slopes.length) return null;
  const slope = median(slopes);
  if (!(slope > 0)) return null;
  const offset = median(points.map(([minutes, top]) => top - slope * minutes));
  return minutes => offset + slope * minutes;
}

// Day headers read "Mandag (5/10)". A week heading or a lesson's date that is
// not today's means the same day and month in another year.
function todayColumn(table, now) {
  const heading = table.rows[0]?.textContent.match(/Uge\s+(\d{1,2})\D+(\d{4})/i);
  const { week, year } = isoWeek(now);
  if (heading && (Number(heading[1]) !== week || Number(heading[2]) !== year)) return -1;
  const column = Array.from(table.rows[1]?.cells || []).findIndex(cell => {
    const date = cell.textContent.match(/\((\d{1,2})\/(\d{1,2})\)/);
    return date && Number(date[1]) === now.getDate() && Number(date[2]) === now.getMonth() + 1;
  });
  const lesson = containers(table)[column]?.querySelector('[data-tooltip]');
  const date = lesson && parseTooltip(lesson.getAttribute('data-tooltip'))?.start.slice(0, 10);
  return date && date !== localDate(now) ? -1 : column;
}

function nowTop(table, now) {
  const column = todayColumn(table, now);
  const cells = containers(table);
  if (column < 1 || !cells[column] || cells.length !== table.rows[1].cells.length) return null;
  const top = scheduleScale(table)?.(now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60);
  const height = em(cells[column].style.height);
  if (top === undefined || top < 0 || top > height) return null;
  return { column, top };
}

// Only adds or removes elements when something changed: the page observer
// re-runs prepareNative on every added or removed node.
function marker(container, className) {
  let el = container.querySelector(`:scope > .${className}`);
  if (!el) {
    el = container.ownerDocument.createElement('div');
    el.className = className;
    el.setAttribute('aria-hidden', 'true');
    container.prepend(el);
  }
  return el;
}

function setTop(el, top) {
  const value = `${top.toFixed(2)}em`;
  if (el.style.top !== value) el.style.top = value;
}

export function markNow(root, now = new Date()) {
  for (const table of root.querySelectorAll('table.s2skema')) {
    const at = nowTop(table, now);
    if (!at) {
      clearNow(table);
      continue;
    }
    const [, ...days] = containers(table);
    days.forEach((container, i) => {
      if (!container) return;
      const line = marker(container, 'lx-now-line');
      line.classList.toggle('lx-now-today', i + 1 === at.column);
      setTop(line, at.top);
    });
  }
}

export function clearNow(root) {
  for (const el of root.querySelectorAll('.lx-now-line')) el.remove();
}
