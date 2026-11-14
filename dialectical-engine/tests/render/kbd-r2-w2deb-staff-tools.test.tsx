// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import enStaff from "../../apps/ui/messages/en/staff.json" with { type: "json" };
import enSettings from "../../apps/ui/messages/en/settings.json" with { type: "json" };
import { installFocusFixup } from "./kbd-focus-fixup";
import { guardSettled, pressByKeyboard, startFocusGuard } from "./kbd-guard-harness";

/*
 * Keyboard audit, 12 Nov 2026, wave 2 (DEB2-10, DEB1-13): two staff and developer tools under the site's focus guard,
 * where the guard's own landing is the right one. Owner possession switches its whole form off while it runs; the
 * evaluator menu's Select switches itself off, and stays off once its model is the chosen one. The components are the
 * real ones; the API is stood in (made-up ids), as in staff-team-controls.test.tsx and evaluator-dev-menu-controls.test.tsx.
 */
const mocks = vi.hoisted(() => ({ getEvaluatorDevMenu: vi.fn(), selectEvaluatorConsumerModel: vi.fn() }));
vi.mock("@/lib/api", () => ({
  COOKIE_SESSION_MARKER: "cookie-session",
  getEvaluatorDevMenu: mocks.getEvaluatorDevMenu,
  selectEvaluatorConsumerModel: mocks.selectEvaluatorConsumerModel,
  validateSession: vi.fn().mockResolvedValue(undefined)
}));

import { OwnerPossessionPanel } from "../../apps/ui/components/OwnerPossessionPanel.js";
import { EvaluatorDevMenu } from "../../apps/ui/components/EvaluatorDevMenu.js";

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
async function mount(element: React.ReactElement) {
  const main = document.createElement("main");
  main.id = "main-content";
  document.body.append(main);
  root = createRoot(main);
  await act(async () => { root!.render(element); });
  await settle();
}

describe("DEB2-10: owner possession", () => {
  const handle = "a".repeat(43);
  it("Possess comes back to Possess once the form is on again; the receipts to pass on follow it", async () => {
    let release: () => void = () => undefined;
    const client = {
      prerequisite: vi.fn(() => new Promise((resolve) => { release = () => resolve({ prerequisite_handle: handle }); })),
      possess: vi.fn(async ({ credential_id }: { credential_id: string }) => ({ receipt_id: `receipt-${credential_id}`, expires_at: "2099-01-01T00:00:00.000Z" }))
    };
    await mount(<OwnerPossessionPanel client={client as never} catalog={enStaff} disabled={false} onAuthorityEnded={() => undefined} onBusyChange={() => undefined} />);
    const form = document.querySelector<HTMLFormElement>("[data-owner-possession]")!;
    for (const [name, value] of [["command_id", "made-up-command"], ["command_nonce", handle], ["credential_one", "aA"], ["password", "synthetic"], ["totp_code", "123456"]]) {
      form.querySelector<HTMLInputElement>(`[name="${name}"]`)!.value = value!;
    }
    const possess = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    pressByKeyboard(possess);
    await settle();
    await guardSettled();
    expect(form.querySelector("fieldset")!.disabled).toBe(true);
    await act(async () => release());
    await settle();
    await guardSettled();
    expect(form.querySelector("fieldset")!.disabled).toBe(false);
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(possess);
    const receipts = document.querySelector("[data-owner-receipts]")!;
    expect(receipts.textContent).toContain("receipt-aA");
    expect(possess.compareDocumentPosition(receipts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("DEB1-13: the evaluator menu's Select", () => {
  const view = (selected: string | null) => ({
    catalog: { state: "AVAILABLE", probeId: "probe:test", failureCode: null, models: [{ modelId: "consumer:alpha" }, { modelId: "consumer:beta" }] },
    selectedConsumer: selected === null ? null : { modelId: selected },
    dispatchBinding: { state: "UNBOUND", reason: "ROW_ABSENT", registerVersion: 1, sourceRef: null },
    harvestedRows: 0, domains: [], profiles: [], parkedRuns: []
  });

  it("the chosen row's Select stays off, so the next key rests focus on that row, and Tab carries on to the control after it", async () => {
    mocks.getEvaluatorDevMenu.mockReset().mockResolvedValueOnce(view(null)).mockResolvedValue(view("consumer:alpha"));
    mocks.selectEvaluatorConsumerModel.mockReset().mockResolvedValue(undefined);
    await mount(<EvaluatorDevMenu token="t" catalog={enSettings} />);
    const row = document.querySelector<HTMLElement>(".modelRow")!;
    const select = row.querySelector<HTMLButtonElement>("button")!;
    expect(select.textContent).toBe(enSettings["settings.evaluator.select"]);
    pressByKeyboard(select);
    await settle();
    await guardSettled();
    expect(mocks.selectEvaluatorConsumerModel).toHaveBeenCalledWith("t", "consumer:alpha");
    expect(select.disabled).toBe(true);
    expect(select.textContent).toBe(enSettings["settings.evaluator.selected"]);
    // The guard waits for the person's next key while the control may still come back; then it keeps the place.
    act(() => { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); });
    expect(document.activeElement).toBe(row);
    expect(row.hasAttribute("data-focus-parked")).toBe(true);
    // Tab does not start again from the row: it goes to the first control after the Select that is off.
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    act(() => { row.dispatchEvent(tab); });
    const landed = document.activeElement as HTMLElement;
    expect(tab.defaultPrevented).toBe(true);
    expect(landed).not.toBe(document.body);
    expect(row.contains(landed)).toBe(false);
    expect(select.compareDocumentPosition(landed) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(row.hasAttribute("data-focus-parked")).toBe(false);
    expect(row.hasAttribute("tabindex")).toBe(false);
  });
});
