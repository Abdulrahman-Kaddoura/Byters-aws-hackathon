import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { ChevronsLeft, ChevronsRight, Sparkles, X } from 'lucide-react';

import { useCase } from '@/hooks/useCases';
import { ChatThread } from '@/components/Chat';
import { GLOBAL_PROMPTS } from '@/data/prompts';
import { PERMISSIONS, useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

/**
 * The case assistant, docked beside the case instead of floating over it.
 *
 * It used to be a fixed 380×520 box pinned to the bottom-right corner. Three
 * things were wrong with that. It covered the case it was discussing, so you
 * couldn't read the tests table while asking about the tests. Of its 520px of
 * height, a header, a permanent band of suggestion chips, an input row and a
 * disclaimer took well over a third, leaving roughly five lines of
 * conversation visible. And it could not be made bigger, so a long clinical
 * answer had nowhere to go but down.
 *
 * So it is now a real panel: a flex sibling of the page content that pushes
 * the workspace aside rather than covering it, draggable from its left edge,
 * with the width remembered between sessions and a one-click wide mode for
 * reading something long. Below `lg` there isn't room to push anything, so it
 * falls back to an overlay with a scrim.
 *
 * (The other half of the fix is in `components/Chat.tsx` and
 * `components/Markdown.tsx`: AI replies now use the full width and render as
 * Markdown. Width without formatting would still have produced a wall of
 * text.)
 */
const MIN_WIDTH = 340;
const MAX_WIDTH = 900;
const DEFAULT_WIDTH = 460;
const WIDE_WIDTH = 760;
const WIDTH_KEY = 'aura.assistant.width';

function storedWidth(): number {
  const raw = Number(localStorage.getItem(WIDTH_KEY));
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_WIDTH;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, raw));
}

export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [dragging, setDragging] = useState(false);
  const [location] = useLocation();

  const match = /^\/cases\/([^/]+)/.exec(location);
  const caseId = match && match[1] !== 'new' ? match[1] : undefined;
  const { data: caseData } = useCase(caseId);
  // Gated on the same permission the server checks for assistantChat.
  const isClinician = useSession().can(PERMISSIONS.assistantChat);

  useEffect(() => setWidth(storedWidth()), []);

  const commitWidth = useCallback((next: number) => {
    const clamped = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next));
    setWidth(clamped);
    localStorage.setItem(WIDTH_KEY, String(clamped));
  }, []);

  // Dragging is tracked on the window rather than the handle so the pointer
  // can outrun the 6px grip without dropping the drag.
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => commitWidth(window.innerWidth - e.clientX);
    const onUp = () => setDragging(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    // Without this the drag selects text across the page it's resizing.
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [dragging, commitWidth]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Only meaningful once a case is open — the backend's assistant endpoint is
  // scoped to one case.
  if (!caseId || !caseData || !isClinician) return null;

  const wide = width >= WIDE_WIDTH;

  return (
    <>
      {open && (
        <>
          {/* Below lg the panel overlays instead of pushing, so it needs a
              scrim to sit on and something to dismiss it with. */}
          <div
            className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px] lg:hidden"
            onClick={() => setOpen(false)}
            aria-hidden
          />

          <aside
            style={{ width }}
            className={cn(
              'fixed inset-y-0 right-0 z-40 flex max-w-[92vw] flex-col border-l bg-card shadow-2xl',
              // `relative`, not `static`: it rejoins the flow at lg, but the
              // resize grip is absolutely positioned against it.
              'lg:relative lg:inset-auto lg:z-auto lg:max-w-none lg:shrink-0 lg:shadow-none',
              dragging && 'select-none'
            )}
          >
            {/* The grip. Pointer-only and hidden below lg, where the panel
                overlays at a fixed width and resizing means nothing. */}
            <div
              onPointerDown={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDoubleClick={() => commitWidth(wide ? DEFAULT_WIDTH : WIDE_WIDTH)}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize assistant panel"
              className={cn(
                'absolute inset-y-0 -left-1 hidden w-2 cursor-col-resize lg:block',
                'after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent',
                'hover:after:bg-primary/40',
                dragging && 'after:bg-primary/60'
              )}
            />

            <header className="flex shrink-0 items-center justify-between gap-2 border-b bg-primary px-4 py-3 text-primary-foreground">
              <div className="flex min-w-0 items-center gap-2">
                <Sparkles className="h-4 w-4 shrink-0" />
                <div className="min-w-0 leading-tight">
                  <p className="text-sm font-semibold">Aura Assistant</p>
                  <p className="truncate text-[11px] opacity-80">
                    {caseData.patient.name} · {caseData.id}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => commitWidth(wide ? DEFAULT_WIDTH : WIDE_WIDTH)}
                  className="hidden rounded p-1 opacity-80 transition-opacity hover:opacity-100 lg:block"
                  aria-label={wide ? 'Narrow the panel' : 'Widen the panel'}
                  title={wide ? 'Narrow the panel' : 'Widen the panel for long answers'}
                >
                  {wide ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded p-1 opacity-80 transition-opacity hover:opacity-100"
                  aria-label="Close assistant"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col px-4 pb-3 pt-4">
              <ChatThread
                caseId={caseData.id}
                seed={
                  caseData.assistantThread.length
                    ? caseData.assistantThread
                    : [
                        {
                          role: 'ai',
                          text: `Hi, I'm ready to help with ${caseData.patient.name}'s case. Ask me anything about it.`,
                          time: 'now',
                        },
                      ]
                }
                suggestions={GLOBAL_PROMPTS}
                placeholder="Ask about this case…"
                compact
              />
            </div>
          </aside>
        </>
      )}

      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
          aria-label="Open Aura assistant"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}
    </>
  );
}
