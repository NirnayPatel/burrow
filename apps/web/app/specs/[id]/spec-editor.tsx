"use client";

import { useEffect, useMemo, useState } from "react";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { BlockNoteEditor, filterSuggestionItems } from "@blocknote/core";
import {
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { COLLAB_URL } from "../../../lib/api";
import { presenceColor } from "../../../lib/presence";
import type { Collaborator } from "../../../components/presence-stack";
import { useToast } from "../../../components/toast";
import { AiStarter } from "./ai-starter";
import {
  getAiSlashMenuItems,
  getSpecSlashMenuItems,
  type SpecSlashActions,
} from "./ai-slash-menu";
import { appendMarkdown } from "./editor-bridge";
import styles from "./spec.module.css";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

// A collaborator is considered idle once their awareness state has gone
// untouched past this window (05-DESIGN §5: idle >60s dims the avatar).
const IDLE_AFTER_MS = 60_000;

// BlockNote needs an explicit light/dark so its Mantine layer (popovers,
// menus) doesn't default to white surfaces on a dark canvas. Resolve the
// same way tokens.css does: [data-theme] override first, system preference
// otherwise.
function useResolvedTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const resolve = () => {
      const forced = document.documentElement.dataset.theme;
      setTheme(
        forced === "dark" || (forced !== "light" && mq.matches)
          ? "dark"
          : "light",
      );
    };
    resolve();
    mq.addEventListener("change", resolve);
    return () => mq.removeEventListener("change", resolve);
  }, []);

  return theme;
}

// Connection status, plain-language. The raw provider status string
// ("connecting", "connected", "disconnected") never reaches a user's eyes
// raw (05-DESIGN §6); we render a quiet dot + label instead.
const CONNECTION_LABEL: Record<string, string> = {
  connecting: "Connecting…",
  connected: "Connected",
  disconnected: "Reconnecting…",
  "auth failed": "Connection refused",
};

// The key feature: multiplayer spec editing. BlockNote handles the block UI;
// Yjs/Hocuspocus handle merge + presence; Postgres persists; the session token
// authenticates the WebSocket (validated in collab's onAuthenticate).
// Near-empty heuristic for the AI starter (11-DESIGN §3b-ii): one (or zero)
// real block and very little text. Drives whether the starter shows. Walks
// inline content rather than calling a markdown serializer on every change.
function blockText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((c) => {
      const node = c as { type?: string; text?: string };
      return node.type === "text" && typeof node.text === "string" ? node.text : "";
    })
    .join("");
}

function docIsNearEmpty(editor: BlockNoteEditor): boolean {
  const blocks = editor.document as { content?: unknown }[];
  const text = blocks.map((b) => blockText(b.content)).join("");
  return blocks.length <= 1 && text.replace(/\s/g, "").length < 16;
}

export function SpecEditor({
  docName,
  token,
  userName,
  onPeopleChange,
  onEditorReady,
  specId,
  editable = true,
  specActions,
}: {
  docName: string;
  token: string;
  userName: string;
  // Lifted so the page header can render the PresenceStack from the same live
  // awareness the editor subscribes to — one source of truth, no second socket.
  onPeopleChange?: (people: Collaborator[]) => void;
  // Hands the live editor instance up so the Assistant tab can insert AI output.
  onEditorReady?: (editor: BlockNoteEditor | null) => void;
  // Enables the in-editor AI starter when the doc is near-empty.
  specId?: string;
  // Reviewer read mode: locks the same live editor read-only and widens the
  // reading rhythm. CRITICAL: this prop is NOT in the collab effect's deps, so
  // toggling Read↔Edit only flips BlockNote's `editable` flag — the provider,
  // Yjs fragment, and awareness binding all persist (no remount, no unbind).
  editable?: boolean;
  // Spec-level slash actions (UX review #5). Non-doc actions (breakdown,
  // sign-off, link initiative) hand off to page.tsx handlers; the "/task"
  // insertion lives in the slash builder and goes through the editor API.
  specActions?: SpecSlashActions;
}) {
  const [editor, setEditor] = useState<BlockNoteEditor | null>(null);
  const [status, setStatus] = useState("connecting");
  const [nearEmpty, setNearEmpty] = useState(true);
  const theme = useResolvedTheme();
  const toast = useToast();

  // Same hash the avatar stack uses, so this user's cursor color and their
  // avatar color stay in sync through lib/presence.
  const color = useMemo(() => presenceColor(userName), [userName]);

  useEffect(() => {
    const provider = new HocuspocusProvider({
      url: COLLAB_URL,
      name: docName,
      token,
      onStatus: ({ status }) => setStatus(status),
      onAuthenticationFailed: () => setStatus("auth failed"),
    });

    // Bind BlockNote only AFTER the provider's initial sync. If we create the
    // editor on an empty fragment first, BlockNote inserts a default empty
    // block that races the persisted (or seeded) content arriving over the
    // socket — content then renders intermittently or vanishes on reload.
    // Waiting for sync means the fragment is fully present before we bind.
    let created = false;
    const createEditor = () => {
      if (created) return;
      created = true;
      const ed = BlockNoteEditor.create({
        collaboration: {
          provider,
          fragment: provider.document.getXmlFragment("document-store"),
          user: { name: userName, color },
        },
      });
      setEditor(ed);
      onEditorReady?.(ed);
      // Track near-empty for the AI starter. Debounce-free: cheap text walk,
      // and BlockNote already throttles onChange. Never animates the editor.
      const syncEmpty = () => setNearEmpty(docIsNearEmpty(ed));
      syncEmpty();
      ed.onChange?.(syncEmpty);
    };
    if (provider.isSynced) createEditor();
    else provider.on("synced", createEditor);

    // Derive the live collaborator list from Hocuspocus awareness. Each state
    // carries the { name, color } we set on the collaboration config above; we
    // dedupe by name, put self first, and dim anyone idle past the window.
    const awareness = provider.awareness;
    const emitPeople = () => {
      if (!awareness || !onPeopleChange) return;
      const now = Date.now();
      const seen = new Set<string>();
      const others: Collaborator[] = [];
      let self: Collaborator | null = null;

      awareness.getStates().forEach((state, clientId) => {
        const user = (state as { user?: { name?: string } }).user;
        const name = user?.name;
        if (!name || seen.has(name)) return;
        seen.add(name);
        const meta = awareness.meta.get(clientId);
        const idle = meta ? now - meta.lastUpdated > IDLE_AFTER_MS : false;
        const person: Collaborator = { name, idle };
        if (clientId === awareness.clientID) self = person;
        else others.push(person);
      });

      onPeopleChange(self ? [self, ...others] : others);
    };

    awareness?.on("change", emitPeople);
    emitPeople();
    // Re-evaluate idle dimming on a slow tick — awareness only fires on change,
    // so a user going quiet wouldn't otherwise flip to idle.
    const idleTick = setInterval(emitPeople, IDLE_AFTER_MS / 2);

    return () => {
      provider.off("synced", createEditor);
      awareness?.off("change", emitPeople);
      clearInterval(idleTick);
      onPeopleChange?.([]);
      onEditorReady?.(null);
      setEditor(null);
      provider.destroy();
    };
  }, [docName, token, userName, color, onPeopleChange, onEditorReady]);

  const connectionLabel = CONNECTION_LABEL[status] ?? status;
  const connectionState =
    status === "connected"
      ? "online"
      : status === "auth failed"
        ? "error"
        : "pending";

  return (
    <div
      className={`${styles.editorZone} ${editable ? "" : styles.readMode}`}
    >
      <div
        className={styles.connection}
        data-state={connectionState}
        role="status"
      >
        <span className={styles.connectionDot} aria-hidden="true" />
        {connectionLabel}
      </div>
      {editor ? (
        <>
          {/* The AI starter is an authoring affordance — hidden in read mode. */}
          {editable && specId && nearEmpty && (
            <AiStarter
              specId={specId}
              onInsert={async (markdown) => {
                await appendMarkdown(editor, markdown);
                setNearEmpty(docIsNearEmpty(editor));
              }}
            />
          )}
          <BlockNoteView
            editor={editor}
            editable={editable}
            theme={theme}
            slashMenu={false}
          >
            {/* Custom "/" menu: BlockNote's defaults plus our AI group
                (11-DESIGN §3b-i). slashMenu={false} disables the built-in
                controller so this one fully owns "/". The collaboration binding
                above is untouched — items insert through the editor API, which
                is Yjs-aware, so AI output syncs to every peer. */}
            <SuggestionMenuController
              triggerCharacter="/"
              getItems={async (query) =>
                filterSuggestionItems(
                  [
                    ...getDefaultReactSlashMenuItems(editor),
                    ...(specId
                      ? getAiSlashMenuItems(editor, specId, (message) =>
                          toast(message, "danger"),
                        )
                      : []),
                    // Spec-object actions (UX review #5). Items insert through
                    // the editor API or hand off to page.tsx — the collab
                    // binding above is never touched.
                    ...(specActions
                      ? getSpecSlashMenuItems(editor, specActions)
                      : []),
                  ],
                  query,
                )
              }
            />
          </BlockNoteView>
        </>
      ) : (
        <p className={styles.loading}>Loading editor…</p>
      )}
    </div>
  );
}
