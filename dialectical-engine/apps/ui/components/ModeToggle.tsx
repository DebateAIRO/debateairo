"use client";

import type { JSX } from "react";
import { useEffect, useState } from "react";

export type Mode = "terracotta" | "chamber";

export function ModeToggle(): JSX.Element {
  const [mode, setMode] = useState<Mode>("terracotta");

  useEffect(() => {
    setMode(document.documentElement.dataset.mode === "chamber" ? "chamber" : "terracotta");
  }, []);

  const chamber = mode === "chamber";

  function toggleMode(): void {
    const next: Mode = chamber ? "terracotta" : "chamber";
    document.documentElement.dataset.mode = next;
    try {
      localStorage.setItem("debateai.mode", next);
    } catch {
      // Storage can be unavailable; the live document mode still changes.
    }
    setMode(next);
  }

  return (
    <button
      type="button"
      className="modeToggle"
      data-mode-toggle
      aria-pressed={chamber}
      aria-label={chamber ? "Switch to Terracotta mode" : "Switch to Chamber mode"}
      onClick={toggleMode}
    >
      {chamber ? "☀ Terracotta" : "☾ Chamber"}
    </button>
  );
}
