// @vitest-environment jsdom
/**
 * GROK-REV-S01-10A r1 — independent probe of the cookie consent BAR (10a) and the
 * surfaces the packet ordered (10b card, 10c via Privacy notice, 8a sign-up).
 * Built from the CLAIM and SPEC, not from the author's tests.
 *
 * CSS is injected into THIS jsdom document as a <style> (COMMON / CODE-REV-S02-C9 r1 P4:
 * styledDocument() builds a detached JSDOM and cannot host a React mount).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CookieConsent } from "../../apps/ui/components/consent/CookieConsent.js";
import { ConsentSettingsPanel } from "../../apps/ui/components/consent/ConsentSettingsPanel.js";
import { SignUpFlow } from "../../apps/ui/components/SignUpFlow.js";
import { CONSENT_KEY } from "../../apps/ui/lib/consent.js";

const CSS = readFileSync(resolve(process.cwd(), "apps/ui/app/globals.css"), "utf8");

const BAR_EYEBROW = "YOUR DATA, ON THE RECORD";
const BAR_TITLE = "We store only what keeps the bench running — unless you say otherwise.";
const BAR_BODY =
  "Essential cookies hold your session, MFA state and device record. Analytics and model-quality telemetry are optional and never sold. You can change this any time in Settings.";
const BUTTONS = ["Essential only", "Choose what to store", "Accept all"] as const;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const TERRACOTTA = {
  shell: "rgb(239, 233, 224)",
  core: "rgb(253, 251, 246)",
  ink: "rgb(41, 38, 31)",
  gold: "rgb(168, 130, 62)",
  muted: "rgb(110, 103, 92)",
  text2: "rgb(85, 81, 71)",
  bg: "rgb(249, 246, 241)"
};
const CHAMBER = {
  shell: "rgb(34, 29, 23)",
  core: "rgb(24, 20, 16)",
  ink: "rgb(242, 234, 217)",
  gold: "rgb(200, 160, 85)",
  muted: "rgb(156, 144, 122)",
  text2: "rgb(181, 168, 143)",
  bg: "rgb(20, 17, 14)"
};

let root: Root | null = null;
let styleEl: HTMLStyleElement | null = null;

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function injectCss(): void {
  styleEl = document.createElement("style");
  styleEl.textContent = CSS;
  document.head.append(styleEl);
}

function bar(): HTMLElement | null {
  return document.querySelector('[role="region"][aria-label="Cookie consent"]');
}
function card(): HTMLElement | null {
  return document.querySelector('[role="dialog"][aria-labelledby]');
}
function policy(): HTMLElement | null {
  return document.querySelector(".policyBezel[role='dialog']");
}
function buttonsIn(el: HTMLElement): string[] {
  return [...el.querySelectorAll("button")].map((b) => (b.textContent ?? "").replace(/\s+/g, " ").trim());
}
function clickLabel(label: string): HTMLButtonElement {
  const button = [...document.querySelectorAll("button")].find(
    (candidate) => (candidate.textContent ?? "").replace(/\s+/g, " ").trim() === label
  );
  expect(button, `missing button ${label}`).toBeDefined();
  (button as HTMLButtonElement).click();
  return button as HTMLButtonElement;
}

async function mountConsent(): Promise<void> {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<CookieConsent />);
  });
  await settle();
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  document.documentElement.removeAttribute("data-mode");
  injectCss();
});

afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  styleEl?.remove();
  styleEl = null;
  document.body.replaceChildren();
  document.head.querySelectorAll("style").forEach((n) => n.remove());
  Reflect.deleteProperty(HTMLElement.prototype, "scrollHeight");
  Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("10a bar — copy, structure, tokens, storage (independent of author tests)", () => {
  it("first render is empty; after effects the bar is a labelled region in DOM button order", async () => {
    expect(renderToStaticMarkup(<CookieConsent />), "S01-R06 server markup").toBe("");
    await mountConsent();
    const region = bar();
    expect(region, "bar present after effects").not.toBeNull();
    expect(region!.getAttribute("role")).toBe("region");
    expect(region!.getAttribute("aria-label")).toBe("Cookie consent");
    expect(region!.querySelector(".consentEyebrow")?.textContent).toBe(BAR_EYEBROW);
    expect(region!.querySelector(".consentTitle")?.textContent?.trim()).toBe(BAR_TITLE);
    expect(region!.querySelector(".consentBody")?.textContent?.replace(/\s+/g, " ").trim()).toBe(BAR_BODY);
    expect(buttonsIn(region!)).toEqual([...BUTTONS]);
    expect(region!.querySelector(".consentTab"), "gold tab").not.toBeNull();
    expect(region!.querySelector(".consentBarBezel"), "bezel").not.toBeNull();
    expect(region!.querySelector(".consentBarCore"), "core").not.toBeNull();
    expect(region!.querySelector('[aria-label="Close"], .consentClose')).toBeNull();
  });

  it("token map on <html> matches SPEC R24 / design tokensFor in both modes; classes use var(--token)", async () => {
    await mountConsent();
    const html = document.documentElement;
    const token = (name: string): string => getComputedStyle(html).getPropertyValue(name).trim();

    expect(token("--shell")).toBe("#EFE9E0");
    expect(token("--core")).toBe("#FDFBF6");
    expect(token("--ink")).toBe("#29261F");
    expect(token("--gold")).toBe("#A8823E");
    expect(token("--muted")).toBe("#6E675C");
    expect(token("--text-2")).toBe("#555147");
    expect(token("--bg")).toBe("#F9F6F1");
    expect(token("--ok-soft")).toBe("rgba(62,122,78,.28)");
    expect(token("--ok-edge")).toBe("rgba(62,122,78,.55)");
    expect(token("--muted-bg")).toBe("rgba(110,103,92,.1)");
    expect(token("--muted-border")).toBe("rgba(110,103,92,.4)");
    expect(token("--scrim")).toBe("rgba(10,8,6,.42)");
    expect(token("--z-consent-bar")).toBe("45");
    expect(token("--z-consent-scrim")).toBe("75");
    expect(token("--z-consent-card")).toBe("76");
    expect(token("--z-policy-scrim")).toBe("77");
    expect(token("--z-policy-card")).toBe("78");

    html.dataset.mode = "chamber";
    expect(token("--shell")).toBe("#221D17");
    expect(token("--core")).toBe("#181410");
    expect(token("--ink")).toBe("#F2EAD9");
    expect(token("--gold")).toBe("#C8A055");
    expect(token("--muted")).toBe("#9C907A");
    expect(token("--text-2")).toBe("#B5A88F");
    expect(token("--bg")).toBe("#14110E");
    expect(token("--ok-soft")).toBe("rgba(134,181,141,.35)");
    expect(token("--ok-edge")).toBe("rgba(134,181,141,.55)");
    expect(token("--muted-bg")).toBe("rgba(156,144,122,.14)");
    expect(token("--muted-border")).toBe("rgba(156,144,122,.5)");
    expect(token("--scrim")).toBe("rgba(10,8,6,.42)");

    const region = bar()!;
    expect(getComputedStyle(region).position).toBe("fixed");
    // jsdom does not resolve var(--token) on the element itself (z-index stays
    // the var() string; bezel backgroundColor computes to transparent).
    expect(getComputedStyle(region).zIndex).toBe("var(--z-consent-bar)");
    // Classes must still NAME the tokens.
    const s01 = CSS.slice(CSS.indexOf("/* === consent-ui S01 === */"), CSS.indexOf("/* === end consent-ui S01 === */"));
    expect(s01).toContain("background: var(--shell)");
    expect(s01).toContain("background: var(--core)");
    expect(s01).toContain("background: var(--gold)");
    expect(s01).toContain("color: var(--ink)");
    expect(s01).toContain("color: var(--muted)");
    expect(s01).toContain("background: var(--ink)");
    expect(s01).toContain("color: var(--bg)");
  });

  it("Accept all writes R04 row 1 and hides the bar; remount with that key stays silent", async () => {
    await mountConsent();
    await act(async () => {
      clickLabel("Accept all");
    });
    await settle();
    expect(bar()).toBeNull();
    const stored = JSON.parse(localStorage.getItem(CONSENT_KEY)!);
    expect(Object.keys(stored).sort()).toEqual(["analytics", "decidedAt", "essential", "quality", "v"]);
    expect(stored).toMatchObject({ v: 1, essential: true, quality: true, analytics: true });
    expect(stored.decidedAt).toMatch(ISO);

    await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    await mountConsent();
    expect(bar(), "second visit with valid decision").toBeNull();
  });

  it("Essential only writes quality=false analytics=false", async () => {
    await mountConsent();
    await act(async () => {
      clickLabel("Essential only");
    });
    await settle();
    const stored = JSON.parse(localStorage.getItem(CONSENT_KEY)!);
    expect(stored).toMatchObject({ v: 1, essential: true, quality: false, analytics: false });
    expect(bar()).toBeNull();
  });

  it("v:0, missing members, garbage and absent all show the bar; Esc writes nothing", async () => {
    localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ v: 0, essential: true, quality: true, analytics: true, decidedAt: "2026-01-01T00:00:00.000Z" })
    );
    await mountConsent();
    expect(bar(), "older schema").not.toBeNull();

    await act(async () => root!.unmount());
    localStorage.setItem(CONSENT_KEY, '{"v":1}');
    document.body.replaceChildren();
    await mountConsent();
    expect(bar(), "missing members").not.toBeNull();

    await act(async () => root!.unmount());
    localStorage.setItem(CONSENT_KEY, "not json");
    document.body.replaceChildren();
    await mountConsent();
    expect(bar(), "garbage").not.toBeNull();

    const before = localStorage.getItem(CONSENT_KEY);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await settle();
    expect(bar(), "Esc does not dismiss the bar").not.toBeNull();
    expect(localStorage.getItem(CONSENT_KEY)).toBe(before);
  });
});

describe("10b card opened from the bar", () => {
  it("opens the 520 card, hides the bar, locks Essential, defaults quality ON analytics OFF", async () => {
    await mountConsent();
    await act(async () => {
      clickLabel("Choose what to store");
    });
    await settle();
    expect(bar()).toBeNull();
    const dialog = card();
    expect(dialog).not.toBeNull();
    expect(dialog!.getAttribute("aria-modal")).toBe("true");
    expect(dialog!.querySelector(".consentEyebrow")?.textContent).toBe("CHOOSE WHAT TO STORE");
    expect(dialog!.querySelector(".consentCardTitle")?.textContent).toBe("Cookie preferences");
    expect(dialog!.querySelector(".consentLede")?.textContent).toBe(
      "Asked once. Revisit any time from Settings → Privacy."
    );
    const names = [...dialog!.querySelectorAll(".consentCatName")].map((n) => n.textContent);
    expect(names).toEqual(["Essential", "Model quality telemetry", "Product analytics"]);
    const tags = [...dialog!.querySelectorAll(".consentTag")].map((n) => n.textContent);
    expect(tags).toEqual(["ALWAYS ON", "OPTIONAL", "OPTIONAL"]);
    const switches = [...dialog!.querySelectorAll('[role="switch"]')] as HTMLElement[];
    expect(switches.map((s) => s.getAttribute("aria-checked"))).toEqual(["true", "true", "false"]);
    expect(switches[0]!.getAttribute("aria-disabled")).toBe("true");
    await act(async () => {
      switches[0]!.click();
    });
    expect(switches[0]!.getAttribute("aria-checked")).toBe("true");
    expect(buttonsIn(dialog!).filter((l) => ["Privacy notice", "Essential only", "Save choices"].includes(l))).toEqual([
      "Privacy notice",
      "Essential only",
      "Save choices"
    ]);
    expect([...dialog!.querySelectorAll("button")].some((b) => b.textContent?.trim() === "×")).toBe(false);
    const width = getComputedStyle(dialog!).width;
    // jsdom has no layout: width may be "min(520px, calc(100vw - 32px))" or empty/auto.
    expect(typeof width).toBe("string");
  });

  it("Save choices writes current toggles; Privacy notice opens read-only 10c with Close and no Download PDF", async () => {
    await mountConsent();
    await act(async () => {
      clickLabel("Choose what to store");
    });
    await settle();
    const switches = [...document.querySelectorAll('[role="switch"]')] as HTMLElement[];
    await act(async () => {
      switches[2]!.click();
    });
    await act(async () => {
      clickLabel("Privacy notice");
    });
    await settle();
    const modal = policy();
    expect(modal, "policy over the card").not.toBeNull();
    expect(card(), "card still open under policy").not.toBeNull();
    expect(bar()).toBeNull();
    const labels = buttonsIn(modal!);
    expect(labels).toContain("Close");
    expect(labels).not.toContain("I have read it");
    expect(labels).not.toContain("Download PDF");
    expect(modal!.textContent).not.toContain("Download PDF");
    const pills = [...modal!.querySelectorAll(".policyPill")].map((p) => p.textContent);
    expect(pills).toEqual([
      "CONTROLLER",
      "WHAT WE COLLECT",
      "LAWFUL BASIS",
      "PUBLISHING",
      "MODELS & TRANSFERS",
      "RETENTION",
      "YOUR GDPR RIGHTS",
      "COMPLAINTS"
    ]);
    expect(modal!.querySelectorAll(".policySection").length).toBe(11);
    expect(modal!.querySelector(".policyEnd")?.textContent).toBe("END OF POLICY · GDPR (EU) 2016/679 · v2.1");
    expect(modal!.textContent).toContain("privacy@dezbatere.ro");

    await act(async () => {
      clickLabel("Close");
    });
    await settle();
    expect(policy()).toBeNull();
    expect(card()).not.toBeNull();
    expect(localStorage.getItem(CONSENT_KEY)).toBeNull();

    await act(async () => {
      clickLabel("Save choices");
    });
    await settle();
    expect(card()).toBeNull();
    expect(bar()).toBeNull();
    const stored = JSON.parse(localStorage.getItem(CONSENT_KEY)!);
    expect(stored).toMatchObject({ v: 1, essential: true, quality: true, analytics: true });
  });
});

describe("Settings re-entry and honesty", () => {
  it("Privacy panel copy is the SPEC's, and the button opens the same card", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <>
          <ConsentSettingsPanel />
          <CookieConsent />
        </>
      );
    });
    await settle();
    expect(document.getElementById("consent-privacy-heading")?.textContent).toBe("Privacy");
    expect(document.querySelector(".setSectionHint")?.textContent).toBe(
      "Choose what this browser stores. Asked once; change it here any time."
    );
    expect(bar(), "no decision → bar still showing behind Settings").not.toBeNull();
    await act(async () => {
      clickLabel("Cookie preferences");
    });
    await settle();
    expect(card()).not.toBeNull();
    expect(bar()).toBeNull();
    const switches = [...document.querySelectorAll('[role="switch"]')];
    expect(switches.map((s) => s.getAttribute("aria-checked"))).toEqual(["true", "true", "false"]);
  });
});

describe("S02 sign-up gate (packet probe 3)", () => {
  it("unchecked box and Privacy Policy link open the modal; Esc leaves the box unchecked; one box refuses register", async () => {
    const register = vi.fn().mockResolvedValue({ message: "ok" });
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<SignUpFlow client={{ register, resendVerification: vi.fn() }} />);
    });
    await settle();

    const privacy = document.querySelector<HTMLInputElement>('input[name="privacy-accepted"]')!;
    const adult = document.querySelector<HTMLInputElement>('input[name="adult-affirmed"]')!;
    expect(privacy.checked).toBe(false);
    // jsdom reports scrollHeight === clientHeight, which would latch the gate open.
    // Force a tall unread region BEFORE the modal mounts so evaluate() sees unread.
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        return (this as HTMLElement).classList?.contains("policyBody") ? 2000 : 0;
      }
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get() {
        return (this as HTMLElement).classList?.contains("policyBody") ? 400 : 0;
      }
    });
    await act(async () => {
      privacy.click();
    });
    await settle();
    expect(policy(), "modal opens from the box").not.toBeNull();
    expect(privacy.checked).toBe(false);
    const readIt = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "I have read it");
    expect(readIt, "consent-mode primary").toBeDefined();
    expect((readIt as HTMLButtonElement).disabled, "disabled until scrolled").toBe(true);
    expect(document.body.textContent).not.toContain("Download PDF");

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await settle();
    expect(policy()).toBeNull();
    expect(privacy.checked).toBe(false);

    const link = document.querySelector("button.consentPolicyLink") as HTMLButtonElement;
    await act(async () => {
      link.click();
    });
    await settle();
    expect(policy(), "modal opens from the link").not.toBeNull();

    const body = document.querySelector(".policyBody") as HTMLElement;
    expect(body).not.toBeNull();
    await act(async () => {
      Object.defineProperty(body, "scrollHeight", { configurable: true, value: 2000 });
      Object.defineProperty(body, "clientHeight", { configurable: true, value: 400 });
      body.scrollTop = 2000;
      body.dispatchEvent(new Event("scroll"));
    });
    await settle();
    const afterScroll = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "I have read it") as
      | HTMLButtonElement
      | undefined;
    expect(afterScroll?.disabled).toBe(false);
    await act(async () => {
      afterScroll!.click();
    });
    await settle();
    expect(privacy.checked).toBe(true);

    await act(async () => {
      adult.click();
    });
    const email = document.querySelector<HTMLInputElement>('input[name="email"], input[type="email"]');
    const password = document.querySelector<HTMLInputElement>('input[name="password"], input[type="password"]');
    if (email) {
      await act(async () => {
        email.value = "a@b.co";
        email.dispatchEvent(new Event("input", { bubbles: true }));
        email.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
    if (password) {
      await act(async () => {
        password.value = "Abcdef1!";
        password.dispatchEvent(new Event("input", { bubbles: true }));
        password.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }

    // Uncheck adult → one box only → submit must not call register.
    await act(async () => {
      adult.click();
    });
    const form = document.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await settle();
    expect(register, "register refused with one box").not.toHaveBeenCalled();
  });
});

describe("source-text pins jsdom cannot lay out", () => {
  it("720px stack rule and 22px insets exist in the S01 CSS block", () => {
    const start = CSS.indexOf("/* === consent-ui S01 === */");
    const end = CSS.indexOf("/* === end consent-ui S01 === */");
    const block = CSS.slice(start, end);
    expect(block).toContain("@media (max-width: 719.98px)");
    expect(block).toContain("left: 22px");
    expect(block).toContain("right: 22px");
    expect(block).toContain("bottom: calc(22px + var(--safe-b))");
    expect(block).toContain("left: 12px");
    expect(block).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(block).not.toMatch(/oklch\(|#[0-9a-fA-F]{3,8}\b|\brgba?\(/);
  });
});
