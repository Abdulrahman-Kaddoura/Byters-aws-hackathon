import { useState } from 'react';
import {
  FlaskConical,
  Sparkles,
  DollarSign,
  Clock,
  Target,
  ChevronDown,
  Beaker,
} from 'lucide-react';
import { useCaseData, useCaseActions } from './CaseLayout';
import { isLive } from '../../lib/config';
import * as api from '../../lib/api';
import { SectionHeading, Badge } from '../../components/ui';
import { PriorityBadge, FlagBadge } from '../../components/badges';
import { cn, TONE_DOT, type Tone } from '../../lib/ui';
import type { TestRecommendation, TestStatus } from '../../types';

const STATUS_FLOW: TestStatus[] = ['recommended', 'ordered', 'pending', 'completed'];
const STATUS_TONE: Record<TestStatus, Tone> = {
  recommended: 'gray',
  ordered: 'brand',
  pending: 'amber',
  completed: 'green',
};
const STATUS_LABEL: Record<TestStatus, string> = {
  recommended: 'Recommended',
  ordered: 'Ordered',
  pending: 'Pending',
  completed: 'Completed',
};

function StatusControl({ status, onChange }: { status: TestStatus; onChange: (s: TestStatus) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="btn btn-outline px-2.5 py-1.5 text-xs">
        <span className={cn('h-1.5 w-1.5 rounded-full', TONE_DOT[STATUS_TONE[status]])} />
        {STATUS_LABEL[status]}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-20 w-40 animate-fade-in overflow-hidden rounded-lg border bg-[var(--surface)] py-1 shadow-lift">
            {STATUS_FLOW.map((s) => (
              <button
                key={s}
                onClick={() => {
                  onChange(s);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-[var(--surface-hover)]',
                  s === status && 'font-semibold'
                )}
              >
                <Badge tone={STATUS_TONE[s]}>{STATUS_LABEL[s]}</Badge>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted">{icon}</span>
      <span className="text-[11px] text-muted">{label}:</span>
      <span className="text-[12px] font-medium">{value}</span>
    </div>
  );
}

function TestCard({ test, caseId }: { test: TestRecommendation; caseId: string }) {
  const { apply } = useCaseActions();
  const [status, setStatus] = useState<TestStatus>(test.status);

  async function changeStatus(next: TestStatus) {
    setStatus(next);
    // Ordering is the only transition the doctor drives; results arrive from the lab.
    if (!isLive || next !== 'ordered') return;
    const res = await api.orderTest(caseId, test.id);
    apply(res.case);
  }

  return (
    <div className="card-flat p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-subtle)] text-brand-500">
            <Beaker className="h-[18px] w-[18px]" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold">{test.name}</h4>
              <PriorityBadge priority={test.priority} />
            </div>
            <p className="text-xs text-muted">{test.category}</p>
          </div>
        </div>
        <StatusControl status={status} onChange={changeStatus} />
      </div>

      <p className="mt-3 text-[13px] text-secondary">{test.reason}</p>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        <Meta icon={<Target className="h-3.5 w-3.5" />} label="Expected" value={test.expectedFinding} />
        <Meta icon={<DollarSign className="h-3.5 w-3.5" />} label="Cost" value={test.cost} />
        <Meta icon={<Clock className="h-3.5 w-3.5" />} label="Urgency" value={test.urgency} />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-[11px] font-medium text-muted">Diagnostic value</span>
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--bg-subtle)]">
          <div className="h-full rounded-full bg-teal-500" style={{ width: `${test.diagnosticValue}%` }} />
        </div>
        <span className="text-[11px] font-semibold tabular-nums text-secondary">{test.diagnosticValue}%</span>
      </div>

      {/* Result */}
      {status === 'completed' && test.result && (
        <div className="mt-3 animate-fade-in rounded-lg border bg-[var(--surface-2)] p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Result</span>
              {test.resultFlag && <FlagBadge flag={test.resultFlag} />}
            </div>
          </div>
          <p className="mt-1.5 text-sm font-semibold">{test.result}</p>
          {test.resultDetail && <p className="mt-1 text-[13px] text-secondary">{test.resultDetail}</p>}
        </div>
      )}
      {status === 'pending' && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-[13px] text-muted">
          <span className="flex items-center gap-1">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </span>
          Awaiting result{test.resultDetail ? ` — ${test.resultDetail}` : '…'}
        </div>
      )}
    </div>
  );
}

export function Tests() {
  const c = useCaseData();
  const completed = c.tests.filter((t) => t.status === 'completed');
  const abnormal = completed.filter((t) => t.resultFlag && t.resultFlag !== 'normal');

  return (
    <div className="space-y-5">
      {/* Results summary / AI update */}
      {completed.length > 0 && (
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2.5 border-b bg-gradient-to-r from-teal-50/70 to-brand-50/50 px-5 py-3 dark:from-teal-500/10 dark:to-brand-500/8">
            <Sparkles className="h-4 w-4 text-teal-600 dark:text-teal-300" />
            <p className="text-sm font-semibold">Results received — Aura re-ranked the differential</p>
          </div>
          <div className="p-5">
            <p className="text-[13px] text-secondary">
              {completed.length} of {c.tests.length} investigations have resulted
              {abnormal.length > 0 ? `, with ${abnormal.length} abnormal finding${abnormal.length > 1 ? 's' : ''}` : ''}.
              Confidence scores, differential ranking and recommended next steps have been updated automatically.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {completed.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-2 rounded-lg border bg-[var(--surface-2)] px-3 py-1.5"
                >
                  <span className="text-[13px] font-medium">{t.name}</span>
                  <span className="text-[13px] text-secondary">·</span>
                  <span className="text-[13px] font-semibold">{t.result}</span>
                  {t.resultFlag && <FlagBadge flag={t.resultFlag} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="card p-5">
        <SectionHeading
          icon={<FlaskConical className="h-[18px] w-[18px]" />}
          title="Recommended investigations"
          subtitle="Aura suggests these tests to confirm or exclude the leading diagnoses."
          action={
            <Badge tone="brand">
              {completed.length}/{c.tests.length} resulted
            </Badge>
          }
        />
      </div>

      <div className="space-y-3">
        {c.tests.map((t) => (
          <TestCard key={t.id} test={t} caseId={c.id} />
        ))}
      </div>
    </div>
  );
}
