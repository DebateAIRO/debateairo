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

export function V4ShareChange({ share }: Readonly<{ share: number | null }>) {
  const before = useRef(share);
  const [mark, setMark] = useState<Readonly<{ text: string; serial: number }> | null>(null);
  useEffect(() => {
    const was = before.current;
    before.current = share;
    const text = was === null || share === null ? null : shareChangeText(was, share);
    if (text === null) {
      setMark(null);
      return undefined;
    }
    setMark((current) => ({ text, serial: (current?.serial ?? 0) + 1 }));
    const timer = window.setTimeout(() => setMark(null), SHARE_CHANGE_MS);
    return () => window.clearTimeout(timer);
  }, [share]);
  if (mark === null) return null;
  return <span key={mark.serial} className="v4ShareChange v4Highlight" aria-hidden="true">{mark.text}</span>;
}
