import { useState } from 'react';
import { Link } from 'wouter';
import { CheckCircle2, ArrowRight, Search } from 'lucide-react';
import { useCaseList } from '@/hooks/useCases';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PatientAvatar } from '@/components/PatientAvatar';
import { LoadingState, EmptyState } from '@/components/common';
import { timeAgo, confidenceHex } from '@/lib/utils';

export function CompletedCases() {
  const [query, setQuery] = useState('');
  const { data: cases = [], isLoading, error } = useCaseList();
  const completed = cases.filter((c) => c.status === 'Completed' || c.status === 'Archived');
  const filtered = completed.filter((c) => {
    const q = query.toLowerCase();
    return !q || c.patient.name.toLowerCase().includes(q) || (c.finalDiagnosis?.name ?? '').toLowerCase().includes(q);
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Completed Cases</h1>
        <p className="mt-1 text-muted-foreground">{isLoading ? 'Loading cases…' : `${completed.length} archived cases · full AI reasoning preserved`}</p>
      </div>

      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">{(error as Error).message}</p>}

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search completed cases…" className="pl-9" />
      </div>

      {isLoading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<CheckCircle2 className="h-5 w-5" />} title="No completed cases" description="Cases appear here once a physician signs off the final diagnosis." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((c) => {
            const fd = c.finalDiagnosis;
            return (
              <Link key={c.id} href={`/cases/${c.id}`}>
                <Card className="group cursor-pointer p-5 transition-all hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex items-start gap-3">
                    <PatientAvatar name={c.patient.name} hue={c.patient.avatarHue} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-semibold">{c.patient.name}</p>
                        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {c.patient.age}y · {c.patient.gender} · {c.id}
                      </p>
                    </div>
                    <Badge variant="success" dot>
                      Completed
                    </Badge>
                  </div>

                  <div className="mt-4 flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2.5">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{fd?.name ?? c.primaryImpression}</span>
                    {fd && (
                      <span className="shrink-0 text-xs font-bold tabular-nums" style={{ color: confidenceHex(fd.confidence) }}>
                        {fd.confidence}%
                      </span>
                    )}
                  </div>

                  {c.outcome && <p className="mt-3 line-clamp-2 text-[13px] text-muted-foreground">{c.outcome}</p>}

                  <div className="mt-3 text-xs text-muted-foreground">Completed {timeAgo(c.updatedAt)}</div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
