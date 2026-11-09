// Plan 2026-10-31 decision 12, the database layer (0143), on real PostgreSQL: what a paused debate is to the releases around it. A
// release does not wait for it and never sets it aside; nothing closes it; Continue moves it once, only to the release that is
// current; two runners never both take it; its passages and page texts stay until it finishes, the 30-day rule included.
// Everything is made up. Integration suites are skipped by the CI gate: run this file by hand, alone.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WorkItemRepository } from "@debateai/battery";
import {
  createPool, PostgresDigModelRepository, PostgresDigModelRunnerRepository, PostgresInvestigationRepository, PostgresInvestigationRunnerRepository, PostgresWebEvidenceRepository,
  WEB_EVIDENCE_CARRIERS, encryptAttestedLeasedContentForRun, prepareLeasedContentEncryptionForRun, withRunContentLease, type WebSealed
} from "@debateai/db";
import { addressKey } from "../../packages/evidence/src/host-filter.js";
const { countOpenWork } = await import("../../deploy/" + "preview-lifecycle/v1/release-table.mjs") as unknown as {
  countOpenWork: (input: Readonly<{ releaseKey: string | null; run: unknown; layout: unknown }>) => Promise<number> };
import { PostgresAskAdmissionGate } from "../../apps/api/src/release-state.js";
import { postgresRunnerRetirementStore } from "../../apps/runner/src/runner-retirement.js";
import { createRunSettingsVersions, readRunSettingsVersionNow, runVersionMapper } from "../../apps/runner/src/run-settings.js";
import { ServeRepository } from "@debateai/serve";
import { backfillShownQuotes, sweepPassages } from "../../apps/runner/src/passage-sweep.js";
import { webStepRowId } from "../../apps/runner/src/web-step.js";
import { startContentRunFixture, type ContentRunFixture } from "../support/contentRunFixture.js";

let fixture: ContentRunFixture;
const db = () => fixture.database.pool;
beforeAll(async () => {
  fixture = await startContentRunFixture("run-handover");
  // Release A is current and takes the debates; B is staged. Keys are of the run's settings version, as a code-only upload's.
  await db().query("SELECT core.record_release_event($1, 'STAGED', 'test', NULL)", [A]);
  await db().query("SELECT core.record_release_switch($1, NULL, now(), 'test', NULL)", [A]);
}, 180_000);
afterAll(async () => { await fixture?.stop(); });

const A = "r1-aaaaaaaaaaaa";
const B = "r1-bbbbbbbbbbbb";
const C = "r2-cccccccccccc";
const pauses = () => new PostgresDigModelRepository(db());
const runnerPauses = () => new PostgresDigModelRunnerRepository(db());

/** A debate of release A with its first job; `paused`: at the month wall, its copy gone. */
async function debateOfA(paused: boolean): Promise<Readonly<{ runId: string; workItemId: string }>> {
  const runId = await fixture.createEncryptedRun("Should the pier stay?", { releaseKey: A });
  const workItemId = await new WorkItemRepository(db(), { releaseKey: A }).enqueue({ runId, batteryRowId: "Q1", nodeSet: [], commandKey: `S00:${runId}:Q1` });
  if (paused) {
    await runnerPauses().recordPause({ runId, reason: "MONTH_WALL", resumableAt: new Date(Date.now() + 3_600_000), plannedCalls: 1, plannedSearches: 0, plannedMicros: 5 });
  }
  return { runId, workItemId };
}
const state = async (workItemId: string) => (await db().query<{ state: string; terminal_reason: string | null }>(
  "SELECT state, terminal_reason FROM core.work_item WHERE work_item_id=$1", [workItemId])).rows[0]!;
const hops = async (runId: string) => (await db().query<{ hop: number; from_release_key: string; to_release_key: string; from_register_version: string; to_register_version: string }>(
  "SELECT * FROM identity.run_handover WHERE run_id=$1 ORDER BY hop", [runId])).rows;
/** The root tool's own SQL, on this database, as psql would send it. */
const psqlRun = async (argv: readonly string[], options: Readonly<{ stdin: Buffer }>) => {
  const sql = options.stdin.toString("utf8").replace(/^SET [^\n]*\n/gmu, "");
  const release = argv.find((arg) => arg.startsWith("release_key="))?.slice("release_key=".length);
  const rows = await db().query<Record<string, unknown>>(sql.replace(":'release_key'", "$1").trim().replace(/;$/u, ""), release === undefined ? [] : [release]);
  const value = Object.values(rows.rows[0]!)[0];
  return { code: 0, stdout: Buffer.from(`${value === true ? "t" : String(value)}\n`), stderr: Buffer.alloc(0), timedOut: false, overflow: false };
};
const openWork = (releaseKey: string | null) => countOpenWork({ releaseKey, run: psqlRun as never, layout: { runuser: "x", env: "x", pgBin: "x", pgSocketDir: "x", pgPort: 1, database: "x" } as never });

describe("a paused debate is not its release's open work", () => {
  it("retirement, the backstop, the site's count and the root's check all pass it by; nothing closes it", async () => {
    const paused = await debateOfA(true);
    const running = await debateOfA(false);
    const store = postgresRunnerRetirementStore(db() as never, { releaseKey: A, workerId: "worker:a" });
    const openBefore = await openWork(A);
    expect((await store.readFacts(A)).openWork).toBe(openBefore);
    expect(openBefore).toBeGreaterThanOrEqual(1);

    // No stalled-start re-send: a closed release would otherwise fail a READY job "not started".
    await db().query("INSERT INTO ledger.model_spend_hold (hold_id, run_id, held_micros, opened_at) VALUES (gen_random_uuid(), $1, 1000, clock_timestamp() - interval '1 day')", [paused.runId]);
    await db().query("INSERT INTO ledger.model_spend_hold (hold_id, run_id, held_micros, opened_at) VALUES (gen_random_uuid(), $1, 1000, clock_timestamp() - interval '1 day')", [running.runId]);
    const stalled = (await new WorkItemRepository(db()).listStalledStarts({ olderThanSeconds: 60, limit: 1000 })).map((job) => job.workItemId);
    expect(stalled).toContain(running.workItemId);
    expect(stalled).not.toContain(paused.workItemId);

    // The site's cap of debates running counts the running debate, not the paused one.
    const gate = new PostgresAskAdmissionGate({ releaseKey: A, hosted: true, siteConcurrentDebates: 8 });
    const counted = await gate.activeDebates(db() as never);
    await db().query("UPDATE core.work_item SET state='DONE' WHERE work_item_id=$1", [running.workItemId]);
    expect(await gate.activeDebates(db() as never)).toBe(counted - 1);
    await db().query("UPDATE core.work_item SET state='READY' WHERE work_item_id=$1", [running.workItemId]);

    // The backstop sets the running debate aside and never the paused one.
    const set = await store.setAsideOpenWork(A, "BACKSTOP");
    expect(set).toBeGreaterThanOrEqual(1);
    expect(await state(running.workItemId)).toMatchObject({ state: "FAILED", terminal_reason: "RUN_SET_ASIDE:BACKSTOP" });
    expect(await state(paused.workItemId)).toEqual({ state: "READY", terminal_reason: null });
    expect((await db().query("SELECT count(*)::int AS n FROM ledger.model_spend_waiver WHERE run_id=$1", [paused.runId])).rows[0].n).toBe(0);
    expect((await store.readFacts(A)).openWork).toBe(0);
    expect(await openWork(A)).toBe(0);
    expect(await openWork(null)).toBe(0);
  });

  it("a live claim is still open work until its copy lets go or lapses", async () => {
    const claimed = await debateOfA(false);
    await new WorkItemRepository(db(), { releaseKey: A, workerId: "w" }).claimById({ workItemId: claimed.workItemId, workerId: "w", claimSeconds: 60 });
    await runnerPauses().recordPause({ runId: claimed.runId, reason: "MONTH_WALL", resumableAt: new Date(Date.now() + 3_600_000), plannedCalls: 1, plannedSearches: 0, plannedMicros: 5 });
    expect(await openWork(A)).toBe(1);
    await db().query("UPDATE core.work_item SET claim_deadline = clock_timestamp() - interval '1 second' WHERE work_item_id=$1", [claimed.workItemId]);
    expect(await openWork(A)).toBe(0);
  });
});

describe("Continue moves the debate, once, to the release that is current", () => {
  it("only the current release; while another is current nothing changes; a settings version it has not passed is refused", async () => {
    const paused = await debateOfA(true);
    const owner = fixture.ownerRef;
    expect(await pauses().resumeInRelease(owner, paused.runId, B, 1)).toBe("NOT_CURRENT");
    expect(await hops(paused.runId)).toEqual([]);
    expect(await pauses().resumeInRelease(randomUUID(), paused.runId, A, 1)).toBe("NOT_OWNED");
    await db().query("SELECT core.record_release_event($1, 'STAGED', 'test', NULL)", [B]);
    await db().query("SELECT core.record_release_switch($1, $2, now(), 'test', NULL)", [B, A]);
    expect(await pauses().resumeInRelease(owner, paused.runId, B, 99)).toBe("VERSION_NOT_PASSED");
    expect((await pauses().readPause(owner, paused.runId))?.state).toBe("PAUSED");
    expect(await hops(paused.runId)).toEqual([]);
    expect(await pauses().readRunReleaseNow(paused.runId)).toMatchObject({ releaseKey: A });
  });

  it("two presses, one hand-over; the older release can no longer take it; two runners of the new release: one wins", async () => {
    const paused = await debateOfA(true);
    const owner = fixture.ownerRef;
    const outcomes = await Promise.all([pauses().resumeInRelease(owner, paused.runId, B, 1), pauses().resumeInRelease(owner, paused.runId, B, 1)]);
    expect([...outcomes].sort()).toEqual(["NOT_PAUSED", "RECORDED"]);
    expect(await hops(paused.runId)).toMatchObject([{ hop: 1, from_release_key: A, to_release_key: B }]);
    const fromA = new WorkItemRepository(db(), { releaseKey: A });
    const fromB = new WorkItemRepository(db(), { releaseKey: B });
    await expect(fromA.releaseKeyOf(paused.workItemId)).resolves.toBe(B);
    await expect(fromA.claimById({ workItemId: paused.workItemId, workerId: "a", claimSeconds: 60 })).resolves.toBeNull();
    expect((await fromA.listDispatchable(1000)).map((job) => job.workItemId)).not.toContain(paused.workItemId);
    await expect(fromA.recordTerminalFailure({ runId: paused.runId, workItemId: paused.workItemId, reason: "X" })).resolves.toBe(false);
    const claims = await Promise.all([fromB.claimById({ workItemId: paused.workItemId, workerId: "b1", claimSeconds: 60 }),
      fromB.claimById({ workItemId: paused.workItemId, workerId: "b2", claimSeconds: 60 })]);
    expect(claims.filter((claim) => claim !== null)).toHaveLength(1);
    // core.run itself stays as it was written; a debate of two hand-overs is at its newest.
    const stamped = (await db().query<{ release_key: string }>("SELECT release_key FROM core.run WHERE run_id=$1", [paused.runId])).rows[0]!;
    expect(stamped.release_key).toBe(A);
    expect((await pauses().readPause(owner, paused.runId))?.state).toBe("RESUMED");
  });

  it("a new settings version: the debate's every version read says it, its next pause and hand-over make a second hop, and the row can never change", async () => {
    const paused = await debateOfA(true);
    const owner = fixture.ownerRef;
    await db().query("SELECT core.record_release_event($1, 'RETIRED', 'test', 'DRAINED')", [A]);
    await db().query("SELECT core.record_release_event($1, 'STAGED', 'test', NULL)", [C]);
    await db().query("SELECT core.record_release_switch($1, $2, now(), 'test', NULL)", [C, B]);
    expect(await pauses().resumeInRelease(owner, paused.runId, C, 2)).toBe("RECORDED");
    expect(await hops(paused.runId)).toMatchObject([{ hop: 1, from_release_key: A, from_register_version: "1", to_release_key: C, to_register_version: "2" }]);
    const fromC = new WorkItemRepository(db(), { releaseKey: C });
    await expect(fromC.peekRunSettingsVersion(paused.workItemId)).resolves.toMatchObject({ registerVersion: 2, releaseKey: C });
    await expect(fromC.listOpenRunSettingsVersions(C)).resolves.toContain(2);
    await expect(db().query("UPDATE identity.run_handover SET to_release_key=$1 WHERE run_id=$2", [A, paused.runId])).rejects.toThrow();
    await expect(db().query("DELETE FROM identity.run_handover WHERE run_id=$1", [paused.runId])).rejects.toThrow();
    // A debate already this release's is the plain resume: no row.
    await runnerPauses().recordPause({ runId: paused.runId, reason: "MONTH_WALL", resumableAt: new Date(Date.now() + 3_600_000), plannedCalls: 1, plannedSearches: 0, plannedMicros: 5 });
    expect(await pauses().resumeInRelease(owner, paused.runId, C, 2)).toBe("RECORDED");
    expect(await hops(paused.runId)).toHaveLength(1);
  });

  it("Task 57o-fix2: the runner's own login reads a real debate's version, then the version Continue moved it to; the claim's wins over a lane's mapping", async () => {
    // After the case above C is current and has passed version 2. A paused debate of B, stamped version 1 (made up).
    const runId = await fixture.createEncryptedRun("Should the ferry run at night?", { releaseKey: B });
    await runnerPauses().recordPause({ runId, reason: "MONTH_WALL", resumableAt: new Date(Date.now() + 3_600_000), plannedCalls: 1, plannedSearches: 0, plannedMicros: 5 });
    // A login holding the runner's role only (debateai_runtime), never the API's.
    const login = ["s57o2", "runner"].join("_");
    const password = ["private", "fixture", login].join("-");
    await db().query(`CREATE ROLE ${login} LOGIN PASSWORD '${password}' IN ROLE debateai_runtime`);
    const url = new URL(fixture.database.connectionString);
    url.username = login;
    url.password = password;
    const runner = createPool(url.toString(), { max: 1, connectionTimeoutMillis: 5000, name: "test:runner-version-now" });
    try {
      expect(await readRunSettingsVersionNow(runner, runId)).toBe(1);
      // "Add to researched" (a background lane) maps the debate to its own version, which loads here; the pointer is never read.
      const lines: Array<Readonly<Record<string, unknown>>> = [];
      const versions = createRunSettingsVersions({ log: (line) => { lines.push(line); } });
      const map = runVersionMapper({ readVersion: (id) => readRunSettingsVersionNow(runner, id), requireSettings: async () => undefined, versions,
        switchedOnVersion: async () => { throw new Error("made-up: the pointer is not read for a version that loads"); }, siteVersion: 2,
        log: (line) => { lines.push(line); } });
      await map(runId);
      expect(versions.versionOf(runId)).toBe(1);
      // The person presses Continue: the debate moves to C's version 2, and the runner's login reads the moved version.
      expect(await pauses().resumeInRelease(fixture.ownerRef, runId, C, 2)).toBe("RECORDED");
      expect(await hops(runId)).toMatchObject([{ hop: 1, from_release_key: B, from_register_version: "1", to_release_key: C, to_register_version: "2" }]);
      expect(await readRunSettingsVersionNow(runner, runId)).toBe(2);
      // The claim maps the debate to the version it owns now: it wins over the lane's mapping, one content-free line, and the debate runs.
      versions.set(runId, await readRunSettingsVersionNow(runner, runId));
      expect(versions.versionOf(runId)).toBe(2);
      expect(lines).toEqual([{ kind: "DEBATEAI_RUNNER_RUN_SETTINGS_CLAIMED", runId, laneVersion: "1", version: "2" }]);
    } finally {
      await runner.end();
      await db().query(`DROP ROLE ${login}`);
    }
  });
});

describe("what a paused debate found stays until it finishes", () => {
  const PASSAGE = "The harbour report found that queues doubled in the two years after the bridge opened.";
  async function withPassages(runId: string): Promise<void> {
    const store = new PostgresWebEvidenceRepository(db());
    const [searchId, pageId, readingId, extractId, packId, otherId] = ["search", "page", "reading", "extract", "pack", "other"].map((kind) => webStepRowId(runId, kind, kind === "extract" ? "S1-1" : "x")) as [string, string, string, string, string, string];
    await withRunContentLease(db(), [runId], async () => {
      const leased = await prepareLeasedContentEncryptionForRun(db(), runId);
      const seal = (carrier: string, key: string, value: unknown): WebSealed => encryptAttestedLeasedContentForRun(leased, carrier as never, key, value)!;
      try {
        await store.recordSearch({ runId, searchId, pathRef: "a1", side: "for", languageKind: "english", language: "en", country: null, lookBack: "3y", outcome: "FOUND", chargeMicros: 0, resultCount: 2,
          words: seal(WEB_EVIDENCE_CARRIERS.search, searchId, { query: "pier" }) });
        for (const [id, rank, text] of [[pageId, 1, `Opening. ${PASSAGE}`], [otherId, 2, "Another page, outside the top picks."]] as const) {
          await store.recordPage({ runId, pageId: id, searchId, rank, readDepth: "whole", about: seal(WEB_EVIDENCE_CARRIERS.page, id, { url: `https://s.example/${id}`, site: "s.example", title: "A", date: null }),
            addressKey: addressKey(`https://s.example/${id}`), text: { chars: text.length, digest: Buffer.alloc(32, 9), sealed: seal(WEB_EVIDENCE_CARRIERS.pageText, id, text) } } as never);
        }
        await store.recordReading({ runId, readingId, pageId, reader: 1, maker: "anthropic", outcome: "READ", grade: 3,
          line: seal(WEB_EVIDENCE_CARRIERS.reading, readingId, { line: "One line.", language: "en", note: "It is a report." }), settingsVersion: 4 });
        await store.recordExtract({ runId, extractId, pageId, label: "S1-1", foundBy: [1], quote: seal(WEB_EVIDENCE_CARRIERS.extract, extractId, { quote: PASSAGE }) });
        await store.recordPicks(runId, "a1", [pageId]);
        await store.recordPack({ runId, packId, pathRef: "a1", extractLabels: ["S1-1"], pack: seal(WEB_EVIDENCE_CARRIERS.pack, packId, { path_ref: "a1", pages: [], extracts: [] }) });
      } finally { await leased.close(); }
    });
  }
  const held = async (runId: string) => {
    const count = async (table: string) => (await db().query<{ n: number }>(`SELECT count(*)::int AS n FROM identity.${table} WHERE run_id=$1`, [runId])).rows[0]!.n;
    return { texts: await count("web_page_text"), extracts: await count("web_extract"), packs: await count("web_pack") };
  };
  /** The debate's texts as if stored more than 30 days ago. */
  const age = async (runId: string) => {
    await db().query("ALTER TABLE identity.web_page_text DISABLE TRIGGER guard_web_evidence_record");
    try { await db().query("UPDATE identity.web_page_text SET stored_at = clock_timestamp() - interval '40 days' WHERE run_id=$1", [runId]); }
    finally { await db().query("ALTER TABLE identity.web_page_text ENABLE TRIGGER guard_web_evidence_record"); }
  };
  const log = () => undefined;

  it("paused for 40 days it keeps its passages and every page text through both sweeps; after a hand-over too; when it finishes they go, the other page after its 30 days", async () => {
    const owner = fixture.ownerRef;
    const paused = await debateOfA(true);
    await withPassages(paused.runId);
    await age(paused.runId);
    const whole = { texts: 2, extracts: 1, packs: 1 };
    await sweepPassages(db() as never, log);
    expect(await held(paused.runId)).toEqual(whole);
    const current = (await db().query<{ release_key: string }>("SELECT release_key FROM core.read_current_release()")).rows[0]!.release_key;
    expect(await pauses().resumeInRelease(owner, paused.runId, current, Number(current.match(/^r(\d+)-/u)![1]))).toBe("RECORDED");
    expect((await pauses().readPause(owner, paused.runId))?.state).toBe("RESUMED");
    await sweepPassages(db() as never, log);
    expect(await held(paused.runId)).toEqual(whole);

    // It finishes: nothing runs, so the passages and the passage-bound text go, and the other page, past its 30 days, too.
    await db().query("UPDATE core.work_item SET state='DONE', claimed_by=NULL, claim_deadline=NULL WHERE work_item_id=$1", [paused.workItemId]);
    await sweepPassages(db() as never, log);
    expect(await held(paused.runId)).toEqual({ texts: 0, extracts: 0, packs: 0 });
  });

  it("0133's own sweep, which no code calls any more, would have taken a paused debate's texts: what the new sweep spares is real", async () => {
    const paused = await debateOfA(true);
    await withPassages(paused.runId);
    await age(paused.runId);
    await db().query("SELECT identity.wipe_inactive_web_page_text(1000)");
    expect((await held(paused.runId)).texts).toBe(0);
  });

  it("a paused dig keeps the page texts of its whole investigation: it may reuse them when it continues", async () => {
    const root = await debateOfA(false);
    await withPassages(root.runId);
    const dig = await debateOfA(true);
    const investigations = new PostgresInvestigationRepository(db());
    const investigationId = (await investigations.open(fixture.ownerRef, root.runId))!;
    expect((await investigations.join({ ownerRef: fixture.ownerRef, parentRunId: root.runId, childRunId: dig.runId, places: [], mode: "quick" })).outcome).toBe("JOINED");
    await db().query("UPDATE core.work_item SET state='DONE' WHERE work_item_id=$1", [root.workItemId]);
    await age(root.runId);
    await db().query("ALTER TABLE identity.investigation DISABLE TRIGGER USER");
    try { await db().query("UPDATE identity.investigation SET last_activity_at = clock_timestamp() - interval '40 days' WHERE investigation_id=$1", [investigationId]); }
    finally { await db().query("ALTER TABLE identity.investigation ENABLE TRIGGER USER"); }
    await new PostgresInvestigationRunnerRepository(db()).wipeInactivePageText(1000);
    expect((await held(root.runId)).texts).toBeGreaterThan(0);
    await db().query("UPDATE core.work_item SET state='DONE', claimed_by=NULL, claim_deadline=NULL WHERE work_item_id=$1", [dig.workItemId]);
    await db().query("SELECT identity.resume_paused_run($1,$2)", [fixture.ownerRef, dig.runId]);
    await sweepPassages(db() as never, log);
    expect((await held(root.runId)).texts).toBe(0);
  });

  it("what a set-aside debate found reads on: address, title, note and quote, after the passages went", async () => {
    const stopped = await debateOfA(true);
    await withPassages(stopped.runId);
    await db().query("UPDATE core.work_item SET state='FAILED', terminal_reason='RUN_SET_ASIDE:SETTINGS_VERSION_UNSUPPORTED' WHERE work_item_id=$1", [stopped.workItemId]);
    await db().query("SELECT identity.resume_paused_run($1,$2)", [fixture.ownerRef, stopped.runId]);
    await backfillShownQuotes(db() as never, stopped.runId);
    await sweepPassages(db() as never, log);
    expect((await held(stopped.runId)).extracts).toBe(0);
    const found = await new ServeRepository(db()).readRunFound(stopped.runId);
    expect(found.length).toBe(2);
    const read = found.find((page) => page.note !== null)!;
    expect(read).toMatchObject({ site: "s.example", title: "A", note: "It is a report." });
    expect(read.quotes.join(" ")).toContain("harbour report");
    expect(read.quotes.every((quote) => quote.length <= 120)).toBe(true);
  });

  it("a debate with nothing open past its 30 days loses its other pages as before", async () => {
    const idle = await debateOfA(false);
    await withPassages(idle.runId);
    await db().query("UPDATE core.work_item SET state='DONE' WHERE work_item_id=$1", [idle.workItemId]);
    await age(idle.runId);
    expect(await new PostgresInvestigationRunnerRepository(db()).wipeInactivePageText(1000)).toBeGreaterThanOrEqual(2);
    expect((await held(idle.runId)).texts).toBe(0);
  });
});
