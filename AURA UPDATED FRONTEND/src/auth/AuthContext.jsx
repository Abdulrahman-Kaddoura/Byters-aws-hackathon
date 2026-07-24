import { createContext, useContext, useState, useCallback, useEffect } from "react";
import {
  initiateAuthPassword, decodeIdToken, saveSession, loadSession, clearSession, isExpired,
} from "./cognito.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { sub, email, groups }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const session = loadSession();
    if (session && !isExpired(session)) {
      setUser(decodeIdToken(session.idToken));
    } else if (session) {
      clearSession();
    }
    setChecked(true);
  }, []);

  const login = useCallback(async (username, password) => {
    setLoading(true);
    setError(null);
    try {
      const result = await initiateAuthPassword(username, password);
      saveSession(result);
      setUser(decodeIdToken(result.IdToken));
    } catch (err) {
      setError(err.message || "Login failed.");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const value = { user, login, logout, loading, error, checked };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
