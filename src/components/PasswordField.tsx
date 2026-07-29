import { useState } from 'react';
import { Check, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PASSWORD_RULES } from '@/lib/passwordPolicy';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

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
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="relative">
        <Input
          type={visible ? 'text' : 'password'}
          value={value}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          required
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export function PasswordRequirements({ password }: { password: string }) {
  return (
    <ul className="mt-1.5 space-y-1 text-[12px] text-muted-foreground">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password);
        return (
          <li key={rule.key} className={cn('flex items-center gap-1.5', met && 'text-emerald-600 dark:text-emerald-400')}>
            {met ? <Check className="h-3 w-3 shrink-0" /> : <span className="inline-block h-3 w-3 shrink-0 rounded-full border border-current" />}
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}
