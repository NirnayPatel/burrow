import type { BlockNoteEditor, Block } from "@blocknote/core";
import type { DefaultReactSuggestionItem } from "@blocknote/react";
import { streamAssist, type AssistMode } from "./assist";

// The AI slash group (11-DESIGN §3b-i): "/" inside BlockNote surfaces an AI
// group whose items stream a Spec section straight into the doc as editable
// blocks. All insertion goes through the editor API (insertBlocks /
// replaceBlocks), which is Yjs-aware — so output syncs to every collaborator
// automatically. We NEVER write to the Yjs fragment directly.

type NoKeyHandler = (message: string) => void;

// Pull the prompt context for expand/acceptance from the current selection,
// falling back to the block the cursor sits in. BlockNote's getSelectedText is
// empty when nothing is highlighted, so we read the cursor block's text too.
function blockPlainText(block: Block): string {
  const content = block.content;
  if (!Array.isArray(content)) return "";
  return content
    .map((c) => {
      const node = c as { type?: string; text?: string };
      return node.type === "text" && typeof node.text === "string"
        ? node.text
        : "";
    })
    .join("");
}

function currentContext(editor: BlockNoteEditor): string {
  const selected = editor.getSelectedText().trim();
  if (selected) return selected;
  const pos = editor.getTextCursorPosition();
  return blockPlainText(pos.block as Block).trim();
}

// Stream `mode` output into the doc as editable blocks. Inserts a single
// placeholder block after the cursor's block on the first token, then re-parses
// the accumulated markdown and replaces the inserted range as more arrives —
// the same streamed-Breakdown feel, but landing in the canvas. Honors
// prefers-reduced-motion (§5): no progressive re-render, one append at the end.
//
// Insertion targets the cursor block so output lands where the user typed "/",
// not at the doc tail.
async function streamIntoDoc(
  editor: BlockNoteEditor,
  specId: string,
  mode: AssistMode,
  prompt: string,
  onNoKey: NoKeyHandler,
): Promise<void> {
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const anchor = editor.getTextCursorPosition().block;
  // The blocks we've inserted so far for this stream — replaced as text grows.
  let inserted: Block[] = [];
  let acc = "";

  const render = async () => {
    const text = acc.trim();
    if (!text) return;
    const parsed = await editor.tryParseMarkdownToBlocks(text);
    if (!parsed.length) return;
    if (inserted.length === 0) {
      const added = editor.insertBlocks(parsed, anchor, "after");
      inserted = added as Block[];
    } else {
      const replaced = editor.replaceBlocks(inserted, parsed);
      // replaceBlocks returns the freshly-inserted blocks; track them so the
      // next replace targets the right range.
      inserted = replaced.insertedBlocks as Block[];
    }
  };

  const result = await streamAssist(specId, mode, prompt, (chunk) => {
    acc += chunk;
    // Progressive render only when motion is allowed. Re-parsing per token is
    // cheap for Spec-sized output and keeps the streamed feel; reduced-motion
    // users get one clean append below instead.
    if (!reduceMotion) void render();
  });

  if (!result.ok) {
    if (result.noKey) {
      onNoKey("Add an AI provider key in Settings to use AI commands.");
    } else {
      onNoKey(result.message);
    }
    return;
  }

  // Final render guarantees the complete output is laid out even if the last
  // progressive pass was mid-parse — and is the only render for reduced-motion.
  await render();
}

// Spec-level slash actions (UX review #5). These reach beyond text generation
// into the Spec's operable objects — breakdown, sign-off, tasks, initiative
// links. Non-doc actions (breakdown, sign-off, link) call back into page.tsx
// handlers; the only doc-insertion (/task) goes through editor.insertBlocks,
// which is Yjs-aware, so it never touches the collaborative binding directly.
export type SpecSlashActions = {
  // Generate the task breakdown (switches to Breakdown tab + kicks generation).
  onBreakdown: () => void;
  // Trigger the request-review flow from the sign-off panel.
  onRequestReview: () => void;
  // Open the initiative picker to link this Spec to an initiative.
  onLinkInitiative: () => void;
};

// Insert a task-style checklist block at the cursor. Goes through the editor
// API (insertBlocks) so the new block syncs to every collaborator via Yjs — we
// never write the fragment directly.
function insertTaskBlock(editor: BlockNoteEditor): void {
  const anchor = editor.getTextCursorPosition().block;
  editor.insertBlocks(
    [{ type: "checkListItem", content: "Task: " }],
    anchor,
    "after",
  );
}

// Build the four AI slash items. `editor` is the live collaborative instance;
// `specId` scopes the assist request; `onNoKey` surfaces the 422 no-key case
// (and any stream error) to a toast in the host component.
export function getAiSlashMenuItems(
  editor: BlockNoteEditor,
  specId: string,
  onNoKey: NoKeyHandler,
): DefaultReactSuggestionItem[] {
  const GROUP = "AI";

  const run = (mode: AssistMode, prompt: string) =>
    void streamIntoDoc(editor, specId, mode, prompt, onNoKey);

  return [
    {
      title: "AI: Draft from a line",
      group: GROUP,
      subtext: "Describe a section in one line — AI drafts it",
      aliases: ["ai", "draft", "write", "generate"],
      onItemClick: () => {
        // v1: a simple prompt for the one-line ask. Inline input is a later
        // refinement; window.prompt keeps the slash path dependency-free and
        // never touches the collaborative binding.
        const ask = window.prompt("Draft what? (one line)");
        if (ask && ask.trim()) run("draft", ask.trim());
      },
    },
    {
      title: "AI: Expand this section",
      group: GROUP,
      subtext: "Flesh out the selected or current text",
      aliases: ["ai", "expand", "elaborate", "more"],
      onItemClick: () => {
        const ctx = currentContext(editor);
        if (!ctx) {
          onNoKey("Select or place your cursor in a section to expand.");
          return;
        }
        run("expand", ctx);
      },
    },
    {
      title: "AI: Critique the spec",
      group: GROUP,
      subtext: "Insert an inline critique of the Spec so far",
      aliases: ["ai", "critique", "review", "feedback"],
      onItemClick: () => {
        // Critique reads the whole doc server-side from specId; prompt is the
        // local context as a hint (current section), harmless when empty.
        run("critique", currentContext(editor));
      },
    },
    {
      title: "AI: Acceptance criteria",
      group: GROUP,
      subtext: "Generate acceptance criteria for this feature",
      aliases: ["ai", "acceptance", "criteria", "gherkin", "ac"],
      onItemClick: () => {
        const ctx = currentContext(editor);
        if (!ctx) {
          onNoKey("Select or place your cursor in a feature paragraph first.");
          return;
        }
        run("acceptance", ctx);
      },
    },
  ];
}

// Build the Spec-object slash group (UX review #5): operable actions on the
// Spec itself, grouped under "Spec". Doc-insertions go through the editor API;
// everything else hands off to page.tsx handlers via `actions`.
export function getSpecSlashMenuItems(
  editor: BlockNoteEditor,
  actions: SpecSlashActions,
): DefaultReactSuggestionItem[] {
  const GROUP = "Spec";

  return [
    {
      title: "Generate breakdown",
      group: GROUP,
      subtext: "Generate the agent-ready task breakdown",
      aliases: ["breakdown", "tasks", "decompose", "plan"],
      onItemClick: () => actions.onBreakdown(),
    },
    {
      title: "Request review",
      group: GROUP,
      subtext: "Move this Spec into review and request sign-off",
      aliases: ["signoff", "sign-off", "request review", "review", "approve"],
      onItemClick: () => actions.onRequestReview(),
    },
    {
      title: "Insert task",
      group: GROUP,
      subtext: "Add a task-style checklist item to the doc",
      aliases: ["task", "todo", "checklist", "checkbox"],
      onItemClick: () => insertTaskBlock(editor),
    },
    {
      title: "Link initiative",
      group: GROUP,
      subtext: "Connect this Spec to a roadmap initiative",
      aliases: ["link initiative", "initiative", "roadmap", "link"],
      onItemClick: () => actions.onLinkInitiative(),
    },
  ];
}
