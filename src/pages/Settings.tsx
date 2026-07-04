import { useState } from 'react';
import { User, Bell, Sparkles, Shield, Palette, ChevronRight } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { SectionHeading } from '../components/ui';
import { cn } from '../lib/ui';

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={cn('relative h-6 w-11 rounded-full transition-colors', on ? 'bg-brand-500' : 'bg-[var(--border-strong)]')}
      role="switch"
      aria-checked={on}
    >
      <span
        className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', on ? 'translate-x-[22px]' : 'translate-x-0.5')}
      />
    </button>
  );
}

function Row({
  title,
  description,
  control,
}: {
  title: string;
  description: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-[13px] text-secondary">{description}</p>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

export function Settings() {
  const [aiSuggestions, setAiSuggestions] = useState(true);
  const [autoSummary, setAutoSummary] = useState(true);
  const [showConfidence, setShowConfidence] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [conservative, setConservative] = useState(false);

  const sections = [
    { icon: User, label: 'Profile', desc: 'Dr. Julia Nolan · Internal Medicine' },
    { icon: Shield, label: 'Privacy & compliance', desc: 'Data handling, audit log, HIPAA' },
    { icon: Palette, label: 'Appearance', desc: 'Theme, density, accessibility' },
  ];

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" description="Manage your workspace preferences. (Prototype — changes are illustrative.)" />

      <div className="card mb-6 divide-y">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <button key={s.label} className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-[var(--surface-hover)]">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--bg-subtle)] text-secondary">
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium">{s.label}</p>
                <p className="text-[13px] text-muted">{s.desc}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted" />
            </button>
          );
        })}
      </div>

      <div className="card p-5">
        <SectionHeading icon={<Sparkles className="h-[18px] w-[18px]" />} title="AI assistant" subtitle="Control how Aura supports your workflow" />
        <div className="mt-2 divide-y">
          <Row
            title="Proactive AI suggestions"
            description="Let Aura surface differentials, tests and insights automatically."
            control={<Toggle on={aiSuggestions} onChange={setAiSuggestions} />}
          />
          <Row
            title="Auto-generate structured summaries"
            description="Convert patient interviews into structured summaries without prompting."
            control={<Toggle on={autoSummary} onChange={setAutoSummary} />}
          />
          <Row
            title="Show confidence scores"
            description="Display numeric confidence on diagnoses and recommendations."
            control={<Toggle on={showConfidence} onChange={setShowConfidence} />}
          />
          <Row
            title="Conservative mode"
            description="Bias Aura toward ruling out dangerous diagnoses and recommending safety-netting."
            control={<Toggle on={conservative} onChange={setConservative} />}
          />
        </div>
      </div>

      <div className="card mt-6 p-5">
        <SectionHeading icon={<Bell className="h-[18px] w-[18px]" />} title="Notifications" subtitle="How you hear about case updates" />
        <div className="mt-2 divide-y">
          <Row
            title="Critical result alerts"
            description="Get notified when a red-flag result arrives on any case."
            control={<Toggle on={notifications} onChange={setNotifications} />}
          />
        </div>
      </div>
    </div>
  );
}
