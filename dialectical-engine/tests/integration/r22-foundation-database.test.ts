import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPool, migrate, PostgresInvestigationClosingRepository, PostgresPassageRetentionRepository, PostgresPublicDebateRepository,
  PostgresPublicDebateRunnerRepository, PostgresPublicTreeRepository, PostgresPublicTreeRunnerRepository, PostgresTreeUpdateRepository,
  PostgresTreeUpdateRunnerRepository, webReplyTextIdOf, webReplyTextRef,
  type MainAnswerUpdateRead, type PathLineEntry, type Pool, type WebSealed
} from "@debateai/db";
import { asRequestOf, seedLiveSession } from "../support/rls-logins.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * 0137 to 0140 on real PostgreSQL (plan 2026-10-31-r22-owner-changes, Foundation F1): the shapes the later lanes write. No feature logic
 * here: insert-once, plain-text refusals, a stranger's dig joining a public tree and paying for itself, a refused contribution staying
 * off the line, the climb's turns and the one line, the main answer's versions, the deletion keeping the quote and the notes, erasure,
 * export, and the funded window counting every spend kind. Data and amounts are made up. Since the security review's 0171 (F5) the API's
 * role runs here as each person's own request (its login carrying their live session), as its functions believe no other owner, and the
 * runner's login holds the cross-account marker as production's does (0171 moved the runner's readers and writers to it); 0138's owner
 * readers of the line and the main answers and 0137's window reader of the public reports had no caller and are no role's any more, so
 * they are read here as the migrator.
 */
let database: TestDatabase;
let api: Pool;
/** The API's role wired as main.ts wires its request pool: inside a request its own connections carry the person's session. */
let requests: Pool;
let runner: Pool;
let erasure: Pool;
let worker: Pool;
let sequence = 9_700_000;
const SECRET = Buffer.alloc(32, 7);
const ENVELOPE = { v: 1, keyId: "fixture-key", nonce: "AAAAAAAAAAAAAAAA", tag: "AAAAAAAAAAAAAAAAAAAAAA==", ct: "YQ==" };
const LINEAGE = { maker: "maker-a", model_id: "model-a", transport: "openai-compatible-http", provider_ref: "provider:a" };

type SqlError = { code?: string | undefined; message?: string | undefined };
async function sqlError(run: () => Promise<unknown>): Promise<SqlError> {
  try { await run(); return { code: undefined, message: undefined }; }
  catch (error) { return error as SqlError; }
}
const loginPool = (role: string, password: string): Pool => {
  const url = new URL(database.connectionString);
  url.username = role;
  url.password = password;
  return createPool(url.toString());
};
type Account = Readonly<{ userId: string; ownerRef: string; pseudonym: string; token: string }>;
async function account(): Promise<Account> {
  const userId = randomUUID();
  const pseudonym = `r22-${userId}`;
  await database.pool.query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
    VALUES ($1,$2,'{}','{}','fixture-password',$3,'active',now())`, [userId, createHash("sha256").update(userId).digest(), pseudonym]);
  const ownerRef = (await database.pool.query<{ owner_ref: string }>('SELECT owner_ref FROM identity."user" WHERE user_id=$1', [userId])).rows[0]!.owner_ref;
  return { userId, ownerRef, pseudonym, token: await seedLiveSession(database.pool, userId) };
}
/** The person's own request, on the API's role. */
const asking = (person: Account): Pool => asRequestOf(requests, person.token);
const publicDebates = (person: Account) => new PostgresPublicDebateRepository(asking(person));
const publicTree = (person: Account) => new PostgresPublicTreeRepository(asking(person));
const treeUpdates = (person: Account) => new PostgresTreeUpdateRepository(asking(person));
/** 0138's owner reader of a debate's line, as the migrator (no role's since 0171). */
const ownerLine = async (ownerRef: string, runId: string): Promise<readonly PathLineEntry[] | null> =>
  (await database.pool.query<{ line: PathLineEntry[] | null }>("SELECT identity.read_path_line($1,$2) AS line", [ownerRef, runId])).rows[0]?.line ?? null;
/** 0138's owner reader of the main answer's versions, as the migrator (no role's since 0171). */
const ownerMainAnswers = async (ownerRef: string, runId: string): Promise<readonly MainAnswerUpdateRead[] | null> =>
  (await database.pool.query<{ updates: MainAnswerUpdateRead[] | null }>("SELECT identity.read_main_answer_updates($1,$2) AS updates", [ownerRef, runId]))
    .rows[0]?.updates ?? null;
async function seeded(statements: ReadonlyArray<readonly [string, readonly unknown[]]>): Promise<void> {
  const seed = await database.pool.connect();
  try {
    await seed.query("BEGIN");
    await seed.query("SET LOCAL session_replication_role = 'replica'");
    for (const [sql, values] of statements) await seed.query(sql, [...values]);
    await seed.query("COMMIT");
  } catch (error) { await seed.query("ROLLBACK"); throw error; } finally { seed.release(); }
}
async function run(owner: Account, encrypted = true): Promise<string> {
  const runId = randomUUID();
  const seq = ++sequence;
  await seeded([[`INSERT INTO core.run
      (run_id,question_line,asker_id,session_id,caller_scope,as_of,asker_risk_tier,risk_tier,
       tier_source,tier_provenance_ref,composition_budget_tier,depth_params,agent_count,discovered_panel,
       stranger_sample_rate,envelope_basis,register_version,battery_version,ask_contract,created_at_seq,
       question_blind_index_version,content_encryption_version)
      VALUES ($1,'Fixture question',$2,$3,'ASKER',now(),'standard','standard','ASKER','fixture','low',
       '{}'::jsonb,2,'[{},{}]'::jsonb,0,'{}'::jsonb,1,'fixture','{}'::jsonb,$4,1,$5)`, [runId, `owner:${owner.ownerRef}`, randomUUID(), seq, encrypted ? 1 : null]],
    ["INSERT INTO core.run_ownership_event(run_id,owner_ref,at_seq) VALUES ($1,$2,$3)", [runId, owner.ownerRef, seq]],
    ...(encrypted ? [["INSERT INTO core.run_content_attestation_secret(run_id,secret,created_at) VALUES ($1,$2,now())", [runId, SECRET]] as const] : [])]);
  return runId;
}
async function work(runId: string, state: "DONE" | "CLAIMED" | "FAILED"): Promise<void> {
  await seeded([[`INSERT INTO core.work_item (run_id,battery_row_id,node_set,command_key,state,claimed_by,claim_deadline,terminal_reason,created_at_seq)
    VALUES ($1,'fixture','[]'::jsonb,$2,$3,$4,$5,$6,$7)`, [runId, `fixture:${randomUUID()}`, state,
    state === "CLAIMED" ? "fixture-runner" : null, state === "CLAIMED" ? new Date(Date.now() + 600_000) : null,
    state === "FAILED" ? "FIXTURE_FAILED" : null, ++sequence]]]);
}
async function sealed(runId: string, carrier: string, ref: string): Promise<WebSealed> {
  const attestation = (await database.pool.query<{ value: Buffer }>(`SELECT audit_crypto_internal.hmac(
      core.content_envelope_attestation_bytes($1,$2,$3,'content_ciphertext',$4::jsonb),$5::bytea,'sha256') AS value`,
    [runId, carrier, ref, JSON.stringify(ENVELOPE), SECRET])).rows[0]!.value;
  return { envelope: ENVELOPE as never, attestation };
}
const pubEnvelope = (ref: string) => ({ v: 1, keyId: `publication-snapshot:${ref}:v1`, nonce: "AAAA", tag: "AAAA", ct: "YQ==" });
/** A debate made public as the transition would: its snapshot and its visibility event. */
async function publish(runId: string): Promise<string> {
  const ref = randomUUID();
  await seeded([
    ["INSERT INTO core.publication_ref_tombstone (ref,ref_kind,created_at) VALUES ($1,'publication_ref',now())", [ref]],
    ["INSERT INTO serve.publication_snapshot (publication_ref,run_id,format_version,content_ciphertext,created_at) VALUES ($1,$2,1,$3::jsonb,now())",
      [ref, runId, JSON.stringify(pubEnvelope(ref))]],
    [`INSERT INTO core.run_visibility_event (run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,actor_ref_version,warning_version,occurred_at,at_seq)
      VALUES ($1,$2,$3,'PUBLISHED',$4,2,'PUBLIC_INDEXED_V1',now(),$5)`, [randomUUID(), runId, ref, randomUUID(), ++sequence]]]);
  return ref;
}
async function tombstone(runId: string): Promise<void> {
  await seeded([[`INSERT INTO serve.private_run_erasure_tombstone (run_id,completed_at,destroyed_key_count,already_absent_key_count)
    VALUES ($1,clock_timestamp(),1,0)`, [runId]]]);
}
async function exportLease(owner: Account): Promise<Readonly<{ exportId: string; workerId: string }>> {
  const exportId = randomUUID();
  const workerId = randomUUID();
  await database.pool.query(`INSERT INTO identity.data_export(export_id,user_id,session_id,locale,status,requested_at,attempts,lease_owner,lease_until)
    VALUES ($1,$2,$3,'en','PREPARING',clock_timestamp(),1,$4,clock_timestamp()+interval '1 minute')`, [exportId, owner.userId, randomUUID(), workerId]);
  return { exportId, workerId };
}

/** Rows of 0132's web step, as the runner would write them, plus reader 1's note. */
async function webStep(owner: Account, runId: string): Promise<Readonly<{ top: string; other: string; extractId: string }>> {
  const search = randomUUID();
  const [top, other] = [randomUUID(), randomUUID()];
  const extractId = randomUUID();
  const envelope = JSON.stringify(ENVELOPE);
  const digest = Buffer.alloc(32, 3);
  await seeded([
    [`INSERT INTO identity.web_search (search_id,run_id,owner_ref,path_ref,side,language_kind,language,look_back,outcome,charge_micros,result_count,content_ciphertext,content_attestation)
      VALUES ($1,$2,$3,'pos-1','for','english','en','none','FOUND',1,2,$4::jsonb,$5)`, [search, runId, owner.ownerRef, envelope, SECRET]],
    ...[[top, 1], [other, 2]].flatMap(([page, rank]) => [
      [`INSERT INTO identity.web_page (page_id,run_id,owner_ref,search_id,rank,read_depth,text_kept,text_chars,text_digest,content_ciphertext,content_attestation)
        VALUES ($1,$2,$3,$4,$5,'whole',true,10,$6,$7::jsonb,$8)`, [page, runId, owner.ownerRef, search, rank, digest, envelope, SECRET]] as const,
      [`INSERT INTO identity.web_page_text (page_id,run_id,owner_ref,content_ciphertext,content_attestation) VALUES ($1,$2,$3,$4::jsonb,$5)`,
        [page, runId, owner.ownerRef, envelope, SECRET]] as const,
      [`INSERT INTO identity.web_reading (reading_id,run_id,owner_ref,page_id,reader,maker,outcome,grade,content_ciphertext,content_attestation)
        VALUES ($1,$2,$3,$4,1,'maker-a','READ',2,$5::jsonb,$6)`, [randomUUID(), runId, owner.ownerRef, page, envelope, SECRET]] as const]),
    ["INSERT INTO identity.web_pick (run_id,owner_ref,path_ref,rank,page_id) VALUES ($1,$2,'pos-1',1,$3)", [runId, owner.ownerRef, top]],
    [`INSERT INTO identity.web_extract (extract_id,run_id,owner_ref,page_id,path_ref,label,found_by,content_ciphertext,content_attestation)
      VALUES ($1,$2,$3,$4,'pos-1','S1-1','{1}',$5::jsonb,$6)`, [extractId, runId, owner.ownerRef, top, envelope, SECRET]],
    [`INSERT INTO identity.web_pack (pack_id,run_id,owner_ref,path_ref,extract_labels,content_ciphertext,content_attestation)
      VALUES ($1,$2,$3,'pos-1','{S1-1}',$4::jsonb,$5)`, [randomUUID(), runId, owner.ownerRef, envelope, SECRET]]]);
  return { top, other, extractId };
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await database.pool.query("CREATE ROLE r22_api LOGIN PASSWORD 'r22-api-test-only' IN ROLE debateai_runtime,debateai_billing_runtime");
  await database.pool.query("CREATE ROLE r22_runner LOGIN PASSWORD 'r22-runner-test-only' IN ROLE debateai_runtime,debateai_rls_all_accounts");
  await database.pool.query("CREATE ROLE r22_erasure LOGIN PASSWORD 'r22-erasure-test-only' IN ROLE debateai_erasure_runtime");
  await database.pool.query("CREATE ROLE r22_worker LOGIN PASSWORD 'r22-worker-test-only' IN ROLE debateai_data_export_worker");
  api = loginPool("r22_api", "r22-api-test-only");
  runner = loginPool("r22_runner", "r22-runner-test-only");
  erasure = loginPool("r22_erasure", "r22-erasure-test-only");
  worker = loginPool("r22_worker", "r22-worker-test-only");
  const apiUrl = new URL(database.connectionString);
  apiUrl.username = "r22_api";
  apiUrl.password = "r22-api-test-only";
  requests = createPool(apiUrl.toString(), { crossAccount: api });
}, 600_000);
afterAll(async () => {
  await Promise.all([api?.end(), runner?.end(), erasure?.end(), worker?.end(), requests?.end()]);
  await database?.stop();
});

describe("0137: a stranger's dig joins a public tree", () => {
  it("refuses a private tree, joins a public one under the digger's name, and the check decides who sees it", async () => {
    const [ana, dan, eve] = [await account(), await account(), await account()];
    const root = await run(ana);
    const dig = await run(dan);
    // A dig joins the publication through 0147's join (0137's first public join is retired: 0171 takes its grant back).
    const join = publicTree(dan);
    const input = { ownerRef: dan.ownerRef, parentRunId: root, childRunId: dig, positionRef: "pos-1" };
    // A debate not public under any link: nothing to join.
    expect((await join.join({ ...input, publicationRef: randomUUID() })).outcome).toBe("NOT_PUBLIC");
    const publicationRef = await publish(root);
    expect(await join.join({ ...input, publicationRef })).toEqual({ outcome: "JOINED", digLevel: 1 });
    expect((await join.join({ ...input, publicationRef })).outcome).toBe("ALREADY");
    // Someone else's run is not theirs to join, and Dan's request names no one but Dan (0171, F5).
    expect((await publicTree(eve).join({ ...input, publicationRef, ownerRef: eve.ownerRef })).outcome).toBe("NOT_OWNED");
    expect((await join.join({ ...input, publicationRef, ownerRef: eve.ownerRef })).outcome).toBe("NOT_OWNED");
    // The contribution names the digger and the first debate; no investigation is written, so nothing goes with the first author's account.
    const contribution = (await database.pool.query<{ owner_ref: string; root_run_id: string; publication_ref: string }>(
      "SELECT owner_ref, root_run_id, publication_ref FROM identity.public_contribution WHERE dig_run_id=$1", [dig])).rows[0]!;
    expect(contribution).toEqual({ owner_ref: dan.ownerRef, root_run_id: root, publication_ref: publicationRef });
    expect(Number((await database.pool.query<{ n: string }>("SELECT count(*) AS n FROM identity.investigation_member WHERE run_id = ANY($1::uuid[])", [[root, dig]])).rows[0]!.n)).toBe(0);
    // Dan's dig under Dan's dig is his to make; Eve's waits for the check.
    const evesDig = await run(eve);
    expect((await publicTree(eve).join({ ...input, publicationRef, ownerRef: eve.ownerRef, parentRunId: dig, childRunId: evesDig })).outcome).toBe("PARENT_PRIVATE");

    const picks = [{ kind: "OWN_VIEW", suggestion_id: null, place: "pos-1", author: "PERSON_OWN_VIEW", content: ENVELOPE,
      attestation: (await sealed(dig, "identity.dig_pick", "1")).attestation.toString("hex") }];
    expect(await publicDebates(eve).recordPicks(eve.ownerRef, dig, picks)).toBe("NOT_A_DIG");
    expect(await sqlError(() => publicDebates(eve).recordPicks(dan.ownerRef, dig, picks))).toMatchObject({ code: "42501", message: "REQUEST_OWNER_MISMATCH" });
    expect(await publicDebates(dan).recordPicks(dan.ownerRef, dig, picks)).toBe("RECORDED");
    expect(await publicDebates(dan).recordPicks(dan.ownerRef, dig, picks)).toBe("ALREADY");
    // 0135's sweep and 0136's waiting list keep their owner rules: the set's position stays null, the path is on the contribution.
    expect((await database.pool.query<{ position_ref: string | null }>("SELECT position_ref FROM identity.dig_pick_set WHERE run_id=$1", [dig])).rows[0]!.position_ref).toBeNull();
    const runnerRepo = new PostgresPublicDebateRunnerRepository(runner);
    expect(await runnerRepo.readContribution(dig)).toMatchObject({ position_ref: "pos-1", outcome: null, contributor: dan.pseudonym });

    // The dig's own turn on the path, 0147's public turn: the first debate's key is not needed.
    const tree = new PostgresPublicTreeRunnerRepository(runner);
    const updateId = randomUUID();
    const turn = { updateId, runId: dig, parentRunId: root, positionRef: "pos-1", kind: "PUBLIC_DIG" as const, climbStep: 0, causeKind: "DIG_SETTLED" as const, causeId: null };
    expect(await tree.takeTurn(turn)).toBe("TAKEN");
    expect(await tree.takeTurn(turn)).toBe("ALREADY");
    expect(await tree.readTurn(updateId)).toMatchObject({ state: "FRONT", base_kind: null, base_id: null });
    const row = { updateId, basedOn: null, outcome: "READY" as const, failureCode: null, changed: true, fateBefore: "HELD_UP" as const,
      fateAfter: "PARTLY_HELD" as const, writerLineage: LINEAGE, checkerLineage: LINEAGE, rounds: 1, artifactRefs: [],
      content: await sealed(dig, "identity.path_update", updateId), settingsVersion: 4 };
    expect(await tree.record(row)).toBe("RECORDED");
    expect(await tree.record(row)).toBe("ALREADY");
    // Not checked yet: it holds the path, and is no one's text. A climb of another dig of the same path waits.
    const line = await ownerLine(ana.ownerRef, root);
    expect(line).toEqual([]);
    expect((await tree.readLine(root))![0]).toMatchObject({ held: true, hidden: true });

    // The update on the page is only for an allowed contribution.
    const page = { updateId: randomUUID(), publicationRef, kind: "PATH" as const, positionRef: "pos-1", digRunId: dig, content: pubEnvelope(publicationRef) as never };
    expect((await runnerRepo.recordPageUpdate(page)).outcome).toBe("NOT_ALLOWED");
    expect(await runnerRepo.settleCheck(dig, "ALLOWED", null)).toBe("RECORDED");
    expect(await runnerRepo.settleCheck(dig, "REFUSED", null)).toBe("ALREADY");
    expect(await runnerRepo.recordPageUpdate(page)).toEqual({ outcome: "RECORDED", updateSeq: 1 });
    expect((await runnerRepo.recordPageUpdate(page)).outcome).toBe("ALREADY");
    // A sealed value under another key is no public update.
    expect((await sqlError(() => runnerRepo.recordPageUpdate({ ...page, updateId: randomUUID(), content: ENVELOPE as never }))).code).toBe("23514");
    // Allowed: the path's text for its owner, the base of the next turn, and the page names the digger with the date.
    expect((await ownerLine(ana.ownerRef, root))![0]).toMatchObject({ entry_id: updateId, held: false, hidden: false, changed: true });
    const updates = await runnerRepo.readPageUpdates(publicationRef);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ contributor: dan.pseudonym, kind: "PATH", position_ref: "pos-1" });
    expect(Object.keys(updates[0]!)).not.toContain("dig_run_id");
    // Now Eve may dig under it.
    expect((await publicTree(eve).join({ ...input, publicationRef, ownerRef: eve.ownerRef, parentRunId: dig, childRunId: evesDig })).outcome).toBe("JOINED");
  });

  it("a refused contribution stays private: not on the line, not on the page, and still the digger's to read", async () => {
    const [ana, dan] = [await account(), await account()];
    const root = await run(ana);
    const dig = await run(dan);
    const publicationRef = await publish(root);
    const join = publicTree(dan);
    expect((await join.join({ ownerRef: dan.ownerRef, publicationRef, parentRunId: root, childRunId: dig, positionRef: "pos-1" })).outcome).toBe("JOINED");
    const runnerRepo = new PostgresPublicDebateRunnerRepository(runner);
    const tree = new PostgresPublicTreeRunnerRepository(runner);
    const updateId = randomUUID();
    expect(await tree.takeTurn({ updateId, runId: dig, parentRunId: root, positionRef: "pos-1", kind: "PUBLIC_DIG", climbStep: 0, causeKind: "DIG_SETTLED", causeId: null })).toBe("TAKEN");
    expect(await tree.record({ updateId, basedOn: null, outcome: "READY", failureCode: null, changed: true, fateBefore: "HELD_UP", fateAfter: "FELL",
      writerLineage: LINEAGE, checkerLineage: LINEAGE, rounds: 1, artifactRefs: [], content: await sealed(dig, "identity.path_update", updateId),
      settingsVersion: 4 })).toBe("RECORDED");
    expect(await runnerRepo.settleCheck(dig, "REFUSED", randomUUID())).toBe("RECORDED");
    expect(await ownerLine(ana.ownerRef, root)).toEqual([]);
    expect((await runnerRepo.recordPageUpdate({ updateId: randomUUID(), publicationRef, kind: "PATH", positionRef: "pos-1", digRunId: dig,
      content: pubEnvelope(publicationRef) as never })).outcome).toBe("NOT_ALLOWED");
    expect(await runnerRepo.readPageUpdates(publicationRef)).toEqual([]);
    expect(await publicDebates(dan).readOwn(dan.ownerRef, dig)).toEqual([expect.objectContaining({ dig_run_id: dig, outcome: "REFUSED" })]);
    expect(await publicDebates(ana).readOwn(ana.ownerRef, dig)).toEqual([]);
    // 0171 (F5): Ana's request reads nothing of Dan's, and with no session the API's role names no one.
    expect(await publicDebates(ana).readOwn(dan.ownerRef, dig)).toEqual([]);
    expect(await new PostgresPublicDebateRepository(api).readOwn(dan.ownerRef, dig)).toEqual([]);
    // Its turn no longer holds the path: the next one writes on the story's line.
    const next = randomUUID();
    const other = await run(dan);
    expect((await join.join({ ownerRef: dan.ownerRef, publicationRef, parentRunId: root, childRunId: other, positionRef: "pos-1" })).outcome).toBe("JOINED");
    expect(await tree.takeTurn({ updateId: next, runId: other, parentRunId: root, positionRef: "pos-1", kind: "PUBLIC_DIG", climbStep: 0, causeKind: "DIG_SETTLED", causeId: null })).toBe("TAKEN");
    expect(await tree.readTurn(next)).toMatchObject({ state: "FRONT", base_kind: null });
  });

  it("the erased digger's name goes, the row and the page stay; the first author's name goes the same way", async () => {
    const [ana, dan] = [await account(), await account()];
    const root = await run(ana);
    const dig = await run(dan);
    const publicationRef = await publish(root);
    expect((await publicTree(dan).join({ ownerRef: dan.ownerRef, publicationRef, parentRunId: root, childRunId: dig, positionRef: "pos-1" })).outcome).toBe("JOINED");
    const runnerRepo = new PostgresPublicDebateRunnerRepository(runner);
    await runnerRepo.settleCheck(dig, "ALLOWED", null);
    await runnerRepo.recordPageUpdate({ updateId: randomUUID(), publicationRef, kind: "MAIN_ANSWER", positionRef: null, digRunId: dig, content: pubEnvelope(publicationRef) as never });
    expect(await runnerRepo.isAuthorNameGone(publicationRef)).toBe(false);
    await tombstone(dig);
    await erasure.query("SELECT identity.forget_erased_debate_public($1)", [dig]);
    expect((await runnerRepo.readPageUpdates(publicationRef))[0]).toMatchObject({ kind: "MAIN_ANSWER", contributor: null });
    expect((await database.pool.query<{ outcome: string }>("SELECT outcome FROM identity.public_contribution WHERE dig_run_id=$1", [dig])).rows[0]!.outcome).toBe("ALLOWED");
    const forgetIdle = await sqlError(() => erasure.query("SELECT identity.forget_erased_debate_public($1)", [randomUUID()]));
    expect(forgetIdle).toMatchObject({ code: "55000", message: "PUBLIC_DEBATE_NOT_ERASED" });
  });

  it("no request role reads a table; the page's updates never change", async () => {
    const denied = await sqlError(() => api.query("SELECT * FROM identity.public_contribution"));
    expect(denied.code).toBe("42501");
    for (const table of ["identity.path_update", "identity.main_answer_update", "identity.run_purpose_lines", "identity.web_shown_quote", "identity.web_reply_text", "identity.public_debate_update"]) {
      expect((await sqlError(() => runner.query(`SELECT * FROM ${table}`))).code, table).toBe("42501");
    }
    const [ana] = [await account()];
    const root = await run(ana);
    const publicationRef = await publish(root);
    await seeded([[`INSERT INTO identity.public_debate_update (publication_ref,update_seq,update_id,kind,dig_run_id,content_ciphertext,position_ref)
      VALUES ($1,1,$2,'MAIN_ANSWER',$3,$4::jsonb,NULL)`, [publicationRef, randomUUID(), root, JSON.stringify(pubEnvelope(publicationRef))]]]);
    expect((await sqlError(() => database.pool.query("UPDATE identity.public_debate_update SET kind='PATH' WHERE publication_ref=$1", [publicationRef]))).code).toBeDefined();
    expect((await sqlError(() => database.pool.query("DELETE FROM identity.public_debate_update WHERE publication_ref=$1", [publicationRef]))).code).toBeDefined();
  });
});

describe("0137: a Free debate goes public when finished, or stays private", () => {
  it("publishes through the one-shot path, with no session present, and a refusal stays private", async () => {
    const ana = await account();
    const session = randomUUID();
    await database.pool.query(`INSERT INTO identity.session (session_id,user_id,token_hash,csrf_token_hash,last_mfa_at,idle_expires_at,absolute_expires_at)
      VALUES ($1,$2,$3,$4,now(),now()+interval '1 hour',now()+interval '2 hours')`,
      [session, ana.userId, `sha256:${"a".repeat(64)}`, `sha256:${"b".repeat(64)}`]);
    const [published, refused, oldFree] = [await run(ana), await run(ana), await run(ana)];
    for (const runId of [published, refused, oldFree]) await work(runId, "DONE");
    const repo = publicDebates(ana);
    const runnerRepo = new PostgresPublicDebateRunnerRepository(runner);
    expect(await repo.recordFreeNotice(ana.ownerRef, published)).toBe("RECORDED");
    expect(await repo.recordFreeNotice(ana.ownerRef, published)).toBe("ALREADY");
    expect(await repo.recordFreeNotice(ana.ownerRef, refused)).toBe("RECORDED");
    // A Free debate from before the notice has no row and never goes public.
    const waiting = await runnerRepo.readFreeToPublish(50);
    expect(waiting.map((row) => row.run_id)).toEqual(expect.arrayContaining([published, refused]));
    expect(waiting.map((row) => row.run_id)).not.toContain(oldFree);

    expect(await runnerRepo.refuseFree(refused)).toBe("RECORDED");
    expect(await runnerRepo.refuseFree(refused)).toBe("ALREADY");
    expect((await runnerRepo.prepareFreePublication(refused, randomUUID())).outcome).toBe("NOT_WAITING");
    expect((await runnerRepo.readFreeToPublish(50)).map((row) => row.run_id)).not.toContain(refused);

    const ref = randomUUID();
    const prepared = await runnerRepo.prepareFreePublication(published, ref);
    expect(prepared.outcome).toBe("PREPARED");
    expect(await runnerRepo.publishFree({ runId: published, publicationRef: randomUUID(), grantTokenHash: prepared.grantTokenHash!,
      content: pubEnvelope(ref) as never, presentedAt: new Date() })).toBe("NO_INTENT");
    expect(await runnerRepo.publishFree({ runId: published, publicationRef: ref, grantTokenHash: prepared.grantTokenHash!,
      content: pubEnvelope(ref) as never, presentedAt: new Date() })).toBe("PUBLISHED");
    expect((await database.pool.query<{ state: string }>(
      "SELECT state FROM core.run_visibility_event WHERE run_id=$1 ORDER BY at_seq DESC LIMIT 1", [published])).rows[0]!.state).toBe("PUBLISHED");
    expect((await database.pool.query<{ published: boolean }>("SELECT core.run_is_published($1,$2) AS published", [published, ref])).rows[0]!.published).toBe(true);
    // The one-shot binding and the key's intent are gone with it; no grant was issued.
    expect((await database.pool.query("SELECT 1 FROM identity.publication_event_binding WHERE run_id=$1 AND consumed_at IS NULL", [published])).rowCount).toBe(0);
    expect((await database.pool.query("SELECT 1 FROM serve.publication_key_provision_intent WHERE publication_ref=$1", [ref])).rowCount).toBe(0);
    expect((await database.pool.query("SELECT 1 FROM identity.step_up_grant WHERE target_run_id=$1", [published])).rowCount).toBe(0);
    expect(await runnerRepo.publishFree({ runId: published, publicationRef: ref, grantTokenHash: prepared.grantTokenHash!,
      content: pubEnvelope(ref) as never, presentedAt: new Date() })).toBe("NOT_WAITING");
    // An account with no session row stays private (its notice was recorded in its own request; the session has gone since).
    const noSession = await account();
    const lone = await run(noSession);
    await work(lone, "DONE");
    expect(await publicDebates(noSession).recordFreeNotice(noSession.ownerRef, lone)).toBe("RECORDED");
    await database.pool.query("DELETE FROM identity.session WHERE user_id=$1", [noSession.userId]);
    expect((await runnerRepo.prepareFreePublication(lone, randomUUID())).outcome).toBe("NO_SESSION");
  });
});

describe("0138: the climb's turns, the one line and the main answer", () => {
  it("a climb names its cause, waits its turn and keeps to the whole line, across 0134's rewrites too", async () => {
    const ana = await account();
    const [root, dig] = [await run(ana), await run(ana)];
    await database.pool.query("SELECT outcome FROM identity.join_investigation_nested($1,$2,$3,'{}'::text[],'quick')", [ana.ownerRef, root, dig]);
    const tree = new PostgresTreeUpdateRunnerRepository(runner);
    // 0134's turn for the dig's own rewrite.
    await runner.query("SELECT * FROM identity.take_path_rewrite_turn($1,$2,'pos-1')", [dig, root]);
    const updateId = randomUUID();
    const climb = { updateId, runId: dig, parentRunId: root, positionRef: "pos-1", kind: "CLIMB" as const, climbStep: 1, causeKind: "PATH_REWRITE" as const, causeId: randomUUID() };
    // No rewrite yet: no cause.
    expect(await tree.takeTurn(climb)).toBe("NO_CAUSE");
    const rewriteId = randomUUID();
    const rewrite = { rewriteId, digRunId: dig, parentAnswerVersion: 1, basedOnRewriteId: null, outcome: "READY" as const, failureCode: null,
      fateBefore: "HELD_UP" as const, fateAfter: "FELL" as const, verdict: null, writerLineage: LINEAGE, checkerLineage: LINEAGE, rounds: 1,
      artifactRefs: [], content: await sealed(dig, "identity.path_rewrite", rewriteId), settingsVersion: 4 };
    expect(await tree.recordRewriteInLine({ kind: "PATH_UPDATE", id: randomUUID() }, rewrite)).toBe("BASE_MOVED");
    expect(await tree.recordRewriteInLine(null, rewrite)).toBe("RECORDED");
    expect(await tree.recordRewriteInLine(null, rewrite)).toBe("ALREADY");
    const taken = { ...climb, causeId: rewriteId };
    expect(await tree.takeTurn(taken)).toBe("TAKEN");
    expect(await tree.takeTurn({ ...taken, updateId: randomUUID() })).toBe("CONFLICT");
    expect(await tree.readTurn(updateId)).toMatchObject({ state: "FRONT", base_kind: "PATH_REWRITE", base_id: rewriteId, climb_step: 1, cause_id: rewriteId });
    const row = { updateId, basedOn: { kind: "PATH_REWRITE" as const, id: rewriteId }, outcome: "READY" as const, failureCode: null, changed: false,
      fateBefore: "FELL" as const, fateAfter: "FELL" as const, writerLineage: LINEAGE, checkerLineage: LINEAGE, rounds: 1, artifactRefs: ["a"],
      content: await sealed(dig, "identity.path_update", updateId), settingsVersion: 4 };
    expect(await tree.record({ ...row, basedOn: null })).toBe("BASE_MOVED");
    // Plain text is refused: the run must use encryption and the envelope must be bound.
    expect((await sqlError(() => tree.record({ ...row, content: { envelope: { plain: "text" } as never, attestation: Buffer.alloc(32) } }))).message).toBe("CONTENT_ATTESTATION_REQUIRED");
    expect((await sqlError(() => tree.record({ ...row, content: { envelope: ENVELOPE as never, attestation: Buffer.alloc(32) } }))).message).toBe("CONTENT_ATTESTATION_INVALID");
    expect(await tree.record(row)).toBe("RECORDED");
    expect(await tree.record(row)).toBe("ALREADY");
    expect((await sqlError(() => database.pool.query("UPDATE identity.path_update SET rounds=2 WHERE update_id=$1", [updateId]))).message).toBe("TREE_UPDATE_APPEND_ONLY");
    expect((await sqlError(() => database.pool.query("DELETE FROM identity.path_update WHERE update_id=$1", [updateId]))).message).toBe("TREE_UPDATE_APPEND_ONLY");
    // An unchanged level is no cause for the next.
    expect(await tree.takeTurn({ ...taken, updateId: randomUUID(), climbStep: 2, causeKind: "PATH_UPDATE", causeId: updateId })).toBe("NO_CAUSE");
    const line = (await tree.readLine(root))!;
    expect(line.map((entry) => [entry.source, entry.state])).toEqual([["PATH_REWRITE", "READY"], ["PATH_UPDATE", "READY"]]);
    // A second direct dig's rewrite is held to the climb's text, not only 0134's.
    const second = await run(ana);
    await database.pool.query("SELECT outcome FROM identity.join_investigation_nested($1,$2,$3,'{}'::text[],'quick')", [ana.ownerRef, root, second]);
    await runner.query("SELECT * FROM identity.take_path_rewrite_turn($1,$2,'pos-1')", [second, root]);
    const secondId = randomUUID();
    const secondRewrite = { ...rewrite, rewriteId: secondId, digRunId: second, basedOnRewriteId: rewriteId, content: await sealed(second, "identity.path_rewrite", secondId) };
    expect(await tree.recordRewriteInLine({ kind: "PATH_REWRITE", id: rewriteId }, secondRewrite)).toBe("BASE_MOVED");
    expect(await tree.recordRewriteInLine({ kind: "PATH_UPDATE", id: updateId }, secondRewrite)).toBe("RECORDED");
    expect(await tree.readClimbNext(root)).toBeNull();
    expect(await tree.readClimbNext(dig)).toMatchObject({ parent_run_id: root, root_run_id: root });
  });

  it("the main answer's versions are sealed under the root, numbered, once per trigger, naming who paid", async () => {
    const [ana, dan] = [await account(), await account()];
    const root = await run(ana);
    const tree = new PostgresTreeUpdateRunnerRepository(runner);
    const trigger = randomUUID();
    const dig = randomUUID();
    const updateId = randomUUID();
    const record = { updateId, rootRunId: root, basedOnUpdateId: null, triggerKind: "PATH_UPDATE" as const, triggerId: trigger, triggerRunId: dig,
      paidByOwnerRef: dan.ownerRef, outcome: "READY" as const, failureCode: null, writerLineage: LINEAGE, checkerLineage: LINEAGE, rounds: 1, artifactRefs: [],
      spentMicros: 123, content: await sealed(root, "identity.main_answer_update", updateId), settingsVersion: 4 };
    expect((await sqlError(() => tree.recordMainAnswer({ ...record, content: { envelope: ENVELOPE as never, attestation: Buffer.alloc(32) } }))).message).toBe("CONTENT_ATTESTATION_INVALID");
    expect(await tree.recordMainAnswer(record)).toEqual({ outcome: "RECORDED", answerSeq: 1 });
    expect(await tree.recordMainAnswer(record)).toEqual({ outcome: "ALREADY", answerSeq: 1 });
    const nextId = randomUUID();
    const next = { ...record, updateId: nextId, triggerId: randomUUID(), content: await sealed(root, "identity.main_answer_update", nextId) };
    expect((await tree.recordMainAnswer(next)).outcome).toBe("BASE_MOVED");
    expect(await tree.recordMainAnswer({ ...next, basedOnUpdateId: updateId })).toEqual({ outcome: "RECORDED", answerSeq: 2 });
    const read = await ownerMainAnswers(ana.ownerRef, root);
    expect(read!.map((row) => [row.answer_seq, row.paid_by_owner_ref])).toEqual([[1, dan.ownerRef], [2, dan.ownerRef]]);
    expect(await ownerMainAnswers(dan.ownerRef, root)).toBeNull();
    // The payer's name goes on their erasure; the version stays.
    await database.pool.query('UPDATE identity.main_answer_update SET paid_by_owner_ref=NULL WHERE run_id=$1', [root]);
    expect((await tree.readMainAnswers(root))!.map((row) => row.paid_by_owner_ref)).toEqual([null, null]);
    await tombstone(root);
    expect((await erasure.query<{ rows: number }>("SELECT identity.forget_erased_debate_tree_updates($1) AS rows", [root])).rows[0]!.rows).toBe(2);
  });

  it("the purpose lines are written once at the ask, encrypted; an old debate has none, a plaintext run is refused", async () => {
    const ana = await account();
    const [fresh, old, plain] = [await run(ana), await run(ana), await run(ana, false)];
    const repo = treeUpdates(ana);
    expect(await repo.readPurposeLines(ana.ownerRef, old)).toBeNull();
    const lines = await sealed(fresh, "identity.run_purpose_lines", fresh);
    expect(await repo.recordPurposeLines(ana.ownerRef, fresh, lines)).toBe("RECORDED");
    expect(await repo.recordPurposeLines(ana.ownerRef, fresh, lines)).toBe("ALREADY");
    expect(await repo.readPurposeLines(ana.ownerRef, fresh)).toEqual(ENVELOPE);
    expect(await new PostgresTreeUpdateRunnerRepository(runner).readPurposeLines(fresh)).toEqual(ENVELOPE);
    expect((await sqlError(() => repo.recordPurposeLines(ana.ownerRef, plain, lines))).message).toBe("WEB_EVIDENCE_ENCRYPTION_REQUIRED");
    const other = await account();
    expect(await treeUpdates(other).recordPurposeLines(other.ownerRef, old, lines)).toBe("NOT_OWNED");
    // 0171 (F5): a request names only its own session's account, and with no session the API's role names no one.
    for (const pool of [asking(other), api]) {
      expect(await sqlError(() => new PostgresTreeUpdateRepository(pool).recordPurposeLines(ana.ownerRef, old, lines)))
        .toMatchObject({ code: "42501", message: "REQUEST_OWNER_MISMATCH" });
      expect(await sqlError(() => new PostgresTreeUpdateRepository(pool).readPurposeLines(ana.ownerRef, fresh)))
        .toMatchObject({ code: "42501", message: "REQUEST_OWNER_MISMATCH" });
    }
  });
});

describe("0139: the deletion keeps the quote and the notes", () => {
  it("waits while the debate runs, refuses to lose a quote, keeps the other pages, and is safe to repeat", async () => {
    const ana = await account();
    const runId = await run(ana);
    const { top, other, extractId } = await webStep(ana, runId);
    const repo = new PostgresPassageRetentionRepository(runner);
    const artifact = randomUUID();
    expect(webReplyTextIdOf(webReplyTextRef(artifact))).toBe(artifact);
    expect(webReplyTextIdOf("{\"choices\":[]}")).toBeNull();
    const reply = await sealed(runId, "identity.web_reply_text", artifact);
    expect(await repo.recordReplyText(runId, artifact, reply)).toBe("RECORDED");
    expect(await repo.recordReplyText(runId, artifact, reply)).toBe("ALREADY");
    expect(await repo.readReplyTexts(runId, [artifact])).toEqual([{ artifact_id: artifact, content: ENVELOPE }]);
    // Queued, then running: it may still read them.
    expect((await repo.wipe(runId, "NOTHING_RUNS")).outcome).toBe("STILL_RUNNING");
    await work(runId, "CLAIMED");
    expect((await repo.wipe(runId, "NOTHING_RUNS")).outcome).toBe("STILL_RUNNING");
    await seeded([["UPDATE core.work_item SET state='DONE',claimed_by=NULL,claim_deadline=NULL WHERE run_id=$1", [runId]]]);
    // Paused at the month wall: it continues and keeps what the AIs found.
    await seeded([["INSERT INTO identity.run_pause_event (run_id,event_no,owner_ref,kind,reason,resumable_at,planned_calls,planned_searches,planned_micros) VALUES ($1,1,$2,'PAUSED','MONTH_WALL',now()+interval '1 day',1,1,1)", [runId, ana.ownerRef]]]);
    expect((await repo.wipe(runId, "NOTHING_RUNS")).outcome).toBe("STILL_RUNNING");
    await seeded([["INSERT INTO identity.run_pause_event (run_id,event_no,owner_ref,kind) VALUES ($1,2,$2,'RESUMED')", [runId, ana.ownerRef]]]);
    // The quote must exist first: nothing goes.
    expect((await repo.wipe(runId, "NOTHING_RUNS")).outcome).toBe("QUOTES_MISSING");
    expect(await repo.readHolding(500)).toContain(runId);
    const quote = await sealed(runId, "identity.web_shown_quote", extractId);
    expect(await repo.recordShownQuote(runId, randomUUID(), quote)).toBe("UNKNOWN_EXTRACT");
    expect(await repo.recordShownQuote(runId, extractId, quote)).toBe("RECORDED");
    expect(await repo.recordShownQuote(runId, extractId, quote)).toBe("ALREADY");
    expect(await repo.wipe(runId, "NOTHING_RUNS")).toEqual({ outcome: "WIPED", pageTexts: 1, extracts: 1, packs: 1, replies: 1 });
    const count = async (table: string): Promise<number> => Number((await database.pool.query<{ n: string }>(`SELECT count(*) AS n FROM ${table} WHERE run_id=$1`, [runId])).rows[0]!.n);
    expect(await count("identity.web_extract")).toBe(0);
    expect(await count("identity.web_pack")).toBe(0);
    expect(await count("identity.web_reply_text")).toBe(0);
    // The other page's text stays for its 30 days; the top page's went; links, the notes and the quote stay.
    expect((await database.pool.query<{ page_id: string }>("SELECT page_id FROM identity.web_page_text WHERE run_id=$1", [runId])).rows.map((row) => row.page_id)).toEqual([other]);
    expect(await count("identity.web_page")).toBe(2);
    expect(await count("identity.web_reading")).toBe(2);
    expect(await repo.readShownQuotes(runId)).toEqual([expect.objectContaining({ extract_id: extractId, page_id: top, label: "S1-1", content: ENVELOPE })]);
    expect(await repo.readReplyTexts(runId, [artifact])).toEqual([]);
    expect(await repo.wipe(runId, "NOTHING_RUNS")).toEqual({ outcome: "WIPED", pageTexts: 0, extracts: 0, packs: 0, replies: 0 });
    expect(await repo.readHolding(500)).not.toContain(runId);
    expect(Number((await database.pool.query<{ n: string }>("SELECT count(*) AS n FROM identity.web_passage_wipe WHERE run_id=$1", [runId])).rows[0]!.n)).toBe(1);
    // A page added to researched and not weighed yet holds it; once weighed its text goes too.
    await seeded([["INSERT INTO identity.web_researched (page_id,run_id,owner_ref,path_ref) VALUES ($1,$2,$3,'pos-1')", [other, runId, ana.ownerRef]]]);
    expect((await repo.wipe(runId, "REPORT_WRITTEN")).outcome).toBe("STILL_RUNNING");
    await runner.query("SELECT identity.settle_web_researched($1,$2,'DOES_NOT_ADD')", [runId, other]);
    expect(await repo.wipe(runId, "REPORT_WRITTEN")).toEqual({ outcome: "WIPED", pageTexts: 1, extracts: 0, packs: 0, replies: 0 });
    // Append-only, and the role reaches the table only through its definers.
    expect((await sqlError(() => database.pool.query("UPDATE identity.web_shown_quote SET label='S1-2' WHERE run_id=$1", [runId]))).message).toBe("PASSAGE_RETENTION_APPEND_ONLY");
    expect((await sqlError(() => database.pool.query("DELETE FROM identity.web_shown_quote WHERE run_id=$1", [runId]))).message).toBe("PASSAGE_RETENTION_APPEND_ONLY");
    // Erasing the debate takes the rest with it.
    await tombstone(runId);
    await erasure.query("SELECT identity.forget_erased_debate_web_evidence($1)", [runId]);
    expect((await erasure.query<{ rows: number }>("SELECT identity.forget_erased_debate_passages($1) AS rows", [runId])).rows[0]!.rows).toBeGreaterThanOrEqual(1);
    expect(await count("identity.web_shown_quote")).toBe(0);
    expect(await count("identity.web_passage_wipe")).toBe(0);
  });

  it("a dig holds its passages until its own rewrite is written; a failed debate holds nothing", async () => {
    const ana = await account();
    const [root, dig, failed] = [await run(ana), await run(ana), await run(ana)];
    await database.pool.query("SELECT outcome FROM identity.join_investigation_nested($1,$2,$3,'{}'::text[],'quick')", [ana.ownerRef, root, dig]);
    await seeded([["INSERT INTO identity.dig_pick_set (run_id,owner_ref,parent_run_id,position_ref,pick_count) VALUES ($1,$2,$3,'pos-1',0)", [dig, ana.ownerRef, root]]]);
    await work(dig, "DONE");
    const repo = new PostgresPassageRetentionRepository(runner);
    expect((await repo.wipe(dig, "NOTHING_RUNS")).outcome).toBe("STILL_RUNNING");
    await runner.query("SELECT * FROM identity.take_path_rewrite_turn($1,$2,'pos-1')", [dig, root]);
    await new PostgresTreeUpdateRunnerRepository(runner).recordRewriteInLine(null, { rewriteId: randomUUID(), digRunId: dig, parentAnswerVersion: 1, basedOnRewriteId: null,
      outcome: "FAILED", failureCode: "FIXTURE_FAILED", fateBefore: "HELD_UP", fateAfter: null, verdict: null, writerLineage: null, checkerLineage: null, rounds: 0, artifactRefs: [], content: null, settingsVersion: 4 });
    expect((await repo.wipe(dig, "NOTHING_RUNS")).outcome).toBe("WIPED");
    await work(failed, "FAILED");
    expect((await repo.wipe(failed, "NOTHING_RUNS")).outcome).toBe("WIPED");
  });

  it("a closing keeps every page text; the caller's wipe decides them", async () => {
    const ana = await account();
    const [root, dig] = [await run(ana), await run(ana)];
    await webStep(ana, root);
    const investigation = (await database.pool.query<{ investigation_id: string }>(
      "SELECT investigation_id FROM identity.join_investigation_nested($1,$2,$3,'{}'::text[],'quick')", [ana.ownerRef, root, dig])).rows[0]!.investigation_id;
    expect(await new PostgresInvestigationClosingRepository(asking(ana)).closeKeepingTexts(ana.ownerRef, investigation)).toEqual({ outcome: "CLOSED", reportVersion: 1 });
    expect(await new PostgresInvestigationClosingRepository(asking(ana)).closeKeepingTexts(ana.ownerRef, investigation)).toEqual({ outcome: "ALREADY_CLOSED", reportVersion: 1 });
    expect(Number((await database.pool.query<{ n: string }>("SELECT count(*) AS n FROM identity.web_page_text WHERE run_id=$1", [root])).rows[0]!.n)).toBe(2);
  });
});

describe("export and account erasure", () => {
  it("the export worker reads the account's rows in codes and envelopes, and an account's erasure cascades", async () => {
    const [ana, dan] = [await account(), await account()];
    const root = await run(ana);
    const dig = await run(dan);
    const lone = await run(dan);
    const publicationRef = await publish(root);
    expect((await publicTree(dan).join({ ownerRef: dan.ownerRef, publicationRef, parentRunId: root, childRunId: dig, positionRef: "pos-1" })).outcome).toBe("JOINED");
    // The Free notice is a debate's that is no dig (0171 F2: a dig's is no one's, as the asks route never records one); dan's own debate has it.
    expect(await publicDebates(dan).recordFreeNotice(dan.ownerRef, dig)).toBe("NOT_OWNED");
    expect(await publicDebates(dan).recordFreeNotice(dan.ownerRef, lone)).toBe("RECORDED");
    const lines = await sealed(dig, "identity.run_purpose_lines", dig);
    await treeUpdates(dan).recordPurposeLines(dan.ownerRef, dig, lines);
    const { top: _top, extractId } = await webStep(dan, dig);
    await new PostgresPassageRetentionRepository(runner).recordShownQuote(dig, extractId, await sealed(dig, "identity.web_shown_quote", extractId));
    const lease = await exportLease(dan);
    const publicExport = (await worker.query<{ value: Record<string, unknown[]> }>("SELECT identity.read_data_export_public_debates($1,$2) AS value", [lease.exportId, lease.workerId])).rows[0]!.value;
    expect(publicExport.public_contributions).toHaveLength(1);
    expect(publicExport.free_public_asks).toHaveLength(1);
    const treeExport = (await worker.query<{ value: Record<string, unknown[]> }>("SELECT identity.read_data_export_tree_updates($1,$2) AS value", [lease.exportId, lease.workerId])).rows[0]!.value;
    expect(treeExport.purpose_lines).toEqual([expect.objectContaining({ run_id: dig, content: ENVELOPE })]);
    const passageExport = (await worker.query<{ value: Record<string, unknown[]> }>("SELECT identity.read_data_export_passage_retention($1,$2) AS value", [lease.exportId, lease.workerId])).rows[0]!.value;
    expect(passageExport.web_shown_quotes).toEqual([expect.objectContaining({ extract_id: extractId })]);
    expect(JSON.stringify(passageExport)).not.toContain("web_reply_text");
    expect((await sqlError(() => worker.query("SELECT identity.read_data_export_public_debates($1,$2)", [randomUUID(), lease.workerId]))).code).toBeDefined();
    // The account goes: the private rows cascade, the contribution stays with no name.
    await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [dan.userId]);
    const row = (await database.pool.query<{ owner_ref: string | null }>("SELECT owner_ref FROM identity.public_contribution WHERE dig_run_id=$1", [dig])).rows[0]!;
    expect(row.owner_ref).toBeNull();
    for (const [table, runId] of [["identity.run_purpose_lines", dig], ["identity.free_public_ask", lone], ["identity.web_shown_quote", dig]] as const) {
      expect(Number((await database.pool.query<{ n: string }>(`SELECT count(*) AS n FROM ${table} WHERE run_id=$1`, [runId])).rows[0]!.n), table).toBe(0);
    }
  });
});

describe("0137 and 0140: the money", () => {
  it("every new source names its run; a funded window, its admission and the team's reader count every kind a person pays", async () => {
    const ana = await account();
    const runId = await run(ana);
    const grant = randomUUID();
    const event = randomUUID();
    for (const source of ["PATH_CLIMB", "ANSWER_UPDATE", "CONTRIBUTION_CHECK", "PUBLIC_REPORT"]) {
      const refused = await sqlError(() => database.pool.query(`INSERT INTO ledger.model_spend (spend_id,run_id,spend_source,provider_ref,charged_on,charge_micros,input_tokens,output_tokens)
        VALUES ($1,NULL,$2,'provider:a',current_date,1,1,1)`, [randomUUID(), source]));
      expect(refused.code, source).toBe("23514");
    }
    const def = (await database.pool.query<{ reader: string; commitments: string; reserve: string; team: string }>(`SELECT
      pg_get_functiondef('billing.read_internal_grant_spent(uuid,uuid,uuid,timestamptz,timestamptz,boolean)'::regprocedure) AS reader,
      pg_get_functiondef('billing.read_internal_grant_commitments(uuid,uuid,uuid,uuid)'::regprocedure) AS commitments,
      pg_get_functiondef('billing.reserve_internal_provider_call(uuid,uuid,bigint,text,text)'::regprocedure) AS reserve,
      pg_get_functiondef('staff.read_team_internal_spent(timestamptz,timestamptz)'::regprocedure) AS team`)).rows[0]!;
    for (const [name, text] of Object.entries(def)) {
      for (const kind of ["PATH_REWRITE", "INVESTIGATION_REPORT", "PATH_CLIMB", "ANSWER_UPDATE", "CONTRIBUTION_CHECK"]) expect(text, `${name} ${kind}`).toContain(`'${kind}'`);
    }
    await seeded([
      [`INSERT INTO billing.internal_grant (grant_id,owner_ref,configured_event_id,revision,amount_micros,day_micros,week_micros,starts_at,expires_at,funding_approval_ref,policy_register_version)
        VALUES ($1,$2,$3,1,1000000,1000000,1000000,now()-interval '1 day',now()+interval '1 day','fixture',1)`, [grant, ana.ownerRef, event]],
      [`INSERT INTO billing.run_charge_scope (run_id,owner_ref,admitted_at,funding_kind,internal_grant_id,internal_grant_event_id)
        VALUES ($1,$2,now(),'INTERNAL',$3,$4)`, [runId, ana.ownerRef, grant, event]],
      ...["RUN", "PATH_REWRITE", "INVESTIGATION_REPORT", "PATH_CLIMB", "ANSWER_UPDATE", "CONTRIBUTION_CHECK", "PUBLIC_REPORT"].map((source, index) =>
        [`INSERT INTO ledger.model_spend (spend_id,run_id,spend_source,spend_phase,provider_ref,charged_on,charge_micros,input_tokens,output_tokens)
          VALUES ($1,$2,$3,$4,'provider:a',current_date,$5,1,1)`, [randomUUID(), runId, source, source === "RUN" ? "BODY" : null, 10 ** index]] as const)]);
    const from = new Date(Date.now() - 3_600_000);
    const to = new Date(Date.now() + 3_600_000);
    const spent = (await database.pool.query<{ total: string }>("SELECT billing.read_internal_grant_spent($1,$2,$3,$4,$5,false) AS total", [ana.ownerRef, grant, event, from, to])).rows[0]!.total;
    expect(Number(spent)).toBe(111_111);
    const team = (await database.pool.query<{ total: string }>("SELECT staff.read_team_internal_spent($1,$2) AS total", [from, to])).rows[0]!.total;
    expect(Number(team)).toBeGreaterThanOrEqual(111_111);
    // 0171 took the sum back from every role, the runner's included: staff's month reader asks it as its owner.
    await expect(runner.query("SELECT staff.read_team_internal_spent($1,$2) AS total", [from, to])).rejects.toMatchObject({ code: "42501" });
    // Who pays a report on someone else's public debate: their window adds it.
    const repo = new PostgresPublicDebateRunnerRepository(runner);
    const charge = { spendId: randomUUID(), ownerRef: ana.ownerRef, investigationId: randomUUID(), reportVersion: 1, chargeMicros: 42 };
    expect(await repo.recordReportCharge(charge)).toBe("RECORDED");
    expect(await repo.recordReportCharge(charge)).toBe("ALREADY");
    // 0137's window reader of these charges had no caller; 0171 took its grant back, so the migrator reads it.
    expect(Number((await database.pool.query<{ spent: string }>("SELECT identity.read_public_report_spent($1,$2,$3) AS spent", [ana.ownerRef, from, to]))
      .rows[0]!.spent)).toBe(42);
  });
});
