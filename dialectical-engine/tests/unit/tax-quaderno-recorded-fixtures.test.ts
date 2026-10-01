// P4 Step 9's recorded Quaderno SANDBOX run, replayed through the real client. Skipped BY NAME until the owner
// records it (P22's go-live row: "Quaderno and SmartBill fixtures committed and their recorded-fixture suites
// green"); once any fixture exists, every step must.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { QuadernoTaxEngine } from "@debateai/tax-quaderno";
import {
  QUADERNO_RECORDING_STEPS,
  quadernoRecordingCompanyRefund,
  quadernoRecordingCompanySale,
  quadernoRecordingRefund,
  quadernoRecordingSale,
  type RecordedExchange
} from "../../tools/billing/record-connector.js";
import { REPLAY_BASE_URL, replayFetch } from "../support/connectorReplay.js";

const DIRECTORY = resolve(import.meta.dirname, "../fixtures/quaderno");
type Fixture = { format: string; step: string; outcome: string; exchanges: RecordedExchange[] };
const fixtures: Fixture[] = existsSync(DIRECTORY)
  ? readdirSync(DIRECTORY).filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(join(DIRECTORY, name), "utf8")) as Fixture)
  : [];

function fixture(step: string): Fixture {
  const found = fixtures.find((candidate) => candidate.step === step);
  if (found === undefined) throw new Error(`Quaderno fixture missing: ${step}`);
  return found;
}

/** Runs `use` against the real client answered by the recording, and requires that it sent exactly the recorded calls. */
async function replayed<T>(step: string, use: (engine: QuadernoTaxEngine) => Promise<T>): Promise<T> {
  const replay = replayFetch(fixture(step).exchanges);
  const engine = new QuadernoTaxEngine({ baseUrl: REPLAY_BASE_URL, apiKey: "replay", fetch: replay.fetch });
  const result = await use(engine);
  expect(replay.mismatches, step).toEqual([]);
  expect(replay.unused(), `${step}: recorded calls the client did not make`).toBe(0);
  return result;
}

const firstQuery = (step: string): Readonly<Record<string, string>> => fixture(step).exchanges[0]!.request.query;

/** The step's POST /transactions exchange (the booking itself). */
function posted(step: string): RecordedExchange {
  const found = fixture(step).exchanges.find((exchange) => exchange.request.method === "POST");
  if (found === undefined) throw new Error(`${step}: the recording holds no POST /transactions`);
  return found;
}

/** Quaderno's own total for a booked document, in dollars (it answers total_cents or total). */
function quadernoTotal(exchange: RecordedExchange): number {
  const reply = exchange.response.body as { total_cents?: unknown; total?: unknown };
  return typeof reply.total_cents === "number" ? reply.total_cents / 100 : Number(reply.total);
}

describe.runIf(fixtures.length > 0)("P4 — the recorded Quaderno sandbox run", () => {
  it("holds every step, each answered without a refusal", () => {
    expect(QUADERNO_RECORDING_STEPS.filter((step) => !fixtures.some((candidate) => candidate.step === step)), "missing steps").toEqual([]);
    expect(fixtures.every((candidate) => candidate.format === "debateai.quaderno-fixture.v1")).toBe(true);
    // A refused step (e.g. GET /credits?processor_id= answering 404) is exactly what this run exists to catch.
    expect(fixtures.filter((candidate) => candidate.outcome !== "OK").map((candidate) => `${candidate.step}:${candidate.outcome}`)).toEqual([]);
  });

  it("quotes the four cases with the request the client sends today, and reads each answer", async () => {
    const statuses: Record<string, string> = {};
    for (const step of ["calculate-ro", "calculate-vat-id", "calculate-us-tx", "calculate-jp"]) {
      const query = firstQuery(step);
      const quote = await replayed(step, (engine) => engine.quote({
        netMicros: 20_000_000, currency: "USD", taxId: query.tax_id ?? null, taxCode: "saas", date: new Date("2026-10-02T10:00:00.000Z"),
        location: { country: query.to_country!, region: null, postalCode: query.to_postal_code ?? null, city: null, street: null, ip: "203.0.113.10" }
      }));
      expect(quote.totalMicros, step).toBe(quote.netMicros + quote.taxMicros);
      statuses[step] = quote.status;
    }
    expect(statuses).toMatchObject({ "calculate-ro": "TAXABLE", "calculate-vat-id": "REVERSE_CHARGE", "calculate-us-tx": "TAXABLE" });
    expect(["NOT_REGISTERED", "NON_TAXABLE"]).toContain(statuses["calculate-jp"]);
  });

  it("books the sale once with the request the client sends today, at the total the card paid", async () => {
    const transactionId = firstQuery("record-sale").processor_id!;
    const sale = await replayed("record-sale", (engine) => engine.recordSale(quadernoRecordingSale(transactionId)));
    expect(sale.number.length).toBeGreaterThan(0);
    // The ⚠ fact: our items[].amount is the line INCLUDING tax. Quaderno's own total for the booked sale must be it.
    const booking = posted("record-sale");
    const sent = (booking.request.body as { items: Array<{ amount: number }> }).items[0]!.amount;
    expect(quadernoTotal(booking), "Quaderno's total for the sale (total_cents or total)").toBe(sent);
    const again = await replayed("record-sale-again", (engine) => engine.recordSale(quadernoRecordingSale(transactionId)));
    expect(again).toEqual(sale);
  });

  it("books the refund once against the sale, found again through the credit lookup", async () => {
    const transactionId = firstQuery("record-sale").processor_id!;
    const sale = await replayed("record-sale", (engine) => engine.recordSale(quadernoRecordingSale(transactionId)));
    const refund = await replayed("record-refund", (engine) => engine.recordRefund(quadernoRecordingRefund(transactionId, sale)));
    expect(await replayed("record-refund-again", (engine) => engine.recordRefund(quadernoRecordingRefund(transactionId, sale))))
      .toEqual(refund);
  });

  it("looks the second transaction up while the first one's documents exist, and finds nothing: the processor_id filter works", () => {
    const firstId = firstQuery("record-sale").processor_id!;
    const secondId = firstQuery("record-company-sale").processor_id;
    expect(secondId, "the company pair must run under a second, fresh transaction id").not.toBe(firstId);
    for (const [step, path] of [["record-company-sale", "/invoices"], ["record-company-refund", "/credits"]] as const) {
      const lookup = fixture(step).exchanges[0]!;
      expect(lookup.request, `${step}: its first call must be the GET ${path} lookup by the second id`)
        .toEqual({ method: "GET", path, query: { processor_id: secondId }, body: null });
      // A lookup that ignored processor_id would have listed the first pair's sale or credit here.
      expect(lookup.response.body, `${step}: Quaderno ignored the processor_id filter — GET ${path} for a new id listed documents`)
        .toEqual([]);
    }
  });

  it("books the reverse-charge company sale at 0 VAT (its total is the net sent) and its refund, with the request the client sends today", async () => {
    const secondId = firstQuery("record-company-sale").processor_id!;
    const customer = (posted("record-company-sale").request.body as { customer: { country: string; tax_id: string } }).customer;
    expect(customer.tax_id, "the scrubbed VAT id").toBe("SCRUBBED-ID");
    const record = quadernoRecordingCompanySale(secondId, customer.country, customer.tax_id);
    const sale = await replayed("record-company-sale", (engine) => engine.recordSale(record));
    expect(sale.number.length).toBeGreaterThan(0);
    const net = record.lines[0]!.netMicros / 1_000_000;
    expect(quadernoTotal(posted("record-company-sale")), "Quaderno's total for the company sale must be the net sent (0 VAT)").toBe(net);
    const refund = await replayed("record-company-refund", (engine) => engine.recordRefund(quadernoRecordingCompanyRefund(secondId, sale)));
    expect(refund.number.length).toBeGreaterThan(0);
  });
});
