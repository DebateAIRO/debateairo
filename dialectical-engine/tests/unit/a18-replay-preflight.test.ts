import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MomentFileSchema, momentIdFor, type MomentBuilder } from "@debateai/scorecard";
import { currentContractHash } from "../../acceptance/moment-tools.js";
import { replayMoments } from "../../acceptance/replay-moment.js";

/**
 * Model scorecard A18c, fix round 1 (review Minor 6) — EVERY MOMENT'S PROMPT IS
 * BUILT BEFORE THE FIRST CALL. The live builder builds each moment's prompt
 * offline (nothing leaves the process) while the batch is checked, so a moment
 * the builder refuses stops the batch before anyone is asked, not half-way.
 *
 * No moment file can make today's builders refuse once its role and inputs
 * pass (`parseMomentBuilder`), so `captureMomentPacket` is wrapped, not
 * replaced: it runs the real capture unless a test names a statement to refuse,
 * exactly as A18a's writer test wraps `rm`.
 */
const capture = vi.hoisted(() => ({ refuseStatement: null as string | null }));
vi.mock("../../acceptance/moment-tools.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../acceptance/moment-tools.js")>();
  const { TypedDomainError } = await import("@debateai/kernel");
  return {
    ...actual,
    captureMomentPacket: async (builder: Parameters<typeof actual.captureMomentPacket>[0]) => {
      if (builder.family === "JUDGE_ASSESS" && builder.inputs.statement === capture.refuseStatement) {
        throw new TypedDomainError("MOMENT_PACKET_UNCAPTURED", "JUDGE_ASSESS: the live builder built no packet (test double)");
      }
      return actual.captureMomentPacket(builder);
    }
  };
});

const QUESTION = "Should the city build the new bridge?";
const MODEL = "relay-model";
const REFUSED_STATEMENT = "The builder refuses this one.";
const ASSESSMENT = {
  steelman: { summary: "The strongest case for building.", fidelity: 0.8 },
  critic: { summary: "Repair may be cheaper.", counterargumentStrength: 0.3, basis: "PLAUSIBLE_COUNTER" },
  evidence: { quality: 0.6, relevance: 0.7 },
  context: { fit: 0.9, ambiguityFlags: [] },
  fallacy: { severity: 0.1, fatalFlags: [] }
};

function judgeMoment(statement: string): object {
  const builder: MomentBuilder = { family: "JUDGE_ASSESS", inputs: { questionLine: QUESTION, statement } };
  const contractHash = currentContractHash("JUDGE_ASSESS");
  return MomentFileSchema.parse({
    kind: "DEBATEAI_MOMENT", formatVersion: 1,
    momentId: momentIdFor({ role: "JUDGE", contractHash, builder }),
    role: "JUDGE", language: null, contractHash, builder,
    graderContext: { question: QUESTION, excerpts: [] },
    recorded: null,
    source: { runId: "11111111-1111-4111-8111-111111111111", callSiteKey: "PANEL:root:provider:a", exportedAt: "2026-09-26T12:00:00.000Z", engineCommit: null }
  });
}

describe("A18 · moment:replay builds every moment's prompt before the first call (fix round 1, Minor 6)", () => {
  let scratch = "";
  beforeEach(async () => { scratch = await mkdtemp(join(tmpdir(), "a18-replay-preflight-")); });
  afterEach(async () => {
    capture.refuseStatement = null;
    await rm(scratch, { recursive: true, force: true });
  });

  it("stops the batch before anyone is asked when the builder refuses the LAST job's moment", async () => {
    await writeFile(join(scratch, "good.moment.json"), JSON.stringify(judgeMoment("Build it.")), { mode: 0o600 });
    await writeFile(join(scratch, "refused.moment.json"), JSON.stringify(judgeMoment(REFUSED_STATEMENT)), { mode: 0o600 });
    await writeFile(join(scratch, "endpoints.json"), JSON.stringify({ relays: [{
      providerRef: "relay:a", maker: "Maker A", tool: "claude", modelId: MODEL, baseUrl: "http://127.0.0.1:8791/v1",
      bearerToken: "b".repeat(43), thinkingLevels: ["low", "high"], contextWindowTokens: null
    }] }), { mode: 0o600 });
    await writeFile(join(scratch, "jobs.jsonl"), [
      { momentFile: "good.moment.json", providerRef: "relay:a", thinkingLevel: "low" },
      { momentFile: "good.moment.json", providerRef: "relay:a", thinkingLevel: "high" },
      { momentFile: "refused.moment.json", providerRef: "relay:a", thinkingLevel: "low" }
    ].map((job) => JSON.stringify(job)).join("\n"));
    const calls: string[] = [];
    const fetchImplementation = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push(String(input));
      const level = (JSON.parse(String(init?.body)) as { x_thinking_level?: string }).x_thinking_level ?? null;
      return new Response(JSON.stringify({
        id: "cmpl-1", model: MODEL,
        usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 },
        choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(ASSESSMENT) }, finish_reason: "stop" }],
        ...(level === null ? {} : { x_thinking_level: level })
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const options = {
      endpointsPath: join(scratch, "endpoints.json"), jobsPath: join(scratch, "jobs.jsonl"),
      outPath: join(scratch, "results.jsonl"), bound: { maxAttempts: 1, tokenCeiling: 512, deadlineMs: 5_000 },
      environment: {}, emit: () => undefined, sleepImplementation: async () => undefined, fetchImplementation
    };
    capture.refuseStatement = REFUSED_STATEMENT;
    await expect(replayMoments(options)).rejects.toMatchObject({ code: "MOMENT_PACKET_UNCAPTURED" });
    expect(calls).toEqual([]);
    expect(existsSync(join(scratch, "results.jsonl"))).toBe(false);
    // The control: with the builder willing, the same batch runs every job.
    capture.refuseStatement = null;
    await expect(replayMoments(options)).resolves.toEqual({ replayed: 3, alreadyDone: 0 });
    expect(calls).toHaveLength(3);
  });
});
