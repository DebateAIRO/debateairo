// V4 start step, Task 56b (item public-f25; owner answer Q20 B: "Only a debate's very first report uses the kept reserve: if a visitor
// wrote the first report, the owner's own report waits for the next month"), against the REAL API of tests/support/r22-world.ts (the
// room, the plan windows and the public lane as apps/api/src/main.ts composes them, on the product's own logins) and the REAL runner
// that writes and charges a public report. A Free person whose month a made-up charge has used up presses "Write my report" on their
// own public debate: the debate's first report goes ahead and is charged to them as a public report is; their second press waits for
// the reset. A debate a visitor already reported on: the owner's first press waits for the reset too, and opens nothing. No vendor is
// contacted; all data and figures are made up. Integration suites are skipped by the CI gate: run this file by hand, alone.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresModelSpendStore } from "@debateai/budget";
import { PostgresPublicDebateRunnerRepository } from "@debateai/db";
import { ask, FREE, panelAgrees } from "../support/r22-pages.js";
import { startR22World, type R22Account, type R22World } from "../support/r22-world.js";

let world: R22World;
beforeAll(async () => { world = await startR22World(); }, 900_000);
afterAll(async () => { await world?.stop(); });

/** The made-up Free credit of tests/support/hostedRegisterRows.ts (multiples of eleven): one charge this size uses the month up. */
const FREE_MONTH_MICROS = 440_000;
const WAITS = { error: "PUBLIC_DEBATE_WAITS_FOR_RESET", message: "PUBLIC_DEBATE_WAITS_FOR_RESET" };

const listedRef = async (question: string): Promise<string | undefined> => (await world.stranger.readPublicDebates(50, 0) as unknown as {
  items: { public_ref: string; question: string }[] }).items.find((item) => item.question === question)?.public_ref;
const spendOf = async (runId: string, source: string): Promise<number> => Number((await world.database.pool.query<{ total: string }>(
  "SELECT coalesce(sum(charge_micros),0)::text AS total FROM ledger.model_spend WHERE run_id=$1 AND spend_source=$2", [runId, source])).rows[0]!.total);
const reportRows = async (publicationRef: string) => (await world.database.pool.query<{ writer_ref: string; report_version: number; outcome: string | null }>(
  "SELECT writer_ref, report_version, outcome FROM identity.public_report WHERE publication_ref=$1 ORDER BY report_version", [publicationRef])).rows;

/** A press as the page sends it (the session cookies and the CSRF header), with its status. */
async function post(who: R22Account, path: string): Promise<Readonly<{ status: number; body: unknown }>> {
  const response = await who.send(`${world.base}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": who.identity.rawCsrfToken }, body: "{}" });
  return { status: response.status, body: await response.json() as unknown };
}
const writeMyReport = (who: R22Account, runId: string) => post(who, `/v1/runs/${runId}/report`);

/** The month used up after the debate finished: one made-up charge on the person's own debate, the whole Free credit. */
async function useUpMonth(who: R22Account, runId: string): Promise<void> {
  await world.database.pool.query(`INSERT INTO ledger.model_spend (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens, spend_phase, recorded_at)
    VALUES ($1,'RUN',$2,'provider-1',(now() AT TIME ZONE 'UTC')::date,$3,1,1,'BODY',now())`, [randomUUID(), runId, FREE_MONTH_MICROS]);
  const room = await who.client.getAskRoom({ plan_tier: "free", composition_budget_tier: "low", depth: 1 }) as unknown as { new_starts?: string };
  expect(room.new_starts).toBe("BLOCKED_UNTIL_RESET");
}

describe("Task 56b on the real API: the person's first report of their own public debate uses the kept reserve when it is the debate's first", () => {
  it("first report: written and charged to the person; a second press waits; after a visitor's report the owner's first press waits", async () => {
    world.setScript(panelAgrees);
    const ana = await world.account("ana");
    const bea = await world.account("bea");
    const dan = await world.account("dan");
    // Two Free debates, each made public after the AI check (r22-end-to-end's path 2).
    const anaQuestion = "Should Harbour Town light the harbour path at night?";
    const beaQuestion = "Should Harbour Town move the fish market indoors?";
    const anaDebate = await ask(ana, anaQuestion, { settings: FREE, publicLane: { freePublicNotice: true } });
    const beaDebate = await ask(bea, beaQuestion, { settings: FREE, publicLane: { freePublicNotice: true } });
    await world.settle();
    const anaRef = await listedRef(anaQuestion);
    const beaRef = await listedRef(beaQuestion);
    expect(anaRef).toBeDefined();
    expect(beaRef).toBeDefined();

    // A visitor writes the first report of Bea's debate, inside their own quota.
    const visit = await post(dan, `/v1/public/debates/${beaRef!}/report`);
    expect(visit).toEqual({ status: 202, body: { state: "WRITING", report_version: 1 } });
    await world.settle();
    expect(await reportRows(beaRef!)).toEqual([{ writer_ref: dan.ownerRef, report_version: 1, outcome: "READY" }]);

    // Both owners' months used up: new starts wait for the reset.
    await useUpMonth(ana, anaDebate.id);
    await useUpMonth(bea, beaDebate.id);

    // Ana's debate has no report yet: her first press goes ahead as its public report.
    expect.soft((await ana.client.readInvestigation(anaDebate.id)).first_closing_left).toBe(true);
    const from = new Date(Date.now() - 3_600_000);
    const to = new Date(Date.now() + 3_600_000);
    const reportCharges = new PostgresPublicDebateRunnerRepository(world.runnerPool);
    const chargedBefore = await reportCharges.readReportSpent(ana.ownerRef, from, to);
    const windows = new PostgresModelSpendStore(world.runnerPool);
    const windowBefore = await windows.readOwnerSpentMicros(ana.ownerRef, from, to);
    const first = await writeMyReport(ana, anaDebate.id);
    expect(first).toEqual({ status: 202, body: { state: "WRITING", report_version: 1, waiting_for_digs: 0 } });
    expect(await reportRows(anaRef!)).toEqual([{ writer_ref: ana.ownerRef, report_version: 1, outcome: null }]);
    await world.settle();
    expect(await reportRows(anaRef!)).toEqual([{ writer_ref: ana.ownerRef, report_version: 1, outcome: "READY" }]);
    // Charged as a public report is: on the carrier (her debate) under PUBLIC_REPORT, attributed to her as its writer.
    const booked = await spendOf(anaDebate.id, "PUBLIC_REPORT");
    expect(booked).toBeGreaterThan(0);
    expect(await reportCharges.readReportSpent(ana.ownerRef, from, to) - chargedBefore).toBe(booked);
    // Her own window counts it as it counts any public report she writes (plan risk 21): the kept reserve paid for it, past the wall.
    expect(await windows.readOwnerSpentMicros(ana.ownerRef, from, to) - windowBefore).toBe(booked);
    expect((await world.stranger.readPublicDebate(anaRef!)).reports?.map((report) => report.report_version)).toEqual([1]);
    expect.soft((await ana.client.readInvestigation(anaDebate.id)).first_closing_left).toBe(false);

    // Her second press is a further report: it waits for the reset, and nothing opens.
    const second = await writeMyReport(ana, anaDebate.id);
    expect(second).toEqual({ status: 409, body: WAITS });
    expect(await reportRows(anaRef!)).toHaveLength(1);

    // Bea's debate already has a visitor's report: her own first press is a further report, so it waits too (answer Q20).
    expect.soft((await bea.client.readInvestigation(beaDebate.id)).first_closing_left).toBe(false);
    const refused = await writeMyReport(bea, beaDebate.id);
    expect(refused).toEqual({ status: 409, body: WAITS });
    expect((await reportRows(beaRef!)).filter((row) => row.writer_ref === bea.ownerRef)).toEqual([]);
    console.info(`SEEN 56b: Ana's first report written while her month waited, ${String(booked)} micros booked as PUBLIC_REPORT and charged to her; her second press 409; Bea's first press after a visitor's report 409, no row`);
  }, 600_000);
});
