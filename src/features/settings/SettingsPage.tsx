import { useState, type ReactNode } from 'react';
import { Bell, CalendarDays, Check, CheckCircle2, CirclePause, Copy, ExternalLink, KeyRound, Loader2, LogOut, Monitor, Moon, Palette, Plug, RefreshCw, School, Sparkles, Sun, TriangleAlert } from 'lucide-react';
import { Page, PageHeader } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Badge } from '@/components/ui/badge';
import { useSettings } from '@/lib/settings';
import { schoolRoot } from '@/lib/lectio/paths';
import { extApi, isExtension } from '@/lib/storage';
import { fmtTime, relativeDay } from '@/lib/format';
import { send, useAccount, useCalendarStatus, usePrefs } from '@/lib/sync/hooks';
import { BUILT_IN_CLIENT_ID, INTERVALS, WEEK_CHOICES } from '@/lib/sync/store';
import { cn } from '@/lib/cn';
import { BRIDGE_DEFAULTS, BRIDGE_KEY, BRIDGE_ORIGINS, BRIDGE_STATUS_KEY, DEFAULT_PORT, newToken, saveBridge, type BridgePrefs, type BridgeStatus } from '@/lib/agent/bridge';
import { connectChatGPT, useChatAccount, useStored } from '@/features/chat/hooks';
import { SubjectColorSettings } from './SubjectColors';

const redirectUrl: string = (() => {
  try {
    return extApi?.identity?.getRedirectURL?.() ?? '';
  } catch {
    return '';
  }
})();

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 py-1 pr-1 pl-3">
      <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg" title={value}>{value}</code>
      <Button size="sm" variant="ghost" aria-label={label} onClick={() => navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>
        {copied ? <Check /> : <Copy />} {copied ? 'Kopieret' : 'Kopiér'}
      </Button>
    </div>
  );
}

/** Shown until a client id exists: how to make one, and where to paste it. */
function ClientIdSetup({ value, onSave }: { value: string; onSave: (id: string) => void }) {
  const [draft, setDraft] = useState(value);
  const valid = /^[\w-]+\.apps\.googleusercontent\.com$/.test(draft.trim());
  return (
    <div className="space-y-3 border-t border-border bg-surface-2/40 px-5 py-4">
      <div>
        <div className="text-[13.5px] font-medium">Opsætning: Google-klient-ID</div>
        <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[12.5px] text-fg-muted">
          <li>Opret et projekt i <a className="text-accent-soft-fg underline" href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noreferrer">Google Cloud Console</a> og aktivér <b>Google Calendar API</b>.</li>
          <li>Under <b>Google Auth Platform</b>: vælg <i>External</i>, behold <i>Testing</i>, tilføj dig selv som testbruger og scopet <code className="font-mono">calendar.app.created</code>.</li>
          <li>Opret en OAuth-klient af typen <b>Web application</b> med denne adresse som <i>Authorized redirect URI</i>:</li>
        </ol>
      </div>
      {redirectUrl ? <CopyField value={redirectUrl} label="Kopiér redirect-adresse" /> : <p className="text-[12.5px] text-fg-subtle">(Adressen vises, når Lectiomizer kører som udvidelse.)</p>}
      <div className="text-[12.5px] text-fg-muted">4. Indsæt klient-ID'et her:</div>
      <div className="flex gap-2">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="1234-abc.apps.googleusercontent.com" className="font-mono text-[12.5px]" aria-label="Google-klient-ID" />
        <Button onClick={() => onSave(draft.trim())} disabled={!valid || draft.trim() === value}>Gem</Button>
      </div>
    </div>
  );
}

function when(ts?: number) {
  if (!ts) return 'aldrig';
  const d = new Date(ts);
  return `${relativeDay(d)} kl. ${fmtTime(d)}`;
}

function Section({ icon, title, description, children, aside }: { icon: ReactNode; title: string; description?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-3 border-b border-border px-5 py-4">
        <span className="mt-0.5 flex size-8 items-center justify-center rounded-lg bg-surface-2 text-fg-muted [&_svg]:size-4">{icon}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-fg-muted">{description}</p>}
        </div>
        {aside}
      </div>
      <div className="divide-y divide-border">{children}</div>
    </Card>
  );
}

function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5">
      <div className="min-w-0 flex-1 basis-56">
        <div className="text-[13.5px] font-medium text-fg">{label}</div>
        {hint && <div className="mt-0.5 text-[12.5px] text-fg-muted">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

function StatusLine({ state, message, children }: { state?: string; message?: string; children: ReactNode }) {
  const Icon = state === 'error' ? TriangleAlert : state === 'syncing' ? Loader2 : state === 'paused' ? CirclePause : CheckCircle2;
  return (
    <div className={cn('flex items-start gap-2 px-5 py-3 text-[12.5px]', state === 'error' ? 'bg-danger-soft text-danger-soft-fg' : 'bg-surface-2/60 text-fg-muted')}>
      <Icon className={cn('mt-px size-3.5 shrink-0', state === 'syncing' && 'animate-spin', state === 'ok' && 'text-success')} />
      <span>
        {children}
        {message && <span className="block">{message}</span>}
      </span>
    </div>
  );
}

function NotificationSettings() {
  const [prefs, save] = usePrefs();
  const account = useAccount();
  const status = account.status || {};
  const [busy, setBusy] = useState(false);
  const checkNow = async () => {
    setBusy(true);
    await send({ type: 'check-now' }).catch(() => {});
    setBusy(false);
  };
  const checking = busy || status.state === 'syncing';
  return (
    <Section
      icon={<Bell />}
      title="Notifikationer"
      description="Lectiomizer tjekker Lectio i baggrunden – også når appen er lukket – og giver besked om ændrede og aflyste moduler, nye beskeder og nye opgaver."
    >
      <Row label="Systemnotifikationer" hint="Vis en notifikation fra browseren, når der er nyt.">
        <Switch label="Systemnotifikationer" checked={prefs.system} onChange={(system) => save({ system })} />
      </Row>
      <Row label="Tjek Lectio" hint="Hvor ofte der tjekkes for nyt, mens browseren er åben.">
        <Select value={prefs.interval} onChange={(e) => save({ interval: Number(e.target.value) })} aria-label="Interval">
          {INTERVALS.map((i) => (
            <option key={i.minutes} value={i.minutes}>{i.label}</option>
          ))}
        </Select>
        <Button size="md" onClick={checkNow} disabled={checking}>
          <RefreshCw className={cn(checking && 'animate-spin')} /> Tjek nu
        </Button>
      </Row>
      <Row label="Tjek ved åbning og genindlæsning" hint="Hent også nyt fra Lectio, når du åbner eller genindlæser siden – ikke kun i det valgte interval.">
        <Switch label="Tjek ved åbning og genindlæsning" checked={prefs.checkOnOpen} onChange={(checkOnOpen) => save({ checkOnOpen })} />
      </Row>
      <StatusLine state={checking ? 'syncing' : status.state} message={status.state !== 'syncing' ? status.message : ''}>
        {checking ? 'Tjekker Lectio…' : `Sidst tjekket ${when(status.checkedAt)}.`}
      </StatusLine>
    </Section>
  );
}

function CalendarSettings() {
  const { settings } = useSettings();
  const [prefs, save] = usePrefs();
  const status = useCalendarStatus();
  const [busy, setBusy] = useState<'' | 'connect' | 'sync' | 'disconnect'>('');
  const [error, setError] = useState('');
  const run = async (kind: typeof busy, message: Record<string, unknown>) => {
    setBusy(kind);
    setError('');
    const r = await send(message).catch((e: Error) => ({ ok: false, message: e.message }));
    if (!r?.ok && r?.message) setError(r.message);
    setBusy('');
  };
  // Firefox's consent to send website content (the schedule) to Google is given at install.
  const connect = () => run('connect', { type: 'calendar:connect' });
  return (
    <Section
      icon={<CalendarDays />}
      title="Google Kalender"
      description="Kopiér dit skema til en separat “Lectio”-kalender i Google Kalender, så det altid er opdateret på telefonen."
      aside={prefs.connected ? <Badge tone="success">Forbundet</Badge> : null}
    >
      {!prefs.connected ? (
        <div className="px-5 py-4">
          <ul className="mb-4 space-y-1.5 text-[13px] text-fg-muted">
            <li>• Lectiomizer kan kun se og ændre den kalender, den selv opretter – aldrig dine andre kalendere.</li>
            <li>• Ændrede moduler bliver grønne, aflyste røde, og lektier/noter kommer med i beskrivelsen.</li>
          </ul>
          <Button variant="primary" onClick={connect} disabled={!!busy || !isExtension || !(prefs.googleClientId || BUILT_IN_CLIENT_ID)}>
            {busy === 'connect' ? <Loader2 className="animate-spin" /> : <CalendarDays />} Forbind Google Kalender
          </Button>
        </div>
      ) : (
        <>
          <Row label="Google-konto" hint={prefs.email || 'Ukendt konto'}>
            <Button variant="ghost" onClick={() => run('disconnect', { type: 'calendar:disconnect' })} disabled={!!busy}>
              <LogOut /> Afbryd
            </Button>
          </Row>
          <Row label="Antal uger" hint="Denne uge og de kommende uger.">
            <Select value={prefs.weeks} onChange={(e) => save({ weeks: Number(e.target.value) })} aria-label="Antal uger">
              {WEEK_CHOICES.map((w) => (
                <option key={w} value={w}>{w === 1 ? '1 uge' : `${w} uger`}</option>
              ))}
            </Select>
          </Row>
          <Row label="Medtag aflyste moduler" hint="Vises som “Aflyst: …” og blokerer ikke tiden.">
            <Switch label="Medtag aflyste moduler" checked={prefs.cancelled} onChange={(cancelled) => save({ cancelled })} />
          </Row>
          <Row label="Synkronisér" hint="Sker automatisk ved hvert tjek af Lectio.">
            <Button onClick={() => run('sync', { type: 'calendar:sync-now', schoolId: settings.school?.id })} disabled={!!busy || status.state === 'syncing'}>
              <RefreshCw className={cn((busy === 'sync' || status.state === 'syncing') && 'animate-spin')} /> Synkronisér nu
            </Button>
          </Row>
          <StatusLine state={status.state === 'idle' ? 'ok' : status.state} message={status.message}>
            {status.state === 'syncing'
              ? 'Synkroniserer…'
              : status.syncedAt
                ? `Synkroniseret ${when(status.syncedAt)} · ${status.lessons ?? 0} moduler i ${status.weeks ?? 0} uger.`
                : 'Ikke synkroniseret endnu.'}
          </StatusLine>
          {status.reconnect && (
            <div className="px-5 py-3">
              <Button variant="soft" onClick={connect} disabled={!!busy}>Forbind igen</Button>
            </div>
          )}
        </>
      )}
      {!prefs.connected && (!BUILT_IN_CLIENT_ID || prefs.googleClientId) && (
        <ClientIdSetup value={prefs.googleClientId} onSave={(googleClientId) => save({ googleClientId })} />
      )}
      {error && <div className="bg-danger-soft px-5 py-3 text-[13px] text-danger-soft-fg">{error}</div>}
    </Section>
  );
}

function AssistantSettings() {
  const account = useChatAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setError(await action().catch((e: Error) => e.message));
    setBusy(false);
  };
  return (
    <Section
      icon={<Sparkles />}
      title="Assistent"
      description="Assistenten svarer med din egen ChatGPT-plan og kan læse – men ikke ændre – dit skema, opgaver, lektioner, beskeder, karakterer og fravær."
    >
      <Row
        label="ChatGPT"
        hint={account.connected ? `Logget ind som ${account.email || 'din ChatGPT-konto'}${account.planEnabled ? '' : ' – uden adgang til planen'}.` : account.pending ? 'Venter på login i ChatGPT-fanen…' : 'Ikke forbundet.'}
      >
        {account.connected ? (
          <Button onClick={() => run(async () => ((await send({ type: 'chat:disconnect' }))?.ok ? '' : 'Kunne ikke logge ud.'))} disabled={busy}>
            <LogOut /> Log ud
          </Button>
        ) : (
          <Button variant="primary" onClick={() => run(() => connectChatGPT())} disabled={busy || account.pending}>
            Fortsæt med ChatGPT
          </Button>
        )}
      </Row>
      {(error || account.message) && <div className="bg-danger-soft px-5 py-3 text-[13px] text-danger-soft-fg">{error || account.message}</div>}
    </Section>
  );
}

const SERVER_PATH = '/sti/til/lectiomizer/mcp/server.mjs';

function McpSettings() {
  const prefs = { ...BRIDGE_DEFAULTS, ...useStored<Partial<BridgePrefs>>(BRIDGE_KEY, {}) };
  const status = useStored<BridgeStatus>(BRIDGE_STATUS_KEY, { state: 'off', at: 0 });
  const [error, setError] = useState('');
  const port = prefs.port || DEFAULT_PORT;
  const toggle = async (enabled: boolean) => {
    setError('');
    if (enabled && isExtension) {
      // In the click: the extension may need permission to reach 127.0.0.1.
      const granted = await extApi.permissions.request({ origins: BRIDGE_ORIGINS }).catch(() => false);
      if (!granted) return setError('Lectiomizer skal have lov til at kontakte 127.0.0.1 for at tale med MCP-serveren.');
    }
    await saveBridge({ enabled, token: prefs.token || newToken() });
  };
  const env = `LECTIOMIZER_TOKEN=${prefs.token || '…'}${port !== DEFAULT_PORT ? ` LECTIOMIZER_PORT=${port}` : ''}`;
  const desktop = JSON.stringify(
    { mcpServers: { lectio: { command: 'node', args: [SERVER_PATH], env: { LECTIOMIZER_TOKEN: prefs.token || '…', ...(port !== DEFAULT_PORT ? { LECTIOMIZER_PORT: String(port) } : {}) } } } },
    null,
    2,
  );
  const cli = `claude mcp add lectio ${env.split(' ').map((e) => `-e ${e}`).join(' ')} -- node ${SERVER_PATH}`;
  const state = !prefs.enabled ? 'off' : status.state;
  return (
    <Section
      icon={<Plug />}
      title="MCP-server"
      description="Brug dine Lectio-data fra Claude, Cursor eller en anden MCP-klient. Klienten starter mcp/server.mjs fra Lectiomizers kildekode; udvidelsen udfører opslagene med dit Lectio-login, mens browseren er åben. Kun læsning."
    >
      <Row label="Tillad MCP-klienter" hint="Udvidelsen forbinder til MCP-serveren på denne computer (127.0.0.1).">
        <Switch label="Tillad MCP-klienter" checked={prefs.enabled} onChange={toggle} />
      </Row>
      {prefs.enabled && (
        <>
          <Row label={<span className="flex items-center gap-1.5"><KeyRound className="size-3.5" /> Nøgle</span>} hint="Klienten skal have samme nøgle i LECTIOMIZER_TOKEN. Lav en ny, hvis den er kommet i forkerte hænder.">
            <Button size="sm" variant="ghost" onClick={() => saveBridge({ token: newToken() })}>
              <RefreshCw /> Ny nøgle
            </Button>
          </Row>
          <div className="space-y-3 px-5 py-4">
            <CopyField value={prefs.token} label="Kopiér nøgle" />
            <div className="text-[12.5px] text-fg-muted">Claude Code:</div>
            <CopyField value={cli} label="Kopiér kommando" />
            <div className="text-[12.5px] text-fg-muted">Claude Desktop (claude_desktop_config.json) og andre klienter:</div>
            <div className="relative">
              <pre className="overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 pr-24 font-mono text-[12px]">{desktop}</pre>
              <Button size="sm" variant="ghost" className="absolute top-1.5 right-1.5" onClick={() => navigator.clipboard.writeText(desktop)}>
                <Copy /> Kopiér
              </Button>
            </div>
            <p className="text-[12px] text-fg-subtle">Erstat <code className="font-mono">{SERVER_PATH}</code> med stien til din Lectiomizer-mappe. Kræver Node 18+.</p>
          </div>
          <Row label="Port" hint="Skift kun, hvis 47123 er optaget. Sæt også LECTIOMIZER_PORT i klienten.">
            <Input type="number" min={1024} max={65535} value={port} onChange={(e) => saveBridge({ port: Number(e.target.value) || DEFAULT_PORT })} className="w-28" aria-label="Port" />
          </Row>
        </>
      )}
      {prefs.enabled && (
        <StatusLine state={state === 'connected' ? 'ok' : state === 'waiting' && status.message?.includes('afviste') ? 'error' : 'syncing'}>
          {state === 'connected'
            ? `Forbundet til MCP-serveren.${status.lastCall ? ` Seneste opslag: ${status.lastCall.name} ${when(status.lastCall.at)}.` : ''}`
            : status.message || 'Venter på MCP-serveren… Start en MCP-klient, der bruger den.'}
        </StatusLine>
      )}
      {error && <div className="bg-danger-soft px-5 py-3 text-[13px] text-danger-soft-fg">{error}</div>}
    </Section>
  );
}

export default function SettingsPage() {
  const { settings, update } = useSettings();
  return (
    <Page className="max-w-[760px]">
      <PageHeader title="Indstillinger" description="Notifikationer, Google Kalender, assistent og udseende." />
      <div className="space-y-5">
        <NotificationSettings />
        <CalendarSettings />
        <AssistantSettings />
        <McpSettings />
        <Section icon={<Palette />} title="Udseende">
          <Row label="Tema">
            <Segmented
              value={settings.theme}
              onChange={(theme) => update({ theme })}
              options={[
                { value: 'system', label: <><Monitor className="size-3.5" /> System</> },
                { value: 'light', label: <><Sun className="size-3.5" /> Lyst</> },
                { value: 'dark', label: <><Moon className="size-3.5" /> Mørkt</> },
              ]}
            />
          </Row>
          <SubjectColorSettings />
        </Section>
        <Section icon={<School />} title="Skole">
          <Row label={settings.school?.name ?? 'Ingen skole'} hint="Lectiomizer bruger dit eget Lectio-login på denne skole.">
            {settings.school && (
              <Button variant="ghost" asChild>
                <a href={schoolRoot(settings.school.id) + 'forside.aspx'} target="_blank" rel="noreferrer">
                  <ExternalLink /> Åbn Lectio
                </a>
              </Button>
            )}
            <Button onClick={() => update({ school: null })}>Skift skole</Button>
          </Row>
        </Section>
      </div>
    </Page>
  );
}
