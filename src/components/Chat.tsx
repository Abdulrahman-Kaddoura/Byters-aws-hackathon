import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Send, Sparkles, Stethoscope, User } from 'lucide-react';
import type { ChatMessage, Diagnosis } from '@/types';
import type { SuggestedPrompt } from '@/data/prompts';
import { useAskDiagnosis, useAssistantChat } from '@/hooks/useCases';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Markdown } from '@/components/Markdown';

/**
 * Two message shapes, and which one you get depends on who is speaking — and
 * on what kind of conversation it is.
 *
 * A doctor's question is short; a bubble is right for it. An AI *answer* to a
 * doctor is often several hundred words of structured clinical reasoning, and
 * putting that in a bubble capped at 82% of the container was the single
 * biggest cause of the assistant's endless scrolling — it turned an
 * already-long answer into a column roughly 40 characters wide. So in the
 * assistant and the diagnosis discussion (`rich`), AI replies run the full
 * width and render as Markdown, which is what the model actually emits.
 *
 * The patient interview is the opposite case and keeps plain bubbles. There
 * the AI's turns are one-line questions in a back-and-forth, and a full-width
 * question above a small patient bubble reads as a broken chat rather than a
 * conversation.
 */
function Bubble({ msg, rich }: { msg: ChatMessage; rich?: boolean }) {
  const isDoctor = msg.role === 'doctor';
  const isAI = msg.role === 'ai';
  const AvatarIcon = isAI ? Sparkles : isDoctor ? Stethoscope : User;

  const avatar = (
    <span
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
        isAI && 'border-violet-200 bg-violet-50 text-violet-600 dark:border-violet-500/25 dark:bg-violet-500/15 dark:text-violet-300',
        isDoctor && 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-300',
        msg.role === 'patient' && 'border-primary/20 bg-primary/10 text-primary',
        msg.role === 'system' && 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-500/25 dark:bg-rose-500/15 dark:text-rose-300'
      )}
    >
      <AvatarIcon className="h-3.5 w-3.5" />
    </span>
  );

  if (isAI && rich) {
    return (
      <div className="flex items-start gap-2.5">
        {avatar}
        <div className="min-w-0 flex-1 pt-0.5">
          <Markdown text={msg.text} />
          {msg.time && <span className="mt-1.5 block text-[10px] text-muted-foreground">{msg.time}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex items-start gap-2.5', isDoctor ? 'flex-row-reverse' : 'flex-row')}>
      {avatar}
      <div
        className={cn(
          'max-w-[82%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed',
          isDoctor ? 'rounded-tr-sm bg-primary text-primary-foreground' : 'rounded-tl-sm border bg-muted/50'
        )}
      >
        {msg.text}
        {msg.time && (
          <span className={cn('mt-1 block text-[10px]', isDoctor ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
            {msg.time}
          </span>
        )}
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex items-start gap-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-violet-600 dark:border-violet-500/25 dark:bg-violet-500/15 dark:text-violet-300">
        <Sparkles className="h-3.5 w-3.5" />
      </span>
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border bg-muted/50 px-3.5 py-3">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </div>
  );
}

export function ChatThread({
  caseId,
  diagnosis,
  seed,
  suggestions,
  placeholder = 'Ask Aura anything…',
  compact = false,
}: {
  caseId: string;
  diagnosis?: Diagnosis;
  seed: ChatMessage[];
  suggestions: SuggestedPrompt[];
  placeholder?: string;
  compact?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(seed);
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const askDiagnosis = useAskDiagnosis(caseId);
  const assistantChat = useAssistantChat(caseId);
  const typing = askDiagnosis.isPending || assistantChat.isPending;

  // The server is the record: every turn is persisted (to `assistantThread` or
  // the diagnosis's `discussion`) and the case query is updated from the
  // response. If that arrives with more turns than we hold — a refetch, or a
  // reply sent from another surface — adopt it rather than drifting.
  useEffect(() => {
    setMessages((current) => (seed.length > current.length ? seed : current));
  }, [seed]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typing]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || typing) return;
    const doctorMsg: ChatMessage = { role: 'doctor', text: trimmed, time: 'now' };
    setMessages((m) => [...m, doctorMsg]);
    setInput('');
    setShowSuggestions(false);

    try {
      const aiMessage = diagnosis
        ? (await askDiagnosis.mutateAsync({ question: trimmed, diagnosisId: diagnosis.id })).aiMessage
        : (await assistantChat.mutateAsync(trimmed)).aiMessage;
      setMessages((m) => [...m, aiMessage]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'system', text: `Could not reach Aura: ${(err as Error).message}`, time: 'now' }]);
    }
  }

  // Chips are worth their vertical space while the thread is empty and you
  // need a way in. Once a conversation is running they are just a permanent
  // band eating the room the answers need, so they fold away behind a link.
  const threadStarted = messages.some((m) => m.role === 'doctor');
  const chipsVisible = !threadStarted || showSuggestions;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={scrollRef}
        className={cn('min-h-0 flex-1 space-y-5 overflow-y-auto px-1 py-1', !compact && 'min-h-[320px]')}
      >
        {messages.map((m, i) => (
          <Bubble key={i} msg={m} rich />
        ))}
        {typing && <TypingBubble />}
      </div>

      {chipsVisible && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => send(s.question)}
              disabled={typing}
              className="rounded-full border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-50"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-3 flex items-center gap-2"
      >
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder={placeholder} />
        <Button type="submit" size="icon" disabled={!input.trim() || typing} aria-label="Send message">
          <Send className="h-4 w-4" />
        </Button>
      </form>

      <div className="mt-2 flex items-center justify-between gap-2">
        {threadStarted ? (
          <button
            onClick={() => setShowSuggestions((v) => !v)}
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDown className={cn('h-3 w-3 transition-transform', showSuggestions && 'rotate-180')} />
            Suggested questions
          </button>
        ) : (
          <span />
        )}
        <p className="text-[10px] text-muted-foreground">AI output — confirm anything clinically important</p>
      </div>
    </div>
  );
}

export function Transcript({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className="space-y-4">
      {messages.map((m, i) => (
        <Bubble key={i} msg={m} />
      ))}
    </div>
  );
}
