"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AskRoom } from "@/lib/billing/room";

/*
 * V4 start step, Task 76e (owner answer Q8 "Your rule, no time limit"; spec 2026-11-03 §4.1 "What counts as a site update"):
 * the ask page learns that the site was updated while it is open. A site update is a new active settings version, which every
 * upload brings; the page reads the room again every 5 minutes, when the window gets focus and when the tab becomes visible
 * again, and also whenever the page itself reads the room (a refusal's own read, Task 68). A version other than the first one
 * this page load saw, newer or older (a way back), is an update. A room read naming no version never is. Nothing is kept in
 * the browser: the first version lives in this page's memory only.
 */

/** While the ask page is open, the room is read again this often, and on focus and on becoming visible. */
export const SITE_VERSION_POLL_MS = 300_000;

/** The banner's Reload: the page is loaded afresh from the site (Task 76f first sends the latest change). */
export function reloadPage(): void {
  window.location.reload();
}

/**
 * `updated`: a room read answered a `settings_version` other than the first one this page load saw (either way); it stays true
 * for the page's life, since the page cannot tell the site went back to the very code it loaded. `latestRoom`: the room as last
 * read, handed to the start step so the new widths reach it; a read of this hook's own that fails keeps the room before it there
 * (the page's other reads are as they were), so a passing fault never takes step 2's card away. `readAgain`: one such read now,
 * for the page's restore (review, wave 16: the restore's fresh room read that failed took the card away, and Start then sent
 * the line without the kept paths).
 */
export function useSiteVersion(input: Readonly<{ room: AskRoom | null; refresh: () => Promise<AskRoom | null> }>): Readonly<{
  updated: boolean;
  latestRoom: AskRoom | null;
  readAgain(): void;
}> {
  const { room } = input;
  const refresh = useRef(input.refresh);
  refresh.current = input.refresh;
  const first = useRef<number | null>(null);
  const lastRead = useRef<AskRoom | null>(null);
  const [updated, setUpdated] = useState(false);
  // The room before one of this hook's own reads failed; null once a read answers again.
  const [kept, setKept] = useState<AskRoom | null>(null);

  const see = useCallback((read: AskRoom | null): void => {
    if (read === null) return;
    lastRead.current = read;
    const version = read.settings_version;
    if (version === undefined) return;
    if (first.current === null) first.current = version;
    else if (version !== first.current) setUpdated(true);
  }, []);

  useEffect(() => {
    see(room);
    if (room !== null) setKept(null);
  }, [room, see]);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  const readAgain = useCallback((): void => {
    const before = lastRead.current;
    void refresh.current().then((value) => {
      if (!alive.current) return;
      if (value === null) setKept(before);
      else see(value);
    }, () => {
      if (alive.current) setKept(before);
    });
  }, [see]);

  useEffect(() => {
    const onVisible = (): void => {
      if (document.visibilityState === "visible") readAgain();
    };
    const timer = setInterval(readAgain, SITE_VERSION_POLL_MS);
    window.addEventListener("focus", readAgain);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", readAgain);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [readAgain]);

  return { updated, latestRoom: room ?? kept, readAgain };
}
