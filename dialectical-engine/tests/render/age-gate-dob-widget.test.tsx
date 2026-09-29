// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkDob, type DobErrorCode, type DobParts } from "@debateai/kernel";
import { DateOfBirthField, EMPTY_DOB } from "../../apps/ui/components/DateOfBirthField.js";
import { resolveDobLocale, type DobLocale } from "../../apps/ui/lib/dob/dobLocale.js";
import english from "../../apps/ui/messages/en/auth.json";
import arabic from "../../apps/ui/messages/ar/auth.json";

/* Age gate — the date-of-birth widget (Turn 8 · 8d typed + select, 8f states, 8g order, 8l a11y). */

let root: Root;
let host: HTMLDivElement;
let latest: DobParts = EMPTY_DOB;

function Harness({ locale, catalog }: Readonly<{ locale: DobLocale; catalog: Record<string, string> }>) {
  const [value, setValue] = useState<DobParts>(EMPTY_DOB);
  const [error, setError] = useState<DobErrorCode | null>(null);
  latest = value;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const result = checkDob(value);
        setError(result.code === "ok" ? null : result.code);
      }}
    >
      <DateOfBirthField
        catalog={catalog}
        locale={locale}
        value={value}
        error={error}
        onChange={(next) => { setValue(next); setError(null); }}
      />
      <button type="submit">go</button>
    </form>
  );
}

async function mount(localeTag = "en", acceptLanguage: string | null = null, catalog: Record<string, string> = english) {
  await act(async () => root.render(<Harness locale={resolveDobLocale(localeTag, acceptLanguage)} catalog={catalog} />));
}

const input = (part: "d" | "m" | "y") => host.querySelector<HTMLInputElement>(`input[name="dob-${part}"]`)!;
const toggle = (part: "d" | "m" | "y") => input(part).parentElement!.querySelector<HTMLButtonElement>("button.dobPickerToggle")!;
const message = () => host.querySelector<HTMLParagraphElement>("#dob-msg")!;
const order = () => Array.from(host.querySelectorAll<HTMLInputElement>("input.dobInput"), (element) => element.name.slice(4));
const focused = () => (document.activeElement as HTMLInputElement | null)?.name;

async function setValue(part: "d" | "m" | "y", value: string): Promise<void> {
  await act(async () => {
    const element = input(part);
    element.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Types one character at a time into whichever field has focus, as a keyboard would. */
async function typeKeys(text: string): Promise<void> {
  for (const character of text) {
    const element = document.activeElement as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, element.value + character);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
}

async function paste(part: "d" | "m" | "y", text: string): Promise<void> {
  await act(async () => {
    const element = input(part);
    element.focus();
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { getData: () => text } });
    const allowed = element.dispatchEvent(event);
    if (allowed) {
      // The browser's default action for a paste the widget did not take over.
      const digits = text.slice(0, element.maxLength);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, digits);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
}

async function key(target: Element, keyName: string, init: KeyboardEventInit = {}): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: keyName, bubbles: true, cancelable: true, ...init }));
  });
}

async function click(target: Element): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    (target as HTMLElement).click();
  });
  await act(async () => { await Promise.resolve(); });
}

async function submit(): Promise<void> {
  await act(async () => {
    host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  latest = EMPTY_DOB;
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("markup contract (8l)", () => {
  it("is one fieldset with a legend, three labelled numeric inputs and a live validity line", async () => {
    await mount();
    const fieldset = host.querySelector("fieldset")!;
    expect(fieldset.querySelector("legend")!.textContent).toBe("Date of birth");
    for (const [part, label, auto] of [["d", "Day", "bday-day"], ["m", "Month", "bday-month"], ["y", "Year", "bday-year"]] as const) {
      expect(input(part).labels?.[0]?.textContent).toBe(label);
      expect(input(part).inputMode).toBe("numeric");
      expect(input(part).autocomplete).toBe(auto);
      expect(input(part).getAttribute("dir")).toBe("ltr");
      expect(input(part).value).toBe("");
      expect(input(part).placeholder).toBe("");
      expect(toggle(part).type).toBe("button");
      expect(toggle(part).getAttribute("aria-label")).toBe(label);
      expect(toggle(part).getAttribute("aria-expanded")).toBe("false");
    }
    expect(message().getAttribute("aria-live")).toBe("polite");
    expect(message().textContent).toBe("");
    expect(fieldset.textContent).not.toMatch(/18/);
  });
});

describe("field order per locale (8g)", () => {
  it.each([
    ["en", "en-GB,en;q=0.9", ["d", "m", "y"]],
    ["en", "en-US,en;q=0.9", ["m", "d", "y"]],
    ["ja", null, ["y", "m", "d"]],
    ["hu", null, ["y", "m", "d"]],
    ["ar", null, ["d", "m", "y"]]
  ] as const)("%s (%s)", async (locale, acceptLanguage, expected) => {
    await mount(locale, acceptLanguage, locale === "ar" ? arabic : english);
    expect(order()).toEqual(expected);
  });

  it("puts Arabic in a right-to-left container with left-to-right digits", async () => {
    await mount("ar", null, arabic);
    expect(host.querySelector("fieldset")!.getAttribute("dir")).toBe("rtl");
    expect(input("d").getAttribute("dir")).toBe("ltr");
    expect(host.querySelector("legend")!.textContent).toBe("تاريخ الميلاد");
  });
});

describe("typing", () => {
  it("auto-advances after two day digits, two month digits, and stops after four year digits", async () => {
    await mount();
    await act(async () => input("d").focus());
    await typeKeys("14");
    expect(focused()).toBe("dob-m");
    await typeKeys("03");
    expect(focused()).toBe("dob-y");
    await typeKeys("1998");
    expect(focused()).toBe("dob-y");
    expect(latest).toEqual({ d: "14", m: "03", y: "1998" });
    expect(message().textContent).toBe("✓ Valid date");
    expect(message().dataset.state).toBe("ok");
  });

  it("follows the en-US order when advancing", async () => {
    await mount("en", "en-US");
    await act(async () => input("m").focus());
    await typeKeys("0314");
    expect(focused()).toBe("dob-y");
    expect(latest).toEqual({ d: "14", m: "03", y: "" });
  });

  it("pads a single 4-9 day and a single 2-9 month to 0X and moves on", async () => {
    await mount();
    await act(async () => input("d").focus());
    await typeKeys("4");
    expect(input("d").value).toBe("04");
    expect(focused()).toBe("dob-m");
    await typeKeys("7");
    expect(input("m").value).toBe("07");
    expect(focused()).toBe("dob-y");
  });

  it("keeps a single 1-3 day and a single 0-1 month waiting for a second digit", async () => {
    await mount();
    await act(async () => input("d").focus());
    await typeKeys("3");
    expect(input("d").value).toBe("3");
    expect(focused()).toBe("dob-d");
    await setValue("m", "1");
    expect(input("m").value).toBe("1");
    expect(focused()).toBe("dob-m");
  });

  it("accepts digits only", async () => {
    await mount();
    await setValue("d", "a1");
    expect(input("d").value).toBe("1");
  });

  it("moves back on Backspace in an empty field, and never advances on deletion", async () => {
    await mount();
    await setValue("d", "14");
    await act(async () => input("m").focus());
    await key(input("m"), "Backspace");
    expect(focused()).toBe("dob-d");
    await setValue("d", "45");
    // Deleting one digit of "45" leaves a lone 4: no padding and no jump.
    await act(async () => input("d").focus());
    await setValue("d", "4");
    expect(input("d").value).toBe("4");
    expect(focused()).toBe("dob-d");
  });
});

describe("paste of a full date fills all three", () => {
  const formats = ["14/03/1998", "14.03.1998", "1998-03-14", "14031998", "19980314"];
  for (const part of ["d", "m", "y"] as const) {
    it.each(formats)(`into the ${part} field: %s`, async (text) => {
      await mount();
      await paste(part, text);
      expect(latest).toEqual({ d: "14", m: "03", y: "1998" });
      expect([input("d").value, input("m").value, input("y").value]).toEqual(["14", "03", "1998"]);
    });
  }

  it("reads day/month order from the locale (en-US month first)", async () => {
    await mount("en", "en-US");
    await paste("d", "03/04/1998");
    expect(latest).toEqual({ d: "04", m: "03", y: "1998" });
  });

  it("does not auto-advance on a partial paste", async () => {
    await mount();
    await paste("d", "14");
    expect(input("d").value).toBe("14");
    expect(focused()).toBe("dob-d");
  });
});

describe("pickers", () => {
  it("day: a 7-column grid of 1-31; a pick fills the field, closes and moves on", async () => {
    await mount();
    await click(toggle("d"));
    expect(toggle("d").getAttribute("aria-expanded")).toBe("true");
    const grid = host.querySelector<HTMLElement>('[role="listbox"]')!;
    expect(grid.style.gridTemplateColumns).toBe("repeat(7, 1fr)");
    const cells = Array.from(grid.querySelectorAll('[role="option"]'), (cell) => cell.textContent);
    expect(cells).toEqual(Array.from({ length: 31 }, (_, i) => String(i + 1)));
    await click(grid.querySelectorAll('[role="option"]')[13]!);
    expect(latest.d).toBe("14");
    expect(host.querySelector('[role="listbox"]')).toBeNull();
    expect(focused()).toBe("dob-m");
  });

  it("month: 3 columns of localized short month names", async () => {
    await mount();
    await click(toggle("m"));
    const grid = host.querySelector<HTMLElement>('[role="listbox"]')!;
    expect(grid.style.gridTemplateColumns).toBe("repeat(3, 1fr)");
    const cells = Array.from(grid.querySelectorAll('[role="option"]'), (cell) => cell.textContent);
    expect(cells).toHaveLength(12);
    expect(cells[2]).toBe(new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2000, 2, 1))));
    await click(grid.querySelectorAll('[role="option"]')[2]!);
    expect(latest.m).toBe("03");
    expect(focused()).toBe("dob-y");
  });

  it("year: opens two decades back when empty, disables the future and pre-1900, and turns decades", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(Date.UTC(2026, 8, 28)) });
    await mount();
    await click(toggle("y"));
    const cellsText = () => Array.from(host.querySelectorAll('[role="option"]'), (cell) => cell.textContent);
    expect(cellsText()).toEqual(Array.from({ length: 10 }, (_, i) => String(2000 + i)));
    expect(host.querySelector<HTMLElement>('[role="listbox"]')!.style.gridTemplateColumns).toBe("repeat(5, 1fr)");
    const next = host.querySelector<HTMLButtonElement>('button[aria-label="Next decade"]')!;
    await click(next);
    await click(next);
    expect(cellsText()[0]).toBe("2020");
    const disabled = Array.from(host.querySelectorAll('[role="option"][aria-disabled="true"]'), (cell) => cell.textContent);
    expect(disabled).toEqual(["2027", "2028", "2029"]);
    expect(next.disabled).toBe(true);
    await click(host.querySelector('[role="option"][aria-disabled="true"]')!);
    expect(latest.y).toBe("");
    expect(host.querySelector('[role="listbox"]')).not.toBeNull();
    await click(host.querySelectorAll('[role="option"]')[6]!);
    expect(latest.y).toBe("2026");
  });

  it("year: opens on the typed year's decade and never goes before 1900", async () => {
    await mount();
    await setValue("y", "1905");
    await click(toggle("y"));
    expect(host.querySelector('[role="option"]')!.textContent).toBe("1900");
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="Previous decade"]')!.disabled).toBe(true);
    expect(host.querySelector('[role="option"][aria-selected="true"]')!.textContent).toBe("1905");
  });

  it("is keyboard-navigable: arrows move, Enter picks, Esc closes back to the input", async () => {
    await mount();
    await click(toggle("d"));
    const active = () => document.activeElement as HTMLElement;
    expect(active().textContent).toBe("1");
    await key(active(), "ArrowRight");
    expect(active().textContent).toBe("2");
    await key(active(), "ArrowDown");
    expect(active().textContent).toBe("9");
    await key(active(), "Enter");
    await act(async () => { await Promise.resolve(); });
    expect(latest.d).toBe("09");
    expect(focused()).toBe("dob-m");
    await click(toggle("m"));
    await key(document.activeElement!, "Escape");
    expect(host.querySelector('[role="listbox"]')).toBeNull();
    expect(focused()).toBe("dob-m");
  });

  it("closes on an outside click", async () => {
    await mount();
    await click(toggle("d"));
    await act(async () => { document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); });
    expect(host.querySelector('[role="listbox"]')).toBeNull();
  });
});

describe("validation messages (first that applies)", () => {
  const cases: readonly [string, DobParts, string, readonly string[]][] = [
    ["incomplete", { d: "14", m: "", y: "1998" }, "✗ Enter the day, month and year.", ["m"]],
    ["before 1900", { d: "14", m: "03", y: "1890" }, "✗ Enter a year from 1900 onwards.", ["y"]],
    ["impossible 31/02", { d: "31", m: "02", y: "2001" }, "✗ That date doesn't exist. Check the day and month.", ["d", "m"]],
    ["impossible 29/02 non-leap", { d: "29", m: "02", y: "2001" }, "✗ That date doesn't exist. Check the day and month.", ["d", "m"]],
    ["future", { d: "14", m: "03", y: "2031" }, "✗ That date is in the future.", ["y"]]
  ];
  it.each(cases)("%s", async (_name, parts, text, invalid) => {
    await mount();
    for (const part of ["d", "m", "y"] as const) if (parts[part]) await setValue(part, parts[part]);
    await submit();
    expect(message().textContent).toBe(text);
    expect(message().dataset.state).toBe("bad");
    for (const part of ["d", "m", "y"] as const) {
      expect(input(part).getAttribute("aria-invalid")).toBe(invalid.includes(part) ? "true" : null);
      expect(input(part).getAttribute("aria-describedby")).toBe(invalid.includes(part) ? "dob-msg" : null);
    }
  });

  it("accepts 29/02 in a leap year", async () => {
    await mount();
    await paste("d", "29/02/2000");
    await submit();
    expect(message().textContent).toBe("✓ Valid date");
  });

  it("uses the month-first wording in en-US", async () => {
    await mount("en", "en-US");
    await submit();
    expect(message().textContent).toBe("✗ Enter the month, day and year.");
  });

  it("clears the error as soon as the user edits", async () => {
    await mount();
    await submit();
    expect(message().dataset.state).toBe("bad");
    await setValue("d", "1");
    expect(message().textContent).toBe("");
    expect(input("d").getAttribute("aria-invalid")).toBeNull();
  });
});
