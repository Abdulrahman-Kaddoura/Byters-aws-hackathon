import { GitBranch, User, Sparkles, Stethoscope, Server } from 'lucide-react';
import { useCaseData } from './CaseLayout';
import { SectionHeading } from '../../components/ui';
import { Timeline } from '../../components/Timeline';

export function TimelineTab() {
  const c = useCaseData();
  return (
    <div className="space-y-5">
      <div className="card p-5">
        <SectionHeading
          icon={<GitBranch className="h-[18px] w-[18px]" />}
          title="Case timeline"
          subtitle="Every step of the diagnostic journey, from intake to resolution"
        />
        <div className="mt-4 flex flex-wrap gap-3 border-t pt-4 text-xs text-muted">
          <LegendDot icon={<User className="h-3 w-3" />} label="Patient" cls="text-brand-500 dark:text-brand-400" />
          <LegendDot icon={<Sparkles className="h-3 w-3" />} label="Aura AI" cls="text-violet-500 dark:text-violet-400" />
          <LegendDot icon={<Stethoscope className="h-3 w-3" />} label="Physician" cls="text-emerald-500 dark:text-emerald-400" />
          <LegendDot icon={<Server className="h-3 w-3" />} label="System" cls="text-slate-400 dark:text-slate-500" />
        </div>
      </div>

      <div className="card p-5 sm:p-6">
        <Timeline events={c.timeline} />
      </div>
    </div>
  );
}

function LegendDot({ icon, label, cls }: { icon: React.ReactNode; label: string; cls: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cls}>{icon}</span>
      {label}
    </span>
  );
}
