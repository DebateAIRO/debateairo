// @vitest-environment jsdom
vi.mock("@/components/auth/TurnstileChallenge", async () => { const { useEffect } = await import("react"); return { TurnstileChallenge: ({ onToken }: { onToken: (token: string) => void }) => { useEffect(() => onToken("test-proof"), [onToken]); return null; } }; });
// Keyboard audit 2026-11-12 (AUTH-17, AUTH-20): the date-of-birth year grid's decade buttons threw focus into the
// grid and Escape worked only on the inputs and cells; a failed submit always focused the "day" box, whatever the
// locale's order and whichever part was wrong.
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DobParts } from "@debateai/kernel";
import { DateOfBirthField, EMPTY_DOB, firstFlaggedDobSelector } from "../../apps/ui/components/DateOfBirthField.js";
import { AgeConfirmationFlow } from "../../apps/ui/components/AgeConfirmationFlow.js";
import { SignUpFlow } from "../../apps/ui/components/SignUpFlow.js";
import { resolveDobLocale } from "../../apps/ui/lib/dob/dobLocale.js";
import english from "../../apps/ui/messages/en/auth.json";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function Harness() {
  const [value, setValue] = useState<DobParts>(EMPTY_DOB);
  return <DateOfBirthField catalog={english} locale={resolveDobLocale("en")} value={value} error={null} onChange={setValue} />;
}
const input = (part: "d" | "m" | "y") => host.querySelector<HTMLInputElement>(`input[name="dob-${part}"]`)!;
const toggle = (part: "d" | "m" | "y") => input(part).parentElement!.querySelector<HTMLButtonElement>("button.dobPickerToggle")!;
const decadeButton = (label: "Previous decade" | "Next decade") => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const years = () => Array.from(host.querySelectorAll('[role="option"]'), (cell) => cell.textContent);
async function key(target: Element, name: string): Promise<void> {
  await act(async () => { target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true })); });
}
/** A keyboard press on a button: it holds focus, then activates. */
async function press(button: HTMLButtonElement): Promise<void> {
  button.focus();
  await act(async () => button.click());
}
async function setValue(name: string, value: string): Promise<void> {
  const field = host.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit(): Promise<void> {
  await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  await act(async () => { await Promise.resolve(); });
}
const focusedName = () => (document.activeElement as HTMLInputElement | null)?.name;

describe("AUTH-17 year grid", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"], now: new Date(Date.UTC(2026, 8, 28)) }); });

  it("a decade button keeps focus so it can be pressed again", async () => {
    await act(async () => root.render(<Harness />));
    await press(toggle("y"));
    const previous = decadeButton("Previous decade");
    await press(previous);
    expect(years()[0]).toBe("1990");
    expect(document.activeElement).toBe(previous);
    await press(previous);
    expect(years()[0]).toBe("1980");
    expect(document.activeElement).toBe(previous);
  });

  it("the button that reaches the last decade hands focus to the grid", async () => {
    await act(async () => root.render(<Harness />));
    await press(toggle("y"));
    const next = decadeButton("Next decade");
    await press(next);
    expect(document.activeElement).toBe(next);
    await press(next);
    expect(next.disabled).toBe(true);
    expect((document.activeElement as HTMLElement).getAttribute("role")).toBe("option");
  });

  it.each(["Previous decade", "Next decade"] as const)("Escape on the %s button closes the grid back to the year box", async (label) => {
    await act(async () => root.render(<Harness />));
    await press(toggle("y"));
    decadeButton(label).focus();
    await key(decadeButton(label), "Escape");
    expect(host.querySelector('[role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(input("y"));
  });

  it("Escape on the open toggle closes the grid back to its box", async () => {
    await act(async () => root.render(<Harness />));
    await press(toggle("m"));
    toggle("m").focus();
    await key(toggle("m"), "Escape");
    expect(host.querySelector('[role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(input("m"));
  });

  it("PageUp and PageDown in the year grid turn the decade and keep focus in the grid", async () => {
    await act(async () => root.render(<Harness />));
    await press(toggle("y"));
    await key(document.activeElement!, "ArrowRight");
    expect(document.activeElement!.textContent).toBe("2001");
    await key(document.activeElement!, "PageUp");
    expect(years()[0]).toBe("1990");
    expect(document.activeElement!.textContent).toBe("1991");
    await key(document.activeElement!, "PageDown");
    await key(document.activeElement!, "PageDown");
    expect(years()[0]).toBe("2010");
    expect(document.activeElement!.textContent).toBe("2011");
  });
});

describe("AUTH-20 first flagged part", () => {
  it("the helper follows the locale's order and the parts the check flags", () => {
    const us = resolveDobLocale("en", "en-US").order;
    const gb = resolveDobLocale("en").order;
    expect(firstFlaggedDobSelector(EMPTY_DOB, us)).toBe("[name=dob-m]");
    expect(firstFlaggedDobSelector(EMPTY_DOB, gb)).toBe("[name=dob-d]");
    expect(firstFlaggedDobSelector({ d: "14", m: "", y: "1998" }, gb)).toBe("[name=dob-m]");
    expect(firstFlaggedDobSelector({ d: "14", m: "03", y: "1890" }, gb)).toBe("[name=dob-y]");
    expect(firstFlaggedDobSelector({ d: "31", m: "02", y: "2001" }, us)).toBe("[name=dob-m]");
    // Under age: every part is marked, so the first box in the locale's order.
    expect(firstFlaggedDobSelector({ d: "14", m: "03", y: "2020" }, us)).toBe("[name=dob-m]");
  });

  it("the age check moves focus to the first flagged part of an incomplete date", async () => {
    const client = { readAgeConfirmation: vi.fn().mockResolvedValue({ status: "required" }), confirmAge: vi.fn() };
    await act(async () => root.render(<AgeConfirmationFlow client={client as any} dobLocale={resolveDobLocale("en", "en-US")} onConfirmed={vi.fn()} onSignedOut={vi.fn()} />));
    await setValue("dob-m", "03");
    host.querySelector<HTMLButtonElement>("button.authPrimary")!.focus();
    await submit();
    expect(focusedName()).toBe("dob-d");
    expect(client.confirmAge).not.toHaveBeenCalled();
  });

  it("sign-up focuses the year when only the year is wrong", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(Date.UTC(2026, 8, 29, 12)) });
    const client = { register: vi.fn(), checkAge: vi.fn(), authProviders: async () => ({ providers: [] }) };
    await act(async () => root.render(<SignUpFlow turnstile={{ siteKey: "test-site", nonce: "test-nonce" }} client={client as any} />));
    await setValue("email", "adult@example.test");
    await setValue("password", "Correct horse 7!");
    await setValue("dob-d", "14");
    await setValue("dob-m", "03");
    await setValue("dob-y", "1890");
    await submit();
    expect(focusedName()).toBe("dob-y");
    expect(client.register).not.toHaveBeenCalled();
  });
});
