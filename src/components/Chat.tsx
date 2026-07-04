import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, Stethoscope, User } from 'lucide-react';
import type { ChatMessage, PatientCase, Diagnosis, Speaker } from '../types';
import { generateAIResponse, type SuggestedPrompt } from '../data/aiResponder';
import { cn } from '../lib/ui';

function Bubble({ msg }: { msg: ChatMessage }) {
  const isDoctor = msg.role === 'doctor';
  const isAI = msg.role === 'ai';
  const isPatient = msg.role === 'patient';

  const AvatarIcon = isAI ? Sparkles : isDoctor ? Stethoscope : User;
  const align = isDoctor ? 'flex-row-reverse' : 'flex-row';

  return (
    <div className={cn('flex items-start gap-2.5', align)}>
      <span
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
          isAI && 'bg-violet-50 text-violet-600 border-violet-200/70 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/25',
          isDoctor && 'bg-emerald-50 text-emerald-600 border-emerald-200/70 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/25',
          isPatient && 'bg-brand-50 text-brand-600 border-brand-200/70 dark:bg-brand-500/15 dark:text-brand-300 dark:border-brand-500/25'
        )}
      >
        <AvatarIcon className="h-3.5 w-3.5" />
      </span>
      <div
        className={cn(
          'max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-line',
          isDoctor
            ? 'bg-brand-500 text-white rounded-tr-sm'
            : 'bg-[var(--surface-2)] border rounded-tl-sm'
        )}
      >
        {msg.text}
        {msg.time && (
          <span className={cn('mt-1 block text-[10px]', isDoctor ? 'text-white/70' : 'text-muted')}>
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
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-violet-50 text-violet-600 border-violet-200/70 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/25">
        <Sparkles className="h-3.5 w-3.5" />
      </span>
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border bg-[var(--surface-2)] px-3.5 py-3">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </div>
  );
}

export function ChatThread({
  caseData,
  diagnosis,
  seed,
  suggestions,
  placeholder = 'Ask Aura anything…',
  compact = false,
}: {
  caseData: PatientCase;
  diagnosis?: Diagnosis;
  seed: ChatMessage[];
  suggestions: SuggestedPrompt[];
  placeholder?: string;
  compact?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(seed);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typing]);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || typing) return;
    const doctorMsg: ChatMessage = { role: 'doctor' as Speaker, text: trimmed, time: 'now' };
    setMessages((m) => [...m, doctorMsg]);
    setInput('');
    setTyping(true);
    timeoutRef.current = setTimeout(
      () => {
        const reply = generateAIResponse(caseData, trimmed, diagnosis);
        setTyping(false);
        setMessages((m) => [...m, { role: 'ai', text: reply, time: 'now' }]);
      },
      850 + Math.min(trimmed.length * 12, 900)
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div
        ref={scrollRef}
        className={cn('flex-1 space-y-4 overflow-y-auto px-1 py-1', compact ? 'min-h-[240px]' : 'min-h-[320px]')}
      >
        {messages.map((m, i) => (
          <Bubble key={i} msg={m} />
        ))}
        {typing && <TypingBubble />}
      </div>

      {/* Suggested prompts */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {suggestions.slice(0, compact ? 3 : 5).map((s, i) => (
          <button
            key={i}
            onClick={() => send(s.question)}
            disabled={typing}
            className="rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-medium text-secondary transition-colors hover:border-brand-400 hover:text-brand-600 disabled:opacity-50"
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-3 flex items-center gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          className="input"
        />
        <button
          type="submit"
          disabled={!input.trim() || typing}
          className="btn btn-primary shrink-0 px-3 disabled:opacity-40"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
      <p className="mt-2 text-center text-[10px] text-muted">
        Simulated assistant · responses are illustrative and not medical advice
      </p>
    </div>
  );
}

// Read-only transcript renderer (used for the AI ↔ patient interview)
export function Transcript({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className="space-y-4">
      {messages.map((m, i) => (
        <Bubble key={i} msg={m} />
      ))}
    </div>
  );
}
