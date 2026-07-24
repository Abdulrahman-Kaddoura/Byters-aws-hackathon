import { useState, useEffect, useCallback } from "react";
import { ChevronLeft } from "lucide-react";
import { initials, avatarStyle } from "../../lib/format.js";
import { PriorityBadge } from "../../lib/ui.jsx";
import ErrorBanner from "../../lib/ErrorBanner.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { getCase } from "../../api/endpoints.js";

import OverviewTab from "./OverviewTab.jsx";
import InterviewTab from "./InterviewTab.jsx";
import ExamsTab from "./ExamsTab.jsx";
import DifferentialTab from "./DifferentialTab.jsx";
import TestsTab from "./TestsTab.jsx";
import FinalDiagnosisTab from "./FinalDiagnosisTab.jsx";
import AuditTab from "./AuditTab.jsx";
import AssistantPanel from "./AssistantPanel.jsx";

export default function CaseDetailShell({ caseId, onBack, onCaseChanged }) {
  const { user } = useAuth();
  const groups = user?.groups || [];
  const isClinicalStaff = groups.some((g) => ["physician", "admin", "compliance"].includes(g));
  const isAuditor = groups.some((g) => ["admin", "compliance"].includes(g));

  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("overview");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { case: fetched } = await getCase(caseId);
      setC(fetched);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  const updateCase = useCallback((newCase) => {
    setC(newCase);
    onCaseChanged && onCaseChanged(newCase);
  }, [onCaseChanged]);

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "interview", label: "AI Interview" },
    isClinicalStaff && { key: "exams", label: "Examination" },
    isClinicalStaff && { key: "differential", label: "Differential" },
    isClinicalStaff && { key: "tests", label: "Tests" },
    isClinicalStaff && { key: "final", label: "Final Diagnosis" },
    isAuditor && { key: "audit", label: "Audit" },
  ].filter(Boolean);

  return (
    <div className="case-detail">
      <button className="btn-ghost sm back-btn" onClick={onBack}><ChevronLeft size={15} /> Back to dashboard</button>

      {error && <ErrorBanner error={error} onDismiss={load} />}
      {loading && !c && <p className="loading-hint">Loading case…</p>}

      {c && (
        <>
          <div className="case-detail-head">
            <span className="avatar lg" style={avatarStyle(c.patient?.name)}>{initials(c.patient?.name)}</span>
            <div className="case-detail-info">
              <h2>{c.patient?.name}</h2>
              <span className="muted">{c.patient?.age}{(c.patient?.gender || "?")[0]} · {c.id} · {c.status}</span>
            </div>
            <PriorityBadge level={c.priority} />
            <div className="case-vitals-row">
              {Object.entries(c.vitals || {}).filter(([, v]) => v).map(([k, v]) => (
                <span className="vital-chip" key={k}>{k.toUpperCase()}: {v}</span>
              ))}
            </div>
          </div>

          <div className={"case-layout" + (isClinicalStaff ? "" : " no-assistant")}>
            <div className="case-main">
              <div className="tab-bar">
                {tabs.map((t) => (
                  <button key={t.key} className={"tab-btn" + (tab === t.key ? " is-active" : "")} onClick={() => setTab(t.key)}>
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="tab-panel">
                {tab === "overview" && <OverviewTab c={c} updateCase={updateCase} />}
                {tab === "interview" && <InterviewTab c={c} updateCase={updateCase} />}
                {tab === "exams" && isClinicalStaff && <ExamsTab c={c} updateCase={updateCase} />}
                {tab === "differential" && isClinicalStaff && <DifferentialTab c={c} updateCase={updateCase} />}
                {tab === "tests" && isClinicalStaff && <TestsTab c={c} updateCase={updateCase} />}
                {tab === "final" && isClinicalStaff && <FinalDiagnosisTab c={c} updateCase={updateCase} />}
                {tab === "audit" && isAuditor && <AuditTab caseId={c.id} />}
              </div>
            </div>

            {isClinicalStaff && <AssistantPanel c={c} updateCase={updateCase} />}
          </div>
        </>
      )}
    </div>
  );
}
