// @vitest-environment jsdom
// REV-S01-p3-correctness-tests — MY OWN probe, built from the CLAIM, not from the patch.
// CLAIM under test (FIX-S01-p2 READY, t_62644380): "all 14 Free controls are native disabled …
//   descriptions retained, focus rejected, and ACTIVATION STATE UNCHANGED".
// The FIX deleted, from S01-29, the three assertions that pinned "activation state unchanged":
//   await inputValue('#treeDepth', "4");   expect(#treeDepth.value).toBe("2")
//   await inputValue('#steeringPresets', …); expect(#steeringPresets.value).toBe("")
//   await selectValue('#depthMode', "adaptive"); expect(#depthMode.value).toBe("fixed")
// P1 restores them verbatim. P2..P5 exceed the author's parameters.

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

import NewDebatePage from "../../apps/ui/app/new/page.js";

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("REV-S01-p3 probe — the deleted activation assertions", () => {
  let root: Root | null = null;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.createDebate.mockReset().mockResolvedValue({ id: "run-tier" });
    mocks.push.mockReset();
    mocks.readSession.mockReset().mockRejectedValue(new Error("session unavailable in render test"));
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

  // VERBATIM the helper from tests/render/tier01-new-plan-tier.test.tsx:83-91
  async function inputValue(selector: string, value: string): Promise<void> {
    const field = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value")?.set;
    await act(async () => {
      setter!.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();
  }

  // VERBATIM the helper from tests/render/tier01-new-plan-tier.test.tsx:93-101
  async function selectValue(selector: string, value: string): Promise<void> {
    const field = document.querySelector<HTMLSelectElement>(selector)!;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    await act(async () => {
      setter!.call(field, value);
      field.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
  }

  it("P1 · the three assertions the FIX deleted from S01-29, restored verbatim", async () => {
    await renderPage();
    await click('#riskTier-high-stakes');
    await inputValue('#treeDepth', "4");
    await inputValue('#steeringPresets', "Prefer primary sources");
    await click('.ndOptionsToggle');
    await selectValue('#depthMode', "adaptive");
    expect({
      treeDepth: document.querySelector<HTMLInputElement>('#treeDepth')?.value,
      steeringPresets: document.querySelector<HTMLTextAreaElement>('#steeringPresets')?.value,
      depthMode: document.querySelector<HTMLSelectElement>('#depthMode')?.value
    }).toEqual({ treeDepth: "2", steeringPresets: "", depthMode: "fixed" });
  });

  it("P2 · every locked slider and textarea refuses a scripted input event", async () => {
    await renderPage();
    await click('.ndOptionsToggle');
    const before: Record<string, string> = {};
    const ids = ["treeDepth", "branchingWidth", "concurrency", "maxTokens", "steeringPresets", "steeringAnnotations"];
    for (const id of ids) before[id] = document.querySelector<HTMLInputElement>(`#${id}`)!.value;
    for (const id of ids) {
      const el = document.querySelector<HTMLInputElement>(`#${id}`)!;
      await inputValue(`#${id}`, el.type === "range" ? String(Number(before[id]) + 1) : "scripted");
    }
    const after = Object.fromEntries(ids.map((id) => [id, document.querySelector<HTMLInputElement>(`#${id}`)!.value]));
    expect(after).toEqual(before);
  });

  it("P3 · both locked selects refuse a scripted change event", async () => {
    await renderPage();
    await click('.ndOptionsToggle');
    const before = {
      depthMode: document.querySelector<HTMLSelectElement>('#depthMode')!.value,
      scrutinyDepth: document.querySelector<HTMLSelectElement>('#scrutinyDepth')!.value
    };
    await selectValue('#depthMode', "adaptive");
    await selectValue('#scrutinyDepth', "deep");
    expect({
      depthMode: document.querySelector<HTMLSelectElement>('#depthMode')!.value,
      scrutinyDepth: document.querySelector<HTMLSelectElement>('#scrutinyDepth')!.value
    }).toEqual(before);
  });

  it("P4 · the same six controls DO accept the same scripted events under Premium (the probe can fail)", async () => {
    await renderPage();
    await click('#planTier-premium');
    await click('.ndOptionsToggle');
    await inputValue('#treeDepth', "4");
    await inputValue('#steeringPresets', "Prefer primary sources");
    await selectValue('#depthMode', "adaptive");
    expect({
      treeDepth: document.querySelector<HTMLInputElement>('#treeDepth')?.value,
      steeringPresets: document.querySelector<HTMLTextAreaElement>('#steeringPresets')?.value,
      depthMode: document.querySelector<HTMLSelectElement>('#depthMode')?.value
    }).toEqual({ treeDepth: "4", steeringPresets: "Prefer primary sources", depthMode: "adaptive" });
  });

  it("P5 · a scripted click on a locked segmented button does not change the choice", async () => {
    await renderPage();
    const before = document.querySelector('#riskTier-standard')?.getAttribute("aria-checked");
    await act(async () => {
      document.querySelector<HTMLElement>('#riskTier-high-stakes')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await settle();
    expect({
      standard: document.querySelector('#riskTier-standard')?.getAttribute("aria-checked"),
      high: document.querySelector('#riskTier-high-stakes')?.getAttribute("aria-checked"),
      beforeStandard: before
    }).toEqual({ standard: "true", high: "false", beforeStandard: "true" });
  });
});
