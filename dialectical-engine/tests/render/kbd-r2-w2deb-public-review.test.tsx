// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError, PublicReviewPageSchema, type PublicReviewPage } from "@debateai/contract";
import { PublicReviewPanel } from "../../apps/ui/components/PublicReviewPanel.js";
import type { PublicReviewClient } from "../../apps/ui/lib/publicReviewApi.js";
import staff from "../../apps/ui/messages/en/staff.json" with { type: "json" };
import { installFocusFixup } from "./kbd-focus-fixup";
import { guardSettled, pressByKeyboard, startFocusGuard, submitByKeyboard } from "./kbd-guard-harness";

/*
 * Keyboard audit, 12 Nov 2026, wave 2 (DEB2-8, DEB2-17): the team's public-review panel under the site's focus guard.
 * A step's confirm box opens at the top of the debate (or at the end of the report queue), far from the step that asked
 * for it, so focus goes to the box's line; Cancel gives it back to the step; the finished step lands on its notice. The
 * panel is the real one; the API is stood in (made-up debate), as in public-review-panel.test.tsx.
 */
const REF = "11111111-1111-4111-8111-111111111111";
const DIG = "22222222-2222-4222-8222-222222222222";
const LATER = "33333333-3333-4333-8333-333333333333";
const REPORT = "44444444-4444-4444-8444-444444444444";
const hiddenPage = (): PublicReviewPage => PublicReviewPageSchema.parse({ publication_ref: REF, hidden: true, revision: 1, question: "A made-up question?", published_at: "2026-10-20T08:00:00.000Z", snapshot_unreadable: false,
  snapshot: [{ pointer: "/question", original: "A made-up question?", corrected: null }],
  digs: [{ dig_run_id: DIG, parent_run_id: REF, position_ref: "p", contributor: "Quiet Heron", contributed_at: "2026-10-21T08:00:00.000Z", removed: false }],
  updates: [],
  reports: [{ report_id: REPORT, report_version: 1, writer: null, requested_at: "2026-10-22T08:00:00.000Z", recorded_at: "2026-10-22T09:00:00.000Z", state: "ON_THE_PAGE", pieces: [{ pointer: "/report/line", original: "A made-up report line.", corrected: null }] }],
  log: [{ revision: 1, action: "HIDE", piece_kind: null, actor_staff_id: DIG, at: "2026-11-01T09:00:00.000Z" }] });
const queued = { flag_id: LATER, publication_ref: REF, reporter: "Quiet Heron", state: "HIDDEN", verdict: "AGREE", reason: "PERSONAL", created_at: "2026-11-01T08:00:00.000Z", judged_at: null, dismissed_at: null, where: "A place.", claim: "A claim to read.", debate_hidden: true, outcome: null };
function client(change: Partial<PublicReviewClient> = {}) {
  return { cancel: vi.fn(), readReports: vi.fn(async () => ({ reports: [queued] })), closeReport: vi.fn(async () => ({})), list: vi.fn(async () => ({ hidden: [], log: [] })),
    read: vi.fn(async () => hiddenPage()), hide: vi.fn(async () => ({})), step: vi.fn(async () => ({})), ...change } as unknown as PublicReviewClient;
}

let root: Root | null = null;
let stop: () => void = () => undefined;
// KBD_NO_GUARD=1 runs the same steps without the guard, to see the loss the audit found.
const guarded = process.env.KBD_NO_GUARD !== "1";
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  stop = guarded ? startFocusGuard() : installFocusFixup();
});
afterEach(async () => {
  stop();
  stop = () => undefined;
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

async function settle() { await act(async () => { for (let index = 0; index < 10; index += 1) await Promise.resolve(); }); }
async function mount(api: PublicReviewClient) {
  const main = document.createElement("main");
  main.id = "main-content";
  document.body.append(main);
  root = createRoot(main);
  await act(async () => { root!.render(<PublicReviewPanel client={api} />); });
  await settle();
}
const button = (name: string, within: ParentNode = document) => {
  const found = [...within.querySelectorAll("button")].find((entry) => entry.textContent === name);
  expect(found, `missing button ${name}`).toBeDefined();
  return found as HTMLButtonElement;
};
async function press(target: HTMLElement) { pressByKeyboard(target); await settle(); }
async function openDebate() {
  const input = document.querySelector<HTMLInputElement>("#public-review-link")!;
  input.value = `https://dezbatere.ro/public/debate/${REF}`;
  submitByKeyboard(input);
  await settle();
}
const boxLine = () => document.querySelector<HTMLElement>("[data-review-confirm] > p")!;
async function fillGround() {
  await act(async () => {
    document.querySelector<HTMLInputElement>("[data-review-ground] input[type=checkbox]")!.click();
    document.querySelector<HTMLInputElement>("#review-source-EMAIL_NOTICE")!.click();
  });
  await act(async () => {
    const box = document.querySelector<HTMLTextAreaElement>("[data-review-ground] textarea")!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box, "Made-up facts.");
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("DEB2-8 / DEB2-17: a step's confirm box", () => {
  it("Hide report, deep in the reports, lands on the confirm box's line at the top; Cancel gives focus back to Hide report", async () => {
    await mount(client());
    await openDebate();
    const report = document.querySelector<HTMLElement>(`[data-review-report]`)!;
    const hideReport = button(staff["staff.publicReview.hideReport"], report);
    await press(hideReport);
    await guardSettled();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(boxLine());
    expect(boxLine().textContent).toBe(staff["staff.publicReview.confirm.hideReport"]);
    await press(button(staff["staff.publicReview.cancel"], document.querySelector("[data-review-confirm]")!));
    await guardSettled();
    expect(document.querySelector("[data-review-confirm]")).toBeNull();
    expect(document.activeElement).toBe(button(staff["staff.publicReview.hideReport"], report));
  });

  it("Confirm lands on the step's notice, done or failed", async () => {
    for (const step of [vi.fn(async () => ({})), vi.fn(async () => { throw new ContractHttpError("UNPROCESSABLE", 409, "x", "PUBLIC_REVIEW_STALE"); })]) {
      await mount(client({ step } as never));
      await openDebate();
      await press(button(staff["staff.publicReview.takeOut"]));
      expect(document.activeElement).toBe(boxLine());
      await fillGround();
      await press(button(staff["staff.publicReview.confirm"]));
      await guardSettled();
      expect(step).toHaveBeenCalled();
      const notice = document.querySelector<HTMLElement>("[data-review-debate] [role=status]")!;
      expect(document.activeElement).toBe(notice);
      await act(async () => root!.unmount());
      root = null;
      document.body.replaceChildren();
    }
  });

  it("a queue close opens its box at the queue's end and lands there; Confirm lands on the notice in the first section", async () => {
    const api = client();
    await mount(api);
    await press(button(staff["staff.publicReports.closeNoBreach"]));
    await guardSettled();
    expect(document.activeElement).toBe(boxLine());
    expect(boxLine().closest("[data-report-queue]")).not.toBeNull();
    await press(button(staff["staff.publicReview.confirm"]));
    await guardSettled();
    expect(api.closeReport).toHaveBeenCalledWith(LATER, "NO_BREACH");
    expect(document.activeElement).toBe(document.querySelector<HTMLElement>("[data-public-review-panel] > section [role=status]"));
    expect(document.activeElement!.textContent).toBe(staff["staff.publicReview.done"]);
  });

  it("Replace in a piece's form lands on the box's line; Cancel gives focus back to Replace", async () => {
    await mount(client());
    await openDebate();
    const piece = document.querySelector<HTMLElement>("[data-review-report] [data-review-piece]")!;
    await press(button(staff["staff.publicReview.replaceThis"], piece));
    await press(button(staff["staff.publicReview.replace"], piece));
    await guardSettled();
    expect(document.activeElement).toBe(boxLine());
    await press(button(staff["staff.publicReview.cancel"], document.querySelector("[data-review-confirm]")!));
    await guardSettled();
    expect(document.activeElement).toBe(button(staff["staff.publicReview.replace"], piece));
  });
});

describe("DEB2-8: Replace this and its form's Cancel (the guard alone)", () => {
  it("Replace this parks on its piece, whose first control is the new text; the form's Cancel parks there with Replace this next", async () => {
    await mount(client());
    await openDebate();
    const piece = document.querySelector<HTMLElement>("[data-review-report] [data-review-piece]")!;
    await press(button(staff["staff.publicReview.replaceThis"], piece));
    await guardSettled();
    expect(document.activeElement).toBe(piece);
    expect(piece.hasAttribute("data-focus-parked")).toBe(true);
    expect(piece.querySelector("textarea, button")!.tagName).toBe("TEXTAREA");
    await press(button(staff["staff.publicReview.cancel"], piece));
    await guardSettled();
    expect(document.activeElement).toBe(piece);
    expect(piece.querySelector("button")!.textContent).toBe(staff["staff.publicReview.replaceThis"]);
  });
});
