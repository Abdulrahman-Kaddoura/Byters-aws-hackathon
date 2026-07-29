import { useState } from 'react';
import { FlaskConical, Sparkles, DollarSign, Clock, Target, Beaker, Loader2, AlertCircle } from 'lucide-react';
import type { Flag, TestRecommendation, PatientCase } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SectionHeading, EmptyState } from '@/components/common';
import { PriorityBadge, FlagBadge } from '@/components/badges';
import { useOrderTest, useRecordTestResult, useRerankAfterResults } from '@/hooks/useCases';

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

function TestCard({ test, caseId }: { test: TestRecommendation; caseId: string }) {
  const [entering, setEntering] = useState(false);
  const orderTest = useOrderTest(caseId);

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
            <Beaker className="h-[18px] w-[18px]" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold">{test.name}</h4>
              <PriorityBadge priority={test.priority} />
            </div>
            <p className="text-xs text-muted-foreground">{test.category}</p>
          </div>
        </div>
        {test.status === 'recommended' && (
          <Button size="sm" variant="outline" onClick={() => orderTest.mutate(test.id)} disabled={orderTest.isPending}>
            {orderTest.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Order test
          </Button>
        )}
        {test.status === 'ordered' && (
          <Button size="sm" onClick={() => setEntering((v) => !v)}>
            Enter result
          </Button>
        )}
        {test.status === 'completed' && <Badge variant="success">Completed</Badge>}
        {test.status === 'pending' && <Badge variant="warning">Pending</Badge>}
      </div>

      <p className="mt-3 text-[13px] text-muted-foreground">{test.reason}</p>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        <Meta icon={<Target className="h-3.5 w-3.5" />} label="Expected" value={test.expectedFinding} />
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

      {(test.status === 'ordered' || test.status === 'pending') && entering && <ResultForm test={test} caseId={caseId} onDone={() => setEntering(false)} />}
    </div>
  );
}

export function CaseTests({ caseData: c }: { caseData: PatientCase }) {
  const rerank = useRerankAfterResults(c.id);

  if (c.tests.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-20 text-center">
        <EmptyState icon={<FlaskConical className="h-6 w-6" />} title="No Tests Yet" description="Generate a differential diagnosis first — Aura suggests tests alongside it." />
      </div>
    );
  }

  const completed = c.tests.filter((t) => t.status === 'completed');
  const abnormal = completed.filter((t) => t.resultFlag && t.resultFlag !== 'normal');

  return (
    <div className="space-y-6">
      {completed.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b bg-gradient-to-r from-teal-50 to-primary/5 px-5 py-3 dark:from-teal-500/10">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-teal-600 dark:text-teal-300" />
              <p className="text-sm font-semibold">
                {completed.length} of {c.tests.length} investigations resulted
                {abnormal.length > 0 ? `, ${abnormal.length} abnormal` : ''}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => rerank.mutate()} disabled={rerank.isPending}>
              {rerank.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Re-rank differential
            </Button>
          </div>
          {rerank.isError && (
            <div className="flex items-start gap-2 p-4 text-sm text-rose-600 dark:text-rose-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {(rerank.error as Error).message}
            </div>
          )}
        </Card>
      )}

      <Card>
        <CardContent className="p-5">
          <SectionHeading
            icon={<FlaskConical className="h-[18px] w-[18px]" />}
            title="Investigations & Labs"
            subtitle="Order tests, enter results, then re-rank the differential."
            action={
              <Badge variant="brand">
                {completed.length}/{c.tests.length} resulted
              </Badge>
            }
          />
        </CardContent>
      </Card>

      <div className="space-y-3">
        {c.tests.map((t) => (
          <TestCard key={t.id} test={t} caseId={c.id} />
        ))}
      </div>
    </div>
  );
}
