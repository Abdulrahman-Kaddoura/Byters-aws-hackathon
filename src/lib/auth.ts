import { config } from './config';

const STORAGE_KEY = 'aura.session';
const IDP_TARGET = 'AWSCognitoIdentityProviderService';

export interface Session {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface Identity {
  sub: string;
  username: string;
  email?: string;
  groups: string[];
}

/** A first-login challenge: the user must set a permanent password to continue. */
export class NewPasswordRequired extends Error {
  constructor(readonly session: string, readonly username: string) {
    super('A new password is required for this account.');
    this.name = 'NewPasswordRequired';
  }
}

export class AuthError extends Error {}

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
    throw new AuthError(data.message || `Cognito ${action} failed (${res.status}).`);
  }
  return data;
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

export function signOut(): void {
  localStorage.removeItem(STORAGE_KEY);
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

export function currentIdentity(): Identity | null {
  const session = load();
  if (!session) return null;
  const claims = decodeJwt(session.idToken);
  if (!claims?.sub) return null;

  const raw = claims['cognito:groups'];
  return {
    sub: claims.sub,
    username: claims['cognito:username'] ?? claims.sub,
    email: claims.email,
    groups: Array.isArray(raw) ? raw : raw ? [raw] : [],
  };
}

export function isSignedIn(): boolean {
  return load() !== null;
}

function decodeJwt(token: string): any | null {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(payload))));
  } catch {
    return null;
  }
}
