import { useState } from 'react';
import { Stethoscope, Check, SkipForward, StickyNote, Sparkles, CircleCheck, Circle, Plus, X, Loader2 } from 'lucide-react';
import type { ExamRecommendation, PatientCase } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { SectionHeading, EmptyState } from '@/components/common';
import { FlagBadge } from '@/components/badges';
import { IMPORTANCE_META, toneVariant } from '@/data/helpers';
import { useAddCustomExam, useRecommendExams, useRecordExamFinding } from '@/hooks/useCases';
import { cn } from '@/lib/utils';

function ExamItem({ exam, caseId }: { exam: ExamRecommendation; caseId: string }) {
  const [finding, setFinding] = useState(exam.finding ?? '');
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState(exam.note ?? '');
  const recordFinding = useRecordExamFinding(caseId);
  const imp = IMPORTANCE_META[exam.importance] ?? { tone: 'gray' as const };

  function persist(status: 'complete' | 'skipped') {
    recordFinding.mutate({ examId: exam.id, patch: { finding, note, status } });
  }

  return (
    <div className={cn('rounded-xl border bg-card p-4 transition-colors', exam.status === 'skipped' && 'opacity-60')}>
      <div className="flex items-start gap-3">
        <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full', exam.status === 'complete' ? 'text-emerald-500' : 'text-muted-foreground')}>
          {exam.status === 'complete' ? <CircleCheck className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold">{exam.name}</h4>
            {exam.custom ? (
              <Badge variant="outline">Added by you</Badge>
            ) : (
              <Badge variant={toneVariant(imp.tone)}>{exam.importance}</Badge>
            )}
            {exam.status === 'complete' && exam.flag && <FlagBadge flag={exam.flag} />}
            {exam.status === 'skipped' && <Badge variant="secondary">Skipped</Badge>}
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">{exam.reason}</p>

          {!exam.custom && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">AI relevance</span>
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${exam.confidence}%` }} />
              </div>
              <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">{exam.confidence}%</span>
            </div>
          )}

          {exam.status === 'complete' ? (
            <div className="mt-3 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">Finding</p>
                  <p className="text-sm font-semibold">{finding || '—'}</p>
                </div>
                {exam.normalRange && (
                  <div className="text-right">
                    <p className="text-[11px] font-medium text-muted-foreground">Normal range</p>
                    <p className="text-[13px] text-muted-foreground">{exam.normalRange}</p>
                  </div>
                )}
              </div>
              {note && <p className="mt-2 border-t pt-2 text-[13px] italic text-muted-foreground">{note}</p>}
            </div>
          ) : exam.status === 'pending' ? (
            <div className="mt-3 space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input value={finding} onChange={(e) => setFinding(e.target.value)} placeholder="Enter finding…" />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => persist('complete')} disabled={recordFinding.isPending} className="shrink-0">
                    {recordFinding.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-emerald-600" />} Complete
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => persist('skipped')} disabled={recordFinding.isPending} className="shrink-0 text-muted-foreground">
                    <SkipForward className="h-3.5 w-3.5" /> Skip
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setNoteOpen((o) => !o)} className="shrink-0 px-2.5" aria-label="Add note">
                    <StickyNote className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {noteOpen && <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Add a note…" />}
            </div>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => persist('complete')} className="mt-2 px-2 py-1 text-xs">
              <X className="h-3.5 w-3.5" /> Undo skip
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** The form for an examination Aura didn't recommend.
 *
 * A doctor examines the patient in front of them, not the one in the model's
 * prompt. This records what they actually did — and since it describes
 * something that has already happened, it lands complete, with its finding. */
function CustomExamForm({ caseId }: { caseId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [finding, setFinding] = useState('');
  const addExam = useAddCustomExam(caseId);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> Add an exam I performed
      </Button>
    );
  }

  async function submit() {
    if (!name.trim()) return;
    await addExam.mutateAsync({ name: name.trim(), finding: finding.trim() || undefined });
    setName('');
    setFinding('');
    setOpen(false);
  }

  return (
    <div className="w-full space-y-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Examination performed by you
        </p>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpen(false)} aria-label="Cancel">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Examination (e.g. Kernig's sign)" autoFocus />
      <Input value={finding} onChange={(e) => setFinding(e.target.value)} placeholder="Finding" />
      <Button size="sm" onClick={submit} disabled={!name.trim() || addExam.isPending}>
        {addExam.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Record finding
      </Button>
      {addExam.isError && (
        <p className="text-xs text-rose-600 dark:text-rose-400">{(addExam.error as Error).message}</p>
      )}
    </div>
  );
}

export function CaseExamination({ caseData: c }: { caseData: PatientCase }) {
  const recommend = useRecommendExams(c.id);
  const hasExams = c.exams.length > 0;

  if (!hasExams) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-20 text-center">
        <EmptyState
          icon={<Stethoscope className="h-6 w-6" />}
          title="No Examinations Recommended Yet"
          description="Ask Aura which physical examinations matter for this case, or record one you've already performed."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button onClick={() => recommend.mutate()} disabled={recommend.isPending}>
                {recommend.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Get AI exam recommendations
              </Button>
              <CustomExamForm caseId={c.id} />
            </div>
          }
        />
        {recommend.isError && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{(recommend.error as Error).message}</p>}
      </div>
    );
  }

  const pendingExams = c.exams.filter((e) => e.status === 'pending');
  const completedExams = c.exams.filter((e) => e.status !== 'pending');

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5">
          <SectionHeading
            icon={<Stethoscope className="h-[18px] w-[18px]" />}
            title="Physical Examination"
            subtitle="Targeted examination maneuvers recommended by Aura based on the clinical presentation."
            action={
              <Badge variant="brand">
                {completedExams.length}/{c.exams.length} complete
              </Badge>
            }
          />
          <div className="mt-4 flex flex-wrap items-start gap-2 border-t pt-4">
            <Button variant="outline" size="sm" onClick={() => recommend.mutate()} disabled={recommend.isPending}>
              {recommend.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Ask Aura for more exams
            </Button>
            <CustomExamForm caseId={c.id} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <h3 className="flex items-center gap-2 font-medium">
            Pending Recommendations <Badge variant="secondary">{pendingExams.length}</Badge>
          </h3>
          {pendingExams.length === 0 && <div className="rounded-lg border border-dashed bg-muted/20 p-8 text-center text-muted-foreground">All recommended examinations completed.</div>}
          {pendingExams.map((exam) => (
            <ExamItem key={exam.id} exam={exam} caseId={c.id} />
          ))}
        </div>

        <div className="space-y-4">
          <h3 className="flex items-center gap-2 font-medium text-muted-foreground">
            Findings <Badge variant="outline">{completedExams.length}</Badge>
          </h3>
          {completedExams.map((exam) => (
            <ExamItem key={exam.id} exam={exam} caseId={c.id} />
          ))}
        </div>
      </div>
    </div>
  );
}
