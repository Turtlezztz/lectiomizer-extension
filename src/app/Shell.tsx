import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useIsFetching } from '@tanstack/react-query';
import {
  BookCopy, BookOpen, CalendarDays, ChevronDown, FileText, HandHelping, IdCard, ListTree, ClipboardList, ListChecks, DoorOpen, ExternalLink, GraduationCap, House, Layers, Mail, Presentation, Users, Menu, Moon, PanelLeftClose, PanelLeftOpen, Search, Settings, Sparkles, Sun, SunMoon, UserX, X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useSettings } from '@/lib/settings';
import { schoolRoot } from '@/lib/lectio/paths';
import { Button } from '@/components/ui/button';
import { CommandPalette } from './CommandPalette';
import { UserBadge } from './UserBadge';
import { NotificationBell } from './NotificationCenter';
import { send } from '@/lib/sync/hooks';
import { useReloadOnTermChange } from '@/lib/lectio/useTerm';
import { PastTermBanner, YearSelect } from './YearSwitcher';
import { OfflineBanner } from './OfflineBanner';

export const NAV = [
  { to: '/', label: 'Overblik', icon: House, end: true },
  { to: '/schedule', label: 'Skema', icon: CalendarDays },
  { to: '/assignments', label: 'Opgaver', icon: ClipboardList },
  { to: '/homework', label: 'Lektier', icon: BookOpen },
  { to: '/messages', label: 'Beskeder', icon: Mail },
  { to: '/grades', label: 'Karakterer', icon: GraduationCap },
  { to: '/absence', label: 'Fravær', icon: UserX },
  { to: '/questionnaires', label: 'Spørgeskemaer', icon: ListChecks },
  { to: '/chat', label: 'Assistent', icon: Sparkles },
] as const;

/** Study material and the student's own records. */
export const NAV_STUDY = [
  { to: '/studyplan', label: 'Studieplan', icon: ListTree },
  { to: '/descriptions', label: 'Undervisningsbeskrivelser', icon: FileText },
  { to: '/books', label: 'Bøger', icon: BookCopy },
  { to: '/sps', label: 'SPS', icon: HandHelping },
  { to: '/studentcard', label: 'Studiekort', icon: IdCard },
] as const;

/** The school's directories: people, teams and rooms, each with their own schedule. */
export const NAV_SCHOOL = [
  { to: '/students', label: 'Elever', icon: Users },
  { to: '/teachers', label: 'Lærere', icon: Presentation },
  { to: '/teams', label: 'Hold', icon: Layers },
  { to: '/rooms', label: 'Lokaler', icon: DoorOpen },
] as const;

function NavItem({ to, label, icon: Icon, end, collapsed, onNavigate }: { to: string; label: string; icon: typeof House; end?: boolean; collapsed: boolean; onNavigate?: () => void }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          'group flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors',
          collapsed && 'justify-center px-0',
          isActive ? 'bg-surface text-fg shadow-card ring-1 ring-border' : 'text-fg-muted hover:bg-surface-3/60 hover:text-fg',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cn('size-[18px] shrink-0', isActive ? 'text-accent' : 'text-fg-subtle group-hover:text-fg-muted')} strokeWidth={isActive ? 2.2 : 1.9} />
          {!collapsed && <span className="truncate">{label}</span>}
        </>
      )}
    </NavLink>
  );
}

type NavEntry = { to: string; label: string; icon: typeof House };

/**
 * A foldable group of pages ("Studie", "Skolen"). Folded by default so the menu fits
 * smaller windows; the group holding the current page is always shown.
 */
function NavGroup({ id, label, items, collapsed, onNavigate }: { id: 'study' | 'school'; label: string; items: readonly NavEntry[]; collapsed: boolean; onNavigate?: () => void }) {
  const { settings, update } = useSettings();
  const { pathname } = useLocation();
  const active = items.some((i) => pathname === i.to || pathname.startsWith(`${i.to}/`));
  const open = !!settings.navOpen?.[id];
  const shown = open || active;
  const toggle = () => update({ navOpen: { ...settings.navOpen, [id]: !open } });
  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={shown}
        title={collapsed ? label : undefined}
        aria-label={collapsed ? label : undefined}
        className={cn(
          'mt-2 flex h-8 w-full items-center rounded-lg text-[11.5px] font-medium tracking-wide text-fg-subtle uppercase transition-colors hover:bg-surface-3/60 hover:text-fg-muted',
          collapsed ? 'justify-center border-t border-border' : 'justify-between px-2.5',
        )}
      >
        {!collapsed && label}
        <ChevronDown className={cn('size-3.5 transition-transform', !shown && '-rotate-90')} />
      </button>
      {shown && items.map(({ to, label: text, icon }) => <NavItem key={to} to={to} label={text} icon={icon} collapsed={collapsed} onNavigate={onNavigate} />)}
    </>
  );
}

function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative flex size-8 items-center justify-center rounded-[10px] bg-accent text-accent-fg shadow-sm">
        <svg viewBox="26 26 76 76" className="size-[20px]" fill="currentColor" aria-hidden>
          <path d="M36 37a8 8 0 0 1 16 0v46h40a8 8 0 0 1 0 16H44a8 8 0 0 1-8-8z" />
          <rect x="62" y="29" width="30" height="30" rx="8" fillOpacity={0.92} />
          <rect x="62" y="64" width="30" height="11" rx="5.5" fillOpacity={0.45} />
        </svg>
      </div>
      {!compact && <span className="text-[15px] font-semibold tracking-[-0.02em]">Lectiomizer</span>}
    </div>
  );
}

function ThemeToggle() {
  const { settings, update } = useSettings();
  const next = { system: 'light', light: 'dark', dark: 'system' } as const;
  const Icon = { system: SunMoon, light: Sun, dark: Moon }[settings.theme];
  const label = { system: 'System', light: 'Lyst', dark: 'Mørkt' }[settings.theme];
  return (
    <Button variant="ghost" size="icon" title={`Tema: ${label}`} aria-label={`Tema: ${label}`} onClick={() => update({ theme: next[settings.theme] })}>
      <Icon />
    </Button>
  );
}

function SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { settings } = useSettings();
  return (
    <>
      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-2" aria-label="Hovedmenu">
        {NAV.map(({ to, label, icon, ...rest }) => (
          <NavItem key={to} to={to} label={label} icon={icon} end={'end' in rest} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
        <NavGroup id="study" label="Studie" items={NAV_STUDY} collapsed={collapsed} onNavigate={onNavigate} />
        <NavGroup id="school" label="Skolen" items={NAV_SCHOOL} collapsed={collapsed} onNavigate={onNavigate} />
      </nav>
      <div className="shrink-0 space-y-0.5 border-t border-border px-3 pt-2 pb-3">
        <YearSelect collapsed={collapsed} />
        <NavLink
          to="/settings"
          onClick={onNavigate}
          title={collapsed ? 'Indstillinger' : undefined}
          className={({ isActive }) =>
            cn('flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13px] transition-colors', collapsed && 'justify-center px-0', isActive ? 'bg-surface text-fg shadow-card ring-1 ring-border' : 'text-fg-subtle hover:bg-surface-3/60 hover:text-fg')
          }
        >
          <Settings className="size-4 shrink-0" />
          {!collapsed && <span className="truncate">Indstillinger</span>}
        </NavLink>
        {settings.school && (
          <a
            href={schoolRoot(settings.school.id) + 'forside.aspx'}
            target="_blank"
            rel="noreferrer"
            title="Åbn den originale Lectio"
            className={cn('flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13px] text-fg-subtle hover:bg-surface-3/60 hover:text-fg', collapsed && 'justify-center px-0')}
          >
            <ExternalLink className="size-4 shrink-0" />
            {!collapsed && <span className="truncate">Original Lectio</span>}
          </a>
        )}
        <div className={cn('flex items-center gap-1', collapsed && 'flex-col')}>
          <div className="min-w-0 flex-1">
            <UserBadge collapsed={collapsed} />
          </div>
          <ThemeToggle />
        </div>
      </div>
    </>
  );
}

function GlobalProgress() {
  const fetching = useIsFetching();
  return (
    <div aria-hidden className={cn('pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden transition-opacity duration-300', fetching ? 'opacity-100' : 'opacity-0')}>
      <div className="h-full w-1/3 animate-[progress_1.1s_ease-in-out_infinite] bg-accent" />
      <style>{'@keyframes progress{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}'}</style>
    </div>
  );
}

export function Shell({ children }: { children?: ReactNode }) {
  const { settings, update } = useSettings();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const collapsed = settings.sidebarCollapsed;

  useEffect(() => setMobileOpen(false), [location.pathname]);
  useReloadOnTermChange();
  // Opening or reloading the app checks Lectio immediately when checkOnOpen is enabled (otherwise only if due).
  useEffect(() => {
    send({ type: 'check-on-open' }).catch(() => {});
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
      const target = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable) return;
      const shortcut = { '1': '/', '2': '/schedule', '3': '/assignments', '4': '/messages', '5': '/grades', '6': '/absence', '7': '/students', '8': '/teachers', '9': '/rooms', '0': '/chat' }[e.key];
      if (shortcut) navigate(shortcut);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  return (
    <div className="flex min-h-dvh">
      <GlobalProgress />
      {/* Desktop sidebar */}
      <aside className={cn('sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface-2/60 transition-[width] duration-200 md:flex', collapsed ? 'w-[68px]' : 'w-[232px]')}>
        <div className={cn('flex h-16 items-center px-4', collapsed ? 'justify-center' : 'justify-between')}>
          <Logo compact={collapsed} />
          {!collapsed && (
            <div className="flex items-center gap-0.5">
              <NotificationBell />
              <Button variant="ghost" size="icon-sm" aria-label="Skjul sidepanel" onClick={() => update({ sidebarCollapsed: true })}>
                <PanelLeftClose />
              </Button>
            </div>
          )}
        </div>
        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className={cn('flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-[13px] text-fg-subtle shadow-card transition-colors hover:border-border-strong hover:text-fg-muted', collapsed && 'justify-center px-0')}
            aria-label="Søg"
          >
            <Search className="size-4 shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Søg…</span>
                <kbd className="rounded border border-border bg-surface-2 px-1.5 font-sans text-[11px] text-fg-subtle">⌘K</kbd>
              </>
            )}
          </button>
        </div>
        {collapsed && (
          <div className="flex justify-center pb-2">
            <NotificationBell collapsed />
          </div>
        )}
        <SidebarContent collapsed={collapsed} />
        {collapsed && (
          <div className="flex justify-center pb-3">
            <Button variant="ghost" size="icon-sm" aria-label="Vis sidepanel" onClick={() => update({ sidebarCollapsed: false })}>
              <PanelLeftOpen />
            </Button>
          </div>
        )}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/30 animate-in" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[264px] flex-col bg-surface-2 shadow-pop animate-in">
            <div className="flex h-14 items-center justify-between px-4">
              <Logo />
              <Button variant="ghost" size="icon-sm" aria-label="Luk menu" onClick={() => setMobileOpen(false)}>
                <X />
              </Button>
            </div>
            <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-bg/80 px-4 backdrop-blur-md md:hidden">
          <Button variant="ghost" size="icon" aria-label="Åbn menu" onClick={() => setMobileOpen(true)}>
            <Menu />
          </Button>
          <Logo />
          <div className="flex-1" />
          <Button variant="ghost" size="icon" aria-label="Søg" onClick={() => setPaletteOpen(true)}>
            <Search />
          </Button>
          <NotificationBell collapsed />
        </header>
        <main className="flex-1">
          <OfflineBanner />
          <PastTermBanner />
          {children ?? <Outlet />}
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
