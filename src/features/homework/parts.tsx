// Small pieces shared by Lektier and the overview: the round tick and the to-do form.
import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { dateKey } from './todo-model';

export function CheckButton({ checked, onChange, label, className }: { checked: boolean; onChange: () => void; label: string; className?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      title={checked ? 'Markér som ikke færdig' : 'Markér som færdig'}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onChange();
      }}
      className={cn(
        'flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors',
        checked ? 'border-accent bg-accent text-accent-fg' : 'border-border-strong text-transparent hover:border-accent hover:text-accent/60',
        className,
      )}
    >
      <Check className="size-3" strokeWidth={3} />
    </button>
  );
}

/** Text + optional date. Enter adds, Escape closes. */
export function TodoForm({ onAdd, onClose, defaultDate = '' }: { onAdd: (text: string, date: string | null) => void; onClose: () => void; defaultDate?: string }) {
  const [text, setText] = useState('');
  const [date, setDate] = useState(defaultDate);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onAdd(text, date || null);
    setText('');
  };
  return (
    <form onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && onClose()} className="flex flex-wrap items-center gap-2">
      <Input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Fx Læs op til prøven" aria-label="To-do" className="min-w-0 flex-1 basis-56" maxLength={200} />
      <Input type="date" value={date} min={dateKey(new Date())} onChange={(e) => setDate(e.target.value)} aria-label="Dato (valgfri)" className="w-auto" />
      <Button type="submit" variant="primary" disabled={!text.trim()}>Tilføj</Button>
      <Button variant="ghost" size="icon" aria-label="Luk" onClick={onClose}><X /></Button>
    </form>
  );
}
