import { useEffect, useRef, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { Sparkles, Send, Loader2, LogOut, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LoadingState } from '@/components/common';
import { Transcript } from '@/components/Chat';
import { useCase, useGenerateSummary, usePostConversationMessage, usePostInterviewMessage } from '@/hooks/useCases';

/**
 * Full-screen, locked-down chat: no sidebar, no topbar, no other cases visible.
 * A staff member hands the device to the patient here; there's nothing else
 * to navigate to except "End session".
 */
export function PatientMode() {
  const params = useParams<{ id: string; conversationId?: string }>();
  const caseId = params.id!;
  const conversationId = params.conversationId;
  const [, navigate] = useLocation();
  const { data: caseData, isLoading, error } = useCase(caseId);

  const [input, setInput] = useState('');
  const [complete, setComplete] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const postInterviewMessage = usePostInterviewMessage(caseId);
  const generateSummary = useGenerateSummary(caseId);
  const postConversationMessage = usePostConversationMessage(caseId, conversationId ?? '');

  const conversation = conversationId ? caseData?.conversations?.find((c) => c.id === conversationId) : undefined;
  const messages = conversationId ? conversation?.messages ?? [] : caseData?.interview ?? [];
  const isPending = conversationId ? postConversationMessage.isPending : postInterviewMessage.isPending;
  const canSend = conversationId ? true : caseData?.status === 'AI Interview';

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, isPending]);

  async function send() {
    const text = input.trim();
    if (!text || isPending) return;
    setInput('');
    if (conversationId) {
      await postConversationMessage.mutateAsync(text);
    } else {
      const res = await postInterviewMessage.mutateAsync(text);
      if (res.complete) {
        setComplete(true);
        generateSummary.mutate();
      }
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <LoadingState label="Loading…" />
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background p-8 text-center">
        <p className="text-muted-foreground">{error ? (error as Error).message : 'This session could not be found.'}</p>
        <Button variant="outline" onClick={() => navigate(`/cases/${caseId}`)}>
          <LogOut className="mr-2 h-4 w-4" /> Return to staff view
        </Button>
      </div>
    );
  }

  if (conversationId && !conversation) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background p-8 text-center">
        <p className="text-muted-foreground">This session could not be found.</p>
        <Button variant="outline" onClick={() => navigate(`/cases/${caseId}`)}>
          <LogOut className="mr-2 h-4 w-4" /> Return to staff view
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col bg-background">
      <div className="flex flex-shrink-0 items-center justify-between border-b bg-card px-6 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight">SEHATI</p>
            <p className="text-xs text-muted-foreground">{conversation ? conversation.title : 'Patient interview'}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate(`/cases/${caseId}`)}>
          <LogOut className="mr-2 h-4 w-4" /> End session
        </Button>
      </div>

      <ScrollArea className="flex-1 bg-muted/20 p-6">
        <div ref={scrollRef} className="mx-auto max-w-2xl space-y-6">
          {messages.length === 0 && (
            <div className="py-16 text-center text-sm text-muted-foreground">Starting the conversation…</div>
          )}
          <Transcript messages={messages} />
          {isPending && <p className="text-center text-xs text-muted-foreground">SEHATI is thinking…</p>}
          {!conversationId && complete && (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-500/25 dark:bg-emerald-500/10">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              <p className="text-sm font-medium">Thanks — that's everything I need for now.</p>
              <p className="text-xs text-muted-foreground">Please hand the device back to the staff member.</p>
            </div>
          )}
          {!canSend && !complete && messages.length > 0 && (
            <p className="text-center text-xs text-muted-foreground">This interview has already been completed.</p>
          )}
        </div>
      </ScrollArea>

      {canSend && !complete && (
        <div className="flex-shrink-0 border-t bg-card p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="mx-auto flex max-w-2xl items-center gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your answer…"
              disabled={isPending}
              autoFocus
            />
            <Button type="submit" size="icon" disabled={!input.trim() || isPending} aria-label="Send">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
