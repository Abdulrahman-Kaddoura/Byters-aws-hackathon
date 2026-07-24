import { loadSession, isExpired, clearSession } from "../auth/cognito.js";

const BASE = import.meta.env.VITE_API_URL || "";

export class ApiError extends Error {
  constructor(status, errorType, message, details) {
    super(message || errorType || "Request failed");
    this.status = status;
    this.errorType = errorType;
    this.details = details || {};
  }
}

export class AuthExpiredError extends Error {
  constructor() {
    super("Your session has expired. Please log in again.");
  }
}

export async function request(path, { method = "GET", body, query } = {}) {
  const session = loadSession();
  if (!session) throw new AuthExpiredError();
  if (isExpired(session)) {
    clearSession();
    throw new AuthExpiredError();
  }

  let url = BASE.replace(/\/$/, "") + "/" + path.replace(/^\//, "");
  if (query && Object.keys(query).length) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") params.set(k, v);
    });
    const qs = params.toString();
    if (qs) url += "?" + qs;
  }

  const headers = { Authorization: session.idToken };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  if (!res.ok) {
    throw new ApiError(res.status, data.errorType, data.message, data.details);
  }
  return data;
}
