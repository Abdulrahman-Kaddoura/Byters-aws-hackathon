import { Link } from 'react-router-dom';
import {
  FolderKanban,
  AlertTriangle,
  CheckCircle2,
  Gauge,
  ArrowRight,
  Sparkles,
  User,
  Stethoscope,
  Server,
  ListChecks,
} from 'lucide-react';
import { CASES } from '../data/cases';
import { PageHeader } from '../components/PageHeader';
import { StatTile, SectionHeading, Avatar } from '../components/ui';
import { CaseCard } from '../components/CaseCard';
import { InsightCard } from '../components/InsightCard';
import { StatusBadge } from '../components/badges';
import { STATUS_META } from '../data/helpers';
import { cn, TONE_DOT } from '../lib/ui';
import type { CaseStatus, Speaker } from '../types';

const active = CASES.filter((c) => c.status !== 'Completed' && c.status !== 'Archived');
const completed = CASES.filter((c) => c.status === 'Completed' || c.status === 'Archived');
const highPriority = active.filter((c) => c.priority === 'High');

const avgConfidence = Math.round(
  active.reduce((sum, c) => {
    const lead = [...c.diagnoses].sort((a, b) => b.confidence - a.confidence)[0];
    return sum + (lead?.confidence ?? 0);
  }, 0) / (active.length || 1)
);

// Curated activity feed pulled from the most recent case updates.
const feed = active
  .flatMap((c) =>
    c.recentUpdates.slice(0, 1).map((u) => ({ ...u, patient: c.patient.name, id: c.id, hue: c.patient.avatarHue }))
  )
  .slice(0, 6);

// Status distribution
const statusCounts = active.reduce<Record<string, number>>((acc, c) => {
  acc[c.status] = (acc[c.status] || 0) + 1;
  return acc;
}, {});

const ACTOR_ICON: Record<Speaker, typeof User> = {
  patient: User,
  ai: Sparkles,
  doctor: Stethoscope,
  system: Server,
};

export function Dashboard() {
  const topInsights = active[0]?.insights.slice(0, 3) ?? [];

  return (
    <div>
      <PageHeader
        title="Good afternoon, Dr. Nolan"
        description="Here's an overview of your clinical workspace. Aura is monitoring every active case."
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Active cases"
          value={active.length}
          sub="Across all stages"
          tone="brand"
          icon={<FolderKanban className="h-5 w-5" />}
        />
        <StatTile
          label="High priority"
          value={highPriority.length}
          sub="Need attention"
          tone="red"
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <StatTile
          label="Avg AI confidence"
          value={`${avgConfidence}%`}
          sub="Leading diagnoses"
          tone="teal"
          icon={<Gauge className="h-5 w-5" />}
        />
        <StatTile
          label="Completed"
          value={completed.length}
          sub="This week"
          tone="green"
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Left: active cases */}
        <div>
          <SectionHeading
            title="Active cases"
            subtitle="Cases currently moving through the diagnostic workflow"
            action={
              <Link to="/cases" className="btn btn-ghost text-xs">
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {active.map((c) => (
              <CaseCard key={c.id} caseData={c} />
            ))}
          </div>

          {/* Status distribution */}
          <div className="card mt-6 p-5">
            <SectionHeading
              icon={<ListChecks className="h-[18px] w-[18px]" />}
              title="Caseload by stage"
              subtitle="Distribution of active cases across workflow statuses"
            />
            <div className="mt-4 space-y-3">
              {Object.entries(statusCounts).map(([status, count]) => {
                const meta = STATUS_META[status as CaseStatus];
                const pct = Math.round((count / active.length) * 100);
                return (
                  <div key={status} className="flex items-center gap-3">
                    <div className="flex w-44 shrink-0 items-center gap-2">
                      <span className={cn('h-2 w-2 rounded-full', TONE_DOT[meta.tone])} />
                      <span className="truncate text-[13px] font-medium">{meta.label}</span>
                    </div>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                      <div
                        className={cn('h-full rounded-full', TONE_DOT[meta.tone])}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-secondary">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: insights + activity */}
        <div className="space-y-6">
          <div className="card p-5">
            <SectionHeading
              icon={<Sparkles className="h-[18px] w-[18px]" />}
              title="AI insights"
              subtitle="Aura's proactive observations"
            />
            <div className="mt-4 space-y-2.5">
              {topInsights.map((ins, i) => (
                <InsightCard key={i} insight={ins} />
              ))}
            </div>
          </div>

          <div className="card p-5">
            <SectionHeading title="Recent activity" subtitle="Latest updates across your cases" />
            <ul className="mt-4 space-y-3">
              {feed.map((f, i) => {
                const Icon = ACTOR_ICON[f.actor];
                return (
                  <li key={i}>
                    <Link
                      to={`/cases/${f.id}`}
                      className="group flex items-start gap-3 rounded-lg p-1.5 transition-colors hover:bg-[var(--surface-hover)]"
                    >
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--bg-subtle)] text-secondary">
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] leading-snug">{f.text}</p>
                        <p className="mt-0.5 text-[11px] text-muted">
                          {f.patient} · {f.time}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
