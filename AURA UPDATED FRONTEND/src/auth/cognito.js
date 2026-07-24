const REGION = import.meta.env.VITE_AWS_REGION;
const CLIENT_ID = import.meta.env.VITE_USER_POOL_CLIENT_ID;
const IDP_URL = `https://cognito-idp.${REGION}.amazonaws.com/`;

export const SESSION_KEY = "aura.session";

async function idpRequest(target, body) {
  const res = await fetch(IDP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || data.__type || "Authentication failed.");
    err.cognitoType = data.__type;
    throw err;
  }
  return data;
}

export async function initiateAuthPassword(username, password) {
  const data = await idpRequest("InitiateAuth", {
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: CLIENT_ID,
    AuthParameters: { USERNAME: username, PASSWORD: password },
  });
  if (!data.AuthenticationResult) {
    // e.g. NEW_PASSWORD_REQUIRED or another challenge — not handled by this demo login.
    throw new Error(`Login requires an extra step (${data.ChallengeName || "unknown challenge"}) not supported by this demo login.`);
  }
  return data.AuthenticationResult;
}

export async function refreshSession(refreshToken) {
  const data = await idpRequest("InitiateAuth", {
    AuthFlow: "REFRESH_TOKEN_AUTH",
    ClientId: CLIENT_ID,
    AuthParameters: { REFRESH_TOKEN: refreshToken },
  });
  return data.AuthenticationResult;
}

export function decodeIdToken(idToken) {
  try {
    const payload = idToken.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(decodeURIComponent(escape(json)));
    const rawGroups = claims["cognito:groups"];
    let groups = [];
    if (Array.isArray(rawGroups)) groups = rawGroups;
    else if (typeof rawGroups === "string") {
      groups = rawGroups.replace(/^\[|\]$/g, "").split(/[\s,]+/).filter(Boolean);
    }
    return { sub: claims.sub, email: claims.email || claims["cognito:username"] || claims.username, groups };
  } catch {
    return { sub: null, email: null, groups: [] };
  }
}

export function saveSession(authResult) {
  const expiresAt = Date.now() + (authResult.ExpiresIn || 3600) * 1000;
  const session = {
    idToken: authResult.IdToken,
    accessToken: authResult.AccessToken,
    refreshToken: authResult.RefreshToken,
    expiresAt,
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export function isExpired(session) {
  return !session || !session.idToken || Date.now() >= session.expiresAt;
}
