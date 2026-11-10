// V4 start step, Task 91f (owner 9 Nov, "Fix the practice first"): the practice Plus debate searches the web as the site does.
// The practice asks with billing kept off, so no run has a charge scope and the site's plan read (readWebRunPlan) finds none: every
// path was NOT_ON_PLAN, even on `--start-step premium:5`. Here: the plan a start-step practice's web step reads (premium: PLUS, free:
// FREE, no --start-step: as today), the seam it goes through (the runner's own web settings, only their plan read given the
// practice's plan where the site's read finds none), and a whole web step on the Perplexity stand-in behind the real adapter and the
// real guarded fetch: a premium start searches, a free one and a practice without --start-step make no call. Made-up pages only.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createPreviewGuardedFetch, type PreviewGateSettings } from "@debateai/providers";
import { runnerWebSearchSettings } from "../../apps/runner/src/run-settings.js";
import { runRunnerWebStep, type WebStepRunnerSettings } from "../../apps/runner/src/web-step.js";
import type { PracticeRunnerSettings } from "../../tools/preview-practice/practice-runner-composition.js";
import { practiceWebSearchOnPlan } from "../../tools/preview-practice/practice-runner-composition.js";
import {
  practiceMadeUpSearchReplies, practiceSearchStandIn, practiceWithSearchStandIn
} from "../../tools/preview-practice/practice-search-stand-in.js";
import { practiceStartWebPlan, type PracticeStartStep } from "../../tools/preview-practice/practice-start-step.js";
import { membersOf, memoryStore, stepInput, team } from "../support/web-step-world.js";
import { withoutComments } from "../support/source-text.js";

const read = (relative: string) => readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8");
/** The preview's gate part with no search socket: the stand-in names one in the search gate's place. */
const GATE = Object.freeze({ budget_socket: "/run/debateai-v3-preview/budget-v2.sock", scope_id: "preview" }) as unknown as PreviewGateSettings;
const PREMIUM: PracticeStartStep = Object.freeze({ plan: "premium", paths: 5, digs: 0 });
const FREE: PracticeStartStep = Object.freeze({ plan: "free", paths: 3, digs: 0 });

describe("Task 91f: the plan a practice's web step reads", () => {
  it("premium:5 reads as PLUS (the Plus row's sizes), free:3 as FREE, no --start-step as today (none given)", () => {
    expect(practiceStartWebPlan(PREMIUM)).toBe("PLUS");
    expect(practiceStartWebPlan(FREE)).toBe("FREE");
    expect(practiceStartWebPlan(undefined)).toBeUndefined();
  });

  const site = (plan: "PLUS" | "PRO" | null): WebStepRunnerSettings => Object.freeze({ switchedOn: true, search: null,
    searchSubject: {} as never, searchSeamOf: null, readRunPlan: async () => plan });

  it("no plan given: the runner's web settings exactly as given (the same object)", () => {
    const given = { webSearch: site(null) };
    expect(practiceWebSearchOnPlan(undefined, given)).toBe(given);
  });

  it("a plan given: only the plan read changes, the site's read first and the practice's plan where it finds none", async () => {
    const plain = site(null);
    const onPlan = practiceWebSearchOnPlan("PLUS", { webSearch: plain }).webSearch;
    expect(await onPlan.readRunPlan("r")).toBe("PLUS");
    expect({ ...onPlan, readRunPlan: null }).toEqual({ ...plain, readRunPlan: null });
    // A run billing did pin (never in the practice, whose ask keeps billing off) keeps the site's own plan.
    expect(await practiceWebSearchOnPlan("PLUS", { webSearch: site("PRO") }).webSearch.readRunPlan("r")).toBe("PRO");
    expect(await practiceWebSearchOnPlan("FREE", { webSearch: plain }).webSearch.readRunPlan("r")).toBe("FREE");
  });

  it("the practice's composition hands the runner main.ts's very call, wrapped only by the plan seam", () => {
    const flat = (source: string) => withoutComments(source).replace(/\s+/gu, " ");
    const call = "webSearch: runnerWebSearchSettings({ pool, previewGate, fetch: previewFetch, "
      + "guardOf: runnerSite.money === null ? null : runCostEnvelopeGuard, pause: monthPause })";
    expect(flat(read("apps/runner/src/main.ts"))).toContain(call);
    expect(flat(read("tools/preview-practice/practice-runner-composition.ts"))).toContain(`webSearch: practiceWebSearchOnPlan(input.webPlan, { ${call} }).webSearch,`);
    // The site's runner never takes the practice's seam.
    expect(read("apps/runner/src/main.ts")).not.toContain("practiceWebSearchOnPlan");
    // The practice's debate hands its start step's plan to the composition (no --start-step: none, as today).
    expect(flat(read("tools/preview-practice/practice-debate.ts")))
      .toContain("...(input.start === undefined ? {} : { webPlan: practiceStartWebPlan(input.start) })");
  });
});

describe("Task 91f: a whole web step on the stand-in, as the practice's runner reads the plan", () => {
  /**
   * The runner's own web settings (runnerWebSearchSettings, as main.ts and the practice compose them) over a throwaway database
   * that holds no charge scope (the practice's ask keeps billing off), the stand-in in the search gate's place, then the plan seam.
   */
  async function stepFor(start: PracticeStartStep | undefined) {
    const standIn = practiceSearchStandIn(practiceMadeUpSearchReplies());
    const plugged = practiceWithSearchStandIn({ PREVIEW_GATE_SETTINGS: GATE } as unknown as PracticeRunnerSettings, {}, standIn);
    const queried: string[] = [];
    const base = runnerWebSearchSettings({ pool: { query: async (text: string) => { queried.push(text); return { rows: [] }; } } as never,
      previewGate: plugged.environment.PREVIEW_GATE_SETTINGS, fetch: createPreviewGuardedFetch(plugged.budgetPorts), guardOf: null });
    const settings = practiceWebSearchOnPlan(practiceStartWebPlan(start), { webSearch: base }).webSearch;
    const ais = team();
    const store = memoryStore();
    const input = stepInput({ members: membersOf(ais.all), search: settings.search!, prepare: store.prepare });
    const result = await runRunnerWebStep({ ...input, pool: {} as never, settings, lane: null,
      readers: { siteLanguage: async () => null, dig: async () => null },
      stepPorts: { prepare: store.prepare, recordPlanPathStatuses: input.recordPlanPathStatuses } });
    return { result, searches: standIn.counts().searches, queried };
  }

  it("premium:5 searches every path the planner plans, through the search gate's place", async () => {
    const { result, searches, queried } = await stepFor(PREMIUM);
    expect(result.paths.map((path) => [path.pathRef, path.status])).toEqual([["a1", "SEARCHED"], ["a2", "SEARCHED"]]);
    expect(searches).toBe(4);
    // The site's read was made first (the throwaway database holds no charge scope).
    expect(queried.some((text) => text.includes("billing.run_charge_scope"))).toBe(true);
  });

  it("free:3 never searches: every path NOT_ON_PLAN, no search sent", async () => {
    const { result, searches } = await stepFor(FREE);
    expect(result.paths.map((path) => path.status)).toEqual(["NOT_ON_PLAN", "NOT_ON_PLAN"]);
    expect(searches).toBe(0);
  });

  it("a practice without --start-step keeps today's behaviour: no plan, no search", async () => {
    const { result, searches } = await stepFor(undefined);
    expect(result.paths.map((path) => path.status)).toEqual(["NOT_ON_PLAN", "NOT_ON_PLAN"]);
    expect(searches).toBe(0);
  });
});
