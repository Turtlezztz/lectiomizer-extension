// Small student pages: Bøger (BD/UserReservations.aspx), SPS (Elev_SPS.aspx)
// and the digital Studiekort (digitaltStudiekort.aspx).
import { text } from '../page-data.js';
import { ReaderError, nativeCells, headerRow, noRecordText } from './util.js';

// "17-04-2026" → Date
function dashDate(value) {
  const m = (value || '').match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
}

const money = value => {
  const m = (value || '').replace(/\./g, '').match(/-?\d+(,\d+)?/);
  return m ? Number(m[0].replace(',', '.')) : null;
};

export function readBooks(doc) {
  const table = doc.querySelector('table[id$="BdBookLoanGV"]');
  const toggle = doc.querySelector('input[id$="ShowActiveOnlyCB"]');
  if (!table) {
    if (!doc.querySelector('#contenttable')) throw new ReaderError('Boglån blev ikke fundet');
    return { books: [], activeOnly: toggle ? toggle.checked : null, toggle, empty: '' };
  }
  const head = headerRow(table);
  const labels = head ? nativeCells(head).map(c => text(c).toLocaleLowerCase('da')) : [];
  const col = re => labels.findIndex(l => re.test(l));
  const at = { title: col(/bogtitel/), hold: col(/^hold/), lent: col(/udlån/), returned: col(/aflevering reg/), due: col(/afleveringsfrist/), price: col(/pris/) };
  const books = Array.from(table.rows).filter(r => r !== head && r.querySelector('td') && !r.querySelector('.noRecord')).map(row => {
    const cells = nativeCells(row);
    const cell = key => (at[key] >= 0 ? cells[at[key]] : null);
    return {
      title: text(cell('title')),
      hold: text(cell('hold')),
      lent: dashDate(text(cell('lent'))),
      returned: dashDate(text(cell('returned'))),
      due: dashDate(text(cell('due'))),
      price: money(text(cell('price'))),
    };
  }).filter(b => b.title);
  return { books, activeOnly: toggle ? toggle.checked : null, toggle, empty: books.length ? '' : noRecordText(table) || '' };
}

// A Lectio grid as plain text: headings + rows of cell text.
function grid(table) {
  if (!table) return { labels: [], rows: [], empty: '' };
  const head = headerRow(table);
  const labels = head ? nativeCells(head).map(c => text(c)) : [];
  const rows = Array.from(table.rows).filter(r => r !== head && r.querySelector('td') && !r.querySelector('.noRecord')).map(r => nativeCells(r).map(c => text(c)));
  return { labels, rows, empty: rows.length ? '' : noRecordText(table) || '' };
}

export function readSps(doc) {
  const content = doc.querySelector('#contenttable');
  if (!content) throw new ReaderError('SPS blev ikke fundet');
  // The "SPS Indstilling" island shows the current recommendation as text (or "ingen indstillinger").
  const current = doc.querySelector('[id$="IndstillingIsland_pa"]');
  const currentText = current ? text(current) : '';
  return {
    current: current && !current.querySelector('.noRecord') && currentText ? current : null,
    currentEmpty: current?.querySelector('.noRecord') ? text(current.querySelector('.noRecord')).replace(/\.{3}$/, '') : '',
    settings: grid(doc.querySelector('table[id$="SpsIndstsGV"]')),
    registrations: grid(doc.querySelector('table[id$="SpsRegistrationsGV"]')),
  };
}

// The signed-in student's elevid: Lectio's start-url meta or its own menu links.
function readStudentId(doc) {
  const meta = doc.querySelector('meta[name="msapplication-starturl"]')?.getAttribute('content') || '';
  const fromMeta = meta.match(/elevid=(\d+)/i)?.[1];
  if (fromMeta) return fromMeta;
  for (const a of Array.from(doc.querySelectorAll('#s_m_mastermenu a[href], [id$="subnavigator_generic_tr"] a[href], nav a[href]'))) {
    const href = a.getAttribute('href') || '';
    const m = !/type=(?!elev\b)/i.test(href) && href.match(/elevid=(\d+)/i);
    if (m) return m[1];
  }
  return null;
}

const schoolRoot = doc => {
  const m = new URL(doc.URL).pathname.match(/^\/lectio\/\d+\//i);
  return new URL(m ? m[0] : '/', doc.URL).href;
};

export function readStudentCard(doc) {
  const card = doc.querySelector('[id$="StudiekortContianerID"], [id$="StudiekortContainerID"], .ls-studiekort-container');
  if (!card) throw new ReaderError('Studiekortet blev ikke fundet');
  const photo = card.querySelector('img.StudPic, img[id$="StudPic"]');
  const logo = card.querySelector('img[id$="LogoID"]');
  // Lectio draws the QR code from GetImage.aspx?type=studiekortqr&studentid=<elevid>
  // in an inline script (stripped when parsing), refreshing it every 36 s.
  const elevId = readStudentId(doc);
  const qr = elevId ? new URL(`GetImage.aspx?type=studiekortqr&studentid=${elevId}`, schoolRoot(doc)).href : null;
  const birthday = text(card.querySelector('[id$="StudentBirthday"]'));
  return {
    name: text(card.querySelector('[id$="StudentName"]')),
    school: text(card.querySelector('[id$="SchoolName"]')),
    birthday: birthday.replace(/^Fødselsdag:\s*/i, ''),
    photo: photo?.getAttribute('src') ? photo.src : null,
    logo: logo?.getAttribute('src') ? logo.src : null,
    qr,
    qrRefreshMs: 36_000,
    stamp: text(card.querySelector('.LectioSKcr, [id$="LectioCR"]')),
  };
}
