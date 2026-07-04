import { useMemo, useState } from 'react';
import { Search, LayoutGrid, List, SlidersHorizontal } from 'lucide-react';
import { CASES } from '../data/cases';
import { PageHeader } from '../components/PageHeader';
import { CaseCard, CaseRow } from '../components/CaseCard';
import { EmptyState } from '../components/ui';
import { cn } from '../lib/ui';
import type { CaseStatus, Priority } from '../types';

const ACTIVE = CASES.filter((c) => c.status !== 'Completed' && c.status !== 'Archived');

const STATUS_FILTERS: (CaseStatus | 'All')[] = [
  'All',
  'AI Interview',
  'Awaiting Examination',
  'Diagnosis in Progress',
  'Awaiting Tests',
];

type Sort = 'recent' | 'priority' | 'name';
const PRIORITY_RANK: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };

export function Cases() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<CaseStatus | 'All'>('All');
  const [priority, setPriority] = useState<Priority | 'All'>('All');
  const [sort, setSort] = useState<Sort>('priority');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const filtered = useMemo(() => {
    let list = ACTIVE.filter((c) => {
      const q = query.toLowerCase();
      const matchesQuery =
        !q ||
        c.patient.name.toLowerCase().includes(q) ||
        c.chiefComplaint.toLowerCase().includes(q) ||
        c.primaryImpression.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q);
      const matchesStatus = status === 'All' || c.status === status;
      const matchesPriority = priority === 'All' || c.priority === priority;
      return matchesQuery && matchesStatus && matchesPriority;
    });
    list = [...list].sort((a, b) => {
      if (sort === 'priority') return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (sort === 'name') return a.patient.name.localeCompare(b.patient.name);
      return 0; // recent — keep source order
    });
    return list;
  }, [query, status, priority, sort]);

  return (
    <div>
      <PageHeader
        title="Active Cases"
        description={`${ACTIVE.length} cases moving through the diagnostic workflow`}
        actions={
          <div className="flex items-center gap-1 rounded-lg border p-0.5">
            <button
              onClick={() => setView('grid')}
              className={cn('flex h-8 w-8 items-center justify-center rounded-md', view === 'grid' ? 'bg-[var(--surface-hover)]' : 'text-muted')}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView('list')}
              className={cn('flex h-8 w-8 items-center justify-center rounded-md', view === 'list' ? 'bg-[var(--surface-hover)]' : 'text-muted')}
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        }
      />

      {/* Filter bar */}
      <div className="card mb-6 p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, complaint or case ID…"
              className="input pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <select value={priority} onChange={(e) => setPriority(e.target.value as Priority | 'All')} className="input w-auto">
              <option value="All">All priorities</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="input w-auto">
              <option value="priority">Sort: Priority</option>
              <option value="recent">Sort: Recent</option>
              <option value="name">Sort: Name</option>
            </select>
          </div>
        </div>

        {/* Status pills */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3">
          <SlidersHorizontal className="mr-1 h-3.5 w-3.5 text-muted" />
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                status === s
                  ? 'border-brand-500 bg-brand-500 text-white'
                  : 'border-[var(--border-strong)] text-secondary hover:border-brand-400 hover:text-brand-600'
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Search className="h-5 w-5" />}
          title="No cases match your filters"
          description="Try adjusting the search term, status or priority filters."
        />
      ) : view === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <CaseCard key={c.id} caseData={c} />
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden items-center gap-4 border-b bg-[var(--surface-2)] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted md:flex">
            <span className="w-10" />
            <span className="flex-[2]">Patient</span>
            <span className="flex-[3]">Chief complaint</span>
            <span className="flex-1">Leading Dx</span>
            <span className="w-28">Status</span>
            <span className="w-16 text-right">Updated</span>
            <span className="w-4" />
          </div>
          {filtered.map((c) => (
            <CaseRow key={c.id} caseData={c} />
          ))}
        </div>
      )}
    </div>
  );
}
