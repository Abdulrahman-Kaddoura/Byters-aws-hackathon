import { Link } from 'react-router-dom';
import { useState } from 'react';
import { CheckCircle2, Search, ArrowUpRight, CalendarCheck } from 'lucide-react';
import { CASES } from '../data/cases';
import { PageHeader } from '../components/PageHeader';
import { Avatar, EmptyState, Badge } from '../components/ui';
import { confidenceHex } from '../lib/ui';

const COMPLETED = CASES.filter((c) => c.status === 'Completed' || c.status === 'Archived');

export function Completed() {
  const [query, setQuery] = useState('');
  const filtered = COMPLETED.filter((c) => {
    const q = query.toLowerCase();
    return !q || c.patient.name.toLowerCase().includes(q) || c.primaryImpression.toLowerCase().includes(q);
  });

  return (
    <div>
      <PageHeader
        title="Completed Cases"
        description={`${COMPLETED.length} archived cases · read-only records with full AI reasoning preserved`}
      />

      <div className="relative mb-6 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search completed cases…"
          className="input pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Search className="h-5 w-5" />} title="No completed cases found" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((c) => {
            const fd = c.finalDiagnosis;
            return (
              <Link
                key={c.id}
                to={`/cases/${c.id}`}
                className="group card block p-5 transition-all hover:-translate-y-0.5 hover:shadow-lift"
              >
                <div className="flex items-start gap-3">
                  <Avatar name={c.patient.name} hue={c.patient.avatarHue} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold">{c.patient.name}</p>
                      <ArrowUpRight className="h-4 w-4 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    <p className="text-xs text-muted">
                      {c.patient.age}y · {c.patient.gender} · {c.id}
                    </p>
                  </div>
                  <Badge tone="green" dot>
                    Completed
                  </Badge>
                </div>

                <div className="mt-4 flex items-center gap-2 rounded-lg border bg-[var(--surface-2)] px-3 py-2.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{fd?.name ?? c.primaryImpression}</span>
                  {fd && (
                    <span className="shrink-0 text-xs font-bold tabular-nums" style={{ color: confidenceHex(fd.confidence) }}>
                      {fd.confidence}%
                    </span>
                  )}
                </div>

                {c.outcome && <p className="mt-3 line-clamp-2 text-[13px] text-secondary">{c.outcome}</p>}

                <div className="mt-3 flex items-center gap-1.5 text-xs text-muted">
                  <CalendarCheck className="h-3.5 w-3.5" />
                  Completed {c.updatedAt}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
