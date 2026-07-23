import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import {
  Activity, Search, Plus, Bell, LayoutDashboard, FolderOpen, CheckCircle2,
  FilePlus2, BookOpen, Settings as SettingsIcon, Sun, Moon, ChevronRight,
  ChevronLeft, X, Sparkles, ShieldAlert, AlertTriangle, Clock, ArrowRight,
  Send, Check, MessageCircleQuestion, User2, Menu,
} from "lucide-react";

/* ------------------------------ mock content ------------------------------ */

const CONDITIONS = [
  { id: "migraine", name: "Migraine", keywords: ["headache", "throb", "nausea", "light", "sound", "aura", "one side", "pulsing"], blurb: "A recurring headache disorder often paired with nausea and sensitivity to light or sound.", next: "Track triggers and frequency. Consider a neurology referral if episodes increase." },
  { id: "tension", name: "Tension-type headache", keywords: ["headache", "tight", "band", "pressure", "stress", "fatigue", "neck"], blurb: "A common, usually mild headache often linked to stress, tension, or fatigue.", next: "Rest, hydration, and stress management are reasonable first steps." },
  { id: "uri", name: "Viral upper respiratory infection", keywords: ["cough", "sore throat", "congestion", "runny nose", "sneeze", "mild fever", "fatigue"], blurb: "A common cold-type illness affecting the nose and throat.", next: "Supportive care. Most cases resolve within a week to ten days." },
  { id: "flu", name: "Influenza", keywords: ["fever", "chills", "body ache", "muscle ache", "fatigue", "cough", "sudden", "headache"], blurb: "A viral illness marked by sudden fever, body aches, and fatigue.", next: "Rest and fluids. Antivirals may help if started early." },
  { id: "gastro", name: "Gastroenteritis", keywords: ["nausea", "vomit", "diarrhea", "stomach", "cramp", "abdominal"], blurb: "Inflammation of the stomach and intestines, often from a virus or contaminated food.", next: "Stay hydrated. Seek care if symptoms persist beyond 48 hours." },
  { id: "costo", name: "Costochondritis", keywords: ["chest pain", "tender", "sharp", "worse breathing", "press", "rib"], blurb: "Inflammation where rib meets breastbone, causing localized chest pain.", next: "Usually improves with rest and anti-inflammatories, once cardiac causes are ruled out." },
  { id: "angina", name: "Exertional chest tightness", keywords: ["chest pain", "chest tightness", "exertion", "stairs", "shortness of breath", "pressure", "radiat", "climbing"], blurb: "Chest discomfort brought on by physical activity, worth evaluating for cardiac causes.", next: "Warrants prompt clinical evaluation, especially with an exertional pattern." },
  { id: "anxiety", name: "Anxiety-related symptoms", keywords: ["chest tightness", "racing heart", "heart racing", "shortness of breath", "dizzy", "sweat", "panic", "on edge", "worry"], blurb: "Physical symptoms driven by heightened stress that can mimic other conditions.", next: "Consider situational triggers, while still ruling out cardiac or respiratory causes." },
  { id: "allergy", name: "Allergic rhinitis", keywords: ["sneeze", "itchy eyes", "congestion", "runny nose", "rash", "seasonal", "itchy"], blurb: "An allergic reaction causing nasal congestion, sneezing, and itchy eyes.", next: "Antihistamines and allergen avoidance are typical first steps." },
  { id: "msk", name: "Musculoskeletal joint pain", keywords: ["joint pain", "swelling", "stiff", "morning stiffness", "ache", "knee", "shoulder"], blurb: "Pain originating from joints, muscles, or connective tissue.", next: "Note the pattern of stiffness and swelling. Consider rest or imaging if persistent." },
  { id: "vertigo", name: "Benign positional vertigo", keywords: ["dizzy", "dizziness", "spinning", "position", "room spin", "balance"], blurb: "A brief spinning sensation triggered by changes in head position.", next: "Positional maneuvers often help. Persistent cases warrant further evaluation." },
  { id: "pneumonia", name: "Community-acquired Pneumonia", keywords: ["productive cough", "fever", "pleuritic", "chest pain", "cough", "breathless"], blurb: "A lung infection presenting with productive cough, fever, and often pleuritic pain.", next: "Chest imaging and empiric antibiotics pending culture results." },
];

const CHIP_OPTIONS = ["Fever", "Cough", "Fatigue", "Headache", "Nausea", "Shortness of breath", "Chest pain", "Joint pain", "Rash", "Dizziness"];

function scoreConditions(text, chips) {
  const hay = (text + " " + chips.join(" ")).toLowerCase();
  return CONDITIONS
    .map((c) => {
      let score = 0;
      const matched = [];
      c.keywords.forEach((k) => { if (hay.includes(k)) { score++; matched.push(k); } });
      return { ...c, score, matched };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

const FAQS = [
  { q: "Does Aura store what I type?", a: "Case details stay in this browser tab for the length of your session and are not attached to any identity. Nothing here is a substitute for a real clinical record." },
  { q: "Can I use Aura for an emergency?", a: "No. Aura is not built for urgent or emergency situations. If a case is urgent, follow local emergency protocol right away." },
  { q: "Is this a diagnosis?", a: "No. Aura produces a ranked list of possibilities to consider, based on the description given. A qualified clinician should confirm any actual diagnosis." },
  { q: "Where do the AI insights come from?", a: "They're generated from the details entered for a case — flags like risk factors, recorded allergies, or ruled-out concerns worth double-checking." },
  { q: "Is Aura free?", a: "This prototype is free to try. It exists to demonstrate how AI-assisted differential support could fit into a diagnostic workflow." },
];

const AVATAR_COLORS = ["#4C6FFF", "#FB7185", "#8B7CF6", "#2DD4BF", "#FBBF24"];
function avatarStyle(i) { const c = AVATAR_COLORS[i % AVATAR_COLORS.length]; return { background: `linear-gradient(135deg, ${c}, ${c}CC)` }; }
function initials(name) { return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase(); }

let caseCounter = 2046;
function nextCaseId() { return `AUR-${caseCounter++}`; }

const SEED_CASES = [
  { id: "c1", name: "Grace Whitfield", age: 58, sex: "Female", caseId: "AUR-2041", priority: "High", complaint: "Productive cough, fever & pleuritic chest pain — 4 days", status: "Diagnosis in Progress", time: "6 minutes ago", avatar: 0, progressFilled: 6, progressActive: true, primary: { name: "Community-acquired Pneumonia", confidence: 84, blurb: "Lung infection presenting with productive cough, fever, and pleuritic pain.", next: "Chest X-ray and start empiric antibiotics pending culture." }, differential: [] },
  { id: "c2", name: "Elena Cruz", age: 24, sex: "Female", caseId: "AUR-2042", priority: "High", complaint: "Migrating right lower quadrant abdominal pain — 16 hours", status: "Awaiting Tests", time: "18 minutes ago", avatar: 1, progressFilled: 5, progressActive: true, primary: { name: "Acute Appendicitis", confidence: 88, blurb: "Pain that migrated to the right lower quadrant, classic for appendiceal inflammation.", next: "Surgical consult and imaging before it progresses." }, differential: [] },
  { id: "c3", name: "Harold Whitaker", age: 71, sex: "Male", caseId: "AUR-2043", priority: "High", complaint: "Worsening breathlessness, leg swelling & orthopnea — 1 week", status: "Diagnosis in Progress", time: "2 hours ago", avatar: 2, progressFilled: 4, progressActive: true, primary: { name: "Decompensated Heart Failure", confidence: 86, blurb: "Fluid overload picture with orthopnea and peripheral edema.", next: "Start diuresis and daily weights; check BNP and echo." }, differential: [] },
  { id: "c4", name: "Marcus Owusu", age: 19, sex: "Male", caseId: "AUR-2044", priority: "Medium", complaint: "Recurrent wheeze, cough & nighttime breathlessness — 3 weeks", status: "Awaiting Exam", time: "35 minutes ago", avatar: 3, progressFilled: 3, progressActive: true, primary: { name: "Uncontrolled Asthma", confidence: 79, blurb: "Recurring wheeze and nocturnal symptoms suggest poor asthma control.", next: "Step up controller therapy and reassess inhaler technique." }, differential: [] },
  { id: "c5", name: "Ingrid Solberg", age: 44, sex: "Female", caseId: "AUR-2045", priority: "Medium", complaint: "Sudden facial droop and slurred speech, resolved within the hour", status: "Awaiting Tests", time: "50 minutes ago", avatar: 4, progressFilled: 4, progressActive: true, primary: { name: "Suspected TIA", confidence: 81, blurb: "Transient neurological deficit resolving within an hour — a warning sign worth acting on.", next: "Urgent carotid imaging and stroke-risk workup." }, differential: [] },
  { id: "c6", name: "Owen Bright", age: 33, sex: "Male", caseId: "AUR-2036", priority: "Low", complaint: "Two-day sore throat with low-grade fever", status: "Resolved", time: "1 day ago", avatar: 0, progressFilled: 9, progressActive: false, completed: true, primary: { name: "Viral pharyngitis", confidence: 77, blurb: "Self-limited viral throat infection.", next: "Supportive care. Resolved without antibiotics." }, differential: [] },
  { id: "c7", name: "Nadia Farouk", age: 29, sex: "Female", caseId: "AUR-2029", priority: "Low", complaint: "Itchy rash on both forearms after gardening", status: "Resolved", time: "3 days ago", avatar: 4, progressFilled: 9, progressActive: false, completed: true, primary: { name: "Contact dermatitis", confidence: 82, blurb: "Localized allergic skin reaction consistent with plant exposure.", next: "Topical steroid and allergen avoidance. Resolved." }, differential: [] },
];

const INSIGHTS = [
  { tone: "danger", icon: ShieldAlert, title: "Borderline hypoxia", body: "SpO\u2082 at 92% in a patient with diabetes — a short-stay observation with supplemental oxygen may be safer than discharge." },
  { tone: "warn", icon: AlertTriangle, title: "Penicillin allergy on file", body: "Avoid amoxicillin and co-amoxiclav here. Antibiotic suggestions have already been filtered to non-penicillin options." },
  { tone: "success", icon: CheckCircle2, title: "PE safely excluded", body: "A negative D-dimer paired with a low Wells score rules out pulmonary embolism without needing a CT scan." },
];

const ACTIVITY = [
  { text: "Lab results added — Elena Cruz", time: "12 minutes ago" },
  { text: "Case reassigned — Harold Whitaker", time: "40 minutes ago" },
  { text: "New case created — Grace Whitfield", time: "1 hour ago" },
];

const ANALYZING_LINES = ["Reviewing the description…", "Cross-referencing clinical patterns…", "Ranking possibilities…"];

function inferPriority(text, chips) {
  const hay = (text + " " + chips.join(" ")).toLowerCase();
  if (["chest pain", "shortness of breath", "severe"].some((k) => hay.includes(k))) return "High";
  if (chips.length === 0 && text.trim().length < 8) return "Medium";
  return "Medium";
}

/* --------------------------------- tour --------------------------------- */

const TOUR_STEPS = [
  { id: "brand-mark", view: "dashboard", title: "This is Aura", body: "The mark pulses whenever Aura is actively working through a case — otherwise it sits quiet." },
  { id: "search-bar", view: "dashboard", title: "Search across every case", body: "Filter the caseload by patient name or complaint as you type." },
  { id: "new-case-btn", view: "dashboard", title: "Start a new case", body: "Opens patient intake whenever you're ready to describe a new case." },
  { id: "stat-row", view: "dashboard", title: "Your caseload at a glance", body: "Active cases, high-priority ones, and how quickly cases are typically resolved." },
  { id: "case-card-0", view: "dashboard", title: "Every case, at a glance", body: "Patient, chief complaint, Aura's leading suggestion with its confidence, and where the case stands — all in one card. Click any card to open it." },
  { id: "ai-insights", view: "dashboard", title: "AI insights", body: "Aura surfaces things worth double-checking on its own — risk flags, allergies on file, or concerns it's already ruled out." },
  { id: "intake-textarea", view: "intake", title: "Describe the case", body: "Write it the way you'd say it out loud — duration, severity, anything relevant. More detail sharpens the results." },
  { id: "intake-chips", view: "intake", title: "Or tap common symptoms", body: "Quick-add chips are a shortcut when you already know the key symptoms." },
  { id: "intake-analyze-btn", view: "intake", title: "Run the analysis", body: "Aura reviews the description and opens the new case with a ranked set of possibilities." },
  { id: "case-differential-0", view: "case", title: "Read the differential", body: "Each entry is one possible explanation, ranked by how closely it matches the case — never a confirmed diagnosis." },
  { id: "case-refine-input", view: "case", title: "Refine the picture", body: "Add detail or answer a follow-up here. Aura reorders the differential as the picture gets clearer." },
  { id: "theme-toggle", view: "dashboard", title: "Light or dark, your call", body: "Switch the whole interface any time. That's the whole tour." },
];

const DEMO_TEXT = "Three days of chest tightness that gets worse when climbing stairs, mild shortness of breath, no radiation.";

/* ------------------------------ small pieces ------------------------------ */

function AuraMark({ size = 36, id, active = false }) {
  return (
    <div id={id} className={"aura-mark" + (active ? " aura-mark-active" : "")} style={{ width: size, height: size }}>
      <span className="aura-mark-glow" />
      <span className="aura-mark-core"><Activity size={size * 0.52} strokeWidth={2.3} /></span>
    </div>
  );
}

function CountUp({ value, suffix = "" }) {
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

function AmbientBlobs() {
  return (
    <div className="ambient-blobs" aria-hidden="true">
      <span className="blob b1" />
      <span className="blob b2" />
      <span className="blob b3" />
    </div>
  );
}

function SideNavGroup({ children }) {
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
      // This effect runs after each layout so the indicator can follow the
      // selected link. Keep the existing state when the measurement is
      // unchanged; otherwise React would render forever.
      setInd((current) => (
        current && current.top === next.top && current.height === next.height
          ? current
          : next
      ));
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

function PriorityBadge({ level }) {
  const cls = level === "High" ? "badge-danger" : level === "Medium" ? "badge-warn" : "badge-flat";
  return <span className={"pill " + cls}>{level}</span>;
}

function StatusRow({ status, time }) {
  const dot = status === "Resolved" ? "dot-success" : status === "Diagnosis in Progress" ? "dot-primary" : "dot-warn";
  return (
    <div className="status-row">
      <span className={"status-pill " + dot}><i className={"dot " + dot} />{status}</span>
      <span className="time-stamp"><Clock size={12} /> {time}</span>
    </div>
  );
}

function ProgressBar({ filled, active }) {
  const total = 9;
  return (
    <div className="progress-row">
      {Array.from({ length: total }).map((_, i) => {
        let cls = "seg";
        if (i < filled) cls += " seg-done";
        else if (i === filled && active) cls += " seg-active";
        return <span key={i} className={cls} style={{ transitionDelay: (i * 25) + "ms" }} />;
      })}
    </div>
  );
}

function CaseCard({ c, index, pos, onOpen }) {
  return (
    <button className="case-card" id={index === 0 ? "case-card-0" : undefined} style={{ animationDelay: (pos ?? 0) * 65 + "ms" }} onClick={() => onOpen(c)}>
      <div className="case-top">
        <div className="case-who">
          <span className="avatar" style={avatarStyle(c.avatar)}>{initials(c.name)}</span>
          <div>
            <h3>{c.name}</h3>
            <span className="case-sub">{c.age}{c.sex[0]} · {c.caseId}</span>
          </div>
        </div>
        <PriorityBadge level={c.priority} />
      </div>
      <p className="case-complaint">{c.complaint}</p>
      <div className="dx-row">
        <span className="dx-name"><Activity size={14} /> {c.primary.name}</span>
        <span className="dx-conf">{c.primary.confidence}%</span>
      </div>
      <ProgressBar filled={c.progressFilled} active={c.progressActive} />
      <StatusRow status={c.status} time={c.time} />
    </button>
  );
}

function AnalyzingOverlay() {
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

/* --------------------------------- app --------------------------------- */

export default function App() {
  const [theme, setTheme] = useState("dark");
  const [view, setView] = useState("dashboard");
  const [cases, setCases] = useState(SEED_CASES);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [showNotif, setShowNotif] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [intakeName, setIntakeName] = useState("");
  const [intakeAge, setIntakeAge] = useState("");
  const [intakeSex, setIntakeSex] = useState("Female");
  const [intakeText, setIntakeText] = useState("");
  const [intakeChips, setIntakeChips] = useState([]);

  const [refineText, setRefineText] = useState("");
  const [refineLog, setRefineLog] = useState([]);
  const [openFaq, setOpenFaq] = useState(0);

  const [showPrompt, setShowPrompt] = useState(false);
  const [tourActive, setTourActive] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [spot, setSpot] = useState(null);
  const [tipPos, setTipPos] = useState(null);

  useEffect(() => { const t = setTimeout(() => setShowPrompt(true), 700); return () => clearTimeout(t); }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { setMobileNavOpen(false); }, [view]);

  const toggleChip = (c) => setIntakeChips((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const activeCases = useMemo(() => cases.filter((c) => !c.completed), [cases]);
  const completedCases = useMemo(() => cases.filter((c) => c.completed), [cases]);
  const filteredActive = useMemo(() => {
    if (!search.trim()) return activeCases;
    const q = search.toLowerCase();
    return activeCases.filter((c) => c.name.toLowerCase().includes(q) || c.complaint.toLowerCase().includes(q) || c.primary.name.toLowerCase().includes(q));
  }, [activeCases, search]);

  const selectedCase = cases.find((c) => c.id === selectedId) || null;

  const openCase = (c) => { setSelectedId(c.id); setRefineLog([]); setRefineText(""); setView("case"); };

  const createCase = (text, chips, opts = {}) => {
    const finalText = text ?? intakeText;
    const finalChips = chips ?? intakeChips;
    const scored = scoreConditions(finalText, finalChips);
    const top = scored[0];
    const id = "u" + Date.now();
    const newCase = {
      id,
      name: opts.name || intakeName || "New patient",
      age: opts.age || intakeAge || "—",
      sex: opts.sex || intakeSex,
      caseId: nextCaseId(),
      priority: inferPriority(finalText, finalChips),
      complaint: finalText || finalChips.join(", ") || "No description provided",
      status: "Diagnosis in Progress",
      time: "Just now",
      avatar: Math.floor(Math.random() * AVATAR_COLORS.length),
      progressFilled: Math.min(7, 2 + scored.length),
      progressActive: true,
      primary: top
        ? { name: top.name, confidence: Math.min(95, top.score * 16 + 42), blurb: top.blurb, next: top.next }
        : { name: "Undifferentiated presentation", confidence: 40, blurb: "Not enough detail yet to suggest a leading possibility.", next: "Add more detail to sharpen the differential." },
      differential: scored,
    };
    setCases((prev) => [newCase, ...prev]);
    return newCase;
  };

  const handleAnalyze = () => {
    setAnalyzing(true);
    setTimeout(() => {
      const c = createCase();
      setIntakeName(""); setIntakeAge(""); setIntakeText(""); setIntakeChips([]);
      setAnalyzing(false);
      openCase(c);
    }, 1500);
  };

  const handleRefineSend = () => {
    if (!refineText.trim() || !selectedCase) return;
    const merged = selectedCase.complaint + " " + refineText;
    const scored = scoreConditions(merged, []);
    const top = scored[0];
    setRefineLog((log) => [...log, { role: "user", text: refineText }, { role: "aura", text: "Updated the differential based on that detail." }]);
    setCases((prev) => prev.map((c) => c.id === selectedCase.id ? {
      ...c,
      complaint: merged,
      differential: scored.length ? scored : c.differential,
      primary: top ? { name: top.name, confidence: Math.min(95, top.score * 16 + 42), blurb: top.blurb, next: top.next } : c.primary,
    } : c));
    setRefineText("");
  };

  /* ---- tour engine ---- */

  const ensureDemoCase = () => {
    if (selectedCase && selectedCase.differential.length > 0) return;
    const c = createCase(DEMO_TEXT, [], { name: "Demo patient", age: 47, sex: "Female" });
    setSelectedId(c.id);
  };

  const startTour = (fromIndex = 0) => { setShowPrompt(false); setTourStep(fromIndex); setTourActive(true); };
  const endTour = () => { setTourActive(false); setSpot(null); setTipPos(null); };
  const nextStep = () => { if (tourStep >= TOUR_STEPS.length - 1) endTour(); else setTourStep((s) => s + 1); };
  const prevStep = () => setTourStep((s) => Math.max(0, s - 1));

  useEffect(() => {
    if (!tourActive) return;
    const step = TOUR_STEPS[tourStep];
    if (step.view === "case") ensureDemoCase();
    if (step.view !== view) setView(step.view);
  }, [tourActive, tourStep]); // eslint-disable-line

  useEffect(() => {
    if (!tourActive) return;
    const step = TOUR_STEPS[tourStep];
    if (step.view !== view) return;
    let t1, t2;
    const measure = () => {
      const el = document.getElementById(step.id);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      t2 = setTimeout(() => {
        const r = el.getBoundingClientRect();
        const pad = 8;
        setSpot({ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 });
        const vh = window.innerHeight, vw = window.innerWidth;
        const below = r.bottom + 230 < vh;
        const top = below ? Math.min(r.bottom + 18, vh - 230) : Math.max(r.top - 210, 16);
        const left = Math.min(Math.max(r.left, 16), vw - 336);
        setTipPos({ top, left });
      }, 260);
    };
    t1 = setTimeout(measure, 30);
    window.addEventListener("resize", measure);
    return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener("resize", measure); };
  }, [tourActive, tourStep, view]);

  useEffect(() => {
    if (!tourActive) return;
    const onKey = (e) => { if (e.key === "Escape") endTour(); if (e.key === "ArrowRight") nextStep(); if (e.key === "ArrowLeft") prevStep(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tourActive, tourStep]); // eslint-disable-line

  const vars = theme === "dark" ? DARK_VARS : LIGHT_VARS;
  const rootStyle = Object.fromEntries(Object.entries(vars));

  return (
    <div className="app-shell" style={rootStyle}>
      <style>{CSS}</style>
      <AmbientBlobs />

      <aside className={"sidebar" + (mobileNavOpen ? " mobile-open" : "")}>
        <div className="sidebar-brand">
          <AuraMark size={34} id="brand-mark" active={analyzing} />
          <div>
            <div className="brand-word">Aura</div>
            <div className="brand-sub">Clinical Decision Support</div>
          </div>
        </div>

        <button className="mobile-nav-trigger" aria-label="Toggle navigation" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((open) => !open)}>
          <Menu size={18} />
        </button>

        <div className="side-block">
          <span className="side-label">Overview</span>
          <SideNavGroup>
            <button className={"side-link" + (view === "dashboard" ? " is-active" : "")} onClick={() => setView("dashboard")}>
              <LayoutDashboard size={16} /> Dashboard
            </button>
            <button className={"side-link" + (view === "active" ? " is-active" : "")} onClick={() => setView("active")}>
              <FolderOpen size={16} /> Active Cases <span className="count">{activeCases.length}</span>
            </button>
            <button className={"side-link" + (view === "completed" ? " is-active" : "")} onClick={() => setView("completed")}>
              <CheckCircle2 size={16} /> Completed Cases <span className="count">{completedCases.length}</span>
            </button>
          </SideNavGroup>
        </div>

        <div className="side-block">
          <span className="side-label">Clinical</span>
          <SideNavGroup>
            <button className={"side-link" + (view === "intake" ? " is-active" : "")} onClick={() => setView("intake")}>
              <FilePlus2 size={16} /> New Patient Intake
            </button>
            <button className={"side-link" + (view === "knowledge" ? " is-active" : "")} onClick={() => setView("knowledge")}>
              <BookOpen size={16} /> Knowledge Base
            </button>
          </SideNavGroup>
        </div>

        <div className="sidebar-bottom">
          <button className="side-link" onClick={() => setView("settings")}><SettingsIcon size={16} /> Settings</button>
          <button id="theme-toggle" className="side-link" onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}>
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />} {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <button className="profile-card" onClick={() => setView("settings")}>
            <span className="avatar" style={avatarStyle(2)}>JN</span>
            <div>
              <div className="profile-name">Dr. Julia Nolan</div>
              <div className="profile-role">Internal Medicine</div>
            </div>
          </button>
          <p className="disclaimer-mini">Prototype — not a diagnosis, not for emergencies.</p>
        </div>
      </aside>

      <div className="main-col">
        <header className={"topbar" + (scrolled ? " is-scrolled" : "")}>
          <div id="search-bar" className="search-bar">
            <Search size={16} />
            <input placeholder="Search patients, cases, complaints…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <span className="kbd">⌘K</span>
          </div>
          <div className="topbar-right">
            <button id="new-case-btn" className="btn-primary" onClick={() => setView("intake")}><Plus size={16} /> New Case</button>
            <div className="notif-wrap">
              <button className="icon-btn" onClick={() => setShowNotif((s) => !s)}><Bell size={17} /><span className="notif-dot" /></button>
              {showNotif && (
                <div className="notif-panel">
                  <h4>Recent activity</h4>
                  {ACTIVITY.map((a) => (
                    <div className="notif-item" key={a.text}><span>{a.text}</span><span className="notif-time">{a.time}</span></div>
                  ))}
                </div>
              )}
            </div>
            <button className="tour-btn" onClick={() => startTour(0)} title="Take the tour"><MessageCircleQuestion size={17} /></button>
          </div>
        </header>

        <main className="content">
          <div key={view} className="view-fade">
            {view === "dashboard" && (
              <DashboardView cases={filteredActive} onOpen={openCase} activeCases={activeCases} searchKey={search} />
            )}
            {view === "active" && (
              <ListView title="Active cases" subtitle="Every case currently moving through the diagnostic workflow." cases={filteredActive} onOpen={openCase} searchKey={search} />
            )}
            {view === "completed" && (
              <ListView title="Completed cases" subtitle="Cases that have been resolved." cases={completedCases} onOpen={openCase} searchKey="c" />
            )}
            {view === "intake" && (
              <IntakeView
                name={intakeName} setName={setIntakeName}
                age={intakeAge} setAge={setIntakeAge}
                sex={intakeSex} setSex={setIntakeSex}
                text={intakeText} setText={setIntakeText}
                chips={intakeChips} toggleChip={toggleChip}
                onAnalyze={handleAnalyze}
              />
            )}
            {view === "case" && selectedCase && (
              <CaseDetailView c={selectedCase} refineText={refineText} setRefineText={setRefineText} refineLog={refineLog} onSend={handleRefineSend} onBack={() => setView("dashboard")} />
            )}
            {view === "knowledge" && <KnowledgeView openFaq={openFaq} setOpenFaq={setOpenFaq} />}
            {view === "settings" && <SettingsView />}
          </div>
        </main>
      </div>

      {analyzing && <AnalyzingOverlay />}

      {/* ---------------- tour intro modal ---------------- */}
      {showPrompt && !tourActive && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <AuraMark size={44} />
            <h3>Want a quick tour?</h3>
            <p>We'll walk through Aura's main features one at a time, about a minute total. Everything else dims so it's easy to follow.</p>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setShowPrompt(false)}>Not now</button>
              <button className="btn-primary" onClick={() => startTour(0)}>Take the tour <ArrowRight size={15} /></button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- tour overlay ---------------- */}
      {tourActive && (
        <>
          <div className="tour-block" onClick={(e) => e.stopPropagation()} />
          {spot && <div className="tour-spot" style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }} />}
          {tipPos && (
            <div key={tourStep} className="tour-tip" style={{ top: tipPos.top, left: tipPos.left }}>
              <div className="tour-tip-head">
                <span className="tour-step-count">Step {tourStep + 1} of {TOUR_STEPS.length}</span>
                <button className="tour-close" onClick={endTour}><X size={15} /></button>
              </div>
              <h4>{TOUR_STEPS[tourStep].title}</h4>
              <p>{TOUR_STEPS[tourStep].body}</p>
              <div className="tour-tip-foot">
                <div className="tour-dots">
                  {TOUR_STEPS.map((_, i) => <span key={i} className={"dot-i" + (i === tourStep ? " dot-i-active" : "")} />)}
                </div>
                <div className="tour-nav-btns">
                  {tourStep > 0 && <button className="btn-ghost sm" onClick={prevStep}><ChevronLeft size={15} /> Back</button>}
                  <button className="btn-primary sm" onClick={nextStep}>
                    {tourStep === TOUR_STEPS.length - 1 ? "Done" : "Next"} <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------ dashboard view ------------------------------ */

function DashboardView({ cases, onOpen, activeCases, searchKey }) {
  const highCount = activeCases.filter((c) => c.priority === "High").length;
  const stats = [
    { icon: FolderOpen, value: activeCases.length, suffix: "", label: "Active cases" },
    { icon: AlertTriangle, value: highCount, suffix: "", label: "High priority" },
    { icon: Clock, value: 34, suffix: "m", label: "Avg. time to diagnosis" },
    { icon: CheckCircle2, value: 2, suffix: "", label: "Completed today" },
  ];
  return (
    <div className="dash-grid">
      <div className="dash-main">
        <div id="stat-row" className="stat-row">
          {stats.map((s, i) => (
            <div className="stat-card" style={{ animationDelay: i * 70 + "ms" }} key={s.label}>
              <s.icon size={16} />
              <div><div className="stat-num"><CountUp value={s.value} suffix={s.suffix} /></div><div className="stat-label">{s.label}</div></div>
            </div>
          ))}
        </div>

        <div className="section-head">
          <div>
            <h2>Active cases</h2>
            <p className="muted">Cases currently moving through the diagnostic workflow</p>
          </div>
        </div>
        <div className="case-grid" key={searchKey}>
          {cases.slice(0, 4).map((c, i) => <CaseCard c={c} index={i} pos={i} key={c.id} onOpen={onOpen} />)}
        </div>
        {cases.length === 0 && <p className="muted">No cases match that search.</p>}
      </div>

      <aside className="dash-side">
        <div id="ai-insights" className="insights-panel">
          <div className="panel-head"><Sparkles size={16} /><div><h3>AI insights</h3><p className="muted">Aura's proactive observations</p></div></div>
          {INSIGHTS.map((ins, i) => (
            <div className={"insight-card tone-" + ins.tone} style={{ animationDelay: (i * 90 + 120) + "ms" }} key={ins.title}>
              <ins.icon size={16} />
              <div><h4>{ins.title}</h4><p>{ins.body}</p></div>
            </div>
          ))}
        </div>
        <div className="activity-panel">
          <h3>Recent activity</h3>
          <p className="muted">Latest updates across your cases</p>
          {ACTIVITY.map((a) => (
            <div className="activity-row" key={a.text}><span>{a.text}</span><span className="muted small">{a.time}</span></div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function ListView({ title, subtitle, cases, onOpen, searchKey }) {
  return (
    <div className="list-view">
      <div className="section-head"><div><h2>{title}</h2><p className="muted">{subtitle}</p></div></div>
      <div className="case-grid wide" key={searchKey}>
        {cases.map((c, i) => <CaseCard c={c} index={-1} pos={i} key={c.id} onOpen={onOpen} />)}
      </div>
      {cases.length === 0 && <p className="muted">Nothing here yet.</p>}
    </div>
  );
}

/* ------------------------------ intake view ------------------------------ */

function IntakeView({ name, setName, age, setAge, sex, setSex, text, setText, chips, toggleChip, onAnalyze }) {
  return (
    <div className="intake-wrap">
      <div className="intake-card">
        <span className="eyebrow"><Sparkles size={12} /> New patient intake</span>
        <h2>Describe the case</h2>
        <div className="intake-fields">
          <label className="field"><span>Patient name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sam Rivera" /></label>
          <label className="field small"><span>Age</span><input value={age} onChange={(e) => setAge(e.target.value)} placeholder="e.g. 42" /></label>
          <label className="field small"><span>Sex</span>
            <select value={sex} onChange={(e) => setSex(e.target.value)}>
              <option>Female</option><option>Male</option><option>Other</option>
            </select>
          </label>
        </div>
        <textarea id="intake-textarea" className="symptom-input" rows={6}
          placeholder="e.g. 54F, 3-day history of intermittent chest tightness, worse on exertion, mild dyspnea, no radiation..."
          value={text} onChange={(e) => setText(e.target.value)} />
        <div id="intake-chips" className="chip-row">
          {CHIP_OPTIONS.map((c) => (
            <button key={c} className={"chip" + (chips.includes(c) ? " chip-active" : "")} onClick={() => toggleChip(c)}>
              {chips.includes(c) && <Check size={12} />} {c}
            </button>
          ))}
        </div>
        <button id="intake-analyze-btn" className="btn-primary lg" disabled={!text.trim() && chips.length === 0} onClick={onAnalyze}>
          Run the analysis <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

/* --------------------------- case detail view --------------------------- */

function CaseDetailView({ c, refineText, setRefineText, refineLog, onSend, onBack }) {
  const list = c.differential.length ? c.differential : [{ ...c.primary, id: "primary", score: 3, matched: [] }];
  return (
    <div className="case-detail">
      <button className="btn-ghost sm back-btn" onClick={onBack}><ChevronLeft size={15} /> Back to dashboard</button>
      <div className="case-detail-head">
        <span className="avatar lg" style={avatarStyle(c.avatar)}>{initials(c.name)}</span>
        <div className="case-detail-info">
          <h2>{c.name}</h2>
          <span className="muted">{c.age}{c.sex[0]} · {c.caseId} · {c.complaint}</span>
        </div>
        <PriorityBadge level={c.priority} />
      </div>

      <div className="result-list">
        {list.map((r, i) => {
          const conf = r.confidence ?? Math.min(95, (r.score || 1) * 16 + 42);
          return (
            <div className="result-card" style={{ animationDelay: i * 70 + "ms" }} id={i === 0 ? "case-differential-0" : undefined} key={r.id || i}>
              <div className="result-card-top">
                <h3>{r.name}</h3>
                <span className="pill badge-conf">{conf}%</span>
              </div>
              <p className="result-blurb">{r.blurb}</p>
              {r.matched && r.matched.length > 0 && (
                <div className="tag-row">{r.matched.map((m) => <span className="tag" key={m}>{m}</span>)}</div>
              )}
              <p className="result-next"><strong>Consider:</strong> {r.next}</p>
            </div>
          );
        })}
      </div>

      {!c.completed && (
        <div className="refine-block">
          <h3>Refine the picture</h3>
          {refineLog.length > 0 && (
            <div className="refine-log">
              {refineLog.map((m, i) => <div key={i} className={"refine-msg " + (m.role === "user" ? "from-user" : "from-aura")}>{m.text}</div>)}
            </div>
          )}
          <div className="refine-row">
            <input id="case-refine-input" placeholder="Add detail or answer a follow-up…" value={refineText}
              onChange={(e) => setRefineText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onSend()} />
            <button className="btn-primary" onClick={onSend}><Send size={15} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ knowledge view ------------------------------ */

function KnowledgeView({ openFaq, setOpenFaq }) {
  return (
    <div className="knowledge-view">
      <h2>Knowledge base</h2>
      <p className="muted" style={{ marginBottom: 24 }}>Privacy, accuracy, and how Aura fits into a diagnostic workflow.</p>
      <div className="faq-list">
        {FAQS.map((f, i) => (
          <div className={"faq-item" + (openFaq === i ? " is-open" : "")} key={f.q}>
            <button className="faq-q" onClick={() => setOpenFaq(openFaq === i ? -1 : i)}>
              <span>{f.q}</span>
              <ChevronRight size={16} className="chev" />
            </button>
            <div className="faq-a-wrap">
              <div className="faq-a-inner"><p className="faq-a">{f.a}</p></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ settings view ------------------------------ */

function SettingsView() {
  return (
    <div className="settings-view">
      <h2>Settings</h2>
      <p className="muted" style={{ marginBottom: 24 }}>This is a prototype, so settings here are for show — nothing is wired up yet.</p>
      <div className="settings-card">
        <div className="settings-row"><User2 size={16} /><div><div className="settings-label">Name</div><div className="muted">Dr. Julia Nolan</div></div></div>
        <div className="settings-row"><SettingsIcon size={16} /><div><div className="settings-label">Specialty</div><div className="muted">Internal Medicine</div></div></div>
        <div className="settings-row"><Bell size={16} /><div><div className="settings-label">Notifications</div><div className="muted">On for high-priority cases</div></div></div>
      </div>
    </div>
  );
}

/* ---------------------------------- css ---------------------------------- */

const DARK_VARS = {
  "--bg": "#0A0C11", "--sidebar-bg": "#0B0D13", "--surface": "#12151C", "--surface-2": "#171B24",
  "--border": "#22262F", "--ink": "#F1F2F5", "--ink-soft": "#9AA0AC", "--ink-faint": "#5C626D",
  "--primary": "#5B7FFF", "--primary-dark": "#3E5CE0", "--teal": "#2DD4BF", "--teal-rgb": "45,212,191",
  "--violet": "#8B7CF6",
  "--danger": "#FB7185", "--danger-bg": "rgba(251,113,133,0.14)",
  "--warn": "#FBBF24", "--warn-bg": "rgba(251,191,36,0.14)",
  "--success": "#34D399", "--success-bg": "rgba(52,211,153,0.14)",
  "--shadow": "0 20px 50px rgba(0,0,0,0.45)",
  "--topbar-scroll-bg": "rgba(10,12,17,0.72)",
};
const LIGHT_VARS = {
  "--bg": "#F5F6FA", "--sidebar-bg": "#FFFFFF", "--surface": "#FFFFFF", "--surface-2": "#F1F2F7",
  "--border": "#E3E5EE", "--ink": "#161821", "--ink-soft": "#5B6072", "--ink-faint": "#9498A8",
  "--primary": "#4A4FE0", "--primary-dark": "#3638B0", "--teal": "#0D9488", "--teal-rgb": "13,148,136",
  "--violet": "#7C6FF0",
  "--danger": "#E11D48", "--danger-bg": "rgba(225,29,72,0.08)",
  "--warn": "#D97706", "--warn-bg": "rgba(217,119,6,0.09)",
  "--success": "#0E9F6E", "--success-bg": "rgba(14,159,110,0.09)",
  "--shadow": "0 20px 50px rgba(30,32,60,0.12)",
  "--topbar-scroll-bg": "rgba(245,246,250,0.72)",
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');

*{box-sizing:border-box;}
.app-shell{min-height:100vh; background:var(--bg); color:var(--ink); font-family:'Inter',sans-serif; display:flex; transition:background .2s ease, color .2s ease; position:relative;}
button{font-family:inherit; cursor:pointer;}
h1,h2,h3,h4{font-family:'Fraunces',serif; margin:0; font-weight:600; letter-spacing:-0.01em; color:var(--ink);}
p{margin:0; line-height:1.55;}
input,select,textarea{font-family:'Inter',sans-serif; color:var(--ink);}
.muted{color:var(--ink-soft);}
.muted.small{font-size:12px;}

/* ambient background */
.ambient-blobs{position:fixed; inset:0; overflow:hidden; pointer-events:none; z-index:0;}
.blob{position:absolute; border-radius:50%; filter:blur(75px); opacity:.16;}
.blob.b1{width:420px; height:420px; background:var(--primary); top:-140px; left:260px; animation:drift 26s ease-in-out infinite alternate;}
.blob.b2{width:360px; height:360px; background:var(--teal); top:100px; right:-110px; animation:drift 21s ease-in-out infinite alternate; animation-delay:-6s;}
.blob.b3{width:300px; height:300px; background:var(--violet); bottom:-150px; left:38%; animation:drift 24s ease-in-out infinite alternate; animation-delay:-12s;}
@keyframes drift{0%{transform:translate(0,0) scale(1);} 50%{transform:translate(34px,-24px) scale(1.08);} 100%{transform:translate(-22px,16px) scale(0.95);}}

/* sidebar */
.sidebar{width:252px; flex-shrink:0; background:var(--sidebar-bg); border-right:1px solid var(--border); display:flex; flex-direction:column; height:100vh; position:sticky; top:0; padding:20px 14px; z-index:2; animation:slideInLeft .5s cubic-bezier(.22,1,.36,1) both;}
@keyframes slideInLeft{from{opacity:0; transform:translateX(-14px);} to{opacity:1; transform:translateX(0);}}
.sidebar-brand{display:flex; align-items:center; gap:10px; padding:6px 8px 22px; border-radius:12px; transition:background .2s ease;}
.sidebar-brand:hover{background:var(--surface-2);}
.sidebar-brand:hover .aura-mark-glow{opacity:.95; animation-duration:1.6s;}
.brand-word{font-family:'Fraunces',serif; font-size:17px; font-weight:600; color:var(--ink);}
.brand-sub{font-size:11px; color:var(--ink-faint);}
.side-block{margin-bottom:18px;}
.side-label{display:block; font-size:10.5px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--ink-faint); padding:8px 10px 4px; font-family:'IBM Plex Mono',monospace;}
.side-section{position:relative; display:flex; flex-direction:column; gap:2px;}
.side-indicator{position:absolute; left:0; right:0; background:var(--surface-2); border-radius:10px; z-index:0; transition:top .3s cubic-bezier(.22,1,.36,1), height .3s cubic-bezier(.22,1,.36,1);}
.side-link{position:relative; z-index:1; display:flex; align-items:center; gap:10px; background:none; border:none; padding:9px 10px; border-radius:10px; color:var(--ink-soft); font-size:13.5px; font-weight:500; text-align:left; transition:color .15s ease, background .15s ease;}
.side-link:hover{background:var(--surface-2); color:var(--ink);}
.side-link.is-active{color:var(--primary);}
.side-link .count{margin-left:auto; background:var(--surface-2); color:var(--ink-faint); font-size:11px; padding:1px 7px; border-radius:999px; font-family:'IBM Plex Mono',monospace;}
.side-link.is-active .count{color:var(--primary);}
.sidebar-bottom{margin-top:auto; display:flex; flex-direction:column; gap:4px; border-top:1px solid var(--border); padding-top:12px;}
.profile-card{display:flex; align-items:center; gap:10px; background:none; border:none; padding:8px 10px; border-radius:10px; text-align:left; transition:background .15s ease;}
.profile-card:hover{background:var(--surface-2);}
.profile-name{font-size:13px; font-weight:600; color:var(--ink);}
.profile-role{font-size:11.5px; color:var(--ink-faint);}
.disclaimer-mini{font-size:10.5px; color:var(--ink-faint); padding:6px 10px 0; line-height:1.4;}

/* aura mark */
.aura-mark{position:relative; display:flex; align-items:center; justify-content:center; flex-shrink:0; border-radius:11px;}
.aura-mark-glow{position:absolute; inset:-40%; border-radius:14px; background:conic-gradient(from 180deg, var(--teal), var(--primary), var(--teal)); filter:blur(12px); opacity:.6; animation:auraPulse 4s ease-in-out infinite; transition:opacity .3s ease;}
.aura-mark-active .aura-mark-glow{animation-duration:1.1s; opacity:.9;}
.aura-mark-core{position:relative; width:100%; height:100%; border-radius:11px; background:linear-gradient(135deg, var(--teal), var(--primary)); display:flex; align-items:center; justify-content:center; color:#fff;}
@keyframes auraPulse{0%,100%{transform:scale(1); opacity:.5;} 50%{transform:scale(1.15); opacity:.85;}}

/* topbar */
.main-col{flex:1; min-width:0; display:flex; flex-direction:column; position:relative; z-index:1;}
.topbar{position:sticky; top:0; z-index:15; display:flex; align-items:center; gap:16px; padding:16px 28px; background:transparent; border-bottom:1px solid transparent; box-shadow:none; backdrop-filter:blur(0px); transition:background .3s ease, border-color .3s ease, box-shadow .3s ease, backdrop-filter .3s ease; animation:fadeDown .5s cubic-bezier(.22,1,.36,1) both; animation-delay:.06s;}
.topbar.is-scrolled{background:var(--topbar-scroll-bg); backdrop-filter:blur(12px); border-bottom:1px solid var(--border); box-shadow:0 10px 26px rgba(0,0,0,0.10);}
@keyframes fadeDown{from{opacity:0; transform:translateY(-10px);} to{opacity:1; transform:translateY(0);}}
.search-bar{flex:1; max-width:520px; display:flex; align-items:center; gap:10px; background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:10px 14px; color:var(--ink-faint); transition:border-color .2s ease, box-shadow .2s ease;}
.search-bar:focus-within{border-color:var(--primary); box-shadow:0 0 0 3px rgba(91,127,255,0.14);}
.search-bar input{flex:1; background:none; border:none; outline:none; font-size:13.5px; color:var(--ink);}
.search-bar input::placeholder{color:var(--ink-faint);}
.kbd{font-family:'IBM Plex Mono',monospace; font-size:11px; background:var(--surface-2); padding:2px 6px; border-radius:5px;}
.topbar-right{display:flex; align-items:center; gap:10px; margin-left:auto;}
.icon-btn{position:relative; background:var(--surface); border:1px solid var(--border); border-radius:10px; width:38px; height:38px; display:flex; align-items:center; justify-content:center; color:var(--ink-soft); transition:border-color .2s ease, color .2s ease, transform .15s cubic-bezier(.22,1,.36,1);}
.icon-btn:hover{border-color:var(--primary); color:var(--primary); transform:translateY(-1px);}
.notif-dot{position:absolute; top:8px; right:9px; width:6px; height:6px; border-radius:50%; background:var(--danger);}
.notif-dot::after{content:''; position:absolute; inset:0; border-radius:50%; background:var(--danger); animation:ping 1.8s cubic-bezier(0,0,.2,1) infinite;}
@keyframes ping{0%{transform:scale(1); opacity:.7;} 75%,100%{transform:scale(2.4); opacity:0;}}
.notif-wrap{position:relative;}
.notif-panel{position:absolute; right:0; top:46px; width:280px; background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:14px; box-shadow:var(--shadow); z-index:30; animation:modalIn .22s cubic-bezier(.22,1,.36,1) both; transform-origin:top right;}
.notif-panel h4{font-size:13px; margin-bottom:10px;}
.notif-item{display:flex; flex-direction:column; gap:2px; padding:8px 0; border-top:1px solid var(--border); font-size:12.5px; color:var(--ink);}
.notif-item:first-of-type{border-top:none;}
.notif-time{font-size:11px; color:var(--ink-faint);}
.tour-btn{background:var(--surface); border:1px solid var(--border); border-radius:10px; width:38px; height:38px; display:flex; align-items:center; justify-content:center; color:var(--ink-soft); transition:border-color .2s ease, color .2s ease, transform .15s cubic-bezier(.22,1,.36,1);}
.tour-btn:hover{color:var(--primary); border-color:var(--primary); transform:translateY(-1px);}

/* buttons */
.btn-primary{position:relative; overflow:hidden; display:inline-flex; align-items:center; gap:8px; background:linear-gradient(135deg, var(--primary), var(--primary-dark)); color:#fff; border:none; padding:10px 16px; border-radius:11px; font-size:13.5px; font-weight:600; box-shadow:0 6px 16px rgba(74,79,224,0.25); white-space:nowrap; transition:transform .18s cubic-bezier(.22,1,.36,1), box-shadow .2s ease;}
.btn-primary::before{content:''; position:absolute; top:0; left:-60%; width:40%; height:100%; background:linear-gradient(120deg, transparent, rgba(255,255,255,.35), transparent); transform:skewX(-18deg); transition:left .6s ease;}
.btn-primary:hover::before{left:130%;}
.btn-primary:hover{transform:translateY(-1px); box-shadow:0 10px 22px rgba(74,79,224,0.32);}
.btn-primary:active{transform:translateY(0) scale(.97);}
.btn-primary:disabled{opacity:.4; box-shadow:none; cursor:not-allowed; transform:none;}
.btn-primary:disabled::before{display:none;}
.btn-primary.lg{padding:13px 20px; font-size:14.5px;}
.btn-primary.sm{padding:7px 11px; font-size:12.5px;}
.btn-ghost{display:inline-flex; align-items:center; gap:6px; background:var(--surface); border:1px solid var(--border); color:var(--ink); padding:10px 16px; border-radius:11px; font-size:13.5px; font-weight:500; transition:border-color .2s ease, color .2s ease, transform .15s cubic-bezier(.22,1,.36,1);}
.btn-ghost.sm{padding:7px 11px; font-size:12.5px;}
.btn-ghost:hover{border-color:var(--primary); color:var(--primary); transform:translateY(-1px);}
.btn-ghost:active{transform:translateY(0) scale(.97);}
.back-btn{margin-bottom:18px;}

/* content */
.content{flex:1; padding:4px 28px 40px;}
.view-fade{animation:viewIn .4s cubic-bezier(.22,1,.36,1) both;}
@keyframes viewIn{from{opacity:0; transform:translateY(10px);} to{opacity:1; transform:translateY(0);}}
.section-head{display:flex; justify-content:space-between; align-items:flex-end; margin:22px 0 18px;}
.section-head h2{font-size:21px; margin-bottom:4px;}

/* stats */
.dash-grid{display:grid; grid-template-columns:1fr 340px; gap:24px; align-items:start;}
.stat-row{display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-top:6px;}
.stat-card{display:flex; align-items:center; gap:10px; background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:14px 16px; color:var(--teal); animation:cardIn .45s cubic-bezier(.22,1,.36,1) both; transition:transform .2s cubic-bezier(.22,1,.36,1), border-color .2s ease;}
.stat-card:hover{transform:translateY(-2px); border-color:var(--teal);}
.stat-num{font-family:'Fraunces',serif; font-size:19px; font-weight:600; color:var(--ink);}
.stat-label{font-size:11.5px; color:var(--ink-soft);}
@keyframes cardIn{from{opacity:0; transform:translateY(14px);} to{opacity:1; transform:translateY(0);}}

/* case cards */
.case-grid{display:grid; grid-template-columns:1fr 1fr; gap:14px;}
.case-grid.wide{grid-template-columns:1fr 1fr 1fr;}
.case-card{text-align:left; background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:18px; display:flex; flex-direction:column; gap:12px; animation:cardIn .5s cubic-bezier(.22,1,.36,1) both; transition:border-color .2s ease, transform .25s cubic-bezier(.22,1,.36,1), box-shadow .25s cubic-bezier(.22,1,.36,1);}
.case-card:hover{border-color:var(--primary); transform:translateY(-3px); box-shadow:0 16px 32px rgba(0,0,0,0.16);}
.case-top{display:flex; align-items:flex-start; justify-content:space-between; gap:10px;}
.case-who{display:flex; align-items:center; gap:10px;}
.case-who h3{font-size:15px; font-family:'Inter',sans-serif; font-weight:600;}
.case-sub{font-size:12px; color:var(--ink-faint); font-family:'IBM Plex Mono',monospace;}
.avatar{width:38px; height:38px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-size:13px; font-weight:700; flex-shrink:0;}
.avatar.lg{width:52px; height:52px; font-size:16px;}
.case-complaint{font-size:13.5px; color:var(--ink-soft); min-height:36px;}
.dx-row{display:flex; align-items:center; justify-content:space-between; background:var(--surface-2); border:1px solid var(--border); border-radius:10px; padding:9px 12px;}
.dx-name{display:flex; align-items:center; gap:7px; font-size:13px; font-weight:600; color:var(--primary);}
.dx-conf{font-family:'IBM Plex Mono',monospace; font-size:13px; font-weight:600; color:var(--ink);}
.progress-row{display:flex; gap:3px;}
.seg{flex:1; height:5px; border-radius:3px; background:var(--border); transition:background .4s ease;}
.seg-done{background:var(--success);}
.seg-active{background:var(--primary);}
.status-row{display:flex; align-items:center; justify-content:space-between;}
.status-pill{display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:500; color:var(--ink-soft);}
.dot{width:6px; height:6px; border-radius:50%; display:inline-block;}
.dot-success{background:var(--success);} .dot-primary{background:var(--primary);} .dot-warn{background:var(--warn);}
.time-stamp{display:flex; align-items:center; gap:4px; font-size:11.5px; color:var(--ink-faint);}

/* pills / badges */
.pill{font-size:11px; font-weight:600; padding:4px 10px; border-radius:999px; white-space:nowrap; font-family:'IBM Plex Mono',monospace;}
.badge-danger{background:var(--danger-bg); color:var(--danger);}
.badge-warn{background:var(--warn-bg); color:var(--warn);}
.badge-flat{background:var(--surface-2); color:var(--ink-soft);}
.badge-conf{background:var(--success-bg); color:var(--success);}

/* AI insights + activity */
.dash-side{display:flex; flex-direction:column; gap:18px;}
.insights-panel, .activity-panel{background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:18px;}
.panel-head{display:flex; align-items:flex-start; gap:10px; color:var(--violet); margin-bottom:14px;}
.panel-head h3{font-size:15px; color:var(--ink);}
.insight-card{display:flex; gap:10px; padding:12px; border-radius:12px; border-left:3px solid; margin-bottom:10px; background:var(--surface-2); animation:cardIn .5s cubic-bezier(.22,1,.36,1) both; transition:transform .2s cubic-bezier(.22,1,.36,1);}
.insight-card:hover{transform:translateX(2px);}
.insight-card:last-child{margin-bottom:0;}
.insight-card h4{font-size:13px; margin-bottom:4px; font-family:'Inter',sans-serif; color:var(--ink);}
.insight-card p{font-size:12.5px; color:var(--ink-soft);}
.tone-danger{border-color:var(--danger); color:var(--danger);}
.tone-warn{border-color:var(--warn); color:var(--warn);}
.tone-success{border-color:var(--success); color:var(--success);}
.activity-panel h3{font-size:15px; margin-bottom:2px;}
.activity-row{display:flex; justify-content:space-between; gap:10px; padding:10px 0; border-top:1px solid var(--border); font-size:12.5px; color:var(--ink);}
.activity-row:first-of-type{border-top:none; margin-top:10px;}

/* intake */
.intake-wrap{display:flex; justify-content:center; padding:30px 0;}
.intake-card{width:100%; max-width:620px; background:var(--surface); border:1px solid var(--border); border-radius:18px; padding:30px; animation:cardIn .45s cubic-bezier(.22,1,.36,1) both;}
.eyebrow{display:inline-flex; align-items:center; gap:6px; font-size:11px; font-weight:600; color:var(--primary); background:var(--surface-2); padding:5px 10px; border-radius:999px; margin-bottom:14px; text-transform:uppercase; letter-spacing:.04em; font-family:'IBM Plex Mono',monospace;}
.intake-card h2{font-size:23px; margin-bottom:18px;}
.intake-fields{display:grid; grid-template-columns:1fr 90px 110px; gap:10px; margin-bottom:14px;}
.field{display:flex; flex-direction:column; gap:5px; font-size:11.5px; color:var(--ink-faint); font-weight:600; text-transform:uppercase; letter-spacing:.03em;}
.field input, .field select{border:1px solid var(--border); border-radius:10px; padding:9px 11px; font-size:13.5px; background:var(--surface-2); color:var(--ink); transition:border-color .2s ease, box-shadow .2s ease;}
.symptom-input{width:100%; border:1px solid var(--border); border-radius:12px; padding:14px; font-family:'Inter',sans-serif; font-size:14px; resize:vertical; background:var(--surface-2); margin-bottom:14px; color:var(--ink); transition:border-color .2s ease, box-shadow .2s ease;}
.symptom-input:focus, .field input:focus, .field select:focus{outline:none; border-color:var(--primary); box-shadow:0 0 0 3px rgba(91,127,255,0.14);}
.chip-row{display:flex; flex-wrap:wrap; gap:8px; margin-bottom:22px;}
.chip{display:inline-flex; align-items:center; gap:4px; border:1px solid var(--border); background:var(--surface-2); color:var(--ink-soft); padding:7px 12px; border-radius:999px; font-size:12.5px; font-weight:500; transition:border-color .15s ease, color .15s ease, transform .15s cubic-bezier(.22,1,.36,1);}
.chip:hover{transform:translateY(-1px);}
.chip-active{border-color:var(--primary); color:var(--primary); background:var(--danger-bg);}

/* analyzing overlay */
.analyzing-card{background:var(--surface); border:1px solid var(--border); border-radius:18px; padding:40px; display:flex; flex-direction:column; align-items:center; gap:20px; box-shadow:var(--shadow); animation:modalIn .3s cubic-bezier(.22,1,.36,1) both;}
.ring-wrap{position:relative; width:110px; height:110px; display:flex; align-items:center; justify-content:center;}
.ring{position:absolute; inset:0; border-radius:50%; border:1.5px solid var(--primary); opacity:0; animation:ringExpand 2.4s ease-out infinite;}
.ring.r2{animation-delay:.8s;} .ring.r3{animation-delay:1.6s;}
@keyframes ringExpand{0%{transform:scale(.45); opacity:.65;} 100%{transform:scale(1.45); opacity:0;}}
.analyzing-text{font-family:'IBM Plex Mono',monospace; font-size:12.5px; color:var(--ink-soft); animation:fadeCycle .35s ease both;}
@keyframes fadeCycle{from{opacity:0; transform:translateY(4px);} to{opacity:1; transform:translateY(0);}}

/* case detail */
.case-detail{max-width:760px; margin:0 auto; padding-top:20px;}
.case-detail-head{display:flex; align-items:center; gap:14px; background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:18px 20px; margin-bottom:20px; animation:cardIn .4s cubic-bezier(.22,1,.36,1) both;}
.case-detail-info{flex:1;}
.case-detail-info h2{font-size:19px;}
.result-list{display:flex; flex-direction:column; gap:12px; margin-bottom:28px;}
.result-card{background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:18px; animation:cardIn .45s cubic-bezier(.22,1,.36,1) both; transition:border-color .2s ease, transform .2s cubic-bezier(.22,1,.36,1);}
.result-card:hover{border-color:var(--primary); transform:translateY(-2px);}
.result-card-top{display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:8px;}
.result-card-top h3{font-size:15.5px;}
.result-blurb{font-size:13.5px; color:var(--ink-soft); margin-bottom:10px;}
.tag-row{display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px;}
.tag{font-size:11px; background:var(--surface-2); color:var(--ink-soft); padding:4px 9px; border-radius:6px; font-family:'IBM Plex Mono',monospace;}
.result-next{font-size:13px; color:var(--ink);}
.refine-block{background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:20px; animation:cardIn .5s cubic-bezier(.22,1,.36,1) both;}
.refine-block h3{font-size:15px; margin-bottom:12px;}
.refine-log{display:flex; flex-direction:column; gap:8px; margin-bottom:14px;}
.refine-msg{font-size:13px; padding:9px 12px; border-radius:10px; max-width:80%; animation:cardIn .3s cubic-bezier(.22,1,.36,1) both;}
.from-user{align-self:flex-end; background:var(--surface-2); color:var(--ink);}
.from-aura{align-self:flex-start; background:var(--danger-bg); color:var(--ink-soft);}
.refine-row{display:flex; gap:8px;}
.refine-row input{flex:1; border:1px solid var(--border); border-radius:11px; padding:11px 13px; font-size:13.5px; background:var(--surface-2); color:var(--ink); transition:border-color .2s ease, box-shadow .2s ease;}
.refine-row input:focus{outline:none; border-color:var(--primary); box-shadow:0 0 0 3px rgba(91,127,255,0.14);}

/* knowledge / faq */
.knowledge-view, .settings-view{max-width:680px; margin:0 auto; padding-top:24px;}
.knowledge-view h2, .settings-view h2{font-size:24px; margin-bottom:6px;}
.faq-list{display:flex; flex-direction:column; gap:10px;}
.faq-item{border:1px solid var(--border); border-radius:12px; background:var(--surface); overflow:hidden; animation:cardIn .4s cubic-bezier(.22,1,.36,1) both;}
.faq-q{width:100%; display:flex; align-items:center; gap:10px; background:none; border:none; padding:15px 16px; text-align:left; font-size:13.5px; font-weight:600; color:var(--ink);}
.faq-q .chev{margin-left:auto; transition:transform .25s cubic-bezier(.22,1,.36,1); color:var(--ink-faint);}
.faq-item.is-open .chev{transform:rotate(90deg); color:var(--primary);}
.faq-a-wrap{display:grid; grid-template-rows:0fr; transition:grid-template-rows .32s cubic-bezier(.22,1,.36,1);}
.faq-item.is-open .faq-a-wrap{grid-template-rows:1fr;}
.faq-a-inner{overflow:hidden;}
.faq-a{padding:0 16px 16px; font-size:13.5px; color:var(--ink-soft);}

.settings-card{background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:8px 20px;}
.settings-row{display:flex; align-items:center; gap:12px; padding:14px 0; border-top:1px solid var(--border); color:var(--primary);}
.settings-row:first-child{border-top:none;}
.settings-label{font-size:13.5px; font-weight:600; color:var(--ink);}

/* modal */
.modal-backdrop{position:fixed; inset:0; background:rgba(5,6,10,0.6); backdrop-filter:blur(2px); display:flex; align-items:center; justify-content:center; z-index:60; padding:20px; animation:backdropIn .25s ease both;}
@keyframes backdropIn{from{opacity:0;} to{opacity:1;}}
.modal-card{background:var(--surface); border:1px solid var(--border); border-radius:18px; padding:30px; max-width:380px; text-align:center; display:flex; flex-direction:column; align-items:center; gap:12px; box-shadow:var(--shadow); animation:modalIn .3s cubic-bezier(.22,1,.36,1) both;}
@keyframes modalIn{from{opacity:0; transform:scale(.94) translateY(8px);} to{opacity:1; transform:scale(1) translateY(0);}}
.modal-card h3{font-size:20px;}
.modal-card p{font-size:14px; color:var(--ink-soft);}
.modal-actions{display:flex; gap:10px; margin-top:8px;}

/* tour */
.tour-block{position:fixed; inset:0; z-index:70; background:transparent;}
.tour-spot{position:fixed; z-index:71; border-radius:14px; border:2px solid var(--teal); transition:top .35s cubic-bezier(.22,1,.36,1), left .35s cubic-bezier(.22,1,.36,1), width .35s cubic-bezier(.22,1,.36,1), height .35s cubic-bezier(.22,1,.36,1); pointer-events:none; animation:spotGlow 1.8s ease-in-out infinite;}
@keyframes spotGlow{0%,100%{box-shadow:0 0 0 9999px rgba(4,5,9,0.78), 0 0 0 0 rgba(var(--teal-rgb),.55);} 50%{box-shadow:0 0 0 9999px rgba(4,5,9,0.78), 0 0 20px 4px rgba(var(--teal-rgb),.5);}}
.tour-tip{position:fixed; z-index:72; width:320px; background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:18px; box-shadow:var(--shadow); transition:top .35s cubic-bezier(.22,1,.36,1), left .35s cubic-bezier(.22,1,.36,1); animation:tipIn .28s cubic-bezier(.22,1,.36,1) both;}
@keyframes tipIn{from{opacity:0; transform:scale(.96) translateY(4px);} to{opacity:1; transform:scale(1) translateY(0);}}
.tour-tip-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;}
.tour-step-count{font-family:'IBM Plex Mono',monospace; font-size:11px; color:var(--ink-faint); text-transform:uppercase; letter-spacing:.04em;}
.tour-close{background:none; border:none; color:var(--ink-faint); padding:2px;}
.tour-tip h4{font-size:16px; margin-bottom:6px;}
.tour-tip p{font-size:13px; color:var(--ink-soft); margin-bottom:16px;}
.tour-tip-foot{display:flex; align-items:center; justify-content:space-between; gap:10px;}
.tour-dots{display:flex; gap:5px;}
.dot-i{width:5px; height:5px; border-radius:50%; background:var(--border); transition:width .2s ease, background .2s ease;}
.dot-i-active{background:var(--primary); width:14px; border-radius:3px;}
.tour-nav-btns{display:flex; gap:6px;}

@media (max-width: 900px){
  .sidebar{display:none;}
  .dash-grid{grid-template-columns:1fr;}
  .case-grid, .case-grid.wide{grid-template-columns:1fr;}
  .stat-row{grid-template-columns:1fr 1fr;}
  .intake-fields{grid-template-columns:1fr;}
  .tour-tip{width:calc(100vw - 32px);}
}

/* --------------------------------------------------------------------------
   Product navigation: a horizontal, clinical-product header.  This replaces
   the old vertical dashboard rail while keeping every existing destination.
   -------------------------------------------------------------------------- */
.app-shell{display:block; overflow-x:hidden;}
.sidebar{
  width:100%; height:76px; min-height:76px; padding:0 clamp(18px,4vw,64px);
  position:sticky; top:0; z-index:40; flex-direction:row; align-items:center;
  gap:8px; background:color-mix(in srgb, var(--sidebar-bg) 87%, transparent);
  border-right:0; border-bottom:1px solid var(--border); box-shadow:0 1px 0 rgba(255,255,255,.04);
  backdrop-filter:blur(18px); -webkit-backdrop-filter:blur(18px);
  animation:headerIn .7s cubic-bezier(.22,1,.36,1) both;
}
@keyframes headerIn{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:translateY(0)}}
.sidebar::after{content:''; position:absolute; inset:auto 0 0; height:1px; background:linear-gradient(90deg,transparent,var(--primary),var(--teal),transparent); opacity:.42;}
.sidebar-brand{flex:0 0 auto; padding:0 30px 0 0; gap:10px; background:none!important;}
.sidebar-brand .brand-word{font-size:20px; letter-spacing:-.035em;}
.sidebar-brand .brand-sub{display:none;}
.side-block{display:contents; margin:0;}
.side-label{display:none;}
.side-section{flex:0 0 auto; flex-direction:row; align-items:center; gap:3px;}
.side-indicator{display:none;}
.side-link{padding:9px 11px; border-radius:999px; gap:7px; white-space:nowrap; font-size:13px; color:var(--ink-soft);}
.side-link:hover{background:var(--surface-2); color:var(--ink); transform:translateY(-1px);}
.side-link.is-active{color:var(--ink); background:var(--surface-2); box-shadow:inset 0 0 0 1px var(--border);}
.side-link.is-active::after{content:''; width:4px; height:4px; border-radius:50%; background:var(--teal); box-shadow:0 0 10px var(--teal);}
.side-link .count{margin-left:1px; padding:1px 6px; color:var(--primary); background:var(--danger-bg);}
.sidebar-bottom{margin:0 0 0 auto; padding:0; border:0; flex:0 0 auto; flex-direction:row; align-items:center; gap:4px;}
.sidebar-bottom .side-link{padding:9px 10px;}
.sidebar-bottom .profile-card,.sidebar-bottom .disclaimer-mini{display:none;}
.mobile-nav-trigger{display:none;}
.main-col{display:block; width:100%;}
.topbar{max-width:1440px; margin:0 auto; padding:18px clamp(18px,4vw,64px) 10px; gap:16px;}
.topbar.is-scrolled{background:color-mix(in srgb, var(--bg) 84%, transparent); border-color:var(--border); box-shadow:none;}
.content{max-width:1440px; margin:0 auto; padding:4px clamp(18px,4vw,64px) 48px;}
.search-bar{max-width:460px; background:color-mix(in srgb,var(--surface) 84%,transparent);}
.topbar-right{gap:8px;}
.btn-primary{border-radius:999px; padding:10px 17px;}
.icon-btn,.tour-btn{border-radius:999px; background:color-mix(in srgb,var(--surface) 84%,transparent);}
.ambient-blobs{opacity:.82;}
.case-card,.stat-card,.insights-panel,.activity-panel,.intake-card,.result-card,.refine-block{backdrop-filter:blur(10px);}

@media (max-width: 1120px){
  .sidebar{padding-inline:24px; gap:2px;}
  .sidebar-brand{padding-right:14px;}
  .side-link{padding-inline:8px; font-size:12px;}
  .topbar{padding-inline:24px;}
  .content{padding-inline:24px;}
  .search-bar{max-width:340px;}
}
@media (max-width: 900px){
  .sidebar{display:flex; height:64px; min-height:64px; overflow:visible; padding:0 16px; gap:5px; transition:height .28s cubic-bezier(.22,1,.36,1);}
  .sidebar-brand{padding-right:8px;}
  .sidebar-brand .aura-mark{width:30px!important; height:30px!important;}
  .sidebar .side-block{display:none; position:absolute; left:12px; right:12px; z-index:4;}
  .sidebar.mobile-open{height:206px; align-items:flex-start; padding-top:15px;}
  .sidebar.mobile-open .side-block{display:block;}
  .sidebar.mobile-open .side-block:nth-of-type(2){top:63px;}
  .sidebar.mobile-open .side-block:nth-of-type(3){top:146px;}
  .sidebar.mobile-open .side-section{display:flex; flex-direction:row; flex-wrap:wrap; align-items:center; gap:4px;}
  .sidebar.mobile-open .side-link{padding:8px 10px; font-size:12px; background:var(--surface); border:1px solid var(--border); box-shadow:0 8px 20px rgba(0,0,0,.12);}
  .sidebar-bottom{display:none;}
  .mobile-nav-trigger{display:flex; align-items:center; justify-content:center; margin-left:auto; width:36px; height:36px; border:1px solid var(--border); border-radius:50%; color:var(--ink); background:var(--surface);}
  .dash-grid{grid-template-columns:1fr;}
  .case-grid,.case-grid.wide{grid-template-columns:1fr;}
  .topbar{padding:14px 16px 8px;}
  .content{padding:4px 16px 36px;}
}
@media (max-width: 620px){
  .sidebar{min-height:62px; height:62px;}
  .sidebar-brand{padding-right:4px;}
  .sidebar-brand .brand-word{font-size:18px;}
  .sidebar.mobile-open{height:206px;}
  .topbar{flex-wrap:wrap; gap:9px;}
  .search-bar{order:2; flex-basis:100%; max-width:none; padding:9px 12px;}
  .topbar-right{margin-left:0;}
  .header-case-btn{padding-inline:13px;}
  .stat-row{grid-template-columns:1fr 1fr;}
  .section-head{margin-top:16px;}
}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.01ms!important; animation-iteration-count:1!important; scroll-behavior:auto!important; transition-duration:.01ms!important;}
}
`;
