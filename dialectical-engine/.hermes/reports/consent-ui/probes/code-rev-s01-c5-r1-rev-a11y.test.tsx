// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CookieConsent } from "../apps/ui/components/consent/CookieConsent.js";
import { ConsentSettingsPanel } from "../apps/ui/components/consent/ConsentSettingsPanel.js";

describe("REV C5 · a11y wiring, probed", () => {
  it("every aria-labelledby on the consent surface resolves to a present id", () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    localStorage.clear();
    const c = document.createElement("div");
    document.body.append(c);
    const r = createRoot(c);
    act(() => r.render(createElement("div", null, [
      createElement(ConsentSettingsPanel, { key: "p" }),
      createElement(CookieConsent, { key: "m" })
    ])));
    const bar = document.querySelector('[role="region"]')!;
    expect(bar.getAttribute("aria-label"), "the bar is a labelled region, not a dialog").toBe("Cookie consent");
    expect(bar.getAttribute("role")).toBe("region");
    act(() => [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === "Choose what to store")!.click());
    for (const el of document.querySelectorAll("[aria-labelledby]")) {
      const id = el.getAttribute("aria-labelledby")!;
      expect(document.getElementById(id), `aria-labelledby="${id}" resolves`).not.toBeNull();
    }
    const dlg = document.querySelector('[role="dialog"]')!;
    expect(dlg.getAttribute("aria-modal")).toBe("true");
    expect([...document.querySelectorAll('[role="switch"]')].map(s => s.getAttribute("aria-label")))
      .toEqual(["Essential", "Model quality telemetry", "Product analytics"]);
    expect(document.querySelector('[role="switch"][aria-disabled="true"]')?.getAttribute("aria-label"))
      .toBe("Essential");
    act(() => r.unmount());
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it("R06 is about the CONSENT SURFACE: the machine SSRs to nothing; the Settings panel is a static button", () => {
    expect(renderToStaticMarkup(createElement(CookieConsent, null)), "machine SSR").toBe("");
    const panel = renderToStaticMarkup(createElement(ConsentSettingsPanel, null));
    expect(panel, "the panel does SSR, and carries no consent state").toContain("Cookie preferences");
    expect(panel, "no stored decision leaks into server markup").not.toMatch(/quality|analytics|decidedAt|debateai\.consent/);
  });
});
