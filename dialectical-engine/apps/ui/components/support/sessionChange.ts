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
 * and nothing is stored (R05). Sleeping tabs are never trusted to hear it: a sleep drops the panel's copy and a wake
 * runs one gate on facts read after the wake (R02). Every channel call — open, post, close, listener installs —
 * sits in its own `try`, because the receiver is on every page and one throw would take every page down (R06).
 */

export const SESSION_CHANGE_CHANNEL = "debateai.session-change";

export type ConversationResetReason = "session-change" | "sleep";

type ResetListener = (reason: ConversationResetReason) => void;
type WakeListener = () => void;

const SIGNED_OUT: WakeFacts = Object.freeze({ signedIn: false, currentSessionStartedAtMs: null });

/**
 * The reset generation: one more on every receipt, every local announcement, every sleep and every wake. A gate run
 * that began in an older generation applies nothing (D-S04-24); the wake's increment is load-bearing (D-S04-32).
 */
let generation = 0;
let settled: Readonly<{ generation: number; promise: Promise<void> }> | null = null;
const resetListeners = new Set<ResetListener>();
const wakeListeners = new Set<WakeListener>();

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
 * (`created_at` of the `current: true` row of `GET /v1/auth/sessions`, the API's clock). A list that cannot be read
 * leaves the start unknown, which the verdict treats as "no proof the session is older" (D-S04-20).
 */
export async function readWakeFacts(): Promise<WakeFacts> {
  const response = await fetch("/api/v1/session", {
    method: "GET", cache: "no-store", credentials: "same-origin"
  });
  if (!response.ok) return SIGNED_OUT;
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
 * after the generation moved apply nothing. Never rejects.
 */
export function settleStoredConversation(readFacts: () => Promise<WakeFacts> = readWakeFacts): Promise<void> {
  if (settled !== null && settled.generation === generation) return settled.promise;
  const startedIn = generation;
  const promise = (async () => {
    const storage = browserSupportConversationStorage();
    if (readStoredSupportConversation(storage) === null) return;
    let facts: WakeFacts;
    try {
      facts = await readFacts();
    } catch {
      facts = SIGNED_OUT;
    }
    if (generation !== startedIn) return;
    const kept = restoreSupportConversation(storage, facts.signedIn);
    if (kept !== null && storedConversationVerdict(kept, facts) === "erase") {
      clearStoredSupportConversation(storage);
    }
  })().catch(() => undefined);
  settled = Object.freeze({ generation: startedIn, promise });
  return promise;
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
    } catch {
      closeChannel(next);
    }
  };
  // An open channel keeps a page out of the back/forward cache, so it closes on the way in (D-S04-12, D-S04-16).
  const close = () => {
    const current = channel;
    channel = null;
    if (current === null) return;
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
