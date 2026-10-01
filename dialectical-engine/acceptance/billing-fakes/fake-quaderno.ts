// acceptance/billing-fakes/fake-quaderno.ts
import { randomBytes } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { fakeTaxDecision, fakeTaxIdIsValid, fakeTaxMicros, fakeUsRegionFromPostalCode } from "./tax-rules.js";

type Recorded = Record<string, unknown> & { processor_id?: unknown; custom_metadata?: unknown };
export type FakeQuaderno = Readonly<{
  baseUrl: string;
  apiKey: string;
  requests: ReadonlyArray<Readonly<{ method: string; path: string; query: Readonly<Record<string, string>> }>>;
  sales: ReadonlyArray<Recorded>;
  refunds: ReadonlyArray<Recorded>;
  failNext(status: number, times?: number): void;
  failNextPost(status: number): void;
  stallNext(times?: number): void;
  overrideNextCalculation(fields: Readonly<Record<string, string>>): void;
  /** From now on GET /invoices and /credits ignore processor_id, as a Quaderno that dropped the filter would. */
  returnUnfilteredLists(): void;
  postCount(processorId: string): number;
  stop(): Promise<void>;
}>;

const cents = (micros: number): string => `${Math.floor(micros / 1_000_000)}.${String(Math.floor((micros % 1_000_000) / 10_000)).padStart(2, "0")}`;

export async function startFakeQuaderno(options: Readonly<{ apiKey?: string; port?: number }> = {}): Promise<FakeQuaderno> {
  const apiKey = options.apiKey ?? `fake_${randomBytes(12).toString("hex")}`;
  const expected = `Basic ${Buffer.from(`${apiKey}:`, "utf8").toString("base64")}`;
  const requests: Array<{ method: string; path: string; query: Record<string, string> }> = [];
  const sales: Recorded[] = [];
  const refunds: Recorded[] = [];
  const posts = new Map<string, number>();
  let failures: number[] = [];
  let postFailure: number | null = null;
  let stalls = 0;
  let override: Readonly<Record<string, string>> | null = null;
  let unfiltered = false;
  let nextId = 0;

  const send = (response: ServerResponse, status: number, text: string): void => {
    response.writeHead(status, { "content-type": "application/json" }).end(text);
  };

  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const url = new URL(request.url ?? "/", "http://fake.quaderno.test");
      requests.push({ method: request.method ?? "", path: url.pathname, query: Object.fromEntries(url.searchParams) });
      if (stalls > 0) { stalls -= 1; return; }
      const failure = failures.shift();
      if (failure !== undefined) { send(response, failure, '{"error":"fake failure"}'); return; }
      if (request.headers.authorization !== expected) { send(response, 401, '{"error":"unauthorized"}'); return; }
      if (request.method === "GET" && url.pathname === "/api/tax_rates/calculate") {
        const country = url.searchParams.get("to_country") ?? "";
        const net = Math.round(Number(url.searchParams.get("amount") ?? "0") * 100) * 10_000;
        const postal = url.searchParams.get("to_postal_code");
        const decision = fakeTaxDecision({
          country, region: country.toUpperCase() === "US" ? fakeUsRegionFromPostalCode(postal) : null,
          taxId: url.searchParams.get("tax_id")
        });
        const tax = decision.status === "TAXABLE" ? fakeTaxMicros(net, decision.basisPoints) : 0;
        const fields: Record<string, string> = {
          country: JSON.stringify(decision.country),
          region: decision.region === null ? "null" : JSON.stringify(decision.region),
          name: JSON.stringify(decision.name),
          rate: (decision.basisPoints / 100).toFixed(decision.basisPoints % 100 === 0 ? 1 : 2),
          tax_behavior: '"exclusive"',
          subtotal: cents(net),
          tax_amount: cents(tax),
          total_amount: cents(net + tax),
          status: JSON.stringify(decision.status.toLowerCase()),
          currency: '"USD"',
          tax_code: JSON.stringify(url.searchParams.get("tax_code") ?? "saas")
        };
        const applied = override === null ? fields : { ...fields, ...override };
        override = null;
        send(response, 200, `{${Object.entries(applied).map(([key, value]) => `"${key}":${value}`).join(",")}}`);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/tax_ids/validate") {
        send(response, 200, JSON.stringify({ valid: fakeTaxIdIsValid(url.searchParams.get("tax_id") ?? "") }));
        return;
      }
      if (request.method === "GET" && (url.pathname === "/api/invoices" || url.pathname === "/api/credits")) {
        const list = url.pathname === "/api/invoices" ? sales : refunds;
        const processorId = url.searchParams.get("processor_id");
        send(response, 200, JSON.stringify(list.filter((item) => unfiltered || item.processor_id === processorId).map((item) => ({
          id: item.id, number: item.number, permalink: item.permalink, custom_metadata: item.custom_metadata,
          processor_id: item.processor_id
        }))));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/transactions") {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Recorded;
        const processorId = String(body.processor_id);
        posts.set(processorId, (posts.get(processorId) ?? 0) + 1);
        if (postFailure !== null) { const status = postFailure; postFailure = null; send(response, status, '{"error":"fake"}'); return; }
        nextId += 1;
        const document = {
          ...body, id: nextId, number: `Q-${String(nextId).padStart(4, "0")}`,
          permalink: `https://quaderno.test/documents/${nextId}`, pdf: `https://quaderno.test/documents/${nextId}.pdf`
        };
        (body.type === "refund" ? refunds : sales).push(document);
        send(response, 201, JSON.stringify({ id: document.id, number: document.number, permalink: document.permalink, pdf: document.pdf }));
        return;
      }
      send(response, 404, '{"error":"not found"}');
    });
  });
  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", () => resolve()));
  const port = (server.address() as AddressInfo).port;
  return Object.freeze({
    baseUrl: `http://127.0.0.1:${port}/api`,
    apiKey,
    requests,
    sales,
    refunds,
    failNext(status: number, times = 1) { failures = [...failures, ...Array.from({ length: times }, () => status)]; },
    failNextPost(status: number) { postFailure = status; },
    stallNext(times = 1) { stalls += times; },
    overrideNextCalculation(fields: Readonly<Record<string, string>>) { override = fields; },
    returnUnfilteredLists() { unfiltered = true; },
    postCount(processorId: string) { return posts.get(processorId) ?? 0; },
    async stop() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });
}
