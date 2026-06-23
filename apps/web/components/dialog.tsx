"use client";

import * as RDialog from "@radix-ui/react-dialog";
import { Button } from "./button";
import styles from "./dialog.module.css";

// Confirm dialog for destructive or consequential actions (remove key, archive
// spec). Radix gives focus trapping + Esc + portal; we style on tokens.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className={styles.overlay} />
        <RDialog.Content className={styles.content}>
          <RDialog.Title className={styles.title}>{title}</RDialog.Title>
          {body && <RDialog.Description className={styles.body}>{body}</RDialog.Description>}
          <div className={styles.actions}>
            <RDialog.Close asChild>
              <Button variant="secondary">{cancelLabel}</Button>
            </RDialog.Close>
            <Button
              variant={danger ? "danger" : "primary"}
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
