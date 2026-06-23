import styles from "./Features.module.css";

function FeatureBlock({
  id,
  label,
  heading,
  body,
  bullets,
  codeBlock,
  roadmapNote,
  flip = false,
}: {
  id?: string;
  label: string;
  heading: string;
  body: string | React.ReactNode;
  bullets: string[];
  codeBlock: React.ReactNode;
  roadmapNote?: string;
  flip?: boolean;
}) {
  return (
    <div id={id} className={`${styles.feature} ${flip ? styles.flip : ""}`}>
      <div className={styles.featureText}>
        <span className={styles.featureLabel}>{label}</span>
        <h3 className={styles.featureHeading}>{heading}</h3>
        <p className={styles.featureBody}>{body}</p>
        <ul className={styles.bullets} role="list">
          {bullets.map((b) => (
            <li key={b} className={styles.bullet}>
              <span className={styles.bulletDot} aria-hidden="true" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
        {roadmapNote && (
          <p className={styles.roadmapNote}>
            <span className={styles.roadmapTag}>On the roadmap</span> {roadmapNote}
          </p>
        )}
      </div>
      <div className={styles.featureVisual}>{codeBlock}</div>
    </div>
  );
}

export function Features() {
  return (
    <section id="features" className={styles.section}>
      <div className="container">
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>The workspace</span>
          <h2 className={styles.sectionTitle}>
            Every surface a product org needs &mdash;{" "}
            <span className={styles.accent}>in one place.</span>
          </h2>
          <p className={styles.sectionSub}>
            Multiplayer specs, the PM surfaces around them, AI that stays
            grounded, an agent bridge, automations, and a shareable library. All
            on one canvas, all on your keys.
          </p>
        </div>

        <div className={styles.grid}>
          {/* Multiplayer */}
          <FeatureBlock
            label="Multiplayer"
            heading="Plan in the same document, live."
            body="Burrow's editor is real-time multiplayer. Live cursors, presence, and instant edits — the PM writes the intent, engineers add the constraints, all in one spec at the same time. Built on BlockNote and Yjs, with in-editor AI drafting and a / slash menu, so it feels like the document tools your team already knows."
            bullets={[
              "Live cursors and presence for everyone in the spec",
              "Notion-style block editing with a / slash menu",
              "In-editor AI drafting — and one canonical spec, never “which copy is current”",
            ]}
            codeBlock={
              <div className={styles.mockEditor} aria-label="Spec editor with two live cursors">
                <div className={styles.mockEditorBar}>
                  <span className={styles.mockEditorTitle}>SPEC-08 · User settings redesign</span>
                  <div className={styles.mockAvatars}>
                    <span className={styles.mockAvatar} data-color="1">A</span>
                    <span className={styles.mockAvatar} data-color="3">S</span>
                  </div>
                </div>
                <div className={styles.mockEditorBody}>
                  <p className={styles.mockH1}>User settings redesign</p>
                  <p className={styles.mockText}>Consolidate 4 scattered settings pages into a single panel.</p>
                  <p className={styles.mockText}><strong>Success:</strong> &lt;2 support tickets/week about finding settings.</p>
                  <span className={styles.mockSlash}>/ ai draft acceptance criteria</span>
                  <span className={styles.mockCursor} data-color="1">Anika</span>
                </div>
              </div>
            }
          />

          {/* PM surfaces — roadmap / goals / feedback / market */}
          <FeatureBlock
            label="PM surfaces"
            heading="Roadmap, goals, feedback, market."
            body="Beyond the spec, Burrow runs the whole plan. A Now / Next / Later roadmap you drag initiatives across. Goals and OKRs with key results, linked to the specs that serve them. Customer feedback that AI clusters into themes — and turns a theme into a spec. Plus a Market surface tracking competitors and severity-scored signals, each with a clear “so what for us.”"
            bullets={[
              "Roadmap: Now / Next / Later with drag-to-move and rolled-up progress",
              "Goals & OKRs with key results, tied to initiatives and specs",
              "Feedback → AI themes → Spec; Market signals scored with a “so what”",
            ]}
            codeBlock={
              <div className={styles.roadmapMock} aria-label="Now / Next / Later roadmap">
                <div className={styles.roadmapCols}>
                  {[
                    { h: "Now", items: ["Onboarding redesign", "Billing v2"] },
                    { h: "Next", items: ["Mobile spec view", "SSO"] },
                    { h: "Later", items: ["Public API"] },
                  ].map((col) => (
                    <div key={col.h} className={styles.roadmapCol}>
                      <span className={styles.roadmapColHead}>{col.h}</span>
                      {col.items.map((it) => (
                        <span key={it} className={styles.roadmapCard}>{it}</span>
                      ))}
                    </div>
                  ))}
                </div>
                <div className={styles.roadmapSignal}>
                  <span className={styles.signalSev}>High</span>
                  <span className={styles.signalText}>
                    Competitor shipped self-host. <strong>So what:</strong> lead with our open-source story.
                  </span>
                </div>
              </div>
            }
            flip
          />

          {/* Agentic AI */}
          <FeatureBlock
            label="Agentic AI"
            heading="AI that stays calm and grounded."
            body="One click turns a spec into tasks with acceptance criteria. Insights surface quietly on the roadmap, the backlog, and each spec — always grounded in your Context Graph, offered as amber suggestions, never red alarms. Decline one and it stays out of your way. With no key configured, the AI degrades silently rather than nagging."
            bullets={[
              "AI breakdowns: spec → tasks + acceptance criteria",
              "Grounded insights on roadmap, backlog, and specs — amber, never red",
              "Silent without a key; never invents data it doesn’t have",
            ]}
            codeBlock={
              <div className={styles.insightMock} aria-label="A calm AI insight">
                <div className={styles.insightHead}>
                  <span className={styles.insightDot} aria-hidden="true" />
                  AI insight · grounded in your context
                </div>
                <p className={styles.insightBody}>
                  Three Now initiatives have no key results yet. Want to draft KRs
                  from the linked specs?
                </p>
                <div className={styles.insightActions}>
                  <span className={styles.insightPrimary}>Draft KRs</span>
                  <span className={styles.insightGhost}>Dismiss</span>
                </div>
              </div>
            }
          />

          {/* Agent bridge */}
          <FeatureBlock
            label="Agent bridge"
            heading="Any agent. Real context. Over MCP."
            body="Burrow exposes an MCP server, so any coding agent works with it. Your agent calls get_next_task and gets the full spec context — not a pasted snippet — does the work, and calls update_task_status, which flows straight to the board. It can pull get_insights and list_skills to act the way your org would. Agents appear as square-avatar teammates in the live activity feed."
            bullets={[
              "get_next_task · update_task_status · get_insights · list_skills",
              "Works with Claude Code, Cursor, and any MCP-capable agent",
              "Streamable HTTP, bearer-token auth today (OAuth 2.1 on the roadmap)",
            ]}
            codeBlock={
              <pre className={styles.codeBlock}>{`# your agent, over MCP
get_next_task
  → task + acceptance criteria
  + full spec context

get_insights · list_skills
  → act the way your org would

update_task_status
  → flows straight to the board`}</pre>
            }
            flip
          />

          {/* Automations */}
          <FeatureBlock
            label="Automations"
            heading="When this, do that."
            body="Lightweight when/do routines run in-process — no extra infrastructure, no queue to babysit. When a sign-off is approved, notify Slack. When a spec moves to In progress, post the next task to your agent. Simple triggers, real actions, no Zapier in the middle."
            bullets={[
              "When/do routines that run in-process — no extra infra",
              "e.g. sign-off approved → notify Slack",
              "Triggers fire on the events you already work with",
            ]}
            codeBlock={
              <div className={styles.routineMock} aria-label="A when/do automation">
                <div className={styles.routineRow}>
                  <span className={styles.routineKw}>when</span>
                  <span className={styles.routineVal}>sign-off = Approved</span>
                </div>
                <div className={styles.routineRow}>
                  <span className={styles.routineKw}>do</span>
                  <span className={styles.routineVal}>notify #product in Slack</span>
                </div>
                <div className={styles.routineFoot}>Runs in-process · no extra infrastructure</div>
              </div>
            }
          />

          {/* Library */}
          <FeatureBlock
            label="Library"
            heading="Skills and agents, version-controlled."
            body="Package your team's skills, agents, and routines as .burrow/ files — shareable, version-controlled, and synced like code. The format is published and versioned, so you build on an open spec, not a closed binary. Reuse a skill across teams, fork it, review it in a PR."
            bullets={[
              "Shareable, version-controlled skills, agents, and routines",
              "Stored as plain .burrow/ files — synced like the rest of your repo",
              "Published, versioned format — no lock-in to one agent or vendor",
            ]}
            codeBlock={
              <pre className={styles.codeBlock}>{`.burrow/
├── skills/
│   ├── write-spec.md
│   └── triage-feedback.md
├── agents/
│   └── ship-next-task.md
└── routines/
    └── notify-on-signoff.md`}</pre>
            }
            flip
          />
        </div>
      </div>
    </section>
  );
}

