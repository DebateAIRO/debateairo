import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { QuadernoTaxEngine } from "@debateai/tax-quaderno";
import {
  CONNECTOR_CAPTURE_FORMAT,
  ConnectorRecorder,
  quadernoRecordingSale
} from "../../tools/billing/record-connector.js";
import {
  CONNECTOR_FIXTURE_FORMATS,
  scrubConnectorValue,
  writeConnectorFixtures
} from "../../tools/billing/scrub-connector-fixture.js";
import { REPLAY_BASE_URL, replayFetch } from "../support/connectorReplay.js";

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
