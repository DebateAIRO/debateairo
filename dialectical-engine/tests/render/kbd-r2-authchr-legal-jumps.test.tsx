// @vitest-environment jsdom
// Keyboard audit 2026-11-12 (CHR2-6): the legal modal's jump pills only scrolled, so the focused pill scrolled out of
// view and the next Tab scrolled the text back to the top. A pill now also moves focus to its section, without a
// second scroll, so the reader goes on from where the pill took them.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PrivacyPolicyModal } from "../../apps/ui/components/consent/PrivacyPolicyModal.js";
import { POLICY_JUMP } from "../../apps/ui/lib/privacyPolicy.js";

let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it("a pill scrolls to its section and moves focus there without scrolling again", async () => {
  await act(async () => root.render(<PrivacyPolicyModal open mode="consent" onClose={vi.fn()} />));
  await act(async () => { await Promise.resolve(); });
  for (const { target } of POLICY_JUMP.slice(0, 3)) {
    const section = document.getElementById(target)!;
    const order: string[] = [];
    (section as unknown as { scrollIntoView: unknown }).scrollIntoView = () => order.push("scroll");
    const focus = section.focus.bind(section);
    section.focus = (options?: FocusOptions) => { order.push(`focus:${options?.preventScroll === true}`); focus(options); };
    const pill = document.querySelector<HTMLButtonElement>(`button[data-jump="${target}"]`)!;
    pill.focus();
    await act(async () => pill.click());
    expect(section.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(section);
    expect(order).toEqual(["scroll", "focus:true"]);
  }
});

it("sections are focus targets only, never Tab stops", async () => {
  await act(async () => root.render(<PrivacyPolicyModal open mode="consent" onClose={vi.fn()} />));
  for (const section of document.querySelectorAll(".policySection")) expect(section.getAttribute("tabindex")).toBe("-1");
});
