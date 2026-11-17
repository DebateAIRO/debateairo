// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Design Document v2, screen "18b V4 My questions": "Not started yet" closes the My questions page (`/v4?maps=all`), under the
 * list and its "Show more": the questions the account keeps, each with Pick up and Delete. Pick up goes to the ask page, which
 * opens the question (`/v4?pickup=<id>`; the ask page's side is in v4-pick-up.test.tsx). Delete is the ask page's own (the
 * shared Undo note and its window, then one DELETE; v4-saved-questions.test.tsx has the ask page's cases). The page, the block,
 * the note and the delete hook are the real ones; the saved-question calls are the real contract client's over a fetch
 * stand-in; the session, the header's account parts, the router and the maps read are stood in. Every text is made up.
 */
type NetCall = { method: string; path: string };

/** The account's saved questions, over a fetch stand-in: every call is recorded; `answer` may answer one call its own way. */
const net = vi.hoisted(() => {
  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const state = {
    calls: [] as NetCall[],
    answer: undefined as undefined | ((call: NetCall) => Response | undefined),
    list: [] as unknown[],
    json,
    async fetch(input: unknown, init?: RequestInit): Promise<Response> {
      const call: NetCall = { method: (init?.method ?? "GET").toUpperCase(), path: new URL(String(input)).pathname };
      state.calls.push(call);
      const given = state.answer?.(call);
      if (given !== undefined) return given;
      const base = "/v1/account/saved-questions";
      if (call.path === base && call.method === "GET") return json(200, { questions: state.list });
      if (call.method === "DELETE") return new Response(null, { status: 204 });
      return json(404, { error: "SAVED_QUESTION_GONE", message: "SAVED_QUESTION_GONE" });
    }
  };
  return state;
});
const router = vi.hoisted(() => ({ push: vi.fn() }));
const shelf = vi.hoisted(() => ({ more: true }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
// My questions behind a gate that lets the person in at once (the gate has its own tests).
vi.mock("@/components/AuthGate", () => ({ AuthGate: ({ children }: { children: (marker: string) => ReactNode }) => children("cookie-session") }));
// The real header; its quota circle and account button read the account, stood in.
vi.mock("@/components/v4/V4QuotaPill", () => ({ V4QuotaPill: () => null }));
vi.mock("@/components/v4/V4AccountMenu", () => ({ V4AccountMenu: () => null }));
vi.mock("@/lib/api", async () => {
  const { createContractClient } = await import("@debateai/contract");
  const account = createContractClient("http://localhost/", ((input: unknown, init?: RequestInit) => net.fetch(input, init)) as typeof fetch);
  return {
    COOKIE_SESSION_MARKER: "cookie-session",
    contractClient: {
      listSavedQuestions: account.listSavedQuestions,
      readSavedQuestion: account.readSavedQuestion,
      deleteSavedQuestion: account.deleteSavedQuestion
    }
  };
});
const MAP = "11111111-1111-4111-8111-111111111111";
vi.mock("@/lib/v4/mapShelf", async (original) => ({
  ...(await original<typeof import("../../apps/ui/lib/v4/mapShelf.js")>()),
  readMapShelf: async () => ({
    maps: [{ runId: MAP, question: "Should the city fund the tram line?", state: "READY", pause: null, startedAt: null, bar: null, changed: false, digs: [] }],
    more: shelf.more,
    anyRows: true
  })
}));

import { V4AllMaps } from "../../apps/ui/components/v4/V4AllMaps.js";
import { DIG_UNDO_MS } from "../../apps/ui/lib/v4/digUndo.js";
import { pickUpHref, pickUpIdOf } from "../../apps/ui/lib/v4/savedQuestion.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;
const SAVED = "/v1/account/saved-questions";

/** Made-up saved questions, newest first. */
const item = (n: number, question: string, day: number) => ({
  id: `5a1c0f3e-2b7d-4c9e-8f00-0000000000${String(n).padStart(2, "0")}`, question, saved_at: `2026-10-${String(day).padStart(2, "0")}T09:00:00.000Z`
});
const B = item(11, "Should Bucharest build a second metro ring?", 20);
const C = item(12, "Should the Danube delta get more protected areas?", 18);

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  net.calls = [];
  net.answer = undefined;
  net.list = [B, C];
  shelf.more = true;
  router.push.mockReset();
  window.history.replaceState(null, "", "/v4?maps=all");
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => { for (let tick = 0; tick < 10; tick += 1) await Promise.resolve(); });
  }
}

async function mount(): Promise<HTMLDivElement> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<V4AllMaps catalog={CATALOG} newDebateCatalog={{}} locale="en" />));
  await settle();
  return host;
}

async function click(target: Element): Promise<void> {
  await act(async () => { (target as HTMLElement).click(); });
  await settle();
}

async function wait(ms: number): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  await settle();
}

const buttonNamed = (name: string, within: ParentNode = document): HTMLButtonElement | undefined =>
  [...within.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === name);
const notStarted = (): HTMLElement | null => host!.querySelector<HTMLElement>(".v4NotStarted");
const listed = (): string[] => [...(notStarted()?.querySelectorAll(".v4NotStartedQuestion") ?? [])].map((one) => one.textContent ?? "");
const lineOf = (question: string): HTMLElement =>
  [...notStarted()!.querySelectorAll<HTMLElement>(".v4NotStartedItem")].find((one) => one.textContent?.includes(question))!;
const note = (): HTMLElement | null => host!.querySelector<HTMLElement>(".v4Undo");
const deletes = (): NetCall[] => net.calls.filter((call) => call.method === "DELETE");
const listReads = (): NetCall[] => net.calls.filter((call) => call.method === "GET" && call.path === SAVED);

describe("'Not started yet' on My questions (Design Document v2, 18b)", () => {
  it("closes the page under the list and 'Show more': the title, then each saved question with Pick up and Delete, newest first", async () => {
    await mount();
    expect(host!.querySelector(".v4ShelfCard")).not.toBeNull();
    expect(listReads()).toHaveLength(1);
    expect(notStarted()?.querySelector("h2")?.textContent).toBe("Not started yet");
    expect(listed()).toEqual([B.question, C.question]);
    for (const one of [B, C]) {
      expect(buttonNamed("Pick up", lineOf(one.question))).toBeDefined();
      expect(buttonNamed("Delete", lineOf(one.question))).toBeDefined();
    }
    // The page's blocks in order: the title's row, the list, "Show more", then the block, last.
    const main = host!.querySelector(".v4MapsMain")!;
    const blocks = [...main.children];
    expect(blocks.at(-1)).toBe(notStarted());
    expect(blocks.indexOf(main.querySelector(".v4MapsMore")!.parentElement!)).toBe(blocks.length - 2);
    // The header's and the list's links are as they were: the block adds none.
    expect(notStarted()!.querySelector("a")).toBeNull();
  });

  it("with no 'Show more' the block still comes after the list", async () => {
    shelf.more = false;
    await mount();
    expect(host!.querySelector(".v4MapsMore")).toBeNull();
    const blocks = [...host!.querySelector(".v4MapsMain")!.children];
    expect(blocks.at(-1)).toBe(notStarted());
    expect(blocks.at(-2)!.querySelector(".v4ShelfCard")).not.toBeNull();
  });

  it("nothing shows with no saved question, nor when the read fails", async () => {
    net.list = [];
    await mount();
    expect(notStarted()).toBeNull();
    await act(async () => root?.unmount());
    host?.remove();
    net.list = [B, C];
    net.answer = (call) => call.method === "GET" ? net.json(503, { error: "SAVED_QUESTIONS_UNAVAILABLE", message: "SAVED_QUESTIONS_UNAVAILABLE" }) : undefined;
    await mount();
    expect(host!.querySelector(".v4ShelfCard")).not.toBeNull();
    expect(notStarted()).toBeNull();
    expect(note()).toBeNull();
  });

  it("Pick up goes to the ask page with only the question's id (/v4?pickup=<id>); this page reads no saved question itself", async () => {
    await mount();
    const before = net.calls.length;
    await click(buttonNamed("Pick up", lineOf(C.question))!);
    expect(router.push.mock.calls).toEqual([[`/v4?pickup=${C.id}`]]);
    expect(pickUpHref(C.id)).toBe(`/v4?pickup=${C.id}`);
    expect(net.calls.slice(before)).toEqual([]);
    expect(listed()).toEqual([B.question, C.question]);
  });
});

describe("the address's id (app/v4/page.tsx hands the ask page only a saved question's id)", () => {
  it("a lowercase uuid passes as it is; anything else is ignored", () => {
    expect(pickUpIdOf(B.id)).toBe(B.id);
    for (const other of [undefined, null, "", "11", "not-an-id", B.id.toUpperCase(), `${B.id} `, `${B.id}/..`, `${B.id}?x=1`, "<script>"]) {
      expect(pickUpIdOf(other), String(other)).toBeNull();
    }
  });
});

describe("Delete on My questions (the ask page's: the shared Undo note and its window)", () => {
  it("the line leaves at once with the shared note right after the block; no DELETE before the Undo window ends, exactly one when it ends", async () => {
    vi.useFakeTimers();
    await mount();
    await click(buttonNamed("Delete", lineOf(B.question))!);
    expect(listed()).toEqual([C.question]);
    expect(note()!.querySelector(".v4UndoText")?.textContent).toContain(`Deleted “${B.question}”`);
    const undo = buttonNamed("Undo", note()!);
    expect(undo).toBeDefined();
    expect(document.activeElement).toBe(undo);
    // As on the ask page: the note is in the page's column, right after "Not started yet".
    expect(notStarted()!.nextElementSibling).toBe(note());
    expect(note()!.parentElement).toBe(host!.querySelector(".v4MapsMain"));
    await wait(DIG_UNDO_MS - 1);
    expect(deletes()).toEqual([]);
    await wait(1);
    expect(deletes()).toEqual([{ method: "DELETE", path: `${SAVED}/${B.id}` }]);
    expect(listed()).toEqual([C.question]);
    expect(note()).toBeNull();
    await wait(20_000);
    expect(deletes()).toHaveLength(1);
    // The list is not read again for it.
    expect(listReads()).toHaveLength(1);
  });

  it("Undo partway through the window brings the line back with focus on its Delete, and no DELETE is ever sent", async () => {
    vi.useFakeTimers();
    await mount();
    await click(buttonNamed("Delete", lineOf(B.question))!);
    await wait(DIG_UNDO_MS / 2);
    await click(buttonNamed("Undo", note()!)!);
    expect(listed()).toEqual([B.question, C.question]);
    expect(note()).toBeNull();
    expect(document.activeElement).toBe(buttonNamed("Delete", lineOf(B.question)));
    await wait(20_000);
    expect(deletes()).toEqual([]);
  });

  it("two Deletes wait side by side, each with its own note and its own DELETE", async () => {
    vi.useFakeTimers();
    await mount();
    await click(buttonNamed("Delete", lineOf(B.question))!);
    await wait(1_000);
    await click(buttonNamed("Delete", lineOf(C.question))!);
    expect(notStarted()).toBeNull();
    expect(host!.querySelectorAll(".v4Undo")).toHaveLength(2);
    await wait(DIG_UNDO_MS - 1_000);
    expect(deletes().map((call) => call.path)).toEqual([`${SAVED}/${B.id}`]);
    await wait(1_000);
    expect(deletes().map((call) => call.path)).toEqual([`${SAVED}/${B.id}`, `${SAVED}/${C.id}`]);
    expect(notStarted()).toBeNull();
  });

  it("a DELETE answered 503 brings the line back; one answered gone (404) takes it out", async () => {
    vi.useFakeTimers();
    net.answer = (call) => call.method !== "DELETE" ? undefined
      : call.path.endsWith(B.id) ? net.json(503, { error: "SAVED_QUESTIONS_UNAVAILABLE", message: "SAVED_QUESTIONS_UNAVAILABLE" })
        : net.json(404, { error: "SAVED_QUESTION_GONE", message: "SAVED_QUESTION_GONE" });
    await mount();
    await click(buttonNamed("Delete", lineOf(B.question))!);
    await wait(DIG_UNDO_MS);
    expect(deletes()).toHaveLength(1);
    expect(listed()).toEqual([B.question, C.question]);
    await click(buttonNamed("Delete", lineOf(C.question))!);
    await wait(DIG_UNDO_MS);
    expect(deletes()).toHaveLength(2);
    expect(listed()).toEqual([B.question]);
  });

  it("leaving the page before the window ends sends nothing", async () => {
    vi.useFakeTimers();
    await mount();
    await click(buttonNamed("Delete", lineOf(B.question))!);
    await wait(DIG_UNDO_MS - 1);
    await act(async () => root?.unmount());
    root = null;
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(deletes()).toEqual([]);
  });

  it("no storage API is touched while the page lists and deletes saved questions", async () => {
    const touched = [vi.spyOn(Storage.prototype, "setItem"), vi.spyOn(Storage.prototype, "getItem"), vi.spyOn(Storage.prototype, "removeItem")];
    await mount();
    await click(buttonNamed("Delete", lineOf(B.question))!);
    await click(buttonNamed("Pick up", lineOf(C.question))!);
    for (const spy of touched) expect(spy).not.toHaveBeenCalled();
    const source = readFileSync(resolve(import.meta.dirname, "../../apps/ui/components/v4/V4AllMaps.tsx"), "utf8");
    expect(source).not.toMatch(/\.setItem\(|localStorage|sessionStorage|indexedDB|document\.cookie|history\.(?:pushState|replaceState)/u);
  });
});

describe("a Delete's note that ends its window with the keyboard on it hands focus on (as on the ask page)", () => {
  it("focus goes to the Pick up of the line now where the deleted one was", async () => {
    vi.useFakeTimers();
    await mount();
    await click(buttonNamed("Delete", lineOf(B.question))!);
    expect(document.activeElement).toBe(buttonNamed("Undo", note()!));
    await wait(DIG_UNDO_MS);
    expect(note()).toBeNull();
    expect(listed()).toEqual([C.question]);
    expect(document.activeElement).toBe(buttonNamed("Pick up", lineOf(C.question)));
  });

  it("the last line deleted: focus goes to the line before it", async () => {
    vi.useFakeTimers();
    await mount();
    await click(buttonNamed("Delete", lineOf(C.question))!);
    await wait(DIG_UNDO_MS);
    expect(document.activeElement).toBe(buttonNamed("Pick up", lineOf(B.question)));
  });

  it("a DELETE that fails brings the line back, and focus goes to it", async () => {
    vi.useFakeTimers();
    net.answer = (call) => call.method === "DELETE" ? net.json(503, { error: "UNAVAILABLE", message: "UNAVAILABLE" }) : undefined;
    await mount();
    await click(buttonNamed("Delete", lineOf(B.question))!);
    await wait(DIG_UNDO_MS);
    expect(listed()).toEqual([B.question, C.question]);
    expect(document.activeElement).toBe(buttonNamed("Pick up", lineOf(B.question)));
  });

  it("the only kept question deleted: the block goes, and focus is on 'Show more' just above where it was", async () => {
    vi.useFakeTimers();
    net.list = [B];
    await mount();
    await click(buttonNamed("Delete", lineOf(B.question))!);
    await wait(DIG_UNDO_MS);
    expect(notStarted()).toBeNull();
    expect(document.activeElement).toBe(host!.querySelector(".v4MapsMore"));
  });

  it("with no 'Show more', focus is on the last map instead", async () => {
    vi.useFakeTimers();
    shelf.more = false;
    net.list = [B];
    await mount();
    await click(buttonNamed("Delete", lineOf(B.question))!);
    await wait(DIG_UNDO_MS);
    expect(notStarted()).toBeNull();
    const cards = host!.querySelectorAll(".v4ShelfCard");
    expect(document.activeElement).toBe(cards[cards.length - 1]);
  });

  it("focus moved on before the window ended: it stays where the person put it", async () => {
    vi.useFakeTimers();
    await mount();
    await click(buttonNamed("Delete", lineOf(B.question))!);
    const elsewhere = host!.querySelector<HTMLElement>(".v4MapsNew")!;
    act(() => elsewhere.focus());
    await wait(DIG_UNDO_MS);
    expect(listed()).toEqual([C.question]);
    expect(document.activeElement).toBe(elsewhere);
  });
});
