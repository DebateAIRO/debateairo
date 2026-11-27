import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parsePreviewProviderTestConfig } from "@debateai/providers";
import { OUTBOUND_MAIL_POLICY_DEPLOYMENT_REGISTER_ROW, OUTBOUND_MAIL_POLICY_ROW_KEY } from "@debateai/register";
import { startBillingStack, type BillingPerson, type BillingStack } from "../support/billingStack.js";
import { previewBuyerOwner } from "../support/previewBuyerOwner.js";
import { importHistoricalRegisterFixture, registerFixtureRow } from "../support/registerFixtures.js";

/**
 * The SQL of the owner's runbook's part 6b (deploy/preview-auth-dev/v1/MAIN-SITE.md), run on real PostgreSQL: the
 * runbook's own lines build each query in bash (psql stood in for by a printer), and the queries run on the fake billing
 * stack's database under everyone-with-listed-buyers. OPENCHECK counts the open sandbox plans and the unfinished payment
 * pages of accounts not on the list, and the checkouts and upgrades started since the opening by accounts never on it;
 * BUYERS finds the account's user and says whether a removed account still holds a plan; OPENCHECK reads the day's mail
 * against the outbound mail limit. A purchase the buyer rule should have refused is made here by putting an account on
 * the list for one request, as a failure of the rule would.
 *
 * The Team page's list of approved buyers (0186) is handed to the API as main.ts hands it, and changed through its one
 * door: OPENCHECK, ASKS_OPEN, ASKS_CLOSE and CLOSED count it, OPENCHECK leaves it out of the accounts not on the list now,
 * and a start since the opening counts only when the account was on no team line since then and not on the Team page's
 * list at any moment of the two minutes before the charge. A charge of an account erased since is counted on its own.
 * OPENCHECK also counts the open sandbox plans of the accounts on the Team page's list and how many days ago the oldest
 * was bought, a reminder that each is withdrawn within 14 days of its purchase.
 *
 * OPENCHECK and BUYERS read the plans and payments of the payment system the API file names (PE: sandbox, or live with
 * real payments, MAIN-SITE.md 8.1b). A second stack runs with real payments: its live purchases count under PE=live and
 * never under PE=sandbox, and the sandbox stack's purchases never under PE=live.
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
const asksOpen = stepLines("ASKS_OPEN");
const asksClose = stepLines("ASKS_CLOSE");
const closed = stepLines("CLOSED");
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
  stack = await startBillingStack({ preview: { config: PREVIEW, teamUserIds: team, asksOpenTo: "everyone-with-listed-buyers", approvedBuyers: true } });
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
const singleOn = async (on: BillingStack, query: string) => {
  const result = await on.database.pool.query(query);
  expect(result.rows).toHaveLength(1);
  return String(Object.values(result.rows[0] as Record<string, unknown>)[0]);
};
const single = (query: string) => singleOn(stack, query);

/**
 * OPENCHECK's four counts for a team line now and every team line since the opening, on a database that holds the Team
 * page's list (LT=t, as OPENCHECK reads it): the plans and payment pages of accounts not on the list now, the starts since
 * the opening by accounts never on it, and the starts of accounts erased since.
 */
async function openCounts(now: readonly string[], ever: readonly string[], on: BillingStack = stack, PE: "sandbox" | "live" = "sandbox", at: number = openedAt) {
  const lines = [lineOf(opencheck, "notlisted() {"), lineOf(opencheck, "notapproved() {"), lineOf(opencheck, "notapprovedthen() {"),
    lineOf(opencheck, "PLANS=$(psqlq"), lineOf(opencheck, "PAGES=$(psqlq"), lineOf(opencheck, "SINCE=$(psqlq"), lineOf(opencheck, "GONE=$(psqlq")];
  const queries = asked(lines, { J: JSON.stringify(now), EVER: JSON.stringify([...ever].sort()), AT: String(at), LT: "t", PE });
  expect(queries).toHaveLength(4);
  const [plans, pages, since, gone] = await Promise.all(queries.map((query) => singleOn(on, query)));
  return { plans, pages, since, gone };
}

describe("OPENCHECK's counts on real PostgreSQL", () => {
  it("a removed buyer's plan counts as a plan not on the list, a listed page does not count, and nothing since the opening is a stranger's", async () => {
    // The list now: the listed buyer (an unfinished page) and the listed subscriber; the removed subscriber holds a plan.
    expect(await openCounts([listedBuyer.userId, listedSubscriber.userId], [listedBuyer.userId, listedSubscriber.userId, removedSubscriber.userId]))
      .toEqual({ plans: "1", pages: "0", since: "0", gone: "0" });
    // Without the copies that show the removed subscriber was listed, its checkout since the opening would count.
    expect(await openCounts([listedBuyer.userId, listedSubscriber.userId], [listedBuyer.userId, listedSubscriber.userId]))
      .toEqual({ plans: "1", pages: "0", since: "1", gone: "0" });
    // An empty list: every plan and page is outside it.
    expect(await openCounts([], [])).toEqual({ plans: "2", pages: "1", since: "3", gone: "0" });
  });

  it("a checkout the buyer rule should have refused shows as an unfinished page and as a start since the opening", async () => {
    team.push(stranger.userId);
    const quote = await stack.quote(stranger, "PLUS");
    expect((await stack.checkout(stranger, String(quote.body.quote_ref))).status).toBe(200);
    team.splice(team.indexOf(stranger.userId), 1);
    expect(await openCounts([listedBuyer.userId, listedSubscriber.userId], [listedBuyer.userId, listedSubscriber.userId, removedSubscriber.userId]))
      .toEqual({ plans: "1", pages: "1", since: "1", gone: "0" });
  });
});

describe("the Team page's list in OPENCHECK, ASKS_OPEN, ASKS_CLOSE and CLOSED on real PostgreSQL", () => {
  const TEAM_NOW = () => [listedBuyer.userId, listedSubscriber.userId];
  const TEAM_EVER = () => [listedBuyer.userId, listedSubscriber.userId, removedSubscriber.userId];
  /** A checkout the buyer rule should have refused: the account is put on the team line for this one request. */
  async function slippedThrough(person: BillingPerson): Promise<void> {
    team.push(person.userId);
    try {
      const quote = await stack.quote(person, "PLUS");
      expect((await stack.checkout(person, String(quote.body.quote_ref))).status).toBe(200);
    } finally { team.splice(team.indexOf(person.userId), 1); }
  }
  /** The one count each script asks the database: how many accounts are on the Team page's list now. */
  const onList = async (lines: readonly string[]) => {
    const found = [...lines.join("\n").matchAll(/psqlq "(SELECT count\(\*\) FROM \(SELECT DISTINCT ON \(user_id\) kind FROM staff\.preview_buyer_event[^"]*)"/gu)];
    expect(found).toHaveLength(1);
    return single(found[0]![1]!);
  };

  it("leaves out a start by an account on the list in the two minutes before it, counts one after that, and an erased account's on its own", async () => {
    const owner = previewBuyerOwner(stack.database.pool);
    const approved = await stack.signUp("approved.buyer@example.test", "DE");
    const raced = await stack.signUp("raced.buyer@example.test", "DE");
    const late = await stack.signUp("late.buyer@example.test", "DE");
    const erased = await stack.signUp("erased.buyer@example.test", "DE");
    // Allowed on the Team page: the API reads the list at the pay button and admits it. Its page stays unfinished.
    await owner.change("PREVIEW_BUYER_ADD", approved.userId);
    const quote = await stack.quote(approved, "PLUS");
    expect((await stack.checkout(approved, String(quote.body.quote_ref))).status).toBe(200);
    // Allowed, then removed, and its purchase written a moment after the removal: the pay button read the list before it.
    await owner.change("PREVIEW_BUYER_ADD", raced.userId);
    await owner.change("PREVIEW_BUYER_REMOVE", raced.userId, { locked: true });
    await slippedThrough(raced);
    // On the list from ten minutes ago to five minutes ago: a purchase now is not covered by it.
    const { staff_id: actor } = (await stack.database.pool.query<{ staff_id: string }>("SELECT staff_id::text FROM staff.owner_designation WHERE active")).rows[0]!;
    for (const [kind, ago] of [["ADDED", 10], ["REMOVED", 5]] as const) {
      await stack.database.pool.query(`INSERT INTO staff.preview_buyer_event(revision,user_id,kind,actor_staff_id,operation_id,request_sha256,alerted,recorded_at)
        SELECT COALESCE(max(revision),0)+1,$1,$2,$3,gen_random_uuid(),repeat('a',64),true,clock_timestamp() - make_interval(mins => $4) FROM staff.preview_buyer_event`,
      [late.userId, kind, actor, ago]);
    }
    await slippedThrough(late);
    // Allowed, buys and pays, then erases its account: its rows on the list go with it, its charge stays.
    await owner.change("PREVIEW_BUYER_ADD", erased.userId);
    await stack.subscribe(erased, "PLUS", "DE");
    await stack.addEmailChannel(erased);
    const stepped = await stack.post(erased, "/v1/auth/step-up", { password: "not-checked-by-the-stack", code: "000000", authorization: { action: "DELETE_ACCOUNT" } });
    const grant = (stepped.body.step_up_grant as { token: string }).token;
    expect((await stack.delete(erased, "/v1/account", { confirmation: "DELETE MY ACCOUNT", step_up_grant: grant })).status).toBe(202);
    expect(await stack.commitErasure(erased)).toBe("COMMITTED");
    await stack.runtime.erasure.sweep(100);
    await stack.runJobs();

    // Since the opening: the stranger of the test before and the late one; the raced one and the approved one are covered,
    // and the erased one is counted on its own. Not on the list now: the removed subscriber's plan; the stranger's, the
    // raced one's and the late one's payment pages, not the approved one's.
    expect(await openCounts(TEAM_NOW(), TEAM_EVER())).toEqual({ plans: "1", pages: "3", since: "2", gone: "1" });

    // How many are on the list now, the changes since the opening, and how many may buy with the team line.
    expect(await onList(opencheck)).toBe("1");
    // Since the opening: the approved one and the raced one added, the raced one removed. The late one's rows are older,
    // and the erased one's went with its account.
    const changes = asked([lineOf(opencheck, "CH=$(psqlq")], { AT: String(openedAt) });
    expect(await single(changes[0]!)).toBe("2 1");
    const mayBuy = asked([lineOf(opencheck, 'LISTED="SELECT'), lineOf(opencheck, "MB=$(psqlq")], { J: JSON.stringify(TEAM_NOW()) });
    expect(await single(mayBuy[0]!)).toBe("3");
  });

  it("ASKS_OPEN, ASKS_CLOSE and CLOSED read the same count, and an emptied list reads 0", async () => {
    const owner = previewBuyerOwner(stack.database.pool);
    for (const lines of [asksOpen, asksClose, closed]) expect(await onList(lines)).toBe("1");
    const [listed] = (await stack.database.pool.query<{ user_id: string }>(
      "SELECT user_id::text FROM identity.\"user\" u WHERE staff.preview_buyer_listed(u.user_id)")).rows;
    await owner.change("PREVIEW_BUYER_REMOVE", listed!.user_id, { locked: true });
    for (const lines of [asksOpen, asksClose, closed, opencheck]) expect(await onList(lines)).toBe("0");
    const present = asked([lineOf(opencheck, "LT=$(psqlq")], {});
    expect(await single(present[0]!)).toBe("true");
  });

  it("OPENCHECK's reminder counts the open sandbox plans of the accounts on the list now and how many days ago the oldest was bought", async () => {
    const owner = previewBuyerOwner(stack.database.pool);
    const reminder = async () => {
      const queries = asked([lineOf(opencheck, 'LISTED="SELECT'), lineOf(opencheck, "LP=''; [ -z \"$PE\" ] || LP=$(psqlq")], { PE: "sandbox" });
      expect(queries).toHaveLength(1);
      return single(queries[0]!);
    };
    // The list is empty: the removed subscriber's plan, the team line's plan and the earlier pages are not its accounts'.
    expect(await reminder()).toBe("0 0");
    const fresh = await stack.signUp("fresh.buyer@example.test", "DE");
    const older = await stack.signUp("older.buyer@example.test", "DE");
    const paging = await stack.signUp("paging.buyer@example.test", "DE");
    // Allowed on the Team page, then bought a plan today through the API.
    await owner.change("PREVIEW_BUYER_ADD", fresh.userId);
    await stack.subscribe(fresh, "PLUS", "DE");
    // Allowed, and holding a sandbox plan bought nine days ago, written as the billing log writes one.
    await owner.change("PREVIEW_BUYER_ADD", older.userId);
    await stack.database.pool.query(`INSERT INTO billing.subscription_event(event_id,subscription_id,owner_ref,kind,at,plan_id,period_anchor_at,data) VALUES
      (gen_random_uuid(),$1,$2,'CREATED',clock_timestamp() - interval '9 days 1 hour','PLUS',NULL,'{"payment_provider":"netopia","payment_environment":"sandbox","currency":"EUR"}'),
      (gen_random_uuid(),$1,$2,'ACTIVATED',clock_timestamp() - interval '9 days','PLUS',clock_timestamp() - interval '9 days','{}')`, [randomUUID(), older.ownerRef]);
    // Allowed, with only an unfinished payment page: that is not a plan.
    await owner.change("PREVIEW_BUYER_ADD", paging.userId);
    const quote = await stack.quote(paging, "PLUS");
    expect((await stack.checkout(paging, String(quote.body.quote_ref))).status).toBe(200);
    // The age counts from the purchase (the plan's activation), not from when its payment page opened.
    expect(await reminder()).toBe("2 9");
    // Taken off the list, its plan is no longer one of the list's (OPENCHECK counts it with the accounts not on the list).
    await owner.change("PREVIEW_BUYER_REMOVE", older.userId, { locked: true });
    expect(await reminder()).toBe("1 0");
    for (const person of [fresh, paging]) await owner.change("PREVIEW_BUYER_REMOVE", person.userId, { locked: true });
    expect(await reminder()).toBe("0 0");
  });

  it("OPENCHECK's grant check says whether the API's login may read the list at the pay button", async () => {
    const line = lineOf(opencheck, "[ \"$(psqlq \"SELECT has_function_privilege(");
    const grantQuery = asked(["bad() { :; }", line], {})[0]!;
    await stack.database.pool.query("CREATE ROLE debateai_prod_api_runtime NOLOGIN");
    expect(await single(grantQuery)).toBe("false");
    await stack.database.pool.query("GRANT debateai_billing_runtime TO debateai_prod_api_runtime");
    expect(await single(grantQuery)).toBe("true");
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
      const queries = asked([lineOf(buyers, "H=$(psqlq")], { OR: person.ownerRef, PE: "sandbox" });
      expect(queries).toHaveLength(1);
      return Number(await single(queries[0]!));
    };
    expect(await held(removedSubscriber)).toBeGreaterThan(0);
    expect(await held(listedBuyer)).toBeGreaterThan(0);
    expect(await held(nobody)).toBe(0);
  });
});

describe("with real payments (MAIN-SITE.md 8.1b): OPENCHECK and BUYERS read live plans and payments", () => {
  let live: BillingStack;
  const liveTeam: string[] = [];
  let teamBuyer: BillingPerson;
  let approvedBuyer: BillingPerson;
  let slipped: BillingPerson;
  let liveOpenedAt: number;
  beforeAll(async () => {
    live = await startBillingStack({ paymentEnvironment: "live", preview: { config: PREVIEW, teamUserIds: liveTeam, asksOpenTo: "everyone-with-listed-buyers", approvedBuyers: true } });
    liveOpenedAt = Math.floor(Date.now() / 1000) - 5;
    teamBuyer = await live.signUp("live.team@example.test", "DE");
    approvedBuyer = await live.signUp("live.approved@example.test", "DE");
    slipped = await live.signUp("live.slipped@example.test", "DE");
    liveTeam.push(teamBuyer.userId);
    // The team account buys and pays; the account the Owner approves buys and pays; a third account's checkout gets past
    // the rule (put on the team line for this one request, as a failure of the rule would) and stays unfinished.
    await live.subscribe(teamBuyer, "PLUS", "DE");
    await previewBuyerOwner(live.database.pool).change("PREVIEW_BUYER_ADD", approvedBuyer.userId);
    await live.subscribe(approvedBuyer, "PLUS", "DE");
    liveTeam.push(slipped.userId);
    try {
      const quote = await live.quote(slipped, "PLUS");
      const checkout = await live.checkout(slipped, String(quote.body.quote_ref));
      expect([checkout.status, checkout.body.environment]).toEqual([200, "live"]);
    } finally { liveTeam.splice(liveTeam.indexOf(slipped.userId), 1); }
  }, 600_000);
  afterAll(async () => { await live?.stop(); });

  it("counts the start that got past the rule under PE=live, and nothing of the live stack under PE=sandbox", async () => {
    expect(await openCounts([teamBuyer.userId], [teamBuyer.userId], live, "live", liveOpenedAt)).toEqual({ plans: "0", pages: "1", since: "1", gone: "0" });
    expect(await openCounts([teamBuyer.userId], [teamBuyer.userId], live, "sandbox", liveOpenedAt)).toEqual({ plans: "0", pages: "0", since: "0", gone: "0" });
    // An empty team line: the team account's live plan and the unfinished page are outside the list, and so are their
    // starts; the approved account, still on the Team page's list, is not.
    expect(await openCounts([], [], live, "live", liveOpenedAt)).toEqual({ plans: "1", pages: "1", since: "2", gone: "0" });
  });

  it("the sandbox stack's purchases never count under PE=live", async () => {
    expect(await openCounts([], [], stack, "live")).toEqual({ plans: "0", pages: "0", since: "0", gone: "0" });
  });

  it("counts the live plans of the accounts on the Team page's list", async () => {
    const queries = asked([lineOf(opencheck, 'LISTED="SELECT'), lineOf(opencheck, "LP=''; [ -z \"$PE\" ] || LP=$(psqlq")], { PE: "live" });
    expect(queries).toHaveLength(1);
    expect((await singleOn(live, queries[0]!)).split(" ")[0]).toBe("1");
  });

  it("BUYERS says whether a removed account still holds a live plan or an unfinished payment page", async () => {
    const held = async (person: BillingPerson, PE: "sandbox" | "live") => {
      const queries = asked([lineOf(buyers, "H=$(psqlq")], { OR: person.ownerRef, PE });
      expect(queries).toHaveLength(1);
      return Number(await singleOn(live, queries[0]!));
    };
    expect(await held(approvedBuyer, "live")).toBeGreaterThan(0);
    expect(await held(slipped, "live")).toBeGreaterThan(0);
    expect(await held(approvedBuyer, "sandbox")).toBe(0);
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

