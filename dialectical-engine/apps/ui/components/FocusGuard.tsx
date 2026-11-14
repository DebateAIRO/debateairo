"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { installFocusGuard, resetFocusGuard } from "@/lib/focusGuard";

/**
 * Starts the site-wide focus guard (see `lib/focusGuard.ts`): a control switched off or taken away under a keyboard
 * user's focus never leaves focus on the page itself. Mounted once, in the root layout; it draws nothing.
 */
export function FocusGuard(): null {
  const pathname = usePathname();
  useEffect(() => installFocusGuard(), []);
  // Another page: it starts at its top, as a fresh load does. Nothing is owed across the move.
  useEffect(() => {
    resetFocusGuard();
  }, [pathname]);
  return null;
}
