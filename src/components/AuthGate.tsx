import { useState, type ReactNode } from 'react';
import { isLive } from '../lib/config';
import { isSignedIn } from '../lib/auth';
import { Login } from '../pages/Login';

/** In demo mode (no AWS config) the prototype runs on bundled sample data. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(() => !isLive || isSignedIn());

  if (!authed) return <Login onSignedIn={() => setAuthed(true)} />;
  return <>{children}</>;
}
