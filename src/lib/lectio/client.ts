// The only place that talks to Lectio. Pages are fetched with the user's own
// Lectio session (cookies), parsed into a Document, and handed to the readers.
// Actions are ASP.NET postbacks: we re-submit Lectio's own form with the
// event target a button or link would have used.

export const ORIGIN = 'https://www.lectio.dk';

export class NotLoggedInError extends Error {
  constructor() {
    super('Du er ikke logget ind på Lectio');
    this.name = 'NotLoggedInError';
  }
}

export class LectioHttpError extends Error {
  constructor(public status: number) {
    super(`Lectio svarede ${status}`);
    this.name = 'LectioHttpError';
  }
}

export interface RawResponse {
  url: string;
  status: number;
  html: string;
}

type Body = URLSearchParams | FormData;

export interface Transport {
  request(url: string, init?: { method?: 'GET' | 'POST'; body?: Body }): Promise<RawResponse>;
}

/** Inside the extension: host permissions let us fetch Lectio with its cookies. */
export const extensionTransport: Transport = {
  async request(url, init = {}) {
    const response = await fetch(url, {
      method: init.method ?? 'GET',
      body: init.body,
      credentials: 'include',
      redirect: 'follow',
    });
    return { url: response.url || url, status: response.status, html: await response.text() };
  },
};

/** `npm run dev:app`: pages come from captured fixtures served by the dev server. */
export const fixtureTransport: Transport = {
  async request(url, init = {}) {
    const response = await fetch(`/__lectio?url=${encodeURIComponent(url)}`, {
      method: init.method ?? 'GET',
      body: init.body,
    });
    return { url: response.headers.get('x-lectio-url') || url, status: response.status, html: await response.text() };
  },
};

const inExtension = !!(globalThis as any).chrome?.runtime?.id;
let transport: Transport = inExtension ? extensionTransport : fixtureTransport;
export const setTransport = (t: Transport) => {
  transport = t;
};
export const isFixtureMode = () => transport === fixtureTransport;

/** Parse HTML so links resolve and `doc.URL` is the real Lectio address (readers rely on both). */
export function parseDocument(html: string, url: string): Document {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const base = doc.createElement('base');
  base.href = url;
  doc.head.prepend(base);
  Object.defineProperty(doc, 'URL', { value: url, configurable: true });
  try {
    Object.defineProperty(doc, 'location', { value: new URL(url), configurable: true });
  } catch {
    /* jsdom: location is not redefinable; readers fall back to doc.URL */
  }
  // Never let Lectio's markup load scripts or trackers into our page.
  doc.querySelectorAll('script, link[rel="stylesheet"], style').forEach((el) => el.remove());
  return doc;
}

export function isLoginPage(url: string, doc: Document): boolean {
  const path = new URL(url).pathname.toLowerCase();
  if (/\/login(_list|_qr|\w*)?\.aspx$/.test(path) || /nemlog-in|mitid|unilogin/.test(url)) return true;
  // Authenticated pages always offer "Log ud" in the master menu.
  const hasLogout = Array.from(doc.querySelectorAll('a[href]')).some((a) => /logout\.aspx/i.test(a.getAttribute('href') || ''));
  const hasLoginForm = !!doc.querySelector('input[type="password"], [id$="username"]');
  return !hasLogout && hasLoginForm;
}

async function load(url: string, init?: { method?: 'GET' | 'POST'; body?: Body }): Promise<Document> {
  const res = await transport.request(url, init);
  if (res.status >= 400) throw new LectioHttpError(res.status);
  const doc = parseDocument(res.html, res.url);
  if (isLoginPage(res.url, doc)) throw new NotLoggedInError();
  return doc;
}

export function absolute(pathOrUrl: string, base: string): string {
  return new URL(pathOrUrl, base).href;
}

export function getPage(url: string): Promise<Document> {
  return load(url);
}

// ---------------------------------------------------------------- postbacks

export interface PostbackTarget {
  target: string;
  argument: string;
}

const DO_POSTBACK = /__doPostBack\(\s*\\?['"]([^'"\\]*)\\?['"]\s*,\s*\\?['"]([^'"\\]*)\\?['"]\s*\)/;
const WEBFORM = /WebForm_PostBackOptions\(\s*["']([^"']*)["']\s*,\s*["']([^"']*)["']/;

/** Event target of a Lectio link/button, from its href, onclick or name. */
export function postbackTarget(el: Element | null | undefined): PostbackTarget | null {
  if (!el) return null;
  const sources = [el.getAttribute('href'), el.getAttribute('onclick'), el.getAttribute('onchange')].filter(Boolean) as string[];
  for (const source of sources) {
    const decoded = source.replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const m = decoded.match(DO_POSTBACK) || decoded.match(WEBFORM);
    if (m) return { target: m[1], argument: m[2] };
  }
  const name = el.getAttribute('name');
  if (name && /^(submit|button|image)$/i.test(el.getAttribute('type') || '')) return { target: '', argument: '' };
  return null;
}

/** Serialize a form the way the browser would on submit. */
export function serializeForm(form: HTMLFormElement, submitter?: Element | null): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const el of Array.from(form.elements) as Array<HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement>) {
    const name = el.getAttribute('name');
    if (!name || el.hasAttribute('disabled')) continue;
    const tag = el.tagName;
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (tag === 'INPUT') {
      if (type === 'file') continue;
      if (['submit', 'button', 'image', 'reset'].includes(type)) {
        if (el === submitter) out.push([name, el.getAttribute('value') ?? '']);
        continue;
      }
      if ((type === 'checkbox' || type === 'radio') && !el.hasAttribute('checked') && !el.checked) continue;
      out.push([name, el.value ?? el.getAttribute('value') ?? (type === 'checkbox' ? 'on' : '')]);
    } else if (tag === 'SELECT') {
      const selected = Array.from(el.querySelectorAll('option')).filter((o) => o.hasAttribute('selected') || (o as HTMLOptionElement).selected);
      const chosen = selected.length ? selected : el.hasAttribute('multiple') ? [] : [el.querySelector('option')].filter(Boolean);
      for (const option of chosen as HTMLOptionElement[]) out.push([name, option.getAttribute('value') ?? option.textContent ?? '']);
    } else if (tag === 'TEXTAREA') {
      out.push([name, el.value ?? el.textContent ?? '']);
    } else if (tag === 'BUTTON' && el === submitter) {
      out.push([name, el.getAttribute('value') ?? '']);
    }
  }
  return out;
}

export interface PostbackOptions {
  /** Event target (e.g. from postbackTarget()). Omit when using `submitter`. */
  target?: string;
  argument?: string;
  /** A submit button in the doc, sent as if clicked. */
  submitter?: Element | null;
  /** Field values to override/add, by input name (or an element from the doc). */
  fields?: Record<string, string> | Array<[string | Element, string]>;
  files?: Array<[string, File]>;
}

/** Re-submit Lectio's form from a previously loaded page and return the resulting page. */
export async function postback(doc: Document, options: PostbackOptions): Promise<Document> {
  const form = (doc.querySelector('form#aspnetForm') || doc.forms[0]) as HTMLFormElement | null;
  if (!form) throw new Error('Lectio-siden har ingen formular');
  const entries = new Map<string, string[]>();
  for (const [k, v] of serializeForm(form, options.submitter)) entries.set(k, [...(entries.get(k) || []), v]);
  const set = (k: string, v: string) => entries.set(k, [v]);
  set('__EVENTTARGET', options.target ?? '');
  set('__EVENTARGUMENT', options.argument ?? '');
  const fields = Array.isArray(options.fields) ? options.fields : Object.entries(options.fields || {});
  for (const [key, value] of fields) {
    const name = typeof key === 'string' ? key : key.getAttribute('name');
    if (name) set(name, value);
  }
  const action = new URL(form.getAttribute('action') || doc.URL, doc.URL).href;
  let body: Body;
  if (options.files?.length) {
    body = new FormData();
    for (const [k, values] of entries) for (const v of values) body.append(k, v);
    for (const [k, file] of options.files) body.append(k, file);
  } else {
    body = new URLSearchParams();
    for (const [k, values] of entries) for (const v of values) body.append(k, v);
  }
  return load(action, { method: 'POST', body });
}

// ---------------------------------------------------------------- editor files

export interface UploadedEditorFile {
  /** Path as Lectio stores it in documents, e.g. "/lectio/681/lc/ext/DT123/billede.png". */
  url: string;
  fileName: string;
}

/**
 * Upload a file the way Lectio's document editor (CKEditor) does when you paste
 * or drop an image: POST to editorapi's posteditorfile, which answers with
 * CKEditor's JSON ({ uploaded, fileName, url } or { error: { message } }).
 * The returned URL is then referenced from the document HTML.
 */
export async function uploadEditorFile(schoolId: string, file: File): Promise<UploadedEditorFile> {
  if (isFixtureMode()) return { url: URL.createObjectURL(file), fileName: file.name };
  const body = new FormData();
  body.append('upload', file, file.name);
  const res = await transport.request(`${ORIGIN}/lectio/${schoolId}/lcutil/editorapi.api/posteditorfile`, { method: 'POST', body });
  if (/login|nemlog-in|unilogin/i.test(new URL(res.url).pathname + new URL(res.url).hostname)) throw new NotLoggedInError();
  if (res.status >= 400) throw new LectioHttpError(res.status);
  let json: { uploaded?: number; url?: string; fileName?: string; error?: { message?: string } };
  try {
    json = JSON.parse(res.html);
  } catch {
    throw new Error('Lectio svarede ikke som forventet på uploaden');
  }
  if (!json.url || json.uploaded === 0) throw new Error(json.error?.message || `Kunne ikke uploade ${file.name}`);
  return { url: json.url, fileName: json.fileName || file.name };
}

// ---------------------------------------------------------------- documents

/**
 * Upload a file the way Lectio's document chooser ("Vælg dokument", hand-ins,
 * message attachments) does: POST it as `file` to the school's dokumentupload.aspx,
 * which answers `{"serializedId":"DT…"}`. The id is then handed to the page by
 * writing `JSON.stringify({ serializedId })` into the chooser's hidden
 * `…$selectedDocumentId` field and posting back (see readDocumentChooser).
 */
export async function uploadDocument(pageUrl: string, file: File): Promise<string> {
  if (isFixtureMode()) return 'DT0';
  const school = pageUrl.match(/^(https?:\/\/[^/]+\/lectio\/\d+)\//i)?.[1];
  if (!school) throw new Error('Kunne ikke finde skolen i Lectio-adressen');
  const body = new FormData();
  body.append('file', file, file.name);
  const res = await transport.request(`${school}/dokumentupload.aspx`, { method: 'POST', body });
  const landed = new URL(res.url);
  if (/login|nemlog-in|unilogin|mitid/i.test(landed.pathname + landed.hostname)) throw new NotLoggedInError();
  if (res.status === 413) throw new Error(`${file.name} er for stor til Lectio`);
  if (res.status >= 400) throw new LectioHttpError(res.status);
  let json: { serializedId?: string };
  try {
    json = JSON.parse(res.html);
  } catch {
    throw new Error(`Lectio tog ikke imod ${file.name}`);
  }
  if (!json.serializedId) throw new Error(`Lectio tog ikke imod ${file.name}`);
  return json.serializedId;
}

/** Click a Lectio link/button found in `doc`: follows normal links, posts back otherwise. */
export async function activate(doc: Document, el: Element | null | undefined, extra?: Omit<PostbackOptions, 'target' | 'argument'>): Promise<Document> {
  if (!el) throw new Error('Handlingen findes ikke længere på Lectio-siden');
  const target = postbackTarget(el);
  if (target && (target.target || !el.matches('a'))) {
    return postback(doc, { ...extra, ...target, submitter: target.target ? undefined : el });
  }
  const href = el.getAttribute('href');
  if (href && !href.startsWith('javascript:') && !href.startsWith('#')) return getPage(new URL(href, doc.URL).href);
  throw new Error('Handlingen kunne ikke udføres uden for Lectio');
}
