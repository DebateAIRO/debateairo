// tests/support/fake-tax-engine.ts
import { TypedDomainError } from "@debateai/kernel";
import type {
  RefundRecord, SaleRecord, TaxEngine, TaxErrorCode, TaxIdCheck, TaxLocation, TaxQuote
} from "@debateai/billing-core";
import {
  FAKE_REVERSE_CHARGE_COUNTRIES, fakeTaxDecision, fakeTaxIdIsValid, fakeTaxMicros
} from "../../acceptance/billing-fakes/tax-rules.js";

// R-16: tests reach the fake rate rule through tests/support/, never through acceptance/ directly.
export { FAKE_REVERSE_CHARGE_COUNTRIES, fakeTaxDecision, fakeTaxIdIsValid, fakeTaxMicros };

/** In-memory TaxEngine for route tests (P8–P14): fixed rates, the VALID rule, idempotent records. */
export class FakeTaxEngine implements TaxEngine {
  readonly sales: SaleRecord[] = [];
  readonly refunds: RefundRecord[] = [];
  readonly #failures: TaxErrorCode[] = [];
  readonly #saleDocuments = new Map<string, { documentId: string; number: string; url: string | null }>();
  readonly #refundDocuments = new Map<string, { documentId: string; number: string }>();

  failNext(code: TaxErrorCode): void {
    this.#failures.push(code);
  }

  #maybeFail(): void {
    const code = this.#failures.shift();
    if (code !== undefined) throw new TypedDomainError(code, "fake tax engine failure");
  }

  async quote(i: Readonly<{
    netMicros: number; currency: "USD"; location: TaxLocation; taxId: string | null; taxCode: "saas" | "eservice"; date: Date;
  }>): Promise<TaxQuote> {
    this.#maybeFail();
    // P2-M29: by postal code, as Quaderno and the HTTP fake price it (a state the buyer typed is never sent).
    const decision = fakeTaxDecision({ country: i.location.country, postalCode: i.location.postalCode, taxId: i.taxId });
    const taxMicros = decision.status === "TAXABLE" ? fakeTaxMicros(i.netMicros, decision.basisPoints) : 0;
    return Object.freeze({
      netMicros: i.netMicros, taxMicros, totalMicros: i.netMicros + taxMicros,
      taxRateBasisPoints: decision.status === "TAXABLE" ? decision.basisPoints : 0,
      taxName: decision.name, taxCountry: decision.country, taxRegion: decision.region, status: decision.status,
      reference: null
    });
  }

  async validateTaxId(_country: string, taxId: string): Promise<TaxIdCheck> {
    this.#maybeFail();
    const valid = fakeTaxIdIsValid(taxId);
    return Object.freeze({ valid, name: valid ? "Fake Company SRL" : null, checkedAt: new Date(), reference: null });
  }

  async recordSale(i: SaleRecord): Promise<{ documentId: string; number: string; url: string | null }> {
    this.#maybeFail();
    const existing = this.#saleDocuments.get(i.transactionId);
    if (existing !== undefined) return existing;
    this.sales.push(i);
    const index = this.sales.length;
    const document = { documentId: `fake-sale-${index}`, number: `Q-${String(index).padStart(4, "0")}`, url: `https://quaderno.test/documents/sale-${index}` };
    this.#saleDocuments.set(i.transactionId, document);
    return document;
  }

  async recordRefund(i: RefundRecord): Promise<{ documentId: string; number: string }> {
    this.#maybeFail();
    const key = `${i.chargeId}:${i.transactionId}`;
    const existing = this.#refundDocuments.get(key);
    if (existing !== undefined) return existing;
    this.refunds.push(i);
    const index = this.refunds.length;
    const document = { documentId: `fake-refund-${index}`, number: `QC-${String(index).padStart(4, "0")}` };
    this.#refundDocuments.set(key, document);
    return document;
  }
}
