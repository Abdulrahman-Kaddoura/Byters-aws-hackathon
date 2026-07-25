import { useEffect } from 'react';
import { useParams, Link, NavLink, Outlet, useOutletContext } from 'react-router-dom';
import {
  ArrowLeft,
  Activity,
  Heart,
  Wind,
  Droplets,
  Thermometer,
  Lock,
  LayoutDashboard,
  MessagesSquare,
  Stethoscope,
  Brain,
  FlaskConical,
  ClipboardCheck,
  GitBranch,
} from 'lucide-react';
import { useCase } from '../../hooks/useCases';
import { useSetCurrentCase } from '../../lib/currentCase';
import { Avatar } from '../../components/ui';
import { StatusBadge, PriorityBadge } from '../../components/badges';
import { AssistantPanel } from '../../components/AssistantPanel';
import { NotFound } from '../NotFound';
import { cn } from '../../lib/ui';
import type { PatientCase, Vitals } from '../../types';

interface CaseContext {
  caseData: PatientCase;
  /** Push a mutation's returned case into state without a second round trip. */
  apply: (updated: PatientCase) => void;
  reload: () => void;
}

export function useCaseData() {
  return useOutletContext<CaseContext>().caseData;
}

export function useCaseActions() {
  const { apply, reload } = useOutletContext<CaseContext>();
  return { apply, reload };
}

const TABS = [
  { to: '.', end: true, label: 'Overview', icon: LayoutDashboard },
  { to: 'interview', label: 'AI Interview', icon: MessagesSquare },
  { to: 'examination', label: 'Examination', icon: Stethoscope },
  { to: 'differential', label: 'Differential', icon: Brain },
  { to: 'tests', label: 'Tests', icon: FlaskConical },
  { to: 'diagnosis', label: 'Final Diagnosis', icon: ClipboardCheck },
  { to: 'timeline', label: 'Timeline', icon: GitBranch },
];

function VitalChip({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value?: string; tone: string }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-[var(--surface)] px-2.5 py-1.5">
      <span className={cn('shrink-0', tone)}>{icon}</span>
      <div className="leading-none">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</p>
        <p className="mt-0.5 text-[13px] font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function VitalsRow({ vitals }: { vitals: Vitals }) {
  return (
    <div className="flex flex-wrap gap-2">
      <VitalChip icon={<Activity className="h-4 w-4" />} label="BP" value={vitals.bp} tone="text-rose-500" />
      <VitalChip icon={<Heart className="h-4 w-4" />} label="HR" value={vitals.hr} tone="text-brand-500" />
      <VitalChip icon={<Wind className="h-4 w-4" />} label="RR" value={vitals.rr} tone="text-teal-500" />
      <VitalChip icon={<Droplets className="h-4 w-4" />} label="SpO₂" value={vitals.spo2} tone="text-violet-500" />
      <VitalChip icon={<Thermometer className="h-4 w-4" />} label="Temp" value={vitals.temp} tone="text-amber-500" />
    </div>
  );
}

function CaseSkeleton() {
  return (
    <div className="card animate-pulse p-5">
      <div className="flex items-start gap-4">
        <div className="h-14 w-14 rounded-full bg-[var(--surface-hover)]" />
        <div className="flex-1 space-y-2">
          <div className="h-5 w-48 rounded bg-[var(--surface-hover)]" />
          <div className="h-4 w-72 rounded bg-[var(--surface-hover)]" />
          <div className="h-4 w-64 rounded bg-[var(--surface-hover)]" />
        </div>
      </div>
    </div>
  );
}

function CaseError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="card p-6 text-center">
      <p className="text-sm font-semibold">Could not load this case</p>
      <p className="mt-1 text-sm text-muted">{message}</p>
      <button
        onClick={onRetry}
        className="mt-4 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-[var(--surface-hover)]"
      >
        Try again
      </button>
    </div>
  );
}

export function CaseLayout() {
  const { id } = useParams();
  const { data: caseData, loading, error, apply, reload } = useCase(id);
  const setCurrentCase = useSetCurrentCase();

  useEffect(() => {
    setCurrentCase(caseData ?? null);
    return () => setCurrentCase(null);
  }, [caseData, setCurrentCase]);

  if (loading) return <CaseSkeleton />;
  if (error) return <CaseError message={error} onRetry={reload} />;
  if (!caseData) return <NotFound />;

  const readOnly = caseData.status === 'Completed' || caseData.status === 'Archived';
  const p = caseData.patient;

  return (
    <div>
      {/* Back */}
      <Link to="/cases" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-[var(--text)]">
        <ArrowLeft className="h-4 w-4" /> Cases
      </Link>

      {/* Patient banner */}
      <div className="card overflow-hidden">
        <div className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <Avatar name={p.name} hue={p.avatarHue} size={56} />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-bold tracking-tight">{p.name}</h1>
                  <StatusBadge status={caseData.status} />
                  <PriorityBadge priority={caseData.priority} />
                </div>
                <p className="mt-1 text-sm text-secondary">
                  {p.age}y · {p.gender} · {p.weight} · {p.height}
                  {p.bmi ? ` · BMI ${p.bmi}` : ''} · {p.bloodType} · {caseData.id}
                </p>
                <p className="mt-2 max-w-2xl text-[15px] font-medium">{caseData.chiefComplaint}</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-brand-600 dark:text-brand-300">
                  <Activity className="h-3.5 w-3.5" />
                  Working impression: {caseData.primaryImpression}
                </p>
              </div>
            </div>
            <div className="lg:text-right">
              <VitalsRow vitals={caseData.vitals} />
            </div>
          </div>

          {readOnly && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200/70 bg-emerald-50/60 px-3 py-2 text-[13px] font-medium text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/8 dark:text-emerald-300">
              <Lock className="h-3.5 w-3.5" />
              This case is completed and archived — records are read-only.
            </div>
          )}
        </div>

        {/* Sub-nav */}
        <div className="flex gap-1 overflow-x-auto border-t px-3">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <NavLink
                key={t.label}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  cn(
                    'flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors',
                    isActive
                      ? 'border-brand-500 text-brand-600 dark:text-brand-300'
                      : 'border-transparent text-muted hover:text-[var(--text)]'
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </NavLink>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <Outlet context={{ caseData, apply, reload } satisfies CaseContext} />
        </div>
        <aside>
          <AssistantPanel caseData={caseData} />
        </aside>
      </div>
    </div>
  );
}
