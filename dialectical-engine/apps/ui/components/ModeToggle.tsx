"use client";

import type { JSX } from "react";
import { useEffect, useState, type MouseEvent } from "react";
import { transitionDocumentMode, type Mode } from "./modeTransition";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import { t } from "@/lib/i18n/translate";

export type { Mode } from "./modeTransition";

export function ModeToggle({ compact = false }: { compact?: boolean } = {}): JSX.Element {
  const { catalog } = useChromeI18n();
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
      aria-label={t(catalog, chamber ? "chrome.switchToLight" : "chrome.switchToDark")}
      onClick={toggleMode}
    >
      {/* The sun/moon glyph is the whole visible control (V 2026-09-26): no theme name is shown. */}
      {chamber ? "☀" : "☾"}
    </button>
  );
}
