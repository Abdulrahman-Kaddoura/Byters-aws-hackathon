// Mirrors the Cognito User Pool password policy exactly
// (infra/stacks/sehati_stack.py: min_length=12, require lower/upper/digit/symbol)
// so users never pass client-side validation and then fail on submit.

export interface PasswordRule {
  key: string;
  label: string;
  test: (pw: string) => boolean;
}

// Cognito's accepted special-character set.
const SYMBOL = /[\^$*.[\]{}()?"!@#%&/\\,><':;|_~`=+-]/;

export const PASSWORD_RULES: PasswordRule[] = [
  { key: 'length', label: 'At least 12 characters', test: (pw) => pw.length >= 12 },
  { key: 'lower', label: 'One lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { key: 'upper', label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { key: 'digit', label: 'One number', test: (pw) => /[0-9]/.test(pw) },
  { key: 'symbol', label: 'One symbol (e.g. ! @ # $ %)', test: (pw) => SYMBOL.test(pw) },
];

export function passwordIssues(pw: string): PasswordRule[] {
  return PASSWORD_RULES.filter((rule) => !rule.test(pw));
}

export function isPasswordValid(pw: string): boolean {
  return passwordIssues(pw).length === 0;
}
