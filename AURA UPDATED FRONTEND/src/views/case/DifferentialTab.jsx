import { useState } from "react";
import { Send } from "lucide-react";
import ErrorBanner from "../../lib/ErrorBanner.jsx";
import useAsyncAction from "../../hooks/useAsyncAction.js";
import { requestRecommendations, askDiagnosis, rerankAfterResults, acceptRecommendation, rejectRecommendation } from "../../api/endpoints.js";

function DiagnosisCard({ c, dx, updateCase }) {
  const [question, setQuestion] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const ask = useAsyncAction();
  const decide = useAsyncAction();

  const submitAsk = () => {
    if (!question.trim()) return;
    ask.run(async () => {
      const { case: updated } = await askDiagnosis(c.id, { question: question.trim(), diagnosisId: dx.id });
      updateCase(updated);
      setQuestion("");
    });
  };

  const accept = () => {
    decide.run(async () => {
      const { case: updated } = await acceptRecommendation(c.id, dx.id, { targetType: "diagnosis" });
      updateCase(updated);
    });
  };

  const reject = () => {
    if (!rejectReason.trim()) return;
    decide.run(async () => {
      const { case: updated } = await rejectRecommendation(c.id, dx.id, { targetType: "diagnosis", reason: rejectReason.trim() });
      updateCase(updated);
      setShowReject(false);
      setRejectReason("");
    });
  };

  return (
    <div className="result-card">
      <div className="result-card-top">
        <h3>{dx.name}</h3>
        <span className="pill badge-conf">{dx.confidence}%</span>
      </div>
      <p className="result-blurb">{dx.tagline}</p>
      <p style={{ fontSize: 13, marginBottom: 8 }}>{dx.reasoning}</p>
      {dx.supporting?.length > 0 && <div className="tag-row">{dx.supporting.map((s, i) => <span className="tag" key={i}>+ {s}</span>)}</div>}
      {dx.contradicting?.length > 0 && <div className="tag-row">{dx.contradicting.map((s, i) => <span className="tag" key={i}>− {s}</span>)}</div>}
      {dx.recommendedTests?.length > 0 && <p style={{ fontSize: 12.5 }} className="muted">Recommended tests: {dx.recommendedTests.join(", ")}</p>}

      {dx.discussion?.length > 0 && (
        <div className="refine-log" style={{ marginTop: 10 }}>
          {dx.discussion.map((m, i) => <div key={i} className={"refine-msg " + (m.role === "ai" ? "from-aura" : "from-doctor")}>{m.text}</div>)}
        </div>
      )}

      <ErrorBanner error={ask.error || decide.error} onDismiss={() => { ask.clearError(); decide.clearError(); }} />

      <div className="refine-row" style={{ marginTop: 10 }}>
        <input placeholder="Ask about this diagnosis…" value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitAsk()} />
        <button className="btn-ghost" disabled={ask.loading} onClick={submitAsk}><Send size={14} /></button>
      </div>

      <div className="lc-row">
        <button className="btn-primary sm" disabled={decide.loading} onClick={accept}>Accept</button>
        {!showReject ? (
          <button className="btn-ghost sm" disabled={decide.loading} onClick={() => setShowReject(true)}>Reject</button>
        ) : (
          <>
            <input placeholder="Reason for rejecting (required)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} style={{ flex: 1, minWidth: 160, border: "1px solid var(--border)", borderRadius: 9, padding: "7px 9px", fontSize: 13, background: "var(--surface-2)", color: "var(--ink)" }} />
            <button className="btn-ghost sm" disabled={decide.loading || !rejectReason.trim()} onClick={reject}>Confirm reject</button>
          </>
        )}
      </div>
    </div>
  );
}

export default function DifferentialTab({ c, updateCase }) {
  const request = useAsyncAction();
  const rerank = useAsyncAction();
  const diagnoses = c.diagnoses || [];
  const hasResults = (c.tests || []).some((t) => t.status === "completed");

  const getDiagnoses = () => {
    request.run(async () => {
      const { case: updated } = await requestRecommendations(c.id);
      updateCase(updated);
    });
  };

  const doRerank = () => {
    rerank.run(async () => {
      const { case: updated } = await rerankAfterResults(c.id);
      updateCase(updated);
    });
  };

  return (
    <div>
      <ErrorBanner error={request.error || rerank.error} onDismiss={() => { request.clearError(); rerank.clearError(); }} />
      {diagnoses.length === 0 ? (
        <>
          <p className="empty-hint">No differential yet.</p>
          <button className="btn-primary" disabled={request.loading} onClick={getDiagnoses}>{request.loading ? "Requesting…" : "Get differential"}</button>
        </>
      ) : (
        <>
          {hasResults && (
            <button className="btn-ghost sm" style={{ marginBottom: 14 }} disabled={rerank.loading} onClick={doRerank}>
              {rerank.loading ? "Re-ranking…" : "Re-rank with test results"}
            </button>
          )}
          <div className="result-list">
            {diagnoses.map((dx) => <DiagnosisCard key={dx.id} c={c} dx={dx} updateCase={updateCase} />)}
          </div>
        </>
      )}
    </div>
  );
}
