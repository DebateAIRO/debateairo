// @vitest-environment jsdom
// Keyboard-only check (2026-10-22): every control on the debate's Visibility card swaps itself out — Publish… opens a
// form in its place, the form's Cancel brings the button back, a finished publish turns Publish… into Unpublish…, the
// security check's Cancel unmounts it — and focus fell to <body> each time. It now lands on what replaced the
// control, on the control that opened the check, or on the card's heading.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublicationControl } from "../../apps/ui/components/PublicationControl.js";
import pub from "../../apps/ui/messages/en/public.json" with { type: "json" };

const runId = "11111111-1111-4111-8111-111111111111";
const methods = { methods: [], recovery_codes_remaining: 0, available_step_up_methods: ["password_totp"], step_up_providers: [] };
const client = (overrides: Record<string, unknown> = {}) => ({
  readRunVisibility: vi.fn(async () => ({ state: "PRIVATE" as const, public_ref: null })),
  // synthesis-flag S02: the control reads the debate's review state beside its visibility (an unflagged debate here).
  readPublicationReview: vi.fn(async () => ({ flagged: false, state: "NONE", categories: [], asks_used: 0, may_ask: false, refusal: null })),
  publishRun: vi.fn(async () => ({ state: "PUBLISHED" as const, public_ref: "22222222-2222-4222-8222-222222222222" })),
  unpublishRun: vi.fn(async () => ({ state: "PRIVATE" as const, public_ref: null })),
  deletePrivateDebate: vi.fn(async () => ({ status: "CLEANED" as const })),
  authMethods: vi.fn(async () => methods),
  stepUp: vi.fn(async (_password: string, _code: string, authorization: Record<string, string>) => ({
    status: "step_up_complete", csrf_token: "c".repeat(43),
    step_up_grant: { ...authorization, token: "g".repeat(43), expires_at: new Date(Date.now() + 300_000).toISOString() }
  })),
  ...overrides
});
let root: Root | null = null;
async function settle() { await act(async () => { for (let index = 0; index < 6; index += 1) await Promise.resolve(); }); }
async function mount(api: ReturnType<typeof client>) {
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => { root!.render(<PublicationControl runId={runId} client={api as never} catalog={pub}/>); }); await settle();
}
function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === label);
  expect(found, `missing button ${label}`).toBeDefined();
  return found as HTMLButtonElement;
}
/** A keyboard press: the control holds focus, then activates. */
async function press(target: HTMLElement) { target.focus(); expect(document.activeElement).toBe(target); await act(async () => { target.click(); }); await settle(); }
/** The security check's own Cancel (the publish and delete forms have a Cancel of their own). */
const checkCancel = () => [...document.querySelectorAll<HTMLButtonElement>(".authSecurityConfirmation button")].find((node) => node.textContent === "Cancel")!;
const checkbox = (label: string) => [...document.querySelectorAll("label")].find((node) => node.textContent?.includes(label))!.querySelector("input")!;
async function type(selector: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(selector)!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
  await settle();
}
async function prove() {
  await press(button("Password · 6-digit authentication code"));
  await type('[name="security-password"]', "correct horse");
  await type('[name="security-code"]', "123456");
}
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { if (root !== null) await act(async () => root!.unmount()); root = null; document.body.replaceChildren(); vi.unstubAllGlobals(); });

describe("publishing", () => {
  it("Publish… lands on the form's acknowledgement, and the form's Cancel lands on Publish… again", async () => {
    await mount(client());
    await press(button(pub["public.publication.publishEllipsis"]));
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(checkbox(pub["public.publication.acknowledgePublish"]));
    await press(button(pub["public.publication.cancel"]));
    expect(document.activeElement).toBe(button(pub["public.publication.publishEllipsis"]));
  });

  it("Cancel on the security check returns focus to Publish publicly", async () => {
    await mount(client());
    await press(button(pub["public.publication.publishEllipsis"]));
    await press(checkbox(pub["public.publication.acknowledgePublish"]));
    await press(button(pub["public.publication.publishPublicly"]));
    expect(document.querySelector(".authSecurityConfirmation")).not.toBeNull();
    await press(checkCancel());
    expect(document.querySelector(".authSecurityConfirmation")).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(button(pub["public.publication.publishPublicly"]));
  });

  it("a finished publish lands on Unpublish…, the control that replaced the form", async () => {
    const api = client();
    await mount(api);
    await press(button(pub["public.publication.publishEllipsis"]));
    await press(checkbox(pub["public.publication.acknowledgePublish"]));
    await press(button(pub["public.publication.publishPublicly"]));
    await prove();
    expect(api.publishRun).toHaveBeenCalled();
    expect(document.body.textContent).toContain(pub["public.publication.publishedSuccess"]);
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(button(pub["public.publication.unpublishEllipsis"]));
  });
});

describe("deleting a private debate", () => {
  it("Delete private debate… lands on its acknowledgement, and Cancel lands on the button again", async () => {
    await mount(client());
    await press(button(pub["public.publication.deletePrivateEllipsis"]));
    expect(document.activeElement).toBe(checkbox(pub["public.publication.deleteAcknowledgement"]));
    await press([...document.querySelectorAll("form")].at(-1)!.querySelector<HTMLButtonElement>('button[type="button"]')!);
    expect(document.activeElement).toBe(button(pub["public.publication.deletePrivateEllipsis"]));
  });

  it("Cancel on the security check returns focus to Permanently delete", async () => {
    await mount(client());
    await press(button(pub["public.publication.deletePrivateEllipsis"]));
    await press(checkbox(pub["public.publication.deleteAcknowledgement"]));
    await press(button(pub["public.publication.permanentlyDelete"]));
    expect(document.querySelector(".authSecurityConfirmation")).not.toBeNull();
    await press(checkCancel());
    expect(document.querySelector(".authSecurityConfirmation")).toBeNull();
    expect(document.activeElement).toBe(button(pub["public.publication.permanentlyDelete"]));
  });

  it("a finished deletion lands on the tombstone's heading", async () => {
    await mount(client());
    await press(button(pub["public.publication.deletePrivateEllipsis"]));
    await press(checkbox(pub["public.publication.deleteAcknowledgement"]));
    await press(button(pub["public.publication.permanentlyDelete"]));
    await prove();
    const heading = document.querySelector<HTMLHeadingElement>("h2")!;
    expect(heading.textContent).toBe(pub["public.publication.privateDeletedHeading"]);
    expect(heading.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(heading);
  });

  it("a pending deletion, whose button is now disabled, lands on the card's heading", async () => {
    await mount(client({ deletePrivateDebate: vi.fn(async () => ({ status: "PENDING" as const })) }));
    await press(button(pub["public.publication.deletePrivateEllipsis"]));
    await press(checkbox(pub["public.publication.deleteAcknowledgement"]));
    await press(button(pub["public.publication.permanentlyDelete"]));
    await prove();
    expect(button(pub["public.publication.deletionPendingShort"]).disabled).toBe(true);
    const heading = document.querySelector<HTMLHeadingElement>("h2")!;
    expect(heading.textContent).toBe(pub["public.publication.visibility"]);
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(heading);
  });
});
