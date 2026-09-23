// @vitest-environment jsdom
// WHOLE-REV-hermes-glm-5.3-flash probe — S01 §2 step 10: re-choosing Premium
// re-usable gauges, values = what Free re-pinned in step 9 (step-8 values NOT restored).
// Deleted before handoff; never committed.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDebate: vi.fn(),
  push: vi.fn(),
  readSession: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams()
}));

vi.mock("@/components/AuthGate", () => ({
  AuthGate: ({ children }: { children: (token: string) => unknown }) => children("test-token")
}));

vi.mock("@/lib/api", () => ({
  createDebate: mocks.createDebate,
  contractClient: { readSession: mocks.readSession }
}));

import NewDebatePage from "@nd/page";

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("WHOLE-REV S01 step 10 probe", () => {
  let root: Root | null = null;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.createDebate.mockReset().mockResolvedValue({ id: "run-probe" });
    mocks.push.mockReset();
    mocks.readSession.mockReset().mockRejectedValue(new Error("no session"));
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  async function renderPage(): Promise<void> {
    await act(async () => root!.render(<NewDebatePage />));
    await settle();
  }

  async function click(selector: string): Promise<void> {
    await act(async () => document.querySelector<HTMLElement>(selector)!.click());
    await settle();
  }

  async function inputValue(selector: string, value: string): Promise<void> {
    const field = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value")?.set;
    await act(async () => {
      setter!.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();
  }

  it("step 10: after Free re-pins, Premium again leaves every gauge usable and keeps the step-9 values", async () => {
    await renderPage();

    // step 8 — move everything under Premium
    await click("#planTier-premium");
    await click(".ndOptionsToggle");
    await click("#riskTier-high-stakes");
    await click("#budgetTier-high");
    await inputValue("#treeDepth", "4");
    await inputValue("#steeringPresets", "Prefer primary sources");
    await inputValue("#steeringAnnotations", "Flag any claim resting on a single source.");
    await inputValue("#maxTokens", "2048");

    // step 9 — Free re-pins and locks
    await click("#planTier-free");
    expect(document.querySelector("#riskTier-standard")?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector<HTMLInputElement>("#treeDepth")?.value).toBe("2");
    expect(document.querySelector<HTMLInputElement>("#maxTokens")?.value).toBe("800");

    // step 10 — Premium again: values stay the step-9 ones...
    await click("#planTier-premium");
    expect(document.querySelector("#riskTier-high-stakes")?.getAttribute("aria-checked")).toBe("false");
    expect(document.querySelector("#riskTier-standard")?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector<HTMLInputElement>("#treeDepth")?.value).toBe("2");
    expect(document.querySelector<HTMLInputElement>("#maxTokens")?.value).toBe("800");
    expect(document.querySelector<HTMLTextAreaElement>("#steeringPresets")?.value).toBe("");

    // ...and every gauge from steps 4-6 is USABLE again (the half the suite does not assert)
    expect(document.querySelector("#riskTier-high-stakes")?.hasAttribute("disabled")).toBe(false);
    expect(document.querySelector("#budgetTier-high")?.hasAttribute("disabled")).toBe(false);
    expect(document.querySelector("#treeDepth")?.hasAttribute("disabled")).toBe(false);
    expect(document.querySelector("#steeringPresets")?.hasAttribute("disabled")).toBe(false);
    expect(document.querySelector("#steeringAnnotations")?.hasAttribute("disabled")).toBe(false);
    expect(document.querySelector("#depthMode")?.hasAttribute("disabled")).toBe(false);
    expect(document.querySelector("#scrutinyDepth")?.hasAttribute("disabled")).toBe(false);
    expect(document.querySelector("#branchingWidth")?.hasAttribute("disabled")).toBe(false);
    expect(document.querySelector("#concurrency")?.hasAttribute("disabled")).toBe(false);
    expect(document.querySelector("#maxTokens")?.hasAttribute("disabled")).toBe(false);

    // and a change is accepted and visible (step 10's "usable again")
    await click("#riskTier-high-stakes");
    expect(document.querySelector("#riskTier-high-stakes")?.getAttribute("aria-checked")).toBe("true");
  });
});
