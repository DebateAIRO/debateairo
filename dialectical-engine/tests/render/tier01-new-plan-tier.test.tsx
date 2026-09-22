// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDebate: vi.fn(),
  push: vi.fn(),
  readDeployment: vi.fn(),
  readPlanTiers: vi.fn(),
  readSession: vi.fn()
}));

function deploymentWithRosters(rosters: Readonly<{
  free: readonly string[];
  premium: readonly string[];
}>) {
  return Object.freeze({
    register: {
      register_version: 1,
      rows: [{
        row_key: "planTierRosters",
        value: {
          kind: "PLAN_TIER_ROSTERS",
          free: rosters.free,
          premium: rosters.premium
        },
        source_ref: "config/models.yaml"
      }]
    },
    scorecards: [],
    model_ledger: [],
    fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
  });
}

const deploymentFixture = deploymentWithRosters({
  free: ["gpt-5.6-luna", "glm-5.3-flash"],
  premium: ["gpt-5.6-sol", "claude-opus-5", "grok-4.7-build"]
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams()
}));

vi.mock("@/components/AuthGate", () => ({
  AuthGate: ({ children }: { children: (token: string) => unknown }) => children("test-token")
}));

vi.mock("@/lib/api", () => ({
  createDebate: mocks.createDebate,
  contractClient: {
    readDeployment: mocks.readDeployment,
    readPlanTiers: mocks.readPlanTiers,
    readSession: mocks.readSession
  }
}));

import NewDebatePage from "../../apps/ui/app/new/page.js";

const pageSource = readFileSync("apps/ui/app/new/page.tsx", "utf8");

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("S01 /new plan tier", () => {
  let root: Root | null = null;

  // DONE.md §3 / S01-44 map — M-line → assertion(s) → suite:
  // M1 → S01-20, S01-22 → render/tier01-new-plan-tier.
  // M4 → S01-25 → render/tier01-new-plan-tier.
  // M5 → S01-25 → render/tier01-new-plan-tier.
  // M6 → S01-25 → render/tier01-new-plan-tier.
  // M7 → S01-25, S01-26 → render/tier01-new-plan-tier.
  // M8 → S01-27–S01-30, S01-33, S01-36 → render/tier01-new-plan-tier.
  // M9 → S01-23, S01-34, S01-35 → render/tier01-new-plan-tier.
  // M10 → S01-23, S01-34, S01-35 → render/tier01-new-plan-tier.
  // M11 → M11 below, S01-38 → render/tier01-new-plan-tier.
  // M12 → S01-30 → render/tier01-new-plan-tier (plus style M12).
  // M14 → S01-31–S01-33, S01-37 → render/tier01-new-plan-tier (plus style S01-40).

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.createDebate.mockReset().mockResolvedValue({ id: "run-tier" });
    mocks.push.mockReset();
    mocks.readDeployment.mockReset().mockResolvedValue(deploymentFixture);
    mocks.readPlanTiers.mockReset().mockResolvedValue({
      free: deploymentFixture.register.rows[0]!.value.free,
      premium: deploymentFixture.register.rows[0]!.value.premium
    });
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
      document.querySelector<HTMLFormElement>('form')!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });
    await settle();
  }

  it("S01-20 R1 offers exactly two mutually exclusive tier options", async () => {
    await renderPage();

    expect(document.body.innerHTML).not.toBe("");
    const options = [...document.querySelectorAll<HTMLElement>('[data-field="planTier"]')];
    expect(options).toHaveLength(2);
    expect(options.map((option) => option.dataset.value)).toEqual(["free", "premium"]);
    expect(options.every((option) => option.closest('[role="radiogroup"]') !== null)).toBe(true);
    expect(new Set(options.map((option) => option.closest('[role="radiogroup"]'))).size).toBe(1);
    expect(options[0]?.closest('[role="radiogroup"]')?.getAttribute("aria-label")).toBe("Plan tier");
    expect(options.filter((option) => option.getAttribute("aria-checked") === "true")).toHaveLength(1);
  });

  it("S01-21 R1 gives each tier option the segmented-radio attribute contract", async () => {
    await renderPage();

    const free = document.querySelector<HTMLButtonElement>('#planTier-free');
    const premium = document.querySelector<HTMLButtonElement>('#planTier-premium');
    expect(free).toMatchObject({ type: "button" });
    expect(premium).toMatchObject({ type: "button" });
    expect(free?.getAttribute("role")).toBe("radio");
    expect(premium?.getAttribute("role")).toBe("radio");
  });

  it("S01-22 R1 places the tier selector above the question bezel", async () => {
    await renderPage();

    const markup = document.body.innerHTML;
    expect(markup.indexOf('class="ndTier"')).toBeGreaterThanOrEqual(0);
    expect(markup.indexOf('class="ndTier"')).toBeLessThan(markup.indexOf('class="ndTopicBezel"'));
  });

  it("S01-23 R2 opens on Free with the R7 values already pinned", async () => {
    await renderPage();

    expect(document.querySelector('#planTier-free')?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector('#riskTier-standard')?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector('#budgetTier-low')?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector<HTMLInputElement>('#treeDepth')?.value).toBe("2");
    expect(document.querySelector<HTMLTextAreaElement>('#steeringPresets')?.value).toBe("");
    expect(document.querySelector<HTMLTextAreaElement>('#steeringAnnotations')?.value).toBe("");
    expect(document.querySelector('.ndIntro')?.textContent?.trim()).toBe(
      "Free runs every debate at fixed settings. Type your question and click Start, or choose Premium to set the gauges yourself."
    );
    expect(document.querySelector('#riskTier-label')?.parentElement?.querySelector('.ndHint')?.textContent).toBe(
      "How much is riding on the answer · fixed by the Free plan"
    );
    expect(document.querySelector('#budgetTier-label')?.parentElement?.querySelector('.ndHint')?.textContent).toBe(
      "How much work the composition may spend · fixed by the Free plan"
    );
  });

  it("S01-24 R2 does not key the session-defaults effect on plan tier", async () => {
    await renderPage();

    expect(mocks.readSession).toHaveBeenCalledTimes(1);
    await click('#planTier-premium');
    await click('#planTier-free');
    expect(mocks.readSession).toHaveBeenCalledTimes(1);
  });

  // Property: a refused roster read is visible and no stale/default model id is rendered.
  // Production break: swallow readPlanTiers rejection and retain EMPTY_PLAN_TIER_ROSTERS.
  it("S03-25 R31 names an unavailable plan-tier roster read and renders no ids", async () => {
    mocks.readSession.mockResolvedValue({
      session_id: "00000000-0000-4000-8000-000000000000",
      asker_id: "probe-asker"
    });
    mocks.readPlanTiers.mockRejectedValue(new Error("PLAN_TIER_ROSTERS_OFFLINE"));
    await renderPage();

    expect([...document.querySelectorAll('.ndTierModel')]).toEqual([]);
    expect(document.querySelector('.error')?.textContent).toBe(
      "ASK_PLAN_TIER_ROSTERS_UNAVAILABLE: PLAN_TIER_ROSTERS_OFFLINE"
    );
  });

  // Property: the cards render all five ids returned by the user-readable roster surface.
  // Production break: keep reading the operator-only deployment surface instead of readPlanTiers.
  it("S03-26 R16 renders both tier lists from the user-readable roster response", async () => {
    mocks.readDeployment.mockRejectedValue(new Error("OPERATOR_REQUIRED"));
    await renderPage();

    expect([...document.querySelectorAll<HTMLElement>('.ndTierModel')].map((model) =>
      model.textContent?.trim()
    )).toEqual([
      "gpt-5.6-luna",
      "glm-5.3-flash",
      "gpt-5.6-sol",
      "claude-opus-5",
      "grok-4.7-build"
    ]);
    expect(document.body.textContent).not.toContain("OPERATOR_REQUIRED");
  });

  // Property: the Free card renders the file-fed deployment roster and no retired model id.
  // Production break: keep rendering the compiled PLAN_TIER_ROSTERS export instead of the register row.
  it("S03-24 R16 renders the Free card from the plan-tier roster response", async () => {
    vi.resetModules();
    vi.doMock("@debateai/contract", () => ({
      EXPANSION_DEPTH_MIN: 1,
      EXPANSION_DEPTH_MAX: 5,
      PLAN_TIER_ROSTERS: {
        free: ["gpt-5.6-luna", "claude-sonnet-5"],
        premium: ["gpt-5.6-sol", "claude-opus-5", "grok-4.7-build"]
      }
    }));
    try {
      const { default: PageWithStaleCompiledRoster } = await import("../../apps/ui/app/new/page.js");
      await act(async () => root!.render(<PageWithStaleCompiledRoster />));
      await settle();

      const freeCard = document.querySelector('#planTier-free')?.textContent ?? "";
      expect(freeCard).toContain("gpt-5.6-luna");
      expect(freeCard).toContain("glm-5.3-flash");
      expect(document.body.innerHTML).not.toContain("claude-sonnet-5");
    } finally {
      vi.doUnmock("@debateai/contract");
      vi.resetModules();
    }
  });

  it("S01-25 R3 names each tier's models from the plan-tier roster response", async () => {
    await renderPage();

    expect(document.querySelector('#planTier-free')?.textContent).toContain("gpt-5.6-luna");
    expect(document.querySelector('#planTier-free')?.textContent).toContain("glm-5.3-flash");
    expect(document.querySelector('#planTier-premium')?.textContent).toContain("gpt-5.6-sol");
    expect(document.querySelector('#planTier-premium')?.textContent).toContain("claude-opus-5");
    expect(document.querySelector('#planTier-premium')?.textContent).toContain("grok-4.7-build");
    expect(document.querySelector('#planTier-free .ndTierName')?.textContent).toBe("Free");
    expect(document.querySelector('#planTier-premium .ndTierName')?.textContent).toBe("Premium");
    expect(document.querySelector('#planTier-free .ndTierPromise')?.textContent).toBe(
      "Every gauge fixed. The question is yours."
    );
    expect(document.querySelector('#planTier-premium .ndTierPromise')?.textContent).toBe(
      "Every gauge yours to set."
    );
  });

  it("S01-26 R3 renders ordered roster ids with their existing family dots", async () => {
    await renderPage();

    const freeModels = [...document.querySelectorAll<HTMLElement>('#planTier-free .ndTierModel')];
    const premiumModels = [...document.querySelectorAll<HTMLElement>('#planTier-premium .ndTierModel')];
    const expectedRosters = {
      free: ["gpt-5.6-luna", "glm-5.3-flash"],
      premium: ["gpt-5.6-sol", "claude-opus-5", "grok-4.7-build"]
    };
    expect({
      free: freeModels.map((model) => model.textContent?.trim()),
      premium: premiumModels.map((model) => model.textContent?.trim())
    }).toEqual(expectedRosters);
    expect([...freeModels, ...premiumModels].map((model) =>
      model.querySelector<HTMLElement>('.modelDot')?.style.getPropertyValue("--dot")
    )).toEqual([
      "var(--m-gpt)",
      "var(--m-default)",
      "var(--m-gpt)",
      "var(--m-claude)",
      "var(--m-grok)"
    ]);
  });

  it("uses shared model metadata for the five real and six alternate roster id shapes", async () => {
    mocks.readPlanTiers.mockResolvedValueOnce({
      free: ["gpt-5.6-luna", "claude-sonnet-5", "openai-o3", "sol-gpt-5", "GPT-5.6-SOL"],
      premium: ["gpt-5.6-sol", "claude-opus-5", "grok-4.7-build", "claude_opus", "grok/4.6", "gemini-3"]
    });
    await renderPage();

    expect([...document.querySelectorAll<HTMLElement>('.ndTierModel .modelDot')].map((dot) =>
      dot.style.getPropertyValue("--dot")
    )).toEqual([
      "var(--m-gpt)",
      "var(--m-claude)",
      "var(--m-gpt)",
      "var(--m-gpt)",
      "var(--m-gpt)",
      "var(--m-gpt)",
      "var(--m-claude)",
      "var(--m-grok)",
      "var(--m-claude)",
      "var(--m-grok)",
      "var(--m-gemini)"
    ]);
  });

  // Property: every file-fed model id renders a non-empty name and identity dot.
  // Production break: omit the --dot style for glm-5.3-flash while rendering the roster row.
  it("S03-24 R17 gives all five file-fed model ids a name and identity dot", async () => {
    await renderPage();

    const models = [...document.querySelectorAll<HTMLElement>('.ndTierModel')];
    expect(models.map((model) => ({
      name: model.textContent?.trim(),
      dot: model.querySelector<HTMLElement>('.modelDot')?.style.getPropertyValue("--dot")
    }))).toEqual([
      { name: "gpt-5.6-luna", dot: "var(--m-gpt)" },
      { name: "glm-5.3-flash", dot: "var(--m-default)" },
      { name: "gpt-5.6-sol", dot: "var(--m-gpt)" },
      { name: "claude-opus-5", dot: "var(--m-claude)" },
      { name: "grok-4.7-build", dot: "var(--m-grok)" }
    ]);
  });

  it("S01-27 R4 locks all fourteen controls while Free is chosen", async () => {
    await renderPage();
    await click('.ndOptionsToggle');

    const lockedIds = [
      "riskTier-casual",
      "riskTier-standard",
      "riskTier-high-stakes",
      "budgetTier-low",
      "budgetTier-medium",
      "budgetTier-high",
      "treeDepth",
      "steeringPresets",
      "steeringAnnotations",
      "depthMode",
      "scrutinyDepth",
      "branchingWidth",
      "concurrency",
      "maxTokens"
    ];
    const locked = lockedIds.map((id) => document.querySelector<HTMLElement>(`#${id}`)!);
    expect(locked.filter((control) => control.hasAttribute("disabled"))).toHaveLength(14);
    expect(locked.filter((control) => control.hasAttribute("aria-disabled"))).toEqual([]);
    expect(locked.map((control) => {
      const visualLock = control.tagName === "SELECT" ? control.closest<HTMLElement>('.ndSelect')! : control;
      return [visualLock.style.opacity, visualLock.style.cursor];
    })).toEqual(Array.from({ length: 14 }, () => ["", ""]));
  });

  it("S01-28 R4 forwards the Free lock to every native control family and keeps its description", async () => {
    await renderPage();
    await click('.ndOptionsToggle');

    const locked = [...document.querySelectorAll<HTMLElement>(
      '.ndSegItem:disabled,.ndSlider:disabled,.ndSteerInput:disabled,.ndSelect select:disabled'
    )];
    expect([
      document.querySelectorAll('.ndSegItem:disabled').length,
      document.querySelectorAll('.ndSlider:disabled').length,
      document.querySelectorAll('.ndSteerInput:disabled').length,
      document.querySelectorAll('.ndSelect select:disabled').length
    ]).toEqual([6, 4, 2, 2]);
    expect(locked.every((control) => (control as HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).disabled)).toBe(true);
    expect(locked.map((control) => control.getAttribute("aria-describedby")).every(Boolean)).toBe(true);
    expect(locked.every((control) => document.getElementById(control.getAttribute("aria-describedby")!))).toBe(true);
  });

  it("S01-29 R4 rejects focus and activation at the native Free lock", async () => {
    await renderPage();
    await click('.ndOptionsToggle');

    await click('#riskTier-high-stakes');
    expect(document.querySelector('#riskTier-standard')?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector('#riskTier-high-stakes')?.getAttribute("aria-checked")).toBe("false");
    const lockedIds = [
      "riskTier-casual", "riskTier-standard", "riskTier-high-stakes",
      "budgetTier-low", "budgetTier-medium", "budgetTier-high",
      "treeDepth", "steeringPresets", "steeringAnnotations",
      "depthMode", "scrutinyDepth", "branchingWidth", "concurrency", "maxTokens"
    ];
    const focusAccepted = lockedIds.filter((id) => {
      const control = document.querySelector<HTMLElement>(`#${id}`)!;
      control.focus();
      return document.activeElement === control;
    });
    expect(focusAccepted).toEqual([]);
    expect(mocks.createDebate).not.toHaveBeenCalled();
  });

  it("S01-30 R5 / M12 keeps the OPTIONS toggle and notice operable in Free", async () => {
    await renderPage();

    const toggle = document.querySelector<HTMLButtonElement>('.ndOptionsToggle')!;
    expect(toggle.hasAttribute("disabled")).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await click('.ndOptionsToggle');
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector('#additionalRunOptions')).not.toBeNull();
    expect(document.querySelector('.ndLegacyNotice')?.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "Depth mode, depth of scrutiny, branching width, concurrency, and max tokens are V2 controls the V3 run contract has no slot for — they are not sent."
    );
  });

  it("S01-31 R16 inspects a non-empty submit region for retired V2 fields", () => {
    const start = pageSource.indexOf("async function submit");
    const end = pageSource.indexOf("return (", start + "async function submit".length);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const submitBlock = pageSource.slice(start, end);
    for (const dropped of ["branching", "concurrency", "maxTokens", "role_overrides", "adaptive_expansion"]) {
      expect(submitBlock).not.toContain(dropped);
    }
  });

  it("S01-32 R16 keeps depth bounds and controlled risk/budget bindings", async () => {
    await renderPage();

    const depth = document.querySelector<HTMLInputElement>('#treeDepth')!;
    expect([depth.min, depth.max]).toEqual(["1", "5"]);
    expect(document.querySelector('#riskTier-standard')?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector('#budgetTier-low')?.getAttribute("aria-checked")).toBe("true");
  });

  it("S01-33 R6 keeps the question typeable in both tiers", async () => {
    await renderPage();

    const topic = document.querySelector<HTMLTextAreaElement>('#topic')!;
    expect(topic.hasAttribute("disabled")).toBe(false);
    expect(topic.hasAttribute("readonly")).toBe(false);
    await inputValue('#topic', "a debatable claim");
    await click('#planTier-premium');
    expect(topic.value).toBe("a debatable claim");
    expect(topic.hasAttribute("disabled")).toBe(false);
    expect(topic.hasAttribute("readonly")).toBe(false);
    await inputValue('#topic', "another debatable claim");
    expect(topic.value).toBe("another debatable claim");
  });

  it("S01-34 R8 re-pins every Free value on choosing Free, whatever was on screen", async () => {
    await renderPage();
    await inputValue('#topic', "a debatable claim");
    await click('#planTier-premium');
    await click('#riskTier-high-stakes');
    await click('#budgetTier-high');
    await inputValue('#treeDepth', "4");
    await inputValue('#steeringPresets', "Prefer primary sources");
    await inputValue('#steeringAnnotations', "Flag unsupported claims");
    await click('.ndOptionsToggle');
    await selectValue('#depthMode', "adaptive");
    await selectValue('#scrutinyDepth', "deep");
    await inputValue('#branchingWidth', "4");
    await inputValue('#concurrency', "6");
    await inputValue('#maxTokens', "4000");

    await click('#planTier-free');

    expect(document.querySelector('#riskTier-standard')?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector('#budgetTier-low')?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector<HTMLInputElement>('#treeDepth')?.value).toBe("2");
    expect(document.querySelector<HTMLTextAreaElement>('#steeringPresets')?.value).toBe("");
    expect(document.querySelector<HTMLTextAreaElement>('#steeringAnnotations')?.value).toBe("");
    expect(document.querySelector('.ndIntro')?.textContent?.trim()).toBe(
      "Free runs every debate at fixed settings. Type your question and click Start, or choose Premium to set the gauges yourself."
    );
    expect(document.querySelector('#riskTier-label')?.parentElement?.querySelector('.ndHint')?.textContent).toBe(
      "How much is riding on the answer · fixed by the Free plan"
    );
    expect(document.querySelector('#budgetTier-label')?.parentElement?.querySelector('.ndHint')?.textContent).toBe(
      "How much work the composition may spend · fixed by the Free plan"
    );
    expect(document.querySelector<HTMLSelectElement>('#depthMode')?.value).toBe("fixed");
    expect(document.querySelector<HTMLSelectElement>('#scrutinyDepth')?.value).toBe("standard");
    expect(document.querySelector<HTMLInputElement>('#branchingWidth')?.value).toBe("2");
    expect(document.querySelector<HTMLInputElement>('#concurrency')?.value).toBe("3");
    const sliderGrid = ["treeDepth", "branchingWidth", "concurrency", "maxTokens"].map((id) => {
      const slider = document.querySelector<HTMLInputElement>(`#${id}`)!;
      return { id, min: slider.min, max: slider.max, step: slider.step, value: slider.value };
    });
    expect(sliderGrid).toEqual([
      { id: "treeDepth", min: "1", max: "5", step: "1", value: "2" },
      { id: "branchingWidth", min: "1", max: "4", step: "1", value: "2" },
      { id: "concurrency", min: "1", max: "6", step: "1", value: "3" },
      { id: "maxTokens", min: "128", max: "4000", step: "32", value: "800" }
    ]);
    expect(sliderGrid.every(({ min, max, step, value }) =>
      (Number(value) - Number(min)) % Number(step) === 0 &&
      (Number(max) - Number(min)) % Number(step) === 0
    )).toBe(true);
    expect(document.querySelector<HTMLTextAreaElement>('#topic')?.value).toBe("a debatable claim");
    expect(document.querySelectorAll('.ndSegItem:disabled,.ndSlider:disabled,.ndSteerInput:disabled,.ndSelect select:disabled')).toHaveLength(14);
  });

  it("S01-35 R8 restores nothing from a remembered pre-Free state", async () => {
    await renderPage();
    await click('#planTier-premium');
    await click('#riskTier-high-stakes');
    await click('#budgetTier-high');
    await inputValue('#treeDepth', "4");
    await inputValue('#steeringPresets', "Prefer primary sources");
    await inputValue('#steeringAnnotations', "Flag unsupported claims");
    await click('#planTier-free');
    await click('#planTier-premium');

    expect(document.querySelector('#riskTier-standard')?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector('#budgetTier-low')?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector<HTMLInputElement>('#treeDepth')?.value).toBe("2");
    expect(document.querySelector<HTMLTextAreaElement>('#steeringPresets')?.value).toBe("");
    expect(document.querySelector<HTMLTextAreaElement>('#steeringAnnotations')?.value).toBe("");
    expect(document.querySelector('.ndIntro')?.textContent?.trim()).toBe(
      "Choose your risk tier, composition budget tier, and depth, then click Start."
    );
    expect(document.querySelector('#riskTier-label')?.parentElement?.querySelector('.ndHint')?.textContent).toBe(
      "How much is riding on the answer · explicit asker selection"
    );
    expect(document.querySelector('#budgetTier-label')?.parentElement?.querySelector('.ndHint')?.textContent).toBe(
      "How much work the composition may spend · provisional default, editable"
    );
  });

  it("S01-36 R9 unlocks every gauge in Premium and each control family accepts a change", async () => {
    await renderPage();
    await click('#planTier-premium');
    await click('.ndOptionsToggle');

    const gaugeIds = [
      "riskTier-casual",
      "riskTier-standard",
      "riskTier-high-stakes",
      "budgetTier-low",
      "budgetTier-medium",
      "budgetTier-high",
      "treeDepth",
      "steeringPresets",
      "steeringAnnotations",
      "depthMode",
      "scrutinyDepth",
      "branchingWidth",
      "concurrency",
      "maxTokens"
    ];
    expect(gaugeIds.filter((id) => {
      const control = document.querySelector(`#${id}`);
      return control?.hasAttribute("disabled") || control?.getAttribute("aria-disabled") === "true";
    })).toEqual([]);

    await click('#riskTier-high-stakes');
    await click('#budgetTier-high');
    await inputValue('#treeDepth', "4");
    await inputValue('#steeringPresets', "Prefer primary sources");
    await inputValue('#steeringAnnotations', "Flag unsupported claims");
    await selectValue('#scrutinyDepth', "deep");
    expect(document.querySelector('#riskTier-high-stakes')?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector('#budgetTier-high')?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector<HTMLInputElement>('#treeDepth')?.value).toBe("4");
    expect(document.querySelector<HTMLTextAreaElement>('#steeringPresets')?.value).toBe("Prefer primary sources");
    expect(document.querySelector<HTMLTextAreaElement>('#steeringAnnotations')?.value).toBe("Flag unsupported claims");
    expect(document.querySelector<HTMLSelectElement>('#scrutinyDepth')?.value).toBe("deep");
  });

  it("S01-37 R10 keeps the tree-depth range at 1 through 5 in both tiers", async () => {
    await renderPage();

    const depth = document.querySelector<HTMLInputElement>('#treeDepth')!;
    expect([depth.min, depth.max, depth.value]).toEqual(["1", "5", "2"]);
    await click('#planTier-premium');
    expect([depth.min, depth.max, depth.value]).toEqual(["1", "5", "2"]);
  });

  it("S01-38 R18 never disables Start run for the tier", async () => {
    await renderPage();
    await inputValue('#topic', "a debatable claim");

    const start = document.querySelector<HTMLButtonElement>('.ndStart')!;
    expect(start.hasAttribute("disabled")).toBe(false);
    await click('#planTier-premium');
    expect(start.hasAttribute("disabled")).toBe(false);
  });

  it("M11 · Start run stays disabled for an empty question in both tier states", async () => {
    await renderPage();

    const start = document.querySelector<HTMLButtonElement>('.ndStart')!;
    const disabledWhileFree = start.disabled;
    await click('#planTier-premium');

    expect([disabledWhileFree, start.disabled]).toEqual([true, true]);
  });

  it("S01-39 R20-C sends the chosen plan tier in the ask config", async () => {
    await renderPage();
    await inputValue('#topic', "a debatable claim");

    await submitForm();
    expect(mocks.createDebate).toHaveBeenCalledTimes(1);
    expect(mocks.createDebate.mock.calls[0]?.[1]).toMatchObject({ plan_tier: "free" });

    mocks.createDebate.mockClear();
    await click('#planTier-premium');
    await submitForm();
    expect(mocks.createDebate).toHaveBeenCalledTimes(1);
    expect(mocks.createDebate.mock.calls[0]?.[1]).toMatchObject({ plan_tier: "premium" });
  });
});
