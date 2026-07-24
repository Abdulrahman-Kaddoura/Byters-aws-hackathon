import { useState } from "react";
import { Activity, ArrowRight } from "lucide-react";
import ErrorBanner from "../lib/ErrorBanner.jsx";

export default function LoginView({ onLogin, error, loading }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    onLogin(username.trim(), password);
  };

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="aura-mark" style={{ width: 40, height: 40 }}>
          <span className="aura-mark-glow" />
          <span className="aura-mark-core"><Activity size={20} strokeWidth={2.3} /></span>
        </div>
        <h2>Sign in to Aura</h2>
        <span className="muted">Clinical decision support — live backend</span>

        <ErrorBanner error={error} />

        <form onSubmit={submit}>
          <div className="login-fields">
            <label className="field">
              <span>Username or email</span>
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />
            </label>
            <label className="field">
              <span>Password</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </label>
          </div>
          <button className="btn-primary lg" type="submit" disabled={loading} style={{ width: "100%", justifyContent: "center" }}>
            {loading ? "Signing in…" : "Sign in"} <ArrowRight size={16} />
          </button>
        </form>
        <p className="muted small" style={{ marginTop: 18 }}>
          Self sign-up is disabled — accounts are provisioned by an administrator in AWS Cognito.
        </p>
      </div>
    </div>
  );
}
