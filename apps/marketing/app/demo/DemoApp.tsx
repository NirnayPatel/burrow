"use client";

import { useEffect, useMemo, useState } from "react";
import { Logo } from "../components/Logo";
import styles from "./demo.module.css";

type View =
  | "home"
  | "chat"
  | "specs"
  | "roadmap"
  | "goals"
  | "feedback"
  | "market"
  | "context"
  | "teams"
  | "connections"
  | "automations"
  | "library"
  | "settings";

type SpecStatus = "Draft" | "In review" | "Approved" | "In progress" | "Done";
type Spec = {
  id: string;
  title: string;
  summary: string;
  status: SpecStatus;
  team: string;
  updated: string;
  owner: string;
  problem: string;
  goals: string[];
  requirements: string[];
  metrics: string[];
};

const navGroups: { label: string; items: { view: View; label: string }[] }[] = [
  {
    label: "Work",
    items: [
      { view: "home", label: "Home" },
      { view: "chat", label: "Chat" },
      { view: "specs", label: "Specs" },
      { view: "roadmap", label: "Roadmap" },
      { view: "goals", label: "Goals" },
    ],
  },
  {
    label: "Insight",
    items: [
      { view: "feedback", label: "Feedback" },
      { view: "market", label: "Market" },
      { view: "context", label: "Context" },
    ],
  },
  {
    label: "Org",
    items: [
      { view: "teams", label: "Teams" },
      { view: "connections", label: "Connections" },
      { view: "automations", label: "Automations" },
      { view: "library", label: "Library" },
      { view: "settings", label: "Settings" },
    ],
  },
];

const initialSpecs: Spec[] = [
  { id: "SPEC-128", title: "AI contract risk review workspace", summary: "Help in-house legal teams review third-party paper against their playbook in minutes, with every recommendation grounded in source language.", status: "In review", team: "Contract Intelligence", updated: "12m ago", owner: "Maya Patel", problem: "Enterprise legal teams still review routine agreements clause by clause. Across 18 discovery calls, counsel spent 45–90 minutes on a first pass, then rebuilt the rationale for every redline in email. Existing AI summaries are fast but difficult to trust because they omit the governing playbook, confidence, and source citation.", goals: ["Cut median first-pass review time from 64 to under 20 minutes.", "Ground every risk and suggested redline in contract language and the customer playbook.", "Let legal, sales, and procurement resolve review questions in one auditable workspace."], requirements: ["Ingest DOCX and PDF agreements while preserving clause structure and page citations.", "Classify clauses against approved, fallback, and escalation positions in the customer playbook.", "Show risk severity, model confidence, source text, rationale, and a suggested redline for every finding.", "Support inline comments, @mentions, assignments, and a complete decision audit trail.", "Export accepted redlines to DOCX without changing unrelated formatting."], metrics: ["≥70% of AI findings accepted or resolved without manual reclassification.", "P50 first-pass review time <20 minutes for NDAs and MSAs.", "<2% critical-risk false-negative rate in the monthly legal benchmark."] },
  { id: "SPEC-127", title: "Clause library and fallback positions", summary: "Give legal teams a governed source of truth for approved language and negotiation boundaries.", status: "In progress", team: "Contract Intelligence", updated: "38m ago", owner: "Priya Shah", problem: "Negotiation guidance lives across playbooks and inboxes.", goals: ["Centralize approved positions."], requirements: ["Versioned clause records", "Approval workflow", "Matter-specific overrides"], metrics: ["90% playbook coverage"] },
  { id: "SPEC-125", title: "Salesforce contract context sync", summary: "Bring deal value, stage, and commercial context into every contract review.", status: "Approved", team: "Platform & Trust", updated: "yesterday", owner: "Marcus Reed", problem: "Legal reviewers lack deal context.", goals: ["Remove CRM tab switching."], requirements: ["Opportunity sync", "Field mapping", "Permission controls"], metrics: ["80% linked matters"] },
  { id: "SPEC-121", title: "EU AI Act review audit trail", summary: "Make model use, evidence, and human decisions exportable for enterprise compliance teams.", status: "Draft", team: "Platform & Trust", updated: "2d ago", owner: "Daniel Kim", problem: "AI review decisions need defensible evidence.", goals: ["Audit-ready exports."], requirements: ["Model version log", "Human override record", "Evidence export"], metrics: ["100% review traceability"] },
  { id: "SPEC-118", title: "Bulk legacy contract ingestion", summary: "Turn shared-drive contract archives into a searchable obligation repository.", status: "Done", team: "Contract Intelligence", updated: "5d ago", owner: "Elena Torres", problem: "Legacy agreements are inaccessible.", goals: ["Fast migration."], requirements: ["Folder import", "Metadata extraction", "Duplicate detection"], metrics: ["95% extraction accuracy"] },
];

const roadmap = {
  Now: [
    { title: "AI redline review", detail: "3 of 5 specs complete", team: "Contract Intelligence" },
    { title: "Enterprise controls", detail: "2 of 4 specs complete", team: "Platform & Trust" },
  ],
  Next: [
    { title: "Obligation intelligence", detail: "4 specs · starts Jul 8", team: "Contract Intelligence" },
    { title: "CRM deal context", detail: "3 specs · starts Jul 15", team: "Platform & Trust" },
  ],
  Later: [
    { title: "Outside counsel portal", detail: "Discovery", team: "Product" },
    { title: "Multilingual review", detail: "Discovery", team: "Contract Intelligence" },
  ],
};

function Status({ value }: { value: SpecStatus }) {
  return <span className={`${styles.status} ${styles[`status${value.replace(" ", "")}`]}`}>{value}</span>;
}

function Avatar({ initials, tone = 1 }: { initials: string; tone?: number }) {
  return <span className={`${styles.avatar} ${styles[`avatar${tone}`]}`}>{initials}</span>;
}

export function DemoApp() {
  const [view, setView] = useState<View>("home");
  const [specs, setSpecs] = useState(initialSpecs);
  const [selectedSpec, setSelectedSpec] = useState<Spec | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const [dark, setDark] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { role: "assistant", text: "I’m grounded in Covenant AI’s specs, customer evidence, clause playbooks, goals, and decisions. What are we working through?" },
  ]);
  const [chatInput, setChatInput] = useState("");

  useEffect(() => {
    const fromHash = window.location.hash.slice(1) as View;
    if (navGroups.some((g) => g.items.some((i) => i.view === fromHash))) setView(fromHash);
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (event.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function navigate(next: View) {
    setView(next);
    setSelectedSpec(null);
    setPaletteOpen(false);
    setQuery("");
    window.history.replaceState(null, "", `/demo/#${next}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  function approve(id: string) {
    setSpecs((current) => current.map((spec) => spec.id === id ? { ...spec, status: "Approved" } : spec));
    setSelectedSpec((current) => current?.id === id ? { ...current, status: "Approved" } : current);
    notify(`${id} approved`);
  }

  function addSpec(title: string, team: string, problem: string) {
    const spec: Spec = { id: `SPEC-${129 + specs.length - initialSpecs.length}`, title, summary: "Define the customer outcome, scope, constraints, and measurable launch criteria.", status: "Draft", team, updated: "just now", owner: "Maya Patel", problem, goals: ["Define the measurable customer outcome."], requirements: ["Document the primary workflow and acceptance criteria."], metrics: ["Set a baseline and launch target."] };
    setSpecs((current) => [spec, ...current]);
    setSelectedSpec(spec);
    setView("specs");
    setCreateOpen(false);
    notify("Draft spec created");
  }

  function sendChat() {
    if (!chatInput.trim()) return;
    const question = chatInput.trim();
    setChatMessages((current) => [...current, { role: "user", text: question }]);
    setChatInput("");
    window.setTimeout(() => {
      setChatMessages((current) => [...current, { role: "assistant", text: "The strongest signal is trust in AI redlines: 31 of 86 feedback items ask for playbook grounding, clause citations, or a defensible audit trail. SPEC-128 addresses the review workspace; the remaining gap is customer-controlled model evaluation thresholds." }]);
    }, 500);
  }

  const paletteItems = useMemo(() => navGroups.flatMap((group) => group.items).filter((item) => item.label.toLowerCase().includes(query.toLowerCase())), [query]);

  return (
    <div className={`${styles.demo} ${dark ? styles.dark : ""}`} data-analytics-section="demo">
      <aside className={styles.sidebar} data-analytics-section="demo_navigation">
        <div className={styles.sidebarTop}>
          <a href="/" className={styles.brand} aria-label="Burrow home"><Logo size="sm" /></a>
          <button className={styles.search} onClick={() => setPaletteOpen(true)} aria-label="Search demo">
            <span>⌕</span><span>Search…</span><kbd>⌘K</kbd>
          </button>
        </div>
        <nav className={styles.nav} aria-label="Demo navigation">
          {navGroups.map((group) => (
            <div className={styles.navGroup} key={group.label}>
              <p className={styles.navLabel}>{group.label}</p>
              {group.items.map((item) => (
                <button key={item.view} className={`${styles.navItem} ${view === item.view ? styles.navActive : ""}`} onClick={() => navigate(item.view)}>{item.label}</button>
              ))}
            </div>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          <button className={styles.iconButton} onClick={() => setDark((value) => !value)} aria-label="Toggle theme">{dark ? "☀" : "☾"}</button>
          <button className={styles.account} onClick={() => navigate("settings")}><Avatar initials="MP" tone={2} /><span>Maya Patel</span></button>
        </div>
      </aside>

      <div className={styles.stage}>
        <div className={styles.demoBar} data-analytics-section="demo_banner">
          <span><strong>Live demo</strong> · Covenant AI</span>
          <span className={styles.demoBarNote}>Changes reset when you refresh.</span>
          <a href="/">Back to burrow ↗</a>
        </div>
        <main className={styles.main} data-analytics-section={`demo_${view}`}>
          {view === "home" && <Home specs={specs} onApprove={approve} onOpenSpec={(spec) => { setSelectedSpec(spec); setView("specs"); }} onNavigate={navigate} onNew={() => setCreateOpen(true)} />}
          {view === "chat" && <Chat messages={chatMessages} input={chatInput} setInput={setChatInput} onSend={sendChat} />}
          {view === "specs" && (selectedSpec ? <SpecDetail spec={selectedSpec} onBack={() => setSelectedSpec(null)} onApprove={() => approve(selectedSpec.id)} onUpdate={(next) => { setSelectedSpec(next); setSpecs((current) => current.map((item) => item.id === next.id ? next : item)); }} notify={notify} /> : <Specs specs={specs} onOpen={setSelectedSpec} onNew={() => setCreateOpen(true)} />)}
          {view === "roadmap" && <Roadmap />}
          {view === "goals" && <Goals />}
          {view === "feedback" && <Feedback onCreateSpec={() => setCreateOpen(true)} notify={notify} />}
          {view === "market" && <Market />}
          {view === "context" && <Context />}
          {view === "teams" && <Teams />}
          {view === "connections" && <Connections notify={notify} />}
          {view === "automations" && <Automations notify={notify} />}
          {view === "library" && <Library />}
          {view === "settings" && <Settings dark={dark} setDark={setDark} notify={notify} />}
        </main>
      </div>

      {paletteOpen && (
        <div className={styles.overlay} onMouseDown={() => setPaletteOpen(false)}>
          <div className={styles.palette} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Search">
            <div className={styles.paletteInput}><span>⌕</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages and commands…" /><kbd>esc</kbd></div>
            <div className={styles.paletteResults}>
              <p className={styles.paletteLabel}>Go to</p>
              {paletteItems.map((item) => <button key={item.view} onClick={() => navigate(item.view)}><span>{item.label}</span><span>↵</span></button>)}
              {paletteItems.length === 0 && <p className={styles.noResults}>No matching pages.</p>}
            </div>
          </div>
        </div>
      )}
      {createOpen && <NewSpecDialog onClose={() => setCreateOpen(false)} onCreate={addSpec} />}
      {toast && <div className={styles.toast}>✓ {toast}</div>}
    </div>
  );
}

function PageHeader({ title, eyebrow, action }: { title: string; eyebrow?: string; action?: React.ReactNode }) {
  return <header className={styles.pageHeader}><div>{eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}<h1>{title}</h1></div>{action}</header>;
}

function Card({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return <section className={styles.card}><div className={styles.cardHeader}><h2>{title}</h2>{count !== undefined && <span className={styles.count}>{count}</span>}</div>{children}</section>;
}

function Home({ specs, onApprove, onOpenSpec, onNavigate, onNew }: { specs: Spec[]; onApprove: (id: string) => void; onOpenSpec: (spec: Spec) => void; onNavigate: (view: View) => void; onNew: () => void }) {
  const attention = specs.filter((spec) => spec.status === "In review");
  return <div className={styles.widePage}>
    <PageHeader title="Good morning, Maya" eyebrow={`Covenant AI · ${attention.length} spec needs you · 3 agents working`} action={<button className={styles.primary} onClick={onNew}>New spec</button>} />
    <div className={styles.dashboardGrid}>
      <Card title="Needs your attention" count={attention.length}>{attention.map((spec) => <div className={styles.actionRow} key={spec.id}><button className={styles.rowMain} data-analytics-label="open_spec" onClick={() => onOpenSpec(spec)}><span><code>{spec.id}</code> {spec.title}</span><small>Product and engineering sign-off requested</small></button><button className={styles.secondarySmall} data-analytics-label="approve_spec" onClick={() => onApprove(spec.id)}>Approve</button></div>)}</Card>
      <Card title="Agents at work" count={3}>
        <div className={styles.agentRow}><span className={styles.agentPulse} /><div><strong>Claude Code</strong><p>Implementing clause evidence viewer for SPEC-128</p></div><small>now</small></div>
        <div className={styles.agentRow}><span className={styles.agentPulse} /><div><strong>Codex</strong><p>Running DOCX preservation checks on TASK-403</p></div><small>4m</small></div>
        <div className={styles.agentRow}><span className={styles.agentPulse} /><div><strong>Cursor</strong><p>Drafting audit log schema for SPEC-121</p></div><small>11m</small></div>
      </Card>
      <Card title="Suggested">
        <div className={styles.suggestion}><span>✦</span><p><strong>31 feedback items</strong> ask for explainable redlines and clause citations.</p><button onClick={() => onNavigate("feedback")}>Review</button></div>
        <div className={styles.suggestion}><span>✦</span><p><strong>O-24 is at risk.</strong> Critical-risk recall is 1.8 points below target.</p><button onClick={() => onNavigate("goals")}>Open</button></div>
      </Card>
      <Card title="Recent activity">
        <div className={styles.activity}><Avatar initials="PS" tone={3} /><p><strong>Priya</strong> approved SPEC-125 <small>18m ago</small></p></div>
        <div className={styles.activity}><Avatar initials="AI" tone={4} /><p><strong>Burrow AI</strong> linked 14 feedback items to SPEC-128 <small>32m ago</small></p></div>
        <div className={styles.activity}><Avatar initials="ET" tone={1} /><p><strong>Elena</strong> shared the risk-review prototype <small>1h ago</small></p></div>
      </Card>
    </div>
  </div>;
}

function Chat({ messages, input, setInput, onSend }: { messages: { role: string; text: string }[]; input: string; setInput: (value: string) => void; onSend: () => void }) {
  return <div className={styles.chatPage}><PageHeader title="Chat" eyebrow="Ask across your product context" />
    <div className={styles.chatThread}>{messages.map((message, index) => <div className={`${styles.message} ${message.role === "user" ? styles.userMessage : ""}`} key={index}>{message.role === "assistant" && <Avatar initials="B" tone={3} />}<div><strong>{message.role === "assistant" ? "Burrow" : "You"}</strong><p>{message.text}</p>{message.role === "assistant" && index > 0 && <div className={styles.citations}><button>Feedback · 18 items</button><button>Goal · O-12</button><button>Spec · SPEC-42</button></div>}</div></div>)}</div>
    <div className={styles.chatComposer}><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onSend(); } }} placeholder="Ask about your roadmap, customers, specs, or goals…" /><button className={styles.primary} onClick={onSend}>Send</button></div>
    <div className={styles.promptChips}>{["What blocks trusted AI review?", "Summarize legal ops feedback", "Which specs are at risk?"].map((prompt) => <button key={prompt} onClick={() => setInput(prompt)}>{prompt}</button>)}</div>
  </div>;
}

function Specs({ specs, onOpen, onNew }: { specs: Spec[]; onOpen: (spec: Spec) => void; onNew: () => void }) {
  const [team, setTeam] = useState("All teams");
  const visible = team === "All teams" ? specs : specs.filter((spec) => spec.team === team);
  return <div className={styles.basePage}><PageHeader title="Specs" action={<button className={styles.primary} onClick={onNew}>New spec</button>} />
    <div className={styles.filters}>{["All teams", "Product", "Contract Intelligence", "Platform & Trust"].map((name) => <button className={team === name ? styles.filterActive : ""} key={name} onClick={() => setTeam(name)}>{name}</button>)}</div>
    <div className={styles.insight}>✦ <span><strong>Backlog insight:</strong> 31 customer signals connect trust in AI redlines to playbook grounding and auditability.</span><button>Review</button></div>
    <div className={styles.specList}>{visible.map((spec) => <button className={styles.specRow} data-analytics-label="open_spec" key={spec.id} onClick={() => onOpen(spec)}><code>{spec.id}</code><span><strong>{spec.title}</strong><small>{spec.team} · updated {spec.updated}</small></span><Status value={spec.status} /><span className={styles.chevron}>›</span></button>)}</div>
  </div>;
}

function SpecDetail({ spec, onBack, onApprove, onUpdate, notify }: { spec: Spec; onBack: () => void; onApprove: () => void; onUpdate: (spec: Spec) => void; notify: (message: string) => void }) {
  const [tab, setTab] = useState<"Assistant" | "Tasks" | "Runs">("Assistant");
  const [editing, setEditing] = useState(false);
  const update = (field: keyof Spec, value: Spec[keyof Spec]) => onUpdate({ ...spec, [field]: value, updated: "just now" });
  return <div className={styles.specDetail}>
    <div className={styles.specTopbar}><button className={styles.back} onClick={onBack}>← Specs</button><div className={styles.editActions}><div className={styles.presence}><Avatar initials="MP" tone={2} /><Avatar initials="ET" tone={3} /><Avatar initials="MR" tone={4} /><span>{editing ? "3 editing now" : "3 collaborators online"}</span></div><button className={editing ? styles.primary : styles.secondary} onClick={() => { setEditing((value) => !value); notify(editing ? "Changes saved" : "Multiplayer editing started"); }}>{editing ? "Save changes" : "Enter multiplayer edit"}</button></div></div>
    <div className={styles.specColumns}>
      <article className={`${styles.document} ${editing ? styles.editingDocument : ""}`}>
        {editing && <><span className={`${styles.remoteCursor} ${styles.cursorDesign}`}>Elena · Design</span><span className={`${styles.remoteCursor} ${styles.cursorEng}`}>Marcus · Engineering</span></>}
        <div className={styles.documentMeta}><code>{spec.id}</code><Status value={spec.status} /><span>{spec.team}</span></div>
        {editing ? <input className={styles.titleEditor} value={spec.title} onChange={(event) => update("title", event.target.value)} /> : <h1>{spec.title}</h1>}
        {editing ? <textarea className={styles.leadEditor} value={spec.summary} onChange={(event) => update("summary", event.target.value)} /> : <p className={styles.lead}>{spec.summary}</p>}
        <h2>Problem and evidence</h2>{editing ? <textarea className={styles.blockEditor} value={spec.problem} onChange={(event) => update("problem", event.target.value)} /> : <p>{spec.problem}</p>}
        <h2>Goals</h2><EditableList values={spec.goals} editing={editing} onChange={(values) => update("goals", values)} />
        <h2>Non-goals</h2><ul><li>Autonomously send redlines to counterparties without human review.</li><li>Replace the customer’s legal judgment or change approved playbook positions.</li><li>Support every agreement type at launch; v1 covers NDAs and MSAs.</li></ul>
        <h2>Personas and jobs</h2><ul><li><strong>Commercial counsel:</strong> identify unacceptable terms and produce defensible redlines quickly.</li><li><strong>Legal ops:</strong> enforce the playbook, measure review quality, and audit exceptions.</li><li><strong>Sales lead:</strong> understand blockers and answer commercial questions without chasing legal.</li></ul>
        <h2>Functional requirements</h2><EditableList values={spec.requirements} editing={editing} onChange={(values) => update("requirements", values)} />
        <div className={styles.callout}><strong>Decision · Jun 20</strong><p>Recommendations always expose contract evidence, playbook position, model confidence, and human ownership. “Because the AI said so” is not an acceptable explanation.</p></div>
        <h2>Success metrics</h2><EditableList values={spec.metrics} editing={editing} onChange={(values) => update("metrics", values)} />
        <h2>Rollout and safeguards</h2><p>Launch with 5 design partners on NDAs, then expand to MSAs after the critical-risk benchmark clears threshold for two consecutive releases. Admins control model access, retention, and the playbook version used for each review. Every suggestion remains a draft until accepted by a licensed user.</p>
        <h2>Acceptance criteria</h2><div className={styles.checklist}><label><input type="checkbox" defaultChecked /> Every finding deep-links to contract and playbook evidence</label><label><input type="checkbox" defaultChecked /> Accepted redlines export to DOCX with formatting intact</label><label><input type="checkbox" /> Critical-risk benchmark signed off by Legal AI Council</label></div>
        <div className={styles.signoff}><div><strong>Ready for sign-off</strong><p>Product approved · Engineering review requested</p></div>{spec.status !== "Approved" && <button className={styles.primary} onClick={onApprove}>Approve spec</button>}</div>
      </article>
      <aside className={styles.assistantPanel}>
        <div className={styles.tabs}>{(["Assistant", "Tasks", "Runs"] as const).map((name) => <button className={tab === name ? styles.tabActive : ""} key={name} onClick={() => setTab(name)}>{name}</button>)}</div>
        {tab === "Assistant" && <div className={styles.panelContent}><div className={styles.aiNote}><span>✦</span><div><strong>State of spec</strong><p>Strong problem framing and safeguards. The critical-risk benchmark still needs a named approver.</p></div></div><h3>Grounding</h3><div className={styles.grounding}><button>O-24 · Trusted AI review</button><button>Theme · Explainable redlines</button><button>CTX-18 · Clause playbook</button></div><h3>Ask Burrow</h3><textarea placeholder="Ask about this spec…" /><button className={styles.primary}>Send</button></div>}
        {tab === "Tasks" && <div className={styles.panelContent}>{["Build clause evidence viewer", "Implement playbook classifier", "Preserve DOCX redline formatting", "Run critical-risk benchmark"].map((task, index) => <div className={styles.task} key={task}><code>TASK-{401 + index}</code><strong>{task}</strong><small>{index < 2 ? "In progress · Claude Code" : "Ready"}</small></div>)}</div>}
        {tab === "Runs" && <div className={styles.panelContent}><div className={styles.run}><span className={styles.agentPulse} /><div><strong>Claude Code</strong><p>Implementing template selector</p><small>14 tool calls · 8m</small></div></div><div className={styles.run}><span className={styles.doneDot}>✓</span><div><strong>Codex</strong><p>Acceptance criteria review</p><small>Completed 24m ago</small></div></div></div>}
      </aside>
    </div>
  </div>;
}

function EditableList({ values, editing, onChange }: { values: string[]; editing: boolean; onChange: (values: string[]) => void }) {
  if (!editing) return <ul>{values.map((value) => <li key={value}>{value}</li>)}</ul>;
  return <div className={styles.editableList}>{values.map((value, index) => <textarea key={index} value={value} onChange={(event) => onChange(values.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} />)}<button onClick={() => onChange([...values, "New requirement"])}>+ Add item</button></div>;
}

function NewSpecDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (title: string, team: string, problem: string) => void }) {
  const [title, setTitle] = useState("");
  const [team, setTeam] = useState("Contract Intelligence");
  const [problem, setProblem] = useState("");
  return <div className={styles.overlay} onMouseDown={onClose}><form className={styles.createDialog} onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); if (title.trim()) onCreate(title.trim(), team, problem.trim() || "Describe the customer problem and supporting evidence."); }}><div><p className={styles.eyebrow}>Covenant AI</p><h2>Create a new spec</h2><p>Start with the problem. Burrow adds a complete product requirements structure.</p></div><label>Spec title<input autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Renewal obligation alerts" /></label><label>Team<select value={team} onChange={(event) => setTeam(event.target.value)}><option>Contract Intelligence</option><option>Platform & Trust</option><option>Product</option><option>Design</option></select></label><label>Problem and evidence<textarea value={problem} onChange={(event) => setProblem(event.target.value)} placeholder="Who has the problem, what happens today, and what evidence do we have?" /></label><div className={styles.dialogActions}><button type="button" className={styles.secondary} onClick={onClose}>Cancel</button><button className={styles.primary}>Create draft</button></div></form></div>;
}

function Roadmap() {
  return <div className={styles.widePage}><PageHeader title="Roadmap" eyebrow="Outcomes over dates" action={<button className={styles.primary}>New initiative</button>} /><div className={styles.insight}>✦ <span><strong>Planning insight:</strong> Platform & Trust has 4 concurrent specs and 2 engineers. EU audit trail may slip.</span><button>View risk</button></div><div className={styles.roadmap}>{Object.entries(roadmap).map(([horizon, items]) => <section className={styles.roadmapColumn} key={horizon}><div className={styles.columnHeader}><h2>{horizon}</h2><span>{items.length}</span></div>{items.map((item) => <article className={styles.initiative} key={item.title}><span className={styles.teamPill}>{item.team}</span><h3>{item.title}</h3><p>{item.detail}</p><div className={styles.progress}><span style={{ width: horizon === "Now" ? "62%" : horizon === "Next" ? "24%" : "8%" }} /></div></article>)}</section>)}</div></div>;
}

function Goals() {
  const goals = [
    { id: "O-24", title: "Make AI review defensible", owner: "Maya Patel", progress: 68, target: "98% critical-risk recall by Sep 30", status: "At risk" },
    { id: "O-23", title: "Cut contract cycle time", owner: "Priya Shah", progress: 54, target: "50% faster first-pass review", status: "On track" },
    { id: "O-22", title: "Become enterprise-ready", owner: "Marcus Reed", progress: 81, target: "5 regulated design partners live", status: "On track" },
  ];
  return <div className={styles.basePage}><PageHeader title="Goals" action={<button className={styles.primary}>New goal</button>} /><div className={styles.goalList}>{goals.map((goal) => <article className={styles.goal} key={goal.id}><div className={styles.goalHead}><code>{goal.id}</code><span className={goal.status === "At risk" ? styles.risk : styles.track}>{goal.status}</span></div><h2>{goal.title}</h2><p>{goal.target}</p><div className={styles.goalProgress}><span style={{ width: `${goal.progress}%` }} /></div><footer><span>{goal.progress}%</span><span>{goal.owner}</span><span>3 linked specs</span></footer></article>)}</div></div>;
}

function Feedback({ onCreateSpec, notify }: { onCreateSpec: () => void; notify: (message: string) => void }) {
  const themes = [
    { title: "Explainable redlines", count: 31, sentiment: "mixed", text: "Counsel needs contract citations, playbook evidence, and confidence before trusting an AI recommendation.", linked: true },
    { title: "DOCX fidelity", count: 22, sentiment: "negative", text: "Legal teams will not adopt review tools that disturb numbering, comments, or tracked changes.", linked: true },
    { title: "Renewal obligations", count: 18, sentiment: "positive", text: "Legal ops wants reliable notice dates, owners, and alerts after signature.", linked: false },
  ];
  return <div className={styles.basePage}><PageHeader title="Feedback" eyebrow="86 items · 8 sources · last 90 days" action={<button className={styles.secondary} onClick={() => notify("Feedback re-clustered into 9 themes")}>Re-cluster with AI</button>} /><section><div className={styles.sectionHeading}><div><h2>Themes</h2><p>AI groups feedback so you can see what matters most.</p></div></div><div className={styles.themeGrid}>{themes.map((theme) => <article className={styles.themeCard} key={theme.title}><div><span className={`${styles.sentiment} ${styles[theme.sentiment]}`} /><h3>{theme.title}</h3><span className={styles.countPill}>{theme.count} items</span></div><p>{theme.text}</p>{theme.linked ? <button className={styles.textButton}>View linked spec →</button> : <button className={styles.suggestionButton} onClick={onCreateSpec}>✦ Turn this theme into a spec</button>}</article>)}</div></section><section className={styles.feedbackItems}><div className={styles.sectionHeading}><div><h2>Latest feedback</h2><p>Customer evidence stays linked to the work it shapes.</p></div><button className={styles.primary} onClick={() => notify("Feedback item added")}>Add feedback</button></div>{[
    ["Halcyon Health", "interview", "I need to click from the redline to our exact fallback position. A generic explanation will not pass review."],
    ["Meridian Systems", "support", "The exported DOCX changed section numbering. That is a hard stop for our commercial counsel."],
    ["Alder Bio", "sales", "Show us critical-risk recall on our own benchmark set and security will approve a pilot."],
    ["Northbank", "Zoom", "Sales needs an ETA and blocker summary without access to privileged legal comments."],
    ["Kestrel Energy", "NPS", "The clause citations are the first AI feature our attorneys actually trust."],
    ["Atlas Freight", "Slack", "Renewal notice dates still live in a spreadsheet owned by one paralegal."],
    ["Vela Robotics", "Gong", "We need Salesforce opportunity value visible before deciding how hard to negotiate liability."],
    ["Ember Finance", "support", "SCIM groups and regional retention are required before production data can enter the platform."],
  ].map(([customer, source, text]) => <article className={styles.feedbackRow} key={customer}><span className={styles.source}>{source}</span><div><p>{text}</p><small>{customer} · Enterprise · 2d ago</small></div></article>)}</section></div>;
}

function Market() {
  return <div className={styles.basePage}><PageHeader title="Market" eyebrow="Competitive intelligence, grounded in sources" action={<button className={styles.primary}>Add signal</button>} /><div className={styles.marketGrid}>{[
    { company: "Ironclad", signal: "Expanded AI-assisted contract review", impact: "Suite incumbents are moving upstream from repository into negotiation.", date: "Jun 18" },
    { company: "Harvey", signal: "Deepened enterprise legal workflows", impact: "Raises expectations for domain-specific model quality and trust.", date: "Jun 14" },
    { company: "Luminance", signal: "Added negotiation automation", impact: "Makes redline speed a crowded claim; evidence and control must differentiate.", date: "Jun 9" },
    { company: "Spellbook", signal: "Expanded Microsoft Word review", impact: "Confirms DOCX-native fidelity is essential for counsel adoption.", date: "Jun 4" },
  ].map((item) => <article className={styles.marketCard} key={item.company}><div><strong>{item.company}</strong><small>{item.date}</small></div><h2>{item.signal}</h2><p>{item.impact}</p><footer><button>Open source ↗</button><button>Link to context</button></footer></article>)}</div></div>;
}

function Context() {
  const docs = [
    { id: "CTX-18", title: "Commercial contract playbook", type: "Policy", excerpt: "Approved and fallback positions for liability, indemnity, data use, security, and termination clauses.", updated: "today" },
    { id: "CTX-17", title: "Legal AI product principles", type: "Principles", excerpt: "Evidence before assertion. Humans own legal judgment. Every model action remains inspectable and reversible.", updated: "yesterday" },
    { id: "CTX-16", title: "Q3 enterprise strategy", type: "Strategy", excerpt: "Win trusted first-pass review, prove DOCX fidelity, then expand into post-signature obligations.", updated: "3d ago" },
    { id: "CTX-14", title: "Model evaluation standard", type: "Research", excerpt: "Customer-specific benchmark sets, severity-weighted recall, confidence calibration, and monthly regression gates.", updated: "1w ago" },
  ];
  return <div className={styles.basePage}><PageHeader title="Context" eyebrow="The source of truth people and agents share" action={<button className={styles.primary}>New document</button>} /><div className={styles.contextGraph}><div><span>Goals</span><strong>3</strong></div><i>→</i><div><span>Context</span><strong>12</strong></div><i>→</i><div><span>Specs</span><strong>18</strong></div><i>→</i><div><span>Tasks</span><strong>64</strong></div></div><div className={styles.docList}>{docs.map((doc) => <article key={doc.id}><div><code>{doc.id}</code><span className={styles.typePill}>{doc.type}</span></div><h2>{doc.title}</h2><p>{doc.excerpt}</p><small>Updated {doc.updated} · 6 linked objects</small></article>)}</div></div>;
}

function Teams() {
  return <div className={styles.basePage}><PageHeader title="Teams" eyebrow="Covenant AI · 18 members" action={<button className={styles.primary}>New team</button>} /><div className={styles.teamGrid}>{[
    { name: "Product", lead: "Maya Patel", people: ["MP", "PS", "ET", "AJ"], focus: "Legal workflows · customer discovery" },
    { name: "Contract Intelligence", lead: "Daniel Kim", people: ["DK", "MR", "SL", "NC"], focus: "Clause models · review experience" },
    { name: "Platform & Trust", lead: "Marcus Reed", people: ["MR", "AK", "CW", "IB"], focus: "Enterprise controls · integrations" },
  ].map((team, index) => <article className={styles.teamCard} key={team.name}><div className={styles.teamIcon}>{team.name.slice(0, 1)}</div><h2>{team.name}</h2><p>{team.focus}</p><div className={styles.avatarStack}>{team.people.map((person, i) => <Avatar key={person} initials={person} tone={(i + index) % 4 + 1} />)}</div><footer><span>Lead · {team.lead}</span><button>Open team →</button></footer></article>)}</div></div>;
}

function Connections({ notify }: { notify: (message: string) => void }) {
  return <div className={styles.basePage}><PageHeader title="Connections" eyebrow="Bring signals in. Send approved work out." /><div className={styles.connectionGrid}>{[
    { name: "Figma MCP", mark: "F", status: "Connected", detail: "Risk review workspace · 12 frames indexed" },
    { name: "Zoom", mark: "Z", status: "Connected", detail: "Customer discovery · transcripts and clips" },
    { name: "Amplitude", mark: "A", status: "Connected", detail: "Production workspace · 42 tracked events" },
    { name: "Salesforce", mark: "SF", status: "Connected", detail: "Enterprise pipeline · opportunity context" },
    { name: "Slack", mark: "S", status: "Connected", detail: "#voice-of-customer · 14 channels" },
    { name: "Linear", mark: "L", status: "Connected", detail: "Covenant AI workspace · two-way sync" },
    { name: "Google Drive", mark: "G", status: "Available", detail: "Import playbooks and contract research" },
    { name: "Intercom", mark: "I", status: "Available", detail: "Continuously ingest support signals" },
  ].map((connection) => <article className={styles.connection} key={connection.name}><span className={styles.connectionMark}>{connection.mark}</span><div><h2>{connection.name}</h2><p>{connection.detail}</p></div><button className={connection.status === "Connected" ? styles.connected : styles.secondarySmall} onClick={() => notify(connection.status === "Connected" ? `${connection.name} connection is healthy` : `${connection.name} connection flow opened`)}>{connection.status === "Connected" ? "✓ Connected" : "Connect"}</button></article>)}</div></div>;
}

function Automations({ notify }: { notify: (message: string) => void }) {
  const [enabled, setEnabled] = useState([true, true, false, true]);
  const items = [
    ["Cluster legal ops feedback", "Every weekday at 8:00 AM", "Last ran 2h ago · 12 items clustered"],
    ["Weekly contract intelligence brief", "Fridays at 3:00 PM", "Sent to #product-leadership"],
    ["Flag stale specs", "When a spec is inactive for 14 days", "Would notify 2 spec owners"],
    ["Sync approved tasks to Linear", "When a spec is approved", "Last ran 18m ago · 4 issues created"],
  ];
  return <div className={styles.basePage}><PageHeader title="Automations" eyebrow="Keep the product loop moving" action={<button className={styles.primary}>New automation</button>} /><div className={styles.automationList}>{items.map((item, index) => <article key={item[0]}><button className={`${styles.toggle} ${enabled[index] ? styles.toggleOn : ""}`} onClick={() => { setEnabled((values) => values.map((value, i) => i === index ? !value : value)); notify(`${item[0]} ${enabled[index] ? "paused" : "enabled"}`); }}><span /></button><div><h2>{item[0]}</h2><p>{item[1]}</p><small>{item[2]}</small></div><button className={styles.more}>•••</button></article>)}</div></div>;
}

function Library() {
  return <div className={styles.basePage}><PageHeader title="Library" eyebrow="Reusable product knowledge" action={<button className={styles.primary}>New template</button>} /><div className={styles.libraryGrid}>{[
    ["Legal-tech PRD", "Product requirement", "Used 24 times", "Evidence · goals · non-goals · requirements · safeguards · metrics"],
    ["Counsel interview", "Research", "Used 18 times", "Matter · workflow · risk · trust threshold · buying signal"],
    ["AI launch review", "Playbook", "Used 12 times", "Evaluation · security · rollout · monitoring · rollback"],
    ["Weekly product brief", "Automation", "Used 9 times", "Goals · shipped · learned · customer evidence · blocked"],
  ].map((item) => <article key={item[0]}><span className={styles.libraryIcon}>▤</span><span className={styles.typePill}>{item[1]}</span><h2>{item[0]}</h2><p>{item[3]}</p><small>{item[2]}</small><button>Use template →</button></article>)}</div></div>;
}

function Settings({ dark, setDark, notify }: { dark: boolean; setDark: (value: boolean) => void; notify: (message: string) => void }) {
  return <div className={styles.settingsPage}><PageHeader title="Settings" eyebrow="Demo workspace" /><section className={styles.settingsSection}><h2>Profile</h2><div className={styles.profileRow}><Avatar initials="MP" tone={2} /><label>Name<input defaultValue="Maya Patel" /></label><label>Email<input defaultValue="maya@covenant.ai" /></label></div></section><section className={styles.settingsSection}><h2>Appearance</h2><div className={styles.themeOptions}><button className={!dark ? styles.themeSelected : ""} onClick={() => setDark(false)}><span className={styles.lightPreview} />Light</button><button className={dark ? styles.themeSelected : ""} onClick={() => setDark(true)}><span className={styles.darkPreview} />Dark</button></div></section><section className={styles.settingsSection}><h2>Workspace</h2><label className={styles.fullField}>Workspace name<input defaultValue="Covenant AI" /></label><label className={styles.fullField}>Workspace URL<input defaultValue="covenant.burrow.app" /></label></section><button className={styles.primary} onClick={() => notify("Settings saved for this demo session")}>Save changes</button></div>;
}
