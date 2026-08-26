import { useLocation } from 'wouter';
import { Brain, CheckCircle2, FlaskConical, Info, Loader2, Sparkles } from 'lucide-react';

import type { PatientCase } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState, ConfidenceMeter } from '@/components/common';
import { DiagnosisCard } from '@/components/DiagnosisCard';
import { useAnalyzeResults } from '@/hooks/useCases';
import { cn } from '@/lib/utils';

/**
 * The differential, driven by the results the doctor actually entered.
 *
 * It used to be a "generate a differential" button that reasoned from the
 * intake alone and then sat there, unchanged, however many results came back.
 * Now there is one action — analyse the results — and it has three honest
 * outcomes:
 *
 *   no_results        nothing has been resulted, so there is nothing to weigh.
 *                     It says so and sends the doctor to the workup rather
 *                     than inventing a ranking.
 *   confident         the results settle it; here is the ranked differential.
 *   needs_more_tests  the results narrow the field without closing it, so a
 *                     fresh round of investigations has been written onto the
 *                     workup tab and the doctor is told to go and fill it in.
 *
 * The action is offered once per round rather than as a standing "re-analyse"
 * button. Pressing it again on unchanged evidence only reshuffles the ranking,
 * and on a `needs_more_tests` verdict it replaces the open recommendations
 * with another round — so a new round of tests is something Sehati AI asks for when
 * it isn't sure, not something a doctor can produce by clicking twice. A new
 * result re-arms it, because then there is something new to weigh.
 */

/** The banner carrying the last analysis's verdict.
 *
 * Its whole job is to make the next action obvious, so each verdict gets its
 * own colour and its own button rather than a generic "OK". */
function VerdictBanner({ caseData: c }: { caseData: PatientCase }) {
  const [, navigate] = useLocation();
  const analysis = c.analysis;
  if (!analysis) return null;

  const needsTests = analysis.verdict === 'needs_more_tests';
  const noResults = analysis.verdict === 'no_results';

  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 rounded-xl border px-4 py-3',
        needsTests && 'border-amber-300 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/10',
        noResults && 'border-dashed bg-muted/30',
        analysis.verdict === 'confident' &&
          'border-emerald-300 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-500/10'
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <span
          className={cn(
            'mt-0.5 shrink-0',
            needsTests && 'text-amber-600 dark:text-amber-400',
            noResults && 'text-muted-foreground',
            analysis.verdict === 'confident' && 'text-emerald-600 dark:text-emerald-400'
          )}
        >
          {needsTests ? (
            <FlaskConical className="h-[18px] w-[18px]" />
          ) : noResults ? (
            <Info className="h-[18px] w-[18px]" />
          ) : (
            <CheckCircle2 className="h-[18px] w-[18px]" />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">
            {needsTests
              ? `Sehati AI needs more evidence${analysis.newTestCount ? ` — ${analysis.newTestCount} new test(s) added` : ''}`
              : noResults
                ? 'Nothing to analyse yet'
                : 'Sehati AI reached a leading diagnosis'}
          </p>
          <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{analysis.message}</p>
        </div>
      </div>

      {(needsTests || noResults) && (
        <Button size="sm" variant="outline" onClick={() => navigate(`/cases/${c.id}/tests`)}>
          Go to Tests
        </Button>
      )}
    </div>
  );
}

export function CaseDifferential({ caseData: c }: { caseData: PatientCase }) {
  const analyze = useAnalyzeResults(c.id);
  const ranked = [...c.diagnoses].sort((a, b) => b.confidence - a.confidence);

  const resulted = c.tests.filter((t) => t.status === 'completed' && t.result);
  const hasResults = resulted.length > 0;

  // The analysis is offered once per round, not as a button the doctor can
  // keep pressing. Re-running it on the same evidence only reshuffles the
  // ranking and can silently replace the workup with a fresh round of tests —
  // so a new round is something Sehati AI asks for when it isn't sure
  // (verdict 'needs_more_tests'), never something a stray click produces.
  // Entering another result re-arms it, because then there genuinely is
  // something new to weigh.
  const analysedThisRound =
    c.analysis?.verdict === 'confident' &&
    (c.analysis.resultsConsidered?.length ?? 0) >= resulted.length;

  const analyzeButton = analysedThisRound ? null : (
    <Button onClick={() => analyze.mutate()} disabled={analyze.isPending || !hasResults}>
      {analyze.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      Analyse results
    </Button>
  );

  // Nothing resulted and nothing ever analysed: the button would only produce
  // the "no results" verdict, so say it up front instead.
  if (!hasResults && ranked.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-16 text-center">
        <EmptyState
          icon={<Brain className="h-6 w-6" />}
          title="No results to reason over"
          description="The differential works from test results. Order the tests Sehati AI recommends on the Tests tab (or add your own), enter at least one result, then come back here."
          action={<TestsLink caseId={c.id} />}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Brain className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold">Differential diagnosis</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {analysedThisRound
                    ? `Weighed against the ${resulted.length} result${
                        resulted.length > 1 ? 's' : ''
                      } you entered. Enter another result to have Sehati AI reconsider.`
                    : hasResults
                      ? `Sehati AI weighs each recommended test against the ${resulted.length} result${
                          resulted.length > 1 ? 's' : ''
                        } you entered, then either names a diagnosis or asks for more tests.`
                      : 'No test results have been entered yet — enter one on the Tests tab to run the analysis.'}
                </p>
              </div>
            </div>
            {analyzeButton}
          </div>

          {analyze.isError && (
            <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{(analyze.error as Error).message}</p>
          )}

          {ranked.length > 0 && (
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
              <div className="flex items-start gap-2 border-t pt-3">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <p className="text-[12px] text-muted-foreground">
                  Confidence reflects how strongly the entered results match each condition, and changes
                  every time you analyse a new result.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <VerdictBanner caseData={c} />

      <div className="space-y-4">
        {ranked.map((d, i) => (
          <DiagnosisCard key={d.id} caseData={c} diagnosis={d} rank={i + 1} />
        ))}
      </div>
    </div>
  );
}

function TestsLink({ caseId }: { caseId: string }) {
  const [, navigate] = useLocation();
  return (
    <Button onClick={() => navigate(`/cases/${caseId}/tests`)}>
      <FlaskConical className="h-4 w-4" /> Go to Tests
    </Button>
  );
}
