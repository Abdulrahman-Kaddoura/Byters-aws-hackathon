import { useEffect, useRef, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Lock, Send, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LoadingState } from '@/components/common';
import { Transcript } from '@/components/Chat';
import { useGenerateSummary, usePostConversationMessage, usePostInterviewMessage } from '@/hooks/useCases';
import * as api from '@/lib/api';
import { clearKioskLock, readKioskLock, setKioskLock } from '@/lib/kiosk';
import type { ChatMessage } from '@/types';

/**
 * The screen the patient sees while holding the device.
 *
 * Two things make this a kiosk rather than just a chrome-less page:
 *
 * 1. A session-scoped lock (`lib/kiosk.ts`) that pins routing here, so the URL
 *    bar and the back button lead nowhere. Setting it on mount means arriving
 *    by any route locks the device.
 * 2. An exit that costs the admin-set password, checked by the server.
 *
 * The transcript comes from `getInterview` rather than the case record: the
 * device is authenticated as the nurse, and a nurse's case payload has the
 * clinical content stripped out of it server-side.
 */
export function PatientMode() {
  const params = useParams<{ id: string; conversationId?: string }>();
  const caseId = params.id!;
  const conversationId = params.conversationId;
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [input, setInput] = useState('');
  const [complete, setComplete] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [title, setTitle] = useState('Patient interview');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exiting, setExiting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const postInterviewMessage = usePostInterviewMessage(caseId);
  const generateSummary = useGenerateSummary(caseId);
  const postConversationMessage = usePostConversationMessage(caseId, conversationId ?? '');

  const isPending = conversationId ? postConversationMessage.isPending : postInterviewMessage.isPending;
  const canSend = open && !complete;

  // Arriving here locks the device, however the navigation happened.
  useEffect(() => {
    if (!readKioskLock()) setKioskLock(caseId, conversationId);
  }, [caseId, conversationId]);

  // Best-effort hardening on top of the routing lock: full screen removes the
  // URL bar on a tablet, and the unload prompt catches a stray swipe. Neither
  // is load-bearing — the lock is.
  useEffect(() => {
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
    const blockContextMenu = (e: Event) => e.preventDefault();
    const warnOnUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    document.addEventListener('contextmenu', blockContextMenu);
    window.addEventListener('beforeunload', warnOnUnload);
    return () => {
      document.removeEventListener('contextmenu', blockContextMenu);
      window.removeEventListener('beforeunload', warnOnUnload);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getInterview(caseId, conversationId)
      .then((view) => {
        if (cancelled) return;
        setMessages(view.messages);
        setTitle(view.title);
        setOpen(conversationId ? true : view.open);
        setError(null);
      })
      .catch((err) => !cancelled && setError((err as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [caseId, conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, isPending]);

  async function send() {
    const text = input.trim();
    if (!text || isPending) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'patient', text, time: clock() }]);

    try {
      if (conversationId) {
        const res = await postConversationMessage.mutateAsync(text);
        setMessages(res.conversation.messages);
      } else {
        const res = await postInterviewMessage.mutateAsync(text);
        setMessages(res.messages);
        if (res.complete) {
          setComplete(true);
          generateSummary.mutate();
        }
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function onUnlocked() {
    clearKioskLock();
    void document.exitFullscreen?.().catch(() => undefined);
    // The staff member's own view of this case is stale after the interview.
    queryClient.invalidateQueries({ queryKey: ['case', caseId] });
    queryClient.invalidateQueries({ queryKey: ['cases'] });
    navigate(`/cases/${caseId}`);
  }

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <LoadingState label="Loading…" />
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
            <p className="text-xs text-muted-foreground">{title}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setExiting(true)}>
          <Lock className="mr-2 h-4 w-4" /> Staff exit
        </Button>
      </div>

      <ScrollArea className="flex-1 bg-muted/20 p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {error && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </p>
          )}
          {messages.length === 0 && !error && (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Starting the conversation…
            </div>
          )}
          <Transcript messages={messages} />
          {isPending && <p className="text-center text-xs text-muted-foreground">SEHATI is thinking…</p>}
          {!conversationId && complete && (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-500/25 dark:bg-emerald-500/10">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              <p className="text-sm font-medium">Thanks — that's everything I need for now.</p>
              <p className="text-xs text-muted-foreground">
                Please hand the device back to the staff member.
              </p>
            </div>
          )}
          {!canSend && !complete && messages.length > 0 && (
            <p className="text-center text-xs text-muted-foreground">
              This interview has already been completed.
            </p>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {canSend && (
        <div className="flex-shrink-0 border-t bg-card p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
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

      {exiting && <ExitDialog onCancel={() => setExiting(false)} onUnlocked={onUnlocked} />}
    </div>
  );
}

/**
 * The password prompt. The comparison happens on the server — doing it here
 * would put the hospital's exit code in the JavaScript bundle.
 */
function ExitDialog({ onCancel, onUnlocked }: { onCancel: () => void; onUnlocked: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || checking) return;
    setChecking(true);
    setError(null);
    try {
      await api.kioskExit(password);
      onUnlocked();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Incorrect exit password.');
      setPassword('');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-6 shadow-xl"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Lock className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight">Staff exit</p>
            <p className="text-xs text-muted-foreground">Enter the exit password to unlock.</p>
          </div>
        </div>

        <Input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Exit password"
          disabled={checking}
        />

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={checking}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={!password || checking}>
            {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Unlock
          </Button>
        </div>
      </form>
    </div>
  );
}

function clock(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
