// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "../../packages/contract/src/http-error.js";
import type { RunProjection } from "../../packages/contract/src/index.js";
import {
  advance, branch, buttonNamed, buttonsNamed, CATALOG, click, harness, mountMap, openPath, page, panel, PATHS, resetHarness, settle,
  text, tray, typeInto, unmountMap
} from "./v4-debate-harness.js";

vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => (await import("./v4-debate-harness.js")).loadMock(await original()));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

/*
 * V4 screen review, 3 Nov, on the map page:
 *  - journey-d4 A / map-f24: opening a question adds one step to the address; Back opens the question before; a reload or
 *    a shared link opens the same question; the phone's Map sheet adds no step and Back with it open closes it;
 *  - dig-f23: typed own views and wordings stay in the page between questions; ticked picks (ids, never words) ride in
 *    the address; a link that would lose typed words asks first, and the browser asks before a reload; "Clear" offers
 *    "Picks cleared [Undo]" for 10 seconds;
 *  - map-f6: one grey outline while the page loads, and no map until the saved reading level is known;
 *  - wait-f1: a sign-in that ended says "Please sign in again to see your question." with Sign in and the way back.
 */

const params = (): URLSearchParams => new URLSearchParams(window.location.search);
const selectedCard = (): string | null => page().querySelector(".v4MapPath[aria-current='true'] .v4MapPathTitle")?.textContent ?? null;
const pathTitleAt = (index: number): string => branch(index).querySelector(".v4MapPathTitle")!.textContent!;
const panelHeading = (): string => panel().querySelector(".v4PanelH2")?.textContent ?? "";
const panelBoxes = (): HTMLInputElement[] => [...panel().querySelectorAll<HTMLInputElement>(".v4Sugs input[type=checkbox]")];
/** journey-f23 (w1-wait-card): the tray shows the picks as chips, never as "N picked". */
const trayChips = (): HTMLElement[] => [...(tray()?.querySelectorAll<HTMLElement>(".v4ChoiceChip") ?? [])];

/** What the browser does on Back or Forward: the address becomes `href`, then popstate. */
async function traverseTo(href: string): Promise<void> {
  await act(async () => {
    window.history.replaceState(null, "", href);
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
  });
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers();
  resetHarness();
});

afterEach(async () => {
  await unmountMap();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("every opened question has its own address (journey-d4 A, map-f24)", () => {
  it("opening a question adds one step; Back opens the one before; the main question has none", async () => {
    const runId = await mountMap();
    const start = window.history.length;
    expect(window.location.pathname).toBe(`/v4/debate/${runId}`);
    expect(params().get("path")).toBeNull();
    await openPath(PATHS.renew);
    const renewAddress = `${window.location.pathname}${window.location.search}`;
    expect(params().get("path")).toBe("n-renew");
    expect(window.history.length).toBe(start + 1);
    await openPath(PATHS.mix);
    expect(params().get("path")).toBe("n-mix");
    expect(window.history.length).toBe(start + 2);
    // Opening the open one again adds nothing.
    await openPath(PATHS.mix);
    expect(window.history.length).toBe(start + 2);
    expect(selectedCard()).toBe(pathTitleAt(PATHS.mix));
    // Back: the question before.
    await traverseTo(renewAddress);
    expect(selectedCard()).toBe(pathTitleAt(PATHS.renew));
    // Back again: the main question.
    await traverseTo(`/v4/debate/${runId}`);
    expect(selectedCard()).toBeNull();
  });

  it("a reload or a shared link opens the same question, the level and other parameters kept", async () => {
    harness.search = "?level=background&path=n-smr";
    await mountMap();
    expect(selectedCard()).toBe(pathTitleAt(PATHS.smr));
    expect(params().get("level")).toBe("background");
    // An open question: find one, then reload on its address.
    await click(page().querySelector<HTMLButtonElement>(".v4MapLeafOpen .v4MapOpenMain")!);
    const openId = params().get("open");
    expect(openId).not.toBeNull();
    const heading = panelHeading();
    await unmountMap();
    harness.search = `?open=${encodeURIComponent(openId!)}`;
    await mountMap();
    expect(panelHeading()).toBe(heading);
    expect(page().querySelector(".v4MapOpen.v4MapSelected")).not.toBeNull();
  });

  it("phone: the Map sheet adds no step, Back with it open closes it, and a row opened from it is one step", async () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    const runId = await mountMap(375);
    const start = window.history.length;
    // Open and close with ✕: the sheet's own step is given back.
    await click(buttonNamed(CATALOG["v4.debate.mapButton"]!));
    expect(page().querySelector(".v4DebSheet")).not.toBeNull();
    await click(page().querySelector<HTMLButtonElement>(".v4DebSheetClose")!);
    expect(page().querySelector(".v4DebSheet")).toBeNull();
    expect(back).toHaveBeenCalledTimes(1);
    // Open again; the browser's Back closes it and stays on the question.
    await click(buttonNamed(CATALOG["v4.debate.mapButton"]!));
    await traverseTo(`/v4/debate/${runId}`);
    expect(page().querySelector(".v4DebSheet")).toBeNull();
    expect(params().get("path")).toBeNull();
    // A row of the sheet: its step becomes the question's, so the history grows by one in all.
    const lengthBefore = window.history.length;
    await click(buttonNamed(CATALOG["v4.debate.mapButton"]!));
    await click([...page().querySelectorAll<HTMLButtonElement>(".v4OutPath")][PATHS.renew]!);
    expect(page().querySelector(".v4DebSheet")).toBeNull();
    expect(params().get("path")).toBe("n-renew");
    expect(window.history.length).toBe(lengthBefore + 1);
    expect(window.history.length).toBeGreaterThan(start);
  });
});

describe("picks and typed words are not lost (dig-f23)", () => {
  it("keeps the ticked suggestions in the address (ids only) and brings them back on a reload", async () => {
    await mountMap();
    await openPath(PATHS.renew);
    const [first] = panelBoxes();
    await click(first!);
    const ticks = params().getAll("pick");
    expect(ticks).toHaveLength(1);
    expect(ticks[0]).toMatch(/^s\./u);
    // The own view is added to the picks, but its words never reach the address.
    await click(buttonNamed(CATALOG["v4.suggest.ownView"]!, panel()));
    await typeInto(panel().querySelector<HTMLTextAreaElement>(".v4SugEditor textarea")!, "My private view about my street");
    await click(buttonNamed(CATALOG["v4.suggest.ownViewAdd"]!, panel()));
    expect(trayChips()).toHaveLength(2);
    expect(window.location.href).not.toMatch(/private|street/iu);
    expect(params().getAll("pick")).toEqual(ticks);
    const search = window.location.search;
    await unmountMap();
    harness.search = search;
    await mountMap();
    expect(trayChips()).toHaveLength(1);
    expect(panelBoxes().filter((box) => box.checked)).toHaveLength(1);
  });

  it("keeps an own view typed but not added while the person looks at another question", async () => {
    await mountMap();
    await openPath(PATHS.renew);
    await click(buttonNamed(CATALOG["v4.suggest.ownView"]!, panel()));
    await typeInto(panel().querySelector<HTMLTextAreaElement>(".v4SugEditor textarea")!, "Storage is cheaper where I live");
    await openPath(PATHS.mix);
    expect(panel().querySelector(".v4SugEditor textarea")).toBeNull();
    await openPath(PATHS.renew);
    expect(panel().querySelector<HTMLTextAreaElement>(".v4SugEditor textarea")?.value).toBe("Storage is cheaper where I live");
  });

  it("keeps a wording being edited while the person looks at another question", async () => {
    await mountMap();
    await openPath(PATHS.renew);
    await click(buttonsNamed(CATALOG["v4.suggest.edit"]!, panel())[0]!);
    await typeInto(panel().querySelector<HTMLTextAreaElement>(".v4SugEditor textarea")!, "My own wording of this");
    await openPath(PATHS.mix);
    await openPath(PATHS.renew);
    expect(panel().querySelector<HTMLTextAreaElement>(".v4SugEditor textarea")?.value).toBe("My own wording of this");
  });

  it("asks before a link would lose typed words; Stay keeps them, and the browser asks before a reload", async () => {
    await mountMap();
    const report = page().querySelector<HTMLAnchorElement>("a.v4DebReportLink")!;
    // Nothing typed: no question, and the browser lets the page go.
    const free = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(free);
    expect(free.defaultPrevented).toBe(false);
    await openPath(PATHS.renew);
    await click(buttonNamed(CATALOG["v4.suggest.ownView"]!, panel()));
    await typeInto(panel().querySelector<HTMLTextAreaElement>(".v4SugEditor textarea")!, "A view I have not added");
    const held = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(held);
    expect(held.defaultPrevented).toBe(true);
    await click(report);
    const question = page().querySelector("[role='alertdialog']");
    expect(question?.textContent).toContain(CATALOG["v4.suggest.leaveQuestion"]);
    await click(buttonNamed(CATALOG["v4.suggest.leaveStay"]!));
    expect(page().querySelector("[role='alertdialog']")).toBeNull();
    expect(panel().querySelector<HTMLTextAreaElement>(".v4SugEditor textarea")?.value).toBe("A view I have not added");
    // Leave lets the same link go on (here stopped before jsdom would navigate), and asks nothing more.
    const followed = vi.spyOn(report, "click").mockImplementation(() => undefined);
    await act(async () => {
      report.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    });
    await settle();
    await click(buttonNamed(CATALOG["v4.suggest.leaveGo"]!));
    expect(followed).toHaveBeenCalledTimes(1);
    expect(page().querySelector("[role='alertdialog']")).toBeNull();
    const leaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(false);
  });

  it("\"Clear\" shows \"Picks cleared\" with Undo for 10 seconds; Undo brings every pick back", async () => {
    await mountMap();
    await openPath(PATHS.renew);
    const [first, second] = panelBoxes();
    await click(first!);
    await click(second!);
    await click(buttonNamed(CATALOG["v4.dig.trayClear"]!, tray()!));
    expect(tray()).toBeNull();
    expect(text()).toContain(CATALOG["v4.dig.picksCleared"]);
    expect(params().getAll("pick")).toEqual([]);
    await click(page().querySelector<HTMLButtonElement>(".v4PicksClearedUndo")!);
    expect(trayChips()).toHaveLength(2);
    expect(params().getAll("pick")).toHaveLength(2);
    expect(text()).not.toContain(CATALOG["v4.dig.picksCleared"]);
    // Cleared again: after 10 seconds the offer ends and the picks stay cleared.
    await click(buttonNamed(CATALOG["v4.dig.trayClear"]!, tray()!));
    await advance(10_000);
    await settle();
    expect(page().querySelector(".v4PicksCleared")).toBeNull();
    expect(tray()).toBeNull();
  });
});

describe("loading and an ended sign-in (map-f6, wait-f1)", () => {
  it("shows one grey outline while the debate loads, never a bare \"Loading…\" line", async () => {
    harness.loadPending = true;
    await mountMap();
    expect(page().querySelector(".v4DebOutline")).not.toBeNull();
    expect(page().querySelector(".v4DebOutline .v4SrOnly")?.textContent).toBe(CATALOG["v4.common.loading"]);
    expect(page().querySelector(".v4DebLoading")).toBeNull();
  });

  it("keeps the outline until the saved reading level is known, then draws the map", async () => {
    let answer: (level: "plain" | null) => void = () => undefined;
    harness.accountLevel = new Promise((done) => { answer = done; });
    await mountMap(1600, crypto.randomUUID(), null, null);
    expect(page().querySelector(".v4DebOutline")).not.toBeNull();
    expect(page().querySelector(".v4MapBranch")).toBeNull();
    await act(async () => answer("plain"));
    await settle();
    expect(page().querySelector(".v4DebOutline")).toBeNull();
    expect(page().querySelector(".v4MapBranch")).not.toBeNull();
  });

  it("does not wait for a level that never comes", async () => {
    harness.accountLevel = new Promise(() => undefined);
    await mountMap(1600, crypto.randomUUID(), null, null);
    expect(page().querySelector(".v4MapBranch")).toBeNull();
    await advance(4_000);
    await settle();
    expect(page().querySelector(".v4MapBranch")).not.toBeNull();
  });

  it("a debate read refused as signed out asks to sign in again, with the way back to the same question", async () => {
    harness.loadError = new ContractHttpError("SESSION_REQUIRED", 401, "sign in");
    harness.search = "?path=n-renew&level=plain";
    const runId = await mountMap();
    expect(text()).toContain(CATALOG["v4.debate.signedOut"]);
    expect(text()).not.toContain(CATALOG["v4.debate.reconnecting"]);
    const signIn = [...page().querySelectorAll<HTMLAnchorElement>("a")].find((link) => link.textContent === CATALOG["v4.debate.signIn"])!;
    expect(signIn.getAttribute("href")).toBe(`/login?next=${encodeURIComponent(`/v4/debate/${runId}?path=n-renew&level=plain`)}`);
  });

  it("a sign-in that ends during the wait replaces \"We lost touch\" with the sign-in card", async () => {
    const runId = crypto.randomUUID();
    harness.run = {
      run_ref: runId, question_line: "Should my town build a heat pump network?", state: "RUNNING", terminal_reason: null, hold_until: null
    } as RunProjection;
    await mountMap(1600, runId);
    expect(text()).toContain(CATALOG["v4.debate.state.RUNNING"]);
    harness.loadError = new ContractHttpError("SESSION_REQUIRED", 401, "sign in");
    await advance(5_000);
    await settle();
    expect(text()).toContain(CATALOG["v4.debate.signedOut"]);
    expect(text()).toContain("Should my town build a heat pump network?");
    // Nothing keeps asking the server once it said the sign-in ended.
    harness.loadError = null;
    await advance(60_000);
    await settle();
    expect(text()).toContain(CATALOG["v4.debate.signedOut"]);
  });
});
