import { Brain, Sparkles, Info } from 'lucide-react';
import { useCaseData } from './CaseLayout';
import { DiagnosisCard } from '../../components/DiagnosisCard';
import { ConfidenceMeter } from '../../components/ui';

export function Differential() {
  const c = useCaseData();
  const ranked = [...c.diagnoses].sort((a, b) => b.confidence - a.confidence);

  return (
    <div className="space-y-5">
      {/* Intro */}
      <div className="card p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-teal-500 text-white">
            <Brain className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Differential diagnosis</h2>
            <p className="mt-0.5 text-sm text-secondary">
              Aura analyzed the intake, interview, examination findings{c.tests.some((t) => t.status === 'completed') ? ' and test results' : ''} to
              rank {ranked.length} candidate diagnoses. Expand any card to see the reasoning, or discuss it directly with Aura.
            </p>
          </div>
        </div>

        {/* Ranking overview */}
        <div className="mt-5 space-y-3 rounded-xl border bg-[var(--surface-2)] p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            <Sparkles className="h-3.5 w-3.5" /> Confidence ranking
          </p>
          {ranked.map((d) => (
            <div key={d.id} className="flex items-center gap-3">
              <span className="w-40 shrink-0 truncate text-[13px] font-medium sm:w-52">{d.name}</span>
              <div className="flex-1">
                <ConfidenceMeter value={d.confidence} height={7} />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-lg border border-dashed px-3 py-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
          <p className="text-[12px] text-muted">
            Confidence reflects how strongly the collected evidence matches each condition. Scores update
            automatically as new findings and results are entered.
          </p>
        </div>
      </div>

      {/* Cards */}
      <div className="space-y-4">
        {ranked.map((d, i) => (
          <DiagnosisCard key={d.id} caseData={c} diagnosis={d} rank={i + 1} />
        ))}
      </div>
    </div>
  );
}
