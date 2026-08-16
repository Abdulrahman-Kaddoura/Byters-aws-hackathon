import { config } from './config';

const STORAGE_KEY = 'aura.session';
const IDP_TARGET = 'AWSCognitoIdentityProviderService';

export interface Session {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

// NOTE: there is deliberately no `currentIdentity()` here any more.
// Reading `cognito:groups` out of the ID token is what let the UI disagree
// with the backend about access — the server gates on fine-grained
// permissions that the claim knows nothing about. Ask the server instead:
// `useSession()` in lib/session.tsx, backed by GET /me.

/** A first-login challenge: the user must set a permanent password to continue. */
export class NewPasswordRequired extends Error {
  constructor(readonly session: string, readonly username: string) {
    super('A new password is required for this account.');
    this.name = 'NewPasswordRequired';
  }
}

export class AuthError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = 'AuthError';
  }
}

async function idp(action: string, payload: unknown): Promise<any> {
  const res = await fetch(`https://cognito-idp.${config.region}.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `${IDP_TARGET}.${action}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = typeof data.__type === 'string' ? data.__type.split('#').pop() : undefined;
    throw new AuthError(data.message || `Cognito ${action} failed (${res.status}).`, code);
  }
  return data;
}

/** Plain-language copy for Cognito error codes, for non-technical users. */
export function describeAuthError(err: unknown): string {
  const code = err instanceof AuthError ? err.code : undefined;
  switch (code) {
    case 'CodeMismatchException':
      return "That code doesn't match. Check the code and try again.";
    case 'ExpiredCodeException':
      return 'This code has expired. Request a new one below.';
    case 'LimitExceededException':
    case 'TooManyRequestsException':
    case 'TooManyFailedAttemptsException':
      return 'Too many attempts. Please wait a few minutes and try again.';
    case 'InvalidParameterException':
      return "We can't send a reset code for this account. Please contact your administrator.";
    case 'InvalidPasswordException':
      return "That password doesn't meet the requirements below.";
    case 'NotAuthorizedException':
      return 'Incorrect email/username or password.';
    default:
      return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
  }
}

function persist(result: any): Session {
  const session: Session = {
    idToken: result.IdToken,
    accessToken: result.AccessToken,
    // A refresh-token grant does not return a new refresh token; keep the old one.
    refreshToken: result.RefreshToken ?? load()?.refreshToken ?? '',
    expiresAt: Date.now() + (result.ExpiresIn ?? 3600) * 1000,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

function load(): Session | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

// Sign-out happens from several places (the topbar, a 401 from lib/api, an
// expired refresh token). Without a notification the app shell stayed mounted
// on a dead session and every subsequent request failed with 401 — so
// subscribers get told and can re-render to the sign-in screen.
const signOutListeners = new Set<() => void>();

export function onSignOut(listener: () => void): () => void {
  signOutListeners.add(listener);
  return () => signOutListeners.delete(listener);
}

export function signOut(): void {
  localStorage.removeItem(STORAGE_KEY);
  signOutListeners.forEach((listener) => listener());
}

export async function signIn(username: string, password: string): Promise<Session> {
  const data = await idp('InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: config.userPoolClientId,
    AuthParameters: { USERNAME: username, PASSWORD: password },
  });

  if (data.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
    throw new NewPasswordRequired(data.Session, username);
  }
  if (!data.AuthenticationResult) {
    throw new AuthError(`Unsupported sign-in challenge: ${data.ChallengeName ?? 'unknown'}.`);
  }
  return persist(data.AuthenticationResult);
}

export async function completeNewPassword(
  challenge: NewPasswordRequired,
  newPassword: string
): Promise<Session> {
  const data = await idp('RespondToAuthChallenge', {
    ChallengeName: 'NEW_PASSWORD_REQUIRED',
    ClientId: config.userPoolClientId,
    Session: challenge.session,
    ChallengeResponses: { USERNAME: challenge.username, NEW_PASSWORD: newPassword },
  });
  if (!data.AuthenticationResult) {
    throw new AuthError('Password was set but no tokens were returned.');
  }
  return persist(data.AuthenticationResult);
}

/** Starts the self-service reset flow; Cognito emails a confirmation code. */
export async function forgotPassword(username: string): Promise<{ destination?: string }> {
  const data = await idp('ForgotPassword', {
    ClientId: config.userPoolClientId,
    Username: username,
  });
  return { destination: data.CodeDeliveryDetails?.Destination };
}

/** Completes the self-service reset flow with the emailed code and a new password. */
export async function confirmForgotPassword(
  username: string,
  confirmationCode: string,
  newPassword: string
): Promise<void> {
  await idp('ConfirmForgotPassword', {
    ClientId: config.userPoolClientId,
    Username: username,
    ConfirmationCode: confirmationCode,
    Password: newPassword,
  });
}

/** Returns a valid ID token, refreshing it when close to expiry. */
export async function getIdToken(): Promise<string | null> {
  const session = load();
  if (!session) return null;

  if (Date.now() < session.expiresAt - 60_000) return session.idToken;
  if (!session.refreshToken) {
    signOut();
    return null;
  }

  try {
    const data = await idp('InitiateAuth', {
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: config.userPoolClientId,
      AuthParameters: { REFRESH_TOKEN: session.refreshToken },
    });
    return persist(data.AuthenticationResult).idToken;
  } catch {
    signOut();
    return null;
  }
}

export function isSignedIn(): boolean {
  const session = load();
  // A stored session whose refresh token is gone or whose expiry has passed is
  // not a session: booting the app on one just fails on the first request.
  if (!session) return false;
  if (Date.now() < session.expiresAt) return true;
  return Boolean(session.refreshToken);
}
