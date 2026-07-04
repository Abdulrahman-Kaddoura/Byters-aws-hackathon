import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/ui';

export function Expandable({
  title,
  subtitle,
  icon,
  defaultOpen = false,
  right,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  defaultOpen?: boolean;
  right?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card-flat overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-hover)]"
      >
        {icon && <span className="text-brand-500 shrink-0">{icon}</span>}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          {subtitle && <p className="mt-0.5 text-xs text-secondary">{subtitle}</p>}
        </div>
        {right}
        <ChevronDown
          className={cn('h-4 w-4 text-muted transition-transform duration-200', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="animate-fade-in border-t px-4 py-4 text-sm">{children}</div>
      )}
    </div>
  );
}
