import { useState } from 'react';
import { cn } from '@/lib/cn';

const palette = ['bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300', 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300', 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300', 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300', 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300', 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300', 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300', 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'];
export const hash = (s: string) => Array.from(s).reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
export const initials = (name = '') => name.replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean).map((p, i, a) => (i === 0 || i === a.length - 1 ? p[0] : '')).join('').toUpperCase().slice(0, 2) || '?';

export function Avatar({ name, src, size = 32, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, fontSize: Math.max(10, size * 0.38) };
  if (src && !failed) {
    return <img src={src} alt="" style={style} onError={() => setFailed(true)} className={cn('shrink-0 rounded-full bg-surface-3 object-cover ring-1 ring-border', className)} />;
  }
  return (
    <span aria-hidden style={style} className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold', palette[Math.abs(hash(name)) % palette.length], className)}>
      {initials(name)}
    </span>
  );
}
