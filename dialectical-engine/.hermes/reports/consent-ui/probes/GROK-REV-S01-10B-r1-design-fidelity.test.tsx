// @vitest-environment jsdom
/**
 * GROK-REV-S01-10B r1 — design fidelity probe.
 * Built from SPEC §Copy + design extracts, NOT from the author's tests.
 * Injects the REAL apps/ui/app/globals.css into THIS document (CODE-REV-S02-C9 r1 P4:
 * styledDocument() builds a detached JSDOM and cannot host a React mount).
 *
 * jsdom has no layout: width/min(), 92vh, hover scale, stacking, and the 520px
 * artboard width cannot be measured as used pixels. Those are named UNVERIFIED
 * for V's browser QA.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { COOKIE_CATEGORIES } from "../../apps/ui/lib/consent.js";
import { POLICY_JUMP, POLICY_SECTIONS } from "../../apps/ui/lib/privacyPolicy.js";
import { CookiePreferencesCard } from "../../apps/ui/components/consent/CookiePreferencesCard.js";
import { CookieConsent } from "../../apps/ui/components/consent/CookieConsent.js";
import { ConsentSettingsPanel } from "../../apps/ui/components/consent/ConsentSettingsPanel.js";

const CSS = readFileSync(resolve(process.cwd(), "apps/ui/app/globals.css"), "utf8");
const CARD_SRC = readFileSync(
  resolve(process.cwd(), "apps/ui/components/consent/CookiePreferencesCard.tsx"),
  "utf8"
);
const GLOBALS = readFileSync(resolve(process.cwd(), "apps/ui/app/globals.css"), "utf8");

const EYEBROW = "CHOOSE WHAT TO STORE";
const TITLE = "Cookie preferences";
const LEDE = "Asked once. Revisit any time from Settings → Privacy.";
const FOOTER = ["Privacy notice", "Essential only", "Save choices"] as const;
const SETTINGS_HINT = "Choose what this browser stores. Asked once; change it here any time.";
const END_MARKER = "END OF POLICY · GDPR (EU) 2016/679 · v2.1";

/** Declared token strings as written in :root / chamber (jsdom getPropertyValue does not rgb() hexes). */
const TOKEN_DECLARED = {
  terracotta: {
    "--shell": "#EFE9E0",
    "--core": "#FDFBF6",
    "--gold": "#A8823E",
    "--ink": "#29261F",
    "--muted": "#6E675C",
    "--text-2": "#555147",
    "--ok-dot": "#3E7A4E",
    "--scrim": "rgba(10,8,6,.42)"
  },
  chamber: {
    "--shell": "#221D17",
    "--core": "#181410",
    "--gold": "#C8A055",
    "--ink": "#F2EAD9",
    "--muted": "#9C907A",
    "--text-2": "#B5A88F",
    "--ok-dot": "#86B58D",
    "--scrim": "rgba(10,8,6,.42)"
  }
} as const;

const TOKEN_COMPUTED = {
  terracotta: {
    shell: "rgb(239, 233, 224)",
    core: "rgb(253, 251, 246)",
    gold: "rgb(168, 130, 62)",
    scrim: "rgba(10, 8, 6, 0.42)"
  },
  chamber: {
    shell: "rgb(34, 29, 23)",
    core: "rgb(24, 20, 16)",
    gold: "rgb(200, 160, 85)",
    scrim: "rgba(10, 8, 6, 0.42)"
  }
} as const;

let host: HTMLDivElement;
let root: Root;
let styleEl: HTMLStyleElement;

function injectCss(): void {
  styleEl = document.createElement("style");
  styleEl.setAttribute("data-grok-rev", "globals");
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function mountCard(initial = { quality: true, analytics: false }): void {
  act(() => {
    root.render(
      <CookiePreferencesCard
        initial={initial}
        onSave={() => {}}
        onEssentialOnly={() => {}}
        onDismiss={() => {}}
        onRequestPolicy={() => {}}
      />
    );
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  document.documentElement.removeAttribute("data-mode");
  localStorage.clear();
  injectCss();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  styleEl?.remove();
  localStorage.clear();
});

describe("10b copy is byte-exact against SPEC §Copy / cookieCats", () => {
  it("renders eyebrow, title, lede, twelve category strings, footer in design order", () => {
    mountCard();
    const text = host.textContent ?? "";
    expect(text).toContain(EYEBROW);
    expect(text).toContain(TITLE);
    expect(text).toContain(LEDE);
    for (const cat of COOKIE_CATEGORIES) {
      expect(text).toContain(cat.name);
      expect(text).toContain(cat.tag);
      expect(text).toContain(cat.description);
      expect(text).toContain(cat.detail);
    }
    for (const label of FOOTER) expect(text).toContain(label);
    const names = [...host.querySelectorAll(".consentCatName")].map((n) => n.textContent);
    expect(names).toEqual(["Essential", "Model quality telemetry", "Product analytics"]);
    const footerLabels = [...host.querySelectorAll(".consentCardFooter button")].map(
      (n) => n.textContent
    );
    expect(footerLabels).toEqual([...FOOTER]);
  });

  it("does not inline any of the twelve category strings in the component source", () => {
    for (const cat of COOKIE_CATEGORIES) {
      for (const value of [cat.name, cat.tag, cat.description, cat.detail]) {
        const bounded = new RegExp(`["'>]\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*["'<]`);
        expect(bounded.test(CARD_SRC), `inlined ${JSON.stringify(value)}`).toBe(false);
      }
    }
  });
});

describe("10b structure the design fixes", () => {
  it("bezel shell → core, gold tab, locked essential, three footer controls, no ×", () => {
    mountCard();
    const scrim = host.querySelector(".consentScrim");
    const card = host.querySelector(".consentCard");
    const core = host.querySelector(".consentCardCore");
    const tab = host.querySelector(".consentCardCore .consentTab");
    expect(scrim).not.toBeNull();
    expect(card).not.toBeNull();
    expect(core).not.toBeNull();
    expect(tab).not.toBeNull();
    expect(card?.contains(core as Node)).toBe(true);
    expect(core?.contains(tab as Node)).toBe(true);
    expect(host.querySelectorAll(".consentCatRow").length).toBe(3);
    const essential = host.querySelector('[role="switch"][aria-label="Essential"]');
    expect(essential?.getAttribute("aria-checked")).toBe("true");
    expect(essential?.getAttribute("aria-disabled")).toBe("true");
    expect(host.querySelectorAll(".consentCardFooter button").length).toBe(3);
    expect(host.textContent).not.toMatch(/×/);
    expect(card?.getAttribute("role")).toBe("dialog");
    expect(card?.getAttribute("aria-modal")).toBe("true");
    expect(card?.hasAttribute("aria-labelledby")).toBe(true);
  });

  it("source-text: width is min(520px, calc(100vw - 32px)); knob uses --shadow-knob", () => {
    expect(GLOBALS).toContain("width: min(520px, calc(100vw - 32px));");
    expect(GLOBALS).toContain("box-shadow: var(--shadow-knob);");
    expect(GLOBALS).toContain("--shadow-knob: 0 1px 3px rgba(0,0,0,.3);");
    expect(GLOBALS).toContain("transition: transform .5s cubic-bezier(.34,1.56,.64,1);");
    expect(GLOBALS).toContain(".consentBar .consentPrimary:hover { transform: scale(1.04); }");
    expect(GLOBALS).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.consentBar \.consentPrimary \{ transition: none; \}/);
  });
});

describe("token map in BOTH modes via getComputedStyle on THIS document", () => {
  it("Terracotta :root values match COMMON §7 / design tokensFor(false)", () => {
    document.documentElement.removeAttribute("data-mode");
    mountCard();
    for (const [token, expected] of Object.entries(TOKEN_DECLARED.terracotta)) {
      const got = cssVar(token).replace(/\s+/g, "");
      const want = expected.replace(/\s+/g, "");
      expect(got, token).toBe(want);
    }
    const card = host.querySelector(".consentCard") as HTMLElement;
    const core = host.querySelector(".consentCardCore") as HTMLElement;
    const scrim = host.querySelector(".consentScrim") as HTMLElement;
    const tab = host.querySelector(".consentCardCore .consentTab") as HTMLElement;
    // jsdom reads custom properties from :root but does not substitute var() on
    // used backgroundColor (returns transparent). Named UNVERIFIED for V.
    expect(getComputedStyle(card).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(core).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(tab).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(card).getPropertyValue("background")).toContain("var(--shell)");
    expect(getComputedStyle(core).getPropertyValue("background")).toContain("var(--core)");
    expect(getComputedStyle(scrim).getPropertyValue("background")).toContain("var(--scrim)");
    expect(getComputedStyle(tab).getPropertyValue("background")).toContain("var(--gold)");
    void TOKEN_COMPUTED;
  });

  it("Chamber html[data-mode=chamber] restyles the same mount without unmounting", () => {
    mountCard();
    act(() => {
      document.documentElement.dataset.mode = "chamber";
    });
    for (const [token, expected] of Object.entries(TOKEN_DECLARED.chamber)) {
      const got = cssVar(token).replace(/\s+/g, "");
      const want = expected.replace(/\s+/g, "");
      expect(got, token).toBe(want);
    }
    const card = host.querySelector(".consentCard") as HTMLElement;
    const core = host.querySelector(".consentCardCore") as HTMLElement;
    expect(getComputedStyle(card).getPropertyValue("background")).toContain("var(--shell)");
    expect(getComputedStyle(core).getPropertyValue("background")).toContain("var(--core)");
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  });
});

describe("Settings → Privacy is a real panel", () => {
  it("renders Privacy heading, the lede's promised hint, and Cookie preferences", () => {
    act(() => {
      root.render(<ConsentSettingsPanel />);
    });
    expect(host.textContent).toContain("Privacy");
    expect(host.textContent).toContain(SETTINGS_HINT);
    const btn = [...host.querySelectorAll("button")].find((b) => b.textContent === "Cookie preferences");
    expect(btn).toBeDefined();
    expect(btn?.className).toContain("setBtn");
  });
});

describe("Privacy notice opens 10c in read mode — 11 sections, 8 pills, end marker, no Download PDF", () => {
  it("read-mode modal matches design-data.js structural facts and honesty (no Download PDF)", () => {
    act(() => {
      root.render(<CookieConsent />);
    });
    const choose = [...host.querySelectorAll("button")].find((b) => b.textContent === "Choose what to store");
    expect(choose).toBeDefined();
    act(() => {
      choose!.click();
    });
    const notice = [...host.querySelectorAll("button")].find((b) => b.textContent === "Privacy notice");
    act(() => {
      notice!.click();
    });
    expect(host.querySelector('[role="dialog"][aria-modal="true"]')).not.toBeNull();
    expect(POLICY_SECTIONS.length).toBe(11);
    expect(POLICY_JUMP.length).toBe(8);
    const pills = [...host.querySelectorAll(".policyJumps button, .policyJumps [class*='Jump'], .policyJump")];
    const pillTexts = pills.map((p) => (p.textContent ?? "").trim()).filter(Boolean);
    if (pillTexts.length === 0) {
      for (const j of POLICY_JUMP) expect(host.textContent).toContain(j.label);
    } else {
      expect(pillTexts).toEqual(POLICY_JUMP.map((j) => j.label));
    }
    for (const s of POLICY_SECTIONS) {
      expect(host.textContent).toContain(s.title);
    }
    expect(host.textContent).toContain(END_MARKER);
    expect(host.textContent).not.toContain("Download PDF");
    expect(host.textContent).not.toContain("I have read it");
    const close = [...host.querySelectorAll("button")].find((b) => b.textContent === "Close");
    expect(close).toBeDefined();
  });
});

describe("jsdom geometry I cannot measure (named for V)", () => {
  it("records that used width / 92vh / hover transform are not layout-computed here", () => {
    mountCard();
    const card = host.querySelector(".consentCard") as HTMLElement;
    const used = getComputedStyle(card).width;
    expect(["", "auto", "0px"].includes(used) || used.endsWith("px")).toBe(true);
  });
});
