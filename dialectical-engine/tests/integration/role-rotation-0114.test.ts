/**
 * 0114: the rotation pin is insert-once and immutable, the two maker laws and the eligible-list rules hold in the
 * database, and the story gains its storyteller repair count (spec 2026-10-11, Part 3; rulings C and E). The db access
 * (Task 4) inserts, reads and counts the pins, and refuses a malformed pin before the database does.
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  RunRepository, insertRunRoleRotation, migrate, readRoleRotationCounts, readRunRoleRotation, type RunRoleRotationInput
} from "@debateai/db";
import { pickRotatedRoles, roleRotationSeed, type RoleRotationCounts, type RotatedRoles } from "@debateai/scorecard";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const MIGRATIONS = new URL("../../migrations/", import.meta.url);
const STEP = "0114_role_rotation.sql";
let database: TestDatabase;
const db = () => database.pool;

async function createRun(label: string): Promise<string> {
  return new RunRepository(db()).startRun({
    questionLine: `Which models rotate in the ${label} debate?`,
    principal: { kind: "legacy", legacyAskerId: "asker:0114" },
    sessionId: `session:${label}`, callerScope: "ASKER",
    asOf: new Date("2026-10-11T00:00:00.000Z"), askerRiskTier: "casual", effectiveRiskTier: "casual",
    tierSource: "ASKER", tierProvenanceRef: `asker:${label}`, compositionBudgetTier: "low",
    depthParams: { depth: 1 }, discoveredPanel: fixtureDiscoveredPanel(2), strangerSampleRate: 1,
    envelopeBasis: { source: "test-layer" }, registerVersion: 1, batteryVersion: "0114-test-layer", batteryRows: []
  });
}
const COLUMNS = `run_id, rule, writer_provider_ref, writer_model_id, writer_maker, checker_provider_ref, checker_model_id, checker_maker,
  storyteller_provider_ref, storyteller_model_id, storyteller_maker, story_checker_provider_ref, story_checker_model_id, story_checker_maker,
  eligible_model_ids`;
type Overrides = Partial<Record<"writerMaker" | "checkerMaker" | "storytellerMaker" | "storyCheckerMaker" | "rule", string>>
  & Readonly<{ eligible?: unknown }>;
const insert = (runId: string, overrides: Overrides = {}) =>
  db().query(`INSERT INTO core.run_role_rotation (${COLUMNS}) VALUES ($1,$2,'p:a','model-a',$3,'p:b','model-b',$4,'p:b','model-b',$5,'p:a','model-a',$6,$7::text[])`,
    [runId, overrides.rule ?? "LEAST_SHARE_SEEDED_TIE_V1", overrides.writerMaker ?? "Maker A", overrides.checkerMaker ?? "Maker B",
      overrides.storytellerMaker ?? "Maker B", overrides.storyCheckerMaker ?? "Maker A",
      "eligible" in overrides ? overrides.eligible : ["model-a", "model-b"]]);
const others = (count: number) => Array.from({ length: count }, (_, index) => `model-${index + 3}`);

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 600_000);
afterAll(async () => database?.stop());

describe("0114: core.run_role_rotation is pinned once", () => {
  it("takes one row per run and never changes it", async () => {
    const runId = await createRun("pinned");
    await insert(runId);
    const row = (await db().query("SELECT writer_maker, checker_maker, eligible_model_ids, created_at FROM core.run_role_rotation WHERE run_id=$1", [runId])).rows[0];
    expect(row).toMatchObject({ writer_maker: "Maker A", checker_maker: "Maker B", eligible_model_ids: ["model-a", "model-b"] });
    expect(row.created_at).toBeInstanceOf(Date);
    await expect(insert(runId)).rejects.toThrow(/run_role_rotation_pkey/u);
    await expect(db().query("UPDATE core.run_role_rotation SET writer_maker='x' WHERE run_id=$1", [runId])).rejects.toThrow();
    await expect(db().query("DELETE FROM core.run_role_rotation WHERE run_id=$1", [runId])).rejects.toThrow();
    await expect(db().query("TRUNCATE core.run_role_rotation")).rejects.toThrow(/TRUNCATE_REJECTED/u);
  });
  it("refuses a checker of its writer's maker, for the answer and for the story", async () => {
    await expect(insert(await createRun("same-answer"), { checkerMaker: "Maker A" })).rejects.toThrow(/run_role_rotation_checker_other_maker/u);
    await expect(insert(await createRun("same-story"), { storyCheckerMaker: "Maker B" })).rejects.toThrow(/run_role_rotation_story_checker_other_maker/u);
  });
  it("refuses an unknown rule, a blank identity and an unknown run", async () => {
    await expect(insert(await createRun("rule"), { rule: "LEAST_DONE_SEEDED_TIE_V2" })).rejects.toThrow(/run_role_rotation_rule_known/u);
    await expect(insert(await createRun("blank"), { writerMaker: " " })).rejects.toThrow(/run_role_rotation_identities_present/u);
    await expect(insert(randomUUID())).rejects.toThrow(/run_role_rotation_run_id_fkey/u);
  });
  it("the runtime role inserts and reads, never updates; replay reads", async () => {
    const privileges = (await db().query(`SELECT
      has_table_privilege('debateai_runtime','core.run_role_rotation','SELECT') AS runtime_select,
      has_table_privilege('debateai_runtime','core.run_role_rotation','INSERT') AS runtime_insert,
      has_table_privilege('debateai_runtime','core.run_role_rotation','UPDATE') AS runtime_update,
      has_table_privilege('debateai_runtime','core.run_role_rotation','DELETE') AS runtime_delete,
      has_table_privilege('debateai_replay','core.run_role_rotation','SELECT') AS replay_select`)).rows[0];
    expect(privileges).toEqual({ runtime_select: true, runtime_insert: true, runtime_update: false, runtime_delete: false, replay_select: true });
  });
});

describe("0114: the eligible model ids (spec Part 3; rulings C and E)", () => {
  it("accepts 2 to 16 entries, each at most 256 characters, with repeats (two makers may share a model id)", async () => {
    await expect(insert(await createRun("eligible-16"), { eligible: ["model-a", "model-b", ...others(14)] })).resolves.toBeDefined();
    await expect(insert(await createRun("eligible-256"), { eligible: ["model-a", "model-b", "x".repeat(256)] })).resolves.toBeDefined();
    await expect(insert(await createRun("eligible-repeat"), { eligible: ["model-a", "model-b", "model-a"] })).resolves.toBeDefined();
  });
  it("refuses too few, too many, or more than one dimension", async () => {
    await expect(insert(await createRun("eligible-one"), { eligible: ["model-a"] })).rejects.toThrow(/run_role_rotation_eligible_count/u);
    await expect(insert(await createRun("eligible-none"), { eligible: [] })).rejects.toThrow(/run_role_rotation_eligible_count/u);
    await expect(insert(await createRun("eligible-17"), { eligible: ["model-a", "model-b", ...others(15)] }))
      .rejects.toThrow(/run_role_rotation_eligible_count/u);
    await expect(insert(await createRun("eligible-2d"), { eligible: [["model-a", "model-b"], ["model-a", "model-b"]] }))
      .rejects.toThrow(/run_role_rotation_eligible_count/u);
  });
  it("refuses a list missing one of the four picks", async () => {
    await expect(insert(await createRun("eligible-missing"), { eligible: ["model-a", "model-c"] }))
      .rejects.toThrow(/run_role_rotation_eligible_has_picks/u);
  });
  it("refuses a blank entry and an entry over 256 characters", async () => {
    await expect(insert(await createRun("eligible-blank"), { eligible: ["model-a", "model-b", "  "] }))
      .rejects.toThrow(/run_role_rotation_eligible_entries/u);
    await expect(insert(await createRun("eligible-empty"), { eligible: ["model-a", "model-b", ""] }))
      .rejects.toThrow(/run_role_rotation_eligible_entries/u);
    await expect(insert(await createRun("eligible-long"), { eligible: ["model-a", "model-b", "x".repeat(257)] }))
      .rejects.toThrow(/run_role_rotation_eligible_entries/u);
    // The sixteenth entry is checked too (the last place the list can hold one).
    await expect(insert(await createRun("eligible-last-blank"), { eligible: ["model-a", "model-b", ...others(13), " "] }))
      .rejects.toThrow(/run_role_rotation_eligible_entries/u);
  });
  it("refuses a NULL entry and a NULL list", async () => {
    await expect(insert(await createRun("eligible-null-entry"), { eligible: ["model-a", "model-b", null] }))
      .rejects.toThrow(/run_role_rotation_eligible_no_null/u);
    await expect(insert(await createRun("eligible-null"), { eligible: null })).rejects.toMatchObject({ code: "23502" });
  });
});

describe("0114: serve.answer_story.storyteller_repairs", () => {
  it("is a nullable integer from 0 to 32", async () => {
    const column = (await db().query(`SELECT data_type, is_nullable FROM information_schema.columns
      WHERE table_schema='serve' AND table_name='answer_story' AND column_name='storyteller_repairs'`)).rows[0];
    expect(column).toEqual({ data_type: "integer", is_nullable: "YES" });
    const check = (await db().query(`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conrelid='serve.answer_story'::regclass AND conname='answer_story_storyteller_repairs_bounded'`)).rows[0];
    expect(check.definition).toMatch(/storyteller_repairs >= 0/u);
    expect(check.definition).toMatch(/storyteller_repairs <= 32/u);
  });
});

/**
 * Task 11 (orchestrator ruling 2026-10-11, "always an answer"): a rotated debate whose pinned answer member is
 * unavailable at claim is served by the sealed register role, disclosed as a fallback for ROLE_UNAVAILABLE. 0114 names
 * the reason PER ROLE beside 0076's run-level `fallback_reason`, which keeps its meaning: money was used. A fallback with
 * no per-role reason is the money fallback, as every row before 0114 and every run that is not rotated records it.
 * The answer trigger and the foreign keys are set aside (replica role, rolled back) so only the CHECKs are tested.
 */
describe("0114: serve.serve_disclosure names each role's fallback reason (Task 11)", () => {
  type Row = Readonly<{ writer: "PINNED" | "STAND_IN"; checker: "PINNED" | "STAND_IN"; fallbackReason?: string | null;
    writerReason?: string | null; checkerReason?: string | null }>;
  const disclosure = async (row: Row) => {
    const client = await db().connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL session_replication_role=replica");
      await client.query(`INSERT INTO serve.serve_disclosure (answer_id, answer_version, run_id,
          writer_planned_ref, checker_planned_ref, writer_served_ref, checker_served_ref,
          writer_fallback, checker_fallback, fallback_reason, checker_same_as_writer,
          writer_fallback_reason, checker_fallback_reason)
        VALUES ($1, 1, $2, 'p:pinned-writer', 'p:pinned-checker', $3, $4, $5, $6, $7, false, $8, $9)`,
      [randomUUID(), randomUUID(),
        row.writer === "PINNED" ? "p:pinned-writer" : "p:sealed-writer", row.checker === "PINNED" ? "p:pinned-checker" : "p:sealed-checker",
        row.writer !== "PINNED", row.checker !== "PINNED", row.fallbackReason ?? null, row.writerReason ?? null, row.checkerReason ?? null]);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  };
  it("adds two nullable per-role reason columns and swaps 0076's reason rule for the per-role one", async () => {
    const columns = (await db().query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_schema='serve' AND table_name='serve_disclosure' AND column_name LIKE '%fallback_reason' ORDER BY column_name`)).rows;
    expect(columns).toEqual([
      { column_name: "checker_fallback_reason", data_type: "text", is_nullable: "YES" },
      { column_name: "fallback_reason", data_type: "text", is_nullable: "YES" },
      { column_name: "writer_fallback_reason", data_type: "text", is_nullable: "YES" }
    ]);
    const names = (await db().query(`SELECT conname FROM pg_constraint WHERE conrelid='serve.serve_disclosure'::regclass
      AND (conname LIKE 'serve_disclosure_fallback%' OR conname LIKE 'serve_disclosure_role_reasons%') ORDER BY conname`)).rows
      .map((row) => row.conname);
    expect(names).toEqual([
      "serve_disclosure_fallback_names_its_reasons", "serve_disclosure_fallback_reason_check",
      "serve_disclosure_role_reasons_are_whole", "serve_disclosure_role_reasons_known"
    ]);
  });
  it("accepts today's rows unchanged: no fallback, and a money fallback with no per-role reason", async () => {
    await expect(disclosure({ writer: "PINNED", checker: "PINNED" })).resolves.toBeUndefined();
    await expect(disclosure({ writer: "STAND_IN", checker: "STAND_IN", fallbackReason: "MONEY" })).resolves.toBeUndefined();
  });
  it("accepts a stand-in for an unavailable model, alone (no money) or beside a money fallback", async () => {
    await expect(disclosure({ writer: "STAND_IN", checker: "PINNED", writerReason: "ROLE_UNAVAILABLE" })).resolves.toBeUndefined();
    await expect(disclosure({ writer: "STAND_IN", checker: "STAND_IN", fallbackReason: "MONEY",
      writerReason: "ROLE_UNAVAILABLE", checkerReason: "MONEY" })).resolves.toBeUndefined();
    await expect(disclosure({ writer: "STAND_IN", checker: "STAND_IN",
      writerReason: "ROLE_UNAVAILABLE", checkerReason: "ROLE_UNAVAILABLE" })).resolves.toBeUndefined();
  });
  it("says money was used exactly when a role fell back for money", async () => {
    // A stand-in for an unavailable model is not money.
    await expect(disclosure({ writer: "STAND_IN", checker: "PINNED", fallbackReason: "MONEY", writerReason: "ROLE_UNAVAILABLE" }))
      .rejects.toThrow(/serve_disclosure_fallback_names_its_reasons/u);
    // 0076's rule still holds for a row without per-role reasons: a fallback names its reason.
    await expect(disclosure({ writer: "STAND_IN", checker: "PINNED" })).rejects.toThrow(/serve_disclosure_fallback_names_its_reasons/u);
    await expect(disclosure({ writer: "STAND_IN", checker: "PINNED", fallbackReason: "MONEY", writerReason: "MONEY" })).resolves.toBeUndefined();
    await expect(disclosure({ writer: "STAND_IN", checker: "PINNED", writerReason: "MONEY" }))
      .rejects.toThrow(/serve_disclosure_fallback_names_its_reasons/u);
  });
  it("names a per-role reason for every fallback or for none, and only for a fallback", async () => {
    await expect(disclosure({ writer: "STAND_IN", checker: "STAND_IN", fallbackReason: "MONEY", writerReason: "ROLE_UNAVAILABLE" }))
      .rejects.toThrow(/serve_disclosure_role_reasons_are_whole/u);
    await expect(disclosure({ writer: "PINNED", checker: "PINNED", writerReason: "ROLE_UNAVAILABLE" }))
      .rejects.toThrow(/serve_disclosure_role_reasons_are_whole/u);
  });
  it("knows two reasons, per role; the run-level column still knows only money", async () => {
    // (PostgreSQL tests the CHECKs in name order; each row below passes every rule but the one it names.)
    await expect(disclosure({ writer: "STAND_IN", checker: "PINNED", writerReason: "CHEAPER" }))
      .rejects.toThrow(/serve_disclosure_role_reasons_known/u);
    await expect(disclosure({ writer: "STAND_IN", checker: "PINNED", fallbackReason: "ROLE_UNAVAILABLE", writerReason: "MONEY" }))
      .rejects.toThrow(/serve_disclosure_fallback_reason_check/u);
  });
});

describe("0114: a forward step, applied once", () => {
  it("is recorded after 0113 and a second migrate() changes nothing", async () => {
    const steps = (await db().query("SELECT source_name FROM public.debateai_schema_migration_step ORDER BY source_name")).rows
      .map((row) => row.source_name);
    // data-export S01 (V-41): the export's 0115 is recorded after 0114, the mail-locale step's 0116 after 0115 (S01-C05),
    // the debate shape's map 0117 after 0116, the language check's site cost 0118 after 0117, the reclaim resume
    // 0119 after 0118, then the reply measures (0120, spec 2026-10-15), then the engine verdict (0121, spec 2026-10-15
    // engine redesign R2), then the engine's map answer step (0122, spec 2026-10-15 engine redesign R3), then the
    // side-by-side releases (0123, spec 2026-10-21 side-by-side uploads), then the settings activation (0124), last
    // (side-by-side spec §13).
    expect(steps.slice(-12)).toEqual(["0113_billing_price_currencies.sql", STEP, "0115_data_export.sql", "0116_mail_locale.sql",
      "0117_debate_shape_map.sql", "0118_language_check_spend.sql", "0119_reclaim_resume.sql", "0120_reply_measures.sql",
      "0121_engine_verdict.sql", "0122_engine_map_check.sql", "0123_side_by_side_releases.sql", "0124_settings_activation.sql"]);
    const ledger = async () => (await db().query("SELECT name, applied_at FROM public.debateai_schema_migration ORDER BY name")).rows;
    const before = await ledger();
    expect(before.filter((row) => row.name === STEP)).toHaveLength(1);
    await migrate(database.pool);
    const again = (await db().query("SELECT source_name FROM public.debateai_schema_migration_step ORDER BY source_name")).rows
      .map((row) => row.source_name);
    expect(again).toEqual(steps);
    expect(await ledger()).toEqual(before);
  });
  it("replays: the SQL run twice more by hand leaves the same constraints", async () => {
    const constraints = async () => (await db().query(`SELECT conrelid::regclass::text AS relation, conname, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE conrelid IN ('core.run_role_rotation'::regclass, 'serve.answer_story'::regclass, 'serve.serve_disclosure'::regclass)
      ORDER BY 1, 2`)).rows;
    const before = await constraints();
    const sql = await readFile(new URL(STEP, MIGRATIONS), "utf8");
    await db().query(sql);
    await db().query(sql);
    expect(await constraints()).toEqual(before);
  });
});

const role = (providerRef: string, modelId: string, maker: string) => ({ providerRef, modelId, maker });
const A = role("p:a", "model-a", "Maker A");
const B = role("p:b", "model-b", "Maker B");
const C = role("p:c", "model-c", "Maker C");
const RULE = "LEAST_SHARE_SEEDED_TIE_V1" as const;
const pin = (runId: string, eligibleModelIds: readonly string[] = ["model-a", "model-b", "model-c"]): RunRoleRotationInput =>
  ({ runId, rule: RULE, answerWriter: A, answerChecker: B, storyteller: C, storyChecker: A, eligibleModelIds });
/** An executor that fails the test if a query ever reaches it: a refusal here happened before the database. */
const unreachable = { query: async () => { throw new Error("REACHED_DATABASE"); } } as never;

describe("insertRunRoleRotation / readRunRoleRotation", () => {
  it("round-trips one pin, eligible model ids included, and answers null for a run without one", async () => {
    const runId = await createRun("round-trip");
    await insertRunRoleRotation(db(), pin(runId));
    const pinned = await readRunRoleRotation(db(), runId);
    expect(pinned).toMatchObject({ runId, rule: RULE, answerWriter: A, answerChecker: B, storyteller: C, storyChecker: A });
    expect(pinned!.eligibleModelIds).toEqual(["model-a", "model-b", "model-c"]);
    expect(pinned!.createdAt).toBeInstanceOf(Date);
    expect(Object.isFrozen(pinned)).toBe(true);
    expect(Object.isFrozen(pinned!.answerWriter)).toBe(true);
    expect(Object.isFrozen(pinned!.eligibleModelIds)).toBe(true);
    expect(await readRunRoleRotation(db(), await createRun("none"))).toBeNull();
  });
  it("takes the picker's RotatedRoles as they are: { runId, ...rotated }", async () => {
    const rotated: RotatedRoles = pickRotatedRoles({
      panel: [
        { provider_ref: "p:a", maker: "Maker A", model_id: "model-a" },
        { provider_ref: "p:b", maker: "Maker B", model_id: "model-b" },
        { provider_ref: "p:a2", maker: "Maker A", model_id: "model-a2" }
      ],
      counts: {},
      seed: roleRotationSeed({ as_of: "2026-10-11T00:00:00.000Z", question_line: "Which models rotate?" })
    })!;
    const runId = await createRun("picked");
    const input = { runId, ...rotated } satisfies RunRoleRotationInput;
    await insertRunRoleRotation(db(), input);
    const pinned = await readRunRoleRotation(db(), runId);
    // Opener rotation (spec 2026-10-11 Part 2, option B): the opener has no column; it is the pin's first
    // eligible entry, and the list is the debate's position order (owner ruling R5), one model per maker.
    const { opener, ...pin } = rotated;
    expect(pinned).toMatchObject({ ...pin, runId });
    expect(pinned!.eligibleModelIds).toEqual(rotated.eligibleModelIds);
    expect(pinned!.eligibleModelIds[0]).toBe(opener.modelId);
    expect([...pinned!.eligibleModelIds].sort()).toEqual(["model-a", "model-b"]);
  });
  it("refuses a malformed pin before the database does", async () => {
    const runId = randomUUID();
    const refused = (input: RunRoleRotationInput) =>
      expect(insertRunRoleRotation(unreachable, input)).rejects.toThrow("RUN_ROLE_ROTATION_INVALID");
    await refused({ ...pin(runId), answerChecker: A });
    await refused({ ...pin(runId), storyteller: B, storyChecker: B });
    await refused({ ...pin(runId), rule: "OTHER" as never });
    await refused({ ...pin(runId), answerWriter: role("p:a", " ", "Maker A") });
    await refused({ ...pin(runId), storyChecker: role("p:a", "model-a", "M".repeat(257)) });
    // The eligible list: 2 to 16 strings, each non-blank and at most 256 characters, holding all four picks.
    await refused(pin(runId, ["model-a", "model-b"]));
    await refused(pin(runId, ["model-a"]));
    await refused(pin(runId, ["model-a", "model-b", "model-c", " "]));
    await refused(pin(runId, ["model-a", "model-b", "model-c", ""]));
    await refused(pin(runId, ["model-a", "model-b", "model-c", "x".repeat(257)]));
    await refused(pin(runId, ["model-a", "model-b", "model-c", ...others(14)]));
    await refused(pin(runId, ["model-a", "model-b", "model-c", null as never]));
    await refused(pin(runId, "model-a,model-b,model-c" as never));
    await refused(pin(runId, [, "model-a", "model-b", "model-c"] as never));
    await refused({ ...pin(runId), eligibleModelIds: undefined as never });
    await expect(insertRunRoleRotation(unreachable, pin(runId))).rejects.toThrow("REACHED_DATABASE");
  });
  it("accepts a list with repeats and at the bounds (16 entries, 256 characters)", async () => {
    for (const [label, list] of [
      ["repeat", ["model-a", "model-b", "model-c", "model-a"]],
      ["sixteen", ["model-a", "model-b", "model-c", ...others(13)]],
      ["long", ["model-a", "model-b", "model-c", "x".repeat(256)]]
    ] as const) {
      const runId = await createRun(`bounds-${label}`);
      await insertRunRoleRotation(db(), pin(runId, list));
      expect((await readRunRoleRotation(db(), runId))!.eligibleModelIds).toEqual(list);
    }
  });
});

describe("readRoleRotationCounts", () => {
  const tally = (counts: RoleRotationCounts, roleName: keyof RoleRotationCounts, modelId: string) =>
    counts[roleName]?.[modelId] ?? { picked: 0, eligible: 0 };
  const moved = (before: RoleRotationCounts, after: RoleRotationCounts, roleName: keyof RoleRotationCounts, modelId: string) => {
    const [from, to] = [tally(before, roleName, modelId), tally(after, roleName, modelId)];
    return { picked: to.picked - from.picked, eligible: to.eligible - from.eligible };
  };

  it("counts, per role and model id, the pins naming it and the pins it was eligible in", async () => {
    const before: RoleRotationCounts = await readRoleRotationCounts(db());
    for (const label of ["count-1", "count-2"]) {
      await insertRunRoleRotation(db(), { runId: await createRun(label), rule: RULE, answerWriter: C, answerChecker: B, storyteller: B,
        storyChecker: C, eligibleModelIds: ["model-b", "model-c", "model-d"] });
    }
    await insertRunRoleRotation(db(), { runId: await createRun("count-3"), rule: RULE, answerWriter: A, answerChecker: B, storyteller: A,
      storyChecker: B, eligibleModelIds: ["model-a", "model-b"] });
    const after: RoleRotationCounts = await readRoleRotationCounts(db());
    expect(moved(before, after, "ANSWER_WRITER", "model-c")).toEqual({ picked: 2, eligible: 2 });
    expect(moved(before, after, "ANSWER_WRITER", "model-a")).toEqual({ picked: 1, eligible: 1 });
    expect(moved(before, after, "ANSWER_WRITER", "model-b")).toEqual({ picked: 0, eligible: 3 });
    expect(moved(before, after, "ANSWER_CHECKER", "model-b")).toEqual({ picked: 3, eligible: 3 });
    expect(moved(before, after, "STORYTELLER", "model-b")).toEqual({ picked: 2, eligible: 3 });
    expect(moved(before, after, "STORYTELLER", "model-a")).toEqual({ picked: 1, eligible: 1 });
    expect(moved(before, after, "STORY_CHECKER", "model-c")).toEqual({ picked: 2, eligible: 2 });
    expect(moved(before, after, "STORY_CHECKER", "model-b")).toEqual({ picked: 1, eligible: 3 });
    // Eligible but never picked: present in every role with picked 0.
    for (const roleName of ["ANSWER_WRITER", "ANSWER_CHECKER", "STORYTELLER", "STORY_CHECKER"] as const) {
      expect(after[roleName]!["model-d"]).toEqual({ picked: 0, eligible: tally(before, roleName, "model-d").eligible + 2 });
    }
    expect(Object.keys(after).sort()).toEqual(["ANSWER_CHECKER", "ANSWER_WRITER", "OPENER", "STORYTELLER", "STORY_CHECKER"]);
    expect(Object.isFrozen(after)).toBe(true);
    expect(Object.isFrozen(after.ANSWER_WRITER)).toBe(true);
    expect(Object.isFrozen(after.ANSWER_WRITER!["model-c"])).toBe(true);
  });
  it("counts a model once per pin even when the pin's list repeats it (ruling E)", async () => {
    const before = await readRoleRotationCounts(db());
    await insertRunRoleRotation(db(), { runId: await createRun("count-repeat"), rule: RULE, answerWriter: A, answerChecker: B, storyteller: B,
      storyChecker: A, eligibleModelIds: ["model-a", "model-b", "model-a", "model-e", "model-e"] });
    const after = await readRoleRotationCounts(db());
    expect(moved(before, after, "ANSWER_WRITER", "model-a")).toEqual({ picked: 1, eligible: 1 });
    expect(moved(before, after, "STORY_CHECKER", "model-a")).toEqual({ picked: 1, eligible: 1 });
    expect(moved(before, after, "ANSWER_CHECKER", "model-e")).toEqual({ picked: 0, eligible: 1 });
    expect(moved(before, after, "OPENER", "model-a")).toEqual({ picked: 1, eligible: 1 });
    expect(moved(before, after, "OPENER", "model-e")).toEqual({ picked: 0, eligible: 1 });
  });
  // Opener rotation (spec 2026-10-11 Part 2, option B; owner rulings R2, R6): no column of its own. The
  // opener is the pin's FIRST eligible entry, and a pin written before the rotation (in panel order) counts
  // its first entry, the debate's actual opener, as true history.
  it("counts the opener as each pin's first eligible entry, older panel-order pins included", async () => {
    const before = await readRoleRotationCounts(db());
    for (const label of ["opener-1", "opener-2"]) {
      await insertRunRoleRotation(db(), { runId: await createRun(label), rule: RULE, answerWriter: C, answerChecker: B, storyteller: B,
        storyChecker: C, eligibleModelIds: ["model-b", "model-c", "model-d"] });
    }
    await insertRunRoleRotation(db(), { runId: await createRun("opener-3"), rule: RULE, answerWriter: A, answerChecker: B, storyteller: A,
      storyChecker: B, eligibleModelIds: ["model-d", "model-a", "model-b"] });
    const after = await readRoleRotationCounts(db());
    expect(moved(before, after, "OPENER", "model-b")).toEqual({ picked: 2, eligible: 3 });
    expect(moved(before, after, "OPENER", "model-d")).toEqual({ picked: 1, eligible: 3 });
    expect(moved(before, after, "OPENER", "model-c")).toEqual({ picked: 0, eligible: 2 });
    expect(moved(before, after, "OPENER", "model-a")).toEqual({ picked: 0, eligible: 1 });
    // The opener is independent of the four roles: model-c wrote twice and opened none of these.
    expect(moved(before, after, "ANSWER_WRITER", "model-c")).toEqual({ picked: 2, eligible: 2 });
  });
  it("feeds the picker as they are", async () => {
    const counts = await readRoleRotationCounts(db());
    const rotated = pickRotatedRoles({
      panel: [
        { provider_ref: "p:a", maker: "Maker A", model_id: "model-a" },
        { provider_ref: "p:b", maker: "Maker B", model_id: "model-b" }
      ],
      counts,
      seed: roleRotationSeed({ as_of: "2026-10-11T00:00:00.000Z", question_line: "Which counts?" })
    });
    expect(rotated).not.toBeNull();
  });
});
