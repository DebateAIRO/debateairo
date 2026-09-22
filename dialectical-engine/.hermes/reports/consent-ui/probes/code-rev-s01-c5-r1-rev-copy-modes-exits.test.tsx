// @vitest-environment jsdom

/**
 * CODE-REV-S01-C5 r1 — three things the cluster command does not look at:
 *
 *   A. the SPEC §Copy strings, DECODED, as the mounted machine renders them;
 *   B. both modes — the whole consent surface must be byte-identical under
 *      `data-mode="terracotta"` and `data-mode="chamber"`, because every colour
 *      it uses is a `var(--token)` reference and nothing may branch on mode;
 *   C. the card's actual EXIT ROUTES as mounted today: which of its rendered
 *      controls reach which prop.
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONSENT_KEY } from "../apps/ui/lib/consent.js";
import { CookieConsent } from "../apps/ui/components/consent/CookieConsent.js";
import { ConsentSettingsPanel } from "../apps/ui/components/consent/ConsentSettingsPanel.js";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  document.documentElement.removeAttribute("data-mode");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  root = null;
  container = null;
  document.body.replaceChildren();
  document.documentElement.removeAttribute("data-mode");
  vi.unstubAllGlobals();
  localStorage.clear();
});

const mount = (): void => {
  act(() => {
    root!.render(
      createElement("div", { className: "appShell" }, [
        createElement(ConsentSettingsPanel, { key: "p" }),
        createElement(CookieConsent, { key: "m" })
      ])
    );
  });
};

const text = (sel: string): string => document.querySelector(sel)?.textContent?.trim() ?? "";
const open = (): void => {
  const b = [...document.querySelectorAll("button")].find(
    (c) => c.textContent?.trim() === "Choose what to store"
  );
  act(() => (b as HTMLButtonElement).click());
};

describe("REV C5 · copy, modes and exits", () => {
  it("A — the bar renders SPEC §Copy verbatim, DECODED (em dash and arrow as characters)", () => {
    mount();
    expect(text(".consentEyebrow")).toBe("YOUR DATA, ON THE RECORD");
    expect(text(".consentTitle")).toBe(
      "We store only what keeps the bench running — unless you say otherwise."
    );
    expect(text(".consentBody")).toBe(
      "Essential cookies hold your session, MFA state and device record. Analytics and model-quality telemetry are optional and never sold. You can change this any time in Settings."
    );
    expect(
      [...document.querySelectorAll<HTMLElement>(".consentActions button")].map((b) =>
        b.textContent?.trim()
      ),
      "buttons in DOM order"
    ).toEqual(["Essential only", "Choose what to store", "Accept all"]);
    // No six-character escape shipped as visible text (SPEC §Copy, REQ-REV-01 N8).
    expect(document.body.textContent ?? "").not.toMatch(/\\u[0-9A-Fa-f]{4}/);
  });

  it("A — the card renders SPEC §Copy verbatim, including the U+2192 arrow in the lede", () => {
    mount();
    open();
    expect(text(".consentEyebrow")).toBe("CHOOSE WHAT TO STORE");
    expect(text(".consentCardTitle")).toBe("Cookie preferences");
    expect(text(".consentLede")).toBe("Asked once. Revisit any time from Settings → Privacy.");
    expect(
      [...document.querySelectorAll<HTMLElement>(".consentCardFooter button")].map((b) =>
        b.textContent?.trim()
      )
    ).toEqual(["Privacy notice", "Essential only", "Save choices"]);
    expect(document.body.textContent ?? "").not.toMatch(/\\u[0-9A-Fa-f]{4}/);
    // U+2019 in the Model quality detail line, decoded.
    expect(document.body.textContent ?? "").toContain("debates’ text");
  });

  it("A — the Settings panel renders V-13's three strings byte-exactly", () => {
    mount();
    expect(text(".setSectionTitle")).toBe("Privacy");
    expect(text(".setSectionHint")).toBe(
      "Choose what this browser stores. Asked once; change it here any time."
    );
    expect(text("button.setBtn")).toBe("Cookie preferences");
  });

  it("B — the BAR is byte-identical in both modes", () => {
    document.documentElement.dataset.mode = "terracotta";
    mount();
    const terracotta = document.querySelector(".consentBar")!.outerHTML;
    act(() => root!.unmount());
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    document.documentElement.dataset.mode = "chamber";
    mount();
    const chamber = document.querySelector(".consentBar")!.outerHTML;
    expect(chamber, "no markup branches on the document mode").toBe(terracotta);
    expect(terracotta, "and no inline style carries a colour").not.toMatch(
      /style="[^"]*(#[0-9a-fA-F]{3,8}|rgba?\(|oklch\(|hsla?\()/
    );
  });

  it("B — the CARD and the Settings panel are byte-identical in both modes", () => {
    localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ v: 1, essential: true, quality: false, analytics: true, decidedAt: "2026-01-01T00:00:00.000Z" })
    );
    document.documentElement.dataset.mode = "terracotta";
    mount();
    act(() => document.querySelector<HTMLButtonElement>("button.setBtn")!.click());
    const norm = (h: string): string => h.replace(/_r_[0-9a-z]+_/g, "_rID_");
    const t = norm(document.querySelector('[role="dialog"]')!.outerHTML);
    const tp = norm(document.querySelector("section")!.outerHTML);
    act(() => root!.unmount());
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    document.documentElement.dataset.mode = "chamber";
    mount();
    act(() => document.querySelector<HTMLButtonElement>("button.setBtn")!.click());
    expect(norm(document.querySelector('[role="dialog"]')!.outerHTML), "card").toBe(t);
    expect(norm(document.querySelector("section")!.outerHTML), "panel").toBe(tp);
  });

  it("C — MEASUREMENT: as mounted today the card offers no exit that is not a decision", () => {
    // NOT a requirement of C5 — a measurement of the lane's shipped state, so the
    // C6 packet and V's acceptance ordering rest on a number rather than a claim.
    // S01-R14 says a dismissal "writes nothing"; every route the mounted card
    // currently offers writes. The dismissal gestures (Esc, backdrop) belong to
    // S02's modalSemantics.ts, which arrives with the C6 merge.
    mount();
    open();
    const card = document.querySelector('[role="dialog"]')!;
    const controls = [...card.querySelectorAll("button")];

    const labels = controls.map((b) => (b.textContent?.trim() || b.getAttribute("aria-label")) ?? "");
    expect(labels, "every control the card renders").toEqual([
      "Essential",
      "Model quality telemetry",
      "Product analytics",
      "Privacy notice",
      "Essential only",
      "Save choices"
    ]);

    // The three switches and `Privacy notice` do not close it; the two remaining
    // controls both write. So: click every control that is not a decision and
    // show the card is still open and nothing has been written.
    for (const label of ["Essential", "Model quality telemetry", "Product analytics", "Privacy notice"]) {
      const b = controls.find(
        (c) => (c.textContent?.trim() || c.getAttribute("aria-label")) === label
      )!;
      act(() => b.click());
      expect(document.querySelector('[role="dialog"]'), `${label} does not close the card`).not.toBeNull();
    }
    expect(localStorage.getItem(CONSENT_KEY), "and none of them wrote").toBeNull();

    // A scrim click is the other designed route; it is inert today.
    act(() => (document.querySelector(".consentScrim") as HTMLElement).click());
    expect(document.querySelector('[role="dialog"]'), "the backdrop is inert until C6").not.toBeNull();

    // Esc likewise (the author's own measurement, reproduced independently).
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
      );
    });
    expect(document.querySelector('[role="dialog"]'), "Esc is inert until C6").not.toBeNull();

    // Therefore: the only two ways out both write a decision.
    act(() =>
      controls.find((c) => c.textContent?.trim() === "Essential only")!.click()
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(localStorage.getItem(CONSENT_KEY), "the exit wrote").not.toBeNull();
  });

  it("C — `Privacy notice` is rendered and reaches a no-op in this cluster (C6's S01-S38 wires it)", () => {
    mount();
    open();
    const link = [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Privacy notice"
    )!;
    const before = document.body.innerHTML;
    act(() => link.click());
    expect(document.body.innerHTML, "clicking it changes nothing in the document").toBe(before);
    expect(document.querySelectorAll('[role="dialog"]').length, "no policy modal opens").toBe(1);
  });
});
