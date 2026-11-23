import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parsePreviewProviderTestConfig } from "@debateai/providers";
import { OUTBOUND_MAIL_POLICY_DEPLOYMENT_REGISTER_ROW, OUTBOUND_MAIL_POLICY_ROW_KEY } from "@debateai/register";
import { startBillingStack, type BillingPerson, type BillingStack } from "../support/billingStack.js";
import { importHistoricalRegisterFixture, registerFixtureRow } from "../support/registerFixtures.js";

/**
 * The SQL of the owner's runbook's part 6b (deploy/preview-auth-dev/v1/MAIN-SITE.md), run on real PostgreSQL: the
 * runbook's own lines build each query in bash (psql stood in for by a printer), and the queries run on the fake billing
 * stack's database under everyone-with-listed-buyers. OPENCHECK counts the open sandbox plans and the unfinished payment
 * pages of accounts not on the list, and the checkouts and upgrades started since the opening by accounts never on it;
 * BUYERS finds the account's user and says whether a removed account still holds a plan; OPENCHECK reads the day's mail
 * against the outbound mail limit. A purchase the buyer rule should have refused is made here by putting an account on
 * the list for one request, as a failure of the rule would.
 */
const RUNBOOK = readFileSync(resolve(import.meta.dirname, "../../deploy/preview-auth-dev/v1/MAIN-SITE.md"), "utf8");
const PREVIEW = parsePreviewProviderTestConfig(JSON.stringify({
  deployment: "v3-preview", free_model_ids: ["zai-org/GLM-5.3-Flash"], requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "fixture"
}))!;

/** The lines of one step of the runbook. */
function stepLines(step: string): string[] {
  const at = RUNBOOK.indexOf(`\n# ${step}: `);
  const start = RUNBOOK.lastIndexOf("```sh\n", at);
  return RUNBOOK.slice(start + 6, RUNBOOK.indexOf("\n```", at)).split("\n");
}
const opencheck = stepLines("OPENCHECK");
const buyers = stepLines("BUYERS");
const lineOf = (lines: readonly string[], start: string) => {
  const found = lines.filter((line) => line.trimStart().startsWith(start));
  expect(found, start).toHaveLength(1);
  return found[0]!.trimStart();
};

/** Runs the runbook's lines in bash with `vars` set and psql stood in for by a printer; returns each query it would ask. */
function asked(lines: readonly string[], vars: Readonly<Record<string, string>>): string[] {
  const set = Object.entries(vars).map(([name, value]) => `${name}='${value.replaceAll("'", "'\\''")}'`);
  const source = ["set -euo pipefail", "psqlq() { printf '%s\\0' \"$1\" >> \"$QFILE\"; echo 0; }", ...set, ...lines, 'cat "$QFILE"'].join("\n");
  const out = execFileSync("bash", ["-c", `QFILE=$(mktemp); trap 'rm -f "$QFILE"' EXIT\n${source}\n`], { encoding: "utf8" });
  return out.split("\0").filter(Boolean);
}

let stack: BillingStack;
const team: string[] = [];
let listedBuyer: BillingPerson;
let listedSubscriber: BillingPerson;
let removedSubscriber: BillingPerson;
let stranger: BillingPerson;
let nobody: BillingPerson;
let openedAt: number;

beforeAll(async () => {
  stack = await startBillingStack({ preview: { config: PREVIEW, teamUserIds: team, asksOpenTo: "everyone-with-listed-buyers" } });
  openedAt = Math.floor(Date.now() / 1000) - 5;
  listedBuyer = await stack.signUp("listed.buyer@example.test", "DE");
  listedSubscriber = await stack.signUp("listed.subscriber@example.test", "DE");
  removedSubscriber = await stack.signUp("removed.subscriber@example.test", "DE");
  stranger = await stack.signUp("stranger@example.test", "DE");
  nobody = await stack.signUp("nobody@example.test", "DE");
  team.push(listedBuyer.userId, listedSubscriber.userId, removedSubscriber.userId);
  await stack.subscribe(listedSubscriber, "PLUS", "DE");
  await stack.subscribe(removedSubscriber, "PLUS", "DE");
  team.splice(team.indexOf(removedSubscriber.userId), 1);
  // A listed account leaves NETOPIA's page unfinished.
  const quote = await stack.quote(listedBuyer, "PLUS");
  expect((await stack.checkout(listedBuyer, String(quote.body.quote_ref))).status).toBe(200);
}, 600_000);
afterAll(async () => { await stack?.stop(); });

/** One count query of the runbook, as psql -XAt prints its single value. */
const single = async (query: string) => {
  const result = await stack.database.pool.query(query);
  expect(result.rows).toHaveLength(1);
  return String(Object.values(result.rows[0] as Record<string, unknown>)[0]);
};

/** OPENCHECK's three counts for a list now and a list of everyone listed since the opening. */
async function openCounts(now: readonly string[], ever: readonly string[]) {
  const lines = [lineOf(opencheck, "notlisted() {"), lineOf(opencheck, "PLANS=$(psqlq"), lineOf(opencheck, "PAGES=$(psqlq"), lineOf(opencheck, "SINCE=$(psqlq")];
  const queries = asked(lines, { J: JSON.stringify(now), EVER: JSON.stringify([...ever].sort()), AT: String(openedAt) });
  expect(queries).toHaveLength(3);
  const [plans, pages, since] = await Promise.all(queries.map(single));
  return { plans, pages, since };
}

describe("OPENCHECK's counts on real PostgreSQL", () => {
  it("a removed buyer's plan counts as a plan not on the list, a listed page does not count, and nothing since the opening is a stranger's", async () => {
    // The list now: the listed buyer (an unfinished page) and the listed subscriber; the removed subscriber holds a plan.
    expect(await openCounts([listedBuyer.userId, listedSubscriber.userId], [listedBuyer.userId, listedSubscriber.userId, removedSubscriber.userId]))
      .toEqual({ plans: "1", pages: "0", since: "0" });
    // Without the copies that show the removed subscriber was listed, its checkout since the opening would count.
    expect(await openCounts([listedBuyer.userId, listedSubscriber.userId], [listedBuyer.userId, listedSubscriber.userId]))
      .toEqual({ plans: "1", pages: "0", since: "1" });
    // An empty list: every plan and page is outside it.
    expect(await openCounts([], [])).toEqual({ plans: "2", pages: "1", since: "3" });
  });

  it("a checkout the buyer rule should have refused shows as an unfinished page and as a start since the opening", async () => {
    team.push(stranger.userId);
    const quote = await stack.quote(stranger, "PLUS");
    expect((await stack.checkout(stranger, String(quote.body.quote_ref))).status).toBe(200);
    team.splice(team.indexOf(stranger.userId), 1);
    expect(await openCounts([listedBuyer.userId, listedSubscriber.userId], [listedBuyer.userId, listedSubscriber.userId, removedSubscriber.userId]))
      .toEqual({ plans: "1", pages: "1", since: "1" });
  });
});

describe("BUYERS's reads on real PostgreSQL", () => {
  it("finds the account's user by its owner reference", async () => {
    const queries = asked([lineOf(buyers, "TU=$(psqlq")], { OR: removedSubscriber.ownerRef });
    expect(queries).toHaveLength(1);
    expect(await single(queries[0]!)).toBe(removedSubscriber.userId);
  });

  it("says whether a removed account still holds a sandbox plan or an unfinished payment page", async () => {
    const held = async (person: BillingPerson) => {
      const queries = asked([lineOf(buyers, "H=$(psqlq")], { OR: person.ownerRef });
      expect(queries).toHaveLength(1);
      return Number(await single(queries[0]!));
    };
    expect(await held(removedSubscriber)).toBeGreaterThan(0);
    expect(await held(listedBuyer)).toBeGreaterThan(0);
    expect(await held(nobody)).toBe(0);
  });
});

describe("OPENCHECK's mail line on real PostgreSQL", () => {
  it("reads yesterday's and today's mail against daily_limit at the API's register version", async () => {
    await importHistoricalRegisterFixture(stack.database.pool, 1, [
      registerFixtureRow(OUTBOUND_MAIL_POLICY_ROW_KEY, OUTBOUND_MAIL_POLICY_DEPLOYMENT_REGISTER_ROW.value, "test:main-site-open-check")
    ]);
    const before = await stack.database.pool.query<{ n: number }>("SELECT total_sent AS n FROM identity.outbound_mail_today()");
    await stack.database.pool.query("SELECT * FROM identity.reserve_outbound_mail('standard', 100000)");
    const queries = asked([lineOf(opencheck, "if printf '%s\\n' \"$RV\" | grep -qxE '[1-9][0-9]*'; then ML=$(psqlq")], { RV: "1", ML: "" });
    expect(queries).toHaveLength(1);
    const rows = (await stack.database.pool.query(queries[0]!)).rows.map((row) => String(Object.values(row as Record<string, unknown>)[0]));
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row).toMatch(/^\d{4}-\d{2}-\d{2} \d+ \d+ (true|false) (true|false)$/u);
    const today = rows[1]!.split(" ");
    expect(Number(today[1])).toBe(Number(before.rows[0]!.n) + 1);
    expect(today[3]).toBe("false");
  });
});

