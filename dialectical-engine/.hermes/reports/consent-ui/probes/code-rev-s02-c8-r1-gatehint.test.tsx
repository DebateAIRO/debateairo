// @vitest-environment jsdom
// CODE-REV-S02-C8 r1 probe — RENDERED, not read: with the shipped stylesheet attached, is
// `.policyGateHint` still in the accessibility tree, and does `aria-describedby` resolve?
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { PrivacyPolicyModal } from "../apps/ui/components/consent/PrivacyPolicyModal";

const css = readFileSync(resolve(process.cwd(), "apps/ui/app/globals.css"), "utf8");

/**
 * jsdom reports scrollTop/clientHeight/scrollHeight as 0, and `0 + 0 >= 0 - 8` opens the
 * scroll-to-end gate at mount — so without this stub the DISABLED button (and its hint) never
 * renders and the probe would pass vacuously. Patched on the PROTOTYPE because the mount
 * evaluation runs before any ref is reachable from the test.
 */
beforeAll(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const metrics: Record<string, number> = { scrollTop: 0, clientHeight: 200, scrollHeight: 500 };
  for (const key of ["scrollTop", "clientHeight", "scrollHeight"]) {
    Object.defineProperty(HTMLElement.prototype, key, {
      configurable: true,
      get() { return metrics[key]!; }
    });
  }
});

function mount(node: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
  const root = createRoot(host);
  act(() => { root.render(node); });
  return { host, cleanup: () => act(() => root.unmount()) };
}

describe("REV probe — .policyGateHint stays in the accessibility tree", () => {
  it("renders the hint, resolves aria-describedby, and computes to a clipped (not hidden) box", () => {
    const { cleanup } = mount(
      <PrivacyPolicyModal open mode="consent" onClose={() => {}} onAcknowledge={() => {}} />
    );

    const hint = document.getElementById("policy-modal-gate-hint");
    expect(hint, "the gate hint element must exist while the gate is closed").not.toBeNull();

    const button = [...document.querySelectorAll("button.policyPrimary")].find(
      (b) => (b as HTMLButtonElement).disabled
    ) as HTMLButtonElement | undefined;
    expect(button, "the disabled `I have read it` must be rendered").toBeDefined();
    expect(button!.getAttribute("aria-disabled")).toBe("true");
    expect(button!.getAttribute("aria-describedby")).toBe("policy-modal-gate-hint");
    // the description RESOLVES to a node with text — an aria-describedby pointing at nothing
    // is the failure this probe exists to exclude
    expect(document.getElementById(button!.getAttribute("aria-describedby")!)?.textContent)
      .toBe("Scroll to the end of the policy to continue.");

    const cs = getComputedStyle(hint!);
    const observed = {
      display: cs.display,
      visibility: cs.visibility,
      position: cs.position,
      width: cs.width,
      height: cs.height,
      overflow: cs.overflow,
      clip: cs.clip,
      whiteSpace: cs.whiteSpace
    };
    console.log("REV-PROBE computed .policyGateHint =", JSON.stringify(observed));
    // The two that would remove it from the accessibility tree:
    expect(observed.display).not.toBe("none");
    expect(observed.visibility).not.toBe("hidden");
    // The clip treatment that keeps it off the visible footer:
    expect(observed.position).toBe("absolute");
    expect(observed.width).toBe("1px");
    expect(observed.height).toBe("1px");
    expect(observed.overflow).toBe("hidden");
    expect(observed.clip).toBe("rect(0px, 0px, 0px, 0px)");

    cleanup();
  });
});
