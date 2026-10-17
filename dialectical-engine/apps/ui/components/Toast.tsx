"use client";

import * as React from "react";

/** The id of the one polite live region the layout keeps mounted on every page. */
export const ANNOUNCER_ID = "app-announcer";

/**
 * Says `message` through the layout's always-mounted live region. A live region that is inserted
 * already holding its text is skipped by several screen readers, so a region that appears and
 * disappears with the toast is not reliably spoken; one that stays and changes text is.
 */
export function announce(message: string): void {
  const region = document.getElementById(ANNOUNCER_ID);
  if (region === null) return;
  region.textContent = "";
  window.setTimeout(() => {
    region.textContent = message;
  }, 50);
}

export function Toast({ message }: { message: string }) {
  React.useEffect(() => {
    announce(message);
  }, [message]);
  return (
    <div className="toast" aria-hidden="true">
      <span className="toastDot" />
      {message}
    </div>
  );
}
