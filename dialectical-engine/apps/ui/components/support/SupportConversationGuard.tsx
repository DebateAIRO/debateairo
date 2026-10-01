"use client";

import { useEffect } from "react";
import {
  installSessionChangeReceiver,
  onConversationWake,
  settleStoredConversation
} from "./sessionChange.js";

/**
 * S04 (cookie-compliance; ADR-0033, PLAN S3.5): mounted once in the root layout, so every page of every tab hears a
 * session change made in another tab — including a page with no help panel that still holds the stored
 * transcript. On mount and on every wake it runs the restore gate on facts read now. It renders nothing, and its
 * effect never throws: the layout is on every page, and one throw here would take every page down (R06).
 */
export function SupportConversationGuard(): null {
  useEffect(() => {
    const disposers: Array<() => void> = [];
    try {
      disposers.push(installSessionChangeReceiver());
      void settleStoredConversation();
      disposers.push(onConversationWake(() => { void settleStoredConversation(); }));
    } catch {
      // The page keeps working without the cross-tab signal; a wake or reload runs the gate again.
    }
    return () => {
      for (const dispose of disposers.reverse()) {
        try { dispose(); } catch { /* nothing further to undo */ }
      }
    };
  }, []);
  return null;
}
