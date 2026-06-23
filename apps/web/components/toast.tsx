"use client";

import * as RToast from "@radix-ui/react-toast";
import { createContext, useCallback, useContext, useState } from "react";
import styles from "./toast.module.css";

type Tone = "default" | "success" | "danger";
type ToastItem = { id: number; message: string; tone: Tone };

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});

// useToast() returns a push function: toast("Key added", "success").
export function useToast() {
  return useContext(ToastContext);
}

let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, tone: Tone = "default") => {
    const id = ++counter;
    setItems((prev) => [...prev, { id, message, tone }]);
  }, []);

  const remove = (id: number) => setItems((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={push}>
      <RToast.Provider swipeDirection="right" duration={5000}>
        {children}
        {items.map((t) => (
          <RToast.Root
            key={t.id}
            className={`${styles.toast} ${styles[t.tone]}`}
            onOpenChange={(open) => !open && remove(t.id)}
          >
            <RToast.Description className={styles.message}>
              {t.message}
            </RToast.Description>
            <RToast.Close className={styles.close} aria-label="Dismiss">
              ×
            </RToast.Close>
          </RToast.Root>
        ))}
        <RToast.Viewport className={styles.viewport} />
      </RToast.Provider>
    </ToastContext.Provider>
  );
}
