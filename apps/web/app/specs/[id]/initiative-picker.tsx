"use client";

import { useEffect, useState } from "react";
import * as RDialog from "@radix-ui/react-dialog";
import { api } from "../../../lib/api";
import { Button } from "../../../components/button";
import { Select } from "../../../components/select";
import dialogStyles from "../../../components/dialog.module.css";
import styles from "./spec.module.css";

type Initiative = { id: string; title: string };

// Minimal initiative picker for the "/link initiative" slash action (UX review
// #5). Lists roadmap initiatives and PATCHes /api/specs/:id/initiative — the
// same endpoint the roadmap's add-spec flow uses, so the link is real, not a
// dead-end toast. Opens controlled from page.tsx; degrades to a Roadmap pointer
// when no initiatives exist yet.
export function InitiativePicker({
  open,
  onOpenChange,
  specId,
  onLinked,
  onError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  specId: string;
  onLinked: (title: string) => void;
  onError: (message: string) => void;
}) {
  const [initiatives, setInitiatives] = useState<Initiative[] | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setInitiatives(null);
    setSelected("");
    api<Initiative[]>("/api/initiatives")
      .then((list) => {
        setInitiatives(list);
        if (list.length) setSelected(list[0].id);
      })
      .catch(() => setInitiatives([]));
  }, [open]);

  async function link() {
    if (!selected) return;
    setBusy(true);
    try {
      await api(`/api/specs/${specId}/initiative`, {
        method: "PATCH",
        body: JSON.stringify({ initiativeId: selected }),
      });
      const title = initiatives?.find((i) => i.id === selected)?.title ?? "initiative";
      onLinked(title);
      onOpenChange(false);
    } catch {
      onError("Couldn't link to initiative — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className={dialogStyles.overlay} />
        <RDialog.Content className={dialogStyles.content}>
          <RDialog.Title className={dialogStyles.title}>Link to initiative</RDialog.Title>
          {initiatives === null ? (
            <p className={styles.loading}>Loading initiatives…</p>
          ) : initiatives.length === 0 ? (
            <RDialog.Description className={dialogStyles.body}>
              No initiatives yet. Create one on the Roadmap, then link this Spec.
            </RDialog.Description>
          ) : (
            <div className={styles.pickerField}>
              <Select
                value={selected}
                onValueChange={setSelected}
                ariaLabel="Choose an initiative"
                options={initiatives.map((i) => ({ value: i.id, label: i.title }))}
              />
            </div>
          )}
          <div className={dialogStyles.actions}>
            <RDialog.Close asChild>
              <Button variant="secondary">Cancel</Button>
            </RDialog.Close>
            {initiatives && initiatives.length > 0 && (
              <Button variant="primary" onClick={link} busy={busy}>
                Link
              </Button>
            )}
          </div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
