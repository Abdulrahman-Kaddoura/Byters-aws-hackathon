import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FilePlus2,
  FolderKanban,
  CheckCircle2,
  Settings,
  Moon,
  Sun,
  BookOpen,
  Activity,
  X,
} from 'lucide-react';
import { CASES } from '../data/cases';
import { cn } from '../lib/ui';
import type { ThemeMode } from '../lib/theme';

const activeCount = CASES.filter((c) => c.status !== 'Completed' && c.status !== 'Archived').length;
const completedCount = CASES.filter((c) => c.status === 'Completed' || c.status === 'Archived').length;

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: number;
  end?: boolean;
}

const MAIN: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/cases', label: 'Active Cases', icon: FolderKanban, badge: activeCount },
  { to: '/completed', label: 'Completed Cases', icon: CheckCircle2, badge: completedCount },
];

const CLINICAL: NavItem[] = [
  { to: '/intake', label: 'New Patient Intake', icon: FilePlus2 },
  { to: '/knowledge', label: 'Knowledge Base', icon: BookOpen },
];

function NavSection({ title, items, onNavigate }: { title: string; items: NavItem[]; onNavigate?: () => void }) {
  return (
    <div className="px-3">
      <p className="px-3 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-wider text-muted">{title}</p>
      <nav className="space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/12 dark:text-brand-200'
                    : 'text-secondary hover:bg-[var(--surface-hover)] hover:text-[var(--text)]'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn('h-[18px] w-[18px]', isActive ? 'text-brand-600 dark:text-brand-300' : 'text-muted group-hover:text-[var(--text)]')} />
                  <span className="flex-1">{item.label}</span>
                  {item.badge != null && (
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                        isActive
                          ? 'bg-brand-500 text-white'
                          : 'bg-[var(--bg-subtle)] text-secondary'
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}

export function Sidebar({
  mode,
  onToggleTheme,
  mobileOpen,
  onClose,
}: {
  mode: ThemeMode;
  onToggleTheme: () => void;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden" onClick={onClose} />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-[var(--surface)] transition-transform duration-300 lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Brand */}
        <div className="flex h-16 items-center gap-2.5 border-b px-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-teal-500 text-white shadow-sm">
            <Activity className="h-[18px] w-[18px]" strokeWidth={2.5} />
          </span>
          <div className="leading-tight">
            <p className="text-[15px] font-bold tracking-tight">Aura</p>
            <p className="text-[10px] font-medium text-muted">Clinical Decision Support</p>
          </div>
          <button className="ml-auto lg:hidden" onClick={onClose} aria-label="Close menu">
            <X className="h-5 w-5 text-muted" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pb-4">
          <NavSection title="Overview" items={MAIN} onNavigate={onClose} />
          <NavSection title="Clinical" items={CLINICAL} onNavigate={onClose} />
        </div>

        {/* Footer */}
        <div className="border-t p-3">
          <div className="space-y-0.5">
            <NavLink
              to="/settings"
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/12 dark:text-brand-200'
                    : 'text-secondary hover:bg-[var(--surface-hover)] hover:text-[var(--text)]'
                )
              }
            >
              <Settings className="h-[18px] w-[18px] text-muted" />
              Settings
            </NavLink>
            <button
              onClick={onToggleTheme}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
            >
              {mode === 'dark' ? <Sun className="h-[18px] w-[18px] text-muted" /> : <Moon className="h-[18px] w-[18px] text-muted" />}
              {mode === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2.5 rounded-lg border bg-[var(--surface-2)] p-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-xs font-semibold text-white">
              JN
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-xs font-semibold">Dr. Julia Nolan</p>
              <p className="truncate text-[11px] text-muted">Internal Medicine</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
