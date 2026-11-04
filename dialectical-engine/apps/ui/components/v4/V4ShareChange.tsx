"use client";

import { useEffect, useRef, useState } from "react";
import { shareChangeText } from "@/lib/v4/digQuota";

/*
 * journey-f8 (owner's screen review, 3 Nov 2026): when the share on a button changes (another mode, more picks), its
 * change shows beside it in grey for 2 seconds, "+4%" or "−2%", never in red. It appears and goes at once, with the
 * shared 1-second soft highlight (app/v4/v4-base.css .v4Highlight); under reduced motion the highlight is colour only and
 * the words stay the same 2 seconds. The button itself already says the new share, so screen readers hear it there.
 * A share that appears or goes (none known before or after) shows no change.
 */

/** How long a change mark stays (journey-f8). */
export const SHARE_CHANGE_MS = 2_000;

/**
 * `subject` (the wave-2 review, 4 Nov): what the button digs, as a place ("path:…", "open:…"). A share of another place
 * is not a change of this one (the panel's button is reused when the person opens another path), so no mark shows then.
 */
export function V4ShareChange({ share, subject = null }: Readonly<{ share: number | null; subject?: string | null }>) {
  const before = useRef(Object.freeze({ share, subject }));
  const [mark, setMark] = useState<Readonly<{ text: string; serial: number }> | null>(null);
  useEffect(() => {
    const was = before.current;
    before.current = Object.freeze({ share, subject });
    const text = was.share === null || share === null || was.subject !== subject ? null : shareChangeText(was.share, share);
    if (text === null) {
      setMark(null);
      return undefined;
    }
    setMark((current) => ({ text, serial: (current?.serial ?? 0) + 1 }));
    const timer = window.setTimeout(() => setMark(null), SHARE_CHANGE_MS);
    return () => window.clearTimeout(timer);
  }, [share, subject]);
  if (mark === null) return null;
  // ACCESS-14: "+4%" keeps its sign before the number on right-to-left pages too.
  return <span key={mark.serial} className="v4ShareChange v4Highlight" aria-hidden="true" dir="ltr">{mark.text}</span>;
}
