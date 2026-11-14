// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import { PublicationControl } from "../../apps/ui/components/PublicationControl.js";
import pub from "../../apps/ui/messages/en/public.json" with { type: "json" };
import { installFocusFixup } from "./kbd-focus-fixup";
import { guardSettled, pressByKeyboard, startFocusGuard } from "./kbd-guard-harness";

/*
 * Keyboard audit, 12 Nov 2026, wave 2 (DEB2-5, DEB2-6): the debate's Visibility card under the site's focus guard. The
 * card, the owner's "Ask for approval" panel and the security check are the real ones; the API is stood in (made-up
 * debate), as in kbd-publication-control.test.tsx.
 */
const runId = "11111111-1111-4111-8111-111111111111";
const methods = { methods: [], recovery_codes_remaining: 0, available_step_up_methods: ["password_totp"], step_up_providers: [] };
const flagged = { flagged: true, state: "NONE", categories: ["HATE_SPEECH"], asks_used: 0, may_ask: true, refusal: null };
const client = (overrides: Record<string, unknown> = {}) => ({
  readRunVisibility: vi.fn(async () => ({ state: "PRIVATE" as const, public_ref: null })),
  readPublicationReview: vi.fn(async () => ({ flagged: false, state: "NONE", categories: [], asks_used: 0, may_ask: false, refusal: null })),
  requestPublicationReview: vi.fn(async () => ({ state: "UNDER_REVIEW" })),
  publishRun: vi.fn(async () => ({ state: "PUBLISHED" as const, public_ref: "22222222-2222-4222-8222-222222222222" })),
  deletePrivateDebate: vi.fn(async () => ({ status: "CLEANED" as const })),
  authMethods: vi.fn(async () => methods),
  stepUp: vi.fn(async (_password: string, _code: string, authorization: Record<string, string>) => ({
    status: "step_up_complete", csrf_token: "c".repeat(43),
    step_up_grant: { ...authorization, token: "g".repeat(43), expires_at: new Date(Date.now() + 300_000).toISOString() }
  })),
  ...overrides
});

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

async function settle() { await act(async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); }); }
async function mount(api: ReturnType<typeof client>) {
  const main = document.createElement("main");
  main.id = "main-content";
  document.body.append(main);
  root = createRoot(main);
  await act(async () => { root!.render(<PublicationControl runId={runId} client={api as never} catalog={pub} />); });
  await settle();
}
function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === label);
  expect(found, `missing button ${label}`).toBeDefined();
  return found as HTMLButtonElement;
}
async function press(target: HTMLElement) { pressByKeyboard(target); await settle(); }
const checkCancel = () => [...document.querySelectorAll<HTMLButtonElement>(".authSecurityConfirmation button")].find((node) => node.textContent === "Cancel")!;
const checkbox = () => document.querySelector<HTMLInputElement>('.publicationControl input[type="checkbox"]')!;
/** Typing into a field: the field has focus and keys go down in it. */
async function type(selector: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(selector)!;
  await act(async () => {
    input.focus();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "1", bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}
/** The security check by password and code: the full code sends it, from the code field. */
async function prove() {
  await press(button("Password · 6-digit authentication code"));
  await type('[name="security-password"]', "correct horse");
  await type('[name="security-code"]', "123456");
}
const panel = () => document.querySelector<HTMLElement>(".publicationReviewPanel")!;
/** The guard parked focus on the owner's review panel, and the next Tab goes on inside it. */
function parkedOnPanel() {
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(panel());
  expect(panel().hasAttribute("data-focus-parked")).toBe(true);
}

describe("DEB2-5: the owner's Ask for approval panel", () => {
  it("Ask parks on the panel, whose first control is the new acknowledgement; the form's Cancel parks there with Ask next", async () => {
    await mount(client({ readPublicationReview: vi.fn(async () => flagged) }));
    await press(button(pub["public.publicationReview.askButton"] ?? "Ask for approval"));
    await guardSettled();
    parkedOnPanel();
    expect(panel().querySelector("input, button")).toBe(checkbox());
    await press(button(pub["public.publication.cancel"]));
    await guardSettled();
    parkedOnPanel();
    expect(panel().querySelector("button")!.textContent).toBe(pub["public.publicationReview.askButton"]);
  });

  it("the security check's Cancel parks on the panel; the form is still there with its submit", async () => {
    await mount(client({ readPublicationReview: vi.fn(async () => flagged) }));
    await press(button(pub["public.publicationReview.askButton"]));
    await press(checkbox());
    await press(panel().querySelector<HTMLButtonElement>("form button:not([type])")!);
    expect(document.querySelector(".authSecurityConfirmation")).not.toBeNull();
    await press(checkCancel());
    await guardSettled();
    expect(document.querySelector(".authSecurityConfirmation")).toBeNull();
    parkedOnPanel();
    expect(panel().querySelector("form")).not.toBeNull();
  });

  it("a finished ask parks on the panel, which now holds only the asked line", async () => {
    const api = client({ readPublicationReview: vi.fn(async () => flagged) });
    await mount(api);
    await press(button(pub["public.publicationReview.askButton"]));
    await press(checkbox());
    await press(panel().querySelector<HTMLButtonElement>("form button:not([type])")!);
    await prove();
    await guardSettled();
    expect(api.requestPublicationReview).toHaveBeenCalled();
    parkedOnPanel();
    expect(panel().querySelector('[role="status"]')!.textContent).toBe(pub["public.publicationReview.asked"]);
    expect(panel().querySelector("button, input")).toBeNull();
  });

  it("a final refusal of the ask parks on the panel, which holds only the answer", async () => {
    const api = client({
      readPublicationReview: vi.fn(async () => flagged),
      requestPublicationReview: vi.fn(async () => { throw new ContractHttpError("UNPROCESSABLE", 409, "x", "PUBLICATION_REVIEW_PENDING"); })
    });
    await mount(api);
    await press(button(pub["public.publicationReview.askButton"]));
    await press(checkbox());
    await press(panel().querySelector<HTMLButtonElement>("form button:not([type])")!);
    await prove();
    await guardSettled();
    parkedOnPanel();
    expect(panel().textContent).toBe(pub["public.publicationReview.pendingError"]);
  });
});

describe("DEB2-6: a refused publish or delete", () => {
  const statement = { outcome: "BLOCK", parts: ["QUESTION"], ground: "TERMS", automated: true, visibility: "PRIVATE" };
  const heading = () => document.querySelector<HTMLElement>(".publicationControl h2")!;

  it("a publish refused with a statement lands on the card's heading, the statement right under it (not the emptied check)", async () => {
    const api = client({ publishRun: vi.fn(async () => { throw new ContractHttpError("UNPROCESSABLE", 409, "x", "PUBLICATION_REFUSED", statement as never); }) });
    await mount(api);
    await press(button(pub["public.publication.publishEllipsis"]));
    await press(checkbox());
    await press(button(pub["public.publication.publishPublicly"]));
    await prove();
    await guardSettled();
    expect(api.publishRun).toHaveBeenCalled();
    expect(document.activeElement).toBe(heading());
    expect(heading().nextElementSibling!.nextElementSibling!.querySelector("h3")!.textContent).toBe(pub["public.publication.contentCheck.refusedHeading"]);
  });

  it("a publish that needs approval, or fails, lands on the heading with its line under it", async () => {
    for (const failure of [new ContractHttpError("UNPROCESSABLE", 409, "x", "PUBLICATION_APPROVAL_REQUIRED"), new ContractHttpError("SERVER_FAILURE", 503, "x")]) {
      await mount(client({ publishRun: vi.fn(async () => { throw failure; }) }));
      await press(button(pub["public.publication.publishEllipsis"]));
      await press(checkbox());
      await press(button(pub["public.publication.publishPublicly"]));
      await prove();
      await guardSettled();
      expect(document.activeElement).toBe(heading());
      expect(document.querySelector('.publicationControl > [role="status"]')).not.toBeNull();
      await act(async () => root!.unmount());
      root = null;
      document.body.replaceChildren();
    }
  });

  it("a refused delete lands on the heading with its line under it", async () => {
    await mount(client({ deletePrivateDebate: vi.fn(async () => { throw new ContractHttpError("UNPROCESSABLE", 409, "x", "LEGACY_CONTENT_RETAINED"); }) }));
    await press(button(pub["public.publication.deletePrivateEllipsis"]));
    await press(document.querySelector<HTMLInputElement>('.publicationControl form input[type="checkbox"]')!);
    await press(button(pub["public.publication.permanentlyDelete"]));
    await prove();
    await guardSettled();
    expect(document.activeElement).toBe(heading());
    expect(document.querySelector('.publicationControl > [role="status"]')!.textContent).toBe(pub["public.publication.legacyRetained"]);
  });
});
