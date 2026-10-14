// The preview practice's debate-shape support (plan 2026-10-12-debate-shape-phase2d, Task 2; Task 1's notes (a), (b)):
// runPracticeDebate really receives `shape`. The three ask settings reach the request the ask path is handed
// (depth_params), the ask path and the runner both read the version that carries the row (the practice's own, or the
// code's next with --register-next), and a comparison question id is asked. The throwaway database, the register
// import and the two compositions are stand-ins here (nothing is started, nothing is sent); the integration suite
// (tests/integration/preview-practice-run.test.ts) runs the real ones.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEBATE_SHAPE_POLICY_ROW_KEY, debateShapePolicyStartValues, type DebateShapePolicy } from "@debateai/register";
import { runPracticeDebate } from "../../tools/preview-practice/practice-debate.js";
import { OPENINGS_QUESTIONS } from "../../tools/preview-practice/practice-openings-questions.js";
import { parsePracticeRegisterExport, type PracticeRegisterImportReceipt } from "../../tools/preview-practice/practice-register-import.js";
import type { PracticeSettings, PracticeSockets } from "../../tools/preview-practice/practice-settings.js";

const seen = vi.hoisted(() => ({
  /** Register versions present in the stand-in database (the exactness check reads them). */
  versions: new Set<string>(),
  /** The row the stand-in register holds, by version. */
  rows: new Map<number, unknown>(),
  receipt: null as unknown,
  published: [] as unknown[][],
  readVersions: [] as number[],
  askVersions: [] as number[],
  runnerVersions: [] as number[],
  requests: [] as Record<string, unknown>[]
}));

vi.mock("@debateai/db", async (importOriginal) => ({
  ...await importOriginal<typeof import("@debateai/db")>(),
  migrate: vi.fn(async () => undefined),
  configureContentEncryption: vi.fn()
}));
vi.mock("@debateai/register", async (importOriginal) => ({
  ...await importOriginal<typeof import("@debateai/register")>(),
  readDebateShapePolicy: vi.fn(async (_pool: unknown, version: number) => {
    seen.readVersions.push(version);
    return seen.rows.get(version) ?? null;
  })
}));
vi.mock("../../tools/preview-practice/practice-throwaway-db.js", () => ({
  startPracticeDatabase: vi.fn(async () => {
    const pool = {
      query: async (text: string, params?: unknown[]) => ({
        rows: text.includes("FROM register.register_version") && seen.versions.has(String(params?.[0])) ? [{ "?column?": 1 }] : []
      })
    };
    return { pool, databaseName: "debateai_practice_00000000", extraPool: () => pool, stop: async () => undefined };
  })
}));
vi.mock("../../tools/preview-practice/practice-register-import.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../tools/preview-practice/practice-register-import.js")>(),
  importPracticeRegister: vi.fn(async () => seen.receipt),
  publishPracticeShapeVersion: vi.fn(async (...args: unknown[]) => {
    seen.published.push(args);
    seen.rows.set(6, args[3]);
    return { baseRegisterVersion: "5", registerVersion: "6", row: "ADDED", snapshotSha256: "a".repeat(64) };
  })
}));
vi.mock("../../tools/preview-practice/practice-ask-composition.js", () => ({
  practiceRemainingPorts: () => ({ deepinfra: async () => { throw new Error("no gate"); }, anthropic: async () => { throw new Error("no gate"); } }),
  composePracticeAsk: vi.fn(async (input: { settings: PracticeSettings }) => {
    seen.askVersions.push(input.settings.runner.REGISTER_VERSION);
    // Admits nothing: the debate ends as an ask that was not dispatched, after the request was handed over.
    return { application: { submit: async (request: Record<string, unknown>) => { seen.requests.push(request); } } };
  })
}));
vi.mock("../../tools/preview-practice/practice-runner-composition.js", () => ({
  composePracticeRunner: vi.fn(async (input: { environment: { REGISTER_VERSION: number } }) => {
    seen.runnerVersions.push(input.environment.REGISTER_VERSION);
    return { runner: {}, callStats: { summary: () => ({}) } };
  })
}));

/** An export whose newest (live) version is 5; its rows do not matter here (the import is a stand-in). */
const REGISTER = parsePracticeRegisterExport(JSON.stringify({
  schema: "preview-practice-register-export-v1",
  versions: [
    { register_version: "4", row_count: 1, base_register_version: null, publication_id: null, request_sha256: null, snapshot_sha256: null,
      publication_kind: null, recorded_at: null },
    { register_version: "5", row_count: 1, base_register_version: "4", publication_id: null, request_sha256: null, snapshot_sha256: null,
      publication_kind: "GENERAL", recorded_at: null }
  ],
  rows: [{ register_version: "4", row_key: "alpha", value_json: "1", source_ref: "live" },
    { register_version: "5", row_key: "alpha", value_json: "1", source_ref: "live" }]
}));
const SETTINGS = { runner: { REGISTER_VERSION: 5 }, previewConfig: { premium_model_ids: [] } } as unknown as PracticeSettings;
const SOCKETS = { deepinfra: "/nowhere/deepinfra.sock", anthropic: "/nowhere/anthropic.sock" } as PracticeSockets;
const ASK = Object.freeze({ depthMode: "fixed", scrutiny: "deep", answerLength: "short" } as const);
const LIVE: PracticeRegisterImportReceipt = Object.freeze({ registerVersion: "5", steps: [] });
const codeNext = (addedKeys: readonly string[], changedKeys: readonly string[] = []): PracticeRegisterImportReceipt => Object.freeze({
  registerVersion: "6", steps: [], codeNext: { baseRegisterVersion: "5", addedKeys, changedKeys, deltaSha256: "b".repeat(64) } });

function debate(extra: Readonly<Record<string, unknown>>) {
  return runPracticeDebate({ settings: SETTINGS, sockets: SOCKETS, register: REGISTER, budgetPorts: {} as never, observer: {} as never,
    depth: 1, questionId: "ro-euro", ...extra } as Parameters<typeof runPracticeDebate>[0]);
}

beforeEach(() => {
  seen.versions = new Set(["4", "5"]);
  seen.rows.clear();
  seen.receipt = LIVE;
  for (const list of [seen.published, seen.readVersions, seen.askVersions, seen.runnerVersions, seen.requests]) list.length = 0;
});

describe("practice debate shape: runPracticeDebate receives the shape (Task 1's notes)", () => {
  it("--shape-policy without --register-next: the practice's own version (6) is published, both compositions read it, the ask carries the three settings", async () => {
    const policy: DebateShapePolicy = debateShapePolicyStartValues();
    const result = await debate({ shape: { policy, ask: ASK } });
    expect(seen.published).toHaveLength(1);
    expect(seen.published[0]![1]).toBe(REGISTER);
    expect(seen.published[0]![2]).toBe(LIVE);
    expect(seen.published[0]![3]).toEqual(policy);
    expect([seen.readVersions, seen.askVersions, seen.runnerVersions]).toEqual([[6], [6], [6]]);
    expect(seen.requests).toHaveLength(1);
    expect(seen.requests[0]!.depth_params).toEqual({ depth: 1, depthMode: "fixed", scrutiny: "deep", answerLength: "short" });
    // Task 1's note (b): a comparison question id is asked, word for word.
    expect(seen.requests[0]!.question_line).toBe(OPENINGS_QUESTIONS.find((question) => question.id === "ro-euro")!.questionLine);
    expect(result.questionId).toBe("ro-euro");
    expect(result.admission).toMatchObject({ admitted: false, refusalCode: "NOT_DISPATCHED" });
    // Final review M-2: report.json's register block names the version the debate ran on (as shape.registerVersion and
    // the transcript do), with the imported newest (live) version kept under its own name.
    expect(result.register).toEqual({ registerVersion: "6", importedRegisterVersion: "5", steps: [] });
    expect(result.shape?.registerVersion).toBe("6");
  });

  it("--shape-policy with --register-next: nothing more is published; the code's next version (6), which carries the row, is read", async () => {
    seen.receipt = codeNext([DEBATE_SHAPE_POLICY_ROW_KEY]);
    seen.versions.add("6");
    seen.rows.set(6, debateShapePolicyStartValues());
    const result = await debate({ registerNext: {} as never, shape: { policy: debateShapePolicyStartValues(), ask: ASK } });
    expect(seen.published).toEqual([]);
    expect([seen.readVersions, seen.askVersions, seen.runnerVersions]).toEqual([[6], [6], [6]]);
    expect(seen.requests[0]!.depth_params).toEqual({ depth: 1, depthMode: "fixed", scrutiny: "deep", answerLength: "short" });
    // The import's receipt already names the code's next version: it is reported as it is (M-2).
    expect(result.register).toBe(seen.receipt);
    expect(result.shape?.registerVersion).toBe("6");
  });

  it("--shape-policy with --register-next: shape.row says what the code's next version did to the row: ADDED, REPLACED or UNCHANGED (final review M-3)", async () => {
    const rowOf = async (receipt: PracticeRegisterImportReceipt) => {
      seen.receipt = receipt;
      seen.versions.add("6");
      seen.rows.set(6, debateShapePolicyStartValues());
      return (await debate({ registerNext: {} as never, shape: { policy: debateShapePolicyStartValues(), ask: {} } })).shape?.row;
    };
    expect(await rowOf(codeNext([DEBATE_SHAPE_POLICY_ROW_KEY]))).toBe("ADDED");
    expect(await rowOf(codeNext(["judgeContractHash"], [DEBATE_SHAPE_POLICY_ROW_KEY]))).toBe("REPLACED");
    // The export already held a row with the same bytes (value and source ref): the key is in neither list.
    expect(await rowOf(codeNext(["judgeContractHash"]))).toBe("UNCHANGED");
    expect(seen.published).toEqual([]);
  });

  it("no shape: today's debate (the live version, depth only, nothing published)", async () => {
    const result = await debate({});
    // Row absent: report.json's register block stays today's receipt, byte for byte (M-2).
    expect(result.register).toBe(LIVE);
    expect(seen.published).toEqual([]);
    expect([seen.askVersions, seen.runnerVersions]).toEqual([[5], [5]]);
    expect(seen.requests[0]!.depth_params).toEqual({ depth: 1 });
  });

  it("the ask settings alone on a register that holds its own row: the ask carries them on the live version", async () => {
    seen.rows.set(5, debateShapePolicyStartValues());
    await debate({ shape: { policy: null, ask: { answerLength: "detailed" } } });
    expect(seen.published).toEqual([]);
    expect([seen.askVersions, seen.runnerVersions]).toEqual([[5], [5]]);
    expect(seen.requests[0]!.depth_params).toEqual({ depth: 1, answerLength: "detailed" });
  });

  it("the ask settings without a row in force (none, or switched off) are refused before the ask is composed", async () => {
    await expect(debate({ shape: { policy: null, ask: { scrutiny: "deep" } } }))
      .rejects.toMatchObject({ code: "PRACTICE_SHAPE_SETTINGS_WITHOUT_ROW" });
    seen.rows.set(5, { ...debateShapePolicyStartValues(), enabled: false });
    await expect(debate({ shape: { policy: null, ask: { scrutiny: "deep" } } }))
      .rejects.toMatchObject({ code: "PRACTICE_SHAPE_SETTINGS_WITHOUT_ROW" });
    expect([seen.askVersions, seen.requests]).toEqual([[], []]);
  });

  it("--shape-policy on a code's next version composed without it: refused before the ask is composed", async () => {
    seen.receipt = codeNext([]);
    seen.versions.add("6");
    await expect(debate({ registerNext: {} as never, shape: { policy: debateShapePolicyStartValues(), ask: {} } }))
      .rejects.toMatchObject({ code: "PRACTICE_SHAPE_POLICY_NOT_PUBLISHED" });
    expect(seen.askVersions).toEqual([]);
  });
});
