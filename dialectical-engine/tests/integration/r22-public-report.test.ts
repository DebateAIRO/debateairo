// R22 path 9, split out of tests/integration/r22-end-to-end.test.ts (owner, 3 Nov 2026): a stranger's report on a public
// debate, against the REAL API of tests/support/r22-world.ts, sending what the page sends (lib/v4/publicPage.ts's
// pressPublicReport) over real HTTP, on the product's own logins like the other eleven paths. Until upload check Task 9 this
// step met a product fault there (the seal under the author's run answered 500 PRIVATE_CONTENT_ERASED), so this file sat
// alone on tests/support/master-key-files.txt; the seal now runs as cross-account reader X29 (apps/api/src/public-tree.ts).
// No vendor is contacted; all data is made up. Integration suites are skipped by the CI gate: run this file by hand, alone.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pressPublicReport } from "../../apps/ui/lib/v4/publicPage.js";
import { ask, FREE, panelAgrees, v4Catalog } from "../support/r22-pages.js";
import { startR22World, type R22World } from "../support/r22-world.js";

let world: R22World;
beforeAll(async () => { world = await startR22World(); }, 900_000);
afterAll(async () => { await world?.stop(); });

const spendOf = async (runId: string): Promise<number> => Number((await world.database.pool.query<{ total: string }>(
  "SELECT coalesce(sum(charge_micros),0)::text AS total FROM ledger.model_spend WHERE run_id=$1", [runId])).rows[0]!.total);
const listedRef = async (question: string): Promise<string | undefined> => (await world.stranger.readPublicDebates(50, 0) as unknown as {
  items: { public_ref: string; question: string }[] }).items.find((item) => item.question === question)?.public_ref;

describe("R22 on the real API: a stranger's report", () => {
  it("path 9: a report by a stranger on a public debate", async () => {
    world.setScript(panelAgrees);
    // A Free debate made public after the AI check (r22-end-to-end's path 2), and a signed-in stranger.
    const author = await world.account("bea");
    const stranger = await world.account("dan");
    const question = "Should Harbour Town open a winter market?";
    const started = await ask(author, question, { settings: FREE, publicLane: { freePublicNotice: true } });
    await world.settle();
    const publicRef = await listedRef(question);
    expect(publicRef).toBeDefined();
    const before = await spendOf(started.id);
    const press = await pressPublicReport(publicRef!, { catalog: v4Catalog, room: null, locale: "en" }, stranger.client);
    expect(press.kind).toBe("WRITING");
    await world.settle();
    const page = await world.stranger.readPublicDebate(publicRef!);
    const sources = (await world.database.pool.query<{ spend_source: string }>("SELECT DISTINCT spend_source FROM ledger.model_spend WHERE run_id=$1", [started.id])).rows.map((row) => row.spend_source);
    expect(sources).toContain("PUBLIC_REPORT");
    expect(page.reports?.length).toBe(1);
    console.info(`SEEN 9: report version ${String(page.reports![0]!.report_version)} on the public page under ${page.reports![0]!.writer!}; ${String(await spendOf(started.id) - before)} micros booked on the carrier as PUBLIC_REPORT, charged to the writer (tests/integration/public-tree-flow.test.ts holds who pays)`);
  }, 300_000);
});
