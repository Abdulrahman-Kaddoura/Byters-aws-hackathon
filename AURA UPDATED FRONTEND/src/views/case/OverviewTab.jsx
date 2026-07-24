import { useState } from "react";
import { Send } from "lucide-react";
import ErrorBanner from "../../lib/ErrorBanner.jsx";
import useAsyncAction from "../../hooks/useAsyncAction.js";
import { addNote } from "../../api/endpoints.js";

export default function OverviewTab({ c, updateCase }) {
  const [noteText, setNoteText] = useState("");
  const { run, loading, error, clearError } = useAsyncAction();

  const submitNote = () => {
    if (!noteText.trim()) return;
    run(async () => {
      const { case: updated } = await addNote(c.id, noteText.trim());
      updateCase(updated);
      setNoteText("");
    });
  };

  const history = c.history || {};

  return (
    <div>
      <ErrorBanner error={error} onDismiss={clearError} />

      <h3 className="section-title" style={{ marginTop: 0 }}>Progress</h3>
      <div className="stepper">
        {(c.progress || []).map((s) => (
          <span key={s.key} className={"step-pill" + (s.status === "done" ? " step-done" : s.status === "active" ? " step-active" : "")}>{s.label}</span>
        ))}
        {(!c.progress || c.progress.length === 0) && <span className="muted small">No progress data yet.</span>}
      </div>

      <h3 className="section-title">Chief complaint</h3>
      <p>{c.chiefComplaint}</p>
      {c.primaryImpression && <p className="muted" style={{ marginTop: 6 }}>Primary impression: <strong>{c.primaryImpression}</strong></p>}

      <h3 className="section-title">Vitals &amp; history</h3>
      <div className="kv-grid">
        {Object.entries(c.vitals || {}).filter(([, v]) => v).map(([k, v]) => (
          <div className="kv-cell" key={k}><div className="kv-label">{k}</div><div className="kv-value">{v}</div></div>
        ))}
      </div>
      <div className="kv-grid">
        {history.allergies?.length > 0 && <div className="kv-cell"><div className="kv-label">Allergies</div><div className="kv-value">{history.allergies.join(", ")}</div></div>}
        {history.medications?.length > 0 && <div className="kv-cell"><div className="kv-label">Medications</div><div className="kv-value">{history.medications.join(", ")}</div></div>}
        {history.previousIllnesses?.length > 0 && <div className="kv-cell"><div className="kv-label">Prior illnesses</div><div className="kv-value">{history.previousIllnesses.join(", ")}</div></div>}
      </div>

      {c.insights?.length > 0 && (
        <>
          <h3 className="section-title">AI insights</h3>
          {c.insights.map((ins, i) => (
            <div className={"insight-card tone-" + ins.kind} key={i}>
              <div><h4>{ins.title}</h4><p>{ins.text}</p></div>
            </div>
          ))}
        </>
      )}

      {c.nextSteps?.length > 0 && (
        <>
          <h3 className="section-title">Next steps</h3>
          <ul>{c.nextSteps.map((s, i) => <li key={i} style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 4 }}>{s}</li>)}</ul>
        </>
      )}

      <h3 className="section-title">Notes</h3>
      {(c.notes || []).length === 0 && <p className="empty-hint">No notes yet.</p>}
      {(c.notes || []).map((n, i) => (
        <div className="lc-card" key={i}>
          <div className="lc-card-head"><h4>{n.author}</h4><span className="muted small">{n.time}</span></div>
          <p style={{ fontSize: 13.5 }}>{n.text}</p>
        </div>
      ))}
      <div className="refine-row" style={{ marginTop: 10 }}>
        <input placeholder="Add a note…" value={noteText} onChange={(e) => setNoteText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitNote()} />
        <button className="btn-primary" disabled={loading} onClick={submitNote}><Send size={15} /></button>
      </div>
    </div>
  );
}
