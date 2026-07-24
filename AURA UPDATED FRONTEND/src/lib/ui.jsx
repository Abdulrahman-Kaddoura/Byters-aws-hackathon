import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { Activity, Clock } from "lucide-react";
import { initials, avatarStyle, relativeTime } from "./format.js";

export function AuraMark({ size = 36, id, active = false }) {
  return (
    <div id={id} className={"aura-mark" + (active ? " aura-mark-active" : "")} style={{ width: size, height: size }}>
      <span className="aura-mark-glow" />
      <span className="aura-mark-core"><Activity size={size * 0.52} strokeWidth={2.3} /></span>
    </div>
  );
}

export function CountUp({ value, suffix = "" }) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);
  useEffect(() => {
    const start = prevRef.current;
    const end = value;
    const t0 = performance.now();
    const duration = 700;
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(start + (end - start) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = end;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{display}{suffix}</>;
}

export function AmbientBlobs() {
  return (
    <div className="ambient-blobs" aria-hidden="true">
      <span className="blob b1" /><span className="blob b2" /><span className="blob b3" />
    </div>
  );
}

export function SideNavGroup({ children }) {
  const ref = useRef(null);
  const [ind, setInd] = useState(null);
  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;
    const active = container.querySelector(".is-active");
    if (active) {
      const cRect = container.getBoundingClientRect();
      const r = active.getBoundingClientRect();
      const next = { top: r.top - cRect.top, height: r.height };
      setInd((current) => (current && current.top === next.top && current.height === next.height ? current : next));
    } else {
      setInd((current) => (current === null ? current : null));
    }
  });
  return (
    <div className="side-section" ref={ref}>
      {ind && <div className="side-indicator" style={{ top: ind.top, height: ind.height }} />}
      {children}
    </div>
  );
}

export function PriorityBadge({ level }) {
  const cls = level === "High" ? "badge-danger" : level === "Medium" ? "badge-warn" : "badge-flat";
  return <span className={"pill " + cls}>{level || "—"}</span>;
}

export function StatusRow({ status, time }) {
  const dot = status === "Completed" ? "dot-success" : status === "New" ? "dot-warn" : "dot-primary";
  return (
    <div className="status-row">
      <span className={"status-pill " + dot}><i className={"dot " + dot} />{status}</span>
      <span className="time-stamp"><Clock size={12} /> {time}</span>
    </div>
  );
}

export function ProgressBar({ steps }) {
  const list = steps && steps.length ? steps : Array.from({ length: 7 }).map(() => ({ status: "pending" }));
  return (
    <div className="progress-row">
      {list.map((s, i) => {
        let cls = "seg";
        if (s.status === "done") cls += " seg-done";
        else if (s.status === "active") cls += " seg-active";
        return <span key={i} className={cls} style={{ transitionDelay: (i * 25) + "ms" }} />;
      })}
    </div>
  );
}

const ANALYZING_LINES = ["Reviewing the description…", "Cross-referencing clinical patterns…", "Ranking possibilities…"];

export function AnalyzingOverlay() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % ANALYZING_LINES.length), 750);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="modal-backdrop">
      <div className="analyzing-card">
        <div className="ring-wrap">
          <span className="ring r1" /><span className="ring r2" /><span className="ring r3" />
          <AuraMark size={46} active />
        </div>
        <p key={i} className="analyzing-text">{ANALYZING_LINES[i]}</p>
      </div>
    </div>
  );
}

export function caseCardProps(c) {
  const top = c.diagnoses && c.diagnoses[0];
  return {
    name: c.patient?.name || "Unknown patient",
    ageSex: `${c.patient?.age ?? "—"}${(c.patient?.gender || "?")[0]}`,
    complaint: c.chiefComplaint || "No chief complaint recorded",
    primaryName: top ? top.name : (c.primaryImpression || "Awaiting differential"),
    primaryConf: top ? top.confidence : null,
    time: relativeTime(c.updatedAt),
  };
}

export function CaseCard({ c, index, pos, onOpen }) {
  const p = caseCardProps(c);
  return (
    <button className="case-card" id={index === 0 ? "case-card-0" : undefined} style={{ animationDelay: (pos ?? 0) * 65 + "ms" }} onClick={() => onOpen(c)}>
      <div className="case-top">
        <div className="case-who">
          <span className="avatar" style={avatarStyle(c.patient?.name)}>{initials(p.name)}</span>
          <div>
            <h3>{p.name}</h3>
            <span className="case-sub">{p.ageSex} · {c.id}</span>
          </div>
        </div>
        <PriorityBadge level={c.priority} />
      </div>
      <p className="case-complaint">{p.complaint}</p>
      <div className="dx-row">
        <span className="dx-name"><Activity size={14} /> {p.primaryName}</span>
        {p.primaryConf != null && <span className="dx-conf">{p.primaryConf}%</span>}
      </div>
      <ProgressBar steps={c.progress} />
      <StatusRow status={c.status} time={p.time} />
    </button>
  );
}
