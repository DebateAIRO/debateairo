// tests/support/fake-invoice-issuer.ts
import { TypedDomainError } from "@debateai/kernel";
import type {
  InvoiceErrorCode, InvoiceIssuer, IssuedDocument, RefundRecord, SaleRecord
} from "@debateai/billing-core";

/**
 * In-memory InvoiceIssuer for route tests (P10): numbered invoices, a single reversal, injectable failures.
 * `lookup` exists only with `{ withLookup: true }`, so P10b can test both sides of the R-24 fallback.
 * `sales` keeps every sale an invoice was issued for (its customer and lines), as SmartBill would print them.
 */
export class FakeInvoiceIssuer implements InvoiceIssuer {
  readonly issued: Array<Readonly<{ kind: "INVOICE" | "STORNO" | "CREDIT"; chargeId: string; externalRef: string }>> = [];
  readonly sales: SaleRecord[] = [];
  readonly lookup?: (i: Readonly<{ chargeId: string; kind: "INVOICE" | "CREDIT_NOTE" }>) => Promise<IssuedDocument | null>;
  readonly #reversed = new Set<string>();
  readonly #failures: InvoiceErrorCode[] = [];
  readonly #byCharge = new Map<string, IssuedDocument>();
  #next = 0;

  constructor(options: Readonly<{ withLookup?: boolean }> = {}) {
    if (options.withLookup === true) {
      this.lookup = async (i) => this.#byCharge.get(`${i.kind}:${i.chargeId}`) ?? null;
    }
  }

  failNext(code: InvoiceErrorCode): void {
    this.#failures.push(code);
  }

  #take(kind: "INVOICE" | "STORNO" | "CREDIT", chargeId: string): { series: string; number: string; externalRef: string } {
    const code = this.#failures.shift();
    if (code !== undefined) throw new TypedDomainError(code, "fake invoice issuer failure");
    this.#next += 1;
    const number = String(this.#next).padStart(4, "0");
    const document = { series: "FAKE", number, externalRef: `FAKE-${number}` };
    this.issued.push({ kind, chargeId, externalRef: document.externalRef });
    this.#byCharge.set(`${kind === "INVOICE" ? "INVOICE" : "CREDIT_NOTE"}:${chargeId}`, document);
    return document;
  }

  async issue(i: SaleRecord) {
    const document = this.#take("INVOICE", i.chargeId);
    this.sales.push(i);
    return document;
  }

  async storno(i: RefundRecord & Readonly<{ series: string; number: string }>) {
    const original = `${i.series}-${i.number}`;
    if (this.#reversed.has(original)) throw new TypedDomainError("INVOICE_SERVICE_REFUSED", "SMARTBILL_REFUSED");
    const document = this.#take("STORNO", i.chargeId);
    this.#reversed.add(original);
    return document;
  }

  async creditPartial(i: RefundRecord & Readonly<{
    series: string; number: string; taxRateBasisPoints: number; customer: SaleRecord["customer"];
  }>) {
    return this.#take("CREDIT", i.chargeId);
  }

  async pdf(_i: Readonly<{ series: string; number: string }>): Promise<Uint8Array> {
    return new Uint8Array(Buffer.from("%PDF-1.4\n% fake\n", "latin1"));
  }
}
