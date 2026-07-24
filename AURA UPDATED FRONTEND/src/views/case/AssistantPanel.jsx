import { useState } from "react";
import { Send, Sparkles } from "lucide-react";
import ErrorBanner from "../../lib/ErrorBanner.jsx";
import useAsyncAction from "../../hooks/useAsyncAction.js";
import { assistantChat } from "../../api/endpoints.js";

export default function AssistantPanel({ c, updateCase }) {
  const [text, setText] = useState("");
  const { run, loading, error, clearError } = useAsyncAction();
  const thread = c.assistantThread || [];

  const send = () => {
    if (!text.trim()) return;
    run(async () => {
      const { case: updated } = await assistantChat(c.id, text.trim());
      updateCase(updated);
      setText("");
    });
  };

  return (
    <aside className="insights-panel" style={{ position: "sticky", top: 90 }}>
      <div className="panel-head"><Sparkles size={16} /><div><h3>Assistant</h3><p className="muted">Ask Aura about this case</p></div></div>
      <ErrorBanner error={error} onDismiss={clearError} />
      <div className="refine-log" style={{ maxHeight: 320 }}>
        {thread.length === 0 && <p className="empty-hint">No messages yet.</p>}
        {thread.map((m, i) => (
          <div key={i} className={"refine-msg " + (m.role === "ai" ? "from-aura" : "from-doctor")}>{m.text}</div>
        ))}
      </div>
      <div className="refine-row" style={{ marginTop: 10 }}>
        <input placeholder="Ask a question…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
        <button className="btn-primary" disabled={loading} onClick={send}><Send size={15} /></button>
      </div>
    </aside>
  );
}
