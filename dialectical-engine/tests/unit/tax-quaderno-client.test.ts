// tests/unit/tax-quaderno-client.test.ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { QuadernoTaxEngine, quadernoAmountMicros, quadernoRateBasisPoints } from "@debateai/tax-quaderno";
import type { SaleRecord, TaxLocation } from "@debateai/billing-core";
import { startFakeQuaderno, type FakeQuaderno } from "../support/fake-quaderno.js";
import { FakeTaxEngine, fakeTaxMicros } from "../support/fake-tax-engine.js";

let fake: FakeQuaderno;
let engine: QuadernoTaxEngine;
beforeAll(async () => {
  fake = await startFakeQuaderno();
  engine = new QuadernoTaxEngine({ baseUrl: fake.baseUrl, apiKey: fake.apiKey, timeoutMs: 300 });
});
afterAll(async () => { await fake?.stop(); });

const location = (country: string, extra: Partial<TaxLocation> = {}): TaxLocation => ({
  country, region: null, postalCode: null, city: null, street: null, ip: "203.0.113.10", ...extra
});
const quote = (country: string, extra: Partial<TaxLocation> = {}, taxId: string | null = null) => engine.quote({
  netMicros: 20_000_000, currency: "USD", location: location(country, extra), taxId, taxCode: "saas",
  date: new Date("2026-10-02T10:00:00Z")
});
const sale = (transactionId: string): SaleRecord => ({
  chargeId: "c0ffee00c0ffee00c0ffee00c0ffee00", transactionId, issuedOn: new Date("2026-10-02T10:00:00Z"),
  customer: { name: "Test Person", email: "person@example.test", country: "DE", region: null, postalCode: "10115",
    city: "Berlin", street: null, taxId: null, locale: "de" },
  lines: [{ description: "DebateAI Plus, October 2026", netMicros: 20_000_000, taxMicros: 3_800_000, taxRateBasisPoints: 1900 }],
  taxCode: "saas",
  evidence: { billingCountry: "DE", ipAddress: "203.0.113.10", bankCountry: "DE" },
  processor: "netopia"
});

describe("P4 — exact decimal parsing", () => {
  it("keeps cents exact, drops trailing zeros and refuses anything finer", () => {
    expect(quadernoAmountMicros("4.20")).toBe(4_200_000);
    expect(quadernoAmountMicros("4.2")).toBe(4_200_000);
    expect(quadernoAmountMicros("4.200")).toBe(4_200_000);
    expect(quadernoAmountMicros("20")).toBe(20_000_000);
    expect(() => quadernoAmountMicros("4.205")).toThrow(expect.objectContaining({ code: "TAX_SERVICE_REFUSED", message: "QUADERNO_AMOUNT_NOT_CENTS" }));
    expect(() => quadernoAmountMicros(4.2)).toThrow(expect.objectContaining({ code: "TAX_SERVICE_REFUSED" }));
    expect(quadernoRateBasisPoints("21.0")).toBe(2100);
    expect(quadernoRateBasisPoints("8.875")).toBe(887.5);
    expect(quadernoRateBasisPoints("0")).toBe(0);
    expect(() => quadernoRateBasisPoints("101")).toThrow(expect.objectContaining({ code: "TAX_SERVICE_REFUSED" }));
  });
});

describe("P4 — Quaderno client against the fake", () => {
  it("quotes Romanian VAT exclusive of the net price, with the documented query", async () => {
    expect(await quote("RO")).toEqual({
      netMicros: 20_000_000, taxMicros: 4_200_000, totalMicros: 24_200_000, taxRateBasisPoints: 2100,
      taxName: "VAT", taxCountry: "RO", taxRegion: null, status: "TAXABLE", reference: null
    });
    const request = fake.requests.at(-1)!;
    expect(request.path).toBe("/api/tax_rates/calculate");
    expect(request.query).toMatchObject({ to_country: "RO", amount: "20.00", currency: "USD", tax_code: "saas", tax_behavior: "exclusive", date: "2026-10-02" });
  });

  it("finds a US state from the postal code, a reverse charge for a valid EU company, and zero where we are not registered", async () => {
    expect(await quote("US", { postalCode: "75001" })).toMatchObject({ taxMicros: 1_250_000, taxRateBasisPoints: 625, taxRegion: "TX", status: "TAXABLE" });
    expect(await quote("DE", {}, "DE-VALID-123")).toMatchObject({ taxMicros: 0, status: "REVERSE_CHARGE" });
    expect(await quote("JP")).toMatchObject({ taxMicros: 0, totalMicros: 20_000_000, status: "NOT_REGISTERED" });
  });

  it("retries a read once after 503 or 429, then gives up as unavailable", async () => {
    fake.failNext(503);
    expect((await quote("FR")).taxMicros).toBe(4_000_000);
    fake.failNext(429);
    expect((await quote("FR")).taxMicros).toBe(4_000_000);
    fake.failNext(503, 2);
    await expect(quote("FR")).rejects.toMatchObject({ code: "TAX_SERVICE_UNAVAILABLE" });
    fake.stallNext(2);
    await expect(quote("FR")).rejects.toMatchObject({ code: "TAX_SERVICE_UNAVAILABLE" });
  });

  it("refuses a 4xx, a sub-cent answer and an answer that does not add up", async () => {
    fake.failNext(422);
    await expect(quote("RO")).rejects.toMatchObject({ code: "TAX_SERVICE_REFUSED", message: "QUADERNO_HTTP_422" });
    fake.overrideNextCalculation({ tax_amount: "4.205", total_amount: "24.205" });
    await expect(quote("RO")).rejects.toMatchObject({ code: "TAX_SERVICE_REFUSED", message: "QUADERNO_AMOUNT_NOT_CENTS" });
    fake.overrideNextCalculation({ total_amount: "24.30" });
    await expect(quote("RO")).rejects.toMatchObject({ code: "TAX_SERVICE_REFUSED", message: "QUADERNO_TOTAL_MISMATCH" });
    const stranger = new QuadernoTaxEngine({ baseUrl: fake.baseUrl, apiKey: "wrong" });
    await expect(stranger.quote({ netMicros: 20_000_000, currency: "USD", location: location("RO"), taxId: null, taxCode: "saas", date: new Date() }))
      .rejects.toMatchObject({ code: "TAX_SERVICE_REFUSED", message: "QUADERNO_HTTP_401" });
  });

  it("validates a tax id", async () => {
    expect(await engine.validateTaxId("DE", "DE-VALID-1")).toMatchObject({ valid: true });
    expect(await engine.validateTaxId("DE", "DE-INVALID-1")).toMatchObject({ valid: false });
  });

  it("records a sale once: the second call finds it by processor id instead of posting again", async () => {
    const first = await engine.recordSale(sale("7001"));
    const again = await engine.recordSale(sale("7001"));
    expect(again).toEqual(first);
    expect(first.url).toMatch(/^https:\/\//u);
    expect(fake.sales.filter((recorded) => recorded.processor_id === "7001")).toHaveLength(1);
    const body = fake.sales.find((recorded) => recorded.processor_id === "7001")!;
    expect(body).toMatchObject({
      type: "sale", currency: "USD", processor: "netopia",
      customer: { first_name: "Test Person", email: "person@example.test", country: "DE" },
      evidence: { billing_country: "DE", ip_address: "203.0.113.10", bank_country: "DE" },
      custom_metadata: { charge_id: "c0ffee00c0ffee00c0ffee00c0ffee00" },
      items: [{ description: "DebateAI Plus, October 2026", quantity: 1, amount: 23.8, tax: { country: "DE", rate: 19, tax_code: "saas" } }]
    });
  });

  it("never adopts another sale's document, even when Quaderno ignores the processor filter", async () => {
    // Its own fake: returnUnfilteredLists() lasts for the fake's life, and the shared one must stay filtered.
    const unfiltered = await startFakeQuaderno();
    try {
      const local = new QuadernoTaxEngine({ baseUrl: unfiltered.baseUrl, apiKey: unfiltered.apiKey, timeoutMs: 300 });
      await local.recordSale(sale("7101"));
      unfiltered.returnUnfilteredLists();
      const mine = await local.recordSale({ ...sale("7102"), chargeId: "d00dfeedd00dfeedd00dfeedd00dfeed" });
      expect(unfiltered.sales.filter((recorded) => recorded.processor_id === "7102")).toHaveLength(1);
      const again = await local.recordSale({ ...sale("7102"), chargeId: "d00dfeedd00dfeedd00dfeedd00dfeed" });
      expect(again).toEqual(mine);
      expect(unfiltered.sales.filter((recorded) => recorded.processor_id === "7102")).toHaveLength(1);
    } finally {
      await unfiltered.stop();
    }
  });

  it("invents no customer name: a buyer without one is sent without first_name", async () => {
    await engine.recordSale({ ...sale("7201"), customer: { ...sale("7201").customer, name: null } });
    const body = fake.sales.find((recorded) => recorded.processor_id === "7201")!;
    expect(body.customer).not.toHaveProperty("first_name");
  });

  it("never retries a sale after a server error, so a retry can look it up first", async () => {
    fake.failNextPost(500);
    await expect(engine.recordSale(sale("7002"))).rejects.toMatchObject({ code: "TAX_SERVICE_UNAVAILABLE" });
    expect(fake.postCount("7002")).toBe(1);
    await engine.recordSale(sale("7002"));
    expect(fake.sales.filter((recorded) => recorded.processor_id === "7002")).toHaveLength(1);
  });

  it("records a refund once against the sale's processor id, with the caller's line text", async () => {
    const refund = {
      chargeId: "c0ffee00c0ffee00c0ffee00c0ffee00", transactionId: "7001", issuedOn: new Date("2026-10-05T10:00:00Z"),
      refundTotalMicros: 11_900_000, original: { documentId: "1", number: "Q-1" },
      description: "Rückerstattung zu Rechnung Q-1", processor: "netopia" as const
    };
    const sent = fake.requests.length;
    const first = await engine.recordRefund(refund);
    expect(await engine.recordRefund(refund)).toEqual(first);
    // Both calls looked the credit up by the sale's processor id first (the shared fake filters on it).
    const lookups = fake.requests.slice(sent).filter((request) => request.method === "GET");
    expect(lookups).toEqual([
      { method: "GET", path: "/api/credits", query: { processor_id: "7001" } },
      { method: "GET", path: "/api/credits", query: { processor_id: "7001" } }
    ]);
    const recorded = fake.refunds.filter((candidate) => candidate.processor_id === "7001");
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ items: [{ description: "Rückerstattung zu Rechnung Q-1", quantity: 1, amount: 11.9 }] });
  });

  it("N10: names NETOPIA as the processor and its payment id, and finds the document again by that id", async () => {
    const netopiaSale: SaleRecord = { ...sale("ntp-7301"), processor: "netopia" };
    const first = await engine.recordSale(netopiaSale);
    expect(await engine.recordSale(netopiaSale)).toEqual(first);
    const bodies = fake.sales.filter((recorded) => recorded.processor_id === "ntp-7301");
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ processor: "netopia", payment: { processor: "netopia", processor_id: "ntp-7301" } });
    await engine.recordRefund({
      chargeId: "c0ffee00c0ffee00c0ffee00c0ffee00", transactionId: "ntp-7301", issuedOn: new Date("2026-10-05T10:00:00Z"),
      refundTotalMicros: 11_900_000, original: { documentId: first.documentId, number: first.number },
      description: "Credit", processor: "netopia"
    });
    expect(fake.refunds.find((recorded) => recorded.processor_id === "ntp-7301")).toMatchObject({ processor: "netopia" });
  });
});

describe("P4 — a lookup that does not answer a list never leads to a second document (R-24)", () => {
  it("refuses instead of posting when the sale or credit lookup answers something other than a list", async () => {
    const methods: string[] = [];
    const stub: typeof fetch = async (_input, init) => {
      methods.push(init?.method ?? "GET");
      return new Response('{"data":[]}', { status: 200, headers: { "content-type": "application/json" } });
    };
    const local = new QuadernoTaxEngine({ baseUrl: "https://quaderno.test/api", apiKey: "fake", fetch: stub });
    await expect(local.recordSale(sale("7401"))).rejects.toMatchObject({ code: "TAX_SERVICE_REFUSED", message: "QUADERNO_RESPONSE_INVALID" });
    await expect(local.recordRefund({
      chargeId: "c0ffee00c0ffee00c0ffee00c0ffee00", transactionId: "7401", issuedOn: new Date("2026-10-05T10:00:00Z"),
      refundTotalMicros: 1_000_000, original: { documentId: "1", number: "Q-1" }, description: "Gutschrift",
      processor: "netopia"
    })).rejects.toMatchObject({ code: "TAX_SERVICE_REFUSED", message: "QUADERNO_RESPONSE_INVALID" });
    expect(methods).toEqual(["GET", "GET"]);
  });
});

describe("P4 — R-24's charge-id half: the same processor id is not enough to adopt a document", () => {
  const CHARGE = "c0ffee00c0ffee00c0ffee00c0ffee00";
  const refund = {
    chargeId: CHARGE, transactionId: "7501", issuedOn: new Date("2026-10-05T10:00:00Z"),
    refundTotalMicros: 1_000_000, original: { documentId: "1", number: "Q-1" }, description: "Gutschrift",
    processor: "netopia" as const
  };
  /** Lists `listed` on every GET and books a new document on POST; remembers each call's method and path. */
  function stubListing(listed: unknown): { fetch: typeof fetch; calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      fetch: async (input, init) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        const method = init?.method ?? "GET";
        calls.push(`${method} ${url.pathname}`);
        const body = method === "GET" ? [listed]
          : { id: 9901, number: "Q-9901", permalink: "https://quaderno.test/documents/9901" };
        return new Response(JSON.stringify(body), { status: method === "GET" ? 200 : 201, headers: { "content-type": "application/json" } });
      }
    };
  }
  const cases = [
    ["this transaction's processor id under another charge id",
      { id: 7777, number: "Q-7777", processor_id: "7501", custom_metadata: { charge_id: "d00dfeedd00dfeedd00dfeedd00dfeed" }, permalink: "https://quaderno.test/documents/7777" }],
    ["this transaction's processor id and no custom_metadata (a document made by hand in Quaderno's dashboard)",
      { id: 7778, number: "Q-7778", processor_id: "7501", permalink: "https://quaderno.test/documents/7778" }]
  ] as const;

  for (const [label, listed] of cases) {
    it(`posts a new sale, never adopting a listed one with ${label}`, async () => {
      const stub = stubListing(listed);
      const local = new QuadernoTaxEngine({ baseUrl: "https://quaderno.test/api", apiKey: "fake", fetch: stub.fetch });
      expect(await local.recordSale(sale("7501"))).toEqual({ documentId: "9901", number: "Q-9901", url: "https://quaderno.test/documents/9901" });
      expect(stub.calls).toEqual(["GET /api/invoices", "POST /api/transactions"]);
    });

    it(`posts a new credit, never adopting a listed one with ${label}`, async () => {
      const stub = stubListing(listed);
      const local = new QuadernoTaxEngine({ baseUrl: "https://quaderno.test/api", apiKey: "fake", fetch: stub.fetch });
      expect(await local.recordRefund(refund)).toEqual({ documentId: "9901", number: "Q-9901" });
      expect(stub.calls).toEqual(["GET /api/credits", "POST /api/transactions"]);
    });
  }
});

describe("P4 — numbers keep their source text (the P3 review's rule, applied to Quaderno)", () => {
  it("keeps a document id above 2^53 exactly as Quaderno wrote it", async () => {
    const listing = '[{"id":9007199254740993,"number":"Q-9","processor_id":7301,'
      + '"custom_metadata":{"charge_id":"c0ffee00c0ffee00c0ffee00c0ffee00"},"permalink":"https://quaderno.test/documents/9"}]';
    const stub: typeof fetch = async () => new Response(listing, { status: 200, headers: { "content-type": "application/json" } });
    const local = new QuadernoTaxEngine({ baseUrl: "https://quaderno.test/api", apiKey: "fake", fetch: stub });
    expect(await local.recordSale(sale("7301"))).toEqual({ documentId: "9007199254740993", number: "Q-9", url: "https://quaderno.test/documents/9" });
  });

  it("refuses, rather than rounding an amount or an id through a double, on a runtime with no source text", async () => {
    const realParse = JSON.parse;
    const spy = vi.spyOn(JSON, "parse").mockImplementation((text: string, reviver?: (key: string, value: unknown) => unknown) => (
      reviver === undefined
        ? realParse(text)
        : realParse(text, function (this: unknown, key: string, value: unknown) { return reviver.call(this, key, value); })
    ) as unknown);
    try {
      await expect(quote("RO")).rejects.toMatchObject({ code: "TAX_SERVICE_REFUSED", message: "QUADERNO_RESPONSE_INVALID" });
    } finally {
      spy.mockRestore();
    }
  });
});

describe("P4 — FakeTaxEngine (what the route tests rely on)", () => {
  it("uses the fixed rates, the VALID rule and records sales idempotently", async () => {
    const fakeEngine = new FakeTaxEngine();
    const base = { netMicros: 20_000_000, currency: "USD" as const, taxCode: "saas" as const, date: new Date() };
    expect(await fakeEngine.quote({ ...base, location: location("RO"), taxId: null })).toMatchObject({ taxMicros: 4_200_000, status: "TAXABLE" });
    expect(await fakeEngine.quote({ ...base, location: location("RO"), taxId: "RO-VALID-1" })).toMatchObject({ taxMicros: 4_200_000, status: "TAXABLE" });
    // P2-M29: like the HTTP fake (and Quaderno, which P4 never sends a region), it prices the US by postal code only.
    expect(await fakeEngine.quote({ ...base, location: location("US", { postalCode: "75001" }), taxId: null })).toMatchObject({ taxMicros: 1_250_000, taxRegion: "TX" });
    expect(await fakeEngine.quote({ ...base, location: location("US", { region: "TX" }), taxId: null }))
      .toMatchObject({ taxMicros: 0, status: "NOT_REGISTERED", taxRegion: null });
    expect(await fakeEngine.quote({ ...base, location: location("US", { region: "NY", postalCode: "75001" }), taxId: null }))
      .toMatchObject({ taxMicros: 1_250_000, taxRegion: "TX" });
    expect(await fakeEngine.quote({ ...base, location: location("FR"), taxId: "FR-VALID-9" })).toMatchObject({ taxMicros: 0, status: "REVERSE_CHARGE" });
    // Any EU/EEA country outside Romania, also one without a rate row (spec §2.5.7's VALID rule).
    expect(await fakeEngine.quote({ ...base, location: location("IT"), taxId: "IT-VALID-3" })).toMatchObject({ taxMicros: 0, status: "REVERSE_CHARGE" });
    expect(await fakeEngine.quote({ ...base, location: location("NO"), taxId: "NO-VALID-4" })).toMatchObject({ status: "REVERSE_CHARGE" });
    expect(await fakeEngine.quote({ ...base, location: location("GB"), taxId: "GB-VALID-5" })).toMatchObject({ taxMicros: 0, status: "NOT_REGISTERED" });
    expect((await fakeEngine.validateTaxId("FR", "FR-INVALID")).valid).toBe(false);
    const recorded = await fakeEngine.recordSale(sale("8001"));
    expect(await fakeEngine.recordSale(sale("8001"))).toEqual(recorded);
    expect(fakeEngine.sales).toHaveLength(1);
    fakeEngine.failNext("TAX_SERVICE_UNAVAILABLE");
    await expect(fakeEngine.quote({ ...base, location: location("RO"), taxId: null })).rejects.toMatchObject({ code: "TAX_SERVICE_UNAVAILABLE" });
  });

  it("hands route tests the same rate rule through tests/support (R-16), rounded half up to the cent", () => {
    expect(fakeTaxMicros(20_000_000, 2_100)).toBe(4_200_000);
    expect(fakeTaxMicros(20_000_000, 625)).toBe(1_250_000);
    expect(fakeTaxMicros(10_050_000, 625)).toBe(630_000); // 628 125 micros -> 0.63
  });
});
