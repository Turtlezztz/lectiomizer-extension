// Notifikationer → which notice types to get, "Din dag" time and Stilletimer.
// Kept compact: the type list is folded away behind "Vælg typer".
import { ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Row } from './Row';
import { NOTICE_TYPES, typeEnabled, type SyncPrefs } from '@/lib/sync/store';

type Save = (patch: Partial<SyncPrefs>) => unknown;

function TimeField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return <Input type="time" aria-label={label} value={value} onChange={(e) => e.target.value && onChange(e.target.value)} className="h-8 w-[6.5rem] tabular-nums" />;
}

export function NoticeTypes({ prefs, save }: { prefs: SyncPrefs; save: Save }) {
  const on = NOTICE_TYPES.filter((t) => typeEnabled(prefs, t.type)).length;
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-x-6 px-5 py-3.5 select-none [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium text-fg">Vælg typer</div>
          <div className="mt-0.5 text-[12.5px] text-fg-muted tabular-nums">
            {on === NOTICE_TYPES.length ? 'Alle typer er slået til.' : `${on} af ${NOTICE_TYPES.length} typer er slået til.`}
          </div>
        </div>
        <ChevronDown className="size-4 text-fg-subtle transition-transform group-open:rotate-180" />
      </summary>
      <div className="grid gap-x-6 px-5 pb-3 sm:grid-cols-2">
        {NOTICE_TYPES.map((t) => {
          const checked = typeEnabled(prefs, t.type);
          return (
            <div key={t.type} className="flex min-h-9 items-center gap-2.5">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-[13px] text-fg">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => save({ types: { ...prefs.types, [t.type]: e.target.checked } })}
                  className="size-4 shrink-0 accent-[var(--color-accent)]"
                />
                <span className="truncate">{t.label}</span>
              </label>
              {t.type === 'digest' && checked && <TimeField label="Tidspunkt for Din dag" value={prefs.digestTime} onChange={(digestTime) => save({ digestTime })} />}
            </div>
          );
        })}
      </div>
      <p className="px-5 pb-3.5 text-[12px] text-fg-subtle">
        Din dag samler dagens første modul, antal moduler og dagens frister i én besked. Karakterer og fravær hentes kun, når de er slået til.
      </p>
    </details>
  );
}

export function QuietHours({ prefs, save }: { prefs: SyncPrefs; save: Save }) {
  return (
    <Row label="Stilletimer" hint="Ingen systemnotifikationer i tidsrummet – de ligger stadig under klokken.">
      {prefs.quiet && (
        <>
          <TimeField label="Stilletimer fra" value={prefs.quietFrom} onChange={(quietFrom) => save({ quietFrom })} />
          <span className="text-fg-subtle">–</span>
          <TimeField label="Stilletimer til" value={prefs.quietTo} onChange={(quietTo) => save({ quietTo })} />
        </>
      )}
      <Switch label="Stilletimer" checked={prefs.quiet} disabled={!prefs.system} onChange={(quiet) => save({ quiet })} />
    </Row>
  );
}
