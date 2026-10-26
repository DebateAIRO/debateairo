import { describe, expect, it, vi } from "vitest";
import { renderMail } from "@debateai/mail-templates";
import { TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW, taxAuthoritiesFromValue } from "@debateai/register";
import { OwnerJobs } from "../../apps/api/src/billing/owner-jobs.js";
import { hostCommand } from "../../apps/api/src/billing/refunds.js";
import { remindHeldRenewals } from "../../apps/api/src/billing/renewal-resume.js";
import { recordingAudit } from "../support/billingSubscriptionFixtures.js";

/**
 * Follow-up of B1 part 2 (NETOPIA answers 2026-10-21, Q22): a renewal held for the owner after our own setup's refusal
 * is told once (its O3), then reminded by the daily owner job while the resume command can still reach it (30 days).
 */
const MINUTE = 60_000;
const DAY = 86_400_000;
const HELD_AT = new Date("2026-10-21T14:00:00.000Z");

type Event = Readonly<{ kind: string; errorCode: string | null; at: Date }>;
type Charge = Readonly<{ chargeId: string; subscriptionId: string; createdAt: Date; events: ReadonlyArray<Event> }>;

/** A renewal charge NETOPIA refused for a setting of our account at `heldAt`, made a minute before. */
const heldCharge = (chargeId: string, heldAt = HELD_AT, code = "CHARGE_CONFIGURATION_REFUSED"): Charge => Object.freeze({
  chargeId, subscriptionId: `sub-${chargeId}`, createdAt: new Date(heldAt.getTime() - MINUTE),
  events: [
    { kind: "REQUESTED", errorCode: null, at: new Date(heldAt.getTime() - MINUTE) },
    { kind: "REQUESTED", errorCode: code, at: heldAt }
  ]
});

function fakes(charges: ReadonlyArray<Charge>) {
  const enqueued: Array<Readonly<{ kind: string; ref: string; payload: Readonly<Record<string, unknown>> }>> = [];
  const repository = {
    withTransaction: async <T>(work: (client: never) => Promise<T>) => work({} as never),
    enqueue: async (_client: unknown, entry: { kind: string; ref: string; payload: Readonly<Record<string, unknown>> }) => {
      enqueued.push(entry);
      return "job";
    },
    charge: async (chargeId: string) => {
      const found = charges.find((charge) => charge.chargeId === chargeId);
      return found === undefined ? null : { ...found, kind: "RENEWAL", paymentProvider: "netopia" };
    }
  };
  const jobs = {
    outboxJobExists: async (_client: unknown, kind: string, ref: string) =>
      enqueued.some((entry) => entry.kind === kind && entry.ref === ref),
    // One page of the open charges made since `createdFrom`, oldest first, as the renewal pass reads them.
    openPaymentCharges: vi.fn(async (input: { createdFrom: Date; after: unknown; limit: number }) => input.after !== null ? []
      : charges.filter((charge) => charge.createdAt.getTime() >= input.createdFrom.getTime())
        .map((charge) => ({ chargeId: charge.chargeId, subscriptionId: charge.subscriptionId, createdAt: charge.createdAt })))
  };
  const deps = { repository: repository as never, jobs: jobs as never, paymentEnvironment: "sandbox" as const };
  return { enqueued, jobs, deps };
}

const reminders = (enqueued: ReturnType<typeof fakes>["enqueued"]) =>
  enqueued.filter((entry) => entry.kind === "EMAIL" && entry.payload["param.reasonCode"] === "RENEWAL_HELD");
const paramsOf = (entry: Readonly<{ payload: Readonly<Record<string, unknown>> }>) => Object.fromEntries(Object.entries(entry.payload)
  .filter(([name]) => name.startsWith("param.")).map(([name, value]) => [name.slice("param.".length), String(value)]));

describe("the owner is reminded of renewals held for their resume command", () => {
  it("says nothing while no renewal waits for the owner: an outage's not-sent call, a released or a settled charge", async () => {
    const outage = { ...heldCharge("a".repeat(32)), events: [
      { kind: "REQUESTED", errorCode: null, at: HELD_AT }, { kind: "REQUESTED", errorCode: "CHARGE_NOT_SENT", at: HELD_AT }
    ] };
    const released = { ...heldCharge("b".repeat(32)), events: [
      ...heldCharge("b".repeat(32)).events, { kind: "REQUESTED", errorCode: "CHARGE_RESUMED", at: HELD_AT }
    ] };
    const settled = { ...heldCharge("c".repeat(32)), events: [
      ...heldCharge("c".repeat(32)).events, { kind: "FAILED", errorCode: "PAYMENT_DECLINED", at: HELD_AT }
    ] };
    const { enqueued, deps } = fakes([outage, released, settled]);
    expect(await remindHeldRenewals(deps, new Date(HELD_AT.getTime() + 3 * DAY))).toBe(0);
    expect(enqueued).toEqual([]);
  });

  it("reminds every third day a renewal waits, once a day, naming both commands and the last day it can still be sent", async () => {
    const charge = heldCharge("d".repeat(32));
    const { enqueued, jobs, deps } = fakes([charge]);
    // The refusal's own O3 told the owner on the day it came; the next day is quiet.
    expect(await remindHeldRenewals(deps, new Date(HELD_AT.getTime() + DAY))).toBe(0);
    const third = new Date(HELD_AT.getTime() + 3 * DAY);
    expect(await remindHeldRenewals(deps, third)).toBe(1);
    // The renewal pass's own reach: the open NETOPIA renewals of this environment made in the last 30 days.
    expect(jobs.openPaymentCharges).toHaveBeenCalledWith(expect.objectContaining({
      provider: "netopia", environment: "sandbox", kinds: ["RENEWAL"], createdFrom: new Date(third.getTime() - 30 * DAY)
    }));
    const [reminder] = reminders(enqueued);
    expect(reminder).toMatchObject({
      ref: "O3:RENEWAL_HELD:2026-10-24",
      payload: { template: "O3", recipient: "OWNER", "param.paymentAlert": "true", "param.reference": `charge ${charge.chargeId}` }
    });
    const params = paramsOf(reminder!);
    expect(params.nextSteps).toContain(`charge ${charge.chargeId}: waiting since 2026-10-21, can be sent until 2026-11-20 13:59 UTC`);
    expect(params.nextSteps).toContain(`  ${hostCommand("billing:check")}\n  ${hostCommand("billing:renewal-resume")}`);
    expect(params.nextSteps).toContain("Nothing was charged and the customer was not emailed.");
    // English only, and it renders inside one O3.
    expect(renderMail("O3", "en", params).text).toContain("Reason code: RENEWAL_HELD");
    // Once a day: a second daily run the same day queues nothing more; three days later it comes again.
    expect(await remindHeldRenewals(deps, new Date(third.getTime() + 5 * 60 * MINUTE))).toBe(0);
    expect(await remindHeldRenewals(deps, new Date(HELD_AT.getTime() + 4 * DAY))).toBe(0);
    expect(await remindHeldRenewals(deps, new Date(HELD_AT.getTime() + 6 * DAY))).toBe(1);
    expect(reminders(enqueued).map((entry) => entry.ref)).toEqual(["O3:RENEWAL_HELD:2026-10-24", "O3:RENEWAL_HELD:2026-10-27"]);
  });

  it("reminds every day in the last 3 days before the resume command can no longer reach a held renewal", async () => {
    const { enqueued, deps } = fakes([heldCharge("e".repeat(32))]);
    // Day 28 is no third day, but the charge leaves the command's 30 days within 3 days.
    expect(await remindHeldRenewals(deps, new Date(HELD_AT.getTime() + 28 * DAY))).toBe(1);
    expect(await remindHeldRenewals(deps, new Date(HELD_AT.getTime() + 29 * DAY))).toBe(1);
    expect(reminders(enqueued)).toHaveLength(2);
  });

  it("counts every held renewal and lists at most 40 of them, the oldest first, then says how many more", async () => {
    const charges = Array.from({ length: 45 }, (_, index) =>
      heldCharge(index.toString(16).padStart(32, "0"), new Date(HELD_AT.getTime() + index * MINUTE)));
    const { enqueued, deps } = fakes(charges);
    expect(await remindHeldRenewals(deps, new Date(HELD_AT.getTime() + 3 * DAY))).toBe(45);
    const params = paramsOf(reminders(enqueued)[0]!);
    expect(params.reference).toBe(`45 held renewals, the oldest charge ${charges[0]!.chargeId}`);
    expect(params.nextSteps).toContain("45 renewals NETOPIA refused because of our own setup are waiting for you.");
    expect(String(params.nextSteps).match(/^ {2}- charge /gmu)).toHaveLength(40);
    expect(params.nextSteps).toContain("  - and 5 more");
  });

  it("runs as a step of the daily owner job, added to the job's count", async () => {
    const authorities = taxAuthoritiesFromValue(TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW.value, "test");
    const now = new Date("2026-10-24T06:00:00.000Z");
    const calls: Date[] = [];
    const owner = new OwnerJobs({
      billing: { withTransaction: async <T>(work: (client: never) => Promise<T>) => work({} as never), enqueue: async () => "job" } as never,
      jobs: { outboxJobExists: async () => true } as never,
      taxAuthorities: authorities, audit: recordingAudit(), clock: () => now,
      heldRenewals: { remindOwner: async (at: Date) => { calls.push(at); return 2; } }
    });
    expect(await owner.schedule()).toBe(2);
    expect(calls).toEqual([now]);
  });
});
