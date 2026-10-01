// @vitest-environment jsdom

/**
 * S04-C1 (cookie-compliance, PLAN S1.1-S1.7): the storage helper cannot throw, the stored value's one optional
 * server time, the wake verdict that reads no clock, and the cross-tab session-change module.
 * U01-U19, one `it` each; the names are what the cluster command counts (19/19).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
/**
 * `apps/ui/lib/api.ts` binds `fetch` when the module loads, so the route table is installed before the modules
 * load (vi.hoisted) and the real `contractClient` — schema parse included — answers through it.
 */
const fetchRoute = vi.hoisted(() => {
  const state: { handler: ((url: string, init?: RequestInit) => Promise<Response>) | null } = { handler: null };
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => state.handler === null
    ? original(input, init) : state.handler(String(input), init)) as typeof fetch;
  return state;
});

/*
 * PLAN §3 "Interfaces", written out here, because the modules are loaded by path at run time. A static import
 * would pull `conversation.ts` → `Assistant.tsx` into the root `tsc` program (tests/**\/*.ts), which has no `--jsx`
 * and reports TS6142 — a diagnostic this cluster may not add. So the test states the contract C2 and C3 build
 * against, and vitest checks the real modules against it at run time.
 */
type SupportConversationMessage = Readonly<{ id: string; role: "assistant" | "user"; text: string }>;
type StoredSupportConversation = Readonly<{
  language: "en";
  identityBound: boolean;
  messages: readonly SupportConversationMessage[];
  serverTime?: number;
}>;
type SupportConversationStorage = Readonly<{
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}>;
type WakeFacts = Readonly<{ signedIn: boolean; currentSessionStartedAtMs: number | null }>;
type ConversationResetReason = "session-change" | "sleep";
type ConversationModule = Readonly<{
  SUPPORT_CONVERSATION_STORAGE_KEY: string;
  browserSupportConversationStorage(): SupportConversationStorage | null;
  clearStoredSupportConversation(storage?: SupportConversationStorage | null): void;
  readStoredSupportConversation(storage: SupportConversationStorage | null): StoredSupportConversation | null;
  writeStoredSupportConversation(storage: SupportConversationStorage | null, value: StoredSupportConversation): void;
  serverTimeFromDateHeader(value: string | null): number | undefined;
  storedConversationVerdict(stored: StoredSupportConversation, facts: WakeFacts): "keep" | "erase";
}>;
type SessionChangeModule = Readonly<{
  SESSION_CHANGE_CHANNEL: string;
  announceSessionChange(): void;
  onConversationReset(listener: (reason: ConversationResetReason) => void): () => void;
  onConversationWake(listener: () => void): () => void;
  readWakeFacts(): Promise<WakeFacts>;
  settleStoredConversation(readFacts?: () => Promise<WakeFacts>): Promise<void>;
  installSessionChangeReceiver(): () => void;
  sessionChangeGeneration(): number;
}>;

const CONVERSATION_MODULE = "../../apps/ui/components/support/conversation.js";
const SESSION_CHANGE_MODULE = "../../apps/ui/components/support/sessionChange.js";
const {
  SUPPORT_CONVERSATION_STORAGE_KEY,
  browserSupportConversationStorage,
  clearStoredSupportConversation,
  readStoredSupportConversation,
  serverTimeFromDateHeader,
  storedConversationVerdict,
  writeStoredSupportConversation
} = await import(/* @vite-ignore */ CONVERSATION_MODULE) as ConversationModule;
const {
  SESSION_CHANGE_CHANNEL,
  announceSessionChange,
  installSessionChangeReceiver,
  onConversationReset,
  onConversationWake,
  readWakeFacts,
  sessionChangeGeneration,
  settleStoredConversation
} = await import(/* @vite-ignore */ SESSION_CHANGE_MODULE) as SessionChangeModule;

function memoryStorage(): SupportConversationStorage & { raw(): string | null } {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
    raw: () => values.get(SUPPORT_CONVERSATION_STORAGE_KEY) ?? null
  };
}

const deniedDescriptors: Array<readonly [string, PropertyDescriptor | undefined]> = [];

function denyStorage(name: "sessionStorage" | "localStorage"): void {
  deniedDescriptors.push([name, Object.getOwnPropertyDescriptor(window, name)]);
  Object.defineProperty(window, name, {
    configurable: true,
    get() { throw new DOMException("denied", "SecurityError"); }
  });
}

function restoreStorage(): void {
  for (const [name, descriptor] of deniedDescriptors.splice(0).reverse()) {
    if (descriptor === undefined) delete (window as unknown as Record<string, unknown>)[name];
    else Object.defineProperty(window, name, descriptor);
  }
}

const cleanups: Array<() => void> = [];
const RealBroadcastChannel = globalThis.BroadcastChannel;

/** `globalThis.BroadcastChannel` deleted (as a browser without it), or replaced; restored in afterEach. */
function setBroadcastChannel(value: typeof BroadcastChannel | undefined): void {
  if (value === undefined) delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
  else (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = value;
}

class DeniedBroadcastChannel {
  constructor() { throw new DOMException("denied", "SecurityError"); }
}

class ClosingThrowsBroadcastChannel extends RealBroadcastChannel {
  override close(): void {
    super.close();
    throw new DOMException("denied", "SecurityError");
  }
}

class PostingThrowsBroadcastChannel extends RealBroadcastChannel {
  override postMessage(): void { throw new DOMException("denied", "SecurityError"); }
}

const wait = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

async function waitUntil(condition: () => boolean, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (condition()) return true;
    await wait(5);
  }
  return condition();
}

/** A test-side channel on the literal name (not the exported constant, so a renamed channel is caught). */
function probeChannel(): BroadcastChannel & { received: unknown[] } {
  const channel = new RealBroadcastChannel("debateai.session-change") as BroadcastChannel & { received: unknown[] };
  channel.received = [];
  channel.onmessage = (event) => { channel.received.push(event.data); };
  cleanups.push(() => channel.close());
  return channel;
}

function recordResets(): ConversationResetReason[] {
  const reasons: ConversationResetReason[] = [];
  cleanups.push(onConversationReset((reason) => { reasons.push(reason); }));
  return reasons;
}

function recordWakes(): { count: number } {
  const wakes = { count: 0 };
  cleanups.push(onConversationWake(() => { wakes.count += 1; }));
  return wakes;
}

function install(): () => void {
  let disposer: (() => void) | null = null;
  disposer = installSessionChangeReceiver();
  let disposed = false;
  const dispose = () => { if (!disposed) { disposed = true; disposer!(); } };
  cleanups.push(dispose);
  return dispose;
}

/** jsdom may lack PageTransitionEvent; the product reads only `event.persisted`. */
function pageTransition(type: "pagehide" | "pageshow", persisted = true): Event {
  if (typeof PageTransitionEvent === "function") return new PageTransitionEvent(type, { persisted });
  const event = new Event(type);
  Object.defineProperty(event, "persisted", { value: persisted });
  return event;
}

const KEY = SUPPORT_CONVERSATION_STORAGE_KEY;
const T = 1_790_768_543;

function storeTranscript(identityBound: boolean, serverTime?: number): void {
  writeStoredSupportConversation(browserSupportConversationStorage(), {
    language: "en", identityBound, messages: [{ id: "m1", role: "user", text: "old conversation" }],
    ...(serverTime === undefined ? {} : { serverTime })
  });
}

function storedText(): string | null {
  const raw = window.sessionStorage.getItem(KEY);
  return raw === null ? null : (JSON.parse(raw) as { messages: Array<{ text: string }> }).messages[0]?.text ?? "";
}

/** A new reset generation, so the per-generation memo of an earlier test cannot answer for this one. */
async function nextGeneration(): Promise<void> {
  announceSessionChange();
  await wait(20);
}

afterEach(async () => {
  restoreStorage();   // first: a test that failed while storage was denied must not deny the next one
  fetchRoute.handler = null;
  for (const cleanup of cleanups.splice(0).reverse()) {
    try { cleanup(); } catch { /* a failed test's leftovers never fail the next test */ }
  }
  setBroadcastChannel(RealBroadcastChannel);
  window.sessionStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("S04-C1 storage helper, stored value, wake verdict (S1.1-S1.4)", () => {
  it("U01 browserSupportConversationStorage() returns null when the sessionStorage getter throws SecurityError", () => {
    denyStorage("sessionStorage");
    let result: unknown = "not called";
    expect(() => { result = browserSupportConversationStorage(); }).not.toThrow();
    expect(result).toBeNull();
    restoreStorage();
    // Neighbour: with a working getter the helper still hands out the real storage.
    expect(browserSupportConversationStorage()).toBe(window.sessionStorage);
  });

  it("U02 clearStoredSupportConversation() with no argument does not throw under a throwing getter", () => {
    denyStorage("sessionStorage");
    expect(() => clearStoredSupportConversation()).not.toThrow();
    restoreStorage();
    window.sessionStorage.setItem(SUPPORT_CONVERSATION_STORAGE_KEY, "{}");
    clearStoredSupportConversation();
    expect(window.sessionStorage.getItem(SUPPORT_CONVERSATION_STORAGE_KEY)).toBeNull();
  });

  it("U03 the written value has EXACT key sets, with and without serverTime", () => {
    const without = memoryStorage();
    writeStoredSupportConversation(without, { language: "en", identityBound: true, messages: [] });
    expect(Object.keys(JSON.parse(without.raw()!)).sort()).toEqual(["identityBound", "language", "messages"]);
    const withTime = memoryStorage();
    writeStoredSupportConversation(withTime, {
      language: "en", identityBound: true, messages: [], serverTime: 1790768543
    });
    const parsed = JSON.parse(withTime.raw()!);
    expect(Object.keys(parsed).sort()).toEqual(["identityBound", "language", "messages", "serverTime"]);
    expect(parsed.serverTime).toBe(1790768543);
  });

  it("U04 a serverTime that is not a non-negative safe integer is not written", () => {
    for (const bad of [1.5, -1, "x"] as const) {
      const storage = memoryStorage();
      writeStoredSupportConversation(storage, {
        language: "en", identityBound: true, messages: [], serverTime: bad as unknown as number
      });
      expect(Object.keys(JSON.parse(storage.raw()!)).sort(), `serverTime ${String(bad)}`)
        .toEqual(["identityBound", "language", "messages"]);
    }
  });

  it("U05 the reader round-trips serverTime, and refuses (and erases) an invalid one", () => {
    const storage = memoryStorage();
    writeStoredSupportConversation(storage, {
      language: "en", identityBound: true,
      messages: [{ id: "m1", role: "user", text: "hello" }], serverTime: 1790768543
    });
    expect(readStoredSupportConversation(storage)).toEqual({
      language: "en", identityBound: true,
      messages: [{ id: "m1", role: "user", text: "hello" }], serverTime: 1790768543
    });
    const plain = memoryStorage();
    writeStoredSupportConversation(plain, { language: "en", identityBound: false, messages: [] });
    const read = readStoredSupportConversation(plain);
    expect(read).toEqual({ language: "en", identityBound: false, messages: [] });
    expect(read !== null && Object.hasOwn(read, "serverTime")).toBe(false);
    for (const bad of [1.5, -1, "x"]) {
      const refused = memoryStorage();
      refused.setItem(SUPPORT_CONVERSATION_STORAGE_KEY, JSON.stringify({
        language: "en", identityBound: true, messages: [], serverTime: bad
      }));
      expect(readStoredSupportConversation(refused), `serverTime ${String(bad)}`).toBeNull();
      expect(refused.raw(), `serverTime ${String(bad)} left behind`).toBeNull();
    }
  });

  it("U06 serverTimeFromDateHeader floors the HTTP date to whole seconds", () => {
    expect(serverTimeFromDateHeader("Wed, 30 Sep 2026 11:42:23 GMT")).toBe(1790768543);
    expect(serverTimeFromDateHeader(null)).toBeUndefined();
    expect(serverTimeFromDateHeader("not a date")).toBeUndefined();
    expect(serverTimeFromDateHeader("Thu, 01 Jan 1970 00:00:00 GMT")).toBe(0);
  });

  it("U07 the r02-cases table gives the same verdict at client clock 0, +600 s and -600 s", () => {
    // slices/S04/checks/r02-cases.py scenarios(): t = 1000 s; created = t+30 after a change, t-600 without one.
    const t = 1000;
    const rows: ReadonlyArray<readonly [string, boolean, boolean, "erase" | "keep"]> = [
      // label, written signed in, signed in now, expected   (row 4 — out/change/out — is (d): not asserted)
      ["1 in/change/in", true, true, "erase"],
      ["2 in/change/out", true, false, "erase"],
      ["3 out/change/in", false, true, "erase"],
      ["5 in/no-change/in", true, true, "keep"],
      ["6 out/no-change/out", false, false, "keep"]
    ];
    const created: Record<string, number | null> = {
      "1 in/change/in": (t + 30) * 1000, "2 in/change/out": null, "3 out/change/in": (t + 30) * 1000,
      "5 in/no-change/in": (t - 600) * 1000, "6 out/no-change/out": null
    };
    vi.useFakeTimers();
    let asserted = 0;
    for (const offset of [0, 600_000, -600_000]) {
      vi.setSystemTime(t * 1000 + offset);
      for (const [label, written, now, expected] of rows) {
        const stored: StoredSupportConversation = {
          language: "en", identityBound: written, messages: [{ id: "m", role: "user", text: "x" }],
          ...(written ? { serverTime: t } : {})
        };
        const facts: WakeFacts = { signedIn: now, currentSessionStartedAtMs: created[label]! };
        expect(storedConversationVerdict(stored, facts), `row ${label} clock ${offset}`).toBe(expected);
        asserted += 1;
      }
    }
    expect(asserted).toBe(15);
  });

  it("U08 a signed-in transcript with no serverTime, read while signed in, is erased", () => {
    expect(storedConversationVerdict(
      { language: "en", identityBound: true, messages: [] },
      { signedIn: true, currentSessionStartedAtMs: 1 }
    )).toBe("erase");
  });

  it("U09 a signed-in transcript is erased when the current session's start is unknown", () => {
    expect(storedConversationVerdict(
      { language: "en", identityBound: true, messages: [], serverTime: 1000 },
      { signedIn: true, currentSessionStartedAtMs: null }
    )).toBe("erase");
  });
});

describe("S04-C1 the session-change signal (S1.5-S1.7)", () => {
  it("U10 announceSessionChange() posts EXACT {type:'session-change'} on debateai.session-change and resets in-page listeners", async () => {
    expect(SESSION_CHANGE_CHANNEL).toBe("debateai.session-change");
    const probe = probeChannel();
    const resets = recordResets();
    announceSessionChange();
    expect(resets).toEqual(["session-change"]);
    expect(await waitUntil(() => probe.received.length > 0, 1000)).toBe(true);
    expect(probe.received).toStrictEqual([{ type: "session-change" }]);

    // Rework 2 (C3 F1, C2 F1-C2): with this page's own receiver installed (the layout guard), the announcing page
    // resets ONCE — its receiver must not hear the page's own announcement — while the other tabs still hear
    // exactly one message per announcement, and a message from another tab still resets this page.
    const dispose = install();
    probe.received.length = 0;
    resets.length = 0;
    storeTranscript(false);
    announceSessionChange();
    expect(await waitUntil(() => probe.received.length > 0, 1000)).toBe(true);
    await wait(60);
    expect(resets, "the announcing page resets once").toEqual(["session-change"]);
    expect(probe.received, "the other tabs hear one message").toStrictEqual([{ type: "session-change" }]);
    expect(storedText(), "the announcement leaves the erase to its caller (E1-E7)").toBe("old conversation");
    announceSessionChange();
    expect(await waitUntil(() => probe.received.length > 1, 1000)).toBe(true);
    await wait(60);
    expect(resets, "every announcement, once each").toEqual(["session-change", "session-change"]);
    expect(probe.received).toStrictEqual([{ type: "session-change" }, { type: "session-change" }]);
    probe.postMessage({ type: "session-change" });
    expect(await waitUntil(() => window.sessionStorage.getItem(KEY) === null, 100), "another tab still erases").toBe(true);
    expect(resets).toEqual(["session-change", "session-change", "session-change"]);
    // A receiver that slept (channel closed) or was disposed is no route: the announcement still reaches the others.
    window.dispatchEvent(pageTransition("pagehide"));
    probe.received.length = 0;
    announceSessionChange();
    expect(await waitUntil(() => probe.received.length > 0, 1000), "announced while this receiver sleeps").toBe(true);
    window.dispatchEvent(pageTransition("pageshow"));
    dispose();
    probe.received.length = 0;
    announceSessionChange();
    expect(await waitUntil(() => probe.received.length > 0, 1000), "announced after the receiver is gone").toBe(true);
    expect(probe.received).toStrictEqual([{ type: "session-change" }]);
  });

  it("U11 announceSessionChange() never throws: BroadcastChannel deleted, throwing constructor, throwing post, throwing close", () => {
    const resets = recordResets();
    const variants: ReadonlyArray<readonly [string, typeof BroadcastChannel | undefined]> = [
      ["deleted", undefined],
      ["constructor throws", DeniedBroadcastChannel as unknown as typeof BroadcastChannel],
      ["postMessage throws", PostingThrowsBroadcastChannel],
      ["close throws", ClosingThrowsBroadcastChannel]
    ];
    for (const [name, value] of variants) {
      setBroadcastChannel(value);
      expect(() => announceSessionChange(), name).not.toThrow();
    }
    expect(resets).toEqual(["session-change", "session-change", "session-change", "session-change"]);
  });

  it("U12 the receiver erases the key and resets on EXACT {type:'session-change'} only, and stops after its disposer", async () => {
    const dispose = install();
    const resets = recordResets();
    const sender = probeChannel();
    storeTranscript(false);
    sender.postMessage({ type: "session-change" });
    expect(await waitUntil(() => window.sessionStorage.getItem(KEY) === null, 100)).toBe(true);
    expect(resets).toEqual(["session-change"]);
    for (const other of [{ type: "other" }, { type: "session-change", account: "x" }, "session-change", null]) {
      storeTranscript(false);
      sender.postMessage(other);
      await wait(60);
      expect(storedText(), JSON.stringify(other)).toBe("old conversation");
    }
    expect(resets).toEqual(["session-change"]);
    dispose();
    sender.postMessage({ type: "session-change" });
    await wait(60);
    expect(storedText()).toBe("old conversation");
    expect(resets).toEqual(["session-change"]);
  });

  it("U13 pagehide/freeze reset with 'sleep' and close the channel; pageshow/resume bump the generation, wake, and reopen", async () => {
    install();
    const resets = recordResets();
    const wakes = recordWakes();
    const sender = probeChannel();
    storeTranscript(false);
    window.dispatchEvent(pageTransition("pagehide", false));
    expect(resets).toEqual([]);
    window.dispatchEvent(pageTransition("pagehide"));
    expect(resets).toEqual(["sleep"]);
    sender.postMessage({ type: "session-change" });
    await wait(60);
    expect(storedText(), "a closed channel erases nothing").toBe("old conversation");
    const afterSleep = sessionChangeGeneration();
    window.dispatchEvent(pageTransition("pageshow"));
    expect(sessionChangeGeneration()).toBe(afterSleep + 1);
    expect(wakes.count).toBe(1);
    sender.postMessage({ type: "session-change" });
    expect(await waitUntil(() => window.sessionStorage.getItem(KEY) === null, 100), "reopened").toBe(true);
    const beforeFreeze = sessionChangeGeneration();
    document.dispatchEvent(new Event("freeze"));
    expect(resets.at(-1)).toBe("sleep");
    expect(sessionChangeGeneration()).toBe(beforeFreeze + 1);
    document.dispatchEvent(new Event("resume"));
    expect(sessionChangeGeneration()).toBe(beforeFreeze + 2);
    expect(wakes.count).toBe(2);
  });

  it("U14 one gate per reset generation: two settles call the facts once, a wake re-arms it, nothing stored calls nothing, and no gate begins while asleep", async () => {
    install();
    await nextGeneration();
    const facts = vi.fn(async (): Promise<WakeFacts> => ({ signedIn: false, currentSessionStartedAtMs: null }));
    await settleStoredConversation(facts);
    expect(facts, "nothing stored").toHaveBeenCalledTimes(0);
    document.dispatchEvent(new Event("resume"));
    storeTranscript(false);
    await Promise.all([settleStoredConversation(facts), settleStoredConversation(facts)]);
    expect(facts).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event("resume"));
    await settleStoredConversation(facts);
    expect(facts).toHaveBeenCalledTimes(2);
    // N4-p3: "no fetch while asleep" means no gate BEGINS while asleep — the guard settles on wake, never on sleep.
    cleanups.push(onConversationWake(() => { void settleStoredConversation(facts); }));
    window.dispatchEvent(pageTransition("pagehide"));
    document.dispatchEvent(new Event("freeze"));
    await wait(20);
    expect(facts, "asleep").toHaveBeenCalledTimes(2);
    document.dispatchEvent(new Event("resume"));
    await wait(20);
    expect(facts, "woken").toHaveBeenCalledTimes(3);
    expect(storedText()).toBe("old conversation");
  });

  it("U15 the gate erases a signed-in transcript older than the current session and keeps a newer one; readWakeFacts reads both facts", async () => {
    storeTranscript(true, T);
    await nextGeneration();
    await settleStoredConversation(async () => ({ signedIn: true, currentSessionStartedAtMs: (T + 30) * 1000 }));
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
    storeTranscript(true, T);
    await nextGeneration();
    await settleStoredConversation(async () => ({ signedIn: true, currentSessionStartedAtMs: (T - 600) * 1000 }));
    expect(storedText()).toBe("old conversation");

    const calls: string[] = [];
    const json = (body: unknown) => new Response(JSON.stringify(body), {
      status: 200, headers: { "content-type": "application/json" }
    });
    const sessionList = { sessions: [
      { session_id: "22222222-2222-4222-8222-222222222222", created_at: "2026-09-30T10:00:00.000Z",
        last_seen_at: "2026-09-30T10:00:00.000Z", idle_expires_at: "2026-10-14T10:00:00.000Z",
        absolute_expires_at: "2026-12-29T10:00:00.000Z", last_mfa_at: "2026-09-30T10:00:00.000Z", current: false },
      { session_id: "11111111-1111-4111-8111-111111111111", created_at: "2026-09-30T11:42:53.000Z",
        last_seen_at: "2026-09-30T11:42:53.000Z", idle_expires_at: "2026-10-14T11:42:53.000Z",
        absolute_expires_at: "2026-12-29T11:42:53.000Z", last_mfa_at: "2026-09-30T11:42:53.000Z", current: true }
    ] };
    let signedIn = true;
    fetchRoute.handler = async (url) => {
      calls.push(url);
      if (url === "/api/v1/session") return signedIn ? json({}) : new Response("{}", { status: 401 });
      if (url === "/api/v1/auth/sessions") return json(sessionList);
      throw new Error(`UNEXPECTED_FETCH:${url}`);
    };
    expect(await readWakeFacts()).toEqual({ signedIn: true, currentSessionStartedAtMs: 1_790_768_573_000 });
    expect(calls).toEqual(["/api/v1/session", "/api/v1/auth/sessions"]);
    signedIn = false;
    calls.length = 0;
    expect(await readWakeFacts()).toEqual({ signedIn: false, currentSessionStartedAtMs: null });
    expect(calls, "no session list while signed out").toEqual(["/api/v1/session"]);
  });

  it("U16 facts that cannot be read: the settle resolves, a signed-in transcript is erased, a signed-out one is kept", async () => {
    storeTranscript(true, T);
    await nextGeneration();
    await expect(settleStoredConversation(async () => { throw new Error("offline"); })).resolves.toBeUndefined();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
    storeTranscript(false);
    await nextGeneration();
    await expect(settleStoredConversation(() => Promise.reject(new TypeError("Failed to fetch")))).resolves.toBeUndefined();
    expect(storedText()).toBe("old conversation");
  });

  it("U17 with BroadcastChannel deleted the receiver installs, still sleeps and wakes, and disposes without throwing", () => {
    setBroadcastChannel(undefined);
    let dispose: (() => void) | null = null;
    expect(() => { dispose = installSessionChangeReceiver(); }).not.toThrow();
    const resets = recordResets();
    const wakes = recordWakes();
    window.dispatchEvent(pageTransition("pagehide"));
    expect(resets).toEqual(["sleep"]);
    window.dispatchEvent(pageTransition("pageshow"));
    expect(wakes.count).toBe(1);
    expect(() => dispose!()).not.toThrow();
    window.dispatchEvent(pageTransition("pagehide"));
    expect(resets, "listeners removed by the disposer").toEqual(["sleep"]);
  });

  it("U18 a throwing constructor, then a throwing close(): install, sleep, wake and dispose never throw; a failed open is retried at the next wake", async () => {
    for (const [name, value] of [
      ["constructor throws", DeniedBroadcastChannel as unknown as typeof BroadcastChannel],
      ["close throws", ClosingThrowsBroadcastChannel]
    ] as const) {
      setBroadcastChannel(value);
      const resets = recordResets();
      const wakes = recordWakes();
      let dispose: (() => void) | null = null;
      expect(() => { dispose = installSessionChangeReceiver(); }, `${name}: install`).not.toThrow();
      expect(() => window.dispatchEvent(pageTransition("pagehide")), `${name}: pagehide`).not.toThrow();
      expect(() => window.dispatchEvent(pageTransition("pageshow")), `${name}: pageshow`).not.toThrow();
      expect(resets, name).toEqual(["sleep"]);
      expect(wakes.count, name).toBe(1);
      if (name === "constructor throws") {
        setBroadcastChannel(RealBroadcastChannel);
        window.dispatchEvent(pageTransition("pageshow"));
        const sender = probeChannel();
        storeTranscript(false);
        sender.postMessage({ type: "session-change" });
        expect(await waitUntil(() => window.sessionStorage.getItem(KEY) === null, 100), "retry at wake").toBe(true);
      }
      expect(() => dispose!(), `${name}: dispose`).not.toThrow();
      setBroadcastChannel(RealBroadcastChannel);
    }
  });

  it("U19 a settle begun before a wake applies nothing when its facts land after it; a settle begun after the wake decides", async () => {
    await nextGeneration();
    install();
    storeTranscript(true, T);
    let release: (() => void) | null = null;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const requests: string[] = [];
    const early = settleStoredConversation(async () => {
      requests.push("session");
      await held;
      requests.push("sessions");   // N4-p3: the in-flight second request may still go out; its result is dropped
      return { signedIn: false, currentSessionStartedAtMs: null };
    });
    await wait(0);
    document.dispatchEvent(new Event("resume"));
    release!();
    await early;
    expect(requests).toEqual(["session", "sessions"]);
    expect(storedText(), "stale erase facts applied nothing").toBe("old conversation");
    await settleStoredConversation(async () => ({ signedIn: true, currentSessionStartedAtMs: (T - 600) * 1000 }));
    expect(storedText(), "fresh keep facts keep").toBe("old conversation");
    document.dispatchEvent(new Event("resume"));
    await settleStoredConversation(async () => ({ signedIn: false, currentSessionStartedAtMs: null }));
    expect(window.sessionStorage.getItem(KEY), "fresh erase facts erase").toBeNull();
  });
});
