import { useSyncExternalStore } from 'react';

/**
 * The patient-interview lock.
 *
 * A nurse hands her own device to the patient, so the browser is holding *her*
 * session. Rendering a chrome-less page was never enough: typing `/cases` in
 * the URL bar, or pressing back, exposed the whole caseload. The lock is the
 * routing-level answer — while it is set, every route other than the locked
 * case's patient-mode page redirects back to it (see `KioskGuard` in App.tsx).
 *
 * It lives in `sessionStorage` rather than React state so a refresh, a
 * navigation, or a restored tab cannot clear it. Clearing it requires the
 * admin-set exit password, which is verified server-side (`api.kioskExit`) —
 * a comparison done here would be readable in the shipped bundle.
 *
 * Known limitation: the nurse's ID token is still in `localStorage`, so a
 * patient with devtools could read it. Closing that needs a short-lived
 * interview-scoped token minted per session; the lock stops navigation, not a
 * determined inspection of storage.
 */
const KIOSK_KEY = 'aura.kiosk';

export interface KioskLock {
  caseId: string;
  conversationId?: string;
  startedAt: number;
}

const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function readKioskLock(): KioskLock | null {
  const raw = sessionStorage.getItem(KIOSK_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as KioskLock;
    return parsed?.caseId ? parsed : null;
  } catch {
    return null;
  }
}

export function setKioskLock(caseId: string, conversationId?: string): void {
  const lock: KioskLock = { caseId, conversationId, startedAt: Date.now() };
  sessionStorage.setItem(KIOSK_KEY, JSON.stringify(lock));
  emit();
}

export function clearKioskLock(): void {
  sessionStorage.removeItem(KIOSK_KEY);
  emit();
}

/** The path the locked device is pinned to. */
export function kioskPath(lock: KioskLock): string {
  return lock.conversationId
    ? `/cases/${lock.caseId}/patient-mode/${lock.conversationId}`
    : `/cases/${lock.caseId}/patient-mode`;
}

let cached: KioskLock | null | undefined;
let cachedRaw: string | null = null;

/** `useSyncExternalStore` compares snapshots by identity, so the parsed object
 * is memoised against the raw string — otherwise every render would produce a
 * new object and loop. */
function getSnapshot(): KioskLock | null {
  const raw = sessionStorage.getItem(KIOSK_KEY);
  if (raw !== cachedRaw || cached === undefined) {
    cachedRaw = raw;
    cached = readKioskLock();
  }
  return cached;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab or a devtools edit can change storage under us.
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

export function useKioskLock(): KioskLock | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
