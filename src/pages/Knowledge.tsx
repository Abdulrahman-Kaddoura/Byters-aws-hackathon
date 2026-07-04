import { BookOpen, BookMarked, FileText, GraduationCap, Search } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Badge } from '../components/ui';

const RESOURCES = [
  { type: 'Guideline', icon: BookMarked, tone: 'brand' as const, title: 'ATS/IDSA — Community-acquired Pneumonia', source: 'Am J Respir Crit Care Med · 2019', tag: 'Respiratory' },
  { type: 'Guideline', icon: BookMarked, tone: 'brand' as const, title: 'ESC — Acute & Chronic Heart Failure', source: 'Eur Heart J · 2021', tag: 'Cardiology' },
  { type: 'Guideline', icon: BookMarked, tone: 'brand' as const, title: 'GINA — Global Strategy for Asthma', source: 'Global Initiative for Asthma · 2024', tag: 'Respiratory' },
  { type: 'Guideline', icon: BookMarked, tone: 'brand' as const, title: 'WSES — Jerusalem Guidelines, Acute Appendicitis', source: 'World J Emerg Surg · 2020', tag: 'Surgery' },
  { type: 'Paper', icon: FileText, tone: 'teal' as const, title: 'Diagnostic accuracy of the Alvarado score', source: 'BMJ · 2011', tag: 'Surgery' },
  { type: 'Paper', icon: FileText, tone: 'teal' as const, title: 'SABA overuse and asthma exacerbation risk', source: 'Eur Respir J · 2020', tag: 'Respiratory' },
  { type: 'Textbook', icon: GraduationCap, tone: 'purple' as const, title: "Harrison's Principles of Internal Medicine", source: '21st ed · 2022', tag: 'General' },
  { type: 'Guideline', icon: BookMarked, tone: 'brand' as const, title: 'ADA — Standards of Care in Diabetes', source: 'Diabetes Care · 2024', tag: 'Endocrine' },
  { type: 'Guideline', icon: BookMarked, tone: 'brand' as const, title: 'EAU — Guidelines on Urolithiasis', source: 'European Association of Urology · 2023', tag: 'Urology' },
];

export function Knowledge() {
  return (
    <div>
      <PageHeader
        title="Knowledge Base"
        description="The clinical evidence library Aura draws on when explaining its reasoning."
      />

      <div className="mb-6 rounded-xl border border-dashed bg-[var(--surface-2)] p-4">
        <div className="flex items-start gap-2.5">
          <BookOpen className="mt-0.5 h-4 w-4 text-brand-500" />
          <p className="text-[13px] text-secondary">
            <span className="font-semibold text-[var(--text)]">Prototype placeholder.</span> In the full product this
            is a searchable library of guidelines, papers and textbooks, with every AI recommendation linked back to
            its sources. The entries below are illustrative.
          </p>
        </div>
      </div>

      <div className="relative mb-6 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input placeholder="Search guidelines, papers, textbooks…" className="input pl-9" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {RESOURCES.map((r, i) => {
          const Icon = r.icon;
          return (
            <div key={i} className="card p-4 transition-shadow hover:shadow-lift">
              <div className="flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--bg-subtle)] text-secondary">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <Badge tone={r.tone}>{r.type}</Badge>
              </div>
              <p className="mt-3 text-sm font-semibold leading-snug">{r.title}</p>
              <p className="mt-1 text-xs text-muted">{r.source}</p>
              <div className="mt-3">
                <Badge tone="gray">{r.tag}</Badge>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
