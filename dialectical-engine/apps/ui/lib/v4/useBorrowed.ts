"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UsageBorrow } from "@debateai/contract";
import { readBorrowed } from "./money.js";
import { useQuotaRefresh } from "./quotaPulse.js";

/*
 * The money rule (owner, 31 Oct 2026) and map-f9 (owner's screen review, 3 Nov): what running work borrowed from tomorrow
 * or next week, for the map's borrow notices. Read once the page has its debate, then again after each quota moment and
 * when the person comes back to the tab (lib/v4/quotaPulse.ts); only the newest read's answer counts. Moved out of
 * V4DebateClient.tsx (the wave-2 review of 4 Nov: the page keeps a thin wiring layer). Memory only.
 */
export function useBorrowed(active: boolean): readonly UsageBorrow[] {
  const [borrowed, setBorrowed] = useState<readonly UsageBorrow[]>([]);
  const reads = useRef(0);
  const readNow = useCallback(() => {
    reads.current += 1;
    const mine = reads.current;
    void readBorrowed().then((next) => {
      if (mine === reads.current) setBorrowed(next);
    });
  }, []);
  useEffect(() => {
    if (!active) return undefined;
    readNow();
    return () => {
      reads.current += 1;
    };
  }, [active, readNow]);
  useQuotaRefresh(readNow, active);
  return borrowed;
}
