// @vitest-environment jsdom
// Independent WHOLE-REV-grok-4.6 probe: S01 acceptance from SPEC-v2 §2 + DONE.md,
// not from the author's suite. Deleted before handoff.

import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLAN_TIER_ROSTERS } from "@debateai/contract";

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

const LOCKED_IDS = [
  "#riskTier-casual",
  "#riskTier-standard",
  "#riskTier-high-stakes",
  "#budgetTier-low",
  "#budgetTier-medium",
  "#budgetTier-high",
  "#treeDepth",
  "#steeringPresets",
  "#steeringAnnotations"
] as const;

const OPTIONS_LOCKED_IDS = [
  "#depthMode",
  "#scrutinyDepth",
  "#branchingWidth",
  "#concurrency",
  "#maxTokens"
] as const;

describe("WHOLE-REV independent S01 acceptance probe", () => {
  let root: Root | null = null;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.createDebate.mockReset().mockResolvedValue({ id: "run-whole-rev" });
    mocks.push.mockReset();
    mocks.readSession.mockReset().mockRejectedValue(new Error("session unavailable"));
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

  async function selectValue(selector: string, value: string): Promise<void> {
    const field = document.querySelector<HTMLSelectElement>(selector)!;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    await act(async () => {
      setter!.call(field, value);
      field.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
  }

  async function submitForm(): Promise<void> {
    await act(async () => {
      document.querySelector<HTMLFormElement>("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });
    await settle();
  }

  it("S01-1/R1: radiogroup above the question, exclusive aria-checked, data-field/data-value", async () => {
    await renderPage();
    const group = document.querySelector('[role="radiogroup"][aria-label="Plan tier"]');
    const topic = document.querySelector("#topic");
    expect(group).not.toBeNull();
    expect(topic).not.toBeNull();
    expect(group!.compareDocumentPosition(topic!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const free = document.querySelector('[data-field="planTier"][data-value="free"]');
    const premium = document.querySelector('[data-field="planTier"][data-value="premium"]');
    expect(free?.getAttribute("role")).toBe("radio");
    expect(premium?.getAttribute("role")).toBe("radio");
    expect(free?.getAttribute("aria-checked")).toBe("true");
    expect(premium?.getAttribute("aria-checked")).toBe("false");
    expect(document.querySelectorAll('[data-field="planTier"][aria-checked="true"]').length).toBe(1);
  });

  it("S01-2/R2: fresh /new opens with Free chosen", async () => {
    await renderPage();
    expect(document.querySelector('[data-value="free"]')?.getAttribute("aria-checked")).toBe("true");
  });

  it("S01-3/R3: model ids come from PLAN_TIER_ROSTERS, not page literals", async () => {
    await renderPage();
    const freeText = document.querySelector("#planTier-free")?.textContent ?? "";
    const premiumText = document.querySelector("#planTier-premium")?.textContent ?? "";
    for (const id of PLAN_TIER_ROSTERS.free) expect(freeText).toContain(id);
    for (const id of PLAN_TIER_ROSTERS.premium) expect(premiumText).toContain(id);
    const page = readFileSync("apps/ui/app/new/page.tsx", "utf8");
    expect(page).toContain("PLAN_TIER_ROSTERS");
    expect(page).not.toMatch(/gpt-5\.6-luna|claude-sonnet-5|gpt-5\.6-sol|claude-opus-5|grok-4\.6/);
    expect(document.querySelector("#planTier-free .ndTierPromise")?.textContent).toBe(
      "Every gauge fixed. The question is yours."
    );
    expect(document.querySelector("#planTier-premium .ndTierPromise")?.textContent).toBe(
      "Every gauge yours to set."
    );
  });

  it("S01-4/5/R4/R7: Free pins values and native-disables the nine collapsed locks", async () => {
    await renderPage();
    expect(document.querySelector("#riskTier-standard")?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector("#budgetTier-low")?.getAttribute("aria-checked")).toBe("true");
    expect((document.querySelector("#treeDepth") as HTMLInputElement).value).toBe("2");
    expect((document.querySelector("#steeringPresets") as HTMLTextAreaElement).value).toBe("");
    expect((document.querySelector("#steeringAnnotations") as HTMLTextAreaElement).value).toBe("");
    for (const id of LOCKED_IDS) {
      expect((document.querySelector(id) as HTMLInputElement | HTMLButtonElement).disabled).toBe(true);
    }
    await click("#riskTier-casual");
    await click("#budgetTier-high");
    expect(document.querySelector("#riskTier-standard")?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector("#budgetTier-low")?.getAttribute("aria-checked")).toBe("true");
  });

  it("S01-6/R4/R5: OPTIONS opens in Free; knobs native-disabled; toggle itself is not", async () => {
    await renderPage();
    const toggle = document.querySelector(".ndOptionsToggle") as HTMLButtonElement;
    expect(toggle.disabled).toBe(false);
    await click(".ndOptionsToggle");
    expect(document.querySelector("#additionalRunOptions")).not.toBeNull();
    expect((document.querySelector("#depthMode") as HTMLSelectElement).value).toBe("fixed");
    expect((document.querySelector("#scrutinyDepth") as HTMLSelectElement).value).toBe("standard");
    expect((document.querySelector("#branchingWidth") as HTMLInputElement).value).toBe("2");
    expect((document.querySelector("#concurrency") as HTMLInputElement).value).toBe("3");
    expect((document.querySelector("#maxTokens") as HTMLInputElement).value).toBe("800");
    for (const id of OPTIONS_LOCKED_IDS) {
      expect((document.querySelector(id) as HTMLInputElement | HTMLSelectElement).disabled).toBe(true);
    }
  });

  it("S01-7/R6/R18: topic stays editable; Start run enables from the question, not the tier", async () => {
    await renderPage();
    const topic = document.querySelector("#topic") as HTMLTextAreaElement;
    const start = document.querySelector(".ndStart") as HTMLButtonElement;
    expect(topic.disabled).toBe(false);
    expect(topic.readOnly).toBe(false);
    expect(start.disabled).toBe(true);
    await inputValue("#topic", "Remote work should be the default for knowledge workers.");
    expect((document.querySelector("#topic") as HTMLTextAreaElement).value.length).toBeGreaterThan(6);
    expect((document.querySelector(".ndStart") as HTMLButtonElement).disabled).toBe(false);
  });

  it("S01-8/R9: Premium unlocks every R4 control and accepts a change", async () => {
    await renderPage();
    await click('[data-value="premium"]');
    for (const id of LOCKED_IDS) {
      expect((document.querySelector(id) as HTMLInputElement | HTMLButtonElement).disabled).toBe(false);
    }
    await click("#riskTier-high-stakes");
    await click("#budgetTier-high");
    expect(document.querySelector("#riskTier-high-stakes")?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector("#budgetTier-high")?.getAttribute("aria-checked")).toBe("true");
    await inputValue("#treeDepth", "4");
    expect((document.querySelector("#treeDepth") as HTMLInputElement).value).toBe("4");
    await inputValue("#steeringPresets", "Prefer primary sources");
    expect((document.querySelector("#steeringPresets") as HTMLTextAreaElement).value).toBe("Prefer primary sources");
    await click(".ndOptionsToggle");
    for (const id of OPTIONS_LOCKED_IDS) {
      expect((document.querySelector(id) as HTMLInputElement | HTMLSelectElement).disabled).toBe(false);
    }
    await selectValue("#scrutinyDepth", "deep");
    expect((document.querySelector("#scrutinyDepth") as HTMLSelectElement).value).toBe("deep");
  });

  it("S01-9/10/R8: Free resets to R7 and locks; Premium-again keeps the reset values, not the Premium edits", async () => {
    await renderPage();
    await click('[data-value="premium"]');
    await click("#riskTier-high-stakes");
    await click("#budgetTier-high");
    await inputValue("#treeDepth", "4");
    await inputValue("#topic", "Remote work should be the default for knowledge workers.");
    await click('[data-value="free"]');
    expect(document.querySelector("#riskTier-standard")?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector("#budgetTier-low")?.getAttribute("aria-checked")).toBe("true");
    expect((document.querySelector("#treeDepth") as HTMLInputElement).value).toBe("2");
    expect((document.querySelector("#topic") as HTMLTextAreaElement).value).toContain("Remote work");
    for (const id of LOCKED_IDS) {
      expect((document.querySelector(id) as HTMLInputElement | HTMLButtonElement).disabled).toBe(true);
    }
    await click('[data-value="premium"]');
    expect(document.querySelector("#riskTier-standard")?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector("#budgetTier-low")?.getAttribute("aria-checked")).toBe("true");
    expect((document.querySelector("#treeDepth") as HTMLInputElement).value).toBe("2");
    expect(document.querySelector("#riskTier-high-stakes")?.getAttribute("aria-checked")).toBe("false");
  });

  it("S01-11/12/R13: Start run posts the chosen plan_tier via createDebate", async () => {
    await renderPage();
    await inputValue("#topic", "Remote work should be the default for knowledge workers.");
    await submitForm();
    expect(mocks.createDebate).toHaveBeenCalled();
    const firstConfig = mocks.createDebate.mock.calls[0][1] as Record<string, unknown>;
    expect(firstConfig.plan_tier).toBe("free");
    await click('[data-value="premium"]');
    mocks.createDebate.mockClear();
    await submitForm();
    const secondConfig = mocks.createDebate.mock.calls[0][1] as Record<string, unknown>;
    expect(secondConfig.plan_tier).toBe("premium");
  });

  it("S01-R10: treeDepth keeps min 1 max 5 in both tiers", async () => {
    await renderPage();
    const slider = document.querySelector("#treeDepth") as HTMLInputElement;
    expect(slider.min).toBe("1");
    expect(slider.max).toBe("5");
    await click('[data-value="premium"]');
    expect((document.querySelector("#treeDepth") as HTMLInputElement).min).toBe("1");
    expect((document.querySelector("#treeDepth") as HTMLInputElement).max).toBe("5");
  });

  it("S01-M9: Free vs Premium copy on intro and hints", async () => {
    await renderPage();
    expect(document.querySelector(".ndIntro")?.textContent).toContain(
      "Free runs every debate at fixed settings"
    );
    expect(document.querySelector("#riskTier-hint")?.textContent).toContain("fixed by the Free plan");
    await click('[data-value="premium"]');
    expect(document.querySelector(".ndIntro")?.textContent).toContain(
      "Choose your risk tier, composition budget tier, and depth"
    );
    expect(document.querySelector("#riskTier-hint")?.textContent).toContain("explicit asker selection");
  });

  it("shared shell: SupportWidget still mounts on /new", async () => {
    await renderPage();
    expect(document.body.innerHTML.length).toBeGreaterThan(0);
    const page = readFileSync("apps/ui/app/new/page.tsx", "utf8");
    expect(page).toContain("<SupportWidget");
  });
});
