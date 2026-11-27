// Links shown as what they point to: a Lectio file opens like a message
// attachment, a YouTube link gets its thumbnail and title, and a direct link to
// a picture, video or sound file is shown as that.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Play } from 'lucide-react';
import { AttachmentView } from '@/features/messages/AttachmentView';
import { cn } from '@/lib/cn';
import type { Embed } from './embeds';

const CARD = 'w-[520px] max-w-full overflow-hidden rounded-2xl border border-border bg-surface shadow-card';

export function LinkEmbeds({ embeds, className }: { embeds: Embed[]; className?: string }) {
  if (!embeds.length) return null;
  return (
    <div className={cn('flex max-w-full flex-col gap-1.5', className)}>
      {embeds.map((embed) => (
        <EmbedView key={embed.href} embed={embed} />
      ))}
    </div>
  );
}

export function EmbedView({ embed }: { embed: Embed }) {
  if (embed.kind === 'file') return <AttachmentView file={{ name: embed.name, href: embed.href, size: '' }} />;
  if (embed.kind === 'youtube') return <YouTubeCard embed={embed} />;
  return <MediaCard embed={embed} />;
}

function host(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function SourceBar({ href, title, source }: { href: string; title: string; source: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 border-t border-border px-3 py-2 text-[13px] hover:bg-surface-2"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-fg" title={title}>
          {title}
        </span>
        <span className="block truncate text-[12px] text-fg-subtle">{source}</span>
      </span>
      <ExternalLink className="size-3.5 shrink-0 text-fg-subtle" />
    </a>
  );
}

/** The video's own title, from YouTube's public oEmbed (no account, no key). */
function useYouTubeTitle(id: string) {
  return useQuery({
    queryKey: ['youtube-title', id],
    queryFn: async ({ signal }) => {
      const watch = `https://www.youtube.com/watch?v=${id}`;
      const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`, { signal, credentials: 'omit' });
      if (!response.ok) return null;
      const data = (await response.json()) as { title?: string; author_name?: string };
      return { title: data.title || '', author: data.author_name || '' };
    },
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
    retry: false,
  });
}

function YouTubeCard({ embed }: { embed: Extract<Embed, { kind: 'youtube' }> }) {
  const info = useYouTubeTitle(embed.id).data;
  const title = info?.title || embed.label || 'Video på YouTube';
  return (
    <div className={CARD}>
      <a
        href={embed.href}
        target="_blank"
        rel="noreferrer"
        aria-label={`Afspil ${title} på YouTube`}
        className="group relative block aspect-video bg-black"
      >
        <img
          src={`https://i.ytimg.com/vi/${embed.id}/hqdefault.jpg`}
          alt=""
          loading="lazy"
          className="size-full object-cover opacity-95 transition-opacity group-hover:opacity-100"
        />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-black/65 text-white shadow-pop transition-transform group-hover:scale-105">
            <Play className="ml-0.5 size-6 fill-current" />
          </span>
        </span>
      </a>
      <SourceBar href={embed.href} title={title} source={info?.author ? `YouTube · ${info.author}` : 'YouTube'} />
    </div>
  );
}

function MediaCard({ embed }: { embed: Extract<Embed, { kind: 'image' | 'video' | 'audio' }> }) {
  const [failed, setFailed] = useState(false);
  // Not everything that ends in .jpg is a picture we may load; then the link in the text is enough.
  if (failed) return null;
  return (
    <div className={CARD}>
      {embed.kind === 'image' ? (
        <a href={embed.href} target="_blank" rel="noreferrer" className="block bg-surface-2" aria-label={`Åbn ${embed.name}`}>
          <img
            src={embed.href}
            alt={embed.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="mx-auto block max-h-80 w-auto max-w-full object-contain"
          />
        </a>
      ) : embed.kind === 'video' ? (
        <video src={embed.href} controls preload="metadata" onError={() => setFailed(true)} className="block max-h-80 w-full bg-black" />
      ) : (
        <audio src={embed.href} controls preload="metadata" onError={() => setFailed(true)} className="block w-full px-2 py-2" />
      )}
      <SourceBar href={embed.href} title={embed.name} source={host(embed.href)} />
    </div>
  );
}
