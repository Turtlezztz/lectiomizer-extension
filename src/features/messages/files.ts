// Message attachments: what kind of file a name is, and how big Lectio says it is.
// Lectio serves every file as application/octet-stream, so the type comes from the name.

export type FileKind = 'image' | 'pdf' | 'video' | 'audio' | 'text' | 'docx' | 'other';

const FILE_TYPES: Record<string, [FileKind, string]> = {
  jpg: ['image', 'image/jpeg'],
  jpeg: ['image', 'image/jpeg'],
  png: ['image', 'image/png'],
  gif: ['image', 'image/gif'],
  webp: ['image', 'image/webp'],
  avif: ['image', 'image/avif'],
  bmp: ['image', 'image/bmp'],
  svg: ['image', 'image/svg+xml'],
  pdf: ['pdf', 'application/pdf'],
  mp4: ['video', 'video/mp4'],
  m4v: ['video', 'video/mp4'],
  mov: ['video', 'video/mp4'],
  webm: ['video', 'video/webm'],
  mp3: ['audio', 'audio/mpeg'],
  m4a: ['audio', 'audio/mp4'],
  aac: ['audio', 'audio/aac'],
  wav: ['audio', 'audio/wav'],
  ogg: ['audio', 'audio/ogg'],
  oga: ['audio', 'audio/ogg'],
  flac: ['audio', 'audio/flac'],
  txt: ['text', 'text/plain'],
  csv: ['text', 'text/plain'],
  md: ['text', 'text/plain'],
  log: ['text', 'text/plain'],
  json: ['text', 'text/plain'],
  docx: ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
};

/** What a message attachment is, from its file name. */
export function fileType(name: string): { kind: FileKind; mime: string; ext: string } {
  const ext = name.match(/\.([a-z0-9]+)\s*$/i)?.[1]?.toLowerCase() || '';
  const [kind, mime] = FILE_TYPES[ext] || ['other', 'application/octet-stream'];
  return { kind, mime, ext };
}

/** Lectio's "3 MB", "512 KB", "1,5 MB" → bytes; 0 when unknown. */
export function sizeBytes(size: string): number {
  const m = size.match(/(\d+(?:[.,]\d+)?)\s*([KMG]?)B/i);
  if (!m) return 0;
  const units: Record<string, number> = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3 };
  return parseFloat(m[1].replace(',', '.')) * units[m[2].toUpperCase()];
}

/** Files up to this size load by themselves; bigger ones wait for a click. */
export const AUTO_LOAD_BYTES = 25 * 1024 ** 2;
