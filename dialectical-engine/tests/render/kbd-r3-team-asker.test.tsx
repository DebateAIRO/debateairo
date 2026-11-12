// @vitest-environment jsdom
/*
 * Keyboard audit round 3 (2026-11-12), seen in a real browser: on the team limit and team allowance panels, Cancel in
 * the confirm is meant to give focus back to where the person asked from. The panels read "where" in an effect, after
 * the form had been switched off, and a browser has dropped focus from a switched-off control by then (jsdom has not,
 * which is why the round-2 tests passed). So Cancel left focus resting on the card instead. The place is now read at
 * the moment of asking.
 * A second fault with the same root: with nothing focused when asking (a mouse press in Safari focuses no button), the
 * panel kept the place of an EARLIER ask, and Cancel sent focus there.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import staff from "../../apps/ui/messages/en/staff.json";
import { TeamLimitPanel } from "../../apps/ui/components/TeamLimitPanel.js";
import { TeamAllowancePanel } from "../../apps/ui/components/TeamAllowancePanel.js";
import { button, expectFocusOn, guardWait, mountPage, press, typeInto, unmountPage } from "./kbd-r2-set-harness.js";
import { submitByKeyboard } from "./kbd-guard-harness.js";

const S = staff as Readonly<Record<string, string>>;

// By the time an effect of the render that switched a control off runs, a browser has taken focus from that control
// (seen in Chrome: `document.activeElement` is the page). jsdom leaves it there, and the shared fix-up
// (kbd-focus-fixup.ts) moves it only after the effects have run. So these tests drop focus the moment the control, or
// the fieldset around it, is switched off, with the fix-up's own throwaway node (its focus events are kept from the page).
const setAttribute = Element.prototype.setAttribute;
beforeEach(() => {
  Element.prototype.setAttribute = function (this: Element, name: string, value: string): void {
    setAttribute.call(this, name, value);
    const focused = document.activeElement;
    if (name !== "disabled" || !(focused instanceof HTMLElement) || !this.contains(focused)) return;
    const sink = document.createElement("span");
    sink.tabIndex = -1;
    setAttribute.call(sink, "data-focus-fixup-sink", "");
    document.body.append(sink);
    sink.focus();
    sink.remove();
  };
});
afterEach(async () => {
  Element.prototype.setAttribute = setAttribute;
  await unmountPage();
});

const OWNER = "11111111-1111-4111-8111-111111111111", MEMBER = "33333333-3333-4333-8333-333333333333";
const limitPage = {
  amount_micros: 40_000_000, revision: 3, spent_micros: 12_500_000, committed_micros: 2_250_000,
  month_starts_at: "2031-03-01T00:00:00.000Z", month_ends_at: "2031-04-01T00:00:00.000Z", is_owner: true, partner: null, log: []
};
const limitClient = () => ({
  read: vi.fn(async () => limitPage),
  team: vi.fn(async () => [{ staff_id: MEMBER, pseudonym: "member_fixture", status: "ACTIVE", capabilities: ["TEAM_READ"], grant_revision: 9, credential_count: 1, last_privilege_at: null, delivery_state: "DELIVERED" }]),
  setLimit: vi.fn(async () => undefined), pickPartner: vi.fn(async () => undefined), takeBackPartner: vi.fn(async () => undefined),
  recordPractice: vi.fn(async () => undefined), cancel: vi.fn()
});
const amount = () => document.querySelector<HTMLInputElement>("#team-limit-amount")!;
/** A press with a mouse where the browser focuses no button (Safari): a click and nothing else. */
const mouse = (control: HTMLElement) => act(async () => { control.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); });

describe("the team limit panel: Cancel goes back to where the person asked from", () => {
  it("asked with Enter in the amount box: Cancel puts focus back in the box", async () => {
    await mountPage(<TeamLimitPanel client={limitClient() as never} />);
    await typeInto(amount(), "55");
    submitByKeyboard(amount());
    await guardWait();
    expectFocusOn(button(S["staff.teamLimit.confirm"]!));
    await press(button(S["staff.teamLimit.cancel"]!));
    expect(document.querySelector("[data-team-limit-confirm]")).toBeNull();
    expectFocusOn(amount());
  });

  it("asked with the form's button: Cancel puts focus back on that button", async () => {
    await mountPage(<TeamLimitPanel client={limitClient() as never} />);
    await typeInto(amount(), "55");
    await press(button(S["staff.teamLimit.change"]!));
    expectFocusOn(button(S["staff.teamLimit.confirm"]!));
    await press(button(S["staff.teamLimit.cancel"]!));
    expectFocusOn(button(S["staff.teamLimit.change"]!));
  });

  it("asked with nothing focused: Cancel does not send focus to the place of an earlier ask", async () => {
    await mountPage(<TeamLimitPanel client={limitClient() as never} />);
    // A first ask, from the amount box, cancelled.
    await typeInto(amount(), "55");
    submitByKeyboard(amount());
    await guardWait();
    await press(button(S["staff.teamLimit.cancel"]!));
    // Then the practice charge, asked and cancelled with a mouse that focuses nothing.
    await act(async () => { (document.activeElement as HTMLElement | null)?.blur(); });
    const form = document.querySelector<HTMLFormElement>("[data-team-limit-form=practice]")!;
    await typeInto(form.querySelector<HTMLInputElement>("[name=ref]")!, "55555555-5555-4555-8555-555555555555");
    await typeInto(form.querySelector<HTMLInputElement>("[name=amount]")!, "1");
    await act(async () => { (document.activeElement as HTMLElement | null)?.blur(); });
    await mouse(button(S["staff.teamLimit.practice.add"]!));
    expect(document.querySelector("[data-team-limit-confirm]")).not.toBeNull();
    await act(async () => { (document.activeElement as HTMLElement | null)?.blur(); });
    await mouse(button(S["staff.teamLimit.cancel"]!));
    expect(document.querySelector("[data-team-limit-confirm]")).toBeNull();
    expect(document.activeElement).not.toBe(amount());
  });
});

const HOLDER = "44444444-4444-4444-8444-444444444444";
const allowancePage = {
  limits: { maximum_grant_micros: 50_000_000, maximum_day_micros: 5_000_000, maximum_week_micros: 20_000_000, maximum_lifetime_ms: 2_592_000_000 },
  members: [
    { staff_id: OWNER, pseudonym: "owner_fixture", is_owner: true, revision: 0, allowance: null },
    { staff_id: MEMBER, pseudonym: "member_fixture", is_owner: false, revision: 2, allowance: null },
    { staff_id: HOLDER, pseudonym: "holder_fixture", is_owner: false, revision: 4, allowance: { grant_id: "55555555-5555-4555-8555-555555555555", amount_micros: 30_000_000, day_micros: 3_000_000, week_micros: 10_000_000, starts_at: "2031-03-01T00:00:00.000Z", expires_at: "2031-03-20T00:00:00.000Z", spent_micros: 1_250_000 } }
  ],
  log: []
};
const allowanceClient = () => ({ read: vi.fn(async () => allowancePage), give: vi.fn(async () => undefined), takeBack: vi.fn(async () => undefined), cancel: vi.fn() });

describe("the team allowance panel: Cancel goes back to where the person asked from", () => {
  it("Give a quota: Cancel puts focus back on Give a quota", async () => {
    await mountPage(<TeamAllowancePanel client={allowanceClient() as never} />);
    await typeInto(document.querySelector<HTMLSelectElement>("#team-allowance-person")!, MEMBER);
    for (const [id, value] of [["amount", "20"], ["day", "2"], ["week", "8"]] as const) await typeInto(document.querySelector<HTMLInputElement>(`#team-allowance-${id}`)!, value);
    const give = () => button(S["staff.teamAllowance.give"]!, document.querySelector("[data-team-allowance-form]")!);
    await press(give());
    expectFocusOn(button(S["staff.teamAllowance.confirm"]!));
    await press(button(S["staff.teamAllowance.cancel"]!));
    expectFocusOn(give());
  });

  it("a row's Take it back: Cancel puts focus back on that row's button", async () => {
    await mountPage(<TeamAllowancePanel client={allowanceClient() as never} />);
    const row = document.querySelector(`[data-team-allowance-member="${HOLDER}"]`)!;
    await press(button(S["staff.teamAllowance.takeBack"]!, row));
    expectFocusOn(button(S["staff.teamAllowance.confirm"]!));
    await press(button(S["staff.teamAllowance.cancel"]!));
    expectFocusOn(button(S["staff.teamAllowance.takeBack"]!, row));
  });
});
