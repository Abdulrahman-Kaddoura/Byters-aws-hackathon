import { useState, type ReactNode } from 'react';
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  Calculator,
  Gauge,
  ShieldAlert,
  ArrowRight,
  FlaskConical,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Sparkles,
  BookMarked,
  History,
} from 'lucide-react';
import type { PatientCase, Diagnosis } from '@/types';
import { ConfidenceRing } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { PriorityBadge } from '@/components/badges';
import { ConfidenceTrendChart } from '@/components/charts';
import { ReferenceCard, SimilarCaseCard } from '@/components/Evidence';
import { ChatThread } from '@/components/Chat';
import { diagnosisPrompts } from '@/data/prompts';
import { useAcceptRecommendation, useRejectRecommendation } from '@/hooks/useCases';
import { cn, confidenceHex } from '@/lib/utils';

export type DetailTab = 'explanation' | 'evidence' | 'discussion';

function Block({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <h4 className="text-sm font-semibold">{title}</h4>
      </div>
      <div className="text-[13px] leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

function EvidenceLines({ items, tone }: { items: string[]; tone: 'pos' | 'neg' | 'missing' }) {
  const Icon = tone === 'pos' ? CheckCircle2 : tone === 'neg' ? XCircle : HelpCircle;
  const color = tone === 'pos' ? 'text-emerald-500' : tone === 'neg' ? 'text-rose-500' : 'text-amber-500';
  if (!items.length) return <p className="text-[13px] text-muted-foreground">None recorded.</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2 text-[13px]">
          <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', color)} />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function DoctorFeedback({ caseId, diagnosisId }: { caseId: string; diagnosisId: string }) {
  const [vote, setVote] = useState<'up' | 'down' | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  const accept = useAcceptRecommendation(caseId);
  const reject = useRejectRecommendation(caseId);

  async function record(next: 'up' | 'down', reason?: string) {
    setVote(next);
    if (next === 'up') {
      await accept.mutateAsync({ targetId: diagnosisId, targetType: 'diagnosis', reason });
    } else {
      await reject.mutateAsync({ targetId: diagnosisId, targetType: 'diagnosis', reason: reason || 'Doctor disagrees' });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">Your feedback:</span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => record('up')}
        className={cn(vote === 'up' && 'border-emerald-400 text-emerald-600 dark:text-emerald-400')}
      >
        <ThumbsUp className="h-3.5 w-3.5" /> Agree
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setNoteOpen((o) => !o)}
        className={cn(vote === 'down' && 'border-rose-400 text-rose-600 dark:text-rose-400')}
      >
        <ThumbsDown className="h-3.5 w-3.5" /> Disagree
      </Button>
      <Button variant="outline" size="sm" onClick={() => setNoteOpen((o) => !o)}>
        <MessageSquare className="h-3.5 w-3.5" /> Add note
      </Button>
      {vote && !noteOpen && <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Feedback recorded · Aura will factor this in</span>}
      {noteOpen && (
        <div className="mt-2 w-full">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Add a clinical note for this diagnosis…" />
          <div className="mt-2 flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => {
                void record(vote ?? 'down', note);
                setSaved(true);
                setNoteOpen(false);
              }}
            >
              Save note
            </Button>
            {saved && <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export function DiagnosisDetail({
  caseData,
  diagnosis,
  initialTab = 'explanation',
}: {
  caseData: PatientCase;
  diagnosis: Diagnosis;
  initialTab?: DetailTab;
}) {
  const [tab, setTab] = useState<DetailTab>(initialTab);
  const tabs: { key: DetailTab; label: string; icon: typeof Sparkles }[] = [
    { key: 'explanation', label: 'Explanation', icon: Gauge },
    { key: 'evidence', label: 'Evidence', icon: BookMarked },
    { key: 'discussion', label: 'Discuss with AI', icon: Sparkles },
  ];

  return (
    <div>
      <div className="flex items-center gap-4 rounded-xl border bg-muted/30 p-4">
        <ConfidenceRing value={diagnosis.confidence} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <PriorityBadge priority={diagnosis.priority} />
            <Badge variant="secondary">{diagnosis.category}</Badge>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">{diagnosis.tagline}</p>
        </div>
      </div>

      <div className="mt-4 flex gap-1 border-b">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="pt-5">
        {tab === 'explanation' && (
          <div className="space-y-6">
            <Block icon={<Sparkles className="h-4 w-4" />} title="Why Aura thinks this fits">
              {diagnosis.reasoning}
            </Block>

            <div className="grid gap-5 sm:grid-cols-2">
              <Block icon={<CheckCircle2 className="h-4 w-4" />} title="Positive evidence">
                <EvidenceLines items={diagnosis.supporting} tone="pos" />
              </Block>
              <Block icon={<XCircle className="h-4 w-4" />} title="Contradicting / negative evidence">
                <EvidenceLines items={diagnosis.contradicting} tone="neg" />
              </Block>
            </div>

            <Block icon={<HelpCircle className="h-4 w-4" />} title="Missing information">
              <EvidenceLines items={diagnosis.missing} tone="missing" />
            </Block>

            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-semibold">Confidence over time</h4>
                </div>
                <span className="text-sm font-bold tabular-nums" style={{ color: confidenceHex(diagnosis.confidence) }}>
                  {diagnosis.confidence}%
                </span>
              </div>
              <ConfidenceTrendChart data={diagnosis.trend} color={confidenceHex(diagnosis.confidence)} />
            </div>

            <Block icon={<Calculator className="h-4 w-4" />} title="How confidence was calculated">
              {diagnosis.confidenceExplanation}
            </Block>
            <Block icon={<Gauge className="h-4 w-4" />} title="Why confidence isn't 100%">
              {diagnosis.whyNot100}
            </Block>
            <Block icon={<ShieldAlert className="h-4 w-4" />} title="Risk assessment">
              {diagnosis.riskAssessment}
            </Block>

            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="mb-1.5 flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-semibold text-primary">Suggested next action</h4>
              </div>
              <p className="text-[13px] leading-relaxed text-foreground/80">{diagnosis.nextAction}</p>
            </div>

            <Block icon={<FlaskConical className="h-4 w-4" />} title="Recommended tests">
              <div className="flex flex-wrap gap-1.5">
                {diagnosis.recommendedTests.map((t, i) => (
                  <Badge key={i} variant="secondary">
                    {t}
                  </Badge>
                ))}
              </div>
            </Block>

            <div className="h-px bg-border" />
            <DoctorFeedback caseId={caseData.id} diagnosisId={diagnosis.id} />
          </div>
        )}

        {tab === 'evidence' && (
          <div className="space-y-6">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <BookMarked className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-semibold">Guidelines, papers & textbook references</h4>
              </div>
              {diagnosis.references.length ? (
                <div className="space-y-2.5">
                  {diagnosis.references.map((r, i) => (
                    <ReferenceCard key={i} reference={r} />
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-muted-foreground">No references attached to this diagnosis.</p>
              )}
            </div>
            <div>
              <div className="mb-3 flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-semibold">Similar historical cases</h4>
              </div>
              {diagnosis.similarCases.length ? (
                <div className="space-y-2.5">
                  {diagnosis.similarCases.map((s, i) => (
                    <SimilarCaseCard key={i} item={s} />
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-muted-foreground">No close historical match on file.</p>
              )}
            </div>
          </div>
        )}

        {tab === 'discussion' && (
          <div>
            <p className="mb-3 text-[13px] text-muted-foreground">
              Ask Aura to justify its reasoning for <span className="font-semibold text-foreground">{diagnosis.name}</span>. It will explain rather than
              simply answer.
            </p>
            <ChatThread
              caseId={caseData.id}
              diagnosis={diagnosis}
              seed={
                diagnosis.discussion.length
                  ? diagnosis.discussion
                  : [
                      {
                        role: 'ai',
                        text: `I'm ready to discuss ${diagnosis.name}. Ask me why I'm considering it, what evidence supports or weakens it, or what would change my confidence.`,
                        time: 'now',
                      },
                    ]
              }
              suggestions={diagnosisPrompts(diagnosis)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
