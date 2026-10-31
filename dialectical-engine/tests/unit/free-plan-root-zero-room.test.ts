import { describe, expect, it } from "vitest";
import {
  CostEnvelopeGuard, projectedCallCeilingMicros, type ModelSpendStore, type PersonAllowanceSource, type PersonWindow,
  type RunOwnerSpendReader
} from "@debateai/budget";
import { LENGTH_GUIDANCE_START, TypedDomainError, questionLanguageForBounds, replyLanguageExpectation } from "@debateai/kernel";
import { MAP_RUNAWAY_LIMITS, mapLimitsFor, mapListSpec, type MapLength } from "@debateai/map";
import {
  PREVIEW_GLM_GENERATION_TOKEN_FLOOR, PREVIEW_REQUEST_BODY_MAX_BYTES, buildFramedPrompt, previewModelRow
} from "@debateai/providers";
import {
  BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW, costEnvelopeCeilings,
  lengthGuidancePolicyStartValues, resolveLengthGuidance
} from "@debateai/register";
import { DEVELOPMENT_ORGAN_COST_BOUNDS } from "../../apps/runner/src/dev-deployment-register.js";
import { guidedCallBound } from "../../apps/runner/src/index.js";
import {
  guidedMapBound, rootZeroEngineMaterialCharsFor, rootZeroKeepRoomMicros, rootZeroRoomAttempts
} from "../../apps/runner/src/map-stage.js";

/**
 * Free plan, R22 (owner rulings 2026-10-29, "#1 Free reserve sized for Free's AIs"; MORNING-2026-10-17 item 1).
 *
 * The morning page said: on Free, root 0's kept room (about 16-18 cents with engine 2) is more than Free's whole-debate
 * limit of 14 cents, so a Free engine-2 debate skips the map. That 14 cents is a MODEL (tests/unit/length-guidance-map.test.ts
 * "Ruling I1": the site's per-run ceiling cut to Free's monthly credit, as the API's picker cuts it, then the body share).
 * These cases pin what the RUNNER actually does with a Free debate:
 *  - root 0's room is priced at the members of root 0's own seat (`rootZeroRoomRefs`), so on a Free debate it is priced
 *    at Free's own line-up; at the dearest Free AI (MiMo, which the preview's Free line-up includes) it is the largest;
 *  - the room is compared with the RUN's own envelope only: the version's per-run ceiling less the answer's reserve
 *    (apps/runner/src/run-settings.ts builds one guard per register version, never per plan). The Free person's month
 *    window is the shared wall, which measures each map call alone and never the room (packages/budget/src/model-spend.ts
 *    `assertCallAllowed`); root 0's own call is exempt from that wall, so it is always paid;
 *  - so at the preview's per-run ceiling ($3.00, the hosted-billing choice every release since R19 published), a Free
 *    engine-2 debate keeps root 0's room and builds its map at every Free AI, even with most of the month spent;
 *  - the skip happens only on a version whose per-run ceiling is about 25 cents (the code's start value), and then on
 *    EVERY plan alike: the room alone is larger than that body.
 */
const SITE = COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.value;
const FREE = BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value.plans.find((plan) => plan.plan_id === "FREE")!;
/** The preview's hosted-billing choice (docs/operations/preview-release-r21/scripts-2/sb1.sh `HB_ON`), as R22 publishes it. */
const PREVIEW_PER_RUN_CEILING_MICROS = 3_000_000;
const PREVIEW_DAILY_CEILING_MICROS = 10_000_000;
const policyAt = (perRunCeilingMicros: number) => Object.freeze({ perRunCeilingMicros, dailyCeilingMicros: PREVIEW_DAILY_CEILING_MICROS,
  serveReserveBasisPoints: SITE.serve_reserve_basis_points, serveOverrunBasisPoints: SITE.serve_overrun_basis_points });
const bodyAt = (perRunCeilingMicros: number) => costEnvelopeCeilings({ perRunCeilingMicros,
  serveReserveBasisPoints: SITE.serve_reserve_basis_points }).bodyMicros;

const FREE_LINE_UP = ["zai-org/GLM-5.3-Flash", "deepseek-ai/DeepSeek-V4.1-Flash", "XiaomiMiMo/MiMo-V2.6-Pro", "Qwen/Qwen3.8-Flash",
  "claude-haiku-5-5"] as const;
const price = (model: string) => {
  const row = previewModelRow(model)!;
  return Object.freeze({ inputMicrosPerMillionTokens: row.inputPriceMicrosPerMillion, outputMicrosPerMillionTokens: row.outputPriceMicrosPerMillion });
};
const QUESTION = "Should cities price congestion?";
const GUIDANCE = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "free", answerLength: "standard" });
const JUDGE = { maxAttempts: 3, tokenCeiling: Math.max(DEVELOPMENT_ORGAN_COST_BOUNDS.organs.JUDGE.tokenCeiling, PREVIEW_GLM_GENERATION_TOKEN_FLOOR),
  deadlineMs: 1000 };

/** Root 0's room on a Free engine-2 run whose root-0 seat is `model`, with the routed Haiku structure repair (LG-A). */
function freeRoom(model: string): number {
  return rootZeroKeepRoomMicros({ prices: [price(model)], ...rootZeroRoomAttempts({ questionLine: QUESTION, argumentLanguageName: "English",
    questionLanguage: questionLanguageForBounds(), tokenCeiling: guidedCallBound(JUDGE, "opening", GUIDANCE).tokenCeiling, lengthed: true,
    materialChars: rootZeroEngineMaterialCharsFor(mapLimitsFor(true)) }),
  structureRepair: { price: price("claude-haiku-5-5"), attempt: { requestBytes: PREVIEW_REQUEST_BODY_MAX_BYTES, completionTokenCeiling: 32_768 } } });
}

/** The first lengthed map list call (an angle at the runaway limits), as the runner's map caller projects it. */
const LENGTH: MapLength = { targets: LENGTH_GUIDANCE_START.map, charactersPerWord: LENGTH_GUIDANCE_START.charactersPerWord };
const LIST_SPEC = mapListSpec({ questionLine: QUESTION, languageName: "English", languageTag: "en",
  replyLanguage: replyLanguageExpectation(QUESTION), length: LENGTH },
{ angleId: "g1", kind: "OPPOSITE_CASE", label: "x".repeat(MAP_RUNAWAY_LIMITS.angleLabelMaxChars), focus: "x".repeat(MAP_RUNAWAY_LIMITS.angleFocusMaxChars) });
const LIST_BOUND = guidedMapBound(JUDGE, LIST_SPEC.replyWordsCeiling, GUIDANCE);
const LIST_PROJECTION = Object.freeze({ completionTokenCeiling: LIST_BOUND.tokenCeiling,
  requestBytes: Buffer.byteLength(JSON.stringify({ model: "m".repeat(256), max_tokens: LIST_BOUND.tokenCeiling,
    messages: buildFramedPrompt({ contract: LIST_SPEC.contract, material: LIST_SPEC.material }).packet.messages }), "utf8") });

const NOW = new Date("2026-10-29T12:00:00.000Z");
const MONTH_START = new Date("2026-10-15T00:00:00.000Z");
/** A Free person's one window (billing-core `personWindowsFor`: Free has only the month), with `spentMicros` already spent. */
function freePerson(spentMicros: number): Readonly<{ persons: PersonAllowanceSource; owners: RunOwnerSpendReader }> {
  const month: PersonWindow = Object.freeze({ scope: "PERSON_MONTH", limitMicros: FREE.monthly_credit_micros, periodStart: MONTH_START,
    resetsAt: new Date("2026-11-15T00:00:00.000Z"), finishBasisPoints: FREE.finish_bp, finishOverflowMicros: FREE.finish_overflow_micros,
    keepsReserveMicros: 0, closeBasisPoints: SITE.admission_close_basis_points });
  return Object.freeze({
    persons: { read: async () => Object.freeze([month]) },
    owners: { readRunChargeOwnerRef: async () => "owner-free", readOwnerSpentMicros: async () => spentMicros }
  });
}
const NOTHING_SPENT_ON_THE_RUN: ModelSpendStore = {
  recordSpend: async () => undefined, readRunSpentMicros: async () => 0, readRunStorySpentMicros: async () => 0,
  readDaySpentMicros: async () => 0, admitNewRun: async () => Object.freeze({ admitted: true, committedMicros: 0 })
};

/** What the run's BODY seam decides for the first map list call on `model`, root 0's room named, for a Free person. */
async function mapCallDecision(input: Readonly<{ perRunCeilingMicros: number; model: string; room: number; personSpentMicros: number }>):
  Promise<string> {
  const person = freePerson(input.personSpentMicros);
  const seam = new CostEnvelopeGuard({ store: NOTHING_SPENT_ON_THE_RUN, policy: policyAt(input.perRunCeilingMicros), clock: () => NOW,
    sharedWall: { finishBasisPoints: SITE.finish_up_to_basis_points, persons: person.persons, owners: person.owners } })
    .providerSeam({ runId: "run-free", price: price(input.model), requireReportedUsage: true, phase: "BODY" });
  return Promise.resolve(seam.assertCallAllowed({ ...LIST_PROJECTION, keepRoomMicros: input.room })).then(
    () => "ADMITTED", (error: unknown) => (error instanceof TypedDomainError ? error.code : "UNTYPED"));
}

describe("Free plan: root 0's kept room against the limits a Free debate actually meets (R22)", () => {
  const dearest = FREE_LINE_UP.reduce((most, model) => (freeRoom(model) > freeRoom(most) ? model : most));
  const freeModelBody = bodyAt(Math.min(SITE.per_run_ceiling_micros, FREE.monthly_credit_micros));

  it("the room is priced at root 0's own seat: Free's dearest AI (MiMo) gives the largest room, above the 14-cent Free model", () => {
    expect(dearest).toBe("XiaomiMiMo/MiMo-V2.6-Pro");
    expect(freeModelBody).toBe(140_000);
    expect(freeRoom(dearest)).toBeGreaterThan(freeModelBody);
    // The cheapest Free AIs' rooms fit the 14-cent model; the dearest does not.
    expect(freeRoom("Qwen/Qwen3.8-Flash")).toBeLessThan(freeModelBody);
    expect(freeRoom("zai-org/GLM-5.3-Flash")).toBeLessThan(freeModelBody);
  });

  it("at the preview's per-run ceiling, every Free AI as root 0 keeps its room and the map's first call is admitted", async () => {
    for (const model of FREE_LINE_UP) {
      expect(await mapCallDecision({ perRunCeilingMicros: PREVIEW_PER_RUN_CEILING_MICROS, model: dearest, room: freeRoom(model),
        personSpentMicros: 0 }), model).toBe("ADMITTED");
    }
  });

  // The owner's money rule (31 Oct) replaced "a fixed 20 cents past every limit": Free's month is now a wall at its 20
  // cents (its 5-cent reserve sits on top, never inside), and the 20 cents are only the tolerance for a call in flight
  // there. So 25 cents spent, which this row used to admit, now pauses the debate; the row keeps its point (the kept
  // room is never measured against the person's month) just below the wall.
  it("the room is never measured against the Free person's month: with 19.9999 cents spent (just under Free's 20-cent wall) the map call is still admitted", async () => {
    const spent = FREE.monthly_credit_micros - 1;
    const wall = FREE.monthly_credit_micros;
    const tolerance = FREE.finish_overflow_micros;
    // The room alone would cross the person's wall, so a room counted there would refuse the call.
    expect(spent + freeRoom(dearest)).toBeGreaterThan(wall);
    expect(spent + projectedCallCeilingMicros(price(dearest), LIST_PROJECTION)).toBeLessThanOrEqual(wall + tolerance);
    expect(await mapCallDecision({ perRunCeilingMicros: PREVIEW_PER_RUN_CEILING_MICROS, model: dearest, room: freeRoom(dearest),
      personSpentMicros: spent })).toBe("ADMITTED");
  });

  it("only a per-run ceiling near the code's 25-cent start value skips the map, and then on every plan alike", async () => {
    expect(SITE.per_run_ceiling_micros).toBe(250_000);
    expect(freeRoom(dearest)).toBeGreaterThan(bodyAt(SITE.per_run_ceiling_micros));
    expect(await mapCallDecision({ perRunCeilingMicros: SITE.per_run_ceiling_micros, model: dearest, room: freeRoom(dearest),
      personSpentMicros: 0 })).toBe("RUN_COST_ENVELOPE_ROOM_KEPT");
  });
});
