import { FolderOpen, AlertTriangle, Clock, CheckCircle2, Sparkles, ShieldAlert } from "lucide-react";
import { CountUp, CaseCard } from "../lib/ui.jsx";
import ErrorBanner from "../lib/ErrorBanner.jsx";
import { relativeTime } from "../lib/format.js";

const TONE_ICON = { critical: ShieldAlert, warning: AlertTriangle, info: Sparkles, suggestion: Sparkles, success: CheckCircle2 };

export default function DashboardView({ activeCases, allCases, loading, error, onOpen, onRetry }) {
  const highCount = activeCases.filter((c) => c.priority === "High").length;
  const completedToday = allCases.filter((c) => c.lifecycleState === "Closed" && relativeTime(c.updatedAt).includes("hour") === false).length;
  const stats = [
    { icon: FolderOpen, value: activeCases.length, suffix: "", label: "Active cases" },
    { icon: AlertTriangle, value: highCount, suffix: "", label: "High priority" },
    { icon: FolderOpen, value: allCases.length, suffix: "", label: "Total cases" },
    { icon: CheckCircle2, value: completedToday, suffix: "", label: "Completed recently" },
  ];

  const insights = allCases.flatMap((c) => (c.insights || []).map((ins) => ({ ...ins, caseId: c.id, patient: c.patient?.name })))
    .filter((ins) => ins.kind === "critical" || ins.kind === "warning")
    .slice(0, 5);

  const activity = allCases
    .flatMap((c) => (c.recentUpdates || []).map((u) => ({ ...u, patient: c.patient?.name })))
    .sort((a, b) => (b.time || "").localeCompare(a.time || ""))
    .slice(0, 6);

  return (
    <div className="dash-grid">
      <div className="dash-main">
        {error && <ErrorBanner error={error} onDismiss={onRetry} />}
        <div id="stat-row" className="stat-row">
          {stats.map((s, i) => (
            <div className="stat-card" style={{ animationDelay: i * 70 + "ms" }} key={s.label}>
              <s.icon size={16} />
              <div><div className="stat-num"><CountUp value={s.value} suffix={s.suffix} /></div><div className="stat-label">{s.label}</div></div>
            </div>
          ))}
        </div>

        <div className="section-head">
          <div>
            <h2>Active cases</h2>
            <p className="muted">Cases currently moving through the diagnostic workflow</p>
          </div>
        </div>
        {loading ? (
          <div className="skeleton-grid"><div className="skeleton-card" /><div className="skeleton-card" /></div>
        ) : (
          <>
            <div className="case-grid">
              {activeCases.slice(0, 4).map((c, i) => <CaseCard c={c} index={i} pos={i} key={c.id} onOpen={onOpen} />)}
            </div>
            {activeCases.length === 0 && <p className="muted">No active cases yet — start one from "New Patient Intake".</p>}
          </>
        )}
      </div>

      <aside className="dash-side">
        <div id="ai-insights" className="insights-panel">
          <div className="panel-head"><Sparkles size={16} /><div><h3>AI insights</h3><p className="muted">Flags surfaced across your caseload</p></div></div>
          {insights.length === 0 && <p className="muted small">Nothing flagged right now.</p>}
          {insights.map((ins, i) => {
            const Icon = TONE_ICON[ins.kind] || Sparkles;
            return (
              <div className={"insight-card tone-" + ins.kind} style={{ animationDelay: (i * 90 + 120) + "ms" }} key={i}>
                <Icon size={16} />
                <div><h4>{ins.title} <span className="muted small">— {ins.patient}</span></h4><p>{ins.text}</p></div>
              </div>
            );
          })}
        </div>
        <div className="activity-panel">
          <h3>Recent activity</h3>
          <p className="muted">Latest updates across your cases</p>
          {activity.length === 0 && <p className="muted small" style={{ marginTop: 10 }}>No activity yet.</p>}
          {activity.map((a, i) => (
            <div className="activity-row" key={i}><span>{a.patient}: {a.text}</span><span className="muted small">{a.actor}</span></div>
          ))}
        </div>
      </aside>
    </div>
  );
}
