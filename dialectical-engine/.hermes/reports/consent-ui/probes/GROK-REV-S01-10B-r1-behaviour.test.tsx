// @vitest-environment jsdom
/**
 * GROK-REV-S01-10B r1 — adversarial behaviour probe from the CLAIM, not the
 * author's suite. jsdom: Space/Enter are pinned on the HANDLER (TOOLING-TRAPS).
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONSENT_KEY } from "../../apps/ui/lib/consent.js";
import { CookieConsent } from "../../apps/ui/components/consent/CookieConsent.js";
import { ConsentSettingsPanel } from "../../apps/ui/components/consent/ConsentSettingsPanel.js";

let host: HTMLDivElement;
let root: Root;

function btn(label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find((b) => b.textContent === label);
  if (!found) throw new Error(`missing button ${label}; got ${[...host.querySelectorAll("button")].map((b) => b.textContent).join(" | ")}`);
  return found as HTMLButtonElement;
}

function switchFor(name: string): HTMLButtonElement {
  const el = host.querySelector(`[role="switch"][aria-label="${name}"]`);
  if (!el) throw new Error(`missing switch ${name}`);
  return el as HTMLButtonElement;
}

function stored(): Record<string, unknown> | null {
  const raw = localStorage.getItem(CONSENT_KEY);
  return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>);
}

function iso(value: unknown): boolean {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value);
}

function keysOf(obj: Record<string, unknown>): string[] {
  return Object.keys(obj).sort();
}

function press(el: HTMLElement, key: string): void {
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

function escape(): void {
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  localStorage.clear();
});

describe("first visit / stored shape", () => {
  it("clear storage → remount → bar; Accept all writes R04 row 1", () => {
    act(() => {
      root.render(<CookieConsent />);
    });
    expect(host.textContent).toContain("YOUR DATA, ON THE RECORD");
    act(() => {
      btn("Accept all").click();
    });
    const rec = stored()!;
    expect(keysOf(rec)).toEqual(["analytics", "decidedAt", "essential", "quality", "v"]);
    expect(rec).toMatchObject({ v: 1, essential: true, quality: true, analytics: true });
    expect(iso(rec.decidedAt)).toBe(true);
    expect(host.querySelector(".consentBar")).toBeNull();
  });

  it("second visit with a valid record shows no bar", () => {
    localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({
        v: 1,
        essential: true,
        quality: true,
        analytics: false,
        decidedAt: "2026-09-06T18:02:11.123Z"
      })
    );
    act(() => {
      root.render(<CookieConsent />);
    });
    expect(host.querySelector(".consentBar")).toBeNull();
    expect(host.querySelector(".consentCard")).toBeNull();
  });

  it("older schema version v:0 is treated as no decision", () => {
    localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({
        v: 0,
        essential: true,
        quality: true,
        analytics: true,
        decidedAt: "2026-09-06T18:02:11.123Z"
      })
    );
    act(() => {
      root.render(<CookieConsent />);
    });
    expect(host.querySelector(".consentBar")).not.toBeNull();
  });

  it("Essential only from the bar and from the card write the same booleans", () => {
    act(() => {
      root.render(<CookieConsent />);
    });
    act(() => {
      btn("Essential only").click();
    });
    const fromBar = stored()!;
    localStorage.clear();
    act(() => root.unmount());
    root = createRoot(host);
    act(() => {
      root.render(<CookieConsent />);
    });
    act(() => {
      btn("Choose what to store").click();
    });
    act(() => {
      btn("Essential only").click();
    });
    const fromCard = stored()!;
    expect(fromBar).toMatchObject({ v: 1, essential: true, quality: false, analytics: false });
    expect(fromCard).toMatchObject({ v: 1, essential: true, quality: false, analytics: false });
  });

  it("Save choices writes the current toggles", () => {
    act(() => {
      root.render(<CookieConsent />);
    });
    act(() => {
      btn("Choose what to store").click();
    });
    act(() => {
      switchFor("Product analytics").click();
    });
    act(() => {
      switchFor("Model quality telemetry").click();
    });
    act(() => {
      btn("Save choices").click();
    });
    expect(stored()).toMatchObject({ v: 1, essential: true, quality: false, analytics: true });
    expect(host.querySelector(".consentCard")).toBeNull();
    expect(host.querySelector(".consentBar")).toBeNull();
  });
});

describe("toggles", () => {
  it("Essential is locked against click, Space and Enter; the other two answer click AND Space", () => {
    act(() => {
      root.render(<CookieConsent />);
    });
    act(() => {
      btn("Choose what to store").click();
    });
    const essential = switchFor("Essential");
    const quality = switchFor("Model quality telemetry");
    const analytics = switchFor("Product analytics");
    expect(essential.getAttribute("aria-checked")).toBe("true");
    expect(essential.getAttribute("aria-disabled")).toBe("true");
    expect(quality.getAttribute("aria-checked")).toBe("true");
    expect(analytics.getAttribute("aria-checked")).toBe("false");
    act(() => {
      essential.click();
    });
    press(essential, " ");
    press(essential, "Enter");
    expect(essential.getAttribute("aria-checked")).toBe("true");
    act(() => {
      quality.click();
    });
    expect(quality.getAttribute("aria-checked")).toBe("false");
    press(quality, " ");
    expect(quality.getAttribute("aria-checked")).toBe("true");
    press(analytics, " ");
    expect(analytics.getAttribute("aria-checked")).toBe("true");
  });
});

describe("Esc / backdrop / stored-decision discriminator", () => {
  it("Esc with only the bar showing writes nothing and leaves the bar", () => {
    act(() => {
      root.render(<CookieConsent />);
    });
    escape();
    expect(host.querySelector(".consentBar")).not.toBeNull();
    expect(localStorage.getItem(CONSENT_KEY)).toBeNull();
  });

  it("Esc from a first-visit card restores the bar and writes nothing", () => {
    act(() => {
      root.render(<CookieConsent />);
    });
    act(() => {
      btn("Choose what to store").click();
    });
    expect(host.querySelector(".consentCard")).not.toBeNull();
    expect(host.querySelector(".consentBar")).toBeNull();
    escape();
    expect(host.querySelector(".consentCard")).toBeNull();
    expect(host.querySelector(".consentBar")).not.toBeNull();
    expect(localStorage.getItem(CONSENT_KEY)).toBeNull();
  });

  it("Esc from Settings with a valid stored decision leaves Silent (no bar)", () => {
    localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({
        v: 1,
        essential: true,
        quality: false,
        analytics: true,
        decidedAt: "2026-09-06T18:02:11.123Z"
      })
    );
    act(() => {
      root.render(
        <>
          <ConsentSettingsPanel />
          <CookieConsent />
        </>
      );
    });
    act(() => {
      btn("Cookie preferences").click();
    });
    expect(switchFor("Model quality telemetry").getAttribute("aria-checked")).toBe("false");
    expect(switchFor("Product analytics").getAttribute("aria-checked")).toBe("true");
    const before = localStorage.getItem(CONSENT_KEY);
    escape();
    expect(host.querySelector(".consentCard")).toBeNull();
    expect(host.querySelector(".consentBar")).toBeNull();
    expect(localStorage.getItem(CONSENT_KEY)).toBe(before);
  });

  it("Esc from Settings with NOTHING stored returns the bar (B1 pin)", () => {
    act(() => {
      root.render(
        <>
          <ConsentSettingsPanel />
          <CookieConsent />
        </>
      );
    });
    act(() => {
      btn("Cookie preferences").click();
    });
    expect(switchFor("Model quality telemetry").getAttribute("aria-checked")).toBe("true");
    expect(switchFor("Product analytics").getAttribute("aria-checked")).toBe("false");
    escape();
    expect(host.querySelector(".consentBar")).not.toBeNull();
    expect(localStorage.getItem(CONSENT_KEY)).toBeNull();
  });

  it("backdrop click on the scrim dismisses without writing", () => {
    act(() => {
      root.render(<CookieConsent />);
    });
    act(() => {
      btn("Choose what to store").click();
    });
    const scrim = host.querySelector(".consentScrim") as HTMLElement;
    act(() => {
      scrim.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(host.querySelector(".consentCard")).toBeNull();
    expect(host.querySelector(".consentBar")).not.toBeNull();
    expect(localStorage.getItem(CONSENT_KEY)).toBeNull();
  });
});

describe("Esc stack and read-only policy", () => {
  it("one Esc over the policy leaves the card; a second Esc closes the card", () => {
    act(() => {
      root.render(<CookieConsent />);
    });
    act(() => {
      btn("Choose what to store").click();
    });
    act(() => {
      btn("Privacy notice").click();
    });
    expect(host.textContent).toContain("What we store, and why");
    expect(host.textContent).toContain("Close");
    expect(host.textContent).not.toContain("I have read it");
    escape();
    expect(host.textContent).not.toContain("What we store, and why");
    expect(host.querySelector(".consentCard")).not.toBeNull();
    expect(host.querySelector(".consentBar")).toBeNull();
    escape();
    expect(host.querySelector(".consentCard")).toBeNull();
    expect(host.querySelector(".consentBar")).not.toBeNull();
  });
});

describe("fresh mount per open + initial focus", () => {
  it("a second open does not keep the first open's toggles (fresh key)", () => {
    act(() => {
      root.render(<CookieConsent />);
    });
    act(() => {
      btn("Choose what to store").click();
    });
    act(() => {
      switchFor("Product analytics").click();
    });
    expect(switchFor("Product analytics").getAttribute("aria-checked")).toBe("true");
    escape();
    act(() => {
      btn("Choose what to store").click();
    });
    expect(switchFor("Product analytics").getAttribute("aria-checked")).toBe("false");
  });

  it("initial focus lands on Model quality telemetry", () => {
    act(() => {
      root.render(<CookieConsent />);
    });
    act(() => {
      btn("Choose what to store").click();
    });
    expect(document.activeElement).toBe(switchFor("Model quality telemetry"));
  });
});

describe("focus return both directions", () => {
  it("closing the Settings-opened card returns focus to Cookie preferences", () => {
    localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({
        v: 1,
        essential: true,
        quality: true,
        analytics: false,
        decidedAt: "2026-09-06T18:02:11.123Z"
      })
    );
    act(() => {
      root.render(
        <>
          <ConsentSettingsPanel />
          <CookieConsent />
        </>
      );
    });
    const opener = btn("Cookie preferences");
    act(() => {
      opener.focus();
      opener.click();
    });
    escape();
    expect(document.activeElement).toBe(opener);
  });

  it("closing the first-visit card returns focus to Choose what to store when the bar returns", () => {
    act(() => {
      root.render(<CookieConsent />);
    });
    act(() => {
      btn("Choose what to store").click();
    });
    escape();
    expect(document.activeElement).toBe(btn("Choose what to store"));
  });
});

describe("honesty: no fake telemetry gate", () => {
  it("storing analytics:true loads no script and writes no dataset", () => {
    const spy = vi.spyOn(document.body, "appendChild");
    act(() => {
      root.render(<CookieConsent />);
    });
    act(() => {
      btn("Choose what to store").click();
    });
    act(() => {
      switchFor("Product analytics").click();
    });
    act(() => {
      btn("Save choices").click();
    });
    expect(stored()).toMatchObject({ analytics: true });
    expect(document.body.dataset.consentAnalytics).toBeUndefined();
    const appendedScripts = spy.mock.calls.filter(([node]) => node instanceof HTMLScriptElement);
    expect(appendedScripts).toEqual([]);
    spy.mockRestore();
  });
});
