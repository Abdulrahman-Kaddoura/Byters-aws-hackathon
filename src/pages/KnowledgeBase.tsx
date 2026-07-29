import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Search, BookOpen } from 'lucide-react';
import { useCaseList } from '@/hooks/useCases';
import { Input } from '@/components/ui/input';
import { LoadingState, EmptyState } from '@/components/common';
import { ReferenceCard, SimilarCaseCard } from '@/components/Evidence';
import type { Reference, SimilarCase } from '@/types';

export function KnowledgeBase() {
  const [query, setQuery] = useState('');
  const { data: cases = [], isLoading } = useCaseList();

  const { references, similarCases } = useMemo(() => {
    const refs: { ref: Reference; caseId: string; dxName: string }[] = [];
    const sims: { sim: SimilarCase; caseId: string; dxName: string }[] = [];
    for (const c of cases) {
      for (const dx of c.diagnoses) {
        for (const r of dx.references) refs.push({ ref: r, caseId: c.id, dxName: dx.name });
        for (const s of dx.similarCases) sims.push({ sim: s, caseId: c.id, dxName: dx.name });
      }
    }
    return { references: refs, similarCases: sims };
  }, [cases]);

  const q = query.trim().toLowerCase();
  const filteredRefs = q ? references.filter((r) => r.ref.title.toLowerCase().includes(q) || r.ref.source.toLowerCase().includes(q) || r.dxName.toLowerCase().includes(q)) : references;
  const filteredSims = q ? similarCases.filter((s) => s.sim.title.toLowerCase().includes(q) || s.dxName.toLowerCase().includes(q)) : similarCases;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Knowledge Base</h1>
        <p className="mt-1 text-muted-foreground">The clinical evidence Aura has cited across your cases — guidelines, papers, textbooks and similar historical cases.</p>
      </div>

      <div className="relative max-w-2xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search references, sources or diagnoses…" className="rounded-xl border-2 py-6 pl-10 text-lg shadow-sm" />
      </div>

      {isLoading ? (
        <LoadingState label="Loading evidence…" />
      ) : filteredRefs.length === 0 && filteredSims.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-5 w-5" />}
          title="No evidence yet"
          description="References appear here automatically once Aura generates a differential diagnosis on one of your cases."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">References ({filteredRefs.length})</h2>
            {filteredRefs.map((r, i) => (
              <div key={i}>
                <ReferenceCard reference={r.ref} />
                <Link href={`/cases/${r.caseId}`} className="mt-1 block text-xs text-primary hover:underline">
                  Cited for {r.dxName} · {r.caseId}
                </Link>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Similar cases ({filteredSims.length})</h2>
            {filteredSims.map((s, i) => (
              <div key={i}>
                <SimilarCaseCard item={s.sim} />
                <Link href={`/cases/${s.caseId}`} className="mt-1 block text-xs text-primary hover:underline">
                  Compared against {s.dxName} · {s.caseId}
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
