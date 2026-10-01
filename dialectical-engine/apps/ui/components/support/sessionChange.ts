import { contractClient } from "../../lib/api.js";
import {
  browserSupportConversationStorage,
  clearStoredSupportConversation,
  hasExactKeys,
  readStoredSupportConversation,
  restoreSupportConversation,
  storedConversationVerdict,
  type WakeFacts
} from "./conversation.js";

/**
 * S04 (cookie-compliance; ADR-0033, PLAN §3): a session change in one tab reaches every other tab of the browser.
 *
 * Alive tabs hear an in-memory message on one BroadcastChannel; the message carries no identity, no time and no id,
 * and nothing is stored (R05). Sleeping tabs are never trusted to hear it: a sleep parks the panel (nothing shown) and a wake
 * runs one gate on facts read after the wake (R02). Every channel call — open, post, close, listener installs —
 * sits in its own `try`, because the receiver is on every page and one throw would take every page down (R06).
 */

export const SESSION_CHANGE_CHANNEL = "debateai.session-change";

export type ConversationResetReason = "session-change" | "sleep";

type ResetListener = (reason: ConversationResetReason) => void;
type WakeListener = () => void;

const SIGNED_OUT: WakeFacts = Object.freeze({ signedIn: false, currentSessionStartedAtMs: null });
/**
 * FIX p1 (SD-B1) + FIX p2 (PT2-B1, D-ORCH ruling): the sign-in state could not be read. Nothing is decided on it:
 * the copy is neither shown nor erased, and the gate runs again once the server answers (`scheduleRecheck`).
 */
export const UNKNOWN_WAKE_FACTS: WakeFacts = Object.freeze({ signedIn: "unknown", currentSessionStartedAtMs: null });
const UNKNOWN = UNKNOWN_WAKE_FACTS;
/** FIX p2 (PT2-B1): the re-check backoff while the sign-in state is unknown; the last delay repeats. */
export const RECHECK_DELAYS_MS: readonly number[] = Object.freeze([1000, 2000, 4000, 8000, 15000]);

/**
 * The reset generation: one more on every receipt, every local announcement, every sleep and every wake. A gate run
 * that began in an older generation applies nothing (D-S04-24); the wake's increment is load-bearing (D-S04-32).
 */
let generation = 0;
let settled: Readonly<{ generation: number; promise: Promise<WakeFacts | null> }> | null = null;
const resetListeners = new Set<ResetListener>();
const wakeListeners = new Set<WakeListener>();
/**
 * The open channels of this page's receivers (the layout guard mounts one). A BroadcastChannel never delivers a
 * message to the instance that posted it, so an announcement posted THROUGH this page's receiver reaches every
 * other tab and not this page again (rework 2: the announcing page used to reset twice, 1-79 ms apart, and a
 * message typed between the two resets was dropped). The payload stays EXACT `{type:"session-change"}` (R05).
 */
const receiverChannels: BroadcastChannel[] = [];

function notifyReset(reason: ConversationResetReason): void {
  for (const listener of [...resetListeners]) {
    try { listener(reason); } catch { /* one subscriber's failure never stops the others */ }
  }
}

function notifyWake(): void {
  for (const listener of [...wakeListeners]) {
    try { listener(); } catch { /* one subscriber's failure never stops the others */ }
  }
}

function openChannel(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(SESSION_CHANGE_CHANNEL);
  } catch {
    return null;
  }
}

function closeChannel(channel: BroadcastChannel): void {
  try { channel.close(); } catch { /* a channel that refuses to close is dropped all the same */ }
}

function isSessionChangeMessage(data: unknown): boolean {
  return data !== null && typeof data === "object" && !Array.isArray(data)
    && hasExactKeys(data as Readonly<Record<string, unknown>>, ["type"])
    && (data as Readonly<Record<string, unknown>>).type === "session-change";
}

/** A lifecycle event that says the page is going into, or coming out of, the back/forward cache. */
function isPersisted(event: Event): boolean {
  return (event as Event & { persisted?: unknown }).persisted === true;
}

/**
 * Tells this page's subscribers, then every other tab, that the signed-in person changed. The caller has already
 * erased this tab's copy (E1-E7). Never throws.
 */
export function announceSessionChange(): void {
  generation += 1;
  notifyReset("session-change");
  const own = receiverChannels[0];
  if (own !== undefined) {
    try { own.postMessage({ type: "session-change" }); } catch { /* the other tabs decide on wake instead */ }
    return;
  }
  const channel = openChannel();
  if (channel === null) return;
  try { channel.postMessage({ type: "session-change" }); } catch { /* the other tabs decide on wake instead */ }
  closeChannel(channel);
}

export function onConversationReset(listener: ResetListener): () => void {
  resetListeners.add(listener);
  return () => { resetListeners.delete(listener); };
}

export function onConversationWake(listener: WakeListener): () => void {
  wakeListeners.add(listener);
  return () => { wakeListeners.delete(listener); };
}

/**
 * What the server says now: signed in (`GET /api/v1/session` answers ok) and, if so, when the current session began
 * (`created_at` of the `current: true` row of `GET /v1/auth/sessions`, the API's clock). Only a 401 — the API's
 * `SESSION_REQUIRED` — means signed out; any other refusal, a 5xx from the proxy while the API restarts, or no answer
 * is "unknown" (FIX p1, SD-B1). A list that cannot be read leaves the start unknown, which the verdict treats as
 * "no proof the session is older" (D-S04-20).
 */
export async function readWakeFacts(): Promise<WakeFacts> {
  const response = await fetch("/api/v1/session", {
    method: "GET", cache: "no-store", credentials: "same-origin"
  });
  if (response.status === 401) return SIGNED_OUT;
  if (!response.ok) return UNKNOWN;
  let currentSessionStartedAtMs: number | null = null;
  try {
    const current = (await contractClient.listSessions()).sessions.find((session) => session.current);
    const startedAt = current === undefined ? Number.NaN : Date.parse(current.created_at);
    currentSessionStartedAtMs = Number.isFinite(startedAt) ? startedAt : null;
  } catch {
    currentSessionStartedAtMs = null;
  }
  return Object.freeze({ signedIn: true, currentSessionStartedAtMs });
}

/**
 * The restore gate for a stored transcript (R02): E4 (a)/(b) through `restoreSupportConversation`, then (c) through
 * `storedConversationVerdict`. One run per reset generation; nothing stored means no request; facts that land
 * after the generation moved apply nothing. Resolves with the facts it judged on, or null when nothing was stored
 * or the run went stale. Unknown facts leave the copy untouched and are not remembered, so the next call reads
 * again (FIX p2, PT2-B1: decide later, never on a guess). Never rejects.
 */
export function settleStoredConversation(
  readFacts: () => Promise<WakeFacts> = readWakeFacts
): Promise<WakeFacts | null> {
  if (settled !== null && settled.generation === generation) return settled.promise;
  const startedIn = generation;
  let entry: Readonly<{ generation: number; promise: Promise<WakeFacts | null> }> | null = null;
  let forget = false;
  const run = async (): Promise<WakeFacts | null> => {
    const storage = browserSupportConversationStorage();
    if (readStoredSupportConversation(storage) === null) return null;
    let facts: WakeFacts;
    try {
      facts = await readFacts();
    } catch {
      facts = UNKNOWN;
    }
    if (generation !== startedIn) return null;
    if (facts.signedIn === "unknown") {
      // Not remembered: the next call reads the facts again.
      forget = true;
      if (entry !== null && settled === entry) settled = null;
      return UNKNOWN;
    }
    const kept = restoreSupportConversation(storage, facts.signedIn);
    if (kept !== null && storedConversationVerdict(kept, facts) === "erase") {
      clearStoredSupportConversation(storage);
    }
    return facts;
  };
  const promise = run().catch(() => null);
  entry = Object.freeze({ generation: startedIn, promise });
  if (!forget) settled = entry;
  return promise;
}

/**
 * FIX p2 (PT2-B1): calls `recheck` once, at the first of: the browser going `online`, the page becoming visible,
 * or the backoff delay for this `attempt` (RECHECK_DELAYS_MS; the last delay repeats). Returns a canceller. Never
 * throws: with no window or document the timer alone remains.
 */
export function scheduleRecheck(recheck: () => void, attempt = 0): () => void {
  let done = false;
  const delay = RECHECK_DELAYS_MS[Math.min(Math.max(attempt, 0), RECHECK_DELAYS_MS.length - 1)]!;
  const cancel = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    try { if (typeof window !== "undefined") window.removeEventListener("online", fire); } catch { /* nothing to undo */ }
    try { if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible); } catch { /* nothing to undo */ }
  };
  const fire = () => {
    if (done) return;
    cancel();
    recheck();
  };
  const onVisible = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") fire();
  };
  const timer = setTimeout(fire, delay);
  try { if (typeof window !== "undefined") window.addEventListener("online", fire); } catch { /* the timer remains */ }
  try { if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible); } catch { /* the timer remains */ }
  return cancel;
}

/**
 * Listens for the other tabs and for this page's sleep and wake. Returns the disposer. Never throws: with no
 * BroadcastChannel, or one that throws, the page keeps its lifecycle handling and in-page subscribers, and a
 * channel that failed to open is tried again at the next wake.
 */
export function installSessionChangeReceiver(): () => void {
  let channel: BroadcastChannel | null = null;
  let disposed = false;

  const onMessage = (event: Event) => {
    if (!isSessionChangeMessage((event as MessageEvent).data)) return;
    clearStoredSupportConversation();
    generation += 1;
    notifyReset("session-change");
  };
  const open = () => {
    if (channel !== null || disposed) return;
    const next = openChannel();
    if (next === null) return;
    try {
      next.addEventListener("message", onMessage);
      channel = next;
      receiverChannels.push(next);
    } catch {
      closeChannel(next);
    }
  };
  // An open channel keeps a page out of the back/forward cache, so it closes on the way in (D-S04-12, D-S04-16).
  const close = () => {
    const current = channel;
    channel = null;
    if (current === null) return;
    const index = receiverChannels.indexOf(current);
    if (index !== -1) receiverChannels.splice(index, 1);
    try { current.removeEventListener("message", onMessage); } catch { /* closing below ends delivery anyway */ }
    closeChannel(current);
  };
  const sleep = () => {
    generation += 1;
    notifyReset("sleep");
  };
  const wake = () => {
    open();
    generation += 1;
    notifyWake();
  };
  const onPageHide = (event: Event) => {
    if (!isPersisted(event)) return;
    close();
    sleep();
  };
  const onPageShow = (event: Event) => {
    if (isPersisted(event)) wake();
  };

  const targets: ReadonlyArray<readonly [() => EventTarget | undefined, string, (event: Event) => void]> = [
    [() => (typeof window === "undefined" ? undefined : window), "pagehide", onPageHide],
    [() => (typeof window === "undefined" ? undefined : window), "pageshow", onPageShow],
    [() => (typeof document === "undefined" ? undefined : document), "freeze", sleep],
    [() => (typeof document === "undefined" ? undefined : document), "resume", wake]
  ];
  open();
  for (const [target, type, handler] of targets) {
    try { target()?.addEventListener(type, handler); } catch { /* the other handlers still install */ }
  }
  return () => {
    disposed = true;
    close();
    for (const [target, type, handler] of targets) {
      try { target()?.removeEventListener(type, handler); } catch { /* nothing further to undo */ }
    }
  };
}

/** Test hook (U13, U14): the current reset generation. No product caller. */
export function sessionChangeGeneration(): number {
  return generation;
}
