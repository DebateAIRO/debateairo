/*
 * V4 start step, Task 76c (read-f2, choose-f2, choose-f21, ask-f12; owner answers Q2 A and Q3 A): the ask page's place in
 * this tab's history. Step 2 has its own entry; an entry holds the words (step 1 and step 2), or after Start the debate's id,
 * under one key beside the router's own keys. That is the history entry the browser's Back button uses: not a cookie and not
 * site storage, other tabs and sites cannot read it, and it is gone when the tab closes. The address only says it is step 2
 * (`?step=2`, keeping `?level=`), never the words.
 */

/**
 * What the page keeps in an entry: the words of step 1 or step 2, or the debate a started question became. Task 76f (owner answer
 * S1 A): step 2's entry also names the question the account keeps (`savedId`), so a reload on step 2 reopens it from the account;
 * step 1's entry never does.
 */
export type AskHistoryState = Readonly<{ step: "ask" | "read"; words: string; savedId?: string }> | Readonly<{ step: "started"; runId: string }>;

/** The one key this page writes inside history.state, beside the router's own keys. */
export const ASK_HISTORY_KEY = "v4ask";

/** The address says ?step=2 on step 2 (and keeps ?level=), never the words. */
export const ASK_STEP_PARAM = "step";

/** The address's reading level, the one other parameter step 2's address keeps. */
const LEVEL_PARAM = "level";

function recordOf(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : null;
}

/** The page's own part of an entry's state; null for any other shape (another page's entry, or a value it cannot read). */
export function askHistoryOf(state: unknown): AskHistoryState | null {
  const held = recordOf(recordOf(state)?.[ASK_HISTORY_KEY]);
  if (held === null) return null;
  const { step } = held;
  if ((step === "ask" || step === "read") && typeof held.words === "string" && held.words.trim().length > 0) {
    // Task 76f: a saved question's id only in step 2's entry, and only as a string (any other value is dropped).
    const savedId = step === "read" && typeof held.savedId === "string" && held.savedId.length > 0 ? held.savedId : null;
    return Object.freeze(savedId === null ? { step, words: held.words } : { step, words: held.words, savedId });
  }
  if (step === "started" && typeof held.runId === "string" && held.runId.length > 0) return Object.freeze({ step, runId: held.runId });
  return null;
}

/** `state` with the page's own part set: every key already there (the router's) is kept; the state handed in is not changed. */
export function withAskHistory(state: unknown, ask: AskHistoryState): Record<string, unknown> {
  const own = ask.step === "started" ? { step: ask.step, runId: ask.runId }
    : ask.step === "read" && ask.savedId !== undefined ? { step: ask.step, words: ask.words, savedId: ask.savedId }
      : { step: ask.step, words: ask.words };
  return { ...(recordOf(state) ?? {}), [ASK_HISTORY_KEY]: own };
}

/** Step 2's address (relative to the page): `?step=2`, and the reading level when the address names one. Nothing else. */
export function stepTwoAddress(search: string): string {
  const level = new URLSearchParams(search).get(LEVEL_PARAM);
  const params = new URLSearchParams({ [ASK_STEP_PARAM]: "2" });
  if (level !== null) params.set(LEVEL_PARAM, level);
  return `?${params.toString()}`;
}

/** Step 1's address: this page's address without the step. */
export function stepOneAddress(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  params.delete(ASK_STEP_PARAM);
  const rest = params.toString();
  return rest.length === 0 ? pathname : `${pathname}?${rest}`;
}

/**
 * A full load of `href`, so the page starts afresh: Leave in the logo's question. The logo's link names this very page, and the
 * site's router keeps a page as it was when a link only changes its address, so following the link would lose nothing.
 */
export function loadPage(href: string): void {
  window.location.assign(href);
}
