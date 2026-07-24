import { useState } from "react";
import { Sparkles, ArrowRight, Check } from "lucide-react";
import { AnalyzingOverlay } from "../lib/ui.jsx";
import ErrorBanner from "../lib/ErrorBanner.jsx";
import useAsyncAction from "../hooks/useAsyncAction.js";
import { submitIntake } from "../api/endpoints.js";

const CHIP_OPTIONS = ["Fever", "Cough", "Fatigue", "Headache", "Nausea", "Shortness of breath", "Chest pain", "Joint pain", "Rash", "Dizziness"];

export default function IntakeView({ onCreated }) {
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("Female");
  const [text, setText] = useState("");
  const [chips, setChips] = useState([]);
  const { run, loading, error, clearError } = useAsyncAction();

  const toggleChip = (c) => setChips((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const analyze = () => {
    run(async () => {
      const payload = {
        patient: { name: name || "New patient", age: age ? Number(age) || age : undefined, gender: sex },
        chiefComplaint: text || chips.join(", ") || "Unspecified complaint",
        complaint: { symptoms: chips.length ? chips : (text ? [text] : []), painScale: 0, duration: "", timeline: text, aggravating: "", relieving: "" },
      };
      const { case: newCase } = await submitIntake(payload);
      setName(""); setAge(""); setText(""); setChips([]);
      onCreated(newCase);
    });
  };

  return (
    <div className="intake-wrap">
      <div className="intake-card">
        <span className="eyebrow"><Sparkles size={12} /> New patient intake</span>
        <h2>Describe the case</h2>
        <ErrorBanner error={error} onDismiss={clearError} />
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
        <button id="intake-analyze-btn" className="btn-primary lg" disabled={(!text.trim() && chips.length === 0) || loading} onClick={analyze}>
          Run the analysis <ArrowRight size={16} />
        </button>
      </div>
      {loading && <AnalyzingOverlay />}
    </div>
  );
}
