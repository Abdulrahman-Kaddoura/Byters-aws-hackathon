import { useState } from "react";
import ErrorBanner from "../../lib/ErrorBanner.jsx";
import useAsyncAction from "../../hooks/useAsyncAction.js";
import { proposeFinalDiagnosis, acceptFinalDiagnosis } from "../../api/endpoints.js";

export default function FinalDiagnosisTab({ c, updateCase }) {
  const [note, setNote] = useState("");
  const propose = useAsyncAction();
  const accept = useAsyncAction();
  const fd = c.finalDiagnosis;

  const doPropose = () => propose.run(async () => updateCase((await proposeFinalDiagnosis(c.id)).case));
  const doAccept = () => accept.run(async () => updateCase((await acceptFinalDiagnosis(c.id, { note: note || undefined })).case));

  return (
    <div>
      <ErrorBanner error={propose.error || accept.error} onDismiss={() => { propose.clearError(); accept.clearError(); }} />

      {!fd && (
        <>
          <p className="empty-hint">No final diagnosis proposed yet.</p>
          <button className="btn-primary" disabled={propose.loading || c.lifecycleState !== "ResultsDiscussion"} onClick={doPropose}>
            {propose.loading ? "Proposing…" : "Propose final diagnosis"}
          </button>
          {c.lifecycleState !== "ResultsDiscussion" && (
            <p className="muted small" style={{ marginTop: 8 }}>Available once the case reaches the results-discussion stage.</p>
          )}
        </>
      )}

      {fd && (
        <div className="lc-card">
          <div className="lc-card-head">
            <h4>{fd.name}</h4>
            <span className={"pill " + (fd.status === "accepted" ? "badge-success" : "badge-warn")}>{fd.status}</span>
          </div>
          <p style={{ fontSize: 13.5 }}>{fd.reasoning}</p>
          {fd.evidenceSummary?.length > 0 && (
            <>
              <h4 style={{ fontSize: 13, marginTop: 12 }}>Evidence</h4>
              <ul>{fd.evidenceSummary.map((s, i) => <li key={i} style={{ fontSize: 13, color: "var(--ink-soft)" }}>{s}</li>)}</ul>
            </>
          )}
          {fd.treatment?.length > 0 && (
            <>
              <h4 style={{ fontSize: 13, marginTop: 12 }}>Treatment</h4>
              <ul>{fd.treatment.map((s, i) => <li key={i} style={{ fontSize: 13, color: "var(--ink-soft)" }}>{s}</li>)}</ul>
            </>
          )}
          {fd.followUp?.length > 0 && (
            <>
              <h4 style={{ fontSize: 13, marginTop: 12 }}>Follow-up</h4>
              <ul>{fd.followUp.map((s, i) => <li key={i} style={{ fontSize: 13, color: "var(--ink-soft)" }}>{s}</li>)}</ul>
            </>
          )}

          {fd.status === "proposed" && (
            <>
              <div className="lc-row">
                <div className="lc-field" style={{ flex: 3 }}><label>Sign-off note (optional)</label><input value={note} onChange={(e) => setNote(e.target.value)} /></div>
              </div>
              <button className="btn-primary" disabled={accept.loading} onClick={doAccept}>
                {accept.loading ? "Accepting…" : "Accept & close case"}
              </button>
              <p className="muted small" style={{ marginTop: 8 }}>Requires a physician or admin role — a compliance login will see a 403 here.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
