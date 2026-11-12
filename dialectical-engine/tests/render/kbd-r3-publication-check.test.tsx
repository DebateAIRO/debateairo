// @vitest-environment jsdom
/*
 * Keyboard audit round 3 (2026-11-12), seen in a real browser: on a debate's Visibility card, "Publish publicly" and
 * "Permanently delete" open the security check at the END of the card, and focus stayed on the pressed button. Nothing
 * said the check had opened; the card is height-capped and scrolls, so the check could be out of view; and the next Tab
 * stops were the form's Cancel and then "Delete private debate…", before the step the person has to do next.
 * Focus now goes to the security check itself (a named region), so it is read out, scrolled into view, and the next Tab
 * is its first method. Its Cancel still gives focus back to the button that opened it.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublicationControl } from "../../apps/ui/components/PublicationControl.js";
import auth from "../../apps/ui/messages/en/auth.json" with { type: "json" };
import pub from "../../apps/ui/messages/en/public.json" with { type: "json" };

const runId = "11111111-1111-4111-8111-111111111111";
const methods = { methods: [], recovery_codes_remaining: 0, available_step_up_methods: ["password_totp"], step_up_providers: [] };
const client = () => ({
  readRunVisibility: vi.fn(async () => ({ state: "PRIVATE" as const, public_ref: null })),
  readPublicationReview: vi.fn(async () => ({ flagged: false, state: "NONE", categories: [], asks_used: 0, may_ask: false, refusal: null })),
  publishRun: vi.fn(async () => ({ state: "PUBLISHED" as const, public_ref: "22222222-2222-4222-8222-222222222222" })),
  deletePrivateDebate: vi.fn(async () => ({ status: "CLEANED" as const })),
  authMethods: vi.fn(async () => methods),
  stepUp: vi.fn(async () => { throw new Error("unused"); })
});
let root: Root | null = null;
async function settle() { await act(async () => { for (let index = 0; index < 6; index += 1) await Promise.resolve(); }); }
async function mount() {
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => { root!.render(<PublicationControl runId={runId} client={client() as never} catalog={pub}/>); }); await settle();
}
function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === label);
  expect(found, `missing button ${label}`).toBeDefined();
  return found as HTMLButtonElement;
}
async function press(target: HTMLElement) { target.focus(); expect(document.activeElement).toBe(target); await act(async () => { target.click(); }); await settle(); }
const checkbox = (label: string) => [...document.querySelectorAll("label")].find((node) => node.textContent?.includes(label))!.querySelector("input")!;
const check = () => document.querySelector<HTMLElement>(".authSecurityConfirmation");
/** The controls a Tab can reach, in document order. */
const tabStops = () => [...document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]")]
  .filter((node) => node.tabIndex >= 0 && !node.matches(":disabled"));
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { if (root !== null) await act(async () => root!.unmount()); root = null; document.body.replaceChildren(); vi.unstubAllGlobals(); });

describe("the security check on the Visibility card takes focus when it opens", () => {
  it("Publish publicly: focus is on the check, a named region, and the next Tab stop is its first method", async () => {
    await mount();
    await press(button(pub["public.publication.publishEllipsis"]));
    await press(checkbox(pub["public.publication.acknowledgePublish"]));
    await press(button(pub["public.publication.publishPublicly"]));
    const region = check();
    expect(region).not.toBeNull();
    expect(document.activeElement).toBe(region);
    expect(region!.getAttribute("aria-label")).toBe(auth["auth.security.title"]);
    // Focusable by script only: the region is not a Tab stop of its own.
    expect(region!.tabIndex).toBe(-1);
    const after = tabStops().find((node) => region!.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(after?.textContent).toBe(auth["auth.security.passwordMethod"]);
    expect(region!.contains(after!)).toBe(true);
  });

  it("Permanently delete: focus is on the check", async () => {
    await mount();
    await press(button(pub["public.publication.deletePrivateEllipsis"]));
    await press(checkbox(pub["public.publication.deleteAcknowledgement"]));
    await press(button(pub["public.publication.permanentlyDelete"]));
    expect(check()).not.toBeNull();
    expect(document.activeElement).toBe(check());
  });

  it("the check's Cancel still gives focus back to the button that opened it", async () => {
    await mount();
    await press(button(pub["public.publication.publishEllipsis"]));
    await press(checkbox(pub["public.publication.acknowledgePublish"]));
    await press(button(pub["public.publication.publishPublicly"]));
    const cancel = [...check()!.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent === auth["auth.security.cancel"])!;
    await press(cancel);
    expect(check()).toBeNull();
    expect(document.activeElement).toBe(button(pub["public.publication.publishPublicly"]));
  });
});
