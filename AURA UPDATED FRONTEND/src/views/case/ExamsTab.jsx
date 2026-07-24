import { useState } from "react";
import ErrorBanner from "../../lib/ErrorBanner.jsx";
import useAsyncAction from "../../hooks/useAsyncAction.js";
import { recommendExams, recordExamFinding } from "../../api/endpoints.js";

function ExamCard({ c, exam, updateCase }) {
  const [finding, setFinding] = useState(exam.finding || "");
  const [normalRange, setNormalRange] = useState(exam.normalRange || "");
  const [flag, setFlag] = useState(exam.flag || "normal");
  const [note, setNote] = useState(exam.note || "");
  const { run, loading, error, clearError } = useAsyncAction();

  const save = (status) => {
    run(async () => {
      const { case: updated } = await recordExamFinding(c.id, exam.id, { finding, normalRange, flag, note, status });
      updateCase(updated);
    });
  };

  return (
    <div className="lc-card">
      <div className="lc-card-head">
        <h4>{exam.name}</h4>
        <span className={"pill " + (exam.status === "complete" ? "badge-success" : exam.status === "skipped" ? "badge-flat" : "badge-warn")}>{exam.status}</span>
      </div>
      <p style={{ fontSize: 13 }} className="muted">{exam.reason}</p>
      <div className="tag-row" style={{ marginTop: 8 }}>
        <span className="tag">{exam.importance}</span>
        <span className="tag">{exam.confidence}% confidence</span>
      </div>
      <ErrorBanner error={error} onDismiss={clearError} />
      {exam.status !== "complete" && exam.status !== "skipped" ? (
        <>
          <div className="lc-row">
            <div className="lc-field"><label>Finding</label><input value={finding} onChange={(e) => setFinding(e.target.value)} /></div>
            <div className="lc-field"><label>Normal range</label><input value={normalRange} onChange={(e) => setNormalRange(e.target.value)} /></div>
            <div className="lc-field"><label>Flag</label>
              <select value={flag} onChange={(e) => setFlag(e.target.value)}>
                <option value="normal">Normal</option><option value="abnormal">Abnormal</option><option value="critical">Critical</option>
              </select>
            </div>
          </div>
          <div className="lc-row">
            <div className="lc-field" style={{ flex: 3 }}><label>Note</label><input value={note} onChange={(e) => setNote(e.target.value)} /></div>
          </div>
          <div className="lc-row">
            <button className="btn-primary sm" disabled={loading} onClick={() => save("complete")}>Mark complete</button>
            <button className="btn-ghost sm" disabled={loading} onClick={() => save("skipped")}>Skip</button>
          </div>
        </>
      ) : (
        <p style={{ fontSize: 13, marginTop: 8 }}>{exam.finding || <span className="muted">No finding recorded.</span>}</p>
      )}
    </div>
  );
}

export default function ExamsTab({ c, updateCase }) {
  const { run, loading, error, clearError } = useAsyncAction();
  const exams = c.exams || [];

  const getExams = () => {
    run(async () => {
      const { case: updated } = await recommendExams(c.id);
      updateCase(updated);
    });
  };

  return (
    <div>
      <ErrorBanner error={error} onDismiss={clearError} />
      {exams.length === 0 ? (
        <>
          <p className="empty-hint">No exam recommendations yet.</p>
          <button className="btn-primary" disabled={loading} onClick={getExams}>{loading ? "Requesting…" : "Get exam recommendations"}</button>
        </>
      ) : (
        exams.map((e) => <ExamCard key={e.id} c={c} exam={e} updateCase={updateCase} />)
      )}
    </div>
  );
}
