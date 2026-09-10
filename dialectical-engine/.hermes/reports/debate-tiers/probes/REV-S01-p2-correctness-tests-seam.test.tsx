// @vitest-environment jsdom
/**
 * REV(S01) p2 · lens correctness/tests · MY OWN fixture, built from the CLAIM, not from the patch.
 *
 * The CLAIM under test (FIX F1): "every one of the 14 Free-locked controls still refuses to change,
 * now via aria-disabled + a guarded onChange instead of the native `disabled` attribute."
 *
 * Native `disabled` is enforced by the BROWSER: the element takes no events at all. A guarded
 * onChange is enforced by REACT's controlled-input restore. Those are not the same mechanism, and
 * the author's suite never exercises the difference: its helpers set a value and dispatch, then
 * assert the React state. This fixture asserts what the DOM NODE reads afterwards — which is what
 * a user sees — and exceeds the author's parameters: it drives every one of the 14 controls the
 * way a real keystroke drives them (assign .value, dispatch input+change), tests the COLLAPSED
 * nine as well as the expanded fourteen, sweeps the step grid across ALL FOUR sliders rather than
 * the one that was reported, and puts the REAL roster ids through the dot mapping the author only
 * exercised with mocked ones.
 */
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLAN_TIER_ROSTERS } from "@debateai/contract";

const mocks = vi.hoisted(() => ({ createDebate: vi.fn(), push: vi.fn(), readSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams()
}));
vi.mock("@/components/AuthGate", () => ({
  AuthGate: ({ children }: { children: (token: string) => unknown }) => children("probe-token")
}));
vi.mock("@/lib/api", () => ({
  createDebate: mocks.createDebate,
  contractClient: { readSession: mocks.readSession }
}));

import NewDebatePage from "@/app/new/page.js";

const pageSource = readFileSync(
  "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s01-p1-correctness/dialectical-engine/apps/ui/app/new/page.tsx",
  "utf8"
);

/** The nine locked on the COLLAPSED screen (DONE.md M8) and the five the OPTIONS panel adds. */
const COLLAPSED_NINE = [
  "riskTier-casual", "riskTier-standard", "riskTier-high-stakes",
  "budgetTier-low", "budgetTier-medium", "budgetTier-high",
  "treeDepth", "steeringPresets", "steeringAnnotations"
];
const EXPANDED_FIVE = ["depthMode", "scrutinyDepth", "branchingWidth", "concurrency", "maxTokens"];

async function settle(): Promise<void> {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}

describe("REV(S01) p2 correctness — the aria-disabled seam", () => {
  let root: Root | null = null;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.createDebate.mockReset().mockResolvedValue({ id: "run-probe" });
    mocks.push.mockReset();
    mocks.readSession.mockReset().mockRejectedValue(new Error("no session in probe"));
    document.body.innerHTML = '<div id="probe-root"></div>';
    root = createRoot(document.getElementById("probe-root")!);
  });
  afterEach(async () => { await act(async () => root!.unmount()); root = null; document.body.innerHTML = ""; });

  async function renderPage(): Promise<void> {
    await act(async () => root!.render(<NewDebatePage />));
    await settle();
  }
  async function click(selector: string): Promise<void> {
    const el = document.querySelector<HTMLElement>(selector)!;
    await act(async () => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await settle();
  }

  /**
   * Drive a control the way the BROWSER drives it under a real keystroke / drag / pick:
   * the browser mutates the node first, then fires input+change. Native `disabled` would have
   * stopped this at the source. Returns what the DOM node reads after React has settled.
   */
  async function driveLikeABrowser(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): Promise<string> {
    await act(async () => {
      const proto = el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    return el.value;
  }

  it("P1 · every one of the 14 locked controls RESTORES its value after a real-keystroke drive", async () => {
    await renderPage();
    await click('.ndOptionsToggle');
    const before: Record<string, string> = {};
    const after: Record<string, string> = {};
    for (const id of [...COLLAPSED_NINE.filter((x) => !x.includes("-")), ...EXPANDED_FIVE, "steeringPresets", "steeringAnnotations"]) {
      const el = document.querySelector<HTMLInputElement>(`#${id}`);
      if (!el) continue;
      before[id] = el.value;
      const attempt = el.tagName === "SELECT"
        ? [...el.querySelectorAll("option")].map((o) => (o as HTMLOptionElement).value).find((v) => v !== el.value)!
        : el.type === "range" ? String(Number(el.max)) : "PROBE TEXT";
      after[id] = await driveLikeABrowser(el, attempt);
    }
    expect(after).toEqual(before);
  });

  it("P2 · the six segmented pills ignore a real click AND a keyboard Enter while Free is chosen", async () => {
    await renderPage();
    const chosen = () => [...document.querySelectorAll<HTMLElement>('.ndSegItem')]
      .map((b) => `${b.id}=${b.getAttribute("aria-checked")}`).join(",");
    const before = chosen();
    for (const pill of [...document.querySelectorAll<HTMLElement>('.ndSegItem')]) {
      await act(async () => pill.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      await act(async () => pill.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    }
    await settle();
    expect(chosen()).toBe(before);
    expect(mocks.createDebate).not.toHaveBeenCalled();
  });

  it("P3 · the NINE collapsed locks each carry a resolvable aria-describedby (the author only tests the expanded 14)", async () => {
    await renderPage();
    expect(document.querySelector('#additionalRunOptions')).toBeNull();
    const unresolved = COLLAPSED_NINE.filter((id) => {
      const el = document.querySelector<HTMLElement>(`#${id}`);
      if (!el) return true;
      const ref = el.getAttribute("aria-describedby");
      return !ref || !document.getElementById(ref);
    });
    expect(unresolved).toEqual([]);
  });

  it("P4 · every locked control is reachable by keyboard — none is removed from the tab order", async () => {
    await renderPage();
    await click('.ndOptionsToggle');
    const unreachable = [...COLLAPSED_NINE, ...EXPANDED_FIVE].filter((id) => {
      const el = document.querySelector<HTMLElement>(`#${id}`);
      return !el || el.tabIndex < 0 || el.hasAttribute("disabled");
    });
    expect(unreachable).toEqual([]);
  });

  it("P5 · CLASS SWEEP of the B1 defect — every slider's value AND max sit on its own step grid", async () => {
    await renderPage();
    await click('.ndOptionsToggle');
    const offGrid = ["treeDepth", "branchingWidth", "concurrency", "maxTokens"].map((id) => {
      const el = document.querySelector<HTMLInputElement>(`#${id}`)!;
      const min = Number(el.min), max = Number(el.max), step = Number(el.step || 1), value = Number(el.value);
      return { id, min, max, step, value, valueOffGrid: (value - min) % step !== 0, maxOffGrid: (max - min) % step !== 0 };
    }).filter((r) => r.valueOffGrid || r.maxOffGrid);
    expect(offGrid).toEqual([]);
  });

  it("P6 · the REAL roster ids get their house dot (the author's test only ever mocks fake ids)", async () => {
    await renderPage();
    const dots = [...document.querySelectorAll<HTMLElement>('.ndTierModel')].map((span) => [
      span.textContent!.trim(),
      span.querySelector<HTMLElement>('.modelDot')!.style.getPropertyValue("--dot")
    ]);
    expect(dots).toEqual([
      ["gpt-5.6-luna", "var(--m-gpt)"],
      ["claude-sonnet-5", "var(--m-claude)"],
      ["gpt-5.6-sol", "var(--m-gpt)"],
      ["claude-opus-5", "var(--m-claude)"],
      ["grok-4.6", "var(--m-grok)"]
    ]);
    expect(dots.map((d) => d[0])).toEqual([...PLAN_TIER_ROSTERS.free, ...PLAN_TIER_ROSTERS.premium]);
    expect(dots.some((d) => d[1] === "var(--m-default)")).toBe(false);
  });

  it("P7 · Premium clears the lock completely — no aria-disabled=true, no residual inline lock style", async () => {
    await renderPage();
    await click('#planTier-premium');
    await click('.ndOptionsToggle');
    const residue = [...COLLAPSED_NINE, ...EXPANDED_FIVE].map((id) => {
      const el = document.querySelector<HTMLElement>(`#${id}`)!;
      const box = el.tagName === "SELECT" ? el.closest<HTMLElement>('.ndSelect')! : el;
      return { id, aria: el.getAttribute("aria-disabled"), opacity: box.style.opacity, cursor: box.style.cursor };
    }).filter((r) => r.aria === "true" || r.opacity !== "" || r.cursor !== "");
    expect(residue).toEqual([]);
  });

  it("P8 · the page carries no native `disabled` on the 14 — so the stylesheet's :disabled lock rules can never match", async () => {
    await renderPage();
    await click('.ndOptionsToggle');
    expect(document.querySelectorAll(
      '.ndSegItem:disabled,.ndSlider:disabled,.ndSteerInput:disabled,.ndSelect select:disabled'
    )).toHaveLength(0);
    // and the page paints the lock from an inline literal instead:
    expect(pageSource).toContain('const FREE_LOCK_STYLE = { opacity: 0.45, cursor: "not-allowed" }');
  });
});
