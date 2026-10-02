// Lectio owns the data and actions. This adapter reads the live DOM only.
export const selectors = {
  content: '#contenttable',
  outer: '[id$="outerContentFrameDiv"]',
  header: '[id$="masterHeaderDiv"]',
  mainNavigation: '[id$="mastermenu"]',
  studentNavigation: '[id$="subnavigator_generic_tr"]',
  title: '[id$="MainTitle"], #MainTitle',
  school: '.ls-master-header-institution-name',
  timetable: 'table.s2skema',
};

export function cleanLabel(value = '') {
  return value.replace(/\b(search|calendar_month|keyboard_arrow_left|keyboard_arrow_right|login|logout|fiber_manual_record)\b/g, ' ').replace(/\s+/g, ' ').trim();
}

export function schoolBase(url) {
  const match = new URL(url).pathname.match(/^\/lectio\/(\d+)\//i);
  return match ? `/lectio/${match[1]}/` : null;
}

export function routeKey(url) {
  const u = new URL(url, 'https://www.lectio.dk');
  const params=new URLSearchParams();
  for(const key of ['menu','type','displaytype'])if(u.searchParams.has(key))params.set(key,u.searchParams.get(key));
  return u.pathname.toLowerCase()+(params.size?'?'+params.toString():'');
}

export function navigationFromDOM(doc, url) {
  const base = schoolBase(url);
  const seen = new Set();
  const sources = [selectors.studentNavigation, selectors.mainNavigation];
  const result = [];
  for (const selector of sources) {
    for (const anchor of doc.querySelectorAll(`${selector} a[href]`)) {
      const label = cleanLabel(anchor.textContent);
      const raw = anchor.getAttribute('href');
      if (!label || !raw || raw.startsWith('#') || /^javascript:/i.test(raw)) continue;
      const destination = new URL(raw, url);
      if (destination.origin !== new URL(url).origin || (base && !destination.pathname.startsWith(base))) continue;
      const key = routeKey(destination.href);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ label, href: destination.href, source: anchor });
    }
  }
  return result;
}

export function pageKind(url) {
  const path = new URL(url).pathname.toLowerCase();
  if (/aktivitetforside/.test(path)) return 'activity';
  if (/userreservations/.test(path)) return 'books';
  if (/skemany|skemauge/.test(path)) return 'schedule';
  if (/forside\.aspx$/.test(path)) return 'home';
  if (/elevaflevering/.test(path)) return 'assignment';
  if (/opgaverelev/.test(path)) return 'assignments';
  if (/beskeder/.test(path)) return 'messages';
  if (/fravaer/.test(path)) return 'absence';
  if (/\/grades\//.test(path)) return 'grades';
  if (/dokument/.test(path)) return 'documents';
  if (/studieplan|teacherstudybook|studieretning|fagvalg/.test(path)) return 'study';
  if (/lektie/.test(path)) return 'homework';
  if (/login/.test(path)) return 'login';
  return 'general';
}
