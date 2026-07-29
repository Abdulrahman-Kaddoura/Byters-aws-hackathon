import { Brain, Sparkles, Info, Loader2 } from 'lucide-react';
import type { PatientCase } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState, ConfidenceMeter } from '@/components/common';
import { DiagnosisCard } from '@/components/DiagnosisCard';
import { useRequestRecommendations } from '@/hooks/useCases';

export function CaseDifferential({ caseData: c }: { caseData: PatientCase }) {
  const requestRecs = useRequestRecommendations(c.id);
  const ranked = [...c.diagnoses].sort((a, b) => b.confidence - a.confidence);

  if (ranked.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-20 text-center">
        <EmptyState
          icon={<Brain className="h-6 w-6" />}
          title="No Differential Yet"
          description="Ask Aura to analyze the clinical data collected so far and build a ranked differential diagnosis."
          action={
            <Button onClick={() => requestRecs.mutate()} disabled={requestRecs.isPending}>
              {requestRecs.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate differential diagnosis
            </Button>
          }
        />
        {requestRecs.isError && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{(requestRecs.error as Error).message}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Brain className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold">Differential diagnosis</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Aura ranked {ranked.length} candidate diagnoses from the case data collected so far. Expand any card to see the reasoning, or discuss it
                  directly with Aura.
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => requestRecs.mutate()} disabled={requestRecs.isPending}>
              {requestRecs.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Re-run
            </Button>
          </div>

          <div className="mt-5 space-y-3 rounded-xl border bg-muted/30 p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" /> Confidence ranking
            </p>
            {ranked.map((d) => (
              <div key={d.id} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-[13px] font-medium sm:w-52">{d.name}</span>
                <div className="flex-1">
                  <ConfidenceMeter value={d.confidence} height={7} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-lg border border-dashed px-3 py-2">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <p className="text-[12px] text-muted-foreground">Confidence reflects how strongly the collected evidence matches each condition, and updates as new findings and results are entered.</p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {ranked.map((d, i) => (
          <DiagnosisCard key={d.id} caseData={c} diagnosis={d} rank={i + 1} />
        ))}
      </div>
    </div>
  );
}
