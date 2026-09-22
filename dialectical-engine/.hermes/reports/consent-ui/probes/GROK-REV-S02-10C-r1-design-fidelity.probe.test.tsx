// @vitest-environment jsdom
/**
 * GROK-REV-S02-10C r1 — design-fidelity probe.
 * Built from the SPEC/design, not from the author's tests.
 * Injects the REAL globals.css into THIS document (CODE-REV-S02-C9 r1 P4:
 * styledDocument() cannot host a React mount).
 */
import { readFileSync } from "node:fs";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrivacyPolicyModal } from "@lane/PrivacyPolicyModal";
import { SignUpFlow } from "@lane/SignUpFlow";

const LANE = process.env.LANE;
if (!LANE) throw new Error("set LANE");
const CSS = readFileSync(`${LANE}/apps/ui/app/globals.css`, "utf8");

const EYEBROW = "PRIVACY POLICY · v2.1 · EFFECTIVE 12 AUG 2026";
const TITLE = "What we store, and why";
const LEDE =
  "Your rights and our obligations under the GDPR (EU) 2016/679, in plain language. Eleven sections — scroll to the end.";
const END_MARKER = "END OF POLICY · GDPR (EU) 2016/679 · v2.1";
const PILLS = [
  "CONTROLLER",
  "WHAT WE COLLECT",
  "LAWFUL BASIS",
  "PUBLISHING",
  "MODELS & TRANSFERS",
  "RETENTION",
  "YOUR GDPR RIGHTS",
  "COMPLAINTS"
] as const;
const SECTIONS = [
  "What we collect",
  "Why we hold it",
  "Publishing and visibility",
  "Model providers and international transfers",
  "Controller and contact",
  "Lawful basis for each purpose",
  "Retention",
  "Your rights under the GDPR",
  "Automated decisions and profiling",
  "Security and breach notification",
  "Children, complaints and changes"
] as const;
const JUMP_TO: Record<(typeof PILLS)[number], string> = {
  CONTROLLER: "policy-section-05",
  "WHAT WE COLLECT": "policy-section-01",
  "LAWFUL BASIS": "policy-section-06",
  PUBLISHING: "policy-section-03",
  "MODELS & TRANSFERS": "policy-section-04",
  RETENTION: "policy-section-07",
  "YOUR GDPR RIGHTS": "policy-section-08",
  COMPLAINTS: "policy-section-11"
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const styleNotes: string[] = [];

const METRIC_KEYS = ["scrollTop", "clientHeight", "scrollHeight"] as const;
type MetricKey = (typeof METRIC_KEYS)[number];
let metrics: Record<MetricKey, number> = { scrollTop: 0, clientHeight: 200, scrollHeight: 500 };

function stubScrollMetrics(): void {
  for (const key of METRIC_KEYS) {
    Object.defineProperty(HTMLElement.prototype, key, {
      configurable: true,
      get(this: HTMLElement): number {
        return this.classList.contains("policyBody") ? metrics[key] : 0;
      }
    });
  }
}

function restoreScrollMetrics(): void {
  for (const key of METRIC_KEYS) {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
  }
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function render(element: ReactNode): Promise<void> {
  await act(async () => {
    root!.render(element);
  });
  await settle();
}

function injectCss(): void {
  const style = document.createElement("style");
  style.setAttribute("data-grok-probe", "globals");
  style.textContent = CSS;
  document.head.append(style);
}

function cssVar(el: Element, name: string): string {
  return getComputedStyle(el as HTMLElement).getPropertyValue(name).trim();
}

function computed(el: Element, prop: string): string {
  return getComputedStyle(el as HTMLElement).getPropertyValue(prop).trim();
}

describe("S02-10C design fidelity — own jsdom document + real globals.css", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    document.documentElement.removeAttribute("data-mode");
    metrics = { scrollTop: 0, clientHeight: 200, scrollHeight: 500 };
    stubScrollMetrics();
    injectCss();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    host?.remove();
    host = null;
    document.body.replaceChildren();
    document.head.querySelectorAll("[data-grok-probe]").forEach((n) => n.remove());
    document.documentElement.removeAttribute("data-mode");
    restoreScrollMetrics();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("consent mode: strings, 8 pills, 11 sections, end marker last, no Download PDF, ARIA", async () => {
    await render(<PrivacyPolicyModal open mode="consent" onClose={vi.fn()} onAcknowledge={vi.fn()} />);

    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)!.textContent).toBe(TITLE);

    expect(dialog.querySelector(".policyEyebrow")!.textContent).toBe(EYEBROW);
    expect(dialog.querySelector(".policyTitle")!.textContent).toBe(TITLE);
    expect(dialog.querySelector(".policyLede")!.textContent).toBe(LEDE);

    const close = dialog.querySelector(".policyClose") as HTMLButtonElement;
    expect(close.getAttribute("aria-label")).toBe("Close");
    expect(close.textContent).toBe("×");

    const body = dialog.querySelector(".policyBody") as HTMLElement;
    expect(body.getAttribute("tabindex")).toBe("0");
    expect(body.getAttribute("aria-label")).toBe("Privacy Policy text");

    const pills = [...dialog.querySelectorAll<HTMLButtonElement>(".policyPill")];
    expect(pills.map((p) => p.textContent)).toEqual([...PILLS]);
    for (const pill of pills) {
      const jump = pill.getAttribute("data-jump")!;
      expect(jump).toBe(JUMP_TO[pill.textContent as (typeof PILLS)[number]]);
      expect(dialog.querySelector(`#${jump}`), `missing target ${jump}`).not.toBeNull();
      expect(pill.getAttribute("type")).toBe("button");
    }

    const titles = [...dialog.querySelectorAll(".policySectionTitle")].map((n) => n.textContent);
    expect(titles).toEqual([...SECTIONS]);
    expect(dialog.querySelectorAll(".policySection").length).toBe(11);
    expect(dialog.querySelectorAll(".policyItem").length).toBe(12);

    const bodyKids = [...body.children];
    expect(bodyKids[bodyKids.length - 1]!.classList.contains("policyEnd")).toBe(true);
    expect(bodyKids[bodyKids.length - 1]!.textContent).toBe(END_MARKER);

    expect([...dialog.querySelectorAll("*")].some((el) => el.textContent === "Download PDF")).toBe(
      false
    );
    expect(dialog.textContent).not.toContain("Download PDF");

    const ack = [...dialog.querySelectorAll("button")].find((b) => b.textContent === "I have read it");
    expect(ack).toBeDefined();
    expect((ack as HTMLButtonElement).disabled).toBe(true);
    expect(ack!.getAttribute("aria-disabled")).toBe("true");
    expect(ack!.getAttribute("aria-describedby")).toBe("policy-modal-gate-hint");
    expect(document.getElementById("policy-modal-gate-hint")!.textContent).toBe(
      "Scroll to the end of the policy to continue."
    );
    expect(dialog.querySelector(".policyMail")!.textContent).toBe("privacy@dezbatere.ro");
    expect(dialog.querySelector(".policyContact")!.textContent).toContain("Questions:");

    expect(dialog.querySelector(".policyTab")).not.toBeNull();
    expect(dialog.classList.contains("policyBezel")).toBe(true);
    expect(dialog.querySelector(".policyCore")).not.toBeNull();
    expect(document.querySelector(".policyScrim")).not.toBeNull();
  });

  it("read mode: Close only, no I have read it, no gate, onAcknowledge never fires", async () => {
    const onAck = vi.fn();
    const onClose = vi.fn();
    await render(<PrivacyPolicyModal open mode="read" onClose={onClose} onAcknowledge={onAck} />);
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect([...dialog.querySelectorAll("button")].some((b) => b.textContent === "I have read it")).toBe(
      false
    );
    const closePrimary = [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Close");
    expect(closePrimary).toBeDefined();
    expect((closePrimary as HTMLButtonElement).disabled).toBe(false);
    expect(document.getElementById("policy-modal-gate-hint")).toBeNull();
    await act(async () => {
      (closePrimary as HTMLButtonElement).click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAck).not.toHaveBeenCalled();
  });

  it("sign-up 8a copy and two real checkboxes, no banned substrings in the card", async () => {
    await render(<SignUpFlow client={{ register: vi.fn(), resendVerification: vi.fn() }} />);
    expect(document.querySelector(".consentGroup")).not.toBeNull();
    const rows = document.querySelectorAll(".consentRow");
    expect(rows.length).toBe(2);
    expect(rows[0]!.textContent).toBe("I am 18 or over.");
    expect(rows[1]!.textContent).toBe(
      "I agree to the Privacy Policy, including that my debates may be published publicly."
    );
    const adult = document.querySelector<HTMLInputElement>('input[name="adult-affirmed"]')!;
    const privacy = document.querySelector<HTMLInputElement>('input[name="privacy-accepted"]')!;
    expect(adult.type).toBe("checkbox");
    expect(privacy.type).toBe("checkbox");
    expect(adult.required).toBe(true);
    expect(privacy.required).toBe(true);
    expect(adult.checked).toBe(false);
    expect(privacy.checked).toBe(false);
    expect(document.querySelector(".consentPolicyLink")!.textContent).toBe("Privacy Policy");
    const submit = [...document.querySelectorAll("button")].find((b) => b.textContent === "Create account")!;
    expect(submit.disabled).toBe(true);
    expect(document.body.textContent).not.toMatch(/privacy notice/i);
    expect(document.querySelectorAll("form").length).toBe(1);
  });

  it("token map on both modes — getComputedStyle of the REAL stylesheet", async () => {
    await render(<PrivacyPolicyModal open mode="consent" onClose={vi.fn()} />);
    const rootEl = document.documentElement;
    const terracotta: Record<string, string> = {};
    for (const name of [
      "--bg",
      "--shell",
      "--core",
      "--ink",
      "--muted",
      "--text-2",
      "--line",
      "--line-strong",
      "--gold",
      "--scrim",
      "--ok-dot",
      "--ok-edge",
      "--z-policy-scrim",
      "--z-policy-card",
      "--r-panel",
      "--r-pill",
      "--r-tab",
      "--focus"
    ]) {
      terracotta[name] = cssVar(rootEl, name);
    }
    // SPEC / COMMON §7 expected terracotta values
    expect(terracotta["--bg"].toLowerCase()).toBe("#f9f6f1");
    expect(terracotta["--shell"].toLowerCase()).toBe("#efe9e0");
    expect(terracotta["--core"].toLowerCase()).toBe("#fdfbf6");
    expect(terracotta["--ink"].toLowerCase()).toBe("#29261f");
    expect(terracotta["--gold"].toLowerCase()).toBe("#a8823e");
    expect(terracotta["--scrim"].replace(/\s/g, "")).toBe("rgba(10,8,6,.42)");

    const dialog = document.querySelector(".policyBezel") as HTMLElement;
    const scrim = document.querySelector(".policyScrim") as HTMLElement;
    const core = document.querySelector(".policyCore") as HTMLElement;
    const tab = document.querySelector(".policyTab") as HTMLElement;
    const eyebrow = document.querySelector(".policyEyebrow") as HTMLElement;
    const lede = document.querySelector(".policyLede") as HTMLElement;
    const ack = [...document.querySelectorAll("button")].find((b) => b.textContent === "I have read it")!;
    const end = document.querySelector(".policyEnd") as HTMLElement;

    const teraEl = {
      scrimBg: computed(scrim, "background-color"),
      bezelBg: computed(dialog, "background-color"),
      coreBg: computed(core, "background-color"),
      tabBg: computed(tab, "background-color"),
      eyebrowColor: computed(eyebrow, "color"),
      ledeColor: computed(lede, "color"),
      endColor: computed(end, "color"),
      ackOpacity: computed(ack, "opacity"),
      bezelWidth: computed(dialog, "width"),
      bezelMaxHeight: computed(dialog, "max-height"),
      tabW: computed(tab, "width"),
      tabH: computed(tab, "height")
    };
    styleNotes.push(`terracotta elements: ${JSON.stringify(teraEl)}`);
    styleNotes.push(`terracotta tokens: ${JSON.stringify(terracotta)}`);

    expect(computed(ack, "opacity")).toBe("0.65");
    // jsdom resolves `92vh` against its viewport (measured 706.56px here). Pin the SOURCE
    // rule; computed px is a blind spot for V's browser QA.
    expect(CSS).toMatch(/\.policyBezel\s*\{[\s\S]*?max-height:\s*92vh/);
    expect(CSS).toMatch(/width:\s*min\(680px,\s*calc\(100vw - 32px\)\)/);
    expect(computed(tab, "width")).toBe("52px");
    expect(computed(tab, "height")).toBe("4px");
    styleNotes.push(`computed max-height=${computed(dialog, "max-height")} width=${computed(dialog, "width")}`);

    document.documentElement.dataset.mode = "chamber";
    const chamber: Record<string, string> = {};
    for (const name of Object.keys(terracotta)) {
      chamber[name] = cssVar(rootEl, name);
    }
    expect(chamber["--bg"].toLowerCase()).toBe("#14110e");
    expect(chamber["--shell"].toLowerCase()).toBe("#221d17");
    expect(chamber["--core"].toLowerCase()).toBe("#181410");
    expect(chamber["--ink"].toLowerCase()).toBe("#f2ead9");
    expect(chamber["--gold"].toLowerCase()).toBe("#c8a055");
    expect(chamber["--scrim"].replace(/\s/g, "")).toBe("rgba(10,8,6,.42)");
    styleNotes.push(`chamber tokens: ${JSON.stringify(chamber)}`);
    styleNotes.push(
      `chamber elements: ${JSON.stringify({
        scrimBg: computed(scrim, "background-color"),
        bezelBg: computed(dialog, "background-color"),
        coreBg: computed(core, "background-color"),
        tabBg: computed(tab, "background-color"),
        eyebrowColor: computed(eyebrow, "color"),
        ledeColor: computed(lede, "color"),
        ackOpacity: computed(ack, "opacity")
      })}`
    );
    expect(computed(ack, "opacity")).toBe("0.65");
    // Tokens restyle; jsdom leaves .policyTab's computed background-color as
    // transparent in both modes (var(--gold) does not resolve on the element).
    expect(chamber["--gold"].toLowerCase()).not.toBe(terracotta["--gold"].toLowerCase());
  });

  it("checkbox group tokens and 17px square from the stylesheet (layout still unverified)", async () => {
    await render(<SignUpFlow client={{ register: vi.fn(), resendVerification: vi.fn() }} />);
    const group = document.querySelector(".consentGroup") as HTMLElement;
    const box = document.querySelector(".consentBox") as HTMLElement;
    const link = document.querySelector(".consentPolicyLink") as HTMLElement;
    expect(computed(box, "width")).toBe("17px");
    expect(computed(box, "height")).toBe("17px");
    expect(computed(box, "border-radius")).toBe("5px");
    expect(computed(group, "border-radius")).toBe("11px");
    // jsdom's computed font-weight for `font: inherit; font-weight: 700` is often "normal".
    // Pin the SOURCE rule instead; computed weight is logged, not asserted.
    expect(CSS).toMatch(/\.consentPolicyLink\s*\{[\s\S]*?font-weight:\s*700/);
    styleNotes.push(`computed font-weight=${computed(link, "font-weight")} text-decoration=${computed(link, "text-decoration")}`);
    const deco = computed(link, "text-decoration-line") || computed(link, "text-decoration");
    styleNotes.push(`deco=${deco}`);
    styleNotes.push(
      `group bg=${computed(group, "background-color")} box border=${computed(box, "border-top-color")} link color=${computed(link, "color")}`
    );
  });
});
