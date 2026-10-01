// @vitest-environment jsdom

/**
 * S04-C3 (cookie-compliance, PLAN S3.1-S3.5): the help panel follows a session change made in another tab, parks
 * when the page sleeps and decides on wake, drops replies that land after a reset, stores the server time of the
 * latest support response, and the layout guard covers a tab with no panel. A01-A14, one `it` each; the names are
 * what the cluster command counts (14/14).
 *
 * Markers are plain words: the panel redacts token-like text as `[REDACTED_SECRET_LIKE]` (C4 F1).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Component, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `apps/ui/lib/api.ts` binds `fetch` when the module loads (C1 F5), and `readWakeFacts` reads the session list
 * through it, so the route table is installed before any module loads (as U15 does).
 */
const fetchRoute = vi.hoisted(() => {
  const state: { handler: ((url: string, init?: RequestInit) => Promise<Response>) | null } = { handler: null };
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => state.handler === null
    ? original(input, init) : state.handler(String(input), init)) as typeof fetch;
  return state;
});

import { Assistant } from "../../apps/ui/components/support/Assistant.js";
import { SupportConversationGuard } from "../../apps/ui/components/support/SupportConversationGuard.js";
import {
  SUPPORT_CONVERSATION_STORAGE_KEY,
  clearStoredSupportConversation,
  writeStoredSupportConversation
} from "../../apps/ui/components/support/conversation.js";
import {
  SESSION_CHANGE_CHANNEL,
  announceSessionChange,
  installSessionChangeReceiver,
  onConversationReset
} from "../../apps/ui/components/support/sessionChange.js";

const KEY = SUPPORT_CONVERSATION_STORAGE_KEY;
/** The UI server's `Date` header on every stub response, and the whole seconds it names. */
const DATE = "Wed, 30 Sep 2026 11:42:23 GMT";
const T = 1_790_768_543;
const OLD = "lantern orchard question";
const REPLY = "meadow river answer";
const CASE_TOKEN = `${"Abcdefghij".repeat(4)}abc`;
const ASSISTANT_SOURCE = resolve(import.meta.dirname, "../../apps/ui/components/support/Assistant.tsx");
const LAYOUT_SOURCE = resolve(import.meta.dirname, "../../apps/ui/app/layout.tsx");

type Lifecycle = "awake" | "asleep";
type Call = Readonly<{ url: string; method: string; lifecycle: Lifecycle }>;
type Deferred = { promise: Promise<void>; release: () => void };

/** The page's state as the test drives it: "asleep" from just before the sleep event to just before the first wake. */
let lifecycle: Lifecycle = "awake";

function deferred(): Deferred {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json", date: DATE }
  });
}

function sessionList(createdAtSec: number) {
  const at = new Date(createdAtSec * 1000).toISOString();
  return { sessions: [{
    session_id: "11111111-1111-4111-8111-111111111111", created_at: at, last_seen_at: at,
    idle_expires_at: "2026-10-14T11:42:53.000Z", absolute_expires_at: "2026-12-29T11:42:53.000Z",
    last_mfa_at: at, current: true
  }] };
}

type Api = {
  signedIn: boolean;
  /** `created_at` of the current session, whole seconds: T-600 keeps the stored transcript, T+30 erases it. */
  createdAtSec: number;
  calls: Call[];
  /** When set, the next `/api/v1/auth/sessions` answer waits for it (then it is cleared). */
  holdSessions: Deferred | null;
  /** When set, the next messages answer waits for it (then it is cleared). */
  holdMessage: Deferred | null;
  /** Queued with `setTimeout(0)` from the resolution of the FIRST `/api/v1/session` request (A04 check 5). */
  afterFirstIdentity: (() => void) | null;
  supportSessions: number;
};

function installApi(overrides: Partial<Pick<Api, "signedIn" | "createdAtSec">> = {}): Api {
  const api: Api = {
    signedIn: true, createdAtSec: T - 600, calls: [], holdSessions: null, holdMessage: null,
    afterFirstIdentity: null, supportSessions: 0, ...overrides
  };
  let identityRequests = 0;
  fetchRoute.handler = (url, init) => {
    api.calls.push(Object.freeze({ url, method: init?.method ?? "GET", lifecycle }));
    if (url === "/api/v1/session") {
      const answer = Promise.resolve(api.signedIn ? json({}) : json({ error: "SESSION_REQUIRED" }, 401));
      identityRequests += 1;
      const after = api.afterFirstIdentity;
      if (identityRequests === 1 && after !== null) void answer.then(() => { setTimeout(after, 0); });
      return answer;
    }
    if (url === "/api/v1/auth/sessions") {
      const hold = api.holdSessions;
      api.holdSessions = null;
      const createdAtSec = api.createdAtSec;
      return (hold === null ? Promise.resolve() : hold.promise)
        .then(() => json(sessionList(hold === null ? createdAtSec : api.createdAtSec)));
    }
    if (url === "/api/v1/support/status") {
      return Promise.resolve(json({
        configuration: { kind: "AVAILABLE" }, relay_state: "AVAILABLE", kb_loaded: { shipped: 12, ignored: 0 }
      }));
    }
    if (url === "/api/v1/support/sessions") {
      api.supportSessions += 1;
      return Promise.resolve(json({
        session: { session_id: `support-${api.supportSessions}`, identity_bound: api.signedIn },
        session_token: "t".repeat(43)
      }, 201));
    }
    const message = /^\/api\/v1\/support\/sessions\/(support-\d+)\/messages$/u.exec(url);
    if (message !== null) {
      const hold = api.holdMessage;
      api.holdMessage = null;
      return (hold === null ? Promise.resolve() : hold.promise)
        .then(() => json({ message_id: `answer-${message[1]}`, outcome: "NO_SOURCE", text: REPLY }));
    }
    if (/^\/api\/v1\/support\/sessions\/support-\d+\/escalate$/u.test(url)) {
      return Promise.resolve(json({ case_token: CASE_TOKEN, text: "case opened words" }));
    }
    return Promise.reject(new Error(`UNEXPECTED_FETCH:${url}`));
  };
  return api;
}

function storeTranscript(text: string, identityBound: boolean, serverTime?: number): void {
  writeStoredSupportConversation(window.sessionStorage, {
    language: "en", identityBound,
    messages: [{ id: "user-0", role: "user", text }],
    ...(serverTime === undefined ? {} : { serverTime })
  });
}

function storedRaw(): string | null {
  return window.sessionStorage.getItem(KEY);
}

/** The key holds no message: absent, or an empty transcript (the panel writes `messages: []` once it settles). */
function keyHoldsNoMessage(): boolean {
  const raw = storedRaw();
  return raw === null || (JSON.parse(raw) as { messages: unknown[] }).messages.length === 0;
}

function persisted(type: "pagehide" | "pageshow"): Event {
  const event = new Event(type);
  Object.defineProperty(event, "persisted", { value: true });
  return event;
}

/** Another tab of the same browser announcing a session change. */
function announceFromAnotherTab(): void {
  const other = new BroadcastChannel(SESSION_CHANGE_CHANNEL);
  other.postMessage({ type: "session-change" });
  other.close();
}

const roots: Root[] = [];

function container(): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  return host;
}

async function mountInto(host: HTMLElement, node: ReactNode): Promise<HTMLElement> {
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return host;
}

async function mount(node: ReactNode): Promise<HTMLElement> {
  return mountInto(container(), node);
}

async function unmountAll(): Promise<void> {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.replaceChildren();
}

async function pause(ms: number): Promise<void> {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
}

async function until(condition: () => boolean, ms = 2000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (condition()) return true;
    await pause(5);
  }
  return condition();
}

/** Records whether `needle` was ever rendered under `target`, including text added and removed between checks. */
function watchText(target: Node, needle: string): { seen: () => boolean; stop: () => void } {
  let seen = (target.textContent ?? "").includes(needle);
  const holds = (node: Node | null) => node !== null && (node.textContent ?? "").includes(needle);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "characterData" && holds(record.target)) seen = true;
      for (const added of record.addedNodes) if (holds(added)) seen = true;
    }
    if (holds(target)) seen = true;
  });
  observer.observe(target, { subtree: true, childList: true, characterData: true });
  return { seen: () => { observer.takeRecords().forEach((record) => {
    if (record.type === "characterData" && holds(record.target)) seen = true;
    for (const added of record.addedNodes) if (holds(added)) seen = true;
  }); return seen; }, stop: () => observer.disconnect() };
}

async function send(host: HTMLElement, text: string): Promise<void> {
  const input = host.querySelector<HTMLInputElement>('input[name="support-message"]');
  expect(input, "the panel rendered its composer").not.toBeNull();
  await act(async () => {
    input!.value = text;
    input!.form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

function requestsWhileAsleep(api: Api, ...urls: string[]): Call[] {
  return api.calls.filter((call) => call.lifecycle === "asleep" && urls.includes(call.url));
}

async function dispatchSleep(...events: ReadonlyArray<"pagehide" | "freeze">): Promise<void> {
  lifecycle = "asleep";
  for (const type of events) {
    await act(async () => {
      if (type === "pagehide") window.dispatchEvent(persisted("pagehide"));
      else document.dispatchEvent(new Event("freeze"));
    });
  }
}

async function dispatchWake(...events: ReadonlyArray<"pageshow" | "resume">): Promise<void> {
  lifecycle = "awake";
  for (const type of events) {
    await act(async () => {
      if (type === "pageshow") window.dispatchEvent(persisted("pageshow"));
      else document.dispatchEvent(new Event("resume"));
    });
  }
}

/**
 * A04/A05 checks 1-4 for one sleep/wake order. `flip` moves the facts to erase facts (X out, Y in) while asleep;
 * without it nothing changed and the transcript comes back.
 */
async function sleepWakeRun(
  sleep: ReadonlyArray<"pagehide" | "freeze">, wake: ReadonlyArray<"pageshow" | "resume">, flip: boolean
): Promise<void> {
  await unmountAll();
  window.sessionStorage.clear();
  announceSessionChange();
  const api = installApi();
  storeTranscript(OLD, true, T);
  await mount(<SupportConversationGuard />);
  const panel = await mount(<Assistant fullPage />);
  expect(await until(() => (panel.textContent ?? "").includes(OLD)), "kept at mount").toBe(true);
  if (!flip) {
    // a case opened before the sleep: its code lives in memory only, and the sleep drops it with the transcript
    await act(async () => { panel.querySelector<HTMLButtonElement>(".supportEscalation button")!.click(); });
    expect(await until(() => panel.querySelector('a[href^="/help#case="]') !== null), "a live case link").toBe(true);
    expect(await until(() => (storedRaw() ?? "").includes("caseOpened")), "the notice is stored").toBe(true);
  }

  // check 1: parked at once, and no gate begins while asleep
  await dispatchSleep(...sleep);
  expect(panel.textContent, "0 messages rendered at once").not.toContain(OLD);
  await pause(100);
  expect(requestsWhileAsleep(api, "/api/v1/session", "/api/v1/auth/sessions"), "no request until the wake")
    .toEqual([]);
  expect(panel.textContent).not.toContain(OLD);

  if (flip) {
    // check 2: X signed out and Y signed in while this tab slept
    api.createdAtSec = T + 30;
    // check 3: from the wake on, X's text is never rendered, and the stored copy goes
    const fromWake = watchText(panel, OLD);
    await dispatchWake(...wake);
    expect(panel.textContent, "at the wake").not.toContain(OLD);
    expect(await until(() => !(storedRaw() ?? "").includes(OLD)), "the stored copy is erased").toBe(true);
    await pause(100);
    expect(fromWake.seen(), "never rendered from the wake on").toBe(false);
    expect(keyHoldsNoMessage()).toBe(true);
    fromWake.stop();
  } else {
    // check 4: nothing changed, the transcript comes back
    await dispatchWake(...wake);
    expect(await until(() => (panel.textContent ?? "").includes(OLD)), "kept after the wake").toBe(true);
    expect(storedRaw()).toContain(OLD);
    expect(panel.querySelector('a[href^="/help#case="]'), "the case code did not survive the sleep").toBeNull();
  }
}

class Boundary extends Component<{ children: ReactNode; onError: (error: unknown) => void }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override componentDidCatch(error: unknown) { this.props.onError(error); }
  override render() { return this.state.failed ? <p>boundary</p> : this.props.children; }
}

const RealBroadcastChannel = globalThis.BroadcastChannel;
const deniedDescriptors: Array<readonly [string, PropertyDescriptor | undefined]> = [];

function denyStorage(name: "sessionStorage" | "localStorage"): void {
  deniedDescriptors.push([name, Object.getOwnPropertyDescriptor(window, name)]);
  Object.defineProperty(window, name, {
    configurable: true,
    get() { throw new DOMException("denied", "SecurityError"); }
  });
}

describe("S04-C3 the help panel and the layout guard follow a session change", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    lifecycle = "awake";
    window.sessionStorage.clear();
    // A page load starts a fresh module, so a fresh reset generation; in one test file the module is shared, so
    // each case moves the generation once (nothing listens yet) and the settle memo of the last case is not reused.
    announceSessionChange();
  });

  afterEach(async () => {
    try {
      await unmountAll();
    } finally {
      for (const [name, descriptor] of deniedDescriptors.splice(0).reverse()) {
        if (descriptor === undefined) delete (window as unknown as Record<string, unknown>)[name];
        else Object.defineProperty(window, name, descriptor);
      }
      globalThis.BroadcastChannel = RealBroadcastChannel;
      fetchRoute.handler = null;
      vi.useRealTimers();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      window.sessionStorage.clear();
    }
  });

  it("A01 an announcement from another tab empties the full-page and the compact panel, the key and the case link", async () => {
    installApi();
    storeTranscript(OLD, true, T);
    await mount(<SupportConversationGuard />);
    const full = await mount(<Assistant fullPage />);
    const compact = await mount(<Assistant />);
    expect(await until(() => (full.textContent ?? "").includes(OLD) && (compact.textContent ?? "").includes(OLD)),
      "both panels show the old conversation").toBe(true);
    const escalate = full.querySelector<HTMLButtonElement>(".supportEscalation button");
    await act(async () => { escalate!.click(); });
    expect(await until(() => full.querySelector('a[href^="/help#case="]') !== null), "a live case link").toBe(true);

    const startedAt = Date.now();
    announceFromAnotherTab();
    const cleared = await until(() => !(full.textContent ?? "").includes(OLD)
      && !(compact.textContent ?? "").includes(OLD)
      && full.querySelector('a[href^="/help#case="]') === null
      && document.querySelector('a[href^="/help#case="]') === null
      && keyHoldsNoMessage(), 2000);
    expect(cleared, "cleared within 2000 ms").toBe(true);
    expect(Date.now() - startedAt).toBeLessThan(2000);
    expect(storedRaw() ?? "").not.toContain(OLD);
  });

  it("A02 after the erase the next message opens a new support session and posts to it", async () => {
    const api = installApi();
    await mount(<SupportConversationGuard />);
    const panel = await mount(<Assistant fullPage />);
    await until(() => api.calls.some((call) => call.url === "/api/v1/session"));
    await send(panel, OLD);
    expect(await until(() => (panel.textContent ?? "").includes(REPLY)), "the first reply").toBe(true);

    announceFromAnotherTab();
    expect(await until(() => !(panel.textContent ?? "").includes(OLD)), "reset").toBe(true);
    await pause(50);
    await send(panel, "willow harbor note");
    expect(await until(() => (panel.textContent ?? "").includes(REPLY)), "the second reply").toBe(true);

    const opened = api.calls.filter((call) => call.url === "/api/v1/support/sessions");
    const posts = api.calls.filter((call) => call.url.endsWith("/messages"));
    expect(opened).toHaveLength(2);
    expect(posts.map((call) => call.url)).toEqual([
      "/api/v1/support/sessions/support-1/messages",
      "/api/v1/support/sessions/support-2/messages"
    ]);
  });

  it("A03 a reply that lands after the announcement is dropped, and the composer is usable again", async () => {
    const api = installApi();
    await mount(<SupportConversationGuard />);
    const panel = await mount(<Assistant fullPage />);
    await until(() => api.calls.some((call) => call.url === "/api/v1/session"));
    const held = deferred();
    api.holdMessage = held;
    await send(panel, OLD);
    expect(await until(() => api.calls.some((call) => call.url.endsWith("/messages"))), "the message is in flight")
      .toBe(true);

    announceFromAnotherTab();
    expect(await until(() => !(panel.textContent ?? "").includes(OLD)), "reset").toBe(true);
    held.release();
    await pause(2000);
    expect(panel.textContent).not.toContain(REPLY);
    expect(keyHoldsNoMessage()).toBe(true);
    expect(storedRaw() ?? "").not.toContain(REPLY);
    const sendButton = panel.querySelector<HTMLButtonElement>("button.supportSend");
    expect(sendButton?.disabled, "the composer is not left busy").toBe(false);
  });

  it("A04 a tab that sleeps through a session change parks at once and decides on facts read after the wake", async () => {
    // checks 1-3: the facts change between sleep and wake
    await sleepWakeRun(["pagehide"], ["pageshow"], true);
    // check 4: nothing changed, the transcript comes back
    await sleepWakeRun(["pagehide"], ["pageshow"], false);

    // check 5 (i), deterministic (N1-p3): the sleep branch parks before flushSync, and the restore effect returns
    // while parked
    // comments stripped, so a commented-out guard does not count
    const source = readFileSync(ASSISTANT_SOURCE, "utf8")
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .replace(/^\s*\/\/.*$/gmu, "");
    const sleepBranch = source.indexOf('reason === "sleep"');
    expect(sleepBranch, "the sleep branch").toBeGreaterThan(-1);
    const parks = source.indexOf("parkedRef.current = true", sleepBranch);
    const flush = source.indexOf("flushSync(", sleepBranch);
    expect(parks, "parkedRef.current = true in the sleep branch").toBeGreaterThan(-1);
    expect(flush, "flushSync( in the sleep branch").toBeGreaterThan(-1);
    expect(parks, "the ref is set before flushSync").toBeLessThan(flush);
    const gate = source.indexOf("settleStoredConversation()");
    const restoreEffect = source.lastIndexOf("useEffect(", gate);
    expect(gate, "the restore effect runs the gate").toBeGreaterThan(-1);
    expect(source.slice(restoreEffect, gate), "the restore effect returns while parked")
      .toMatch(/if \(parkedRef\.current\) return;/u);

    // check 5 (ii), the timing variant (N1-p3, N4-p3): panel only, no guard, outside act; the sleep is queued with
    // setTimeout(0) from the identity request's resolution, so it lands between the identity commit and its effects
    await unmountAll();
    window.sessionStorage.clear();
    announceSessionChange();
    const api = installApi();
    storeTranscript(OLD, true, T);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", false);
    const disposeReceiver = installSessionChangeReceiver();
    let sleptAt = -1;
    api.afterFirstIdentity = () => {
      lifecycle = "asleep";
      sleptAt = Date.now();
      window.dispatchEvent(persisted("pagehide"));
    };
    const host = container();
    const root = createRoot(host);
    try {
      root.render(<Assistant fullPage />);
      const realWait = (ms: number) => new Promise((done) => setTimeout(done, ms));
      for (let waited = 0; sleptAt < 0 && waited < 2000; waited += 5) await realWait(5);
      expect(sleptAt, "the sleep landed").toBeGreaterThan(-1);
      await realWait(50);
      const asleepText = host.textContent ?? "";
      api.createdAtSec = T + 30;
      lifecycle = "awake";
      window.dispatchEvent(persisted("pageshow"));
      const rightAfterWake = host.textContent ?? "";
      await realWait(0);
      const afterWakeTurn = host.textContent ?? "";
      const gatesBegunAsleep = requestsWhileAsleep(api, "/api/v1/session");
      await realWait(200);
      expect(asleepText, "50 ms after pagehide").not.toContain(OLD);
      expect(rightAfterWake, "right after pageshow").not.toContain(OLD);
      expect(afterWakeTurn, "one turn after pageshow").not.toContain(OLD);
      expect(gatesBegunAsleep, "no gate begins while asleep (keyed on the identity request)").toEqual([]);
      expect(host.textContent).not.toContain(OLD);
    } finally {
      root.unmount();
      disposeReceiver();
      vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    }

    // check 6, the settling variant (N2-p2): a sleep while the gate is settling never writes an empty transcript
    window.sessionStorage.clear();
    announceSessionChange();
    const settling = installApi();
    storeTranscript(OLD, true, T);
    const held = deferred();
    settling.holdSessions = held;
    const writes: Array<readonly [Lifecycle, string]> = [];
    const realSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === KEY) writes.push([lifecycle, value]);
      realSetItem.call(this, key, value);
    });
    await mount(<SupportConversationGuard />);
    const panel = await mount(<Assistant fullPage />);
    expect(await until(() => settling.calls.some((call) => call.url === "/api/v1/auth/sessions")), "settling")
      .toBe(true);
    await dispatchSleep("pagehide");
    held.release();
    await pause(100);
    const emptyWhileAsleep = writes.filter(([state, value]) => state === "asleep"
      && (JSON.parse(value) as { messages: unknown[] }).messages.length === 0);
    expect(emptyWhileAsleep, "never messages: [] while asleep").toEqual([]);
    expect(panel.textContent, "the stale settle restores nothing while asleep").not.toContain(OLD);
    await dispatchWake("pageshow");
    expect(await until(() => (panel.textContent ?? "").includes(OLD)), "kept after the wake").toBe(true);
  });

  it("A05 freeze and resume park and wake like pagehide and pageshow, also in the harness order of all four", async () => {
    await sleepWakeRun(["freeze"], ["resume"], true);
    await sleepWakeRun(["freeze"], ["resume"], false);
    // the harness order; check 1's window closes at resume, the first wake event (B2-p2)
    await sleepWakeRun(["pagehide", "freeze"], ["resume", "pageshow"], true);
    await sleepWakeRun(["pagehide", "freeze"], ["resume", "pageshow"], false);
  });

  it("A06 a signed-in transcript older than the current session is never shown and the key is emptied", async () => {
    installApi({ createdAtSec: T + 30 });
    storeTranscript(OLD, true, T);
    const host = container();
    const watched = watchText(host, OLD);
    // the panel alone: with the guard beside it, the guard's mount settle could erase the key before the panel's
    // own restore runs, and a panel that shows before its gate would pass unseen
    await mountInto(host, <Assistant fullPage />);
    expect(await until(() => !(storedRaw() ?? "").includes(OLD)), "the stored copy is erased").toBe(true);
    await pause(100);
    expect(watched.seen(), "never rendered").toBe(false);
    expect(keyHoldsNoMessage()).toBe(true);
    watched.stop();
  });

  it("A07 a signed-in transcript newer than the current session is shown", async () => {
    installApi({ createdAtSec: T - 600 });
    storeTranscript(OLD, true, T);
    await mount(<SupportConversationGuard />);
    const panel = await mount(<Assistant fullPage />);
    expect(await until(() => (panel.textContent ?? "").includes(OLD)), "kept").toBe(true);
    expect(storedRaw()).toContain(OLD);
  });

  it("A08 the stored transcript carries the server time of the latest support response, never the browser clock", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T * 1000 + 600_000);
    const api = installApi();
    await mount(<SupportConversationGuard />);
    const panel = await mount(<Assistant fullPage />);
    await until(() => api.calls.some((call) => call.url === "/api/v1/session"));
    await send(panel, OLD);
    expect(await until(() => (storedRaw() ?? "").includes(REPLY)), "the answered message is stored").toBe(true);
    const stored = JSON.parse(storedRaw()!) as Record<string, unknown>;
    expect(stored.serverTime).toBe(1_790_768_543);
    expect(Object.keys(stored).sort()).toEqual(["identityBound", "language", "messages", "serverTime"]);
  });

  it("A09 the guard alone erases the key within 100 ms of an announcement from another tab", async () => {
    const api = installApi();
    storeTranscript(OLD, true, T);
    await mount(<SupportConversationGuard />);
    await until(() => api.calls.some((call) => call.url === "/api/v1/auth/sessions"));
    await pause(20);
    expect(storedRaw(), "kept by the mount settle").toContain(OLD);
    const startedAt = Date.now();
    announceFromAnotherTab();
    expect(await until(() => storedRaw() === null, 100), "erased").toBe(true);
    expect(Date.now() - startedAt).toBeLessThanOrEqual(150);
  });

  it("A10 the guard alone erases an older transcript at mount, and after a wake on changed facts", async () => {
    installApi({ createdAtSec: T + 30 });
    storeTranscript(OLD, true, T);
    await mount(<SupportConversationGuard />);
    expect(await until(() => storedRaw() === null), "erased by the mount settle").toBe(true);

    // B1 variant: a tab parked on a page with no panel
    await unmountAll();
    announceSessionChange();
    const api = installApi({ createdAtSec: T - 600 });
    storeTranscript(OLD, true, T);
    await mount(<SupportConversationGuard />);
    await until(() => api.calls.some((call) => call.url === "/api/v1/auth/sessions"));
    await pause(20);
    expect(storedRaw(), "kept at mount").toContain(OLD);
    await dispatchSleep("pagehide");
    api.createdAtSec = T + 30;
    await dispatchWake("pageshow");
    expect(await until(() => storedRaw() === null), "erased after the wake").toBe(true);
  });

  it("A11 the root layout mounts the guard exactly once, right after the footer", () => {
    const layout = readFileSync(LAYOUT_SOURCE, "utf8");
    expect(layout.match(/<SupportConversationGuard \/>/gu) ?? []).toHaveLength(1);
    expect(layout).toMatch(/<SiteFooter variant="line" \/>\s*<SupportConversationGuard \/>/u);
  });

  it("A12 a gate result that belongs to an older generation is never shown", async () => {
    const api = installApi();
    storeTranscript(OLD, true, T);
    const held = deferred();
    api.holdSessions = held;
    const host = container();
    const watched = watchText(host, OLD);
    await mount(<SupportConversationGuard />);
    await mountInto(host, <Assistant fullPage />);
    expect(await until(() => api.calls.some((call) => call.url === "/api/v1/auth/sessions")), "settling").toBe(true);
    announceFromAnotherTab();
    await pause(50);
    held.release();
    await pause(300);
    expect(watched.seen(), "never rendered").toBe(false);
    watched.stop();
  });

  it("A13 after a same-tab announcement the panel re-resolves identity and writes the next exchange under it", async () => {
    const api = installApi({ signedIn: false });
    storeTranscript(OLD, false);
    await mount(<SupportConversationGuard />);
    const panel = await mount(<Assistant fullPage />);
    expect(await until(() => (panel.textContent ?? "").includes(OLD)), "an anonymous transcript is kept").toBe(true);

    // C1 F1: this tab's own guard hears its broadcast, so a same-tab change resets the panel twice
    const resets: number[] = [];
    const stopCounting = onConversationReset(() => { resets.push(performance.now()); });
    api.signedIn = true;
    await act(async () => {
      clearStoredSupportConversation(window.sessionStorage);
      announceSessionChange();
    });
    await until(() => resets.length >= 2, 500);
    stopCounting();
    console.info(`F1 measurement: resets=${resets.length} gapMs=${resets.length >= 2
      ? (resets[1]! - resets[0]!).toFixed(1) : "n/a"}`);
    expect(await until(() => !(panel.textContent ?? "").includes(OLD)), "reset").toBe(true);

    await pause(50);
    await send(panel, "willow harbor note");
    expect(await until(() => (storedRaw() ?? "").includes(REPLY)), "the next exchange is stored").toBe(true);
    const stored = JSON.parse(storedRaw()!) as { identityBound: boolean; messages: Array<{ text: string }> };
    expect(stored.identityBound, "written under the identity signed in now").toBe(true);
    expect(stored.messages.map((message) => message.text)).toContain("willow harbor note");
    expect(storedRaw()).not.toContain(OLD);
  });

  it("A14 under blocked storage and a throwing BroadcastChannel the guard mounts and unmounts without taking the page down", async () => {
    denyStorage("sessionStorage");
    denyStorage("localStorage");
    globalThis.BroadcastChannel = class {
      constructor() { throw new DOMException("denied", "SecurityError"); }
    } as unknown as typeof BroadcastChannel;
    fetchRoute.handler = (url) => Promise.reject(new Error(`UNEXPECTED_FETCH:${url}`));
    const caught: unknown[] = [];
    const host = await mount(<Boundary onError={(error) => caught.push(error)}>
      <p>ok</p>
      <SupportConversationGuard />
    </Boundary>);
    await pause(20);
    expect(host.textContent).toBe("ok");
    expect(caught).toEqual([]);
    const root = roots.pop()!;
    let unmountError: unknown = null;
    try {
      await act(async () => root.unmount());
    } catch (error) {
      unmountError = error;
    }
    expect(unmountError).toBeNull();
  });
});
