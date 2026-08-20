import { useState } from 'react';
import { CheckCircle2, Loader2, AlertTriangle, MessageSquarePlus } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { SectionHeading } from '@/components/common';
import { useSubmitFeedback } from '@/hooks/useCases';

/**
 * The end-of-case feedback form — the only place a doctor rates Aura.
 *
 * It used to sit on the Interview tab beside an audio-upload card, available
 * from the moment a case opened. That collected impressions rather than
 * judgements: how the AI reasoned can only be assessed once you know how the
 * patient actually turned out. So it now appears in exactly one place, at the
 * bottom of the Diagnosis tab, and only after the case is marked resolved. The
 * server enforces the same rule — an open case rejects feedback outright (see
 * backend/sehati/resolvers/feedback.py) — so this isn't a UI convention that
 * another entry point could quietly bypass.
 *
 * (The audio-upload card that lived here is gone. Uploading a consultation
 * recording after the differential is built is too late for it to inform
 * anything, so it moved to a prompt on first open —
 * `components/ConsultationPrompt.tsx`.)
 */
const FEEDBACK_CATEGORIES = ['general', 'diagnosis', 'summary', 'transcription', 'other'] as const;

export function CaseFeedback({ caseId }: { caseId: string }) {
  const submit = useSubmitFeedback(caseId);
  const [text, setText] = useState('');
  const [category, setCategory] = useState<(typeof FEEDBACK_CATEGORIES)[number]>('general');

  function onSubmit() {
    if (!text.trim()) return;
    submit.mutate({ feedback: text.trim(), category }, { onSuccess: () => setText('') });
  }

  return (
    <Card>
      <CardContent className="p-5">
        <SectionHeading
          icon={<MessageSquarePlus className="h-[18px] w-[18px]" />}
          title="How did Aura do on this case?"
          subtitle="Now that you know the outcome — where was the reasoning right, and where was it wrong? This is kept as memory and feeds back into how Aura reasons on future cases."
        />
        <div className="mt-4 space-y-3">
          <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
            <SelectTrigger className="sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FEEDBACK_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            placeholder="e.g. The differential ranked pneumonia third when the chest film made it obvious — the CRP seemed to be weighted too heavily."
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
          />
          <Button size="sm" onClick={onSubmit} disabled={!text.trim() || submit.isPending}>
            {submit.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            Submit feedback
          </Button>
          {submit.isSuccess && (
            <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Thanks — feedback recorded.
            </p>
          )}
          {submit.isError && (
            <p className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-3.5 w-3.5" /> {(submit.error as Error).message}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
