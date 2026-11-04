"use client";

import type { JSX } from "react";
import { useEffect, useState, type MouseEvent } from "react";
import { transitionDocumentMode, type Mode } from "./modeTransition";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import { t } from "@/lib/i18n/translate";

export type { Mode } from "./modeTransition";

/** The mode the page shows now. */
export function currentMode(): Mode {
  return document.documentElement.dataset.mode === "chamber" ? "chamber" : "terracotta";
}

/**
 * Switches the site between light and dark and keeps the choice in the site's existing mode preference. The reveal starts
 * at `source`. V4 screen review (ask-d6 A, 3 Nov 2026): the V4 header's "Light or dark" passes `instant`, so the page
 * changes at once (V4 moves only its six approved moves).
 */
export function switchMode(source: Element, options: Readonly<{ instant?: boolean; onSwitched?: (next: Mode) => void }> = {}): void {
  const next: Mode = currentMode() === "chamber" ? "terracotta" : "chamber";
  const keep = (): void => {
    try {
      localStorage.setItem("debateai.mode", next);
    } catch {
      // Storage can be unavailable; the live document mode still changes.
    }
    options.onSwitched?.(next);
  };
  if (options.instant === true) {
    document.documentElement.dataset.mode = next;
    keep();
    return;
  }
  transitionDocumentMode(document, source, next, keep);
}

export function ModeToggle({ compact = false }: { compact?: boolean } = {}): JSX.Element {
  const { catalog } = useChromeI18n();
  const [mode, setMode] = useState<Mode>("terracotta");

  useEffect(() => {
    setMode(document.documentElement.dataset.mode === "chamber" ? "chamber" : "terracotta");
  }, []);

  const chamber = mode === "chamber";

  function toggleMode(event: MouseEvent<HTMLButtonElement>): void {
    switchMode(event.currentTarget, { onSwitched: setMode });
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
