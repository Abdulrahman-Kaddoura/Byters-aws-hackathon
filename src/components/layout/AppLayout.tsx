import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Activity,
  BookOpen,
  CornerDownLeft,
  LogOut,
  Moon,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Sun,
} from 'lucide-react';

import { useCaseList } from '@/hooks/useCases';
import { signOut } from '@/lib/auth';
import { PERMISSIONS, useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { PatientAvatar } from '@/components/PatientAvatar';
import { StatusBadge } from '@/components/badges';
import { AssistantWidget } from '@/components/layout/AssistantWidget';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * One topbar, no sidebar.
 *
 * The sidebar listed Dashboard / Active Cases / Completed / Knowledge Base —
 * four doors into what is really one thing. `/cases` is now the single hub and
 * fans out from there, so a permanent nav rail would just be a second route to
 * the same rooms. Settings, the knowledge base and the admin panel live as
 * icons on the right, where they stay reachable without competing with the
 * work.
 */
function IconButton({
  label,
  onClick,
  href,
  active,
  children,
}: {
  label: string;
  onClick?: () => void;
  href?: string;
  active?: boolean;
  children: ReactNode;
}) {
  const className = cn(
    'inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
    active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {href ? (
          <Link href={href} className={className} aria-label={label}>
            {children}
          </Link>
        ) : (
          <button type="button" onClick={onClick} className={className} aria-label={label}>
            {children}
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function GlobalSearch() {
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

  // The list this searches is already scoped by the server to what the caller
  // may see, so there is nothing to filter out here.
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
    <div ref={boxRef} className="relative w-full max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search patients…"
        className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />

      {open && query.trim() && (
        <div className="absolute left-0 right-0 top-12 z-30 overflow-hidden rounded-xl border bg-popover shadow-lg">
          {results.length ? (
            <ul className="max-h-80 overflow-y-auto py-1">
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => go(c.id)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent"
                  >
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
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No results for "{query}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Topbar() {
  const [location] = useLocation();
  const { mode, toggle } = useTheme();
  const { me, can, role } = useSession();

  const displayName = me?.name || me?.username || me?.email || 'Signed in';

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-md sm:px-6">
      <Link href="/cases" className="flex shrink-0 items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Activity className="h-[18px] w-[18px]" strokeWidth={2.5} />
        </span>
        <span className="hidden leading-tight sm:block">
          <span className="block text-[15px] font-bold tracking-tight">Sehati</span>
          <span className="block text-[10px] font-medium text-muted-foreground">
            Clinical Decision Support
          </span>
        </span>
      </Link>

      <div className="ml-2 flex-1 sm:ml-6">
        <GlobalSearch />
      </div>

      <div className="flex items-center gap-1">
        {can(PERMISSIONS.resourcesManage) && (
          <IconButton label="Knowledge base" href="/knowledge" active={location === '/knowledge'}>
            <BookOpen className="h-[18px] w-[18px]" />
          </IconButton>
        )}
        {/* Every /admin endpoint independently enforces users.manage
            server-side; this only decides whether the door is visible. */}
        {can(PERMISSIONS.usersManage) && (
          <IconButton label="Admin panel" href="/admin" active={location.startsWith('/admin')}>
            <ShieldCheck className="h-[18px] w-[18px]" />
          </IconButton>
        )}
        <IconButton label="Settings" href="/settings" active={location === '/settings'}>
          <SettingsIcon className="h-[18px] w-[18px]" />
        </IconButton>
        <IconButton label={mode === 'dark' ? 'Light mode' : 'Dark mode'} onClick={toggle}>
          {mode === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </IconButton>

        <div className="ml-2 flex items-center gap-2 border-l pl-3">
          <PatientAvatar name={displayName} size={32} />
          <div className="hidden min-w-0 leading-tight md:block">
            <p className="truncate text-xs font-semibold">{displayName}</p>
            <p className="truncate text-[11px] capitalize text-muted-foreground">{role ?? 'No role'}</p>
          </div>
          <IconButton label="Sign out" onClick={() => signOut()}>
            <LogOut className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
    </header>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background font-sans">
      <Topbar />
      {/* The assistant is a sibling of <main>, not an overlay on top of it, so
          opening it narrows the workspace instead of covering the case it's
          discussing. It renders nothing at all outside a case, and below `lg`
          it takes itself out of the flow and overlays — there is no room to
          push anything on a narrow screen. */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className="min-w-0 flex-1 overflow-auto bg-muted/20">{children}</main>
        <AssistantWidget />
      </div>
    </div>
  );
}
