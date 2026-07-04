import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Search, Bell, Plus, CornerDownLeft } from 'lucide-react';
import { CASES } from '../data/cases';
import { Avatar } from './ui';
import { StatusBadge } from './badges';
import { cn } from '../lib/ui';

export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const results = query.trim()
    ? CASES.filter((c) => {
        const q = query.toLowerCase();
        return (
          c.patient.name.toLowerCase().includes(q) ||
          c.chiefComplaint.toLowerCase().includes(q) ||
          c.primaryImpression.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q)
        );
      }).slice(0, 6)
    : [];

  function go(id: string) {
    setOpen(false);
    setQuery('');
    navigate(`/cases/${id}`);
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-[var(--surface)]/85 px-4 backdrop-blur-md sm:px-6">
      <button
        className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[var(--surface-hover)] lg:hidden"
        onClick={onOpenMenu}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Search */}
      <div ref={boxRef} className="relative w-full max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search patients, cases, complaints…"
          className="input pl-9 pr-14"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-[var(--border-strong)] px-1.5 py-0.5 text-[10px] font-medium text-muted sm:block">
          ⌘K
        </kbd>

        {open && query.trim() && (
          <div className="absolute left-0 right-0 top-12 z-30 animate-fade-in overflow-hidden rounded-xl border bg-[var(--surface)] shadow-lift">
            {results.length ? (
              <ul className="max-h-80 overflow-y-auto py-1">
                {results.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => go(c.id)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[var(--surface-hover)]"
                    >
                      <Avatar name={c.patient.name} hue={c.patient.avatarHue} size={32} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.patient.name}</p>
                        <p className="truncate text-xs text-muted">{c.chiefComplaint}</p>
                      </div>
                      <StatusBadge status={c.status} />
                      <CornerDownLeft className="h-3.5 w-3.5 text-muted" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-6 text-center text-sm text-muted">No results for "{query}"</div>
            )}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={() => navigate('/intake')}
          className="btn btn-primary hidden sm:inline-flex"
        >
          <Plus className="h-4 w-4" />
          New Case
        </button>
        <button
          onClick={() => navigate('/intake')}
          className="btn btn-primary inline-flex sm:hidden px-2.5"
          aria-label="New case"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          className="relative flex h-9 w-9 items-center justify-center rounded-lg border hover:bg-[var(--surface-hover)]"
          aria-label="Notifications"
        >
          <Bell className="h-[18px] w-[18px] text-secondary" />
          <span className={cn('absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-rose-500')} />
        </button>
      </div>
    </header>
  );
}
