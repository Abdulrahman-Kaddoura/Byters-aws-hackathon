import { useState } from 'react';
import { Check, Eye, EyeOff } from 'lucide-react';
import { cn } from '../lib/ui';
import { PASSWORD_RULES } from '../lib/passwordPolicy';

export function PasswordField({
  label,
  value,
  onChange,
  autoFocus,
  autoComplete = 'current-password',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-secondary">{label}</span>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          required
          className="w-full rounded-lg border bg-[var(--surface)] px-3 py-2 pr-10 text-sm outline-none focus:border-brand-500"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-[var(--text)]"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </label>
  );
}

export function PasswordRequirements({ password }: { password: string }) {
  return (
    <ul className="mt-1.5 space-y-1 text-[12px] text-muted">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password);
        return (
          <li
            key={rule.key}
            className={cn('flex items-center gap-1.5', met && 'text-emerald-600 dark:text-emerald-400')}
          >
            {met ? (
              <Check className="h-3 w-3 shrink-0" />
            ) : (
              <span className="inline-block h-3 w-3 shrink-0 rounded-full border border-current" />
            )}
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}
