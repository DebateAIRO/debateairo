import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Pool, PoolClient } from "pg";
import { WorkItemRepository } from "@debateai/battery";
import { PostgresModelSpendStore, type PersonWindow } from "@debateai/budget";
import { EntitlementRepository, RunRepository, RunWaitRepository, migrate, type WaitReason } from "@debateai/db";
import { AskRoom, type AskRoomOptions } from "../../apps/api/src/ask-room.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Paid-plans spec §2.4.2 and budget spec §2.3/§2.6 in real SQL: a person's spend
 * and holds through billing.run_charge_scope; two concurrent decisions under one
 * lock — for the site's day and for one person; and the line's ONE question —
 * a run waiting only for its own person holds nobody back, however many there
 * are. CI skips this directory.
 */
let database: TestDatabase;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 600_000);

afterAll(async () => {
  await database?.stop();
});

afterEach(async () => {
  await database.pool.query(
    "UPDATE core.work_item SET state='DONE', claimed_by=NULL, claim_deadline=NULL WHERE state IN ('READY','CLAIMED')"
  );
  await database.pool.query(
    "INSERT INTO core.run_wait_start (run_id, started_at) SELECT run_id, clock_timestamp() FROM core.run_waiting_v"
  );
});

async function activeOwner(): Promise<string> {
  const ownerRef = randomUUID();
  await database.pool.query(
    `INSERT INTO identity."user" (
       user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
       phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
       adult_affirmed_at,created_at
     ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,'active',now(),now())`,
    [randomUUID(), randomBytes(32), `room-${randomUUID()}`, randomUUID(), ownerRef]
  );
  return ownerRef;
}

async function legacyRun(askerId = `room:${randomUUID()}`): Promise<string> {
  return new RunRepository(database.pool).startRun({
    questionLine: "Does the room hold under two concurrent asks?",
    principal: { kind: "legacy", legacyAskerId: askerId },
    sessionId: randomUUID(), callerScope: "ASKER", asOf: new Date(),
    askerRiskTier: "casual", effectiveRiskTier: "casual", tierSource: "ASKER", tierProvenanceRef: "asker:test",
    compositionBudgetTier: "low", planTier: "free", depthParams: { depth: 1 },
    discoveredPanel: fixtureDiscoveredPanel(2), strangerSampleRate: 0,
    envelopeBasis: fixtureStructuralCeiling(4), registerVersion: 1, batteryVersion: "test",
    askContract: {}, batteryRows: []
  });
}

async function ownedRun(ownerRef: string): Promise<string> {
  const runId = await legacyRun();
  await database.pool.query("SELECT core.append_run_ownership_event($1,$2)", [runId, ownerRef]);
  return runId;
}

async function withClient<T>(use: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await use(client);
    await client.query("COMMIT");
    return result;
  } finally {
    client.release();
  }
}

async function pin(runId: string, ownerRef: string, admittedAt: Date): Promise<void> {
  const entitlements = new EntitlementRepository(database.pool);
  const entitlement = await entitlements.current(ownerRef, admittedAt);
  await withClient((client) => entitlements.recordRunChargeScope(client, {
    runId, ownerRef, planId: entitlement.planId, entitlementEventId: entitlement.eventId, admittedAt
  }));
}

async function chargeAt(runId: string, micros: number, recordedAt: Date, source: "RUN" | "STORY" = "RUN"): Promise<void> {
  await database.pool.query(
    `INSERT INTO ledger.model_spend
       (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens, recorded_at)
     VALUES ($1,$2,$3,'provider-1',$4::date,$5,1,1,$6)`,
    [randomUUID(), source, runId, recordedAt.toISOString().slice(0, 10), micros, recordedAt]
  );
}

const CLASS = Object.freeze({ planTier: "free" as const, compositionBudgetTier: "low" as const, makerCount: 2, depth: 1 });

function roomWith(overrides: Partial<AskRoomOptions>): AskRoom {
  return new AskRoom({
    lockPool: database.pool,
    spend: new PostgresModelSpendStore(database.pool),
    line: new RunWaitRepository(database.pool),
    estimator: { estimateMicros: async () => 1_000 },
    personAllowance: { read: async () => [] },
    entitlements: null,
    dailyCeilingMicros: 10_000_000,
    closeBasisPoints: 9_500,
    waitingLinePerPerson: 1,
    ...overrides
  });
}

describe("B6a a person's spend and holds, through billing.run_charge_scope", () => {
  it("counts the person's RUN and STORY charges inside [from, to) only", async () => {
    const owner = await activeOwner();
    const stranger = await activeOwner();
    const from = new Date("2031-06-01T09:00:00.000Z");
    const to = new Date("2031-06-02T09:00:00.000Z");
    const mine = await ownedRun(owner);
    await pin(mine, owner, new Date(from.getTime() - 3_600_000));
    await chargeAt(mine, 1, new Date(from.getTime() - 1));
    await chargeAt(mine, 10, from);
    await chargeAt(mine, 20, new Date(to.getTime() - 1), "STORY");
    await chargeAt(mine, 40, to);
    const theirs = await ownedRun(stranger);
    await pin(theirs, stranger, from);
    await chargeAt(theirs, 1_000, from);
    const unpinned = await ownedRun(owner);
    await chargeAt(unpinned, 5_000, from);
    expect(await new PostgresModelSpendStore(database.pool).readOwnerSpentMicros(owner, from, to)).toBe(30);
  });

  it("counts only the person's own live holds, less what each has spent", async () => {
    const owner = await activeOwner();
    const stranger = await activeOwner();
    const store = new PostgresModelSpendStore(database.pool);
    const work = new WorkItemRepository(database.pool);
    const live = await ownedRun(owner);
    await pin(live, owner, new Date());
    await work.enqueue({ runId: live, batteryRowId: "Q1", commandKey: `S00:${live}:Q1`, nodeSet: [] });
    await withClient((client) => store.openHold(client, { runId: live, heldMicros: 500 }));
    await chargeAt(live, 30, new Date());
    const finished = await ownedRun(owner);
    await pin(finished, owner, new Date());
    const finishedJob = await work.enqueue({ runId: finished, batteryRowId: "Q1", commandKey: `S00:${finished}:Q1`, nodeSet: [] });
    await withClient((client) => store.openHold(client, { runId: finished, heldMicros: 300 }));
    await work.settle({ workItemId: finishedJob, attemptId: randomUUID(), artifactRef: randomUUID() });
    const theirs = await ownedRun(stranger);
    await pin(theirs, stranger, new Date());
    await work.enqueue({ runId: theirs, batteryRowId: "Q1", commandKey: `S00:${theirs}:Q1`, nodeSet: [] });
    await withClient((client) => store.openHold(client, { runId: theirs, heldMicros: 999 }));
    expect(await store.readOwnerCountedHoldsMicros(owner)).toBe(470);
  });
});

/** One ask decided and applied as B6b applies it: the place in line (WAIT), or the hold then the first job (START). */
async function decideAndApply(room: AskRoom, access: Readonly<{ ownerRef: string | null; legacyAskerId: string | null }>) {
  return room.decide({ access, settingsClass: CLASS }, async ({ admission, estimateMicros, now, tx }) => {
    const runId = access.ownerRef === null ? await legacyRun(access.legacyAskerId ?? undefined) : await ownedRun(access.ownerRef);
    if (admission.kind === "WAIT") {
      await room.enterWait(tx, runId, now);
      return "WAIT";
    }
    // B6b's order: the hold (and charge scope), then the first job on the SAME transaction, last.
    await room.openStart(tx, { runId, access, heldMicros: estimateMicros, now });
    await new WorkItemRepository(database.pool).enqueueOn(tx, {
      runId, batteryRowId: "Q1", commandKey: `S00:${runId}:Q1`, nodeSet: []
    });
    return "START";
  });
}

describe("B6a two concurrent asks under one lock (budget spec §2.14, paid-plans spec §2.8)", () => {
  it("admits exactly one of two SIMULTANEOUS asks into a day that holds one debate", async () => {
    const room = roomWith({ dailyCeilingMicros: 1_000, clock: () => new Date("2031-07-01T10:00:00.000Z") });
    const outcomes = await Promise.all([
      decideAndApply(room, { ownerRef: null, legacyAskerId: `site:${randomUUID()}` }),
      decideAndApply(room, { ownerRef: null, legacyAskerId: `site:${randomUUID()}` })
    ]);
    expect([...outcomes].sort()).toEqual(["START", "WAIT"]);
  });

  it("admits exactly one of two SIMULTANEOUS asks by one person whose month holds one debate", async () => {
    const owner = await activeOwner();
    const now = new Date("2031-07-02T10:00:00.000Z");
    const month: PersonWindow = Object.freeze({
      scope: "PERSON_MONTH", limitMicros: 1_000,
      periodStart: new Date("2031-06-15T00:00:00.000Z"), resetsAt: new Date("2031-07-15T00:00:00.000Z"),
      finishBasisPoints: 11_000, closeBasisPoints: 9_500
    });
    const room = roomWith({
      clock: () => now,
      personAllowance: { read: async (ownerRef) => ownerRef === owner ? [month] : [] },
      entitlements: new EntitlementRepository(database.pool)
    });
    const outcomes = await Promise.all([
      decideAndApply(room, { ownerRef: owner, legacyAskerId: null }),
      decideAndApply(room, { ownerRef: owner, legacyAskerId: null })
    ]);
    expect([...outcomes].sort()).toEqual(["START", "WAIT"]);
    expect((await new RunWaitRepository(database.pool).waitingForOwner(owner))).toHaveLength(1);
    expect(await new PostgresModelSpendStore(database.pool).readOwnerCountedHoldsMicros(owner)).toBe(1_000);
  });
});

/** A waiting run with a recorded reason, as B6b's WAIT leaves it (owned when `ownerRef` is given). */
async function waitingWith(ownerRef: string | null, reason: WaitReason, at: Date): Promise<string> {
  const runId = ownerRef === null ? await legacyRun() : await ownedRun(ownerRef);
  const line = new RunWaitRepository(database.pool);
  await withClient(async (client) => {
    await line.enterWait(client, runId, at);
    await line.recordReason(client, runId, { ...reason, at });
  });
  return runId;
}

/** `count` owners whose own month is full, each with one waiting question (A5: FULL waits, up to a month). */
async function personBlockedRuns(count: number, at: Date): Promise<void> {
  const recheck = new Date(at.getTime() + 20 * 24 * 3_600_000);
  for (let index = 0; index < count; index += 1) {
    await waitingWith(await activeOwner(), { waitsFor: "PERSON", personRecheckAt: recheck }, at);
  }
}

/** The pool the room reads through, counting every statement it sends. */
function countingPool(pool: Pool): Readonly<{ pool: Pool; count: () => number }> {
  let statements = 0;
  const counted = new Proxy(pool, {
    get(target, key, receiver) {
      if (key === "query") {
        return (...args: unknown[]) => {
          statements += 1;
          return (target.query as (...values: unknown[]) => unknown).apply(target, args);
        };
      }
      const value: unknown = Reflect.get(target, key, receiver);
      return typeof value === "function" ? (value as (...values: unknown[]) => unknown).bind(target) : value;
    }
  });
  return Object.freeze({ pool: counted, count: () => statements });
}

describe("B6a the line holds a new question back only for the site (budget spec §2.3 rule 1)", () => {
  it("answers from each run's latest reason: a still-full PERSON holds nobody back; SITE, a passed recheck and an unmeasured plan change do", async () => {
    const line = new RunWaitRepository(database.pool);
    const at = new Date("2031-05-01T10:00:00.000Z");
    const owner = await activeOwner();
    const run = await waitingWith(owner, { waitsFor: "PERSON", personRecheckAt: new Date("2031-05-02T10:00:00.000Z") }, at);
    expect(await line.siteLineBlocking(at)).toBe(false);
    // Past its recheck instant, the run holds the line until the waker measures it again.
    expect(await line.siteLineBlocking(new Date("2031-05-02T10:00:00.000Z"))).toBe(true);

    // An entitlement event the run was not measured with holds the line once it is in force.
    const subscribedAt = new Date("2031-05-01T10:30:00.000Z");
    await withClient((client) => new EntitlementRepository(database.pool).append(client, {
      ownerRef: owner, planId: "PLUS", periodAnchorAt: subscribedAt, cause: "SUBSCRIBED", effectiveAt: subscribedAt,
      subscriptionId: randomUUID(), paidThrough: new Date("2031-06-01T10:30:00.000Z")
    }));
    expect(await line.siteLineBlocking(new Date("2031-05-01T10:20:00.000Z"))).toBe(false);
    expect(await line.siteLineBlocking(new Date("2031-05-01T10:31:00.000Z"))).toBe(true);
    // Measured again with it (the waker's re-record), and still full: nobody is held back.
    await withClient((client) => line.recordReason(client, run, {
      waitsFor: "PERSON", personRecheckAt: new Date("2031-05-20T10:30:00.000Z"), at: new Date("2031-05-01T10:32:00.000Z")
    }));
    expect(await line.siteLineBlocking(new Date("2031-05-01T10:33:00.000Z"))).toBe(false);

    // A run that waits for the site holds everyone back; so does one with no reason yet (the careful side).
    const legacy = await legacyRun();
    await withClient((client) => line.enterWait(client, legacy, at));
    expect(await line.siteLineBlocking(new Date("2031-05-01T10:33:00.000Z"))).toBe(true);
  });

  it("STARTs a question behind 201 runs whose own persons are full, and decides it in as many statements as behind one", async () => {
    const at = new Date("2031-05-10T10:00:00.000Z");
    const counted = countingPool(database.pool);
    const room = roomWith({
      clock: () => at,
      spend: new PostgresModelSpendStore(counted.pool),
      line: new RunWaitRepository(counted.pool)
    });
    const legacyAsker = () => ({ ownerRef: null, legacyAskerId: `behind:${randomUUID()}` });
    await personBlockedRuns(1, at);
    const beforeOne = counted.count();
    expect(await decideAndApply(room, legacyAsker())).toBe("START");
    const behindOne = counted.count() - beforeOne;
    await personBlockedRuns(200, at);
    const beforeMany = counted.count();
    expect(await decideAndApply(room, legacyAsker())).toBe("START");
    expect(counted.count() - beforeMany).toBe(behindOne);
    // An owner whose windows are not full STARTs behind them too.
    expect(await decideAndApply(room, { ownerRef: await activeOwner(), legacyAskerId: null })).toBe("START");
  }, 180_000);

  it("records a genuine wait by the rule that decided it, and a legacy question STARTs behind it", async () => {
    const owner = await activeOwner();
    const now = new Date("2031-05-15T10:00:00.000Z");
    const month: PersonWindow = Object.freeze({
      scope: "PERSON_MONTH", limitMicros: 1_000,
      periodStart: new Date("2031-05-01T00:00:00.000Z"), resetsAt: new Date("2031-06-01T00:00:00.000Z"),
      finishBasisPoints: 11_000, closeBasisPoints: 9_500
    });
    const spentRun = await ownedRun(owner);
    await pin(spentRun, owner, new Date("2031-05-15T09:00:00.000Z"));
    await chargeAt(spentRun, 1_000, new Date("2031-05-15T09:30:00.000Z"));
    const room = roomWith({
      clock: () => now,
      personAllowance: { read: async (ownerRef) => ownerRef === owner ? [month] : [] },
      entitlements: new EntitlementRepository(database.pool)
    });
    expect(await decideAndApply(room, { ownerRef: owner, legacyAskerId: null })).toBe("WAIT");
    const [waiting] = await new RunWaitRepository(database.pool).waitingForOwner(owner);
    expect(await new RunWaitRepository(database.pool).readWaiting(waiting!.runId)).toMatchObject({
      waitsFor: "PERSON", personRecheckAt: month.resetsAt, reasonAt: now
    });
    expect(await decideAndApply(room, { ownerRef: null, legacyAskerId: `behind:${randomUUID()}` })).toBe("START");
  });
});
