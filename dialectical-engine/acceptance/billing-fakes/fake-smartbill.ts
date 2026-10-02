// acceptance/billing-fakes/fake-smartbill.ts
import { randomBytes } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export type FakeSmartBillInvoice = {
  series: string; number: string; kind: "INVOICE" | "STORNO"; body: Record<string, unknown>; reversedBy: string | null;
  /** SmartBill's own arithmetic per product (precision 2): the base and VAT it derives from what we sent. */
  derived: ReadonlyArray<Readonly<{ baseCents: number; vatCents: number }>>;
};
type Failure = "RATE_LIMIT" | "SERVER_ERROR" | "REFUSED" | "HTML" | "HTML_404" | "STALL";

/** How SmartBill turns a product line into base + VAT: from the gross when tax is included, else from the net. */
function derivedLines(products: unknown): Array<{ baseCents: number; vatCents: number }> {
  return (Array.isArray(products) ? products : []).map((product) => {
    const line = product as { price?: unknown; isTaxIncluded?: unknown; taxPercentage?: unknown };
    const cents = Math.round(Number(line.price) * 100);
    const percent = Number(line.taxPercentage);
    if (line.isTaxIncluded === true) {
      const baseCents = Math.round((cents * 100) / (100 + percent));
      return { baseCents, vatCents: cents - baseCents };
    }
    return { baseCents: cents, vatCents: Math.round((cents * percent) / 100) };
  });
}
export type FakeSmartBill = Readonly<{
  baseUrl: string; username: string; token: string; companyCif: string; series: string;
  invoices: ReadonlyMap<string, FakeSmartBillInvoice>;
  requestTimes: ReadonlyArray<number>;
  rateLimited(): number;
  failNext(kind: Failure): void;
  stop(): Promise<void>;
}>;

export async function startFakeSmartBill(options: Readonly<{
  username?: string; token?: string; companyCif?: string; series?: string; minGapMs?: number; port?: number;
}> = {}): Promise<FakeSmartBill> {
  const username = options.username ?? "billing@debateai.test";
  const token = options.token ?? randomBytes(12).toString("hex");
  // The company's CIF in the form P6a's SMARTBILL_CIF_FORM names (X1 row 16): the CUI's digits while it is "bare".
  // X1 row 16's flip to "ro" changes this default to "RO12345678" in the same commit (or P5 writes it so, when row
  // 16 already names the RO form at build time); P6a's billing-connectors test pins the pair.
  const companyCif = options.companyCif ?? "12345678";
  const series = options.series ?? "DBT";
  const minGapMs = options.minGapMs ?? 1_000;
  const expected = `Basic ${Buffer.from(`${username}:${token}`, "utf8").toString("base64")}`;
  const invoices = new Map<string, FakeSmartBillInvoice>();
  const requestTimes: number[] = [];
  let inFlight = 0;
  let lastEnd = 0;
  let limited = 0;
  let next = 0;
  let failure: Failure | null = null;

  const send = (response: ServerResponse, status: number, body: unknown): void => {
    response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    inFlight -= 1;
    lastEnd = Date.now();
  };
  const numberNext = (): string => { next += 1; return String(next).padStart(4, "0"); };

  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const now = Date.now();
      if (inFlight > 0 || (lastEnd > 0 && now - lastEnd < minGapMs)) {
        limited += 1;
        response.writeHead(429, { "content-type": "application/json" }).end('{"errorText":"Limita de apeluri depasita"}');
        return;
      }
      inFlight += 1;
      requestTimes.push(now);
      const url = new URL(request.url ?? "/", "http://fake.smartbill.test");
      if (request.headers.authorization !== expected) { send(response, 401, { errorText: "Unauthorized" }); return; }
      const failing = failure;
      failure = null;
      if (failing === "RATE_LIMIT") { send(response, 429, { errorText: "Limita de apeluri depasita" }); return; }
      if (failing === "SERVER_ERROR") { send(response, 500, { errorText: "Internal" }); return; }
      if (failing === "STALL") { inFlight -= 1; return; }
      if (failing === "HTML" || failing === "HTML_404") {
        response.writeHead(failing === "HTML" ? 200 : 404, { "content-type": "text/html" }).end("<html>error</html>");
        inFlight -= 1; lastEnd = Date.now();
        return;
      }
      if (failing === "REFUSED") { send(response, 200, { errorText: "Clientul nu este valid", number: "", series: "" }); return; }
      if (request.method === "POST" && url.pathname === "/SBORO/api/invoice/v2") {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
        if (body.companyVatCode !== companyCif || body.seriesName !== series || !Array.isArray(body.products) || body.products.length === 0) {
          send(response, 400, { errorText: "Date invalide" });
          return;
        }
        const number = numberNext();
        invoices.set(`${series}-${number}`, { series, number, kind: "INVOICE", body, reversedBy: null, derived: derivedLines(body.products) });
        send(response, 200, { errorText: "", message: "", number, series, url: "" });
        return;
      }
      if (request.method === "POST" && url.pathname === "/SBORO/api/invoice/reverse") {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
        const original = invoices.get(`${String(body.seriesName)}-${String(body.number)}`);
        if (original === undefined || original.reversedBy !== null || original.kind !== "INVOICE") {
          send(response, 400, { errorText: "Factura este deja stornata" });
          return;
        }
        const number = numberNext();
        const reference = `${series}-${number}`;
        invoices.set(reference, { series, number, kind: "STORNO", body, reversedBy: null, derived: [] });
        original.reversedBy = reference;
        send(response, 200, { errorText: "", message: "", number, series, url: "" });
        return;
      }
      if (request.method === "GET" && url.pathname === "/SBORO/api/invoice/pdf") {
        const found = invoices.get(`${url.searchParams.get("seriesname") ?? ""}-${url.searchParams.get("number") ?? ""}`);
        if (found === undefined || url.searchParams.get("cif") !== companyCif) { send(response, 404, { errorText: "Nu exista" }); return; }
        response.writeHead(200, { "content-type": "application/octet-stream" }).end(Buffer.from("%PDF-1.4\n% fake SmartBill invoice\n", "latin1"));
        inFlight -= 1; lastEnd = Date.now();
        return;
      }
      send(response, 404, { errorText: "Not found" });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const port = (server.address() as AddressInfo).port;
  return Object.freeze({
    baseUrl: `http://127.0.0.1:${port}/SBORO/api`,
    username, token, companyCif, series, invoices, requestTimes,
    rateLimited: () => limited,
    failNext(kind: Failure) { failure = kind; },
    async stop() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });
}
