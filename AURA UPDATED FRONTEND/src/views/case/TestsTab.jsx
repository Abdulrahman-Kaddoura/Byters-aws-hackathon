import { useState } from "react";
import ErrorBanner from "../../lib/ErrorBanner.jsx";
import useAsyncAction from "../../hooks/useAsyncAction.js";
import { orderTest, recordTestResult, acceptRecommendation, rejectRecommendation } from "../../api/endpoints.js";

function TestCard({ c, test, updateCase }) {
  const [result, setResult] = useState(test.result || "");
  const [resultFlag, setResultFlag] = useState(test.resultFlag || "normal");
  const [resultDetail, setResultDetail] = useState(test.resultDetail || "");
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const act = useAsyncAction();

  const order = () => act.run(async () => updateCase((await orderTest(c.id, test.id)).case));
  const saveResult = () => act.run(async () => updateCase((await recordTestResult(c.id, test.id, { result, resultFlag, resultDetail })).case));
  const accept = () => act.run(async () => updateCase((await acceptRecommendation(c.id, test.id, { targetType: "test" })).case));
  const reject = () => {
    if (!rejectReason.trim()) return;
    act.run(async () => {
      updateCase((await rejectRecommendation(c.id, test.id, { targetType: "test", reason: rejectReason.trim() })).case);
      setShowReject(false); setRejectReason("");
    });
  };

  return (
    <div className="lc-card">
      <div className="lc-card-head">
        <h4>{test.name}</h4>
        <span className={"pill " + (test.status === "completed" ? "badge-success" : test.status === "ordered" ? "badge-warn" : "badge-flat")}>{test.status}</span>
      </div>
      <p style={{ fontSize: 13 }} className="muted">{test.reason}</p>
      <div className="tag-row" style={{ marginTop: 8 }}>
        <span className="tag">{test.category}</span>
        <span className="tag">{test.priority} priority</span>
        <span className="tag">{test.diagnosticValue}% diagnostic value</span>
      </div>
      <ErrorBanner error={act.error} onDismiss={act.clearError} />

      {test.status === "recommended" && (
        <div className="lc-row">
          <button className="btn-primary sm" disabled={act.loading} onClick={order}>Order test</button>
          {!showReject ? (
            <button className="btn-ghost sm" disabled={act.loading} onClick={() => setShowReject(true)}>Reject</button>
          ) : (
            <>
              <input placeholder="Reason (required)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} style={{ flex: 1, minWidth: 140, border: "1px solid var(--border)", borderRadius: 9, padding: "7px 9px", fontSize: 13, background: "var(--surface-2)", color: "var(--ink)" }} />
              <button className="btn-ghost sm" disabled={act.loading || !rejectReason.trim()} onClick={reject}>Confirm</button>
            </>
          )}
        </div>
      )}

      {test.status === "ordered" && (
        <>
          <div className="lc-row">
            <div className="lc-field"><label>Result</label><input value={result} onChange={(e) => setResult(e.target.value)} /></div>
            <div className="lc-field"><label>Flag</label>
              <select value={resultFlag} onChange={(e) => setResultFlag(e.target.value)}>
                <option value="normal">Normal</option><option value="abnormal">Abnormal</option><option value="critical">Critical</option>
              </select>
            </div>
          </div>
          <div className="lc-row">
            <div className="lc-field" style={{ flex: 3 }}><label>Detail</label><input value={resultDetail} onChange={(e) => setResultDetail(e.target.value)} /></div>
          </div>
          <button className="btn-primary sm" disabled={act.loading || !result.trim()} onClick={saveResult}>Save result</button>
        </>
      )}

      {test.status === "completed" && (
        <p style={{ fontSize: 13, marginTop: 8 }}><strong>{test.result}</strong>{test.resultDetail ? ` — ${test.resultDetail}` : ""}</p>
      )}
    </div>
  );
}

export default function TestsTab({ c, updateCase }) {
  const tests = c.tests || [];
  return (
    <div>
      {tests.length === 0 && <p className="empty-hint">No tests recommended yet — request a differential first, tests are suggested alongside it.</p>}
      {tests.map((t) => <TestCard key={t.id} c={c} test={t} updateCase={updateCase} />)}
    </div>
  );
}
