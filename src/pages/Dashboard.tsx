import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Gauge,
  Sparkles,
  User,
  Stethoscope,
  Server,
  Plus,
  FilePenLine,
  Eye,
} from 'lucide-react';
import { useCaseList } from '../hooks/useCases';
import { PageHeader } from '../components/PageHeader';
import { StatTile, SectionHeading } from '../components/ui';
import { InsightCard } from '../components/InsightCard';
import type { Speaker } from '../types';

const ACTOR_ICON: Record<Speaker, typeof User> = {
  patient: User,
  ai: Sparkles,
  doctor: Stethoscope,
  system: Server,
};

export function Dashboard() {
  const navigate = useNavigate();
  const { data: cases } = useCaseList();

  const active = cases.filter((c) => c.status !== 'Completed' && c.status !== 'Archived');
  const completed = cases.filter((c) => c.status === 'Completed' || c.status === 'Archived');
  const highPriority = active.filter((c) => c.priority === 'High');

  const avgConfidence = Math.round(
    active.reduce((sum, c) => {
      const lead = [...c.diagnoses].sort((a, b) => b.confidence - a.confidence)[0];
      return sum + (lead?.confidence ?? 0);
    }, 0) / (active.length || 1)
  );

  const feed = active
    .flatMap((c) =>
      c.recentUpdates
        .slice(0, 1)
        .map((u) => ({ ...u, patient: c.patient.name, id: c.id, hue: c.patient.avatarHue }))
    )
    .slice(0, 6);

  const topInsights = active[0]?.insights.slice(0, 3) ?? [];

  return (
    <div>
      <PageHeader
        title="Good afternoon, Dr. Nolan"
        description="Here's an overview of your clinical workspace. Aura is monitoring every active case."
      />

      {/* Actions */}
      <div className="flex flex-wrap gap-2.5">
        <button onClick={() => navigate('/intake')} className="btn btn-primary">
          <Plus className="h-4 w-4" />
          New Case
        </button>
        <button onClick={() => navigate('/cases')} className="btn btn-outline">
          <FilePenLine className="h-4 w-4" />
          Update Case
        </button>
        <button
          onClick={() => navigate(active[0] ? `/cases/${active[0].id}` : '/cases')}
          className="btn btn-outline"
        >
          <Eye className="h-4 w-4" />
          View Case
        </button>
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
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

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
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
  );
}
