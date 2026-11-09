import { describe, expect, it, vi } from "vitest";
import {
  DIG_PROGRESS_LIMITS, DIG_STEPS, digProgressPath, LIVE_TRUST_WORDS, parseDigProgress, stepStates
} from "../../apps/ui/lib/v4/digProgress.js";
import { loadDigProgress } from "../../apps/ui/lib/v4/load.js";
import { TRUST_WORDS } from "../../packages/contract/src/index.js";

/*
 * Owner's screen review, 3 Nov 2026 (dig-d1 B, journey-f3, wait-d2 A): a running dig's steps and checked findings come from
 * an OPTIONAL read, GET /v1/runs/{id}/progress, which today's API does not have (404: the page shows the one calm line). The
 * page reads only what makes sense: never a step it would be guessing, never an unchecked finding, never "Didn't hold".
 */

const RUN = "d9000000-0000-4000-8000-000000000001";
const body = (extra: Record<string, unknown> = {}) => ({
  run_ref: RUN,
  steps: ["FINDING_SOURCES", "READING", "CHECKING", "WRITING"],
  now: "READING",
  findings: [
    { finding_id: "f1", text: "Pumped storage covers days, not weeks.", trust: "SURE", passed_at: "2026-11-04T10:00:00.000Z" },
    { finding_id: "f2", text: "Long lines share spare wind.", trust: "SURE_FOR_CASE", passed_at: "2026-11-04T10:01:00.000Z" }
  ],
  ...extra
});

describe("parseDigProgress", () => {
  it("reads the steps, the step working now and the checked findings in the order they passed", () => {
    expect(parseDigProgress(body(), RUN)).toEqual({
      steps: ["FINDING_SOURCES", "READING", "CHECKING", "WRITING"],
      now: "READING",
      findings: [
        { id: "f1", text: "Pumped storage covers days, not weeks.", trust: "SURE" },
        { id: "f2", text: "Long lines share spare wind.", trust: "SURE_FOR_CASE" }
      ]
    });
    // With no web search the steps start with arguing; before the first has begun nothing is working yet.
    expect(parseDigProgress(body({ steps: ["ARGUING", "CHECKING", "WRITING"], now: null, findings: [] }), RUN))
      .toEqual({ steps: ["ARGUING", "CHECKING", "WRITING"], now: null, findings: [] });
    // The run id is matched whatever its case; keys the page does not know are left alone.
    expect(parseDigProgress(body({ run_ref: RUN.toUpperCase(), reading: { done: 3, total: 6 } }), RUN)?.now).toBe("READING");
  });

  it("is no progress at all when it is another run's, or its steps would make the page guess", () => {
    for (const broken of [
      null, "text", [], body({ run_ref: "d9000000-0000-4000-8000-000000000002" }), body({ run_ref: undefined }),
      body({ steps: ["READING", "FINDING_SOURCES"] }), body({ steps: ["READING", "READING"] }), body({ steps: ["SEARCHING"] }),
      body({ steps: [...DIG_STEPS, "WRITING"] }), body({ steps: "READING" }), body({ now: "ARGUING" }), body({ now: "LATER" })
    ]) {
      expect(parseDigProgress(broken, RUN), JSON.stringify(broken)).toBeNull();
    }
  });

  it("leaves out a finding it cannot read, a second copy of one, and any that did not pass as Sure, case or still argued", () => {
    const findings = [
      { finding_id: "a", text: "Kept.", trust: "STILL_ARGUED" },
      { finding_id: "a", text: "A second copy.", trust: "SURE" },
      { finding_id: "b", text: "Fell after the rewrite.", trust: "DIDNT_HOLD" },
      { finding_id: "c", text: "Not checked.", trust: null },
      { finding_id: "", text: "No id.", trust: "SURE" },
      { finding_id: "d", text: "   ", trust: "SURE" },
      { finding_id: "e", text: "x".repeat(DIG_PROGRESS_LIMITS.textMax + 1), trust: "SURE" },
      "not a finding",
      { finding_id: "f", text: "  Trimmed.  ", trust: "SURE" }
    ];
    expect(parseDigProgress(body({ findings }), RUN)?.findings).toEqual([
      { id: "a", text: "Kept.", trust: "STILL_ARGUED" },
      { id: "f", text: "Trimmed.", trust: "SURE" }
    ]);
    // A read without a findings list still shows its steps.
    expect(parseDigProgress(body({ findings: undefined }), RUN)?.findings).toEqual([]);
    expect(parseDigProgress(body({ findings: Array.from({ length: 80 }, (_, at) => ({ finding_id: `x${String(at)}`, text: "t", trust: "SURE" })) }), RUN)
      ?.findings).toHaveLength(DIG_PROGRESS_LIMITS.findingsMax);
  });

  it("knows only the three trust words a finding can carry while the dig runs", () => {
    expect(LIVE_TRUST_WORDS).toEqual(TRUST_WORDS.filter((word) => word !== "DIDNT_HOLD"));
  });
});

describe("stepStates", () => {
  it("ticks the steps before the one working now and leaves the rest to come", () => {
    expect(stepStates({ steps: ["FINDING_SOURCES", "READING", "CHECKING", "WRITING"], now: "CHECKING" })).toEqual([
      { step: "FINDING_SOURCES", state: "DONE" }, { step: "READING", state: "DONE" },
      { step: "CHECKING", state: "NOW" }, { step: "WRITING", state: "NEXT" }
    ]);
    expect(stepStates({ steps: ["ARGUING", "CHECKING", "WRITING"], now: null }).map((step) => step.state)).toEqual(["NEXT", "NEXT", "NEXT"]);
  });
});

describe("loadDigProgress", () => {
  const answer = (status: number, json: unknown) => vi.fn(async () => new Response(
    typeof json === "string" ? json : JSON.stringify(json), { status, headers: { "content-type": "application/json" } }));

  it("asks the run's own progress read", async () => {
    const read = answer(200, body());
    await loadDigProgress(RUN, read as unknown as typeof fetch);
    expect(String((read.mock.calls[0] as unknown[])[0])).toMatch(new RegExp(`${digProgressPath(RUN).replaceAll("/", "\\/")}$`, "u"));
    expect(digProgressPath("a b/c")).toBe("/v1/runs/a%20b%2Fc/progress");
  });

  it("gives what it reads, and no progress for today's 404, a refusal or a body that makes no sense", async () => {
    expect(await loadDigProgress(RUN, answer(200, body()) as unknown as typeof fetch)).toEqual({ kind: "SHOWN", progress: parseDigProgress(body(), RUN) });
    for (const [status, json] of [[404, { error: "NOT_MOCKED" }], [401, { error: "SESSION_REQUIRED" }], [403, {}], [200, "not json"],
      [200, body({ steps: ["SEARCHING"] })]] as const) {
      expect(await loadDigProgress(RUN, answer(status, json) as unknown as typeof fetch), String(status)).toEqual({ kind: "ABSENT" });
    }
  });

  it("throws on a failed read (the server failed, or nothing answered), so it is tried again later", async () => {
    await expect(loadDigProgress(RUN, answer(500, {}) as unknown as typeof fetch)).rejects.toThrow(/DIG_PROGRESS_READ_500/u);
    await expect(loadDigProgress(RUN, answer(429, {}) as unknown as typeof fetch)).rejects.toThrow();
    await expect(loadDigProgress(RUN, vi.fn(async () => { throw new TypeError("offline"); }) as unknown as typeof fetch)).rejects.toThrow("offline");
  });
});
