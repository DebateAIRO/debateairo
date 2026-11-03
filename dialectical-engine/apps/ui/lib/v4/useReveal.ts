"use client";

import { useEffect, useRef, useState } from "react";

/*
 * dig-d4 B and map-d5 (V4 screen review, 3 Nov): the first time the person sees what a dig did, its card turns over once
 * (half a second) and its ground clears; under reduced motion the card changes at once with a 1-second soft highlight
 * (v4-map-looks.css). This hook says which cards play that moment now: each id the first time it shows up in `fresh`
 * during this visit, for `ms`. In memory only (the cookie inventory is law): a reload plays it again only for news the
 * person has still not opened.
 */

/** How long a card keeps its reveal class: the turn-over takes 0.45 s, the reduced-motion highlight 1 s. */
export const REVEAL_MS = 1_000;

export function useRevealOnce(fresh: ReadonlySet<string>, ms = REVEAL_MS): ReadonlySet<string> {
  const seen = useRef<Set<string>>(new Set());
  const timers = useRef<Set<number>>(new Set());
  const [playing, setPlaying] = useState<ReadonlySet<string>>(() => new Set());
  const key = [...fresh].sort().join("|");
  const freshRef = useRef(fresh);
  useEffect(() => {
    freshRef.current = fresh;
  });

  useEffect(() => {
    const now = [...freshRef.current].filter((id) => !seen.current.has(id));
    if (now.length === 0) return;
    for (const id of now) seen.current.add(id);
    setPlaying((before) => new Set([...before, ...now]));
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      setPlaying((before) => new Set([...before].filter((id) => !now.includes(id))));
    }, ms);
    timers.current.add(timer);
  }, [key, ms]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) window.clearTimeout(timer);
      pending.clear();
    };
  }, []);

  return playing;
}
