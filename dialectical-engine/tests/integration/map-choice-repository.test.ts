import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONTENT_JSON_SENTINEL, decryptContentForRun, encryptAttestedContentForRun, migrate } from "@debateai/db";
import { MapChoiceRepository, readMapChoiceForRun, readMapItemsForRun, type MapItem, type MapResult } from "@debateai/map";
import {
  createEncryptedStoryRun,
  createLegacyStoryRun,
  provisionStoryEncryptedOwner,
  releaseStoryEncryptedOwner,
  type StoryEncryptedOwner
} from "../support/storyEncryptedOwner.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { runOwnerCheckFrom } from "../../apps/api/src/map-views.js";

/**
 * Debate shape, Task 8: the map's repository over migration 0116 (core.map_item, core.map_choice, core.map_position),
 * and the database-level behaviour of those three tables (Task 7 review, binding on this task): sealed rows round-trip,
 * plaintext on an encrypted run is refused, an envelope cannot move to another row, nothing is updated, deleted or
 * truncated, an erased run takes no new row (and the repository answers RUN_ERASED), and an AI-written slug cannot sit
 * in a readable id column.
 */

const seat = (n: number) => ({ aiRef: `preview:ref-${String(n)}`, maker: `maker-${String(n)}` });
// Every id is code-minted (ruling T7-PRIV): angles g1.., items pt01../ca01.., key points kp01.., merged answers an01..,
// chosen answers a1..
const RESULT: MapResult = Object.freeze({
  arm: "C", kind: "MAP", stoppedBy: null, plannerLanguage: null,
  angles: [{ angleId: "g1", kind: "OPPOSITE_CASE", label: "The other side", focus: "The case against." }],
  items: [
    { itemId: "pt01", seat: seat(0), origin: "BLIND", angleId: "g1", angleKind: "OPPOSITE_CASE", listIndex: 0, kind: "POINT", claim: "It costs a lot.", whyItMatters: "Money.", leans: "against_some_answer" },
    { itemId: "pt02", seat: seat(1), origin: "BLIND", angleId: null, angleKind: null, listIndex: 1, kind: "POINT", claim: "It helps riders.", whyItMatters: "People.", leans: "for_some_answer" },
    { itemId: "pt03", seat: seat(1), origin: "GAP", angleId: null, angleKind: null, listIndex: 101, kind: "POINT", claim: "Night buses.", whyItMatters: "Shifts.", leans: "context" },
    { itemId: "ca01", seat: seat(0), origin: "BLIND", angleId: "g1", angleKind: "OPPOSITE_CASE", listIndex: 0, kind: "ANSWER", answer: "No." }
  ],
  keyPoints: [
    { keyPointId: "kp01", claim: "It costs a lot.", memberItemIds: ["pt01"], blindMakers: ["maker-0"], gapMakers: [], makers: ["maker-0"], fixedAngleKinds: ["OPPOSITE_CASE"], leansAgainst: true },
    { keyPointId: "kp02", claim: "It helps riders.", memberItemIds: ["pt02"], blindMakers: ["maker-1"], gapMakers: [], makers: ["maker-1"], fixedAngleKinds: [], leansAgainst: false },
    { keyPointId: "kp03", claim: "Night buses.", memberItemIds: ["pt03"], blindMakers: [], gapMakers: ["maker-1"], makers: ["maker-1"], fixedAngleKinds: [], leansAgainst: false }
  ],
  mergedAnswers: [{ answerId: "an01", answer: "No.", memberItemIds: ["ca01"], blindMakers: ["maker-0"], makers: ["maker-0"], fromOppositeCase: true }],
  framingChallenges: [],
  choice: { answers: [
    { answerId: "a1", statement: "Yes, with conditions.", forKeyPointIds: ["kp02"], againstKeyPointIds: ["kp01"], strongestRival: "a2", filled: false },
    { answerId: "a2", statement: "No.", forKeyPointIds: ["kp01"], againstKeyPointIds: [], strongestRival: "a1", filled: true }
  ], alsoRaised: ["kp03"] },
  marks: [{ mark: "ANSWERS_FILLED", step: "CHOOSE", detail: "map" }],
  notes: [], calls: []
}) as MapResult;

/** The reader orders items by item_id (ca01 first); the orchestrator returned them in plan order. */
const READ_BACK = { ...RESULT, items: [RESULT.items[3], ...RESULT.items.slice(0, 3)], calls: [] };

const SLUG = "sell-family-home";

let database: TestDatabase;
let owner: StoryEncryptedOwner | undefined;

// Pre-flight PF-B28b: the story suite's own fixtures (tests/integration/story-repository.test.ts) — ONE encrypted owner
// provisioned once (it configures the pool's content cipher), runs made by createEncryptedStoryRun / createLegacyStoryRun.
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  owner = await provisionStoryEncryptedOwner(database.pool);
}, 180_000);

afterAll(async () => {
  await database?.stop();
  if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
});

function theOwner(): StoryEncryptedOwner {
  if (owner === undefined) throw new Error("MAP_TEST_OWNER_UNPROVISIONED");
  return owner;
}

const marker = (): string => `MAPMARK${randomUUID().replaceAll("-", "")}`;

function newRun(mode: "legacy" | "encrypted"): Promise<string> {
  return mode === "encrypted"
    ? createEncryptedStoryRun(database.pool, theOwner(), `map repository ${marker()}`)
    : createLegacyStoryRun(database.pool, `map repository ${marker()}`, `asker:${marker()}`);
}

/** Copied from story-repository.test.ts: the run's key cleanup intent makes core.run_private_content_is_live false. */
async function eraseRun(runId: string): Promise<void> {
  await database.pool.query(
    `INSERT INTO serve.private_run_key_cleanup_intent (
       request_ref,user_id,run_id,requested_at,cleanup_publication_refs
     ) VALUES ($1,$2,$3,now(),'{}')`,
    [randomUUID(), theOwner().userId, runId]
  );
}

/**
 * What 0040's core.prepare_private_run_erasure does to the run in one transaction: the key cleanup intent AND the
 * deletion of the run's attestation secret. After it, the attestation guard (it fires first, by trigger name) can no
 * longer sign anything for the run.
 */
async function eraseRunFully(runId: string): Promise<void> {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO serve.private_run_key_cleanup_intent (
         request_ref,user_id,run_id,requested_at,cleanup_publication_refs
       ) VALUES ($1,$2,$3,now(),'{}')`,
      [randomUUID(), theOwner().userId, runId]
    );
    await client.query("DELETE FROM core.run_content_attestation_secret WHERE run_id = $1", [runId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** A real root node on a LEGACY run (claim text in the clear), inserted as tests/integration/graph-database.test.ts does. */
async function legacyRoot(runId: string): Promise<string> {
  const result = await database.pool.query<{ node_id: string }>(`
    INSERT INTO core.node (
      run_id, claim_text, claim_type, parent_node_id, child_kind, depth, sibling_ordinal,
      materialized_path, generation_status, path_status, exploration_decision,
      way_of_knowing, provenance_ref, locator, value_laden, created_at_seq
    ) VALUES ($1,'map position root','unknown',NULL,NULL,0,0,'0','complete','active','continue','REASONING',NULL,NULL,false,ledger.allocate_sequence())
    RETURNING node_id
  `, [runId]);
  return result.rows[0]!.node_id;
}

type Sealed = Readonly<{ envelope: Record<string, unknown>; attestation: Buffer }>;

/** An envelope sealed while the run is live, bound to (run, carrier, primary key). */
async function sealFor(runId: string, carrier: "core.map_item" | "core.map_choice", primaryKey: string, value: unknown): Promise<Sealed> {
  const sealed = await encryptAttestedContentForRun(database.pool, runId, carrier, primaryKey, value);
  if (sealed === null) throw new Error("MAP_TEST_CIPHER_UNCONFIGURED");
  return { envelope: { ...sealed.envelope }, attestation: Buffer.from(sealed.attestation) };
}

const POINT_CONTENT = Object.freeze({ claim: "A raw point.", why: "A raw reason." });
const CHOICE_CONTENT = Object.freeze({ answers: [], alsoRaised: [], result: null });

/** A direct INSERT into core.map_item, bypassing the repository and its lease: the row meets 0116's triggers as given. */
function insertRawItem(row: Readonly<{ runId: string; itemId: string; content: unknown; envelope: unknown; attestation: Buffer | null;
  angleId?: string | null }>) {
  return database.pool.query(
    `INSERT INTO core.map_item (run_id, item_id, step, ai_ref, maker, origin, angle_id, angle_kind, kind, leans, list_index, position,
       content, content_ciphertext, content_attestation)
     VALUES ($1,$2,'LIST','preview:ref-0','maker-0','BLIND',$3,NULL,'POINT','context',0,1,$4::jsonb,$5::jsonb,$6)`,
    [row.runId, row.itemId, row.angleId ?? null, JSON.stringify(row.content),
      row.envelope === null ? null : JSON.stringify(row.envelope), row.attestation]
  );
}

/** A direct INSERT into core.map_choice, bypassing the repository and its lease. */
function insertRawChoice(row: Readonly<{ runId: string; content: unknown; envelope: unknown; attestation: Buffer | null }>) {
  return database.pool.query(
    `INSERT INTO core.map_choice (run_id, opening, marks, content, content_ciphertext, content_attestation)
     VALUES ($1,'MAP','[]'::jsonb,$2::jsonb,$3::jsonb,$4)`,
    [row.runId, JSON.stringify(row.content), row.envelope === null ? null : JSON.stringify(row.envelope), row.attestation]
  );
}

/** A direct INSERT into core.map_position. */
function insertRawPosition(row: Readonly<{ runId: string; answerId: string; rootIndex: number; rootNodeId: string }>) {
  return database.pool.query(
    `INSERT INTO core.map_position (run_id, answer_id, root_index, root_node_id, maker) VALUES ($1,$2,$3,$4,'maker-0')`,
    [row.runId, row.answerId, row.rootIndex, row.rootNodeId]
  );
}

async function rowCounts(runId: string): Promise<Readonly<{ items: number; choices: number; positions: number }>> {
  const result = await database.pool.query<{ items: number; choices: number; positions: number }>(
    `SELECT (SELECT count(*)::int FROM core.map_item WHERE run_id = $1) AS items,
            (SELECT count(*)::int FROM core.map_choice WHERE run_id = $1) AS choices,
            (SELECT count(*)::int FROM core.map_position WHERE run_id = $1) AS positions`, [runId]);
  return result.rows[0]!;
}

const FAKE_ROOT = "00000000-0000-4000-8000-000000000001";

describe("MapChoiceRepository (0116)", () => {
  it.each(["legacy", "encrypted"] as const)("writes and reads back a %s run's map", async (mode) => {
    const pool = database.pool;
    const runId = await newRun(mode);
    const repository = new MapChoiceRepository(pool);
    expect(await repository.writeMapRun({ runId, result: RESULT, answerCount: 2 })).toBe("INSERTED");
    expect(await repository.writeMapRun({ runId, result: RESULT, answerCount: 2 })).toBe("ALREADY_PRESENT");
    const items = await readMapItemsForRun(pool, runId);
    expect(items.map((item) => item.itemId)).toEqual(["ca01", "pt01", "pt02", "pt03"]);
    expect(items.find((item) => item.itemId === "pt01")).toEqual(RESULT.items[0]);
    const choice = await readMapChoiceForRun(pool, runId);
    expect(choice).toEqual({ opening: "MAP", marks: ["ANSWERS_FILLED"],
      answers: [
        { answerId: "a1", statement: "Yes, with conditions.", rootIndex: 0, rootNodeId: null, maker: null, filled: false },
        { answerId: "a2", statement: "No.", rootIndex: 1, rootNodeId: null, maker: null, filled: true }],
      alsoRaised: [{ keyPointId: "kp03", claim: "Night buses.", makers: ["maker-1"] }] });
    expect(await repository.readMapResultForRun(runId)).toEqual(READ_BACK);
    const raw = await pool.query<{ content: unknown; has_envelope: boolean; step: string; position: number }>(
      `SELECT content, content_ciphertext IS NOT NULL AS has_envelope, step, position FROM core.map_item WHERE run_id = $1 AND item_id = 'pt03'`, [runId]);
    if (mode === "encrypted") {
      expect(raw.rows[0]).toEqual({ content: { ciphertext: true, v: 1 }, has_envelope: true, step: "GAP", position: 3 });
    } else {
      expect(raw.rows[0]).toEqual({ content: { claim: "Night buses.", why: "Shifts." }, has_envelope: false, step: "GAP", position: 3 });
    }
    if (mode === "encrypted") {
      // No readable column of either carrier holds any map text.
      const text = await pool.query<{ row_text: string }>(
        `SELECT string_agg(to_jsonb(item)::text, ' ') AS row_text FROM core.map_item AS item WHERE run_id = $1
         UNION ALL SELECT to_jsonb(choice)::text FROM core.map_choice AS choice WHERE run_id = $1`, [runId]);
      for (const row of text.rows) {
        for (const secret of ["It costs a lot", "Night buses", "Yes, with conditions", "The other side", "Money."]) {
          expect(row.row_text).not.toContain(secret);
        }
      }
    }
  });

  it("a second map for the same run changes nothing: the first map's items and choice stay together (pre-flight PF-B28a)", async () => {
    const runId = await newRun("encrypted");
    const repository = new MapChoiceRepository(database.pool);
    expect(await repository.writeMapRun({ runId, result: RESULT, answerCount: 2 })).toBe("INSERTED");
    const other = { ...RESULT, items: RESULT.items.map((item) => item.kind === "POINT" ? { ...item, claim: `${item.claim} (other)` } : item) } as MapResult;
    expect(await repository.writeMapRun({ runId, result: other, answerCount: 2 })).toBe("ALREADY_PRESENT");
    expect(await repository.readMapResultForRun(runId)).toEqual(READ_BACK);
  });

  it("stores only the P answers the run will argue (answerCount)", async () => {
    const runId = await newRun("legacy");
    const repository = new MapChoiceRepository(database.pool);
    expect(await repository.writeMapRun({ runId, result: RESULT, answerCount: 1 })).toBe("INSERTED");
    expect((await readMapChoiceForRun(database.pool, runId))!.answers.map((answer) => answer.answerId)).toEqual(["a1"]);
  });

  // Whole-branch review m-3, ruling W-CUT: a chosen answer cut by answerCount was raised and never debated, so the page's
  // stored list holds it (a filled one never: no AI raised it), beside the choice's own also-raised points.
  it("lists a chosen answer cut by answerCount as also raised (W-CUT)", async () => {
    const runId = await newRun("legacy");
    const repository = new MapChoiceRepository(database.pool);
    const raised = { ...RESULT, choice: { ...RESULT.choice!, answers: RESULT.choice!.answers.map((answer) => ({ ...answer, filled: false })) } } as MapResult;
    expect(await repository.writeMapRun({ runId, result: raised, answerCount: 1 })).toBe("INSERTED");
    expect((await readMapChoiceForRun(database.pool, runId))!.alsoRaised).toEqual([
      { keyPointId: "a2", claim: "No.", makers: ["maker-0"] },
      { keyPointId: "kp03", claim: "Night buses.", makers: ["maker-1"] }
    ]);
    const filled = await newRun("legacy");
    await repository.writeMapRun({ runId: filled, result: RESULT, answerCount: 1 });
    expect((await readMapChoiceForRun(database.pool, filled))!.alsoRaised.map((entry) => entry.claim)).toEqual(["Night buses."]);
  });

  it("joins the root that argued each answer once it is saved", async () => {
    const runId = await newRun("legacy");
    const rootNodeId = await legacyRoot(runId);
    const repository = new MapChoiceRepository(database.pool);
    await repository.writeMapRun({ runId, result: RESULT, answerCount: 2 });
    expect(await repository.writeMapPosition({ runId, answerId: "a1", rootIndex: 0, rootNodeId, maker: "maker-0" })).toBe("INSERTED");
    expect(await repository.writeMapPosition({ runId, answerId: "a1", rootIndex: 0, rootNodeId, maker: "maker-0" })).toBe("ALREADY_PRESENT");
    const choice = await readMapChoiceForRun(database.pool, runId);
    expect(choice!.answers[0]).toMatchObject({ rootNodeId, maker: "maker-0" });
    expect(choice!.answers[1]).toMatchObject({ rootNodeId: null, maker: null });
  });

  // Ruling C-MAPREAD: the debate page's cheap gate. The opening is a code column, read without a lease.
  it("looks up a run's map opening in one read: MAP, today's opening, or none", async () => {
    const repository = new MapChoiceRepository(database.pool);
    const mapped = await newRun("encrypted");
    await repository.writeMapRun({ runId: mapped, result: RESULT, answerCount: 2 });
    expect(await repository.readMapOpeningForRun(mapped)).toBe("MAP");
    const fellBack = await newRun("legacy");
    await repository.writeMapRun({ runId: fellBack, result: { ...RESULT, kind: "UNAVAILABLE", choice: null } as MapResult, answerCount: 2 });
    expect(await repository.readMapOpeningForRun(fellBack)).toBe("TODAYS_OPENING");
    expect(await repository.readMapOpeningForRun(await newRun("encrypted"))).toBeNull();
  });

  it("the map route's owner query names the answer's run for its owner only (SQL checked against the schema)", async () => {
    const check = runOwnerCheckFrom((text, values) => database.pool.query<{ run_id?: string }>(text, values));
    // No answer with this id: no run, whoever asks.
    expect(await check.ownedRunOfAnswer(randomUUID(), { ownerRef: theOwner().ownerRef, legacyAskerId: null })).toBeNull();
    expect(await check.ownedRunOfAnswer(randomUUID(), { ownerRef: null, legacyAskerId: "asker:nobody" })).toBeNull();
  });

  it("a run with no map reads as absent", async () => {
    const runId = await newRun("encrypted");
    const repository = new MapChoiceRepository(database.pool);
    expect(await repository.readMapChoiceForRun(runId)).toBeNull();
    expect(await repository.readMapItemsForRun(runId)).toEqual([]);
    expect(await repository.readMapResultForRun(runId)).toBeNull();
  });

  it("an erased run's map reads as absent and refuses new rows as RUN_ERASED", async () => {
    const runId = await newRun("encrypted");
    const repository = new MapChoiceRepository(database.pool);
    expect(await repository.writeMapRun({ runId, result: RESULT, answerCount: 2 })).toBe("INSERTED");
    await eraseRun(runId);
    expect(await readMapChoiceForRun(database.pool, runId)).toBeNull();
    expect(await readMapItemsForRun(database.pool, runId)).toEqual([]);
    expect(await repository.readMapResultForRun(runId)).toBeNull();
    // No real root: 0116's erasure barrier on core.map_position (pre-flight PF-B26) refuses BEFORE the root_node_id
    // foreign key is checked, so this answers RUN_ERASED, never a 23503.
    expect(await repository.writeMapPosition({ runId, answerId: "a2", rootIndex: 1, rootNodeId: FAKE_ROOT, maker: "maker-1" })).toBe("RUN_ERASED");

    // A run erased BEFORE its map: nothing is sealed or stored, and each write answers RUN_ERASED (the lease refuses first).
    const late = await newRun("encrypted");
    await eraseRunFully(late);
    expect(await repository.writeMapRun({ runId: late, result: RESULT, answerCount: 2 })).toBe("RUN_ERASED");
    expect(await repository.writeMapPosition({ runId: late, answerId: "a1", rootIndex: 0, rootNodeId: FAKE_ROOT, maker: "maker-0" })).toBe("RUN_ERASED");
    expect(await rowCounts(late)).toEqual({ items: 0, choices: 0, positions: 0 });
  });

  it("a missing attestation secret on a LIVE run is a defect, never masked as RUN_ERASED", async () => {
    const runId = await newRun("encrypted");
    await database.pool.query("DELETE FROM core.run_content_attestation_secret WHERE run_id = $1", [runId]);
    await expect(new MapChoiceRepository(database.pool).writeMapRun({ runId, result: RESULT, answerCount: 2 }))
      .rejects.toMatchObject({ code: "55000", message: "CONTENT_ATTESTATION_SECRET_UNRESOLVED" });
    expect(await rowCounts(runId)).toEqual({ items: 0, choices: 0, positions: 0 });
  });

  it("refuses an id that is not code-minted typed, before anything is sealed or stored, naming no AI text", async () => {
    const runId = await newRun("legacy");
    const repository = new MapChoiceRepository(database.pool);
    const slugAngle = { ...RESULT, items: RESULT.items.map((item, index) => index === 0 ? { ...item, angleId: SLUG } : item) } as MapResult;
    const slugAnswer = { ...RESULT, choice: { ...RESULT.choice!, answers: RESULT.choice!.answers.map((answer, index) =>
      index === 1 ? { ...answer, answerId: SLUG } : answer) } } as MapResult;
    const slugItem = { ...RESULT, items: RESULT.items.map((item, index) => index === 2 ? { ...item, itemId: SLUG } as MapItem : item) } as MapResult;
    const spacedMaker = { ...RESULT, items: RESULT.items.map((item, index) => index === 1 ? { ...item, seat: { aiRef: "preview:ref-1", maker: "It helps riders" } } : item) } as MapResult;
    // 0116's closed sets and the int4 range, held by the repository too (Task 8 review): no CHECK or range error is
    // reachable from repository input. Each value is cast past the types, as a malformed reply could be.
    const withItem = (index: number, patch: Record<string, unknown>): MapResult =>
      ({ ...RESULT, items: RESULT.items.map((item, at) => at === index ? { ...item, ...patch } as unknown as MapItem : item) }) as MapResult;
    const cases: readonly (readonly [MapResult, string])[] = [
      [slugAngle, "MAP_RECORD_INVALID: items[0].angleId"],
      [slugAnswer, "MAP_RECORD_INVALID: choice.answers[1].answerId"],
      [slugItem, "MAP_RECORD_INVALID: items[2].itemId"],
      [spacedMaker, "MAP_RECORD_INVALID: items[1].seat.maker"],
      [withItem(0, { leans: "It costs a lot" }), "MAP_RECORD_INVALID: items[0].leans"],
      [withItem(1, { angleKind: "It helps riders" }), "MAP_RECORD_INVALID: items[1].angleKind"],
      [withItem(2, { kind: "Night buses" }), "MAP_RECORD_INVALID: items[2].kind"],
      [withItem(3, { origin: "Money." }), "MAP_RECORD_INVALID: items[3].origin"],
      [withItem(0, { listIndex: 2 ** 31 }), "MAP_RECORD_INVALID: items[0].listIndex"],
      [withItem(0, { listIndex: -1 }), "MAP_RECORD_INVALID: items[0].listIndex"]
    ];
    for (const [result, expected] of cases) {
      const refusal = await repository.writeMapRun({ runId, result, answerCount: 2 }).then(() => null, (error: unknown) => error);
      expect(refusal).toMatchObject({ name: "TypedDomainError", code: "MAP_RECORD_INVALID", message: expected });
      const message = (refusal as Error).message;
      for (const text of [SLUG, "It costs a lot", "It helps riders", "Night buses", "Money", "No."]) expect(message).not.toContain(text);
    }
    for (const answerCount of [-1, 1.5, 5]) {
      await expect(repository.writeMapRun({ runId, result: RESULT, answerCount }))
        .rejects.toMatchObject({ code: "MAP_RECORD_INVALID", message: "MAP_RECORD_INVALID: answerCount" });
    }
    const positionRefusal = await repository.writeMapPosition({ runId, answerId: SLUG, rootIndex: 0, rootNodeId: FAKE_ROOT, maker: "maker-0" })
      .then(() => null, (error: unknown) => error);
    expect(positionRefusal).toMatchObject({ code: "MAP_RECORD_INVALID", message: "MAP_RECORD_INVALID: answerId" });
    expect(await rowCounts(runId)).toEqual({ items: 0, choices: 0, positions: 0 });
  });
});

describe("MapChoiceRepository: one write per run (pre-flight PF-B28a, Task 8 review)", () => {
  it("is atomic: an item the database refuses AFTER the choice insert leaves neither the choice nor any item", async () => {
    // Every column the repository writes is pre-checked, so the refusal is injected: a test-only trigger on
    // core.map_item refuses one marked seat. It fires after the choice row is already inserted in the same transaction.
    const runId = await newRun("legacy");
    const failing = { ...RESULT, items: RESULT.items.map((item, at) => at === 2 ? { ...item, seat: seat(9) } : item) } as MapResult;
    await database.pool.query(`
      CREATE FUNCTION public.map_test_refuse() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.ai_ref = 'preview:ref-9' THEN RAISE EXCEPTION 'MAP_TEST_INJECTED_REFUSAL' USING ERRCODE = '23514'; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER zzz_map_test_refuse BEFORE INSERT ON core.map_item FOR EACH ROW EXECUTE FUNCTION public.map_test_refuse();
    `);
    try {
      await expect(new MapChoiceRepository(database.pool).writeMapRun({ runId, result: failing, answerCount: 2 }))
        .rejects.toThrowError(/^MAP_TEST_INJECTED_REFUSAL$/u);
    } finally {
      await database.pool.query("DROP TRIGGER zzz_map_test_refuse ON core.map_item; DROP FUNCTION public.map_test_refuse()");
    }
    expect(await rowCounts(runId)).toEqual({ items: 0, choices: 0, positions: 0 });
    // The run is not poisoned: the next write stores the whole map.
    expect(await new MapChoiceRepository(database.pool).writeMapRun({ runId, result: RESULT, answerCount: 2 })).toBe("INSERTED");
    expect(await rowCounts(runId)).toEqual({ items: 4, choices: 1, positions: 0 });
  });

  it.each(["legacy", "encrypted"] as const)("two concurrent writers of one %s run: one INSERTED, one ALREADY_PRESENT, the items of one write only", async (mode) => {
    const runId = await newRun(mode);
    const other = { ...RESULT, items: RESULT.items.map((item) => item.kind === "POINT"
      ? { ...item, claim: `${item.claim} (other)` } : { ...item, answer: `${item.answer} (other)` }) } as MapResult;
    const outcomes = await Promise.all([
      new MapChoiceRepository(database.pool).writeMapRun({ runId, result: RESULT, answerCount: 2 }),
      new MapChoiceRepository(database.pool).writeMapRun({ runId, result: other, answerCount: 2 })
    ]);
    expect([...outcomes].sort()).toEqual(["ALREADY_PRESENT", "INSERTED"]);
    expect(await rowCounts(runId)).toEqual({ items: 4, choices: 1, positions: 0 });
    const winner = outcomes[0] === "INSERTED" ? RESULT : other;
    const items = await readMapItemsForRun(database.pool, runId);
    expect(items).toEqual([winner.items[3], ...winner.items.slice(0, 3)]);
  });
});

describe("0116 at the database level (Task 7 review, binding on Task 8)", () => {
  it("an encrypted run's sealed item and choice are accepted and read back", async () => {
    const runId = await newRun("encrypted");
    const item = await sealFor(runId, "core.map_item", "pt01", POINT_CONTENT);
    await insertRawItem({ runId, itemId: "pt01", content: CONTENT_JSON_SENTINEL, envelope: item.envelope, attestation: item.attestation });
    const choice = await sealFor(runId, "core.map_choice", runId, CHOICE_CONTENT);
    await insertRawChoice({ runId, content: CONTENT_JSON_SENTINEL, envelope: choice.envelope, attestation: choice.attestation });
    const itemRow = (await database.pool.query<{ content: unknown; content_ciphertext: never }>(
      "SELECT content, content_ciphertext FROM core.map_item WHERE run_id = $1 AND item_id = 'pt01'", [runId])).rows[0]!;
    expect(itemRow.content).toEqual(CONTENT_JSON_SENTINEL);
    expect(await decryptContentForRun(database.pool, runId, "core.map_item", "pt01", itemRow.content_ciphertext, itemRow.content))
      .toEqual(POINT_CONTENT);
    const choiceRow = (await database.pool.query<{ content: unknown; content_ciphertext: never }>(
      "SELECT content, content_ciphertext FROM core.map_choice WHERE run_id = $1", [runId])).rows[0]!;
    expect(await decryptContentForRun(database.pool, runId, "core.map_choice", runId, choiceRow.content_ciphertext, choiceRow.content))
      .toEqual(CHOICE_CONTENT);
  });

  it("refuses readable content on an encrypted run, and an envelope on a legacy run", async () => {
    const runId = await newRun("encrypted");
    await expect(insertRawItem({ runId, itemId: "pt01", content: POINT_CONTENT, envelope: null, attestation: null }))
      .rejects.toThrowError(/^CONTENT_PLAINTEXT_WRITE_FORBIDDEN: core\.map_item$/u);
    await expect(insertRawItem({ runId, itemId: "pt01", content: CONTENT_JSON_SENTINEL, envelope: null, attestation: null }))
      .rejects.toThrowError(/^CONTENT_PLAINTEXT_WRITE_FORBIDDEN: core\.map_item$/u);
    await expect(insertRawChoice({ runId, content: CHOICE_CONTENT, envelope: null, attestation: null }))
      .rejects.toThrowError(/^CONTENT_PLAINTEXT_WRITE_FORBIDDEN: core\.map_choice$/u);
    await expect(insertRawChoice({ runId, content: CONTENT_JSON_SENTINEL, envelope: null, attestation: null }))
      .rejects.toThrowError(/^CONTENT_PLAINTEXT_WRITE_FORBIDDEN: core\.map_choice$/u);
    expect(await rowCounts(runId)).toEqual({ items: 0, choices: 0, positions: 0 });

    const legacyRunId = await newRun("legacy");
    const donor = await sealFor(runId, "core.map_item", "pt01", POINT_CONTENT);
    await expect(insertRawItem({ runId: legacyRunId, itemId: "pt01", content: CONTENT_JSON_SENTINEL, envelope: donor.envelope, attestation: null }))
      .rejects.toThrowError(/^CONTENT_ENCRYPTION_STATE_INVALID: core\.map_item$/u);
    await expect(insertRawItem({ runId: legacyRunId, itemId: "pt01", content: CONTENT_JSON_SENTINEL, envelope: null, attestation: null }))
      .rejects.toThrowError(/^CONTENT_ENCRYPTION_STATE_INVALID: core\.map_item$/u);
    await expect(insertRawChoice({ runId: legacyRunId, content: CONTENT_JSON_SENTINEL, envelope: donor.envelope, attestation: donor.attestation }))
      .rejects.toThrowError(/^CONTENT_ATTESTATION_STATE_INVALID$/u);
    expect(await rowCounts(legacyRunId)).toEqual({ items: 0, choices: 0, positions: 0 });
  });

  it("binds an envelope to its own row: copied to another item, another carrier or another run, or forged, it is CONTENT_ATTESTATION_INVALID", async () => {
    const runId = await newRun("encrypted");
    const otherRunId = await newRun("encrypted");
    const item = await sealFor(runId, "core.map_item", "pt01", POINT_CONTENT);
    // Moved to another item of the same run.
    await expect(insertRawItem({ runId, itemId: "pt02", content: CONTENT_JSON_SENTINEL, envelope: item.envelope, attestation: item.attestation }))
      .rejects.toThrowError(/^CONTENT_ATTESTATION_INVALID$/u);
    // Moved to the same item id of another run.
    await expect(insertRawItem({ runId: otherRunId, itemId: "pt01", content: CONTENT_JSON_SENTINEL, envelope: item.envelope, attestation: item.attestation }))
      .rejects.toThrowError(/^CONTENT_ATTESTATION_INVALID$/u);
    // The genuine envelope under a forged attestation.
    await expect(insertRawItem({ runId, itemId: "pt01", content: CONTENT_JSON_SENTINEL, envelope: item.envelope, attestation: randomBytes(32) }))
      .rejects.toThrowError(/^CONTENT_ATTESTATION_INVALID$/u);
    // An item's envelope offered as the run's choice (another carrier).
    await expect(insertRawChoice({ runId, content: CONTENT_JSON_SENTINEL, envelope: item.envelope, attestation: item.attestation }))
      .rejects.toThrowError(/^CONTENT_ATTESTATION_INVALID$/u);
    // One run's choice envelope offered as another run's choice.
    const choice = await sealFor(runId, "core.map_choice", runId, CHOICE_CONTENT);
    await expect(insertRawChoice({ runId: otherRunId, content: CONTENT_JSON_SENTINEL, envelope: choice.envelope, attestation: choice.attestation }))
      .rejects.toThrowError(/^CONTENT_ATTESTATION_INVALID$/u);
    expect(await rowCounts(runId)).toEqual({ items: 0, choices: 0, positions: 0 });
    expect(await rowCounts(otherRunId)).toEqual({ items: 0, choices: 0, positions: 0 });

    // Positive control, then a stored row copied whole under a fresh item id.
    await insertRawItem({ runId, itemId: "pt01", content: CONTENT_JSON_SENTINEL, envelope: item.envelope, attestation: item.attestation });
    await expect(database.pool.query(
      `INSERT INTO core.map_item
       SELECT (jsonb_populate_record(NULL::core.map_item, to_jsonb(source) || jsonb_build_object('item_id', 'pt09'))).*
       FROM core.map_item AS source WHERE source.run_id = $1 AND source.item_id = 'pt01'`, [runId]
    )).rejects.toThrowError(/^CONTENT_ATTESTATION_INVALID$/u);
    expect(await rowCounts(runId)).toEqual({ items: 1, choices: 0, positions: 0 });
  });

  it("is append-only: UPDATE, DELETE and TRUNCATE are refused on all three tables, owner included", async () => {
    // Rows exist in each table, so a refusal cannot be an empty no-op.
    const runId = await newRun("legacy");
    const rootNodeId = await legacyRoot(runId);
    const repository = new MapChoiceRepository(database.pool);
    await repository.writeMapRun({ runId, result: RESULT, answerCount: 2 });
    await repository.writeMapPosition({ runId, answerId: "a1", rootIndex: 0, rootNodeId, maker: "maker-0" });
    for (const [table, column] of [["map_item", "maker"], ["map_choice", "opening"], ["map_position", "maker"]] as const) {
      await expect(database.pool.query(`UPDATE core.${table} SET ${column} = ${column} WHERE run_id = $1`, [runId]))
        .rejects.toThrowError(new RegExp(`^append-only or immutable table ${table} rejects UPDATE$`, "u"));
      await expect(database.pool.query(`DELETE FROM core.${table} WHERE run_id = $1`, [runId]))
        .rejects.toThrowError(new RegExp(`^append-only or immutable table ${table} rejects DELETE$`, "u"));
      await expect(database.pool.query(`TRUNCATE core.${table}`))
        .rejects.toThrowError(new RegExp(`^TRUNCATE_REJECTED: append-only or immutable table core\\.${table} rejects TRUNCATE$`, "u"));
    }
    expect(await rowCounts(runId)).toEqual({ items: 4, choices: 1, positions: 1 });
  });

  it("an erased run takes no new row in any of the three tables", async () => {
    // Intent only (the key's cleanup is pending, the attestation secret still there): rows sealed while the run was
    // live pass the attestation and plaintext guards, so the refusal is 0040's barrier's own.
    const pending = await newRun("encrypted");
    const item = await sealFor(pending, "core.map_item", "pt01", POINT_CONTENT);
    const choice = await sealFor(pending, "core.map_choice", pending, CHOICE_CONTENT);
    await eraseRun(pending);
    await expect(insertRawItem({ runId: pending, itemId: "pt01", content: CONTENT_JSON_SENTINEL, envelope: item.envelope, attestation: item.attestation }))
      .rejects.toMatchObject({ code: "55000", message: "PRIVATE_CONTENT_ERASED" });
    await expect(insertRawChoice({ runId: pending, content: CONTENT_JSON_SENTINEL, envelope: choice.envelope, attestation: choice.attestation }))
      .rejects.toMatchObject({ code: "55000", message: "PRIVATE_CONTENT_ERASED" });
    await expect(insertRawPosition({ runId: pending, answerId: "a1", rootIndex: 0, rootNodeId: FAKE_ROOT }))
      .rejects.toMatchObject({ code: "55000", message: "PRIVATE_CONTENT_ERASED" });
    expect(await rowCounts(pending)).toEqual({ items: 0, choices: 0, positions: 0 });

    // Erased as 0040 erases (the attestation secret deleted too): the two carriers' attestation guard refuses first,
    // map_position (no content) meets the barrier.
    const erased = await newRun("encrypted");
    const erasedItem = await sealFor(erased, "core.map_item", "pt01", POINT_CONTENT);
    const erasedChoice = await sealFor(erased, "core.map_choice", erased, CHOICE_CONTENT);
    await eraseRunFully(erased);
    await expect(insertRawItem({ runId: erased, itemId: "pt01", content: CONTENT_JSON_SENTINEL, envelope: erasedItem.envelope, attestation: erasedItem.attestation }))
      .rejects.toMatchObject({ code: "55000", message: "CONTENT_ATTESTATION_SECRET_UNRESOLVED" });
    await expect(insertRawChoice({ runId: erased, content: CONTENT_JSON_SENTINEL, envelope: erasedChoice.envelope, attestation: erasedChoice.attestation }))
      .rejects.toMatchObject({ code: "55000", message: "CONTENT_ATTESTATION_SECRET_UNRESOLVED" });
    await expect(insertRawPosition({ runId: erased, answerId: "a1", rootIndex: 0, rootNodeId: FAKE_ROOT }))
      .rejects.toMatchObject({ code: "55000", message: "PRIVATE_CONTENT_ERASED" });
    expect(await rowCounts(erased)).toEqual({ items: 0, choices: 0, positions: 0 });
  });

  it("refuses an AI-written slug in a readable id column (angle_id, answer_id)", async () => {
    const runId = await newRun("legacy");
    const rootNodeId = await legacyRoot(runId);
    await expect(insertRawItem({ runId, itemId: "pt01", content: POINT_CONTENT, envelope: null, attestation: null, angleId: SLUG }))
      .rejects.toThrowError(/violates check constraint "map_item_codes_shape"/u);
    await expect(insertRawPosition({ runId, answerId: SLUG, rootIndex: 0, rootNodeId }))
      .rejects.toThrowError(/violates check constraint "map_position_answer_shape"/u);
    expect(await rowCounts(runId)).toEqual({ items: 0, choices: 0, positions: 0 });
    // Positive controls: the code-minted forms are accepted.
    await insertRawItem({ runId, itemId: "pt01", content: POINT_CONTENT, envelope: null, attestation: null, angleId: "g7" });
    await insertRawPosition({ runId, answerId: "a4", rootIndex: 0, rootNodeId });
    expect(await rowCounts(runId)).toEqual({ items: 1, choices: 0, positions: 1 });
  });
});
