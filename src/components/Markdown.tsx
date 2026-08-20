import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A small, dependency-free Markdown renderer for AI output.
 *
 * The assistant's replies come back as Markdown — headings, numbered lists,
 * bold — and were being rendered as plain text with `whitespace-pre-line`, so a
 * structured answer arrived as an undifferentiated wall with literal `**` and
 * `-` in it. That is most of why long replies felt like endless scrolling: an
 * unformatted answer has to be *read* to be navigated, where a formatted one
 * can be skimmed.
 *
 * Deliberately narrow in scope. It handles what the model actually emits —
 * headings, ordered/unordered lists, fenced and inline code, bold, italic,
 * links, blockquotes and rules — and nothing else. Raw HTML in the source is
 * rendered as text, never as markup: this output is model-generated and partly
 * derived from uploaded documents, so it is never trusted enough for
 * `dangerouslySetInnerHTML`.
 */

/** Inline spans: `code`, **bold**, *italic*, [text](href).
 *
 * One left-to-right pass over the alternatives rather than nested replaces, so
 * the contents of a code span are never re-scanned for emphasis. */
const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)|(\[[^\]]+\]\([^)\s]+\))/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  INLINE.lastIndex = 0;
  while ((match = INLINE.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-i${i++}`;

    if (token.startsWith('`')) {
      out.push(
        <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('**') || token.startsWith('__')) {
      out.push(
        <strong key={key} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('[')) {
      const split = token.indexOf('](');
      const href = token.slice(split + 2, -1);
      const label = token.slice(1, split);
      // Model-supplied hrefs: only http(s) is followed, and never in this tab.
      const safe = /^https?:\/\//i.test(href);
      out.push(
        safe ? (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2"
          >
            {label}
          </a>
        ) : (
          <Fragment key={key}>{label}</Fragment>
        )
      );
    } else {
      out.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { kind: 'p' | 'quote'; lines: string[] }
  | { kind: 'h'; level: number; text: string }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'code'; lines: string[] }
  | { kind: 'hr' };

/** Group lines into blocks. Lists and code fences accumulate; a blank line
 * ends whatever is open. */
function parse(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  let open: Block | null = null;

  const flush = () => {
    if (open) blocks.push(open);
    open = null;
  };

  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];

    if (open?.kind === 'code') {
      if (/^\s*```/.test(line)) flush();
      else open.lines.push(line);
      continue;
    }
    if (/^\s*```/.test(line)) {
      flush();
      open = { kind: 'code', lines: [] };
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flush();
      blocks.push({ kind: 'hr' });
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: 'h', level: heading[1].length, text: heading[2] });
      continue;
    }

    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      if (open?.kind !== 'ul') {
        flush();
        open = { kind: 'ul', items: [] };
      }
      (open as { kind: 'ul'; items: string[] }).items.push(bullet[1]);
      continue;
    }

    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      if (open?.kind !== 'ol') {
        flush();
        open = { kind: 'ol', items: [] };
      }
      (open as { kind: 'ol'; items: string[] }).items.push(numbered[1]);
      continue;
    }

    const quoted = /^\s*>\s?(.*)$/.exec(line);
    if (quoted) {
      if (open?.kind !== 'quote') {
        flush();
        open = { kind: 'quote', lines: [] };
      }
      (open as { kind: 'quote'; lines: string[] }).lines.push(quoted[1]);
      continue;
    }

    // A plain line continues an open paragraph or starts one. A line that
    // wanders in after a list belongs to a new paragraph, not the list item.
    if (open?.kind === 'p') open.lines.push(line);
    else {
      flush();
      open = { kind: 'p', lines: [line] };
    }
  }
  flush();
  return blocks;
}

const HEADING_CLASS: Record<number, string> = {
  1: 'text-[15px] font-semibold',
  2: 'text-[14px] font-semibold',
  3: 'text-[13px] font-semibold',
  4: 'text-[13px] font-semibold',
  5: 'text-[13px] font-semibold',
  6: 'text-[13px] font-semibold',
};

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = parse(text);

  return (
    <div className={cn('space-y-2.5 text-[13px] leading-relaxed', className)}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'h':
            return (
              <p key={i} className={cn('pt-0.5 text-foreground', HEADING_CLASS[b.level])}>
                {renderInline(b.text, `b${i}`)}
              </p>
            );
          case 'ul':
            return (
              <ul key={i} className="space-y-1.5 pl-1">
                {b.items.map((item, j) => (
                  <li key={j} className="flex gap-2.5">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
                    <span className="min-w-0">{renderInline(item, `b${i}-${j}`)}</span>
                  </li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={i} className="space-y-1.5 pl-1">
                {b.items.map((item, j) => (
                  <li key={j} className="flex gap-2.5">
                    <span className="shrink-0 font-semibold tabular-nums text-primary">{j + 1}.</span>
                    <span className="min-w-0">{renderInline(item, `b${i}-${j}`)}</span>
                  </li>
                ))}
              </ol>
            );
          case 'code':
            return (
              <pre
                key={i}
                className="overflow-x-auto rounded-lg border bg-muted/60 p-3 font-mono text-[12px] leading-relaxed"
              >
                {b.lines.join('\n')}
              </pre>
            );
          case 'quote':
            return (
              <blockquote key={i} className="border-l-2 border-primary/40 pl-3 text-muted-foreground">
                {renderInline(b.lines.join(' '), `b${i}`)}
              </blockquote>
            );
          case 'hr':
            return <hr key={i} className="border-t" />;
          default:
            return <p key={i}>{renderInline(b.lines.join(' '), `b${i}`)}</p>;
        }
      })}
    </div>
  );
}
