import type { PersonaContent, CrossLink } from "./PersonaPage";

/* ──────────────────────────────────────────────────────────────────────────
 * Persona content — Burrow's real features, framed per role.
 * Accuracy guardrails (do not overstate):
 *  - MCP bridge is bearer-token auth TODAY; OAuth 2.1 is on the roadmap.
 *  - Jira/Confluence/Slack are IN PROGRESS, over MCP with your own credentials.
 *  - Self-host / no-telemetry is fine to state outright.
 * ──────────────────────────────────────────────────────────────────────── */

/* One-line summaries used by both the hub and the cross-link cards. */
export const PERSONA_INDEX: {
  slug: string;
  persona: string;
  headline: string;
  tagline: string;
}[] = [
  {
    slug: "product-managers",
    persona: "Product Managers",
    headline: "From scattered context to shipped strategy.",
    tagline:
      "Context, specs, roadmap, feedback, and decisions in one surface — grounding every AI action.",
  },
  {
    slug: "engineering",
    persona: "Engineering Teams",
    headline: "Specs your agents can actually build from.",
    tagline:
      "Full, dependency-aware spec context over MCP — not a snippet — on infrastructure you control.",
  },
  {
    slug: "product-ops",
    persona: "Product Ops",
    headline: "One system of record for how product gets built.",
    tagline:
      "Standardized specs, sign-offs, and a shared Library across every team — process, not tribal knowledge.",
  },
  {
    slug: "leaders",
    persona: "Product Leaders",
    headline: "See the whole org without another status meeting.",
    tagline:
      "Roadmap and OKRs rolled up, decisions you can point to, AI grounded in your own context.",
  },
];

/* Build the three cross-links for a given slug (everyone but self). */
function crossLinksExcept(slug: string): CrossLink[] {
  return PERSONA_INDEX.filter((p) => p.slug !== slug).map((p) => ({
    href: `/solutions/${p.slug}`,
    persona: p.persona,
    headline: p.headline,
  }));
}

/* ── Product Managers ──────────────────────────────────────────────── */
export const PRODUCT_MANAGERS: PersonaContent = {
  persona: "Product Managers",
  eyebrow: "For Product Managers",
  headline: "From scattered context to",
  headlineAccent: "shipped strategy.",
  subhead:
    "Stop re-explaining the same context in every doc, every standup, every hand-off. Burrow keeps your context, specs, roadmap, feedback, and decisions in one surface — and grounds every AI action in how your team actually works.",
  problemTitle: "Your context lives in five tools and none of them agree.",
  problemBody:
    "Specs drift from the docs that justified them. Customer signal and market noise pile up unread. The roadmap in the deck doesn't match the one in the tracker. And every hand-off to engineering is a manual re-explanation of things you already wrote down somewhere. The job stops being strategy and becomes reconciliation.",
  valueLabel: "What matters to you",
  valueTitle: "The features built for the way you actually work.",
  valueProps: [
    {
      feature: "Context Graph",
      title: "Bring your context once",
      body: "Give Burrow your company, product, persona, and ways-of-working docs once. They ground every AI surface — breakdowns, drafting, insights — so the AI works from how your team operates, not a generic template.",
    },
    {
      feature: "Specs + sign-offs",
      title: "Write and decide together",
      body: "Co-edit specs in real time with live cursors, then move them Draft → Review → Approved. Sign-offs are append-only and pinned to the exact version — a decision log you can point to months later.",
    },
    {
      feature: "Roadmap + Goals",
      title: "Now / Next / Later, tied to OKRs",
      body: "Plan initiatives across horizons and drag between them as priorities shift. Link goals and key results to the specs that serve them — strategy you can trace all the way to the work.",
    },
    {
      feature: "Feedback",
      title: "Customer feedback → AI themes → spec",
      body: "Capture customer signals in one place. AI clusters them into themes, and a theme becomes a Spec in a click — the voice of the customer reaches the work without a manual hand-off.",
    },
    {
      feature: "Market",
      title: "Competitor signals, with a “so what”",
      body: "Track competitors and severity-scored market signals, each carrying a clear “so what for us.” Noise becomes a decision instead of another tab you forgot to read.",
    },
    {
      feature: "AI breakdowns",
      title: "Spec → agent-ready tasks",
      body: "Turn an approved spec into a dependency-aware breakdown of tasks with acceptance criteria — ready for engineers and their agents to pick up, no re-keying required.",
    },
  ],
  fitLabel: "Why PMs choose Burrow",
  fitStatement: "Spend your day on the decision, not the re-explanation.",
  fitSupport:
    "When context, specs, and decisions live in one grounded surface, the AI drafts from your reality and engineering builds from the version you approved. You get back the hours you used to lose to reconciliation.",
  outcomesTitle: "What changes for you.",
  outcomes: [
    { stat: "One", label: "surface for context, specs, roadmap, feedback, and decisions" },
    { stat: "Zero", label: "manual re-explanation on every hand-off to engineering" },
    { stat: "Traceable", label: "goals → specs → tasks, with sign-offs pinned to versions" },
  ],
  crossLinks: crossLinksExcept("product-managers"),
  ctaTitle: "Turn scattered context into shipped strategy.",
  ctaSub:
    "Bring your context once, draft specs your team and their agents can build from, and trace every decision back to the version you approved.",
};

/* ── Engineering Teams ─────────────────────────────────────────────── */
export const ENGINEERING: PersonaContent = {
  persona: "Engineering Teams",
  eyebrow: "For Engineering Teams",
  headline: "Specs your agents can",
  headlineAccent: "actually build from.",
  subhead:
    "Your coding agents are only as good as the context they're handed. Burrow exposes an MCP server so any agent pulls the full, dependency-aware spec — not a snippet someone trimmed to fit a chat window — and pushes status back to the board.",
  problemTitle: "Agents working from snippets ship the wrong thing.",
  problemBody:
    "Ambiguous tickets. Missing acceptance criteria. Context pasted into a chat window and trimmed until it fits. Vendor lock-in to one tool, and your specs and code leaving the building to get there. The agent does exactly what you asked — which turns out not to be what you meant.",
  valueLabel: "What matters to you",
  valueTitle: "Built for agents that work the way your team would.",
  valueProps: [
    {
      feature: "get_next_task",
      title: "Full spec context, not a snippet",
      body: "Your agent calls get_next_task and gets the task plus acceptance criteria and the full, dependency-aware spec context — not a pasted fragment someone trimmed to fit a window.",
    },
    {
      feature: "update_task_status",
      title: "Status flows back to the board",
      body: "When the agent finishes, update_task_status pushes the result back. Every action lands in the activity feed, attributed to the agent — no copy-paste status updates.",
    },
    {
      feature: "get_insights · list_skills",
      title: "Agents act like your org",
      body: "Agents read get_insights and list_skills over the same bridge, so they make the calls your team would make — grounded in your Context Graph, not a generic prior.",
    },
    {
      feature: "Sign-offs",
      title: "Approvals pinned to exact spec versions",
      body: "Sign-offs are append-only and pinned to the spec version they were cast against. When an agent builds from a spec, you know exactly which version was approved — no silent drift.",
    },
    {
      feature: ".burrow/ files",
      title: "Skills & agents as version-controlled files",
      body: "Skills, agents, and routines live as published, versioned .burrow/ files. Review them in a PR, diff them, roll them back — you're building on an open spec, not a closed binary.",
    },
    {
      feature: "BYO-key + self-host",
      title: "Nothing leaves your infrastructure",
      body: "Bring your own provider keys and self-host the whole stack. Works with Claude Code, Cursor, and any MCP-capable agent — your specs, code, and agents stay on infrastructure you control.",
    },
  ],
  fitLabel: "Why engineers choose Burrow",
  fitStatement: "Hand your agent the whole spec, not a guess.",
  fitSupport:
    "Dependency-aware context over MCP means the agent builds the right thing the first time. Status flows back automatically, approvals are pinned to versions, and the whole stack runs on your own keys and your own infrastructure.",
  outcomesTitle: "What changes for you.",
  outcomes: [
    { stat: "Full", label: "dependency-aware spec context over MCP, not a snippet" },
    { stat: "Any", label: "MCP agent — Claude Code, Cursor, or your own" },
    { stat: "Yours", label: "keys, code, and infrastructure — nothing leaves the building" },
  ],
  honestNote:
    "the MCP bridge ships with streamable HTTP and bearer-token auth today (OAuth 2.1 is on the roadmap). Jira, Confluence, and Slack are in progress — reached over MCP with your own credentials, never a data pipe through us. Self-hosted, with no telemetry.",
  crossLinks: crossLinksExcept("engineering"),
  ctaTitle: "Give your agents specs they can build from.",
  ctaSub:
    "Point any MCP agent at Burrow, pull the full dependency-aware spec, and push status back — all on your own keys and your own infrastructure.",
};

/* ── Product Ops ───────────────────────────────────────────────────── */
export const PRODUCT_OPS: PersonaContent = {
  persona: "Product Ops",
  eyebrow: "For Product Ops",
  headline: "One system of record for",
  headlineAccent: "how product gets built.",
  subhead:
    "You're the one keeping every team consistent. Burrow standardizes specs, breakdowns, and sign-offs across squads, turns your best process into a shareable Library, and gives you a single feed of what's actually happening.",
  problemTitle: "Every team does it differently, and it lives in someone's head.",
  problemBody:
    "Each squad has its own spec template, its own definition of done, its own approval ritual. The good process is tribal knowledge that walks out the door when someone leaves. Visibility means pinging six leads for a status. You spend your week stitching together a picture that should already exist.",
  valueLabel: "What matters to you",
  valueTitle: "Make process the default, not the exception.",
  valueProps: [
    {
      feature: "Multi-team",
      title: "Squads own their people and their work",
      body: "Model your org as squads that own both members and work. Everyone has a clear home, work has a clear owner, and you can see across all of it from one place.",
    },
    {
      feature: "Standardized specs",
      title: "Same spec, breakdown, and sign-off everywhere",
      body: "Specs, AI breakdowns, and append-only sign-off decision logs work the same way across every team — so a spec from one squad reads like a spec from any other.",
    },
    {
      feature: "Library",
      title: "Process that's version-controlled, not tribal",
      body: "Publish skills, agents, and routines to a shared Library every team can adopt. Your best process becomes a versioned, shareable asset instead of knowledge locked in one person's head.",
    },
    {
      feature: "Automations",
      title: "When / do routines",
      body: "Codify the repetitive parts: when something happens, do the next step. Routines run the playbook consistently so the standard path doesn't depend on someone remembering it.",
    },
    {
      feature: "Connections",
      title: "Meet teams in the tools they use",
      body: "Connect Jira, Confluence, and Slack so work reaches people where they already are — reached over MCP with your own credentials.",
    },
    {
      feature: "Activity + timeline",
      title: "Visibility without the status ping",
      body: "An activity feed and timeline show what changed, who changed it, and when — across every squad. The status picture assembles itself instead of you assembling it.",
    },
  ],
  fitLabel: "Why ops teams choose Burrow",
  fitStatement: "Your best process, running the same way on every team.",
  fitSupport:
    "When specs, sign-offs, and routines are standardized and your playbook lives in a shared Library, consistency stops being a thing you enforce by hand. The system of record keeps itself current.",
  outcomesTitle: "What changes for you.",
  outcomes: [
    { stat: "One", label: "system of record for specs, sign-offs, and breakdowns across teams" },
    { stat: "Shared", label: "Library of version-controlled skills, agents, and routines" },
    { stat: "Live", label: "activity feed and timeline — no more status pings" },
  ],
  honestNote:
    "Jira, Confluence, and Slack connections are in progress — reached over MCP with your own credentials, never a data pipe through us. Self-hosted, with no telemetry.",
  crossLinks: crossLinksExcept("product-ops"),
  ctaTitle: "Make one system of record the default.",
  ctaSub:
    "Standardize specs and sign-offs across every squad, publish your best process to a shared Library, and watch the status picture assemble itself.",
};

/* ── Product Leaders (CPO) ─────────────────────────────────────────── */
export const LEADERS: PersonaContent = {
  persona: "Product Leaders",
  eyebrow: "For Product Leaders (CPO)",
  headline: "See the whole org without",
  headlineAccent: "another status meeting.",
  subhead:
    "You need the truth about what's shipping, what's stuck, and why — without a week of synthesis. Burrow rolls up roadmap and OKRs across teams, keeps decisions you can point to, and grounds AI in your own context, on your own infrastructure.",
  problemTitle: "The org's real state is buried under a week of status synthesis.",
  problemBody:
    "Roadmaps live in a dozen decks. OKRs drift from the work that's supposed to serve them. The reasoning behind big decisions evaporates the moment the meeting ends. And the AI tools your teams want all mean shipping your strategy to someone else's servers, on a per-seat bill that grows with every hire.",
  valueLabel: "What matters to you",
  valueTitle: "The whole org, grounded in your own context.",
  valueProps: [
    {
      feature: "Roadmap + OKRs",
      title: "Rolled up across every team",
      body: "Now / Next / Later and goals roll up across squads into one view. See where the org is investing and whether the work actually serves the objectives — without assembling it by hand.",
    },
    {
      feature: "Decision logs",
      title: "Decisions you can point to",
      body: "Append-only sign-offs pin every approval to the exact spec version. When someone asks why you shipped it, the reasoning is on the record — not lost when the meeting ended.",
    },
    {
      feature: "Signals",
      title: "Customer + market signals feed strategy",
      body: "Customer feedback themes and severity-scored market signals surface where strategy is set, each with a clear “so what” — so the roadmap responds to reality, not the loudest voice.",
    },
    {
      feature: "Grounded AI",
      title: "AI grounded in YOUR context",
      body: "Bring your own provider keys. Burrow runs no hosted models — the AI works from your Context Graph, on infrastructure you control, never a generic model trained on someone else's data.",
    },
    {
      feature: "Open source + self-host",
      title: "Clears security and procurement",
      body: "Open-source and self-hostable, with no telemetry and no per-seat tax. It clears security review and procurement on your terms — no lock-in, no surprise bill as you scale.",
    },
    {
      feature: "Agents as workforce",
      title: "A workforce multiplier, not a line item",
      body: "Agents pull full specs over MCP and ship work back to the board. Your team directs a fleet of agents from the same surface they plan in — leverage that compounds with the org.",
    },
  ],
  fitLabel: "Why leaders choose Burrow",
  fitStatement: "Run the org on a single source of truth you own.",
  fitSupport:
    "Roadmap, OKRs, and decisions in one place mean you lead from current reality instead of last week's synthesis. Open-source and self-hosted means the AI runs on your context and your infrastructure — clearing security and procurement without a per-seat tax.",
  outcomesTitle: "What changes for you.",
  outcomes: [
    { stat: "One", label: "rolled-up view of roadmap, OKRs, and decisions across teams" },
    { stat: "On-record", label: "decisions pinned to spec versions you can point to" },
    { stat: "Yours", label: "keys, data, and infrastructure — no hosted models, no seat tax" },
  ],
  honestNote:
    "AI runs on your own provider keys with no hosted models, and the stack is self-hostable with no telemetry. The MCP bridge uses bearer-token auth today (OAuth 2.1 is on the roadmap); Jira, Confluence, and Slack are in progress over MCP with your own credentials.",
  crossLinks: crossLinksExcept("leaders"),
  ctaTitle: "See the whole org on one source of truth.",
  ctaSub:
    "Roll up roadmap and OKRs across teams, keep decisions on the record, and run AI on your own context and infrastructure — no status meeting required.",
};

