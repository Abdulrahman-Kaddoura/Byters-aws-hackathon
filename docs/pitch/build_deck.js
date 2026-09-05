// Sehati — 3-minute pitch deck generator.
// Regenerate with:  node build_deck.js
const pptxgen = require("pptxgenjs");

const INK = "0B1F2A";        // deep clinical navy — dominant on dark slides
const INK_SOFT = "16323F";   // raised surface on dark
const TEAL = "00A896";       // primary accent
const MINT = "6FE3C4";       // bright accent for dark backgrounds
const AMBER = "E8955A";      // problem / warning accent
const PAPER = "FFFFFF";
const WASH = "F1F5F6";       // card tint on light slides
const BODY = "3C4F58";       // body text on light
const MUTE = "72858F";       // captions

const H = "Cambria";         // headings
const B = "Calibri";         // body

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
pres.author = "Team Byters";
pres.title = "Sehati — AI Clinical Decision Support";

// ---------- helpers ----------
const darkSlide = () => {
  const s = pres.addSlide();
  s.background = { color: INK };
  return s;
};
const lightSlide = () => {
  const s = pres.addSlide();
  s.background = { color: PAPER };
  return s;
};

// The repeated motif: a thin ring with a filled dot, echoing the "second opinion" mark.
const ring = (s, x, y, d, color, lineW = 1.5) =>
  s.addShape(pres.ShapeType.ellipse, {
    x, y, w: d, h: d, fill: { type: "none" }, line: { color, width: lineW },
  });

const dot = (s, x, y, d, color) =>
  s.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color }, line: { color } });

const title = (s, text, opts = {}) =>
  s.addText(text, {
    x: 0.7, y: 0.45, w: 11.9, h: 0.9, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 34, bold: true,
    color: opts.dark ? PAPER : INK, align: "left", valign: "middle", ...opts,
  });

const kicker = (s, text, color) =>
  s.addText(text.toUpperCase(), {
    x: 0.72, y: 0.15, w: 11.9, h: 0.3, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 11, bold: true, charSpacing: 2.4, color,
  });

const card = (s, x, y, w, h, fill, shadow) =>
  s.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.12, fill: { color: fill },
    line: { color: fill },
    ...(shadow ? { shadow: { type: "outer", color: "0B1F2A", opacity: 0.1, blur: 10, offset: 2, angle: 90 } } : {}),
  });

const numBadge = (s, x, y, d, n, ringColor, textColor) => {
  dot(s, x, y, d, ringColor);
  s.addText(String(n), {
    x, y, w: d, h: d, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 15, bold: true, color: textColor,
    align: "center", valign: "middle",
  });
};

// =====================================================================
// 1 — TITLE
// =====================================================================
{
  const s = darkSlide();
  ring(s, 10.05, 1.05, 3.4, "1E4A56", 2);
  ring(s, 10.75, 1.75, 2.0, "24606B", 1.5);
  dot(s, 11.55, 2.55, 0.4, TEAL);

  s.addText("TEAM BYTERS  ·  AMAZON INDUSTRY PROGRAM", {
    x: 0.9, y: 1.55, w: 8.4, h: 0.3, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 11.5, bold: true, charSpacing: 2.6, color: MINT,
  });
  s.addText("Sehati", {
    x: 0.85, y: 2.0, w: 8.6, h: 1.35, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 72, bold: true, color: PAPER,
  });
  s.addText("An AI clinical co-pilot for hospital wards", {
    x: 0.9, y: 3.35, w: 8.4, h: 0.5, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 22, color: "C7D6DC",
  });
  s.addShape(pres.ShapeType.rect, { x: 0.9, y: 4.15, w: 0.85, h: 0.035, fill: { color: TEAL }, line: { color: TEAL } });
  s.addText("We didn’t start from the technology.\nWe started from what doctors told us they were missing.", {
    x: 0.9, y: 4.45, w: 8.0, h: 0.9, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 16, italic: true, color: "9FB6BF", lineSpacing: 24,
  });
  s.addText("Live on AWS  ·  Cognito · API Gateway · Lambda · DynamoDB · Bedrock · HealthScribe", {
    x: 0.9, y: 6.55, w: 11.5, h: 0.3, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 11, color: "6E8B95",
  });
  s.addNotes("0:00–0:15 — Hi, we're Byters. Sehati is an AI clinical co-pilot for hospital wards. Everything you'll see runs on a deployed AWS stack — no demo data, no in-browser fakes.");
}

// =====================================================================
// 2 — TEAM
// =====================================================================
{
  const s = lightSlide();
  kicker(s, "Team", TEAL);
  title(s, "Are we the right team to solve this?");
  s.addText("Four builders who shipped the full stack — and the clinicians who briefed us at every step.", {
    x: 0.7, y: 1.35, w: 11.2, h: 0.35, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 15, color: MUTE,
  });

  const team = [
    { n: "Abdulrahman Kaddoura", r: "Backend & AWS", d: "Lambda authorization boundary, DynamoDB data model, CDK stack", i: "AK" },
    { n: "[Team member 2]", r: "Frontend", d: "React case workspace, locked interview device, assistant panel", i: "T2" },
    { n: "[Team member 3]", r: "AI / Bedrock", d: "Differential prompting, guardrails, grounded citations", i: "T3" },
    { n: "[Team member 4]", r: "Clinical liaison", d: "Doctor interviews, workflow validation, safety review", i: "T4" },
  ];
  team.forEach((m, i) => {
    const x = 0.7 + i * 3.03;
    card(s, x, 1.95, 2.78, 3.9, WASH, true);
    dot(s, x + 0.95, 2.3, 0.88, INK);
    s.addText(m.i, { x: x + 0.95, y: 2.3, w: 0.88, h: 0.88, isTextBox: true, margin: 0, fontFace: B, fontSize: 20, bold: true, color: MINT, align: "center", valign: "middle" });
    s.addText(m.n, { x: x + 0.2, y: 3.35, w: 2.38, h: 0.6, isTextBox: true, margin: 0, fontFace: B, fontSize: 15, bold: true, color: INK, align: "center", valign: "top" });
    s.addText(m.r, { x: x + 0.2, y: 3.95, w: 2.38, h: 0.28, isTextBox: true, margin: 0, fontFace: B, fontSize: 12, bold: true, color: TEAL, align: "center" });
    s.addText(m.d, { x: x + 0.25, y: 4.32, w: 2.28, h: 1.2, isTextBox: true, margin: 0, fontFace: B, fontSize: 11.5, color: BODY, align: "center", lineSpacing: 15 });
  });

  s.addText("Team–problem fit: we didn’t pick a technology and hunt for a use case. We sat with doctors, wrote down what they said, and built only that.", {
    x: 0.7, y: 6.15, w: 11.9, h: 0.5, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 14, italic: true, color: BODY,
  });
  s.addNotes("0:15–0:30 — One line each, then move. The point of this slide is team–market fit: we started from clinician interviews, not from a model. [Fill in real names, years and roles before presenting.]");
}

// =====================================================================
// 3 — THE STORY
// =====================================================================
{
  const s = darkSlide();
  kicker(s, "Where this came from", MINT);
  title(s, "What the doctors actually told us", { dark: true });

  ring(s, 9.6, 2.1, 3.3, "1E4A56", 2);
  dot(s, 11.1, 5.15, 0.28, AMBER);
  s.addText("“", { x: 0.55, y: 1.5, w: 1.2, h: 1.2, isTextBox: true, margin: 0, fontFace: H, fontSize: 110, color: TEAL, valign: "top" });

  s.addText(
    "“At 3 a.m. I’m alone with the case. The history I get is thin and second-hand, I have minutes per patient, and once I’ve named the first diagnosis in my head it’s hard to un-name it.\n\nI don’t need a machine to tell me the answer. I need someone to argue with.”",
    { x: 1.35, y: 1.85, w: 8.0, h: 3.2, isTextBox: true, margin: 0, fontFace: B, fontSize: 19, color: "DCE8EC", italic: true, lineSpacing: 30 }
  );
  s.addText("— composite of the interviews behind Sehati", {
    x: 1.35, y: 5.05, w: 8.0, h: 0.35, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 13, bold: true, color: MINT,
  });

  const tags = ["alone at the decision", "thin history", "minutes per patient", "anchoring"];
  tags.forEach((t, i) => {
    const x = 1.35 + i * 2.55;
    s.addShape(pres.ShapeType.roundRect, { x, y: 5.85, w: 2.35, h: 0.5, rectRadius: 0.25, fill: { color: INK_SOFT }, line: { color: "27505E" } });
    s.addText(t, { x, y: 5.85, w: 2.35, h: 0.5, isTextBox: true, margin: 0, fontFace: B, fontSize: 11.5, color: "BFD2D8", align: "center", valign: "middle" });
  });
  s.addNotes("0:30–0:50 — Read the quote slowly; it is the emotional core of the pitch. Four separate doctors, four complaints, one shape: they are reasoning alone with bad inputs and no time. [Swap in a real named quote if you have consent.]");
}

// =====================================================================
// 4 — THE PROBLEM
// =====================================================================
{
  const s = lightSlide();
  kicker(s, "The problem", AMBER);
  title(s, "Diagnosis is a thinking problem");

  const rows = [
    ["The doctor reasons alone", "No colleague is free at the moment of decision — the second opinion arrives days later, if at all."],
    ["The history arrives thin", "Rushed, second-hand intake. Patients under-report to a clinician who is visibly short of time."],
    ["The first hypothesis sticks", "Anchoring closes the differential early; the rare diagnosis is reached late or not at all."],
    ["Admin eats the minutes", "Documentation crowds out the part of the job only a doctor can do."],
  ];
  rows.forEach(([h, d], i) => {
    const y = 1.75 + i * 1.22;
    card(s, 0.7, y, 11.9, 1.05, WASH, false);
    numBadge(s, 1.0, y + 0.28, 0.5, i + 1, i < 2 ? AMBER : INK, PAPER);
    s.addText(h, { x: 1.72, y: y + 0.15, w: 3.5, h: 0.4, isTextBox: true, margin: 0, fontFace: B, fontSize: 15.5, bold: true, color: INK, valign: "middle" });
    s.addText(d, { x: 1.72, y: y + 0.53, w: 10.5, h: 0.4, isTextBox: true, margin: 0, fontFace: B, fontSize: 13, color: BODY, valign: "top" });
  });

  s.addText("Frequent · every admission.    Expensive · the ward’s costliest event.    Growing · fewer doctors, more patients.", {
    x: 0.7, y: 6.6, w: 11.9, h: 0.4, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 12, bold: true, color: MUTE,
  });
  s.addNotes("0:50–1:10 — Four complaints, one problem. Land the bottom line: this happens on every admission, it is the most expensive thing that can go wrong, and the doctor-to-patient ratio is moving the wrong way.");
}

// =====================================================================
// 5 — WHY NOW
// =====================================================================
{
  const s = darkSlide();
  kicker(s, "Why now", MINT);
  title(s, "Three things only became true recently", { dark: true });

  const cols = [
    ["Models can hold a case", "Frontier reasoning models now sustain a multi-step clinical argument with citations — not a symptom lookup."],
    ["The guardrails exist", "Bedrock Guardrails, HealthScribe, KMS, WORM audit: the compliance-grade primitives ship as managed services."],
    ["The pressure is peaking", "Clinician shortage and burnout are at record levels; hospitals are actively buying decision support."],
  ];
  cols.forEach(([h, d], i) => {
    const x = 0.7 + i * 4.0;
    s.addShape(pres.ShapeType.roundRect, { x, y: 1.95, w: 3.75, h: 2.9, rectRadius: 0.12, fill: { color: INK_SOFT }, line: { color: "24505E" } });
    dot(s, x + 0.35, 2.3, 0.44, TEAL);
    s.addText(String(i + 1), { x: x + 0.35, y: 2.3, w: 0.44, h: 0.44, isTextBox: true, margin: 0, fontFace: B, fontSize: 13, bold: true, color: INK, align: "center", valign: "middle" });
    s.addText(h, { x: x + 0.35, y: 2.95, w: 3.1, h: 0.45, isTextBox: true, margin: 0, fontFace: B, fontSize: 16, bold: true, color: PAPER });
    s.addText(d, { x: x + 0.35, y: 3.45, w: 3.1, h: 1.2, isTextBox: true, margin: 0, fontFace: B, fontSize: 12.5, color: "AFC4CB", lineSpacing: 17, valign: "top" });
  });

  const stats = [["[  %  ]", "of diagnoses that\nare delayed or wrong"], ["[  #  ]", "patients per doctor\nin a public ward"], ["[  $  ]", "cost of one\nmissed diagnosis"]];
  stats.forEach(([n, l], i) => {
    const x = 0.7 + i * 4.0;
    s.addText(n, { x, y: 5.15, w: 3.75, h: 0.75, isTextBox: true, margin: 0, fontFace: H, fontSize: 40, bold: true, color: MINT });
    s.addText(l, { x, y: 5.95, w: 3.75, h: 0.7, isTextBox: true, margin: 0, fontFace: B, fontSize: 12, color: "8FA8B1", lineSpacing: 15 });
  });
  s.addNotes("1:10–1:25 — Say the three enablers fast. The bracketed figures are deliberate blanks: drop in numbers you can cite out loud, or delete the stat strip. Never present an unverifiable number.");
}

// =====================================================================
// 6 — SOLUTION / PIPELINE
// =====================================================================
{
  const s = lightSlide();
  kicker(s, "Solution", TEAL);
  title(s, "From the door to the sign-off");
  s.addText("Sehati carries the whole case — and the doctor signs every step of it.", {
    x: 0.7, y: 1.38, w: 11.9, h: 0.35, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 15, color: MUTE,
  });

  const steps = [
    ["Admission", "Nurse enters vitals only. No symptom fields."],
    ["AI interview", "The tablet locks and the AI interviews the patient directly."],
    ["Doctor workup", "Recommended exams and tests, each with its reason."],
    ["Differential", "Driven by results — ranked and cited, or honestly “not sure”."],
    ["Sign-off", "Final diagnosis, ruled-out alternatives, treatment plan."],
  ];
  steps.forEach(([h, d], i) => {
    const x = 0.7 + i * 2.44;
    card(s, x, 2.1, 2.24, 2.75, i === 3 ? "E4F5F1" : WASH, true);
    dot(s, x + 0.82, 2.42, 0.6, i === 3 ? TEAL : INK);
    s.addText(String(i + 1), { x: x + 0.82, y: 2.42, w: 0.6, h: 0.6, isTextBox: true, margin: 0, fontFace: B, fontSize: 16, bold: true, color: PAPER, align: "center", valign: "middle" });
    s.addText(h, { x: x + 0.15, y: 3.15, w: 1.94, h: 0.35, isTextBox: true, margin: 0, fontFace: B, fontSize: 14.5, bold: true, color: INK, align: "center" });
    s.addText(d, { x: x + 0.15, y: 3.55, w: 1.94, h: 1.3, isTextBox: true, margin: 0, fontFace: B, fontSize: 11.5, color: BODY, align: "center", lineSpacing: 15, valign: "top" });
    if (i < 4) s.addText("›", { x: x + 2.2, y: 3.3, w: 0.28, h: 0.4, isTextBox: true, margin: 0, fontFace: B, fontSize: 22, bold: true, color: MUTE, align: "center" });
  });

  s.addText("Two rules are enforced in the Lambda, not the browser: a doctor can only reach cases assigned to them, and a nurse’s response never contains clinical content — it isn’t stripped in the UI, it isn’t in the payload.", {
    x: 0.7, y: 5.4, w: 11.9, h: 0.75, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 13.5, color: BODY, lineSpacing: 20,
  });
  s.addNotes("1:25–1:50 — Walk the five steps in one breath each. Stress step 2 (the AI gets a full history because it is never in a hurry) and step 4 (results-driven, not intake-driven). Close on the security line — it's what makes this deployable in a hospital.");
}

// =====================================================================
// 7 — THE HERO: BRAINSTORMING PARTNER
// =====================================================================
{
  const s = darkSlide();
  kicker(s, "Added value", MINT);
  title(s, "It argues with the doctor", { dark: true });

  const pillars = [
    ["A partner to think with", "Every diagnosis has its own chat. “Why not pulmonary embolism?” gets a reasoned answer, not a re-ranked list. This is the colleague who isn’t there at 3 a.m."],
    ["Evidence you can audit", "Confidence explanation, risk, references and similar cases attached to each diagnosis. The doctor checks the reasoning, not the vibe."],
    ["The doctor stays the decision", "Rejections require a written reason. The AI is never the authorization boundary. Every action is written to an immutable audit trail."],
  ];
  pillars.forEach(([h, d], i) => {
    const y = 1.85 + i * 1.6;
    s.addShape(pres.ShapeType.roundRect, { x: 0.7, y, w: 11.9, h: 1.42, rectRadius: 0.12, fill: { color: INK_SOFT }, line: { color: "24505E" } });
    ring(s, 1.05, y + 0.42, 0.58, i === 0 ? MINT : TEAL, 2);
    dot(s, 1.24, y + 0.61, 0.2, i === 0 ? MINT : TEAL);
    s.addText(h, { x: 1.9, y: y + 0.22, w: 3.4, h: 0.4, isTextBox: true, margin: 0, fontFace: B, fontSize: 16, bold: true, color: i === 0 ? MINT : PAPER, valign: "middle" });
    s.addText(d, { x: 5.4, y: y + 0.2, w: 6.9, h: 1.0, isTextBox: true, margin: 0, fontFace: B, fontSize: 13, color: "B9CCD3", lineSpacing: 19, valign: "middle" });
  });

  s.addText("Not a directive. A brainstorming partner that shows its work — which is exactly what the doctors asked for.", {
    x: 0.7, y: 6.7, w: 11.9, h: 0.4, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 14, italic: true, color: "8FA8B1",
  });
  s.addNotes("1:50–2:10 — This is the slide that wins the pitch. The differentiator is not that we produce a differential — it's that the doctor can push back on it and get a real argument, with citations, while staying legally and clinically in charge.");
}

// =====================================================================
// 8 — PROBLEM / SOLUTION FIT
// =====================================================================
{
  const s = lightSlide();
  kicker(s, "Problem–solution fit", TEAL);
  title(s, "Every complaint has an answer");

  s.addText("What they told us", { x: 0.7, y: 1.55, w: 5.4, h: 0.35, isTextBox: true, margin: 0, fontFace: B, fontSize: 12, bold: true, charSpacing: 1.5, color: AMBER });
  s.addText("What Sehati does about it", { x: 7.0, y: 1.55, w: 5.6, h: 0.35, isTextBox: true, margin: 0, fontFace: B, fontSize: 12, bold: true, charSpacing: 1.5, color: TEAL });

  const pairs = [
    ["Reasoning alone", "Per-diagnosis discussion chat — challenge the reasoning, get an argument back"],
    ["Thin, second-hand history", "AI interviews the patient on a locked device, then hands over a structured summary"],
    ["Anchoring on the first idea", "Differential re-ranks on results, and says “not sure” by ordering more tests"],
    ["Can’t trust a black box", "Citations, confidence explanations, ruled-out alternatives, immutable audit"],
  ];
  pairs.forEach(([p, a], i) => {
    const y = 2.0 + i * 1.12;
    card(s, 0.7, y, 5.4, 0.95, "FBF0E9", false);
    s.addText(p, { x: 1.0, y, w: 5.0, h: 0.95, isTextBox: true, margin: 0, fontFace: B, fontSize: 14, bold: true, color: INK, valign: "middle" });
    s.addText("→", { x: 6.2, y, w: 0.7, h: 0.95, isTextBox: true, margin: 0, fontFace: B, fontSize: 20, bold: true, color: MUTE, align: "center", valign: "middle" });
    card(s, 7.0, y, 5.6, 0.95, "E4F5F1", false);
    s.addText(a, { x: 7.3, y, w: 5.0, h: 0.95, isTextBox: true, margin: 0, fontFace: B, fontSize: 13, color: INK, valign: "middle", lineSpacing: 17 });
  });
  s.addNotes("2:10–2:20 — Don't read this slide. Point at it: every row on the left came out of a doctor's mouth, every row on the right is shipped code.");
}

// =====================================================================
// 9 — DEMO
// =====================================================================
{
  const s = darkSlide();
  ring(s, -1.0, 4.2, 3.6, "1A4250", 2);
  ring(s, 10.9, 0.4, 3.4, "1A4250", 2);
  dot(s, 11.55, 5.6, 0.32, TEAL);

  s.addText("DEMO", {
    x: 0.7, y: 2.5, w: 11.9, h: 1.5, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 84, bold: true, color: PAPER, align: "center", charSpacing: 8,
  });
  s.addText("[ paste your video link here ]", {
    x: 0.7, y: 4.0, w: 11.9, h: 0.5, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 18, color: MINT, align: "center",
  });
  s.addText("One real case, end to end — admission, AI interview, differential, and a doctor pushing back on it.", {
    x: 0.7, y: 4.7, w: 11.9, h: 0.4, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 14, italic: true, color: "8FA8B1", align: "center",
  });
  s.addNotes("2:20–2:45 — Play the recorded video (25s max). Narrate only two moments: the patient talking to the locked tablet, and the doctor asking \"why not PE?\" and getting a reasoned answer. Replace this slide with the embedded video before presenting.");
}

// =====================================================================
// 10 — BUSINESS MODEL (deliberately reserved)
// =====================================================================
{
  const s = lightSlide();
  kicker(s, "Business model", TEAL);
  title(s, "Who pays, and for what");

  const blocks = [
    ["The buyer", "The hospital, not the individual doctor. Budget sits with the medical director; the ward is the unit of adoption."],
    ["The wedge", "One pilot ward → the department → the hospital → the network. Assignment-based access makes a single-ward pilot trivial."],
    ["What scales the price", "Doctors on the platform and cases worked up. Cost scales the same way — the stack is serverless and idles at zero."],
  ];
  blocks.forEach(([h, d], i) => {
    const x = 0.7 + i * 4.0;
    card(s, x, 1.8, 3.75, 2.5, WASH, true);
    dot(s, x + 0.32, 2.1, 0.4, TEAL);
    s.addText(h, { x: x + 0.32, y: 2.65, w: 3.1, h: 0.35, isTextBox: true, margin: 0, fontFace: B, fontSize: 15.5, bold: true, color: INK });
    s.addText(d, { x: x + 0.32, y: 3.05, w: 3.1, h: 1.1, isTextBox: true, margin: 0, fontFace: B, fontSize: 12.5, color: BODY, lineSpacing: 17, valign: "top" });
  });

  s.addShape(pres.ShapeType.roundRect, { x: 0.7, y: 4.7, w: 11.9, h: 1.7, rectRadius: 0.12, fill: { color: INK }, line: { color: INK } });
  s.addText("Pricing: still being worked out", {
    x: 1.1, y: 4.95, w: 11.1, h: 0.45, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 18, bold: true, color: MINT,
  });
  s.addText("We would rather show you the shape of the model than invent tiers we can’t defend. We’re costing a pilot ward against real Bedrock and HealthScribe usage now, and the number lands before the next milestone.", {
    x: 1.1, y: 5.42, w: 11.1, h: 0.8, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 13, color: "B9CCD3", lineSpacing: 18,
  });
  s.addNotes("2:45–2:55 — Own the gap instead of hiding it: we know the buyer and the wedge, we're pricing it against real usage. Judges respect \"we haven't made the number up yet\" more than a fabricated tier table. Replace this slide once you have the pilot costing.");
}

// =====================================================================
// 11 — COMPETITIVE POSITIONING
// =====================================================================
{
  const s = lightSlide();
  kicker(s, "Competitive advantage", TEAL);
  title(s, "Where we sit");

  const X0 = 3.5, Y0 = 1.75, W = 7.6, Hh = 4.5;
  s.addShape(pres.ShapeType.rect, { x: X0, y: Y0, w: W, h: Hh, fill: { color: WASH }, line: { color: "DCE5E8" } });
  s.addShape(pres.ShapeType.line, { x: X0, y: Y0 + Hh / 2, w: W, h: 0, line: { color: "C3D1D6", width: 1.25 } });
  s.addShape(pres.ShapeType.line, { x: X0 + W / 2, y: Y0, w: 0, h: Hh, line: { color: "C3D1D6", width: 1.25 } });

  s.addText("Owns the case workflow", { x: X0, y: Y0 - 0.42, w: W, h: 0.35, isTextBox: true, margin: 0, fontFace: B, fontSize: 12, bold: true, color: MUTE, align: "center" });
  s.addText("Bolt-on to the note", { x: X0, y: Y0 + Hh + 0.08, w: W, h: 0.35, isTextBox: true, margin: 0, fontFace: B, fontSize: 12, bold: true, color: MUTE, align: "center" });
  s.addText("Gives an answer", { x: X0 - 2.75, y: Y0 + Hh / 2 + 0.55, w: 2.6, h: 0.4, isTextBox: true, margin: 0, fontFace: B, fontSize: 12, bold: true, color: MUTE, align: "right", valign: "middle" });
  s.addText("Reasons with you", { x: X0 + W + 0.15, y: Y0 + Hh / 2 - 0.2, w: 2.4, h: 0.4, isTextBox: true, margin: 0, fontFace: B, fontSize: 12, bold: true, color: MUTE, valign: "middle" });

  const plot = (label, cx, cy, hero) => {
    const d = hero ? 0.42 : 0.26;
    dot(s, cx - d / 2, cy - d / 2, d, hero ? TEAL : "9BB0B8");
    s.addText(label, {
      x: cx - 1.5, y: cy + d / 2 + 0.06, w: 3.0, h: 0.5, isTextBox: true, margin: 0,
      fontFace: B, fontSize: hero ? 14 : 11.5, bold: hero, color: hero ? INK : MUTE, align: "center", lineSpacing: 14,
    });
  };
  plot("Symptom checkers", X0 + 1.5, Y0 + 3.5, false);
  plot("Ambient scribes", X0 + 2.2, Y0 + 1.15, false);
  plot("EHR suggestion\nwidgets", X0 + 2.6, Y0 + 2.6, false);
  plot("Literature search\ntools", X0 + 5.6, Y0 + 3.75, false);
  plot("Sehati", X0 + 5.9, Y0 + 1.15, true);

  s.addText("Our moat", { x: 0.7, y: 1.8, w: 2.5, h: 0.3, isTextBox: true, margin: 0, fontFace: B, fontSize: 12, bold: true, charSpacing: 1.4, color: TEAL });
  s.addText(
    "Scribes capture the visit but never reason. Symptom checkers reason but never touch the ward. Only Sehati sits inside the decision — so every accepted or rejected recommendation feeds back to us.",
    { x: 0.7, y: 2.2, w: 2.55, h: 2.2, isTextBox: true, margin: 0, fontFace: B, fontSize: 12.5, color: BODY, lineSpacing: 18, valign: "top" }
  );
  s.addNotes("2:55–3:05 — One sentence: everyone else either transcribes or answers; we're the only one inside the decision, which is why our feedback loop compounds.");
}

// =====================================================================
// 12 — FUTURE
// =====================================================================
{
  const s = darkSlide();
  kicker(s, "Future plans", MINT);
  title(s, "This has a long way to run", { dark: true });

  const items = [
    ["Next", "Real knowledge base", "Bedrock Knowledge Bases + S3 Vectors over a curated corpus — PMC, ClinicalTrials.gov, openFDA, ICD-10 — replacing today’s keyword matching."],
    ["Then", "Speak any language", "Translate, Comprehend Medical and Polly around the interview, so the patient is questioned in their own language."],
    ["Then", "See the whole patient", "Imaging and radiology reports, HealthLake/FHIR interop, pgvector cohort search over similar cases."],
    ["Goal", "A pilot ward, measured", "One hospital, one ward, with time-to-diagnosis and rejection reasons tracked as the evidence for the regulatory path."],
  ];
  items.forEach(([tag, h, d], i) => {
    const x = 0.7 + i * 3.03;
    s.addShape(pres.ShapeType.roundRect, { x, y: 2.0, w: 2.78, h: 3.7, rectRadius: 0.12, fill: { color: INK_SOFT }, line: { color: i === 3 ? TEAL : "24505E" } });
    s.addText(tag.toUpperCase(), { x: x + 0.3, y: 2.28, w: 2.2, h: 0.3, isTextBox: true, margin: 0, fontFace: B, fontSize: 10.5, bold: true, charSpacing: 1.8, color: i === 3 ? MINT : TEAL });
    s.addText(h, { x: x + 0.3, y: 2.65, w: 2.2, h: 0.75, isTextBox: true, margin: 0, fontFace: B, fontSize: 15, bold: true, color: PAPER, lineSpacing: 19 });
    s.addText(d, { x: x + 0.3, y: 3.5, w: 2.2, h: 1.9, isTextBox: true, margin: 0, fontFace: B, fontSize: 11.5, color: "AFC4CB", lineSpacing: 16, valign: "top" });
    if (i < 3) s.addText("›", { x: x + 2.78, y: 3.6, w: 0.25, h: 0.4, isTextBox: true, margin: 0, fontFace: B, fontSize: 20, bold: true, color: "4E7482", align: "center" });
  });

  s.addText("The workflow is already built and deployed. Everything above plugs into a seam that exists today.", {
    x: 0.7, y: 6.15, w: 11.9, h: 0.4, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 14, italic: true, color: "8FA8B1",
  });
  s.addNotes("3:05–3:15 — Fast. The point is that the hard part — the workflow, the security model, the audit trail — is done; these are plug-ins to seams that already exist.");
}

// =====================================================================
// 13 — THANK YOU / Q&A
// =====================================================================
{
  const s = darkSlide();
  ring(s, -1.4, 3.9, 4.4, "1A4250", 2);
  ring(s, 10.4, -0.9, 4.2, "1A4250", 2);
  ring(s, 11.3, 4.6, 2.6, "1A4250", 1.5);
  dot(s, 2.5, 5.7, 0.34, TEAL);
  dot(s, 11.0, 1.6, 0.24, MINT);

  s.addText("Thank you", {
    x: 0.7, y: 2.5, w: 11.9, h: 1.3, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 64, bold: true, color: PAPER, align: "center",
  });
  s.addText("Questions — especially the hard clinical ones.", {
    x: 0.7, y: 3.85, w: 11.9, h: 0.5, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 20, color: MINT, align: "center",
  });
  s.addText("Team Byters  ·  Sehati — AI Clinical Decision Support  ·  Decision support for a licensed physician, never a directive.", {
    x: 0.7, y: 6.6, w: 11.9, h: 0.35, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 11.5, color: "6E8B95", align: "center",
  });
  s.addNotes("Q&A. Have ready: (1) how we prevent automation bias — rejections require a written reason; (2) where PHI lives — KMS-encrypted DynamoDB/S3, immutable WORM audit; (3) regulatory posture — decision support presented for independent review, not a directive.");
}

pres.writeFile({ fileName: process.argv[2] || "sehati_pitch.pptx" }).then((f) => console.log("wrote", f));
