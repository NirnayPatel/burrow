import type { BlockNoteEditor } from "@blocknote/core";

// A tiny mutable bridge so the Assistant tab can append AI output into the
// BlockNote doc without threading the editor instance through React state
// (which would re-render the collaborative editor). SpecEditor registers its
// instance here on mount; the Assistant tab reads it on demand.
export type EditorBridge = {
  editor: BlockNoteEditor | null;
  // Near-empty check drives the in-editor AI starter (3b-ii): one block, very
  // short text. Recomputed by SpecEditor as the doc changes.
  isNearEmpty: boolean;
};

export function createEditorBridge(): EditorBridge {
  return { editor: null, isNearEmpty: true };
}

// Append AI markdown as editable blocks at the end of the doc — the "Insert
// into Spec" affordance. Parsed via BlockNote's markdown so headings/lists land
// as real blocks, matching the streamed-Breakdown feel.
export async function appendMarkdown(
  editor: BlockNoteEditor,
  markdown: string,
): Promise<void> {
  const text = markdown.trim();
  if (!text) return;
  const blocks = await editor.tryParseMarkdownToBlocks(text);
  if (!blocks.length) return;
  const doc = editor.document;
  const last = doc[doc.length - 1];
  if (last) editor.insertBlocks(blocks, last, "after");
  else editor.replaceBlocks(editor.document, blocks);
}
