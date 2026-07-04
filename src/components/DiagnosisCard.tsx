import { useState } from 'react';
import {
  ChevronDown,
  Sparkles,
  BookMarked,
  Gauge,
  CheckCircle2,
  XCircle,
  FlaskConical,
  Stethoscope,
} from 'lucide-react';
import type { PatientCase, Diagnosis } from '../types';
import { ConfidenceMeter, Badge } from './ui';
import { PriorityBadge } from './badges';
import { Drawer } from './Drawer';
import { DiagnosisDetail, type DetailTab } from './DiagnosisDetail';
import { cn, confidenceHex } from '../lib/ui';

export function DiagnosisCard({
  caseData,
  diagnosis,
  rank,
}: {
  caseData: PatientCase;
  diagnosis: Diagnosis;
  rank: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [drawer, setDrawer] = useState<DetailTab | null>(null);

  return (
    <>
      <div
        className={cn(
          'card overflow-hidden transition-shadow hover:shadow-lift',
          rank === 1 && 'ring-1 ring-brand-500/25'
        )}
      >
        {rank === 1 && (
          <div className="flex items-center gap-1.5 bg-brand-50 px-4 py-1.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-500/12 dark:text-brand-200">
            <Sparkles className="h-3.5 w-3.5" />
            Leading diagnosis
          </div>
        )}
        <div className="p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-subtle)] text-xs font-bold text-secondary">
              {rank}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold tracking-tight">{diagnosis.name}</h3>
                <PriorityBadge priority={diagnosis.priority} />
                <Badge tone="gray">{diagnosis.category}</Badge>
              </div>
              <p className="mt-1 text-sm text-secondary">{diagnosis.tagline}</p>
            </div>
          </div>

          <div className="mt-4">
            <ConfidenceMeter value={diagnosis.confidence} height={8} />
          </div>

          {/* Findings preview */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Supporting ({diagnosis.supporting.length})
              </p>
              <ul className="space-y-1">
                {diagnosis.supporting.slice(0, expanded ? undefined : 3).map((s, i) => (
                  <li key={i} className="text-[13px] leading-snug text-secondary">
                    • {s}
                  </li>
                ))}
                {!expanded && diagnosis.supporting.length > 3 && (
                  <li className="text-[12px] text-muted">+{diagnosis.supporting.length - 3} more</li>
                )}
              </ul>
            </div>
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                <XCircle className="h-3.5 w-3.5 text-rose-500" /> Contradicting ({diagnosis.contradicting.length})
              </p>
              <ul className="space-y-1">
                {diagnosis.contradicting.length ? (
                  diagnosis.contradicting.slice(0, expanded ? undefined : 3).map((s, i) => (
                    <li key={i} className="text-[13px] leading-snug text-secondary">
                      • {s}
                    </li>
                  ))
                ) : (
                  <li className="text-[13px] text-muted">None significant</li>
                )}
              </ul>
            </div>
          </div>

          {/* Expanded reasoning */}
          {expanded && (
            <div className="mt-4 animate-fade-in space-y-3 rounded-lg border bg-[var(--surface-2)] p-3.5">
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Reasoning</p>
                <p className="text-[13px] leading-relaxed text-secondary">{diagnosis.reasoning}</p>
              </div>
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <FlaskConical className="h-3.5 w-3.5" /> Recommended tests
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {diagnosis.recommendedTests.map((t, i) => (
                    <span key={i} className="rounded-md border bg-[var(--surface)] px-2 py-0.5 text-xs font-medium">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button onClick={() => setExpanded((e) => !e)} className="btn btn-ghost px-2.5 py-1.5 text-xs">
              <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
              {expanded ? 'Collapse' : 'Expand'}
            </button>
            <div className="mx-1 h-4 w-px bg-[var(--border)]" />
            <button onClick={() => setDrawer('explanation')} className="btn btn-outline px-2.5 py-1.5 text-xs">
              <Gauge className="h-3.5 w-3.5" /> Explain
            </button>
            <button onClick={() => setDrawer('evidence')} className="btn btn-outline px-2.5 py-1.5 text-xs">
              <BookMarked className="h-3.5 w-3.5" /> Evidence
            </button>
            <button onClick={() => setDrawer('discussion')} className="btn btn-primary px-2.5 py-1.5 text-xs">
              <Sparkles className="h-3.5 w-3.5" /> Discuss with AI
            </button>
          </div>
        </div>
      </div>

      <Drawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        title={diagnosis.name}
        subtitle={`${diagnosis.confidence}% confidence · ${caseData.patient.name}`}
        icon={
          <span
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
            style={{ background: confidenceHex(diagnosis.confidence) }}
          >
            <Stethoscope className="h-5 w-5" />
          </span>
        }
      >
        {drawer && <DiagnosisDetail caseData={caseData} diagnosis={diagnosis} initialTab={drawer} />}
      </Drawer>
    </>
  );
}
