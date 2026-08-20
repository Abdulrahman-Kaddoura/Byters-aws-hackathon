import { useState } from 'react';
import {
  AlertCircle,
  Beaker,
  Clock,
  DollarSign,
  FlaskConical,
  Loader2,
  Plus,
  Sparkles,
  Target,
  Undo2,
  X,
} from 'lucide-react';

import type { Flag, TestRecommendation, PatientCase } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SectionHeading, EmptyState } from '@/components/common';
import { PriorityBadge, FlagBadge } from '@/components/badges';
import {
  useAddCustomTest,
  useOrderTest,
  useRecommendTests,
  useRecordTestResult,
  useUpdateTest,
} from '@/hooks/useCases';
import { cn } from '@/lib/utils';

function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-[11px] text-muted-foreground">{label}:</span>
      <span className="text-[12px] font-medium">{value}</span>
    </div>
  );
}

function ResultForm({ test, caseId, onDone }: { test: TestRecommendation; caseId: string; onDone: () => void }) {
  const [result, setResult] = useState('');
  const [flag, setFlag] = useState<Flag>('normal');
  const [detail, setDetail] = useState('');
  const recordResult = useRecordTestResult(caseId);

  return (
    <div className="mt-3 space-y-2 rounded-lg border bg-muted/30 p-3">
      <Input value={result} onChange={(e) => setResult(e.target.value)} placeholder="Result (e.g. RLL infiltrate)" />
      <div className="flex gap-2">
        <Select value={flag} onValueChange={(v) => setFlag(v as Flag)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="abnormal">Abnormal</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
        <Input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Extra detail (optional)" />
      </div>
      <Button
        size="sm"
        disabled={!result.trim() || recordResult.isPending}
        onClick={async () => {
          await recordResult.mutateAsync({ testId: test.id, payload: { result, resultFlag: flag, resultDetail: detail || undefined } });
          onDone();
        }}
      >
        {recordResult.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Save result
      </Button>
    </div>
  );
}

/** The form for an investigation Aura didn't suggest.
 *
 * A recommendation is a suggestion, not a work order. If none of the AI's
 * tests are the right one — or the doctor ran something else entirely — this
 * is how that gets onto the case, where the results analysis will read it
 * exactly like any other test. */
function CustomTestForm({ caseId }: { caseId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const addTest = useAddCustomTest(caseId);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> Add a test I ordered
      </Button>
    );
  }

  async function submit() {
    if (!name.trim()) return;
    await addTest.mutateAsync({ name: name.trim(), reason: reason.trim() || undefined });
    setName('');
    setReason('');
    setOpen(false);
  }

  return (
    <div className="w-full space-y-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Test ordered by you
        </p>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpen(false)} aria-label="Cancel">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Test name (e.g. Bedside ultrasound)" autoFocus />
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why you ordered it (optional)" />
      <Button size="sm" onClick={submit} disabled={!name.trim() || addTest.isPending}>
        {addTest.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Add test
      </Button>
      {addTest.isError && (
        <p className="text-xs text-rose-600 dark:text-rose-400">{(addTest.error as Error).message}</p>
      )}
    </div>
  );
}

function StatusActions({ test, caseId }: { test: TestRecommendation; caseId: string }) {
  const orderTest = useOrderTest(caseId);
  const updateTest = useUpdateTest(caseId);
  const [entering, setEntering] = useState(false);
  const busy = orderTest.isPending || updateTest.isPending;

  if (test.status === 'completed') return <Badge variant="success">Resulted</Badge>;

  if (test.status === 'declined') {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="text-muted-foreground"
        disabled={busy}
        onClick={() => updateTest.mutate({ testId: test.id, status: 'recommended' })}
      >
        <Undo2 className="h-3.5 w-3.5" /> Undo
      </Button>
    );
  }

  if (test.status === 'recommended') {
    return (
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => orderTest.mutate(test.id)}>
          {orderTest.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Awaiting results
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          disabled={busy}
          onClick={() => updateTest.mutate({ testId: test.id, status: 'declined' })}
        >
          Didn't run
        </Button>
      </div>
    );
  }

  // ordered / pending — running, waiting on the lab.
  return (
    <div className="flex shrink-0 flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <Badge variant="warning">
          <Clock className="mr-1 h-3 w-3" /> Awaiting results
        </Badge>
        <Button size="sm" onClick={() => setEntering((v) => !v)}>
          Enter result
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          disabled={busy}
          title="Cancel — this test wasn't actually ordered"
          onClick={() => updateTest.mutate({ testId: test.id, status: 'recommended' })}
        >
          <X className="h-3.5 w-3.5" /> Cancel
        </Button>
      </div>
      {entering && (
        <div className="w-full min-w-[260px]">
          <ResultForm test={test} caseId={caseId} onDone={() => setEntering(false)} />
        </div>
      )}
    </div>
  );
}

function TestCard({ test, caseId, historic }: { test: TestRecommendation; caseId: string; historic?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-card p-4',
        (historic || test.status === 'declined') && 'opacity-70'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
            <Beaker className="h-[18px] w-[18px]" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold">{test.name}</h4>
              {test.custom ? <Badge variant="outline">Added by you</Badge> : <PriorityBadge priority={test.priority} />}
              {test.status === 'declined' && <Badge variant="secondary">Not run</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">{test.category}</p>
          </div>
        </div>
        <StatusActions test={test} caseId={caseId} />
      </div>

      {test.reason && <p className="mt-3 text-[13px] text-muted-foreground">{test.reason}</p>}

      {/* An AI recommendation carries its rationale and cost; a test the doctor
          already ran carries none of that, so the row is simply omitted. */}
      {!test.custom && (
        <>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {test.expectedFinding && (
              <Meta icon={<Target className="h-3.5 w-3.5" />} label="Expected" value={test.expectedFinding} />
            )}
            <Meta icon={<DollarSign className="h-3.5 w-3.5" />} label="Cost" value={test.cost} />
            <Meta icon={<Clock className="h-3.5 w-3.5" />} label="Urgency" value={test.urgency} />
          </div>

          <div className="mt-3 flex items-center gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">Diagnostic value</span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-teal-500" style={{ width: `${test.diagnosticValue}%` }} />
            </div>
            <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">{test.diagnosticValue}%</span>
          </div>
        </>
      )}

      {test.status === 'completed' && test.result && (
        <div className="mt-3 rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Result</span>
            {test.resultFlag && <FlagBadge flag={test.resultFlag} />}
          </div>
          <p className="mt-1.5 text-sm font-semibold">{test.result}</p>
          {test.resultDetail && <p className="mt-1 text-[13px] text-muted-foreground">{test.resultDetail}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Investigations, grouped by round.
 *
 * The results analysis opens a new round when what came back doesn't settle
 * the question. Earlier rounds don't disappear — the results in them are what
 * the analysis reasoned over — so they stay below the current round, dimmed
 * and labelled as history.
 */
export function CaseTests({ caseData: c }: { caseData: PatientCase }) {
  const recommend = useRecommendTests(c.id);
  const currentRound = c.testRound ?? 1;

  if (c.tests.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-16 text-center">
        <EmptyState
          icon={<FlaskConical className="h-6 w-6" />}
          title="No investigations yet"
          description="Ask Aura which tests this case needs, or add one you've already ordered."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button onClick={() => recommend.mutate()} disabled={recommend.isPending}>
                {recommend.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Get AI test recommendations
              </Button>
              <CustomTestForm caseId={c.id} />
            </div>
          }
        />
        {recommend.isError && (
          <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{(recommend.error as Error).message}</p>
        )}
      </div>
    );
  }

  const current = c.tests.filter((t) => (t.round ?? 1) >= currentRound);
  const previous = c.tests.filter((t) => (t.round ?? 1) < currentRound);
  const resulted = c.tests.filter((t) => t.status === 'completed');
  const awaiting = c.tests.filter((t) => t.status === 'ordered' || t.status === 'pending');

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-5">
          <SectionHeading
            icon={<FlaskConical className="h-[18px] w-[18px]" />}
            title="Investigations & labs"
            subtitle="Mark a test awaiting results when it's running, then enter the result. The differential reads what you enter here."
            action={
              <div className="flex items-center gap-2">
                <Badge variant="brand">
                  {resulted.length}/{c.tests.length} resulted
                </Badge>
                {awaiting.length > 0 && (
                  <Badge variant="warning">
                    <Clock className="mr-1 h-3 w-3" />
                    {awaiting.length} awaiting
                  </Badge>
                )}
              </div>
            }
          />
          <div className="mt-4 flex flex-wrap items-start gap-2 border-t pt-4">
            <Button variant="outline" size="sm" onClick={() => recommend.mutate()} disabled={recommend.isPending}>
              {recommend.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Ask Aura for more tests
            </Button>
            <CustomTestForm caseId={c.id} />
          </div>
          {recommend.isError && (
            <p className="mt-3 flex items-start gap-2 text-sm text-rose-600 dark:text-rose-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {(recommend.error as Error).message}
            </p>
          )}
        </CardContent>
      </Card>

      {currentRound > 1 && (
        <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
          Round {currentRound} — requested by Aura after the last results
        </p>
      )}
      <div className="space-y-3">
        {current.map((t) => (
          <TestCard key={t.id} test={t} caseId={c.id} />
        ))}
      </div>

      {previous.length > 0 && (
        <div className="space-y-3 border-t pt-4">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Earlier rounds ({previous.length})
          </p>
          {previous.map((t) => (
            <TestCard key={t.id} test={t} caseId={c.id} historic />
          ))}
        </div>
      )}
    </div>
  );
}
