// tests/unit/invoice-smartbill-recorded-fixtures.test.ts
// P5 Step 9's recorded SmartBill run, replayed through the real issuer. Skipped BY NAME until the owner records it
// (P22's go-live row); once any fixture exists, the two reads must, and the write set is all or nothing (the
// accountant may allow all writes, only a draft, or neither — P22 then names the shapes left ⚠).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SmartBillInvoiceIssuer } from "@debateai/invoice-smartbill";
import {
  SMARTBILL_DRAFT_STEPS,
  SMARTBILL_READ_STEPS,
  SMARTBILL_WRITE_STEPS,
  smartbillRecordingRefund,
  smartbillRecordingSale,
  type RecordedExchange
} from "../../tools/billing/record-connector.js";
import { REPLAY_BASE_URL, replayFetch } from "../support/connectorReplay.js";

const DIRECTORY = resolve(import.meta.dirname, "../fixtures/smartbill");
type Fixture = { format: string; step: string; outcome: string; exchanges: RecordedExchange[] };
const fixtures: Fixture[] = existsSync(DIRECTORY)
  ? readdirSync(DIRECTORY).filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(join(DIRECTORY, name), "utf8")) as Fixture)
  : [];
const has = (step: string): boolean => fixtures.some((candidate) => candidate.step === step);

function fixture(step: string): Fixture {
  const found = fixtures.find((candidate) => candidate.step === step);
  if (found === undefined) throw new Error(`SmartBill fixture missing: ${step}`);
  return found;
}

type InvoiceBody = { seriesName: string; issueDate: string; mentions: string };
/** What the recording's own issue request said: its series, its Bucharest date and our charge id. */
function recordedIssue(step: string): Readonly<{ series: string; issuedOn: Date; chargeId: string }> {
  const body = fixture(step).exchanges[0]!.request.body as InvoiceBody;
  const chargeId = /debateai-charge:([0-9a-f]{32})/u.exec(body.mentions)?.[1];
  if (chargeId === undefined) throw new Error(`${step}: no charge id in mentions`);
  return { series: body.seriesName, issuedOn: new Date(`${body.issueDate}T09:00:00.000Z`), chargeId };
}

async function replayed<T>(step: string, draft: boolean, use: (issuer: SmartBillInvoiceIssuer) => Promise<T>): Promise<T> {
  const replay = replayFetch(fixture(step).exchanges);
  const issuer = new SmartBillInvoiceIssuer({
    baseUrl: REPLAY_BASE_URL, username: "replay@example.test", token: "replay", companyCif: "SCRUBBED-ID",
    series: recordedIssue(has("issue") ? "issue" : "issue-draft").series, minGapMs: 0, fetch: replay.fetch, draft
  });
  const result = await use(issuer);
  expect(replay.mismatches, step).toEqual([]);
  expect(replay.unused(), `${step}: recorded calls the issuer did not make`).toBe(0);
  return result;
}

function findRecord(value: unknown, match: (record: Record<string, unknown>) => boolean): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecord(item, match);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  return match(record) ? record : findRecord(Object.values(record), match);
}

describe.runIf(fixtures.length > 0)("P5 — the recorded SmartBill run", () => {
  it("holds both reads, the write set whole or not at all, each answered as expected", () => {
    expect(SMARTBILL_READ_STEPS.filter((step) => !has(step)), "missing read steps").toEqual([]);
    const writes = SMARTBILL_WRITE_STEPS.filter(has);
    expect(writes.length === 0 || writes.length === SMARTBILL_WRITE_STEPS.length, "the write set is all or nothing").toBe(true);
    expect(writes.length === 0 || !SMARTBILL_DRAFT_STEPS.some(has), "writes or a draft, not both").toBe(true);
    expect(fixtures.every((candidate) => candidate.format === "debateai.smartbill-fixture.v1")).toBe(true);
    for (const candidate of fixtures) {
      // X1 row 5: a second reversal of one invoice is refused.
      expect(candidate.outcome, candidate.step).toBe(candidate.step === "storno-again" ? "INVOICE_SERVICE_REFUSED:SMARTBILL_REFUSED" : "OK");
    }
  });

  it("names the account's 21 % VAT the way the issuer sends it (X1 rows 7, 12)", () => {
    const vat = findRecord(fixture("tax-list").exchanges[0]!.response.body, (record) => Object.values(record).some((value) => typeof value !== "object" && Number(value) === 21));
    expect(vat?.name, "the 21 % rate's name — the issuer's taxName default").toBe("Normala");
  });

  it.runIf(has("issue") || has("issue-draft"))("lists the series the recording issued in", () => {
    const series = recordedIssue(has("issue") ? "issue" : "issue-draft").series;
    expect(findRecord(fixture("series-list").exchanges[0]!.response.body, (record) => record.name === series), series).toBeDefined();
  });

  it.runIf(has("issue"))("issues, prints, part-credits and reverses with the requests the issuer sends today", async () => {
    const original = recordedIssue("issue");
    const sale = smartbillRecordingSale(original.chargeId, original.issuedOn);
    const issued = await replayed("issue", false, (issuer) => issuer.issue(sale));
    const pdf = await replayed("pdf", false, (issuer) => issuer.pdf({ series: issued.series, number: issued.number }));
    expect(Buffer.from(pdf.subarray(0, 4)).toString("latin1")).toBe("%PDF");
    await replayed("credit-partial", false, (issuer) => issuer.creditPartial({
      ...smartbillRecordingRefund(original.chargeId, original.issuedOn, issued, 500_000), series: issued.series,
      number: issued.number, taxRateBasisPoints: 2100, customer: sale.customer
    }));
    const other = recordedIssue("issue-for-storno");
    const second = await replayed("issue-for-storno", false, (issuer) => issuer.issue(smartbillRecordingSale(other.chargeId, other.issuedOn)));
    const whole = { ...smartbillRecordingRefund(other.chargeId, other.issuedOn, second, 1_210_000), series: second.series, number: second.number };
    await replayed("storno", false, (issuer) => issuer.storno(whole));
    await expect(replayed("storno-again", false, (issuer) => issuer.storno(whole)))
      .rejects.toMatchObject({ code: "INVOICE_SERVICE_REFUSED", message: "SMARTBILL_REFUSED" });
  });

  it.runIf(!has("issue") && has("issue-draft"))("issues the draft with the request the issuer sends today", async () => {
    const original = recordedIssue("issue-draft");
    const issued = await replayed("issue-draft", true, (issuer) => issuer.issue(smartbillRecordingSale(original.chargeId, original.issuedOn)));
    expect(issued.number.length).toBeGreaterThan(0);
  });
});
