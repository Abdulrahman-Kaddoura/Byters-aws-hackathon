import { useState, useEffect, useMemo } from "react";
import {
  Search, Plus, Bell, LayoutDashboard, FolderOpen, CheckCircle2,
  FilePlus2, BookOpen, Settings as SettingsIcon, Sun, Moon, ChevronRight,
  ChevronLeft, X, ArrowRight, MessageCircleQuestion, Menu,
} from "lucide-react";

import { DARK_VARS, LIGHT_VARS, CSS } from "./styles.js";
import { AuraMark, AmbientBlobs, SideNavGroup } from "./lib/ui.jsx";
import { useAuth } from "./auth/AuthContext.jsx";
import useCases from "./hooks/useCases.js";

import LoginView from "./views/LoginView.jsx";
import DashboardView from "./views/DashboardView.jsx";
import ListView from "./views/ListView.jsx";
import IntakeView from "./views/IntakeView.jsx";
import KnowledgeView from "./views/KnowledgeView.jsx";
import SettingsView from "./views/SettingsView.jsx";
import CaseDetailShell from "./views/case/CaseDetailShell.jsx";

/* --------------------------------- tour --------------------------------- */

const TOUR_STEPS = [
  { id: "brand-mark", view: "dashboard", title: "This is Aura", body: "The mark pulses whenever Aura is actively working through a case — otherwise it sits quiet." },
  { id: "search-bar", view: "dashboard", title: "Search across every case", body: "Filter the caseload by patient name or complaint as you type." },
  { id: "new-case-btn", view: "dashboard", title: "Start a new case", body: "Opens patient intake whenever you're ready to describe a new case." },
  { id: "stat-row", view: "dashboard", title: "Your caseload at a glance", body: "Active cases, high-priority ones, and how the caseload is trending — pulled live from the backend." },
  { id: "case-card-0", view: "dashboard", title: "Every case, at a glance", body: "Patient, chief complaint, Aura's leading suggestion with its confidence, and where the case stands — all in one card. Click any card to open it." },
  { id: "ai-insights", view: "dashboard", title: "AI insights", body: "Aura surfaces things worth double-checking on its own — risk flags, allergies on file, or concerns it's already ruled out." },
  { id: "intake-textarea", view: "intake", title: "Describe the case", body: "Write it the way you'd say it out loud — duration, severity, anything relevant. More detail sharpens the results." },
  { id: "intake-chips", view: "intake", title: "Or tap common symptoms", body: "Quick-add chips are a shortcut when you already know the key symptoms." },
  { id: "intake-analyze-btn", view: "intake", title: "Run the analysis", body: "Aura submits the case to the backend and opens it with an AI interview already started." },
  { id: "theme-toggle", view: "dashboard", title: "Light or dark, your call", body: "Switch the whole interface any time. That's the whole tour." },
];

/* --------------------------------- app --------------------------------- */

export default function App() {
  const auth = useAuth();
  const [theme, setTheme] = useState("dark");
  const [view, setView] = useState("dashboard");
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [showNotif, setShowNotif] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [showPrompt, setShowPrompt] = useState(false);
  const [tourActive, setTourActive] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [spot, setSpot] = useState(null);
  const [tipPos, setTipPos] = useState(null);

  const cases = useCases();

  useEffect(() => { const t = setTimeout(() => setShowPrompt(true), 700); return () => clearTimeout(t); }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { setMobileNavOpen(false); }, [view]);

  const activeCases = useMemo(() => cases.cases.filter((c) => c.lifecycleState !== "Closed"), [cases.cases]);
  const completedCases = useMemo(() => cases.cases.filter((c) => c.lifecycleState === "Closed"), [cases.cases]);
  const filteredActive = useMemo(() => {
    if (!search.trim()) return activeCases;
    const q = search.toLowerCase();
    return activeCases.filter((c) =>
      (c.patient?.name || "").toLowerCase().includes(q) ||
      (c.chiefComplaint || "").toLowerCase().includes(q) ||
      (c.primaryImpression || "").toLowerCase().includes(q));
  }, [activeCases, search]);

  const openCase = (c) => { setSelectedId(c.id); setView("case"); };
  const onCaseCreated = (c) => { cases.updateOne(c); openCase(c); };
  const onCaseChanged = (c) => { cases.updateOne(c); };

  /* ---- tour engine ---- */

  const startTour = (fromIndex = 0) => { setShowPrompt(false); setTourStep(fromIndex); setTourActive(true); };
  const endTour = () => { setTourActive(false); setSpot(null); setTipPos(null); };
  const nextStep = () => { if (tourStep >= TOUR_STEPS.length - 1) endTour(); else setTourStep((s) => s + 1); };
  const prevStep = () => setTourStep((s) => Math.max(0, s - 1));

  useEffect(() => {
    if (!tourActive) return;
    const step = TOUR_STEPS[tourStep];
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

  if (!auth.checked) return null;
  if (!auth.user) {
    return (
      <div style={rootStyle}>
        <style>{CSS}</style>
        <LoginView onLogin={auth.login} error={auth.error} loading={auth.loading} />
      </div>
    );
  }

  return (
    <div className="app-shell" style={rootStyle}>
      <style>{CSS}</style>
      <AmbientBlobs />

      <aside className={"sidebar" + (mobileNavOpen ? " mobile-open" : "")}>
        <div className="sidebar-brand">
          <AuraMark size={34} id="brand-mark" active={cases.loading} />
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
            <span className="avatar" style={{ background: "linear-gradient(135deg, #8B7CF6, #8B7CF6CC)" }}>
              {(auth.user.email || auth.user.sub || "?").slice(0, 2).toUpperCase()}
            </span>
            <div>
              <div className="profile-name">{auth.user.email || auth.user.sub}</div>
              <div className="profile-role">{(auth.user.groups || []).join(", ") || "no role"}</div>
            </div>
          </button>
          <p className="disclaimer-mini">Connected to the live SEHATI-AI backend — not a substitute for real clinical judgment.</p>
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
                  {cases.cases.slice(0, 3).flatMap((c) => (c.recentUpdates || []).slice(0, 1).map((a, i) => (
                    <div className="notif-item" key={c.id + i}><span>{c.patient?.name}: {a.text}</span><span className="notif-time">{a.actor}</span></div>
                  )))}
                  {cases.cases.length === 0 && <p className="muted small">No activity yet.</p>}
                </div>
              )}
            </div>
            <button className="tour-btn" onClick={() => startTour(0)} title="Take the tour"><MessageCircleQuestion size={17} /></button>
          </div>
        </header>

        <main className="content">
          <div key={view} className="view-fade">
            {view === "dashboard" && (
              <DashboardView activeCases={filteredActive} allCases={cases.cases} loading={cases.loading} error={cases.error} onOpen={openCase} onRetry={cases.refetch} />
            )}
            {view === "active" && (
              <ListView title="Active cases" subtitle="Every case currently moving through the diagnostic workflow." cases={filteredActive} loading={cases.loading} error={cases.error} onOpen={openCase} />
            )}
            {view === "completed" && (
              <ListView title="Completed cases" subtitle="Cases that have been resolved." cases={completedCases} loading={cases.loading} error={cases.error} onOpen={openCase} />
            )}
            {view === "intake" && <IntakeView onCreated={onCaseCreated} />}
            {view === "case" && selectedId && (
              <CaseDetailShell caseId={selectedId} onBack={() => setView("dashboard")} onCaseChanged={onCaseChanged} />
            )}
            {view === "knowledge" && <KnowledgeView />}
            {view === "settings" && <SettingsView />}
          </div>
        </main>
      </div>

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
