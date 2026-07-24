import { useState } from "react";
import { Send } from "lucide-react";
import ErrorBanner from "../../lib/ErrorBanner.jsx";
import useAsyncAction from "../../hooks/useAsyncAction.js";
import { postInterviewMessage, generateSummary } from "../../api/endpoints.js";

const ROLE_CLASS = { ai: "from-aura", patient: "from-user", doctor: "from-doctor", system: "from-system" };

export default function InterviewTab({ c, updateCase }) {
  const [text, setText] = useState("");
  const [complete, setComplete] = useState(false);
  const send = useAsyncAction();
  const summarize = useAsyncAction();

  const transcript = c.interview || [];

  const submit = () => {
    if (!text.trim()) return;
    send.run(async () => {
      const { case: updated, aiMessage, complete: isComplete } = await postInterviewMessage(c.id, text.trim());
      updateCase(updated);
      setComplete(!!isComplete);
      setText("");
      return aiMessage;
    });
  };

  const doSummary = () => {
    summarize.run(async () => {
      const { case: updated } = await generateSummary(c.id);
      updateCase(updated);
    });
  };

  return (
    <div>
      <ErrorBanner error={send.error || summarize.error} onDismiss={() => { send.clearError(); summarize.clearError(); }} />
      <div className="lc-card">
        <div className="refine-log" style={{ maxHeight: 420 }}>
          {transcript.length === 0 && <p className="empty-hint">No messages yet.</p>}
          {transcript.map((m, i) => (
            <div key={i} className={"refine-msg " + (ROLE_CLASS[m.role] || "from-user")}>{m.text}</div>
          ))}
        </div>
        {c.lifecycleState === "AIInterview" && (
          <div className="refine-row">
            <input placeholder="Type the patient's answer…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
            <button className="btn-primary" disabled={send.loading} onClick={submit}><Send size={15} /></button>
          </div>
        )}
        {c.lifecycleState === "AIInterview" && complete && !c.summary && (
          <button className="btn-primary" style={{ marginTop: 12 }} disabled={summarize.loading} onClick={doSummary}>
            {summarize.loading ? "Generating summary…" : "Generate structured summary"}
          </button>
        )}
      </div>

      {c.summary && (
        <div className="lc-card">
          <h4>Structured summary</h4>
          <p style={{ fontSize: 13.5, marginTop: 6 }}>{c.summary.hpi}</p>
          {c.summary.redFlags?.length > 0 && (
            <div className="tag-row" style={{ marginTop: 10 }}>
              {c.summary.redFlags.map((f, i) => <span className="tag" key={i}>⚑ {f}</span>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
