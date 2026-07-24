import { useEffect, useState } from "react";
import ErrorBanner from "../../lib/ErrorBanner.jsx";
import { getAudit } from "../../api/endpoints.js";

export default function AuditTab({ caseId }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAudit(caseId)
      .then(({ entries }) => { if (!cancelled) setEntries(entries); })
      .catch((err) => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [caseId]);

  return (
    <div>
      <ErrorBanner error={error} />
      {loading && <p className="loading-hint">Loading audit trail…</p>}
      {entries && entries.length === 0 && <p className="empty-hint">No audit entries yet.</p>}
      {entries && entries.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="audit-table">
            <thead><tr><th>Time</th><th>Actor</th><th>Groups</th><th>Action</th></tr></thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i}>
                  <td>{e.ts}</td>
                  <td>{e.actor}</td>
                  <td>{(e.actorGroups || []).join(", ")}</td>
                  <td>{e.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
