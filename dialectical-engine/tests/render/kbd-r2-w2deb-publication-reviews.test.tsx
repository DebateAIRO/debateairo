// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import { PublicationReviewsPanel } from "../../apps/ui/components/PublicationReviewsPanel.js";
import type { StaffApiClient } from "../../apps/ui/lib/staffApi.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";
import enStaff from "../../apps/ui/messages/en/staff.json" with { type: "json" };
import enPublic from "../../apps/ui/messages/en/public.json" with { type: "json" };
import { installFocusFixup } from "./kbd-focus-fixup";
import { guardSettled, pressByKeyboard, startFocusGuard } from "./kbd-guard-harness";

/*
 * Keyboard audit, 12 Nov 2026, wave 2 (DEB2-9, DEB2-18): the team's publication-review queue under the site's focus
 * guard. Every step swaps a whole screen (queue → review → queue) or opens something away from the pressed control (the
 * reason box, the Details/Read panel below the whole overview), so each one names where focus goes. The panel is the
 * real one; the API is stood in (made-up debate), as in publication-reviews-panel.test.tsx.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const reviewRef = "11111111-1111-4111-8111-111111111111";
const older = { review_ref: reviewRef, asked_at: "2026-10-20T08:00:00.000Z", ask_ordinal: 1 as const, categories: ["HATE_SPEECH" as const] };
const fair = buildFairShapedAnswer({ answer_id: reviewRef, run_ref: "22222222-2222-4222-8222-222222222222", question_line: "Should this debate be published?", verdict_state: "CONTESTED" });
const snapshot = {
  ...older,
  question: "Should this debate be published?",
  answer: {
    terminal: "SERVED", verdict: "SUPPORTED", verdict_available: true, confidence_band: null, summary_segments: [{ text: "The synthesis to review." }],
    badges: [], residual_objections: [], reversal_point: "A new argument", as_of: older.asked_at, nodes: fair.nodes ?? [], edges: fair.edges ?? [], tree_included: true
  }
};
function panelClient(overrides: Record<string, unknown> = {}): StaffApiClient {
  return {
    publicationReviews: async () => ({ items: [older], order: "ASKED_AT_ASC" }),
    publicationReview: async () => snapshot,
    proveAction: async () => ({ proof_handle: "p".repeat(43) }),
    approvePublicationReview: async () => ({ review_ref: reviewRef, outcome: "APPROVE", decided_at: older.asked_at }),
    refusePublicationReview: async () => ({ review_ref: reviewRef, outcome: "REFUSE", decided_at: older.asked_at }),
    cancel: vi.fn(),
    ...overrides
  } as unknown as StaffApiClient;
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
async function mount(api: StaffApiClient) {
  const main = document.createElement("main");
  main.id = "main-content";
  document.body.append(main);
  root = createRoot(main);
  await act(async () => { root!.render(<PublicationReviewsPanel client={api} catalog={enStaff} publicCatalog={enPublic} locale="en" />); });
  await settle();
}
function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((node) => node.textContent === label);
  expect(found, `missing button ${label}`).toBeDefined();
  return found as HTMLButtonElement;
}
async function press(target: HTMLElement) { pressByKeyboard(target); await settle(); }
const queueHeading = () => document.querySelector<HTMLElement>(".setCard .staffSectionTitle")!;

describe("DEB2-9: the screen swaps", () => {
  it("Open lands on the review's question heading; Back lands on the queue's heading", async () => {
    await mount(panelClient());
    await press(button(enStaff["staff.reviews.open"]));
    await guardSettled();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(document.querySelector("h1.rvQuestion"));
    await press(button(enStaff["staff.reviews.back"]));
    await guardSettled();
    expect(document.activeElement).toBe(queueHeading());
    expect(queueHeading().textContent).toBe(enStaff["staff.reviews.heading"]);
  });

  it("Approve lands on the queue's heading, the approved line just under it", async () => {
    await mount(panelClient());
    await press(button(enStaff["staff.reviews.open"]));
    await press(button(enStaff["staff.reviews.approve"]));
    await guardSettled();
    expect(document.activeElement).toBe(queueHeading());
    expect(document.querySelector(".staffNotice")!.textContent).toBe(enStaff["staff.reviews.approved"]);
  });

  it("Refuse lands in the reason box; its Refuse lands on the queue's heading", async () => {
    await mount(panelClient());
    await press(button(enStaff["staff.reviews.open"]));
    await press(button(enStaff["staff.reviews.refuse"]));
    await guardSettled();
    const reason = document.querySelector<HTMLTextAreaElement>("#publication-review-reason")!;
    expect(document.activeElement).toBe(reason);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(reason, "A made-up reason.");
      reason.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await press(button(enStaff["staff.reviews.refuse"]));
    await guardSettled();
    expect(document.activeElement).toBe(queueHeading());
    expect(document.querySelector(".staffNotice")!.textContent).toBe(enStaff["staff.reviews.refused"]);
  });

  it("a failed decision lands on the failure screen's heading, its line just under it", async () => {
    await mount(panelClient({ approvePublicationReview: async () => { throw new ContractHttpError("UNPROCESSABLE", 409, "x", "PUBLICATION_REVIEW_DECIDED"); } }));
    await press(button(enStaff["staff.reviews.open"]));
    await press(button(enStaff["staff.reviews.approve"]));
    await guardSettled();
    expect(document.activeElement).toBe(queueHeading());
    expect(document.querySelector("[role=status]")!.textContent).toBe(enStaff["staff.reviews.error.decided"]);
  });
});

describe("DEB2-18: Details and Read", () => {
  it("Details lands on its panel's heading below the overview; Close gives focus back to Details", async () => {
    await mount(panelClient());
    await press(button(enStaff["staff.reviews.open"]));
    const details = document.querySelector<HTMLElement>(".publicDetailsAction")!;
    await press(details);
    await guardSettled();
    expect(document.activeElement).toBe(document.querySelector('[data-review-detail="verdict"] h2'));
    await press(button(enPublic["public.honesty.close"]));
    await guardSettled();
    expect(document.querySelector("[data-review-detail]")).toBeNull();
    expect(document.activeElement).toBe(details);
  });

  it("Read lands on its panel's heading; Close gives focus back to Read", async () => {
    await mount(panelClient());
    await press(button(enStaff["staff.reviews.open"]));
    const read = document.querySelector<HTMLElement>(".publicReadAction")!;
    await press(read);
    await guardSettled();
    expect(document.activeElement).toBe(document.querySelector('[data-review-detail="argument"] h2'));
    await press(button(enPublic["public.honesty.close"]));
    await guardSettled();
    expect(document.activeElement).toBe(read);
  });
});
