import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { QuadernoTaxEngine } from "@debateai/tax-quaderno";
import {
  CONNECTOR_CAPTURE_FORMAT,
  ConnectorRecorder,
  QUADERNO_RECORDING_STEPS,
  QUADERNO_REVERSE_CHARGE_CHECK,
  quadernoRecordingSale,
  recordQuadernoRun
} from "../../tools/billing/record-connector.js";
import {
  CONNECTOR_FIXTURE_FORMATS,
  scrubConnectorValue,
  writeConnectorFixtures
} from "../../tools/billing/scrub-connector-fixture.js";
import { REPLAY_BASE_URL, replayFetch } from "../support/connectorReplay.js";
import { startFakeQuaderno } from "../support/fake-quaderno.js";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
function privateRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "connector-recording-"));
  chmodSync(root, 0o700);
  roots.push(root);
  return root;
}

/** A stand-in for the provider: answers every call with `status` and `body`, and remembers what it was sent. */
function provider(status: number, body: unknown): { fetch: typeof fetch; seen: Array<Readonly<{ url: string; authorization: string | null }>> } {
  const seen: Array<Readonly<{ url: string; authorization: string | null }>> = [];
  return {
    seen,
    fetch: async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      seen.push({ url, authorization: new Headers(init?.headers).get("authorization") });
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }
  };
}

describe("P4 — the connector recorder and its scrubber", () => {
  it("records each step's requests and replies through the real client, never the credential", async () => {
    const upstream = provider(200, [{ id: 91, number: "Q-0091", processor_id: "4242", custom_metadata: { charge_id: "c0ffee00c0ffee00c0ffee00c0ffee00" },
      permalink: "https://owner-account.sandbox-quadernoapp.com/invoices/91" }]);
    const recorder = new ConnectorRecorder("https://owner-account.sandbox-quadernoapp.com/api", upstream.fetch);
    const engine = new QuadernoTaxEngine({ baseUrl: "https://owner-account.sandbox-quadernoapp.com/api", apiKey: "sk_owner_secret", fetch: recorder.fetch });
    const found = await recorder.step("record-sale-again", () => engine.recordSale(quadernoRecordingSale("4242")));
    expect(found).toMatchObject({ documentId: "91", number: "Q-0091" });
    await recorder.step("validate-tax-id", () => engine.validateTaxId("DE", "DE123456789"));
    const capture = recorder.capture("quaderno");
    expect(capture.format).toBe(CONNECTOR_CAPTURE_FORMAT);
    expect(capture.steps.map((step) => [step.step, step.outcome])).toEqual([
      ["record-sale-again", "OK"],
      // The stand-in answered a list where an object was due: the step records the client's code, content-free.
      ["validate-tax-id", "TAX_SERVICE_REFUSED:QUADERNO_RESPONSE_INVALID"]
    ]);
    expect(capture.steps[0]!.exchanges[0]!.request).toEqual({
      method: "GET", path: "/invoices", query: { processor_id: "4242" }, body: null
    });
    expect(upstream.seen[0]!.authorization).toMatch(/^Basic /u);
    expect(JSON.stringify(capture)).not.toContain(Buffer.from("sk_owner_secret:", "utf8").toString("base64"));
    expect(JSON.stringify(capture)).not.toContain("sk_owner_secret");
  });

  it("writes one scrubbed fixture per step: no VAT id, account address or e-mail of the owner survives", () => {
    const root = privateRoot();
    const capturePath = join(root, "quaderno-capture.json");
    writeFileSync(capturePath, JSON.stringify({
      format: CONNECTOR_CAPTURE_FORMAT, connector: "quaderno", steps: [{
        step: "calculate-vat-id", outcome: "OK", exchanges: [{
          request: { method: "GET", path: "/tax_rates/calculate", query: { to_country: "DE", tax_id: "DE811569869" }, body: null },
          response: { status: 200, contentType: "application/json", body: {
            status: "reverse_charge", rate: "0.0", tax_id: "DE811569869", email: "owner@firma.ro",
            permalink: "https://owner-account.sandbox-quadernoapp.com/x/1"
          } }
        }]
      }]
    }), { mode: 0o600 });
    const out = join(root, "fixtures");
    mkdirSync(out, { mode: 0o700 });
    expect(writeConnectorFixtures({ capturePath, outDir: out, recordedOn: "2026-10-02", secrets: ["DE811569869"] }))
      .toEqual(["calculate-vat-id.json"]);
    const text = readFileSync(join(out, "calculate-vat-id.json"), "utf8");
    for (const original of ["DE811569869", "owner@firma.ro", "owner-account"]) expect(text, original).not.toContain(original);
    const fixture = JSON.parse(text) as { format: string; step: string; exchanges: Array<{ response: { body: Record<string, unknown> } }> };
    expect(fixture.format).toBe(CONNECTOR_FIXTURE_FORMATS.quaderno);
    expect(fixture.exchanges[0]!.response.body).toMatchObject({ status: "reverse_charge", rate: "0.0", tax_id: "SCRUBBED-ID" });
    expect(readdirSync(out)).toEqual(["calculate-vat-id.json"]);
    // Idempotent, so a replay can scrub what the client sends today and compare it with the recording.
    const once = scrubConnectorValue({ tax_id: "DE811569869", email: "a@b.ro" }, ["DE811569869"]);
    expect(scrubConnectorValue(once, [])).toEqual(once);
  });

  it("replaces every document link, whose path or query carries the document's access token (P2-M31)", () => {
    // Built from pieces so the secret scan does not read this made-up value as a key (owner's ruling, PR #71).
    const token = ["Zx9tok3", "nSECRET"].join("");
    const links = {
      // SmartBill (no sandbox: its recording is a real invoice of the company).
      url: `https://ws.smartbill.ro/invoice/view?token=${token}`,
      documentUrl: `https://cloud.smartbill.ro/core/factura/${token}`,
      documentViewUrl: `https://cloud.smartbill.ro/view/${token}?h=1`,
      // Quaderno.
      permalink: `https://owner-account.sandbox-quadernoapp.com/invoice/${token}`,
      pdf: `https://owner-account.sandbox-quadernoapp.com/invoice/${token}.pdf`,
      number: "0042", status: "ok"
    };
    const once = scrubConnectorValue({ data: [links] }, []);
    expect(JSON.stringify(once)).not.toContain(token);
    expect(once).toEqual({ data: [{
      url: "https://document.test/SCRUBBED", documentUrl: "https://document.test/SCRUBBED",
      documentViewUrl: "https://document.test/SCRUBBED", permalink: "https://document.test/SCRUBBED",
      pdf: "https://document.test/SCRUBBED", number: "0042", status: "ok"
    }] });
    expect(scrubConnectorValue(once, [])).toEqual(once);
  });

  it("erases a secret inside a longer text and a VAT id without its country letters, and a second pass changes nothing", () => {
    const echoed = {
      notes: "Reverse charge: customer VAT number DE811569869", tax_id: "811569869",
      legends: [{ text: "VAT ID 811569869 (DE)" }], first_name: "Firma DE811569869", email: "billing@de811569869.example",
      contact: "owner@firma.ro", total: "20.00"
    };
    const once = scrubConnectorValue(echoed, ["DE811569869", "owner@firma.ro"]);
    expect(JSON.stringify(once)).not.toContain("811569869");
    expect(JSON.stringify(once)).not.toContain("owner@firma.ro");
    expect(once).toEqual({
      notes: "Reverse charge: customer VAT number SCRUBBED-ID", tax_id: "SCRUBBED-ID",
      legends: [{ text: "VAT ID SCRUBBED-ID (DE)" }], first_name: "Test", email: "person@example.test",
      contact: "SCRUBBED-ID", total: "20.00"
    });
    expect(scrubConnectorValue(once, ["DE811569869", "owner@firma.ro"])).toEqual(once);
    expect(scrubConnectorValue(once, [])).toEqual(once);
  });

  it("runs every Quaderno step in order, the company pair under a second id whose lookups find nothing", async () => {
    const fake = await startFakeQuaderno();
    try {
      const recorder = new ConnectorRecorder(fake.baseUrl);
      const engine = new QuadernoTaxEngine({ baseUrl: fake.baseUrl, apiKey: fake.apiKey, fetch: recorder.fetch });
      await recordQuadernoRun({ recorder, engine, vatCountry: "DE", vatId: "DE-VALID-42", transactionId: "1790000000000" });
      const capture = recorder.capture("quaderno");
      expect(capture.steps.map((step) => `${step.step}:${step.outcome}`))
        .toEqual(QUADERNO_RECORDING_STEPS.map((step) => `${step}:OK`));
      const step = (name: string) => capture.steps.find((candidate) => candidate.step === name)!;
      expect(step("record-sale").exchanges[0]!.request.query).toEqual({ processor_id: "1790000000000" });
      for (const [name, path] of [["record-company-sale", "/invoices"], ["record-company-refund", "/credits"]] as const) {
        expect(step(name).exchanges[0]!.request).toEqual({ method: "GET", path, query: { processor_id: "1790000000001" }, body: null });
        expect(step(name).exchanges[0]!.response.body).toEqual([]);
      }
      const company = fake.sales.find((recorded) => recorded.processor_id === "1790000000001")!;
      expect(company).toMatchObject({
        customer: { first_name: "Test Company Ltd", email: "person@example.test", country: "DE", street_line_1: "1 Test Street",
          tax_id: "DE-VALID-42", kind: "company" },
        evidence: { billing_country: "DE", bank_country: "DE" },
        items: [{ quantity: 1, amount: 20, tax: { country: "DE", rate: 0, tax_code: "saas" } }],
        // Spec §2.8 step 5: the recording asks Quaderno whether it accepts "netopia".
        processor: "netopia", payment: { processor: "netopia" }
      });
      expect(fake.sales.map((recorded) => recorded.processor)).toEqual(["netopia", "netopia"]);
      expect(fake.refunds.map((recorded) => recorded.processor_id)).toEqual(["1790000000000", "1790000000001"]);
      for (const recorded of fake.refunds) {
        expect(recorded).toMatchObject({ processor: "netopia", payment: { processor: "netopia" } });
      }
      expect(QUADERNO_REVERSE_CHARGE_CHECK).toContain("Reverse charge");
    } finally {
      await fake.stop();
    }
  });

  it("books the company refund only when the company sale was booked", async () => {
    const fake = await startFakeQuaderno();
    try {
      // Quaderno refuses the company sale (422), as it would a shape it does not accept.
      const refusingCompany: typeof fetch = async (input, init) => (
        init?.method === "POST" && typeof init.body === "string" && init.body.includes('"kind":"company"')
          ? new Response('{"error":"refused"}', { status: 422, headers: { "content-type": "application/json" } })
          : fetch(input, init)
      );
      const recorder = new ConnectorRecorder(fake.baseUrl, refusingCompany);
      const engine = new QuadernoTaxEngine({ baseUrl: fake.baseUrl, apiKey: fake.apiKey, fetch: recorder.fetch });
      await recordQuadernoRun({ recorder, engine, vatCountry: "DE", vatId: "DE-VALID-42", transactionId: "1790000000000" });
      const outcomes = recorder.capture("quaderno").steps.map((step) => `${step.step}:${step.outcome}`);
      expect(outcomes.slice(-2)).toEqual(["record-refund-again:OK", "record-company-sale:TAX_SERVICE_REFUSED:QUADERNO_HTTP_422"]);
      expect(fake.refunds.map((recorded) => recorded.processor_id)).toEqual(["1790000000000"]);
    } finally {
      await fake.stop();
    }
  });

  it("replays a recorded step and names every request that differs from what the client sends today", async () => {
    const recorded = [{
      request: { method: "GET", path: "/tax_ids/validate", query: { country: "DE", tax_id: "SCRUBBED-ID" }, body: null },
      response: { status: 200, contentType: "application/json", body: { valid: true } }
    }];
    const same = replayFetch(recorded);
    const engine = new QuadernoTaxEngine({ baseUrl: REPLAY_BASE_URL, apiKey: "replay", fetch: same.fetch });
    expect((await engine.validateTaxId("DE", "SCRUBBED-ID")).valid).toBe(true);
    expect(same.mismatches).toEqual([]);
    expect(same.unused()).toBe(0);
    const other = replayFetch(recorded);
    await new QuadernoTaxEngine({ baseUrl: REPLAY_BASE_URL, apiKey: "replay", fetch: other.fetch }).validateTaxId("FR", "SCRUBBED-ID");
    expect(other.mismatches).toHaveLength(1);
  });
});
