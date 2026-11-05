// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError, QUESTION_NOT_STARTED, type PurposeLines, type StartPaths } from "@debateai/contract";

/*
 * V4 start step, Task 68 (read-d2, read-d3, choose-d2, ask-f2, owner answer Q8): what the ask hook does with Start's
 * hand-over. The question box's line goes as the question and the lane as createDebate's ninth argument; the crisis
 * check reads the person's own path words before anything is sent; a refused hand-over never drops the paths silently
 * (STALE and INVALID say "read it again", NARROWED and a settings change with paths read the room again and are never
 * resent); a Free question refused for its notice shows the notice from then on, and the next press carries it.
 * The hook, the crisis help and the question check's screen are the real ones; only the server and the consent and
 * language pop-ups are stood in.
 */
const server = vi.hoisted(() => ({
  createDebate: vi.fn(async (..._args: unknown[]): Promise<{ id: string }> => ({ id: "11111111-1111-4111-8111-111111111111" })),
  room: null as null | Record<string, unknown>,
  roomReads: 0
}));
vi.mock("@/components/SensitiveDataConsent", () => ({
  isSensitiveDataConsentRefusal: () => false,
  useSensitiveDataConsent: () => ({ ensureConsent: async () => true, declined: false, dialog: null })
}));
vi.mock("@/components/QuestionLanguageChoice", () => ({ useQuestionLanguageChoice: () => ({ ensureChoice: async () => "KEEP", dialog: null }) }));
vi.mock("@/lib/api", () => ({
  COOKIE_SESSION_MARKER: "cookie",
  createDebate: (...args: unknown[]) => server.createDebate(...args),
  contractClient: { getAskRoom: async () => { server.roomReads += 1; return server.room; } }
}));

import { isFreeNoticeRequired, useV4Ask, type V4AskOutcome } from "../../apps/ui/lib/v4/useV4Ask.js";
import type { V4StartHandOver } from "../../apps/ui/lib/v4/types.js";
import { pathPlanFromMenu, pathPlanToStartPaths } from "../../apps/ui/lib/v4/pathPlan.js";
import { NUCLEAR_MENU, START_FIXTURE_QUESTION, signedMenu } from "../support/v4-start-menu.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const messages = (name: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, `../../apps/ui/messages/en/${name}.json`), "utf8")) as Record<string, string>;
const CATALOG = messages("v4");
const HOME = messages("home");
const NEW_DEBATE = messages("newDebate");
const NOTICE = NEW_DEBATE["newDebate.freePublicNotice"]!;

const Q = START_FIXTURE_QUESTION;
const BOX = `${Q}\n\nWhich region? The north.`;
const PURPOSE: PurposeLines = { answers: [{ question: "Which region?", answer: "The north." }] };
const START_PATHS: StartPaths = {
  source: "MENU", menu: signedMenu(NUCLEAR_MENU), paths: [...pathPlanToStartPaths(pathPlanFromMenu(NUCLEAR_MENU, 5, false))], width: 5, chosen_by: "PERSON"
};
const handOver = (over: Partial<V4StartHandOver> = {}): V4StartHandOver => ({
  questionLine: BOX, startCheck: { ref: "chk.sig" }, startPaths: START_PATHS, ownWords: [], ...over
});
const roomOf = (over: Record<string, unknown> = {}) => ({
  room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "PLUS", settings_version: 7,
  start_step: { lists: "ON", widths: { options: [3, 5, 7], default: 5 } }, ...over
});
const refusal = (status: number, code: string) => new ContractHttpError(status === 403 ? "FORBIDDEN" : "UNPROCESSABLE", status, code, code);
const READ_AGAIN = "We need to read your question again. Press Back, then Next.";
const narrowedTo = (count: number) =>
  `We've updated the site: it now looks into up to ${count} paths. Combine or remove paths down to ${count} to start.`;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let ask: ReturnType<typeof useV4Ask> | null = null;

function Page(): ReactNode {
  ask = useV4Ask({ catalog: CATALOG, homeCatalog: HOME, newDebateCatalog: NEW_DEBATE, locale: "en", crisisCountryHint: null, mode: "quick", readingLevel: "plain" });
  return <>{ask.freePublicNotice ? <p className="notice">{NOTICE}</p> : null}{ask.dialogs}</>;
}

async function mount(): Promise<void> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<Page />));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

async function press(questionLine: string, given: V4StartHandOver | undefined, purpose: Readonly<{ lines: PurposeLines | undefined }> = { lines: PURPOSE }): Promise<V4AskOutcome> {
  let outcome: V4AskOutcome | null = null;
  await act(async () => { outcome = await ask!.submit(questionLine, "quick", "ask", null, purpose.lines, undefined, given); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return outcome!;
}

beforeEach(() => { server.createDebate.mockReset(); server.createDebate.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111" }); server.room = roomOf(); server.roomReads = 0; });
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null; host = null; ask = null;
});

describe("Start's hand-over on the wire", () => {
  it("the box's line goes as the question, the lane as argument 9, the purpose lines as argument 7", async () => {
    await mount();
    const outcome = await press(BOX, handOver({ carryOnToReport: true }));
    expect(outcome.kind).toBe("STARTED");
    expect(server.createDebate).toHaveBeenCalledTimes(1);
    const args = server.createDebate.mock.calls[0]!;
    expect(args[0]).toBe(BOX);
    expect(args[6]).toEqual(PURPOSE);
    expect(args[8]).toEqual({ startCheck: { ref: "chk.sig" }, startPaths: START_PATHS, carryOnToReport: true });
  });

  it("only the members the hand-over has; none at all and no hand-over: today's call, no ninth argument", async () => {
    await mount();
    await press(Q, handOver({ questionLine: Q, startPaths: undefined }));
    expect(server.createDebate.mock.calls[0]![8]).toEqual({ startCheck: { ref: "chk.sig" } });
    await press(Q, { questionLine: Q, ownWords: [] });
    expect(server.createDebate.mock.calls[1]!.length).toBeLessThanOrEqual(8);
    await press(Q, undefined, { lines: undefined });
    expect(server.createDebate.mock.calls[2]).toEqual([Q, expect.anything(), "cookie"]);
    // A lane alone (no purpose lines, no parent, no notice) still goes: it is never dropped for today's short call.
    await press(Q, handOver({ questionLine: Q, startPaths: undefined }), { lines: undefined });
    expect(server.createDebate.mock.calls[3]![8]).toEqual({ startCheck: { ref: "chk.sig" } });
  });

  it("a hand-over for another line than the one pressed is refused before sending", async () => {
    await mount();
    const outcome = await press(Q, handOver());
    expect(outcome).toEqual({ kind: "REFUSED", message: CATALOG["v4.ask.failed"] });
    expect(server.createDebate).not.toHaveBeenCalled();
  });
});

describe("the crisis check reads everything the person wrote, first", () => {
  it("crisis words in the person's own path: help, nothing sent", async () => {
    await mount();
    const outcome = await press(BOX, handOver({ ownWords: ["My own path", "Should I kill myself?"] }));
    expect(outcome).toEqual({ kind: "STOPPED" });
    expect(server.createDebate).not.toHaveBeenCalled();
    expect(host!.querySelector('[data-dialog="crisis-support"]')).not.toBeNull();
  });

  it("crisis words typed into the question box: help, nothing sent", async () => {
    await mount();
    const typed = `${Q}\n\nShould I kill myself?`;
    const outcome = await press(typed, handOver({ questionLine: typed }));
    expect(outcome).toEqual({ kind: "STOPPED" });
    expect(server.createDebate).not.toHaveBeenCalled();
    expect(host!.querySelector('[data-dialog="crisis-support"]')).not.toBeNull();
  });
});

describe("a refused hand-over never drops the paths silently", () => {
  it.each([[409, "START_PATHS_STALE"], [400, "START_PATHS_INVALID"], [409, "START_PATHS_EXPIRED"]] as const)(
    "%i %s: read the question again, nothing resent", async (status, code) => {
      await mount();
      server.createDebate.mockRejectedValue(refusal(status, code));
      const outcome = await press(BOX, handOver());
      expect(outcome).toEqual({ kind: "REFUSED", message: READ_AGAIN, startPathsStale: true });
      expect(server.createDebate).toHaveBeenCalledTimes(1);
    });

  it("409 START_PATHS_NARROWED: the room is read again, its widest named, nothing resent", async () => {
    await mount();
    const before = server.roomReads;
    server.room = roomOf({ settings_version: 8, start_step: { lists: "ON", widths: { options: [3], default: 3 } } });
    server.createDebate.mockRejectedValue(refusal(409, "START_PATHS_NARROWED"));
    const outcome = await press(BOX, handOver());
    expect(outcome).toEqual({ kind: "REFUSED", message: narrowedTo(3), startPathsNarrowed: true });
    expect(server.createDebate).toHaveBeenCalledTimes(1);
    expect(server.roomReads).toBeGreaterThanOrEqual(2);
    expect(server.roomReads).toBeGreaterThan(before);
    expect(ask!.room?.settings_version).toBe(8);
  });

  it("Free's widest is 3 whatever the row says", async () => {
    server.room = roomOf({ plan_id: "FREE" });
    await mount();
    server.room = roomOf({ plan_id: "FREE", settings_version: 8 });
    server.createDebate.mockRejectedValue(refusal(409, "START_PATHS_NARROWED"));
    const outcome = await press(BOX, handOver({ startPaths: { ...START_PATHS, paths: START_PATHS.paths.slice(0, 4), width: 5 } }));
    expect(outcome).toEqual({ kind: "REFUSED", message: narrowedTo(3), startPathsNarrowed: true });
  });

  it("settings changed with paths: the room is read again and the paths never resent; fewer allowed paths → narrowed", async () => {
    await mount();
    const before = server.roomReads;
    server.room = roomOf({ settings_version: 8, start_step: { lists: "ON", widths: { options: [3], default: 3 } } });
    server.createDebate.mockRejectedValue(refusal(409, "ASK_SETTINGS_CHANGED"));
    const outcome = await press(BOX, handOver());
    expect(outcome).toEqual({ kind: "REFUSED", message: narrowedTo(3), startPathsNarrowed: true });
    expect(server.createDebate).toHaveBeenCalledTimes(1);
    expect(server.roomReads).toBeGreaterThanOrEqual(2);
    expect(server.roomReads).toBeGreaterThan(before);
  });

  it("settings changed with paths that still fit: no flag, the page's own sentence, nothing resent", async () => {
    await mount();
    server.room = roomOf({ settings_version: 8 });
    server.createDebate.mockRejectedValue(refusal(409, "ASK_SETTINGS_CHANGED"));
    const outcome = await press(BOX, handOver());
    expect(outcome).toEqual({ kind: "REFUSED", message: CATALOG["v4.askError.settingsChanged"] });
    expect(server.createDebate).toHaveBeenCalledTimes(1);
  });

  // Independent review of Task 68: "narrowed only when the widest is BELOW the path count", pinned at its edge: five
  // paths where the new widest is exactly 5 still fit, so no combine-or-remove line; and NARROWED with a failed re-read
  // keeps its flag, so the page never drops the paths silently even when it cannot name the new widest.
  it("settings changed with paths exactly as many as the new widest: they fit, no flag", async () => {
    await mount();
    server.room = roomOf({ settings_version: 8, start_step: { lists: "ON", widths: { options: [3, 5], default: 5 } } });
    server.createDebate.mockRejectedValue(refusal(409, "ASK_SETTINGS_CHANGED"));
    const outcome = await press(BOX, handOver());
    expect(START_PATHS.paths).toHaveLength(5);
    expect(outcome).toEqual({ kind: "REFUSED", message: CATALOG["v4.askError.settingsChanged"] });
    expect(server.createDebate).toHaveBeenCalledTimes(1);
  });

  it("409 START_PATHS_NARROWED with a re-read that fails: the settings sentence, still flagged, nothing resent", async () => {
    await mount();
    server.room = null;
    server.createDebate.mockRejectedValue(refusal(409, "START_PATHS_NARROWED"));
    const outcome = await press(BOX, handOver());
    expect(outcome).toEqual({ kind: "REFUSED", message: CATALOG["v4.askError.settingsChanged"], startPathsNarrowed: true });
    expect(server.createDebate).toHaveBeenCalledTimes(1);
  });

  it("settings changed with only the check: today's one retry, the same lane again", async () => {
    await mount();
    server.room = roomOf({ settings_version: 8 });
    server.createDebate.mockRejectedValueOnce(refusal(409, "ASK_SETTINGS_CHANGED"));
    const outcome = await press(BOX, handOver({ startPaths: undefined }));
    expect(outcome.kind).toBe("STARTED");
    expect(server.createDebate).toHaveBeenCalledTimes(2);
    expect(server.createDebate.mock.calls[1]![8]).toEqual({ startCheck: { ref: "chk.sig" } });
  });
});

describe("the question check's screen on the page's say-so", () => {
  it("showRefusal opens the check's own screen for its refusal, and nothing for anything else", async () => {
    await mount();
    let shown: boolean | null = null;
    await act(async () => { shown = ask!.showRefusal(new Error("not the check's")); });
    expect(shown).toBe(false);
    expect(host!.querySelector('[data-dialog="question-refusal"]')).toBeNull();
    const notStarted = new ContractHttpError("UNPROCESSABLE", 422, QUESTION_NOT_STARTED, QUESTION_NOT_STARTED, null, null, null,
      { kind: "DRUGS", screen: "REFUSE", emergencyNumber: false });
    await act(async () => { shown = ask!.showRefusal(notStarted); });
    expect(shown).toBe(true);
    expect(host!.querySelector('[data-dialog="question-refusal"]')).not.toBeNull();
    expect(server.createDebate).not.toHaveBeenCalled();
  });
});

describe("a Free question waits for its notice (ask-f2)", () => {
  it("403 FREE_PUBLIC_NOTICE_REQUIRED: the room read again, the notice shown from then on, nothing resent; the next press carries the mark", async () => {
    server.room = null;
    await mount();
    expect(host!.querySelector(".notice")).toBeNull();
    const before = server.roomReads;
    server.createDebate.mockRejectedValueOnce(refusal(403, "FREE_PUBLIC_NOTICE_REQUIRED"));
    const outcome = await press(BOX, handOver());
    expect(outcome).toEqual({ kind: "STOPPED", noticeNeeded: true });
    expect(server.createDebate).toHaveBeenCalledTimes(1);
    expect(server.createDebate.mock.calls[0]![7]).toBeUndefined();
    expect(server.roomReads).toBeGreaterThanOrEqual(2);
    expect(server.roomReads).toBeGreaterThan(before);
    // The re-read failed too: the notice still shows, because the server said so.
    expect(host!.querySelector(".notice")?.textContent).toBe(NOTICE);
    expect(ask!.freePublicNotice).toBe(true);
    const next = await press(BOX, handOver());
    expect(next.kind).toBe("STARTED");
    expect(server.createDebate.mock.calls[1]![7]).toEqual({ freePublicNotice: true });
  });

  it("isFreeNoticeRequired reads only that 403", () => {
    expect(isFreeNoticeRequired(refusal(403, "FREE_PUBLIC_NOTICE_REQUIRED"))).toBe(true);
    expect(isFreeNoticeRequired(refusal(403, "SENSITIVE_DATA_CONSENT_REQUIRED"))).toBe(false);
    expect(isFreeNoticeRequired(refusal(409, "FREE_PUBLIC_NOTICE_REQUIRED"))).toBe(false);
    expect(isFreeNoticeRequired(new Error("FREE_PUBLIC_NOTICE_REQUIRED"))).toBe(false);
  });
});
