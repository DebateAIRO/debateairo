"use client";

import type { JSX } from "react";
import { useEffect, useState, type MouseEvent } from "react";
import { transitionDocumentMode, type Mode } from "./modeTransition";

export type { Mode } from "./modeTransition";

export function ModeToggle({ compact = false }: { compact?: boolean } = {}): JSX.Element {
  const [mode, setMode] = useState<Mode>("terracotta");

  useEffect(() => {
    setMode(document.documentElement.dataset.mode === "chamber" ? "chamber" : "terracotta");
  }, []);

  const chamber = mode === "chamber";

  function toggleMode(event: MouseEvent<HTMLButtonElement>): void {
    const current: Mode = document.documentElement.dataset.mode === "chamber" ? "chamber" : "terracotta";
    const next: Mode = current === "chamber" ? "terracotta" : "chamber";

    transitionDocumentMode(document, event.currentTarget, next, () => {
      try {
        localStorage.setItem("debateai.mode", next);
      } catch {
        // Storage can be unavailable; the live document mode still changes.
      }
      setMode(next);
    });
  }

  return (
    <button
      type="button"
      className={`modeToggle${compact ? " compact" : ""}`}
      data-mode-toggle
      aria-pressed={chamber}
      aria-label={chamber ? "Switch to Terracotta mode" : "Switch to Chamber mode"}
      onClick={toggleMode}
    >
      {compact ? (chamber ? "☀" : "☾") : chamber ? "☀" : "☾"}
    </button>
  );
}
