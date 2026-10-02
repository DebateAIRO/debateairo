// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REGION_CONTINENTS, US_STATE_CODES, US_STATES, regionFlag } from "@debateai/kernel";
import { ContractHttpError } from "@debateai/contract";
import { SignUpFlow } from "../../apps/ui/components/SignUpFlow.js";
import { pickRegion } from "../support/signupRegion.js";
import english from "../../apps/ui/messages/en/auth.json";
import romanian from "../../apps/ui/messages/ro/auth.json";

let root: Root;
let host: HTMLDivElement;
const query = <T extends Element>(selector: string): T => {
  const match = host.querySelector<T>(selector);
  expect(match, `missing ${selector}`).not.toBeNull();
  return match!;
};
const all = <T extends Element>(selector: string): T[] => Array.from(host.querySelectorAll<T>(selector));

async function click(selector: string): Promise<void> {
  await act(async () => query<HTMLElement>(selector).click());
}
async function key(selector: string, value: string): Promise<void> {
  await act(async () => query<HTMLElement>(selector).dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true })));
}
async function insidePress(selector: string): Promise<void> {
  const target = query<HTMLElement>(selector);
  await act(async () => target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true })));
  await act(async () => (document.activeElement as HTMLElement | null)?.blur());
  await act(async () => {
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}
async function mountRegion(locale = "en"): Promise<void> {
  const specifier = "../../apps/ui/components/" + "RegionField.js";
  const { RegionField, EMPTY_REGION_PICK } = await import(/* @vite-ignore */ specifier);
  function Controlled() {
    const [value, onChange] = useState(EMPTY_REGION_PICK);
    return <RegionField catalog={locale === "ro" ? romanian : english} locale={locale} value={value} onChange={onChange} disabled={false} />;
  }
  await act(async () => root.render(<Controlled />));
}
const checkAge = vi.fn();
const register = vi.fn();
async function mountFlow(key = "initial"): Promise<void> {
  checkAge.mockReset().mockResolvedValue({ outcome: "allowed" });
  register.mockReset().mockResolvedValue({ message: "Registration sent" });
  await act(async () => root.render(<SignUpFlow key={key} catalog={english} client={{ checkAge, register }} />));
}
async function fillFlow(): Promise<void> {
  for (const [name, value] of [["dob-d", "01"], ["dob-m", "01"], ["dob-y", "1990"]] as const) {
    const input = query<HTMLInputElement>(`input[name="${name}"]`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  for (const [name, value] of [["email", "person@example.test"], ["confirm-email", "person@example.test"], ["recovery-email", "recovery@example.test"], ["password", "Passw0rd!"], ["confirm-password", "Passw0rd!"]] as const) {
    query<HTMLInputElement>(`input[name="${name}"]`).value = value;
  }
  for (const name of ["privacy-accepted", "terms-accepted"]) query<HTMLInputElement>(`input[name="${name}"]`).checked = true;
}
async function submitFlow(): Promise<void> {
  await act(async () => { query<HTMLFormElement>('form[data-form="signup"]').dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}
async function pick(continent: string, code: string): Promise<void> {
  await click("#signup-region-trigger");
  await click(`.regionContinent[data-continent="${continent}"]`);
  await click(`.regionCountry[data-code="${code}"]`);
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("RegionField artboard states", () => {
  it("E1 places one region field between confirmation and date of birth", async () => {
    await mountFlow();
    const form = query<HTMLFormElement>('form[data-form="signup"]');
    const confirmation = query("#signup-confirm-password");
    const region = query("#signup-region-trigger");
    const date = query(".dobFieldset");
    expect(form.querySelectorAll(".regionField")).toHaveLength(1);
    expect(confirmation.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(region.compareDocumentPosition(date) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("E2 renders a labelled empty trigger without picked-only content", async () => {
    await mountRegion();
    expect(query<HTMLLabelElement>('label[for="signup-region-trigger"]').textContent).toBe("Region");
    const trigger = query<HTMLButtonElement>("#signup-region-trigger");
    expect(trigger.type).toBe("button");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.textContent).toContain("Select your region");
    expect(trigger.textContent).toContain("▾");
    for (const selector of [".regionFlag", ".regionPath", ".regionPopover", "#signup-region-state"]) expect(host.querySelector(selector)).toBeNull();
  });

  it("E3 opens the seven continent rows in design order with their counts", async () => {
    await mountRegion();
    await click("#signup-region-trigger");
    expect(query("#signup-region-trigger").getAttribute("aria-expanded")).toBe("true");
    expect(query("#signup-region-trigger").getAttribute("aria-controls")).toBe("signup-region-popover");
    expect(query(".regionHeader").textContent).toBe("CONTINENT");
    expect(all<HTMLElement>(".regionContinent .regionContinentName").map((row) => row.textContent)).toEqual([...REGION_CONTINENTS]);
    expect(all<HTMLElement>(".regionContinent .regionCount").map((row) => row.textContent)).toEqual(["12", "12", "33", "10", "5", "7", "3"]);
    expect(all<HTMLElement>(".regionContinent").every((row) => row.textContent?.endsWith("›"))).toBe(true);
  });

  it("E4 shows the English Europe grid and returns to continents", async () => {
    await mountRegion();
    await click("#signup-region-trigger");
    await click('.regionContinent[data-continent="Europe"]');
    expect(query(".regionBack").textContent).toBe("‹ Continents");
    expect(query(".regionContinentTitle").textContent).toBe("Europe");
    const cells = all<HTMLElement>(".regionCountry");
    expect(cells).toHaveLength(33);
    expect([cells[0]?.dataset.code, cells[0]?.querySelector(".regionCellName")?.textContent]).toEqual(["AT", "Austria"]);
    expect([cells.at(-1)?.dataset.code, cells.at(-1)?.querySelector(".regionCellName")?.textContent]).toEqual(["GB", "United Kingdom"]);
    for (const cell of cells) expect(cell.querySelector(".regionCellFlag")?.textContent).toBe(regionFlag(cell.dataset.code!));
    await click(".regionBack");
    expect(all(".regionContinent")).toHaveLength(7);
  });

  it("E5 shows a picked Romanian flag, name and continent path", async () => {
    await mountRegion();
    await pick("Europe", "RO");
    expect(query("#signup-region-trigger").getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelector(".regionPopover")).toBeNull();
    expect(query(".regionFlag").textContent).toBe("🇷🇴");
    expect(query(".regionName").textContent).toBe("Romania");
    expect(query(".regionPath").textContent).toBe("Europe · RO");
  });

  it("E6 reopens the picked continent and marks only that cell", async () => {
    await mountRegion();
    await pick("Europe", "RO");
    await click("#signup-region-trigger");
    expect(host.querySelector(".regionHeader")).toBeNull();
    expect(query('.regionCountry[data-code="RO"]').getAttribute("data-picked")).toBe("true");
    expect(all<HTMLElement>('.regionCountry[data-picked="false"]')).toHaveLength(32);
  });

  it("E7 closes by trigger, Escape and outside press while keeping the pick", async () => {
    await mountRegion();
    await pick("Europe", "RO");
    await click("#signup-region-trigger");
    await click("#signup-region-trigger");
    expect(host.querySelector(".regionPopover")).toBeNull();
    await click("#signup-region-trigger");
    await key(".regionPopover", "Escape");
    expect(host.querySelector(".regionPopover")).toBeNull();
    expect(document.activeElement).toBe(query("#signup-region-trigger"));
    await click("#signup-region-trigger");
    await act(async () => query(".regionPopover").dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    expect(host.querySelector(".regionPopover")).not.toBeNull();
    await act(async () => document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    expect(host.querySelector(".regionPopover")).toBeNull();
    expect(query(".regionName").textContent).toBe("Romania");
  });

  it("P4 keeps the picked path while browsing a different continent", async () => {
    await mountRegion();
    await pick("Europe", "RO");
    await click("#signup-region-trigger");
    await click(".regionBack");
    await click('.regionContinent[data-continent="Asia"]');
    await click("#signup-region-trigger");
    expect(query(".regionPath").textContent).toBe("Europe · RO");
    await click("#signup-region-trigger");
    expect(query(".regionContinentTitle").textContent).toBe("Europe");
  });

  it("P6 closes on Escape even when focus has left a pointer-opened popover", async () => {
    await mountRegion();
    await click("#signup-region-trigger");
    (document.activeElement as HTMLElement | null)?.blur();
    await act(async () => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(host.querySelector(".regionPopover")).toBeNull();
  });

  it("P16 closes when Tab exits the final continent row", async () => {
    await mountRegion();
    await click("#signup-region-trigger");
    await key('.regionContinent[data-continent="Oceania"]', "Tab");
    expect(host.querySelector(".regionPopover")).toBeNull();
  });

  it("Q1 keeps the list open when an inside header or padding press moves focus to body", async () => {
    await mountRegion();
    query<HTMLButtonElement>("#signup-region-trigger").focus();
    await click("#signup-region-trigger");
    await insidePress(".regionHeader");
    expect(host.querySelector(".regionPopover"), "inside header press").not.toBeNull();
    query<HTMLButtonElement>("#signup-region-trigger").focus();
    await insidePress(".regionPopover");
    expect(host.querySelector(".regionPopover"), "inside padding press").not.toBeNull();
  });

  it("Q2 keeps the grid open when an inside title or gap press moves focus to body", async () => {
    await mountRegion();
    await click("#signup-region-trigger");
    await click('.regionContinent[data-continent="Europe"]');
    expect(document.activeElement).toBe(query(".regionBack"));
    await insidePress(".regionContinentTitle");
    expect(host.querySelector(".regionPopover"), "inside title press").not.toBeNull();
    query<HTMLButtonElement>(".regionBack").focus();
    await insidePress(".regionGrid");
    expect(host.querySelector(".regionPopover"), "inside grid gap press").not.toBeNull();
  });

  it("Q3 closes on Tab from the final country cell but stays open from the previous cell", async () => {
    await mountRegion();
    await click("#signup-region-trigger");
    await click('.regionContinent[data-continent="Europe"]');
    const cells = all<HTMLButtonElement>(".regionCountry");
    await key(`.regionCountry[data-code="${cells.at(-2)!.dataset.code}"]`, "Tab");
    expect(host.querySelector(".regionPopover")).not.toBeNull();
    await key(`.regionCountry[data-code="${cells.at(-1)!.dataset.code}"]`, "Tab");
    expect(host.querySelector(".regionPopover")).toBeNull();
  });

  it("Q4 closes on Shift+Tab from the trigger, but stays open from the first row", async () => {
    await mountRegion();
    await click("#signup-region-trigger");
    const shiftTab = async (selector: string) => act(async () => query<HTMLElement>(selector).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })
    ));
    await shiftTab('.regionContinent[data-continent="Africa"]');
    expect(host.querySelector(".regionPopover")).not.toBeNull();
    await shiftTab("#signup-region-trigger");
    expect(host.querySelector(".regionPopover")).toBeNull();
  });

  it("E8 activates focusable rows and back controls with Enter and Space", async () => {
    await mountRegion();
    await click("#signup-region-trigger");
    const continent = query<HTMLButtonElement>('.regionContinent[data-continent="Europe"]');
    expect(continent.type).toBe("button");
    expect(continent.disabled).toBe(false);
    expect(continent.tabIndex).not.toBe(-1);
    await key('.regionContinent[data-continent="Europe"]', "Enter");
    expect(document.activeElement).toBe(query(".regionBack"));
    const country = query<HTMLButtonElement>('.regionCountry[data-code="RO"]');
    expect(country.type).toBe("button");
    expect(country.disabled).toBe(false);
    expect(country.tabIndex).not.toBe(-1);
    await key('.regionCountry[data-code="RO"]', " ");
    expect(query(".regionName").textContent).toBe("Romania");
    expect(document.activeElement).toBe(query("#signup-region-trigger"));
    await click("#signup-region-trigger");
    const back = query<HTMLButtonElement>(".regionBack");
    expect(back.type).toBe("button");
    expect(back.disabled).toBe(false);
    expect(back.tabIndex).not.toBe(-1);
    await key(".regionBack", "Enter");
    expect(document.activeElement).toBe(query(".regionContinent"));
  });

  it("E9 gates the 51 US states, clears after leaving the US and retains on re-pick", async () => {
    await mountRegion();
    await pick("North America", "US");
    expect(query<HTMLLabelElement>('label[for="signup-region-state"]').textContent).toBe("State");
    const select = query<HTMLSelectElement>("#signup-region-state");
    expect(Array.from(select.options, (option) => option.value)).toEqual(["", ...US_STATE_CODES]);
    expect(Array.from(select.options, (option) => option.textContent)).toEqual(["Select a state", ...US_STATES.map((state) => state.name)]);
    expect(select.dataset.state).toBe("bad");
    expect(query('.authValidity[data-state="bad"]').textContent).toBe("✗ Select your state.");
    await act(async () => { select.value = "CA"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(query<HTMLSelectElement>("#signup-region-state").dataset.state).toBe("ok");
    expect(query('.authValidity[data-state="ok"]').textContent).toBe("✓ Region complete");
    await click("#signup-region-trigger");
    await click(".regionBack");
    await click('.regionContinent[data-continent="Europe"]');
    await click('.regionCountry[data-code="RO"]');
    expect(host.querySelector("#signup-region-state")).toBeNull();
    await click("#signup-region-trigger");
    await click(".regionBack");
    await click('.regionContinent[data-continent="North America"]');
    await click('.regionCountry[data-code="US"]');
    expect(query<HTMLSelectElement>("#signup-region-state").value).toBe("");
    const again = query<HTMLSelectElement>("#signup-region-state");
    await act(async () => { again.value = "TX"; again.dispatchEvent(new Event("change", { bubbles: true })); });
    await click("#signup-region-trigger");
    await click('.regionCountry[data-code="US"]');
    expect(query<HTMLSelectElement>("#signup-region-state").value).toBe("TX");
  });

  it("E10 localizes Romanian continent and country names while state names stay English", async () => {
    await mountRegion("ro");
    await click("#signup-region-trigger");
    expect(all(".regionContinentName").map((row) => row.textContent)).toEqual(REGION_CONTINENTS.map((continent) => romanian[`auth.region.continent.${continent === "Middle East" ? "middleEast" : continent === "North America" ? "northAmerica" : continent === "South America" ? "southAmerica" : continent.toLowerCase()}` as keyof typeof romanian]));
    await click('.regionContinent[data-continent="Europe"]');
    const names = all(".regionCellName").map((row) => row.textContent!);
    expect(names).toContain("Germania");
    expect(names).toEqual([...names].sort(new Intl.Collator("ro").compare));
    await click(".regionBack");
    await click('.regionContinent[data-continent="North America"]');
    expect(all(".regionCellName").map((row) => row.textContent)).toContain("Statele Unite ale Americii");
    await click('.regionCountry[data-code="US"]');
    expect(Array.from(query<HTMLSelectElement>("#signup-region-state").options, (option) => option.textContent).slice(1)).toEqual(US_STATES.map((state) => state.name));
  });

  it("E11 disables creation until a country and, for the US, a state are picked", async () => {
    await mountFlow();
    await fillFlow();
    for (const name of ["privacy-accepted", "terms-accepted"]) {
      query<HTMLInputElement>(`input[name="${name}"]`).checked = false;
      await act(async () => query<HTMLInputElement>(`input[name="${name}"]`).click());
      const acknowledge = all<HTMLButtonElement>('[role="dialog"] button').find((button) => button.textContent === "I have read it");
      expect(acknowledge).toBeDefined();
      await act(async () => acknowledge!.click());
    }
    const button = query<HTMLButtonElement>("button.authPrimary");
    expect(button.disabled).toBe(true);
    await pickRegion("RO");
    expect(button.disabled).toBe(false);
    await pickRegion("US");
    expect(button.disabled).toBe(true);
    const select = query<HTMLSelectElement>("#signup-region-state");
    await act(async () => { select.value = "CA"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(button.disabled).toBe(false);
  });

  it("E12 stops a scripted submit with no complete pick before any client call", async () => {
    await mountFlow();
    await fillFlow();
    await submitFlow();
    expect(checkAge).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it("E13 disables region controls during an unresolved submit and after success", async () => {
    await mountFlow();
    await pickRegion("US", "TX");
    await fillFlow();
    register.mockImplementation(() => new Promise(() => {}));
    await submitFlow();
    expect(query<HTMLButtonElement>("#signup-region-trigger").disabled).toBe(true);
    expect(query<HTMLSelectElement>("#signup-region-state").disabled).toBe(true);
    await mountFlow("success");
    await pickRegion("US", "TX");
    await fillFlow();
    await submitFlow();
    expect(query<HTMLButtonElement>("#signup-region-trigger").disabled).toBe(true);
    expect(query<HTMLSelectElement>("#signup-region-state").disabled).toBe(true);
  });

  it("P11 keeps the sent pick during an in-flight request when its grid was already open", async () => {
    await mountFlow();
    await pickRegion("RO");
    let rejectRegister: (reason: unknown) => void = () => undefined;
    register.mockImplementation(() => new Promise((_resolve, reject) => { rejectRegister = reject; }));
    await fillFlow();
    await click("#signup-region-trigger");
    expect(host.querySelector(".regionPopover"), "the grid is open immediately before submit").not.toBeNull();
    await submitFlow();
    expect(register).toHaveBeenCalledTimes(1);
    expect(host.querySelector(".regionPopover"), "busy closes the already-open grid").toBeNull();
    const sent = register.mock.calls[0]?.[5];
    const cell = host.querySelector<HTMLButtonElement>('.regionCountry[data-code="DE"]');
    if (cell !== null) await act(async () => cell.click());
    await act(async () => rejectRegister(new ContractHttpError("FORBIDDEN", 403, "COUNTRY_UNKNOWN", "COUNTRY_UNKNOWN")));
    expect(sent).toEqual({ country: "RO", usState: null });
    expect(query(".regionName").textContent).toBe("Romania");
  });

  it.each(["LEGAL_DOCUMENT_STALE", "COUNTRY_SIGNUP_UNAVAILABLE", "COUNTRY_UNKNOWN", "TOR_REFUSED", "GENERIC"])("E14 keeps US/TX after %s refusal", async (code) => {
    await mountFlow();
    await pickRegion("US", "TX");
    await fillFlow();
    register.mockRejectedValue(code === "GENERIC" ? new Error("boom") : new ContractHttpError("FORBIDDEN", 403, code, code));
    await submitFlow();
    expect(register).toHaveBeenCalledTimes(1);
    expect(query(".regionName").textContent).toBe("United States");
    expect(query<HTMLSelectElement>("#signup-region-state").value).toBe("TX");
  });

  it("E15 passes the complete US and non-US picks as the sixth argument", async () => {
    await mountFlow();
    await pickRegion("US", "TX");
    await fillFlow();
    await submitFlow();
    expect(register.mock.calls[0]?.[5]).toEqual({ country: "US", usState: "TX" });
    await mountFlow("non-us");
    await pickRegion("RO");
    await fillFlow();
    await submitFlow();
    expect(register.mock.calls[0]?.[5]).toEqual({ country: "RO", usState: null });
  });
});
