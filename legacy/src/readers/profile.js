// Read only text and same-origin destinations from Lectio's context card.
// Never mount its HTML: cards can contain native handlers and scripts.
import { personName } from './thread.js';
import { fullPhoto } from '../lectio.js';

const clean = value => (value || '').replace(/\s+/g, ' ').trim();
const safeURL = (value, base) => {
  try { const url = new URL(value, base); return /^https?:$/.test(url.protocol) && url.origin === new URL(base).origin ? url.href : null; } catch { return null; }
};

export function readProfile(doc, url) {
  doc.querySelectorAll('script, style, noscript, .closeContextCard, input, button').forEach(el => el.remove());
  const image = [...doc.querySelectorAll('img[src]')].find(el => /GetImage\.aspx\?|defaultfoto/i.test(el.getAttribute('src')));
  const photo = image && /GetImage\.aspx\?/i.test(image.getAttribute('src')) ? fullPhoto(safeURL(image.getAttribute('src'), url)) : null;
  const details = [];
  const add = (label, value) => {
    label = clean(label).replace(/:$/, ''); value = clean(value);
    if (label && value && label !== value && !details.some(item => item.label === label && item.value === value)) details.push({ label, value });
  };
  doc.querySelectorAll('tr').forEach(row => {
    const cells = [...row.children].filter(el => /^(TD|TH)$/.test(el.tagName));
    if (cells.length >= 2 && !cells[0].querySelector('img, table') && !cells.slice(1).some(el => el.querySelector('table'))) add(cells[0].textContent, cells.slice(1).map(el => el.textContent).join(' · '));
  });
  doc.querySelectorAll('dt').forEach(el => { if (el.nextElementSibling?.matches('dd')) add(el.textContent, el.nextElementSibling.textContent); });
  // Some Lectio cards use plain lines instead of a labelled table.
  const copy = doc.body.cloneNode(true);
  copy.querySelectorAll('br').forEach(el => el.replaceWith('\n'));
  copy.querySelectorAll('p, div, tr, li').forEach(el => el.append('\n'));
  for (const line of copy.textContent.split('\n')) {
    const match = clean(line).match(/^(Navn|Stamklasse|Klasse|Hold|Initialer|E-mail|Email|Telefon|Mobil|Skole|Fag|Titel):\s*(.+)$/i);
    if (match) add(match[1], match[2]);
  }
  const nameField = details.find(item => /^navn$/i.test(item.label));
  const heading = doc.querySelector('.lcc-title, [id$="cctitle"], h1, h2, h3, h4, [class*="contextcard"] strong, b, strong');
  const photoRow = image?.closest('tr');
  const besidePhoto = photoRow && [...photoRow.children].find(el => !el.contains(image));
  const rawName = nameField?.value || clean(heading?.textContent) || clean(besidePhoto?.childNodes[0]?.textContent);
  const title = rawName?.match(/^(Elev|Lærer|Bruger)\s*-\s*(.+)$/i);
  const fullName = title?.[2] || rawName;
  const name = fullName ? personName(fullName) : '';
  for (const item of personDetails({ name, full: fullName })) if (!details.some(existing => /klasse|initialer/i.test(existing.label))) add(item.label, item.value);
  const links = [];
  doc.querySelectorAll('a[href]').forEach(el => {
    const label = clean(el.textContent);
    const href = safeURL(el.getAttribute('href'), url);
    if (href && label && /skema|besked|hold|klasse|profil|kontakt/i.test(label) && !links.some(link => link.href === href)) links.push({ label, href });
  });
  return { name, role: title?.[1] || '', photo, details: details.filter(item => !/^navn$/i.test(item.label)), links };
}

export function personDetails(person) {
  const details = [];
  if (person.className) details.push({ label: 'Klasse', value: person.className });
  const suffix = (person.full || '').slice((person.name || '').length);
  const parts = [...suffix.matchAll(/\(([^()]+)\)/g)].map(match => match[1].trim()).filter(value => value !== 'k');
  for (const value of parts) {
    const label = /^(?:\d+[a-zæøå]|[a-zæøå]+\d+)/i.test(value) ? 'Klasse' : 'Initialer';
    if (!details.some(item => item.label === label)) details.push({ label, value });
  }
  return details;
}

export function readProfileHolds(doc, url) {
  const holds = new Map();
  doc.querySelectorAll('a[href]').forEach(el => {
    const href = safeURL(el.getAttribute('href'), url);
    if (!href) return;
    const destination = new URL(href);
    const id = destination.searchParams.get('holdelementid') || destination.searchParams.get('holdid');
    const name = clean(el.textContent).replace(/^fiber_manual_record\s*/, '');
    if (/\/SkemaNy\.aspx$/i.test(destination.pathname) && id && name) holds.set(id, { name, href });
  });
  return [...holds.values()];
}
