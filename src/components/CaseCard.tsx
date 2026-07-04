import { Link } from 'react-router-dom';
import { ArrowUpRight, Clock, Activity } from 'lucide-react';
import type { PatientCase } from '../types';
import { Avatar } from './ui';
import { StatusBadge, PriorityBadge } from './badges';
import { ProgressBarCompact } from './ProgressTracker';
import { cn, confidenceHex } from '../lib/ui';

export function CaseCard({ caseData }: { caseData: PatientCase }) {
  const lead = [...caseData.diagnoses].sort((a, b) => b.confidence - a.confidence)[0];
  return (
    <Link
      to={`/cases/${caseData.id}`}
      className="group card block p-4 transition-all hover:-translate-y-0.5 hover:shadow-lift sm:p-5"
    >
      <div className="flex items-start gap-3">
        <Avatar name={caseData.patient.name} hue={caseData.patient.avatarHue} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold">{caseData.patient.name}</p>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          <p className="text-xs text-muted">
            {caseData.patient.age}y · {caseData.patient.gender} · {caseData.id}
          </p>
        </div>
        <PriorityBadge priority={caseData.priority} />
      </div>

      <p className="mt-3 line-clamp-2 text-sm text-secondary">{caseData.chiefComplaint}</p>

      <div className="mt-3 flex items-center gap-2 rounded-lg border bg-[var(--surface-2)] px-3 py-2">
        <Activity className="h-4 w-4 shrink-0 text-brand-500" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{lead?.name ?? 'Assessment pending'}</span>
        {lead && (
          <span
            className="shrink-0 text-xs font-bold tabular-nums"
            style={{ color: confidenceHex(lead.confidence) }}
          >
            {lead.confidence}%
          </span>
        )}
      </div>

      <div className="mt-3">
        <ProgressBarCompact steps={caseData.progress} />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <StatusBadge status={caseData.status} />
        <span className="flex items-center gap-1 text-xs text-muted">
          <Clock className="h-3.5 w-3.5" />
          {caseData.updatedAt}
        </span>
      </div>
    </Link>
  );
}

export function CaseRow({ caseData }: { caseData: PatientCase }) {
  const lead = [...caseData.diagnoses].sort((a, b) => b.confidence - a.confidence)[0];
  return (
    <Link
      to={`/cases/${caseData.id}`}
      className="group flex items-center gap-4 border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-[var(--surface-hover)]"
    >
      <Avatar name={caseData.patient.name} hue={caseData.patient.avatarHue} size={40} />
      <div className="min-w-0 flex-[2]">
        <p className="truncate text-sm font-semibold">{caseData.patient.name}</p>
        <p className="truncate text-xs text-muted">
          {caseData.patient.age}y · {caseData.patient.gender} · {caseData.id}
        </p>
      </div>
      <p className="hidden min-w-0 flex-[3] truncate text-sm text-secondary md:block">
        {caseData.chiefComplaint}
      </p>
      <div className="hidden flex-1 lg:block">
        <p className="truncate text-[13px] font-medium">{lead?.name ?? '—'}</p>
        {lead && (
          <span className="text-xs font-semibold tabular-nums" style={{ color: confidenceHex(lead.confidence) }}>
            {lead.confidence}%
          </span>
        )}
      </div>
      <div className="hidden w-28 sm:block">
        <StatusBadge status={caseData.status} />
      </div>
      <span className="hidden w-16 shrink-0 text-right text-xs text-muted xl:block">{caseData.updatedAt}</span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}
