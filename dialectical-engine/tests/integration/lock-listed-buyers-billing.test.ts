import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parsePreviewProviderTestConfig, type PreviewAsksOpenTo } from "@debateai/providers";
import { startBillingStack, type BillingPerson, type BillingStack, type HttpAnswer } from "../support/billingStack.js";
import { previewBuyerOwner } from "../support/previewBuyerOwner.js";

/**
 * The preview's buyer rule on NETOPIA's sandbox, on the fake stack (the real billing routes, runtime and jobs over
 * embedded Postgres and the NETOPIA protocol fake), with the API's options as main.ts hands them: the preview
 * configuration, the team line, and with a value of PREVIEW_ASKS_OPEN_TO the open flag and the value. Under
 * everyone-with-listed-buyers any signed-in account may ask, and under the team rule only the team; under both, only an
 * account on the team line may start a purchase. An account not on it gets every price as before, and is refused 403
 * PREVIEW_TEAM_ONLY at the checkout and at the upgrade with nothing written: no charge, no payment page, no subscription
 * event, no job and no NETOPIA request. A listed account buys and upgrades as before.
 *
 * The Owner's list of approved buyers (0186) is handed as main.ts hands it. Under everyone-with-listed-buyers an account
 * the Owner approved through the list's door buys like a team account, and is refused again once removed; under the team
 * rule the list counts for nothing. A list that cannot be read refuses an account not on the team line 503
 * PREVIEW_BUYERS_UNAVAILABLE with nothing written, and is never read for a team account.
 *
 * Each mode has its own stack; inside one, the cases share it, so their order matters only through the counts each one
 * takes before and after itself.
 */
const PREVIEW = parsePreviewProviderTestConfig(JSON.stringify({
  deployment: "v3-preview", free_model_ids: ["zai-org/GLM-5.3-Flash"], requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "fixture"
}))!;

type Counts = Readonly<Record<"charges" | "chargeEvents" | "hostedPayments" | "quotes" | "subscriptionEvents" | "outbox" | "netopiaRequests", number>>;
/** Every count but the quotes: a price request writes its quote, and nothing else may move. */
const withoutQuotes = ({ quotes: _quotes, ...rest }: Counts) => rest;
const refusedAsBuyer = (answer: HttpAnswer) =>
  expect({ status: answer.status, error: answer.body.error }).toEqual({ status: 403, error: "PREVIEW_TEAM_ONLY" });
const refusedUnreadable = (answer: HttpAnswer) =>
  expect({ status: answer.status, error: answer.body.error }).toEqual({ status: 503, error: "PREVIEW_BUYERS_UNAVAILABLE" });

const MODES: ReadonlyArray<readonly [string, PreviewAsksOpenTo | undefined]> = [
  ["everyone-with-listed-buyers", "everyone-with-listed-buyers"],
  ["the team rule (no value)", undefined]
];

describe.each(MODES)("%s on the sandbox: only the team line may buy", (_name, asksOpenTo) => {
  /** The team line as the API read it at start; filled once the people below exist. */
  const team: string[] = [];
  let stack: BillingStack;
  let listedBuyer: BillingPerson;
  let stranger: BillingPerson;
  let listedSubscriber: BillingPerson;
  /** Bought a plan while listed, then taken off the line (the API restarted on the shorter one). */
  let removedSubscriber: BillingPerson;
  /** Not on the team line: the Owner allows it to buy on the Team page (0186). */
  let approved: BillingPerson;
  /** On the team line, with no checkout of its own yet. */
  let teamBuyer: BillingPerson;
  let owner: ReturnType<typeof previewBuyerOwner>;
  const listCounts = asksOpenTo === "everyone-with-listed-buyers";

  async function counts(): Promise<Counts> {
    const count = async (table: string): Promise<number> =>
      Number((await stack.database.pool.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table}`)).rows[0]!.n);
    return Object.freeze({
      charges: await count("billing.charge"), chargeEvents: await count("billing.charge_event"),
      hostedPayments: await count("billing.hosted_payment"), quotes: await count("billing.quote"),
      subscriptionEvents: await count("billing.subscription_event"), outbox: await count("billing.outbox"),
      netopiaRequests: stack.netopia.lastRequests.length
    });
  }
  const upgradeBody = (quoteRef: string) => ({ plan_id: "PRO", quote_ref: quoteRef, locale: "en", renewal_terms: stack.consents("en").renewal_terms });

  beforeAll(async () => {
    stack = await startBillingStack({ preview: { config: PREVIEW, teamUserIds: team, approvedBuyers: true, ...(asksOpenTo === undefined ? {} : { asksOpenTo }) } });
    owner = previewBuyerOwner(stack.database.pool);
    listedBuyer = await stack.signUp("listed.buyer@example.test", "DE");
    stranger = await stack.signUp("not.listed@example.test", "DE");
    listedSubscriber = await stack.signUp("listed.subscriber@example.test", "DE");
    removedSubscriber = await stack.signUp("removed.subscriber@example.test", "DE");
    approved = await stack.signUp("approved.buyer@example.test", "DE");
    teamBuyer = await stack.signUp("team.buyer@example.test", "DE");
    team.push(listedBuyer.userId, listedSubscriber.userId, removedSubscriber.userId, teamBuyer.userId);
    await stack.subscribe(listedSubscriber, "PLUS", "DE");
    await stack.subscribe(removedSubscriber, "PLUS", "DE");
    team.splice(team.indexOf(removedSubscriber.userId), 1);
  }, 600_000);
  afterAll(async () => { await stack?.stop(); });

  it("an account not on the team line gets its price as before, and its checkout is refused with nothing written", async () => {
    const before = await counts();
    const quote = await stack.quote(stranger, "PLUS");
    expect(quote.status).toBe(200);
    expect(quote.body).toMatchObject({ plan_id: "PLUS", tax_country: "DE", total: "23.80" });
    const priced = await counts();
    expect(priced.quotes).toBe(before.quotes + 1);
    refusedAsBuyer(await stack.checkout(stranger, String(quote.body.quote_ref)));
    await stack.runJobs();
    expect(await counts()).toEqual(priced);
    expect(withoutQuotes(priced)).toEqual(withoutQuotes(before));
  });

  it("a listed account's checkout opens NETOPIA's sandbox page and writes its charge", async () => {
    const quote = await stack.quote(listedBuyer, "PLUS");
    expect(quote.status).toBe(200);
    const before = await counts();
    const checkout = await stack.checkout(listedBuyer, String(quote.body.quote_ref));
    expect(checkout.status).toBe(200);
    expect(checkout.body.environment).toBe("sandbox");
    expect(String(checkout.body.redirect_url).startsWith(`${stack.netopia.baseUrl}/ui/card?p=`)).toBe(true);
    const after = await counts();
    expect(after.charges).toBe(before.charges + 1);
    expect(after.netopiaRequests).toBeGreaterThan(before.netopiaRequests);
  });

  it("a plan holder no longer on the team line gets the upgrade's price as before, and the upgrade is refused with nothing written", async () => {
    const before = await counts();
    const quote = await stack.post(removedSubscriber, "/v1/billing/subscription/upgrade-quote", { plan_id: "PRO" });
    expect(quote.status).toBe(200);
    expect(quote.body).toMatchObject({ plan_id: "PRO", tax_country: "DE", recurring_total: "59.50" });
    const priced = await counts();
    refusedAsBuyer(await stack.post(removedSubscriber, "/v1/billing/subscription/upgrade", upgradeBody(String(quote.body.quote_ref))));
    await stack.runJobs();
    expect(await counts()).toEqual(priced);
    expect(withoutQuotes(priced)).toEqual(withoutQuotes(before));
    // The plan bought while listed is untouched.
    expect(await stack.subscriptionStatus(removedSubscriber.ownerRef)).toBe("ACTIVE");
    expect(await stack.entitlementPlan(removedSubscriber.ownerRef)).toBe("PLUS");
  });

  it("a listed plan holder's upgrade opens NETOPIA's sandbox page and writes its charge", async () => {
    const quote = await stack.post(listedSubscriber, "/v1/billing/subscription/upgrade-quote", { plan_id: "PRO" });
    expect(quote.status).toBe(200);
    const before = await counts();
    const upgraded = await stack.post(listedSubscriber, "/v1/billing/subscription/upgrade", upgradeBody(String(quote.body.quote_ref)));
    expect(upgraded.status).toBe(200);
    expect(String(upgraded.body.redirect_url).startsWith(`${stack.netopia.baseUrl}/ui/card?p=`)).toBe(true);
    expect((await counts()).charges).toBe(before.charges + 1);
  });

  it(listCounts ? "an account the Owner approved buys; removed, it is refused again with nothing written"
    : "an account the Owner approved is still refused: the list counts only while asks are open with listed buyers", async () => {
    await owner.change("PREVIEW_BUYER_ADD", approved.userId);
    const quote = await stack.quote(approved, "PLUS");
    expect(quote.status).toBe(200);
    const before = await counts();
    const checkout = await stack.checkout(approved, String(quote.body.quote_ref));
    if (listCounts) {
      expect(checkout.status).toBe(200);
      expect(checkout.body.environment).toBe("sandbox");
      expect(String(checkout.body.redirect_url).startsWith(`${stack.netopia.baseUrl}/ui/card?p=`)).toBe(true);
      expect((await counts()).charges).toBe(before.charges + 1);
    } else {
      refusedAsBuyer(checkout);
      await stack.runJobs();
      expect(await counts()).toEqual(before);
    }
    await owner.change("PREVIEW_BUYER_REMOVE", approved.userId, { locked: true });
    const again = await stack.quote(approved, "PLUS");
    const priced = await counts();
    refusedAsBuyer(await stack.checkout(approved, String(again.body.quote_ref)));
    await stack.runJobs();
    expect(await counts()).toEqual(priced);
  });

  it("with the list unreadable an account not on the team line is refused with nothing written, and a team account still buys", async () => {
    // The list's one reader gone from the database: any read of it fails, as it would with the database unreachable.
    await stack.database.pool.query("ALTER FUNCTION staff.preview_buyer_listed(uuid) RENAME TO preview_buyer_listed_hidden_for_the_test");
    try {
      const quote = await stack.quote(stranger, "PLUS");
      expect(quote.status).toBe(200);
      const priced = await counts();
      const checkout = await stack.checkout(stranger, String(quote.body.quote_ref));
      // Under the team rule the list is never read, so its loss changes nothing there.
      if (listCounts) refusedUnreadable(checkout); else refusedAsBuyer(checkout);
      await stack.runJobs();
      expect(await counts()).toEqual(priced);
      const member = await stack.quote(teamBuyer, "PLUS");
      const before = await counts();
      expect((await stack.checkout(teamBuyer, String(member.body.quote_ref))).status).toBe(200);
      expect((await counts()).charges).toBe(before.charges + 1);
    } finally {
      await stack.database.pool.query("ALTER FUNCTION staff.preview_buyer_listed_hidden_for_the_test(uuid) RENAME TO preview_buyer_listed");
    }
  });
});
