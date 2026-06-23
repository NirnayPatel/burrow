"use client";

import { useEffect, useMemo, useState } from "react";
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
  { id: "SPEC-42", title: "Collaborative onboarding workspace", summary: "Give every new team a useful workspace in under ten minutes.", status: "In review", team: "Growth", updated: "12m ago" },
  { id: "SPEC-41", title: "Slack feedback ingestion", summary: "Turn customer messages into tagged feedback without leaving Slack.", status: "In progress", team: "Core Product", updated: "38m ago" },
  { id: "SPEC-39", title: "Enterprise SSO and SCIM", summary: "Support secure provisioning for enterprise workspaces.", status: "Approved", team: "Platform", updated: "yesterday" },
  { id: "SPEC-38", title: "AI-assisted roadmap review", summary: "Surface delivery risk and goal drift before weekly planning.", status: "Draft", team: "Core Product", updated: "2d ago" },
  { id: "SPEC-35", title: "Customer health signals", summary: "Unify product usage and qualitative feedback by account.", status: "Done", team: "Growth", updated: "5d ago" },
];

const roadmap = {
  Now: [
    { title: "Activation sprint", detail: "3 of 5 specs complete", team: "Growth" },
    { title: "Enterprise foundations", detail: "2 of 4 specs complete", team: "Platform" },
  ],
  Next: [
    { title: "Feedback intelligence", detail: "4 specs · starts Jul 8", team: "Core Product" },
    { title: "Admin controls", detail: "3 specs · starts Jul 15", team: "Platform" },
  ],
  Later: [
    { title: "Mobile companion", detail: "Discovery", team: "Core Product" },
    { title: "Partner ecosystem", detail: "Discovery", team: "Growth" },
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
  const [chatMessages, setChatMessages] = useState([
    { role: "assistant", text: "I’m grounded in Northstar Labs’ specs, feedback, goals, and decisions. What are we working through?" },
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

  function addSpec(title = "Untitled spec") {
    const spec: Spec = { id: `SPEC-${43 + specs.length - initialSpecs.length}`, title, summary: "Add the problem, desired outcome, and constraints.", status: "Draft", team: "Core Product", updated: "just now" };
    setSpecs((current) => [spec, ...current]);
    setSelectedSpec(spec);
    setView("specs");
    notify("Draft spec created");
  }

  function sendChat() {
    if (!chatInput.trim()) return;
    const question = chatInput.trim();
    setChatMessages((current) => [...current, { role: "user", text: question }]);
    setChatInput("");
    window.setTimeout(() => {
      setChatMessages((current) => [...current, { role: "assistant", text: "The strongest signal is onboarding friction: 18 of 47 feedback items mention setup complexity, and it directly affects O-12. SPEC-42 addresses the first-run flow; the remaining gap is role-based templates for enterprise teams." }]);
    }, 500);
  }

  const paletteItems = useMemo(() => navGroups.flatMap((group) => group.items).filter((item) => item.label.toLowerCase().includes(query.toLowerCase())), [query]);

  return (
    <div className={`${styles.demo} ${dark ? styles.dark : ""}`}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTop}>
          <a href="/" className={styles.brand}>Burrow</a>
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
        <div className={styles.demoBar}>
          <span><strong>Live demo</strong> · Northstar Labs</span>
          <span className={styles.demoBarNote}>Changes reset when you refresh.</span>
          <a href="/">Back to burrow ↗</a>
        </div>
        <main className={styles.main}>
          {view === "home" && <Home specs={specs} onApprove={approve} onOpenSpec={(spec) => { setSelectedSpec(spec); setView("specs"); }} onNavigate={navigate} />}
          {view === "chat" && <Chat messages={chatMessages} input={chatInput} setInput={setChatInput} onSend={sendChat} />}
          {view === "specs" && (selectedSpec ? <SpecDetail spec={selectedSpec} onBack={() => setSelectedSpec(null)} onApprove={() => approve(selectedSpec.id)} /> : <Specs specs={specs} onOpen={setSelectedSpec} onNew={() => addSpec()} />)}
          {view === "roadmap" && <Roadmap />}
          {view === "goals" && <Goals />}
          {view === "feedback" && <Feedback onCreateSpec={() => addSpec("Role-based onboarding templates")} notify={notify} />}
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

function Home({ specs, onApprove, onOpenSpec, onNavigate }: { specs: Spec[]; onApprove: (id: string) => void; onOpenSpec: (spec: Spec) => void; onNavigate: (view: View) => void }) {
  const attention = specs.filter((spec) => spec.status === "In review");
  return <div className={styles.widePage}>
    <PageHeader title="Good morning, Maya" eyebrow={`${attention.length} spec needs you · 3 agents working`} action={<button className={styles.primary} onClick={() => onNavigate("specs")}>New spec</button>} />
    <div className={styles.dashboardGrid}>
      <Card title="Needs your attention" count={attention.length}>{attention.map((spec) => <div className={styles.actionRow} key={spec.id}><button className={styles.rowMain} onClick={() => onOpenSpec(spec)}><span><code>{spec.id}</code> {spec.title}</span><small>Product and engineering sign-off requested</small></button><button className={styles.secondarySmall} onClick={() => onApprove(spec.id)}>Approve</button></div>)}</Card>
      <Card title="Agents at work" count={3}>
        <div className={styles.agentRow}><span className={styles.agentPulse} /><div><strong>Claude Code</strong><p>Implementing Slack event ingestion for SPEC-41</p></div><small>now</small></div>
        <div className={styles.agentRow}><span className={styles.agentPulse} /><div><strong>Codex</strong><p>Running acceptance checks on TASK-118</p></div><small>4m</small></div>
        <div className={styles.agentRow}><span className={styles.agentPulse} /><div><strong>Cursor</strong><p>Drafting SSO migration notes for SPEC-39</p></div><small>11m</small></div>
      </Card>
      <Card title="Suggested">
        <div className={styles.suggestion}><span>✦</span><p><strong>18 feedback items</strong> point to role-based onboarding. Create a spec?</p><button onClick={() => onNavigate("feedback")}>Review</button></div>
        <div className={styles.suggestion}><span>✦</span><p><strong>O-12 is at risk.</strong> Activation is 7 points below the June target.</p><button onClick={() => onNavigate("goals")}>Open</button></div>
      </Card>
      <Card title="Recent activity">
        <div className={styles.activity}><Avatar initials="RK" tone={3} /><p><strong>Raj</strong> approved SPEC-39 <small>18m ago</small></p></div>
        <div className={styles.activity}><Avatar initials="AI" tone={4} /><p><strong>Burrow AI</strong> linked 6 feedback items to SPEC-42 <small>32m ago</small></p></div>
        <div className={styles.activity}><Avatar initials="JL" tone={1} /><p><strong>Jordan</strong> moved Feedback intelligence to Next <small>1h ago</small></p></div>
      </Card>
    </div>
  </div>;
}

function Chat({ messages, input, setInput, onSend }: { messages: { role: string; text: string }[]; input: string; setInput: (value: string) => void; onSend: () => void }) {
  return <div className={styles.chatPage}><PageHeader title="Chat" eyebrow="Ask across your product context" />
    <div className={styles.chatThread}>{messages.map((message, index) => <div className={`${styles.message} ${message.role === "user" ? styles.userMessage : ""}`} key={index}>{message.role === "assistant" && <Avatar initials="B" tone={3} />}<div><strong>{message.role === "assistant" ? "Burrow" : "You"}</strong><p>{message.text}</p>{message.role === "assistant" && index > 0 && <div className={styles.citations}><button>Feedback · 18 items</button><button>Goal · O-12</button><button>Spec · SPEC-42</button></div>}</div></div>)}</div>
    <div className={styles.chatComposer}><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onSend(); } }} placeholder="Ask about your roadmap, customers, specs, or goals…" /><button className={styles.primary} onClick={onSend}>Send</button></div>
    <div className={styles.promptChips}>{["What is blocking activation?", "Summarize this week’s customer themes", "Which specs are at risk?"].map((prompt) => <button key={prompt} onClick={() => setInput(prompt)}>{prompt}</button>)}</div>
  </div>;
}

function Specs({ specs, onOpen, onNew }: { specs: Spec[]; onOpen: (spec: Spec) => void; onNew: () => void }) {
  const [team, setTeam] = useState("All teams");
  const visible = team === "All teams" ? specs : specs.filter((spec) => spec.team === team);
  return <div className={styles.basePage}><PageHeader title="Specs" action={<button className={styles.primary} onClick={onNew}>New spec</button>} />
    <div className={styles.filters}>{["All teams", "Core Product", "Growth", "Platform"].map((name) => <button className={team === name ? styles.filterActive : ""} key={name} onClick={() => setTeam(name)}>{name}</button>)}</div>
    <div className={styles.insight}>✦ <span><strong>Backlog insight:</strong> 3 specs overlap on onboarding. Consider linking them under Activation sprint.</span><button>Review</button></div>
    <div className={styles.specList}>{visible.map((spec) => <button className={styles.specRow} key={spec.id} onClick={() => onOpen(spec)}><code>{spec.id}</code><span><strong>{spec.title}</strong><small>{spec.team} · updated {spec.updated}</small></span><Status value={spec.status} /><span className={styles.chevron}>›</span></button>)}</div>
  </div>;
}

function SpecDetail({ spec, onBack, onApprove }: { spec: Spec; onBack: () => void; onApprove: () => void }) {
  const [tab, setTab] = useState<"Assistant" | "Tasks" | "Runs">("Assistant");
  return <div className={styles.specDetail}>
    <div className={styles.specTopbar}><button className={styles.back} onClick={onBack}>← Specs</button><div className={styles.presence}><Avatar initials="MP" tone={2} /><Avatar initials="RK" tone={3} /><span>2 editing</span></div></div>
    <div className={styles.specColumns}>
      <article className={styles.document}>
        <div className={styles.documentMeta}><code>{spec.id}</code><Status value={spec.status} /><span>{spec.team}</span></div>
        <h1>{spec.title}</h1><p className={styles.lead}>{spec.summary}</p>
        <h2>Problem</h2><p>New workspace owners face a blank state and must discover setup order on their own. In 7 of 12 onboarding interviews, admins paused to ask what to do next. Median time to first shared spec is 26 hours.</p>
        <h2>Outcome</h2><ul><li>60% of new workspaces publish a first spec within 10 minutes.</li><li>Every workspace starts with role-relevant templates and sample context.</li><li>Admins can invite collaborators without leaving the flow.</li></ul>
        <h2>Scope</h2><p>Replace the five-step checklist with a guided workspace setup: choose a team shape, connect one context source, then co-create the first spec.</p>
        <div className={styles.callout}><strong>Decision · Jun 20</strong><p>Templates will adapt to role and company stage. We will not ask for industry during setup.</p></div>
        <h2>Acceptance criteria</h2><div className={styles.checklist}><label><input type="checkbox" defaultChecked /> Setup completes without a provider key</label><label><input type="checkbox" defaultChecked /> Sample workspace loads in under 2 seconds</label><label><input type="checkbox" /> Mobile flow passes accessibility review</label></div>
        <div className={styles.signoff}><div><strong>Ready for sign-off</strong><p>Product approved · Engineering review requested</p></div>{spec.status !== "Approved" && <button className={styles.primary} onClick={onApprove}>Approve spec</button>}</div>
      </article>
      <aside className={styles.assistantPanel}>
        <div className={styles.tabs}>{(["Assistant", "Tasks", "Runs"] as const).map((name) => <button className={tab === name ? styles.tabActive : ""} key={name} onClick={() => setTab(name)}>{name}</button>)}</div>
        {tab === "Assistant" && <div className={styles.panelContent}><div className={styles.aiNote}><span>✦</span><div><strong>State of spec</strong><p>Strong problem framing and measurable outcome. One acceptance criterion still needs an owner.</p></div></div><h3>Grounding</h3><div className={styles.grounding}><button>O-12 · Improve activation</button><button>Theme · Setup complexity</button><button>CTX-8 · ICP definition</button></div><h3>Ask Burrow</h3><textarea placeholder="Ask about this spec…" /><button className={styles.primary}>Send</button></div>}
        {tab === "Tasks" && <div className={styles.panelContent}>{["Instrument onboarding funnel", "Build role template selector", "Create seeded sample workspace", "Run accessibility QA"].map((task, index) => <div className={styles.task} key={task}><code>TASK-{117 + index}</code><strong>{task}</strong><small>{index < 2 ? "In progress · Claude Code" : "Ready"}</small></div>)}</div>}
        {tab === "Runs" && <div className={styles.panelContent}><div className={styles.run}><span className={styles.agentPulse} /><div><strong>Claude Code</strong><p>Implementing template selector</p><small>14 tool calls · 8m</small></div></div><div className={styles.run}><span className={styles.doneDot}>✓</span><div><strong>Codex</strong><p>Acceptance criteria review</p><small>Completed 24m ago</small></div></div></div>}
      </aside>
    </div>
  </div>;
}

function Roadmap() {
  return <div className={styles.widePage}><PageHeader title="Roadmap" eyebrow="Outcomes over dates" action={<button className={styles.primary}>New initiative</button>} /><div className={styles.insight}>✦ <span><strong>Planning insight:</strong> Platform has 4 concurrent specs and 2 engineers. Enterprise foundations may slip.</span><button>View risk</button></div><div className={styles.roadmap}>{Object.entries(roadmap).map(([horizon, items]) => <section className={styles.roadmapColumn} key={horizon}><div className={styles.columnHeader}><h2>{horizon}</h2><span>{items.length}</span></div>{items.map((item) => <article className={styles.initiative} key={item.title}><span className={styles.teamPill}>{item.team}</span><h3>{item.title}</h3><p>{item.detail}</p><div className={styles.progress}><span style={{ width: horizon === "Now" ? "62%" : horizon === "Next" ? "24%" : "8%" }} /></div></article>)}</section>)}</div></div>;
}

function Goals() {
  const goals = [
    { id: "O-12", title: "Make first value obvious", owner: "Maya Patel", progress: 68, target: "80% activation by Sep 30", status: "At risk" },
    { id: "O-11", title: "Earn enterprise trust", owner: "Raj Kapoor", progress: 54, target: "5 design partners live", status: "On track" },
    { id: "O-10", title: "Close the feedback loop", owner: "Jordan Lee", progress: 81, target: "<7 days insight to spec", status: "On track" },
  ];
  return <div className={styles.basePage}><PageHeader title="Goals" action={<button className={styles.primary}>New goal</button>} /><div className={styles.goalList}>{goals.map((goal) => <article className={styles.goal} key={goal.id}><div className={styles.goalHead}><code>{goal.id}</code><span className={goal.status === "At risk" ? styles.risk : styles.track}>{goal.status}</span></div><h2>{goal.title}</h2><p>{goal.target}</p><div className={styles.goalProgress}><span style={{ width: `${goal.progress}%` }} /></div><footer><span>{goal.progress}%</span><span>{goal.owner}</span><span>3 linked specs</span></footer></article>)}</div></div>;
}

function Feedback({ onCreateSpec, notify }: { onCreateSpec: () => void; notify: (message: string) => void }) {
  const themes = [
    { title: "Setup complexity", count: 18, sentiment: "mixed", text: "Admins are unsure which connection or template to start with.", linked: true },
    { title: "Role-based onboarding", count: 11, sentiment: "positive", text: "Teams want examples tailored to PM, engineering, and leadership workflows.", linked: false },
    { title: "Slack capture", count: 9, sentiment: "negative", text: "Customer signals get lost when feedback must be copied manually.", linked: true },
  ];
  return <div className={styles.basePage}><PageHeader title="Feedback" eyebrow="47 items · 6 sources" action={<button className={styles.secondary} onClick={() => notify("Feedback re-clustered into 7 themes")}>Re-cluster with AI</button>} /><section><div className={styles.sectionHeading}><div><h2>Themes</h2><p>AI groups feedback so you can see what matters most.</p></div></div><div className={styles.themeGrid}>{themes.map((theme) => <article className={styles.themeCard} key={theme.title}><div><span className={`${styles.sentiment} ${styles[theme.sentiment]}`} /><h3>{theme.title}</h3><span className={styles.countPill}>{theme.count} items</span></div><p>{theme.text}</p>{theme.linked ? <button className={styles.textButton}>View linked spec →</button> : <button className={styles.suggestionButton} onClick={onCreateSpec}>✦ Turn this theme into a spec</button>}</article>)}</div></section><section className={styles.feedbackItems}><div className={styles.sectionHeading}><div><h2>Latest feedback</h2><p>Customer evidence stays linked to the work it shapes.</p></div><button className={styles.primary} onClick={() => notify("Feedback item added")}>Add feedback</button></div>{[
    ["Acme Corp", "interview", "We got the workspace connected, but didn’t know which template fit our product team."],
    ["Juniper", "support", "Pulling Slack threads into feedback would save our PMs hours every week."],
    ["Northwind", "sales", "SCIM is the final security requirement before we can start a pilot."],
  ].map(([customer, source, text]) => <article className={styles.feedbackRow} key={customer}><span className={styles.source}>{source}</span><div><p>{text}</p><small>{customer} · Enterprise · 2d ago</small></div></article>)}</section></div>;
}

function Market() {
  return <div className={styles.basePage}><PageHeader title="Market" eyebrow="Competitive intelligence, grounded in sources" action={<button className={styles.primary}>Add signal</button>} /><div className={styles.marketGrid}>{[
    { company: "Linear", signal: "Launched product intelligence workflows", impact: "Raises the baseline for issue-to-feedback linking.", date: "Jun 18" },
    { company: "Notion", signal: "Expanded enterprise search connectors", impact: "Validates cross-tool context as a core workspace primitive.", date: "Jun 14" },
    { company: "Productboard", signal: "Introduced AI specs", impact: "Messaging now overlaps on AI-assisted product definition.", date: "Jun 9" },
    { company: "Jira Product Discovery", signal: "New roadmap views for executives", impact: "Executive visibility remains a crowded wedge.", date: "Jun 4" },
  ].map((item) => <article className={styles.marketCard} key={item.company}><div><strong>{item.company}</strong><small>{item.date}</small></div><h2>{item.signal}</h2><p>{item.impact}</p><footer><button>Open source ↗</button><button>Link to context</button></footer></article>)}</div></div>;
}

function Context() {
  const docs = [
    { id: "CTX-8", title: "Ideal customer profile", type: "Strategy", excerpt: "B2B SaaS product organizations with 20–200 builders and an active AI coding workflow.", updated: "today" },
    { id: "CTX-7", title: "Product principles", type: "Principles", excerpt: "Context compounds. Decisions stay close to evidence. Agents work from the same truth as people.", updated: "yesterday" },
    { id: "CTX-6", title: "Q3 company strategy", type: "Strategy", excerpt: "Win the first 10 minutes, then prove the product-to-code loop with design partners.", updated: "3d ago" },
    { id: "CTX-4", title: "Enterprise security requirements", type: "Research", excerpt: "SSO, SCIM, audit history, regional hosting, and provider-key controls are table stakes.", updated: "1w ago" },
  ];
  return <div className={styles.basePage}><PageHeader title="Context" eyebrow="The source of truth people and agents share" action={<button className={styles.primary}>New document</button>} /><div className={styles.contextGraph}><div><span>Goals</span><strong>3</strong></div><i>→</i><div><span>Context</span><strong>12</strong></div><i>→</i><div><span>Specs</span><strong>18</strong></div><i>→</i><div><span>Tasks</span><strong>64</strong></div></div><div className={styles.docList}>{docs.map((doc) => <article key={doc.id}><div><code>{doc.id}</code><span className={styles.typePill}>{doc.type}</span></div><h2>{doc.title}</h2><p>{doc.excerpt}</p><small>Updated {doc.updated} · 6 linked objects</small></article>)}</div></div>;
}

function Teams() {
  return <div className={styles.basePage}><PageHeader title="Teams" eyebrow="Northstar Labs · 12 members" action={<button className={styles.primary}>New team</button>} /><div className={styles.teamGrid}>{[
    { name: "Core Product", lead: "Maya Patel", people: ["MP", "JL", "SK", "AN"], focus: "Feedback intelligence · AI roadmap" },
    { name: "Growth", lead: "Jordan Lee", people: ["JL", "MP", "ED"], focus: "Activation · onboarding" },
    { name: "Platform", lead: "Raj Kapoor", people: ["RK", "AN", "CW"], focus: "Enterprise · integrations" },
  ].map((team, index) => <article className={styles.teamCard} key={team.name}><div className={styles.teamIcon}>{team.name.slice(0, 1)}</div><h2>{team.name}</h2><p>{team.focus}</p><div className={styles.avatarStack}>{team.people.map((person, i) => <Avatar key={person} initials={person} tone={(i + index) % 4 + 1} />)}</div><footer><span>Lead · {team.lead}</span><button>Open team →</button></footer></article>)}</div></div>;
}

function Connections({ notify }: { notify: (message: string) => void }) {
  return <div className={styles.basePage}><PageHeader title="Connections" eyebrow="Bring signals in. Send approved work out." /><div className={styles.connectionGrid}>{[
    { name: "GitHub", mark: "GH", status: "Connected", detail: "nirnaypatel/burrow · sync healthy" },
    { name: "Slack", mark: "S", status: "Connected", detail: "#customer-feedback · 14 channels" },
    { name: "Linear", mark: "L", status: "Connected", detail: "Northstar workspace · two-way sync" },
    { name: "Google Drive", mark: "G", status: "Available", detail: "Import research and strategy docs" },
    { name: "Intercom", mark: "I", status: "Available", detail: "Continuously ingest support signals" },
    { name: "MCP", mark: "M", status: "Connected", detail: "3 agents active · 24 tools exposed" },
  ].map((connection) => <article className={styles.connection} key={connection.name}><span className={styles.connectionMark}>{connection.mark}</span><div><h2>{connection.name}</h2><p>{connection.detail}</p></div><button className={connection.status === "Connected" ? styles.connected : styles.secondarySmall} onClick={() => notify(connection.status === "Connected" ? `${connection.name} connection is healthy` : `${connection.name} connection flow opened`)}>{connection.status === "Connected" ? "✓ Connected" : "Connect"}</button></article>)}</div></div>;
}

function Automations({ notify }: { notify: (message: string) => void }) {
  const [enabled, setEnabled] = useState([true, true, false, true]);
  const items = [
    ["Cluster new feedback", "Every weekday at 8:00 AM", "Last ran 2h ago · 12 items clustered"],
    ["Weekly product brief", "Fridays at 3:00 PM", "Sent to #product-leadership"],
    ["Flag stale specs", "When a spec is inactive for 14 days", "Would notify 2 spec owners"],
    ["Sync approved tasks to Linear", "When a spec is approved", "Last ran 18m ago · 4 issues created"],
  ];
  return <div className={styles.basePage}><PageHeader title="Automations" eyebrow="Keep the product loop moving" action={<button className={styles.primary}>New automation</button>} /><div className={styles.automationList}>{items.map((item, index) => <article key={item[0]}><button className={`${styles.toggle} ${enabled[index] ? styles.toggleOn : ""}`} onClick={() => { setEnabled((values) => values.map((value, i) => i === index ? !value : value)); notify(`${item[0]} ${enabled[index] ? "paused" : "enabled"}`); }}><span /></button><div><h2>{item[0]}</h2><p>{item[1]}</p><small>{item[2]}</small></div><button className={styles.more}>•••</button></article>)}</div></div>;
}

function Library() {
  return <div className={styles.basePage}><PageHeader title="Library" eyebrow="Reusable product knowledge" action={<button className={styles.primary}>New template</button>} /><div className={styles.libraryGrid}>{[
    ["Spec template", "Product requirement", "Used 24 times", "Problem · outcome · scope · acceptance criteria"],
    ["Customer interview", "Research", "Used 18 times", "Jobs · current workflow · pain · buying signal"],
    ["Launch review", "Playbook", "Used 12 times", "Readiness · risks · rollout · measurement"],
    ["Weekly product brief", "Automation", "Used 9 times", "Goals · shipped · learned · blocked"],
  ].map((item) => <article key={item[0]}><span className={styles.libraryIcon}>▤</span><span className={styles.typePill}>{item[1]}</span><h2>{item[0]}</h2><p>{item[3]}</p><small>{item[2]}</small><button>Use template →</button></article>)}</div></div>;
}

function Settings({ dark, setDark, notify }: { dark: boolean; setDark: (value: boolean) => void; notify: (message: string) => void }) {
  return <div className={styles.settingsPage}><PageHeader title="Settings" eyebrow="Demo workspace" /><section className={styles.settingsSection}><h2>Profile</h2><div className={styles.profileRow}><Avatar initials="MP" tone={2} /><label>Name<input defaultValue="Maya Patel" /></label><label>Email<input defaultValue="maya@northstarlabs.co" /></label></div></section><section className={styles.settingsSection}><h2>Appearance</h2><div className={styles.themeOptions}><button className={!dark ? styles.themeSelected : ""} onClick={() => setDark(false)}><span className={styles.lightPreview} />Light</button><button className={dark ? styles.themeSelected : ""} onClick={() => setDark(true)}><span className={styles.darkPreview} />Dark</button></div></section><section className={styles.settingsSection}><h2>Workspace</h2><label className={styles.fullField}>Workspace name<input defaultValue="Northstar Labs" /></label><label className={styles.fullField}>Workspace URL<input defaultValue="northstar.burrow.app" /></label></section><button className={styles.primary} onClick={() => notify("Settings saved for this demo session")}>Save changes</button></div>;
}
