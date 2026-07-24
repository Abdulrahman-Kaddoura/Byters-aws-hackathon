import { User2, Settings as SettingsIcon, Bell, LogOut } from "lucide-react";
import { useAuth } from "../auth/AuthContext.jsx";

export default function SettingsView() {
  const { user, logout } = useAuth();
  return (
    <div className="settings-view">
      <h2>Settings</h2>
      <p className="muted" style={{ marginBottom: 24 }}>Signed in against the live SEHATI-AI backend.</p>
      <div className="settings-card">
        <div className="settings-row"><User2 size={16} /><div><div className="settings-label">Signed in as</div><div className="muted">{user?.email || user?.sub || "Unknown"}</div></div></div>
        <div className="settings-row"><SettingsIcon size={16} /><div><div className="settings-label">Role(s)</div><div className="muted">{(user?.groups || []).join(", ") || "no groups assigned"}</div></div></div>
        <div className="settings-row"><Bell size={16} /><div><div className="settings-label">Notifications</div><div className="muted">On for high-priority cases</div></div></div>
      </div>
      <button className="btn-ghost" style={{ marginTop: 18 }} onClick={logout}><LogOut size={15} /> Log out</button>
    </div>
  );
}
