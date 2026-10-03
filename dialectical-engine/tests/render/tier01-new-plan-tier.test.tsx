// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLAN_TIER_ROSTERS } from "@debateai/contract";

const mocks = vi.hoisted(() => ({
  createDebate: vi.fn(),
  push: vi.fn(),
  readSession: vi.fn(),
  // A21-O4c: the session token the page receives; a new one re-reads the session.
  token: "test-token"
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams()
}));

vi.mock("@/components/AuthGate", () => ({
  AuthGate: ({ children }: { children: (token: string) => unknown }) => children(mocks.token)
}));

vi.mock("@/lib/api", () => ({
  createDebate: mocks.createDebate,
  // This account already gave its one-time sensitive-data consent (V, 2026-09-29).
  contractClient: { readSession: mocks.readSession, readSensitiveDataConsent: async () => ({ status: "given" as const }) }
}));

import NewDebatePage from "../../apps/ui/app/new/NewDebatePageClient.js";
import homeCatalog from "../../apps/ui/messages/en/home.json" with { type: "json" };
import chromeCatalog from "../../apps/ui/messages/en/chrome.json" with { type: "json" };
import newDebateCatalog from "../../apps/ui/messages/en/newDebate.json" with { type: "json" };

const pageSource = readFileSync("apps/ui/app/new/NewDebatePageClient.tsx", "utf8");

/*
 * A21 · owner decision O4: the session /new already reads says, yes or no, whether a
 * scored model list is in force. Until it says yes, Model strength is greyed out and
 * marked "not in effect" on either plan. Rows that exercise the control itself therefore
 * run with it in force, so a lock they see is the PLAN's, never the not-in-effect one.
 */
const SESSION_WITH_SCORECARD = Object.freeze({
  asker_id: "owner:11111111-1111-4111-8111-111111111111",
  session_id: "22222222-2222-4222-8222-222222222222",
  caller_scope: "ASKER",
  ownership_provenance: "server_session",
  provisional_identity_model: false,
  model_scorecard_in_force: true
});
const NOT_IN_EFFECT_HINT =
  "How strong the models doing each debate job are · not in effect until the models have been scored";
const FIXED_BY_FREE_HINT = "How strong the models doing each debate job are · fixed by the Free plan";
// A21.3 carry 14 (A21.2 review Minor 2): a FAILED session read claims no reason.
const NOT_AVAILABLE_HINT = "How strong the models doing each debate job are · not available right now";
// A21.3 fix round 1 (review Minor 3): while the read is PENDING, the plain description alone.
const PENDING_HINT = "How strong the models doing each debate job are";

/*
 * A21.3 carry 14 (A21.2 review Minor 1): the Free lock of EVERY gauge is pinned in both
 * production states. With a scored model list in force, the model-strength lock seen is the
 * plan's; with none, it is the not-in-effect one — and the other twelve gauges must still lock.
 */
const SESSION_STATES = [
  ["a scored model list is in force", SESSION_WITH_SCORECARD, FIXED_BY_FREE_HINT],
  ["no scored model list is in force", { ...SESSION_WITH_SCORECARD, model_scorecard_in_force: false }, NOT_IN_EFFECT_HINT]
] as const;

/*
 * Final review C1: a plan card names the plan's usual models ONLY when the session says no scored
 * model list is in force — the one state in which that list is what a debate is seated with. Once
 * one is in force, the models are chosen for each debate job instead, so the list would be untrue;
 * while the session read is pending or has failed, the page cannot vouch for it either. In those
 * three states each card carries one plain line instead (interim phrasing #1).
 */
const SESSION_WITHOUT_SCORECARD = Object.freeze({ ...SESSION_WITH_SCORECARD, model_scorecard_in_force: false });
const MODELS_CHOSEN_PER_PART = "The AI models are chosen for each part of the debate.";
const PLAN_CARD_STATES = [
  ["a scored model list is in force", () => mocks.readSession.mockResolvedValue(SESSION_WITH_SCORECARD), false],
  ["no scored model list is in force", () => mocks.readSession.mockResolvedValue(SESSION_WITHOUT_SCORECARD), true],
  ["the session read is pending", () => mocks.readSession.mockReturnValue(new Promise(() => {})), false],
  ["the session read failed", () => mocks.readSession.mockRejectedValue(new Error("session unavailable")), false]
] as const;

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
    mocks.readSession.mockReset().mockRejectedValue(new Error("session unavailable in render test"));
    mocks.token = "test-token";
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
    await act(async () => root!.render(
      <NewDebatePage catalog={newDebateCatalog} homeCatalog={homeCatalog} chromeCatalog={chromeCatalog} />
    ));
    await settle();
  }

  async function renderPageWithScorecardInForce(): Promise<void> {
    mocks.readSession.mockResolvedValue(SESSION_WITH_SCORECARD);
    await renderPage();
  }

  /** C1: the one session state in which the plan cards still name the plan's usual models. */
  async function renderPageWithoutScorecard(): Promise<void> {
    mocks.readSession.mockResolvedValue(SESSION_WITHOUT_SCORECARD);
    await renderPage();
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
    expect(document.querySelector('#steeringPresets')).toBeNull();
    expect(document.querySelector('#steeringAnnotations')).toBeNull();
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

  it("S01-25 R3 names each tier's models from the roster declaration", async () => {
    // C1: the legacy view — the session says no scored model list is in force.
    await renderPageWithoutScorecard();

    expect(document.querySelector('#planTier-free')?.textContent).toContain("gpt-5.6-luna");
    expect(document.querySelector('#planTier-free')?.textContent).toContain("claude-sonnet-5");
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
    // C1: the legacy view — the session says no scored model list is in force.
    await renderPageWithoutScorecard();

    const freeModels = [...document.querySelectorAll<HTMLElement>('#planTier-free .ndTierModel')];
    const premiumModels = [...document.querySelectorAll<HTMLElement>('#planTier-premium .ndTierModel')];
    const expectedRosters = {
      free: ["gpt-5.6-luna", "claude-sonnet-5"],
      premium: ["gpt-5.6-sol", "claude-opus-5", "grok-4.7-build"]
    };
    expect(PLAN_TIER_ROSTERS).toEqual(expectedRosters);
    expect({
      free: freeModels.map((model) => model.textContent?.trim()),
      premium: premiumModels.map((model) => model.textContent?.trim())
    }).toEqual(expectedRosters);
    expect([...freeModels, ...premiumModels].map((model) =>
      model.querySelector<HTMLElement>('.modelDot')?.style.getPropertyValue("--dot")
    )).toEqual([
      "var(--m-gpt)",
      "var(--m-claude)",
      "var(--m-gpt)",
      "var(--m-claude)",
      "var(--m-grok)"
    ]);
  });

  it("uses shared model metadata for the five real and six alternate roster id shapes", async () => {
    vi.resetModules();
    vi.doMock("@debateai/contract", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@debateai/contract")>()),
      PLAN_TIER_ROSTERS: {
        free: ["gpt-5.6-luna", "claude-sonnet-5", "openai-o3", "sol-gpt-5", "GPT-5.6-SOL"],
        premium: ["gpt-5.6-sol", "claude-opus-5", "grok-4.7-build", "claude_opus", "grok/4.6", "gemini-3"]
      }
    }));
    try {
      const { default: PageWithProbeRoster } = await import(
        "../../apps/ui/app/new/NewDebatePageClient.js"
      );
      // C1: the legacy view — the session says no scored model list is in force.
      mocks.readSession.mockResolvedValue(SESSION_WITHOUT_SCORECARD);
      await act(async () => root!.render(
        <PageWithProbeRoster catalog={newDebateCatalog} homeCatalog={homeCatalog} chromeCatalog={chromeCatalog} />
      ));
      await settle();
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
    } finally {
      vi.doUnmock("@debateai/contract");
      vi.resetModules();
    }
  });

  it.each(PLAN_CARD_STATES)(
    "C1 · a plan card names the plan's usual models only when no scored model list is in force — %s",
    async (_state, arrange, namesRoster) => {
      arrange();
      await renderPage();
      for (const plan of ["free", "premium"] as const) {
        const card = document.querySelector<HTMLElement>(`#planTier-${plan}`)!;
        const models = card.querySelector<HTMLElement>(".ndTierModels")!;
        const listed = [...card.querySelectorAll<HTMLElement>(".ndTierModel")].map((model) => model.textContent?.trim());
        if (namesRoster) {
          // The legacy view, unchanged: the plan roster, in order, and no line.
          expect(listed).toEqual([...PLAN_TIER_ROSTERS[plan]]);
          expect(card.textContent).not.toContain(MODELS_CHOSEN_PER_PART);
        } else {
          expect(listed).toEqual([]);
          expect(models.querySelectorAll(".modelDot")).toHaveLength(0);
          for (const modelId of PLAN_TIER_ROSTERS[plan]) expect(card.textContent).not.toContain(modelId);
          expect(models.textContent?.trim()).toBe(MODELS_CHOSEN_PER_PART);
        }
        // The plan's name and promise read the same in every state.
        expect(card.querySelector(".ndTierName")?.textContent).toBe(plan === "free" ? "Free" : "Premium");
        expect(card.querySelector(".ndTierPromise")?.textContent).toBe(
          plan === "free" ? "Every gauge fixed. The question is yours." : "Every gauge yours to set."
        );
      }
    }
  );

  it.each(SESSION_STATES)("S01-27 R4 locks all fifteen controls while Free is chosen, when %s", async (_state, session, hint) => {
    mocks.readSession.mockResolvedValue(session);
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
      // A21: the model-strength row joins the Free lock — the Free plan fixes every gauge.
      "modelStrength-ECONOMY",
      "modelStrength-BALANCED",
      "modelStrength-BEST",
      "depthMode",
      "scrutinyDepth",
      "branchingWidth",
      "concurrency",
      "maxTokens"
    ];
    const locked = lockedIds.map((id) => document.querySelector<HTMLElement>(`#${id}`)!);
    expect(locked.filter((control) => control.hasAttribute("disabled"))).toHaveLength(15);
    expect(locked.filter((control) => control.hasAttribute("aria-disabled"))).toEqual([]);
    expect(locked.map((control) => {
      const visualLock = control.tagName === "SELECT" ? control.closest<HTMLElement>('.ndSelect')! : control;
      return [visualLock.style.opacity, visualLock.style.cursor];
    })).toEqual(Array.from({ length: 15 }, () => ["", ""]));
    expect(document.querySelector('#modelStrength-hint')?.textContent).toBe(hint);
  });

  it.each(SESSION_STATES)("S01-28 R4 forwards the Free lock to every native control family and keeps its description, when %s", async (_state, session) => {
    mocks.readSession.mockResolvedValue(session);
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
    // A21: the three model-strength pills are segmented items too (6 -> 9).
    ]).toEqual([9, 4, 0, 2]);
    expect(locked.every((control) => (control as HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).disabled)).toBe(true);
    expect(locked.map((control) => control.getAttribute("aria-describedby")).every(Boolean)).toBe(true);
    expect(locked.every((control) => document.getElementById(control.getAttribute("aria-describedby")!))).toBe(true);
  });

  it("S01-29 R4 rejects focus and activation at the native Free lock", async () => {
    await renderPageWithScorecardInForce();
    await click('.ndOptionsToggle');

    await click('#riskTier-high-stakes');
    expect(document.querySelector('#riskTier-standard')?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector('#riskTier-high-stakes')?.getAttribute("aria-checked")).toBe("false");
    const lockedIds = [
      "riskTier-casual", "riskTier-standard", "riskTier-high-stakes",
      "budgetTier-low", "budgetTier-medium", "budgetTier-high",
      "treeDepth",
      "modelStrength-ECONOMY", "modelStrength-BALANCED", "modelStrength-BEST",
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
    await renderPageWithScorecardInForce();
    await inputValue('#topic', "a debatable claim");
    await click('#planTier-premium');
    await click('#riskTier-high-stakes');
    await click('#budgetTier-high');
    await inputValue('#treeDepth', "4");
    await click('#modelStrength-BEST');
    // A21 O4: the choice really landed, so the reset below is proven, not vacuous.
    expect(document.querySelector('#modelStrength-BEST')?.getAttribute("aria-checked")).toBe("true");
    await click('.ndOptionsToggle');
    await selectValue('#depthMode', "adaptive");
    await selectValue('#scrutinyDepth', "deep");
    await inputValue('#branchingWidth', "4");
    await inputValue('#concurrency', "6");
    await inputValue('#maxTokens', "4000");

    await click('#planTier-free');

    expect(document.querySelectorAll('[data-field="modelStrength"][aria-checked="true"]')).toHaveLength(0);
    expect(document.querySelector('#riskTier-standard')?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector('#budgetTier-low')?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector<HTMLInputElement>('#treeDepth')?.value).toBe("2");
    expect(document.querySelector('#steeringPresets')).toBeNull();
    expect(document.querySelector('#steeringAnnotations')).toBeNull();
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
    expect(document.querySelectorAll('.ndSegItem:disabled,.ndSlider:disabled,.ndSteerInput:disabled,.ndSelect select:disabled')).toHaveLength(15);
  });

  it("S01-35 R8 restores nothing from a remembered pre-Free state", async () => {
    await renderPage();
    await click('#planTier-premium');
    await click('#riskTier-high-stakes');
    await click('#budgetTier-high');
    await inputValue('#treeDepth', "4");
    await click('#planTier-free');
    await click('#planTier-premium');

    expect(document.querySelector('#riskTier-standard')?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector('#budgetTier-low')?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector<HTMLInputElement>('#treeDepth')?.value).toBe("2");
    expect(document.querySelector('#steeringPresets')).toBeNull();
    expect(document.querySelector('#steeringAnnotations')).toBeNull();
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
    await renderPageWithScorecardInForce();
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
      "modelStrength-ECONOMY",
      "modelStrength-BALANCED",
      "modelStrength-BEST",
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
    await selectValue('#scrutinyDepth', "deep");
    await click('#modelStrength-BEST');
    expect(document.querySelector('#modelStrength-BEST')?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector('#riskTier-high-stakes')?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector('#budgetTier-high')?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector<HTMLInputElement>('#treeDepth')?.value).toBe("4");
    expect(document.querySelector('#steeringPresets')).toBeNull();
    expect(document.querySelector('#steeringAnnotations')).toBeNull();
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

  it("S01-41 A21 places Model strength beside Tree depth, with nothing chosen and no price", async () => {
    await renderPageWithScorecardInForce();

    const markup = document.body.innerHTML;
    expect(markup.indexOf('id="treeDepth"')).toBeGreaterThan(-1);
    expect(markup.indexOf('id="treeDepth"')).toBeLessThan(markup.indexOf('id="modelStrength-label"'));
    expect(markup.indexOf('id="modelStrength-label"')).toBeLessThan(markup.indexOf('class="ndProvenance"'));
    expect(document.querySelector('#modelStrength-label')?.textContent).toBe("Model strength");
    const options = [...document.querySelectorAll<HTMLElement>('[data-field="modelStrength"]')];
    expect(options.map((option) => [option.dataset.value, option.textContent])).toEqual([
      ["ECONOMY", "Economy"], ["BALANCED", "Balanced"], ["BEST", "Best"]
    ]);
    expect(options.filter((option) => option.getAttribute("aria-checked") === "true")).toEqual([]);
    const row = document.querySelector('#modelStrength-label')!.closest('.ndRow')!;
    expect(row.textContent).not.toMatch(/[$€\d]|USD/u);
    expect(document.querySelector('#modelStrength-hint')?.textContent).toBe(
      "How strong the models doing each debate job are · fixed by the Free plan"
    );
  });

  it("S01-42 A21 sends a chosen strength on Premium, none on Free, and forgets it on returning to Free", async () => {
    await renderPageWithScorecardInForce();
    await inputValue('#topic', "a debatable claim");
    await submitForm();
    expect(mocks.createDebate.mock.calls[0]?.[1]).not.toHaveProperty("model_strength");

    mocks.createDebate.mockClear();
    await click('#planTier-premium');
    // Carry 7 / preflight U4: committed phrasing #1 (the brief's "the deployment decides" is jargon).
    expect(document.querySelector('#modelStrength-hint')?.textContent).toBe(
      "How strong the models doing each debate job are · this site's usual setting applies until you choose"
    );
    await submitForm();
    expect(mocks.createDebate.mock.calls[0]?.[1]).toMatchObject({ plan_tier: "premium" });
    expect(mocks.createDebate.mock.calls[0]?.[1]).not.toHaveProperty("model_strength");

    mocks.createDebate.mockClear();
    await click('#modelStrength-BEST');
    await submitForm();
    expect(mocks.createDebate.mock.calls[0]?.[1]).toMatchObject({ plan_tier: "premium", model_strength: "BEST" });

    mocks.createDebate.mockClear();
    await click('#planTier-free');
    expect(document.querySelectorAll('[data-field="modelStrength"][aria-checked="true"]')).toHaveLength(0);
    await submitForm();
    expect(mocks.createDebate.mock.calls[0]?.[1]).not.toHaveProperty("model_strength");
  });

  it("A21-O4a greys Model strength out and marks it not in effect, on both plans, while no scorecard is in force", async () => {
    mocks.readSession.mockResolvedValue({ ...SESSION_WITH_SCORECARD, model_scorecard_in_force: false });
    await renderPage();
    await inputValue('#topic', "a debatable claim");
    const pills = () => [...document.querySelectorAll<HTMLButtonElement>('[data-field="modelStrength"]')];

    expect(pills().map((pill) => pill.textContent)).toEqual(["Economy", "Balanced", "Best"]);
    expect(pills().every((pill) => pill.disabled)).toBe(true);
    expect(document.querySelector('#modelStrength-hint')?.textContent).toBe(NOT_IN_EFFECT_HINT);

    await click('#planTier-premium');
    // Premium unlocks the plan's gauges; this one stays greyed out, and says why.
    expect(document.querySelector<HTMLButtonElement>('#riskTier-casual')?.disabled).toBe(false);
    expect(pills().every((pill) => pill.disabled)).toBe(true);
    expect(pills().every((pill) => pill.getAttribute("aria-describedby") === "modelStrength-hint")).toBe(true);
    expect(document.querySelector('#modelStrength-hint')?.textContent).toBe(NOT_IN_EFFECT_HINT);
    await click('#modelStrength-BEST');
    expect(pills().filter((pill) => pill.getAttribute("aria-checked") === "true")).toEqual([]);

    await submitForm();
    expect(mocks.createDebate).toHaveBeenCalledTimes(1);
    expect(mocks.createDebate.mock.calls[0]?.[1]).toMatchObject({ plan_tier: "premium" });
    expect(mocks.createDebate.mock.calls[0]?.[1]).not.toHaveProperty("model_strength");
  });

  it("A21-O4b reads Model strength as not in effect when the session carries no signal", async () => {
    const { model_scorecard_in_force: _signal, ...withoutSignal } = SESSION_WITH_SCORECARD;
    mocks.readSession.mockResolvedValue(withoutSignal);
    await renderPage();
    await click('#planTier-premium');

    const pills = [...document.querySelectorAll<HTMLButtonElement>('[data-field="modelStrength"]')];
    expect(pills).toHaveLength(3);
    expect(pills.every((pill) => pill.disabled)).toBe(true);
    expect(document.querySelector('#modelStrength-hint')?.textContent).toBe(NOT_IN_EFFECT_HINT);
  });

  it("A21-O4c sends no strength once a later session read says no scorecard is in force", async () => {
    mocks.readSession
      .mockResolvedValueOnce(SESSION_WITH_SCORECARD)
      .mockResolvedValueOnce({ ...SESSION_WITH_SCORECARD, model_scorecard_in_force: false });
    await renderPage();
    await inputValue('#topic', "a debatable claim");
    await click('#planTier-premium');
    await click('#modelStrength-BEST');
    expect(document.querySelector('#modelStrength-BEST')?.getAttribute("aria-checked")).toBe("true");

    // A new session (a new token) is read again, and this time the answer is no.
    mocks.token = "second-test-token";
    await renderPage();
    expect(mocks.readSession).toHaveBeenCalledTimes(2);
    const pills = [...document.querySelectorAll<HTMLButtonElement>('[data-field="modelStrength"]')];
    expect(pills.every((pill) => pill.disabled)).toBe(true);
    expect(pills.filter((pill) => pill.getAttribute("aria-checked") === "true")).toEqual([]);
    expect(document.querySelector('#modelStrength-hint')?.textContent).toBe(NOT_IN_EFFECT_HINT);

    await submitForm();
    expect(mocks.createDebate.mock.calls[0]?.[1]).toMatchObject({ plan_tier: "premium" });
    expect(mocks.createDebate.mock.calls[0]?.[1]).not.toHaveProperty("model_strength");
  });

  // A21.3 carry 14 (A21.2 review Minor 2): a failed read is not the session saying no. The page
  // does not know whether a scored model list is in force, so the note claims no reason.
  // Fix round 1 (review Minor 3): while the read is still pending, no note at all.
  it.each([
    ["has failed", () => mocks.readSession.mockRejectedValue(new Error("session unavailable")), NOT_AVAILABLE_HINT],
    ["has not answered yet", () => mocks.readSession.mockReturnValue(new Promise(() => {})), PENDING_HINT]
  ] as const)("A21-O4d locks Model strength and claims no reason when the session read %s", async (_case, arrange, hint) => {
    arrange();
    await renderPage();
    await inputValue('#topic', "a debatable claim");
    const pills = () => [...document.querySelectorAll<HTMLButtonElement>('[data-field="modelStrength"]')];

    expect(pills().every((pill) => pill.disabled)).toBe(true);
    expect(document.querySelector('#modelStrength-hint')?.textContent).toBe(hint);
    await click('#planTier-premium');
    expect(pills().every((pill) => pill.disabled)).toBe(true);
    expect(document.querySelector('#modelStrength-hint')?.textContent).toBe(hint);

    await submitForm();
    expect(mocks.createDebate.mock.calls[0]?.[1]).toMatchObject({ plan_tier: "premium" });
    expect(mocks.createDebate.mock.calls[0]?.[1]).not.toHaveProperty("model_strength");
  });
});
