"use client";

import { useEffect } from "react";
import {
  installSessionChangeReceiver,
  onConversationWake,
  scheduleRecheck,
  settleStoredConversation
} from "./sessionChange.js";

/**
 * S04 (cookie-compliance; ADR-0033, PLAN S3.5): mounted once in the root layout, so every page of every tab hears a
 * session change made in another tab — including a page with no help panel that still holds the stored
 * transcript. On mount and on every wake it runs the restore gate on facts read now; while the sign-in state cannot
 * be read it leaves the copy alone and runs the gate again when the server answers (PT2-B1). It renders nothing, and its
 * effect never throws: the layout is on every page, and one throw here would take every page down (R06).
 */
export function SupportConversationGuard(): null {
  useEffect(() => {
    const disposers: Array<() => void> = [];
    let disposed = false;
    let stopRecheck: (() => void) | null = null;
    let attempt = 0;
    const settle = () => {
      stopRecheck?.();
      stopRecheck = null;
      void settleStoredConversation().then((facts) => {
        if (disposed) return;
        if (facts?.signedIn !== "unknown") {
          attempt = 0;
          return;
        }
        stopRecheck = scheduleRecheck(() => {
          attempt += 1;
          settle();
        }, attempt);
      });
    };
    try {
      disposers.push(installSessionChangeReceiver());
      settle();
      disposers.push(onConversationWake(settle));
    } catch {
      // The page keeps working without the cross-tab signal; a wake or reload runs the gate again.
    }
    return () => {
      disposed = true;
      try { stopRecheck?.(); } catch { /* nothing further to undo */ }
      for (const dispose of disposers.reverse()) {
        try { dispose(); } catch { /* nothing further to undo */ }
      }
    };
  }, []);
  return null;
}
