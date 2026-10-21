// Debate shape, plan Task 16 (spec 2026-10-12 §3.1; global constraint "row absent = today, byte for byte"): a run
// admitted without a shape is TODAY'S run, on every runner the register can boot.
//
// One debate is admitted once into a seed copy of the migrated database (pre-flight PF-B54: per-run copies of one
// migrated template, never the shared pool), then argued on per-run copies of that seed by runners booted, exactly as
// apps/runner/src/main.ts boots them (`readDebateShapeRunnerSettings` on the register version), from five sealed
// register versions:
//   - ABSENT:          no P2a/P2b row at all (today's register; the baseline every other variant is compared with);
//   - HASH_MATCH:      no debateShapePolicy row, a mapContractHash row equal to the code's hash;
//   - HASH_MISMATCH:   no debateShapePolicy row, a mapContractHash row that is NOT the code's hash (the T6 fix-round law);
//   - HASH_MALFORMED:  no debateShapePolicy row, a mapContractHash row that is not a hash at all;
//   - DISABLED:        the debateShapePolicy row present with `enabled: false`, and the code's map hash — the runner
//                      reads the row raw, so it boots WITH the shape (it can argue a shaped receipt), yet this run has none.
// Every variant must save the same debate (nodes, edges, reductions, reviews, answer with its marks and typed mark
// records, composed text, fact bundle), make the same ledger rows (call-site keys, actors, outcomes, contract hashes),
// send the gates the same prompts (model, kind, contract id and a fingerprint of the prompt with only its random ids,
// fence and canary masked), ask no MAP: call and write no map row; the public answer read carries no `shape` key (P2a M8).
// The ask side: a register whose shape row is `enabled: false` admits exactly as a register without the row (no shape
// receipt minted, the client's shape settings dropped), and the row in force (the positive control) does mint one.
//
// What this does NOT prove: nothing here runs the pre-P2a code. The proof that nothing moved against TODAY'S code is the
// existing suites, unchanged and green (plan Task 16 Step 2), and the unit proofs that today's judge and writer prompts
// are byte-identical (Tasks 4, 5). The comparison here is between runners of this branch.
import { createHash, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { evaluateAskAdmission, type RunCreationSettings } from "@debateai/api";
import { PLAN_TIER_ROSTERS, type AskRequest } from "@debateai/contract";
import { createPool, migrate, type Pool } from "@debateai/db";
import { mapPromptContractHash } from "@debateai/map";
import { readPromptFrame, type PromptPacket } from "@debateai/providers";
import {
  computeStructuralCeilingBasis, debateShapeInForce, debateShapePolicyRow, debateShapePolicyStartValues, parseRegisterVersionText,
  readDebateShapePolicy, registerVersionToSafeLegacyNumber, type RegisterPublicationRow, type RegisterVersionText
} from "@debateai/register";
import { ServeRepository } from "@debateai/serve";
import { normaliseAskForDebateShape } from "../../apps/api/src/debate-shape-ask.js";
import { readDebateShapeRunnerSettings } from "../../apps/runner/src/debate-shape-boot.js";
import { wirePacket } from "../support/framed-packet.js";
import {
  CEILING_TERMS, OWNER_CALL_CONCURRENCY, PANEL_REFS, previewDebateHarness, type AdmittedRun
} from "../support/preview-debate-harness.js";
import type { GateOverride, GateRequest } from "../support/preview-gate-stubs.js";
import { scriptedAnswers } from "../support/scripted-answers.js";
import { importHistoricalRegisterFixture, publishRegisterFixture, registerFixtureRow } from "../support/registerFixtures.js";
import { copyDatabase, dropDatabase, savedDebate, type SavedDebate } from "../support/saved-debate.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { testReleaseKey } from "../support/releaseKey.js";

let database: TestDatabase;
let admin: Pool;
const stubClosers: (() => Promise<void>)[] = [];
/** The migrated database (with the five register versions below) every per-run copy is made from (PF-B54). */
const MIGRATED_COPY = "debate_shape_absent_migrated";
const databaseUrl = (name: string): string => database.connectionString.replace(/\/[^/?]+(?=\?|$)/u, `/${name}`);

const CODE_MAP_HASH = mapPromptContractHash();
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu;

/** The register versions this file publishes, by the variant they boot (assigned by the publication, in `beforeAll`). */
type RegisterVariant = "ABSENT" | "HASH_MATCH" | "HASH_MISMATCH" | "HASH_MALFORMED" | "DISABLED" | "ENABLED";
let REGISTER: Readonly<Record<RegisterVariant, number>>;
type Variant = Exclude<RegisterVariant, "ENABLED">;
const VARIANTS: readonly Variant[] = ["ABSENT", "HASH_MATCH", "HASH_MISMATCH", "HASH_MALFORMED", "DISABLED"];

const POLICY = debateShapePolicyStartValues();
const shapeRow = (enabled: boolean) => debateShapePolicyRow(enabled ? POLICY : { ...POLICY, enabled: false }, "test-layer:task-16");
const hashRow = (value: string) => registerFixtureRow("mapContractHash", value, "test-layer:task-16");
/** A row of no family the shape reads: a version needs at least one row (register_version.row_count > 0). */
const MARKER = registerFixtureRow("task16RowAbsentMarker", true, "test-layer:task-16");

/**
 * Publishes one register version holding exactly `rows` through the register's own publication port (the sanctioned
 * fixture writer; no direct register DML, tests/architecture/register-support-publication.test.ts), on top of `base`,
 * and returns the version the publication sealed.
 */
async function publishRegisterVersion(pool: Pool, base: RegisterVersionText,
  rows: readonly RegisterPublicationRow[]): Promise<RegisterVersionText> {
  const receipt = await publishRegisterFixture(pool, {
    publicationId: randomUUID(), baseRegisterVersion: base, rows: Object.freeze([...rows]), sourceRef: "test-layer:task-16"
  });
  return receipt.registerVersion;
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  // The migrations seal no version: today's register (ABSENT) is imported as historical version 1, the only way the
  // port writes a version without a base; every other variant is published on top of the one before it.
  await importHistoricalRegisterFixture(database.pool, 1, [MARKER]);
  let base = parseRegisterVersionText("1");
  const versions: Partial<Record<RegisterVariant, number>> = { ABSENT: registerVersionToSafeLegacyNumber(base) };
  for (const [variant, rows] of [
    ["HASH_MATCH", [hashRow(CODE_MAP_HASH)]],
    ["HASH_MISMATCH", [hashRow("f".repeat(64))]],
    ["HASH_MALFORMED", [hashRow("not-a-hash")]],
    ["DISABLED", [shapeRow(false), hashRow(CODE_MAP_HASH)]],
    ["ENABLED", [shapeRow(true), hashRow(CODE_MAP_HASH)]]
  ] as const) {
    base = await publishRegisterVersion(database.pool, base, rows);
    versions[variant] = registerVersionToSafeLegacyNumber(base);
  }
  REGISTER = Object.freeze(versions as Record<RegisterVariant, number>);
  admin = createPool(databaseUrl("postgres"), { max: 1 });
  // The shared pool's idle sessions close after node-postgres's ten idle seconds; then the migrated database is copied.
  await copyDatabase(admin, "debateai_s00", MIGRATED_COPY);
}, 600_000);
afterEach(async () => { await Promise.all(stubClosers.splice(0).map((close) => close())); });
afterAll(async () => { await admin?.end(); await database?.stop(); });

/** One /complete request as the gate saw it: model, kind, contract id, and a fingerprint of WHAT it asked. */
type PromptSeen = Readonly<{ model: string; kind: string; contractId: string | null; fingerprint: string }>;

/**
 * The prompt with only what is random per run masked: the frame's own fence and canary (read through the frame's
 * reader, as scriptedAnswers does) and every UUID (node, edge, artifact ids minted at run time). Everything else —
 * the contract id, the instruction, the material, the question — is in the fingerprint.
 */
function promptSeen(request: GateRequest, chat: string): PromptSeen {
  let contractId: string | null = null;
  let masked = chat;
  try {
    const frame = readPromptFrame(wirePacket(chat) as PromptPacket);
    contractId = frame.contractId;
    masked = chat.split(frame.fence).join("#|<fence>|#").split(frame.canary).join("<canary>");
  } catch {
    // A claim probe is not framed: its text is compared whole.
  }
  return Object.freeze({
    model: request.model, kind: request.kind, contractId,
    fingerprint: createHash("sha256").update(masked.replace(UUID, "<id>"), "utf8").digest("hex")
  });
}

/** A key a ledger row carries that is its own place on the clock or a random id of its own (not what was done). */
const LEDGER_VOLATILE = ["ledger_entry_id", "sequence", "attempt_id", "raw_artifact_ref", "started_at", "finished_at", "input_hash"];

/**
 * A run's random ids named as savedDebate names them: a node by its place in the save order (`node#k`), an edge
 * likewise (`edge#k`); any other id (an artifact, an attempt, the answer) masked as `<id>`.
 */
async function idNamer(pool: Pool, runId: string): Promise<(text: string) => string> {
  const names = new Map<string, string>();
  (await pool.query<{ node_id: string }>(`SELECT node_id::text FROM core.node WHERE run_id=$1 ORDER BY created_at_seq`, [runId]))
    .rows.forEach((row, index) => names.set(row.node_id, `node#${String(index)}`));
  (await pool.query<{ edge_id: string }>(`SELECT edge_id::text FROM core.edge WHERE run_id=$1 ORDER BY created_at_seq`, [runId]))
    .rows.forEach((row, index) => names.set(row.edge_id, `edge#${String(index)}`));
  return (text) => text.replace(UUID, (id) => names.get(id.toLowerCase()) ?? "<id>");
}

/** Every ledger row of the run (all action kinds), without its clock and its own random ids; other ids named. */
async function ledgerRows(pool: Pool, runId: string, name: (text: string) => string): Promise<readonly string[]> {
  const result = await pool.query<{ row: Record<string, unknown> }>(
    `SELECT to_jsonb(entry) AS row FROM ledger.ledger_entry AS entry WHERE run_id=$1 ORDER BY sequence`, [runId]);
  return result.rows.map(({ row }) => JSON.stringify(Object.fromEntries(Object.entries(row)
    .filter(([key]) => !LEDGER_VOLATILE.includes(key))
    .map(([key, value]) => [key, typeof value === "string" ? name(value) : value]))));
}

/** The answer's typed mark records (serve.condition_mark), the affected nodes named by save order (`node#k`). */
async function markRecords(pool: Pool, answerId: string, name: (text: string) => string): Promise<readonly unknown[]> {
  const result = await pool.query<{ row: Record<string, unknown>; affected: string[] }>(
    `SELECT to_jsonb(marked) - 'condition_mark_id' - 'answer_id' - 'at_seq' AS row,
            ARRAY(SELECT link.node_id::text FROM serve.condition_mark_node AS link
                  WHERE link.condition_mark_id = marked.condition_mark_id ORDER BY link.node_id) AS affected
       FROM serve.condition_mark AS marked WHERE answer_id=$1 ORDER BY at_seq`, [answerId]);
  return result.rows.map(({ row, affected }) => JSON.parse(JSON.stringify({ ...row, affected: affected.map(name).sort() },
    (_key, value: unknown) => typeof value === "string" ? name(value) : value)) as unknown);
}

/**
 * The asker's answer projection with its ids named, without what is not content: `relevant_as_of` (the clock a fact was
 * read at; savedDebate leaves it out too), and the ORDER of `affected_node_ids` (the read sorts them by the random
 * node id, so the same set comes back in a different order; compared as a set, sorted by name).
 */
function publicAnswerNamed(projection: unknown, name: (text: string) => string): unknown {
  return JSON.parse(name(JSON.stringify(projection)), (key, value: unknown) =>
    key === "relevant_as_of" ? undefined
      : key === "affected_node_ids" && Array.isArray(value) ? [...(value as string[])].sort() : value) as unknown;
}

/** Every key named `shape` anywhere inside `value`, by path. */
function shapeKeys(value: unknown, path = "$"): readonly string[] {
  if (value === null || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((entry, index) => shapeKeys(entry, `${path}[${String(index)}]`));
  return Object.entries(value as Record<string, unknown>).flatMap(([key, inner]) =>
    [...(key === "shape" ? [`${path}.shape`] : []), ...shapeKeys(inner, `${path}.${key}`)]);
}

/** What one variant's run left behind that must be the same in every variant. */
type VariantResult = Readonly<{
  saved: SavedDebate; ledger: readonly string[]; keys: readonly string[]; prompts: readonly PromptSeen[];
  marks: readonly unknown[]; publicAnswer: unknown; envelopeBasis: string; depthParams: string;
}>;

describe("a run admitted without a shape is today's run (spec §3.1, plan Task 16)", () => {
  it("the boot: no shape row boots today's runner whatever map hash is sealed; a disabled row boots a runner that can argue the shape", async () => {
    expect(await readDebateShapeRunnerSettings(database.pool, REGISTER.ABSENT)).toBeNull();
    expect(await readDebateShapeRunnerSettings(database.pool, REGISTER.HASH_MATCH)).toBeNull();
    expect(await readDebateShapeRunnerSettings(database.pool, REGISTER.HASH_MISMATCH)).toBeNull();
    expect(await readDebateShapeRunnerSettings(database.pool, REGISTER.HASH_MALFORMED)).toBeNull();
    // The disabled row is still a row for the runner (the preview's rollback: shaped runs admitted before the switch finish).
    expect(await readDebateShapeRunnerSettings(database.pool, REGISTER.DISABLED)).toEqual({ mapContractHash: CODE_MAP_HASH });
    expect(await readDebateShapeRunnerSettings(database.pool, REGISTER.ENABLED)).toEqual({ mapContractHash: CODE_MAP_HASH });
  });

  it("the ask side: a register whose shape row is disabled admits exactly as one without the row — no shape receipt; the row in force mints one", async () => {
    // As apps/api/src/main.ts composes it: the row read once, `debateShapeInForce`, the option only when in force; then
    // as submit runs it: the ask normalised for its plan key, then evaluateAskAdmission sizes the receipt.
    const panel = PLAN_TIER_ROSTERS.premium.map((modelId, index) => Object.freeze({
      provider_ref: `provider:${String(index)}`, maker: `maker:${String(index)}`, model_id: modelId,
      probe_evidence_ref: `probe:${String(index)}`, probed_at: "2026-10-14T00:00:00.000Z"
    }));
    const ask = Object.freeze({
      question_line: "Should cities price congestion at peak hours?", risk_tier: "casual", tier_source: "ASKER",
      tier_provenance_ref: "asker:task-16", composition_budget_tier: "high", plan_tier: "premium",
      // The client sends shape settings; without a row in force they are dropped (today's stored bytes).
      depth_params: { depth: 2, depthMode: "fixed", scrutiny: "deep", answerLength: "short" },
      decision_scope: "debate shape row absent", as_of: "2026-10-14T00:00:00.000Z", steering_presets: [], steering_annotations: []
    }) as unknown as AskRequest;
    const admitOn = async (version: number) => {
      const inForce = debateShapeInForce(await readDebateShapePolicy(database.pool, version));
      const settings: RunCreationSettings = {
        strangerSampleRate: 0, releaseKey: testReleaseKey(version), registerVersion: version, batteryVersion: "task-16", settlementWatchHandle: "task-16",
        resolveDiscoveredPanel: async () => panel,
        resolveEnvelopeBasis: async ({ depthParams, panelSize, backupSequencesProvisioned, shape }) => computeStructuralCeilingBasis({
          ...CEILING_TERMS, panelSize, depth: Number(depthParams.depth), backupSequencesProvisioned, ...(shape === null ? {} : { shape })
        }),
        resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({ effectiveRiskTier, tierSource: tierSource as never, tierProvenanceRef }),
        ...(inForce === null ? {} : { debateShapePolicy: inForce })
      };
      const normalised = normaliseAskForDebateShape(ask, inForce, "premium");
      const admission = await evaluateAskAdmission(settings, normalised);
      return { inForce, depthParams: JSON.stringify(normalised.depth_params), basis: JSON.stringify(admission.envelopeBasis) };
    };
    const absent = await admitOn(REGISTER.ABSENT);
    const disabled = await admitOn(REGISTER.DISABLED);
    const hashOnly = await admitOn(REGISTER.HASH_MISMATCH);
    const enabled = await admitOn(REGISTER.ENABLED);

    expect(absent.inForce).toBeNull();
    expect(disabled.inForce).toBeNull();
    expect(absent.depthParams).toBe('{"depth":2}');
    expect(shapeKeys(JSON.parse(absent.basis))).toEqual([]);
    // Today's receipt, byte for byte: the same structural formula with no shape, for the same panel.
    expect(absent.basis).toBe(JSON.stringify(computeStructuralCeilingBasis({
      ...CEILING_TERMS, panelSize: panel.length, depth: 2, backupSequencesProvisioned: 0
    })));
    expect(JSON.parse(absent.basis)).toMatchObject({ formula_version: "DR-184-v4" });
    expect(disabled).toEqual(absent);
    expect(hashOnly).toEqual(absent);
    // Positive control: the same ask under the row in force is stored with all four settings and minted a shape receipt.
    expect(enabled.inForce).not.toBeNull();
    expect(Object.keys(JSON.parse(enabled.depthParams) as object)).toEqual(["depth", "depthMode", "scrutiny", "answerLength"]);
    expect(JSON.parse(enabled.basis)).toMatchObject({ formula_version: "DR-185-shape-v1" });
    expect(shapeKeys(JSON.parse(enabled.basis))).toEqual(["$.shape"]);
  });

  it.each([["parallel", true], ["serial", false]] as const)(
    "%s: runners booted from every register version save the same debate as today's, ask no MAP: call, write no map row",
    async (name, concurrency) => {
      // Pre-flight PF-B54: admit once into a seed copy of the migrated template, copy the seed per variant, drop each copy.
      const seedName = `absent_seed_${name}`;
      await copyDatabase(admin, MIGRATED_COPY, seedName);
      const seedPool = createPool(databaseUrl(seedName));
      let debate: AdmittedRun;
      try {
        debate = await previewDebateHarness({ pool: () => seedPool, stubClosers }).admittedRun(`absent-${name}`, { panelRefs: PANEL_REFS, depth: 2 });
      } finally {
        await seedPool.end();
      }
      const results = new Map<Variant, VariantResult>();
      for (const variant of VARIANTS) {
        const copy = `absent_${name}_${variant.toLowerCase()}`;
        await copyDatabase(admin, seedName, copy);
        const pool = createPool(databaseUrl(copy));
        try {
          // The boot, as main.ts: the shape settings from the register version (null = today's runner).
          const debateShape = await readDebateShapeRunnerSettings(pool, REGISTER[variant]);
          expect(debateShape, variant).toEqual(variant === "DISABLED" ? { mapContractHash: CODE_MAP_HASH } : null);
          const harness = previewDebateHarness({ pool: () => pool, stubClosers });
          const prompts: PromptSeen[] = [];
          const scripted = scriptedAnswers(debate.question);
          const answers = (request: GateRequest, chat: string): GateOverride | null => {
            prompts.push(promptSeen(request, chat));
            return scripted(request, chat);
          };
          const gates = await harness.startGates({}, undefined, answers);
          const composed = await harness.previewRunner(gates, "resend", {
            ...(concurrency ? { callConcurrency: OWNER_CALL_CONCURRENCY } : {}),
            ...(debateShape === null ? {} : { debateShape })
          });
          const result = await harness.completedRun(composed, debate, gates);
          const calls = await harness.modelCalls(debate.runId);
          expect(calls.filter((call) => call.call_site_key.startsWith("MAP:")), variant).toEqual([]);
          expect(gates.requests.filter((request) => request.kind === "MAP" || request.kind === "UNKNOWN"), variant).toEqual([]);
          const mapRows = await pool.query<{ n: string }>(`SELECT ((SELECT count(*) FROM core.map_item WHERE run_id=$1)
            + (SELECT count(*) FROM core.map_choice WHERE run_id=$1) + (SELECT count(*) FROM core.map_position WHERE run_id=$1))::text AS n`,
          [debate.runId]);
          expect(mapRows.rows[0]!.n, variant).toBe("0");
          const run = (await pool.query<{ envelope_basis: Record<string, unknown>; depth_params: Record<string, unknown> }>(
            `SELECT envelope_basis, depth_params FROM core.run WHERE run_id=$1`, [debate.runId])).rows[0]!;
          expect(shapeKeys(run.envelope_basis), variant).toEqual([]);
          expect(run.depth_params, variant).toEqual({ depth: 2 });
          // P2a M8: the public answer read (the asker's projection) carries no `shape` key anywhere.
          const projection = await new ServeRepository(pool).readAnswerProjection(result.answerId, debate.askerId);
          expect(projection, variant).not.toBeNull();
          expect(shapeKeys(projection), variant).toEqual([]);
          const saved = await savedDebate(pool, debate.runId, result.answerId);
          const name = await idNamer(pool, debate.runId);
          const ledger = await ledgerRows(pool, debate.runId, name);
          // A review's key names its node (JUDGE:review:<node id>): named by save order, as the saved debate is.
          const keys = calls.map((call) => name(call.call_site_key));
          results.set(variant, Object.freeze({
            saved,
            // Parallel calls finish in any order: the ledger's and the gates' orders are compared as sorted lists there.
            ledger: concurrency ? [...ledger].sort() : ledger,
            keys: concurrency ? [...keys].sort() : keys,
            prompts: concurrency ? [...prompts].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) : prompts,
            marks: await markRecords(pool, result.answerId, name),
            publicAnswer: publicAnswerNamed(projection, name),
            envelopeBasis: JSON.stringify(run.envelope_basis),
            depthParams: JSON.stringify(run.depth_params)
          }));
        } finally {
          await pool.end();
        }
        await dropDatabase(admin, copy);
      }
      await dropDatabase(admin, seedName);

      const today = results.get("ABSENT")!;
      // Not vacuous: today's run is a whole debate — five roots' worth of judge legs, a panel, reviews, an answer.
      expect(today.saved.nodes.length).toBeGreaterThan(4);
      expect(today.keys).toEqual(expect.arrayContaining(["JUDGE", "JUDGE:cross-root:0->1", "JUDGE:defender:root0:r2:p4",
        "COMPOSER:SYNTHESIZER:INITIAL:1"]));
      expect(today.keys.filter((key) => /^JUDGE:review:node#\d+$/u.test(key)).length).toBeGreaterThan(0);
      expect([...new Set(today.prompts.map((prompt) => prompt.kind))]).toEqual(expect.arrayContaining(["JUDGE", "PANEL", "REVIEW", "COMPOSE"]));
      expect(today.saved.mapItems).toEqual([]);
      expect(today.saved.mapChoice).toEqual([]);
      expect(today.saved.mapPositions).toEqual([]);
      for (const variant of VARIANTS.filter((entry) => entry !== "ABSENT")) {
        const other = results.get(variant)!;
        expect(other.keys, `${variant}: call-site keys`).toEqual(today.keys);
        expect(other.ledger, `${variant}: ledger rows`).toEqual(today.ledger);
        expect(other.prompts, `${variant}: prompts`).toEqual(today.prompts);
        expect(other.saved.nodes.length, `${variant}: node count`).toBe(today.saved.nodes.length);
        expect(other.marks, `${variant}: mark records`).toEqual(today.marks);
        expect(other.saved, `${variant}: saved debate`).toEqual(today.saved);
        expect(other.publicAnswer, `${variant}: public answer`).toEqual(today.publicAnswer);
        expect(other.envelopeBasis, `${variant}: receipt`).toBe(today.envelopeBasis);
        expect(other.depthParams, `${variant}: depth params`).toBe(today.depthParams);
      }
    }, 900_000);
});
