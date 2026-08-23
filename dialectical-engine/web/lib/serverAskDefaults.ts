import "server-only";

// DR-180's duplicate web form has no asker-owned as-of control. Capture its
// machine default on every force-dynamic page request so the browser never
// derives or silently rewrites this field. No tighter submission-age bound is
// currently ruled; the richer apps/ui form refreshes its editable value at Start.
export function deriveMachineAskAsOf(now: Date = new Date(Date.now())): string {
  return now.toISOString();
}
