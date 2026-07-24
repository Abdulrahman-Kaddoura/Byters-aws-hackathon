import { CaseCard } from "../lib/ui.jsx";
import ErrorBanner from "../lib/ErrorBanner.jsx";

export default function ListView({ title, subtitle, cases, loading, error, onOpen }) {
  return (
    <div className="list-view">
      <div className="section-head"><div><h2>{title}</h2><p className="muted">{subtitle}</p></div></div>
      {error && <ErrorBanner error={error} />}
      {loading ? (
        <div className="skeleton-grid"><div className="skeleton-card" /><div className="skeleton-card" /><div className="skeleton-card" /></div>
      ) : (
        <>
          <div className="case-grid wide">
            {cases.map((c, i) => <CaseCard c={c} index={-1} pos={i} key={c.id} onOpen={onOpen} />)}
          </div>
          {cases.length === 0 && <p className="muted">Nothing here yet.</p>}
        </>
      )}
    </div>
  );
}
