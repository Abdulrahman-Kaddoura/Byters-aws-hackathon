import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import {
  LayoutDashboard,
  FolderKanban,
  CheckCircle2,
  BookOpen,
  Settings as SettingsIcon,
  Moon,
  Sun,
  Activity,
  Menu,
  X,
  Search,
  Plus,
  LogOut,
  CornerDownLeft,
} from 'lucide-react';
import { useCaseList } from '@/hooks/useCases';
import { currentIdentity, signOut } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { PatientAvatar } from '@/components/PatientAvatar';
import { StatusBadge } from '@/components/badges';
import { AssistantWidget } from '@/components/layout/AssistantWidget';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: number;
}

function NavLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.to}
      onClick={onNavigate}
      className={cn(
        'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
      )}
    >
      <Icon className="h-[18px] w-[18px]" />
      <span className="flex-1">{item.label}</span>
      {item.badge != null && item.badge > 0 && (
        <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums', active ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'bg-sidebar-accent text-sidebar-foreground/70')}>
          {item.badge}
        </span>
      )}
    </Link>
  );
}

function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const [location] = useLocation();
  const { data: cases = [] } = useCaseList();
  const { mode, toggle } = useTheme();
  const identity = currentIdentity();

  const activeCount = cases.filter((c) => c.status !== 'Completed' && c.status !== 'Archived').length;
  const completedCount = cases.filter((c) => c.status === 'Completed' || c.status === 'Archived').length;

  const NAV: NavItem[] = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/cases', label: 'Active Cases', icon: FolderKanban, badge: activeCount },
    { to: '/completed', label: 'Completed', icon: CheckCircle2, badge: completedCount },
    { to: '/knowledge', label: 'Knowledge Base', icon: BookOpen },
  ];

  const displayName = identity?.email ?? identity?.username ?? 'Signed in';
  const role = identity?.groups[0] ?? 'User';

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden" onClick={onClose} />}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-sidebar text-sidebar-foreground transition-transform duration-300 lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
            <Activity className="h-[18px] w-[18px]" strokeWidth={2.5} />
          </span>
          <div className="leading-tight">
            <p className="text-[15px] font-bold tracking-tight">Aura</p>
            <p className="text-[10px] font-medium text-sidebar-foreground/60">Clinical Decision Support</p>
          </div>
          <button className="ml-auto lg:hidden" onClick={onClose} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-4 py-4">
          {NAV.map((item) => (
            <NavLink key={item.to} item={item} active={location === item.to} onNavigate={onClose} />
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="space-y-0.5">
            <NavLink item={{ to: '/settings', label: 'Settings', icon: SettingsIcon }} active={location === '/settings'} onNavigate={onClose} />
            <button
              onClick={toggle}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            >
              {mode === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
              {mode === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-sidebar-border bg-sidebar-accent/30 p-2.5">
            <PatientAvatar name={displayName} size={32} />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-xs font-semibold">{displayName}</p>
              <p className="truncate text-[11px] capitalize text-sidebar-foreground/60">{role}</p>
            </div>
            <button onClick={() => signOut()} className="text-sidebar-foreground/60 hover:text-sidebar-foreground" aria-label="Sign out" title="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const { data: cases = [] } = useCaseList();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const results = query.trim()
    ? cases
        .filter((c) => {
          const q = query.toLowerCase();
          return (
            c.patient.name.toLowerCase().includes(q) ||
            c.chiefComplaint.toLowerCase().includes(q) ||
            c.primaryImpression?.toLowerCase().includes(q) ||
            c.id.toLowerCase().includes(q)
          );
        })
        .slice(0, 6)
    : [];

  function go(id: string) {
    setOpen(false);
    setQuery('');
    navigate(`/cases/${id}`);
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-md sm:px-6">
      <button className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent lg:hidden" onClick={onOpenMenu} aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>

      <div ref={boxRef} className="relative w-full max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search patients, cases, complaints…"
          className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />

        {open && query.trim() && (
          <div className="absolute left-0 right-0 top-12 z-30 overflow-hidden rounded-xl border bg-popover shadow-lg">
            {results.length ? (
              <ul className="max-h-80 overflow-y-auto py-1">
                {results.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => go(c.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent">
                      <PatientAvatar name={c.patient.name} hue={c.patient.avatarHue} size={32} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.patient.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{c.chiefComplaint}</p>
                      </div>
                      <StatusBadge status={c.status} />
                      <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">No results for "{query}"</div>
            )}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button onClick={() => navigate('/cases/new')} className="hidden h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 sm:inline-flex">
          <Plus className="h-4 w-4" />
          New Case
        </button>
        <button onClick={() => navigate('/cases/new')} className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground shadow hover:bg-primary/90 sm:hidden" aria-label="New case">
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background font-sans">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="relative flex h-full flex-1 flex-col overflow-hidden lg:pl-64">
        <Topbar onOpenMenu={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-auto bg-muted/20">{children}</main>
        <AssistantWidget />
      </div>
    </div>
  );
}
