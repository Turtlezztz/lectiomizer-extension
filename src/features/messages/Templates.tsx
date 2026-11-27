// Skabeloner: text the student writes often, saved locally under a name and
// put into a message or reply from a small menu in the composer.
import { useState } from 'react';
import { Popover } from 'radix-ui';
import { BookmarkPlus, FileText, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { TEMPLATES, addTemplate, removeTemplate, type Template } from './local';
import { useStudentStore } from './store';

export function TemplateMenu({
  body,
  onInsert,
  disabled,
  className,
}: {
  /** The text in the composer now (what "Gem som skabelon" saves). */
  body: string;
  onInsert: (text: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const store = useStudentStore<Template[]>(TEMPLATES, []);
  const templates = store.value;
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const canSave = !!body.trim();

  const close = () => {
    setOpen(false);
    setNaming(false);
    setName('');
  };
  const save = () => {
    if (!name.trim() || !canSave) return;
    store.update((list) => addTemplate(list, name, body));
    close();
  };

  return (
    <Popover.Root open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <Popover.Trigger asChild>
        <Button variant="ghost" size="icon-sm" disabled={disabled} aria-label="Skabeloner" title="Skabeloner" className={className}>
          <FileText />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-[280px] animate-pop rounded-xl border border-border bg-surface p-1 shadow-pop"
          onOpenAutoFocus={(e) => naming || e.preventDefault()}
        >
          <div className="px-2.5 pt-1.5 pb-1 text-[11.5px] font-medium tracking-wide text-fg-subtle uppercase">Skabeloner</div>
          {templates.length ? (
            <ul className="max-h-[240px] overflow-y-auto" aria-label="Skabeloner">
              {templates.map((t) => (
                <li key={t.id} className="group flex items-center rounded-md hover:bg-surface-2">
                  <button
                    type="button"
                    onClick={() => {
                      onInsert(t.body);
                      close();
                    }}
                    title={t.body.slice(0, 200)}
                    className="min-w-0 flex-1 px-2.5 py-1.5 text-left outline-none focus-visible:bg-surface-2"
                  >
                    <span className="block truncate text-[13px] text-fg">{t.name}</span>
                    <span className="block truncate text-[11.5px] text-fg-subtle">{t.body.replace(/\s+/g, ' ')}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Slet skabelonen ${t.name}`}
                    title="Slet"
                    onClick={() => store.update((list) => removeTemplate(list, t.id))}
                    className="mr-1 flex size-7 shrink-0 items-center justify-center rounded-md text-fg-subtle opacity-0 group-hover:opacity-100 hover:bg-surface-3 hover:text-danger-soft-fg focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2.5 py-1.5 text-[12.5px] text-fg-muted">Gem en tekst, du skriver tit, og indsæt den med ét klik.</p>
          )}
          <div className="-mx-1 my-1 h-px bg-border" />
          {naming ? (
            <form
              className="flex items-center gap-1.5 p-1"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && (e.preventDefault(), setNaming(false))}
                placeholder="Navn på skabelonen"
                aria-label="Navn på skabelonen"
                maxLength={60}
                className="h-7 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-[13px] text-fg outline-none focus:border-accent focus:ring-3 focus:ring-accent/15"
              />
              <Button type="submit" size="sm" variant="primary" disabled={!name.trim()}>
                Gem
              </Button>
            </form>
          ) : (
            <button
              type="button"
              disabled={!canSave}
              onClick={() => setNaming(true)}
              title={canSave ? undefined : 'Skriv en tekst først'}
              className={cn(
                'flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] text-fg outline-none hover:bg-surface-2 focus-visible:bg-surface-2 disabled:opacity-50 disabled:hover:bg-transparent [&_svg]:size-4 [&_svg]:text-fg-subtle',
              )}
            >
              <BookmarkPlus /> Gem teksten som skabelon
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
