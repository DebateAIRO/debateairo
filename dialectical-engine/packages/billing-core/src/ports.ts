// The connector ports (contract §3) with the R1 additions: SaleRecord.customer.city/street and
// SaleLine.taxMicros (the SmartBill e-Factura address and the exact quoted tax per line), RefundRecord.description
// (the credit line in the customer's language), and the three
// OPTIONAL InvoiceIssuer members lookup (A17b), creditPartial (A17c) and pdf (A26b). R-24: an issuer
// offers each only when its API confirms it (X1); P10b defines what happens when one is absent.
export type TaxLocation = Readonly<{
  country: string; region: string | null; postalCode: string | null; city: string | null; street: string | null; ip: string | null;
}>;
export type TaxStatus = "TAXABLE" | "NON_TAXABLE" | "NOT_REGISTERED" | "REVERSE_CHARGE";
export type TaxQuote = Readonly<{
  netMicros: number; taxMicros: number; totalMicros: number; taxRateBasisPoints: number; taxName: string;
  taxCountry: string; taxRegion: string | null; status: TaxStatus; reference: string | null;
}>;
export type TaxIdCheck = Readonly<{ valid: boolean; name: string | null; checkedAt: Date; reference: string | null }>;
export type SaleLine = Readonly<{ description: string; netMicros: number; taxMicros: number; taxRateBasisPoints: number }>;
export type SaleRecord = Readonly<{
  chargeId: string; transactionId: string; issuedOn: Date;
  customer: Readonly<{
    name: string | null; email: string; country: string; region: string | null; postalCode: string | null;
    city: string | null; street: string | null; taxId: string | null; locale: string;
  }>;
  lines: ReadonlyArray<SaleLine>;
  taxCode: "saas" | "eservice";
  evidence: Readonly<{ billingCountry: string; ipAddress: string | null; bankCountry: string | null }>;
  /**
   * N10 (spec §2.8 step 5): who took the payment `transactionId` names (NETOPIA's ntpID, or xMoney's number). Absent:
   * "xmoney", for the documents of xMoney-era charges (N23 makes it required and "netopia" only).
   */
  processor?: "xmoney" | "netopia";
}>;
export type RefundRecord = Readonly<{
  chargeId: string; transactionId: string; issuedOn: Date; refundTotalMicros: number;
  original: Readonly<{ documentId: string; number: string }>;
  /**
   * The credit line's text in the customer's locale (P10a takes it from the catalogue, as it does a sale line's
   * description), so a connector never writes its own English on a customer's credit note.
   */
  description: string;
  /**
   * N10 (spec §2.8 step 5): who took the payment `transactionId` names (NETOPIA's ntpID, or xMoney's number). Absent:
   * "xmoney", for the documents of xMoney-era charges (N23 makes it required and "netopia" only).
   */
  processor?: "xmoney" | "netopia";
}>;
export type TaxErrorCode = "TAX_SERVICE_UNAVAILABLE" | "TAX_SERVICE_REFUSED";
export type InvoiceErrorCode = "INVOICE_SERVICE_UNAVAILABLE" | "INVOICE_SERVICE_REFUSED" | "INVOICE_UNKNOWN";

export interface TaxEngine {
  quote(i: Readonly<{
    netMicros: number; currency: "USD"; location: TaxLocation; taxId: string | null; taxCode: "saas" | "eservice"; date: Date;
  }>): Promise<TaxQuote>;
  validateTaxId(country: string, taxId: string): Promise<TaxIdCheck>;
  recordSale(i: SaleRecord): Promise<{ documentId: string; number: string; url: string | null }>;
  recordRefund(i: RefundRecord): Promise<{ documentId: string; number: string }>;
}

/** A legal document an issuer numbered: the contract's `{series, number, externalRef}`. */
export type IssuedDocument = Readonly<{ series: string; number: string; externalRef: string }>;

export interface InvoiceIssuer {
  issue(i: SaleRecord): Promise<IssuedDocument>;
  /** Reverses the WHOLE invoice (full refund). */
  storno(i: RefundRecord & Readonly<{ series: string; number: string }>): Promise<IssuedDocument>;
  /**
   * A17b, optional: finds a document an earlier, unanswered call may have created, by our charge id. Absent
   * (SmartBill, X1 row 8) → P10b sends the job dead as INVOICE_UNKNOWN instead of calling `issue` again.
   */
  lookup?(i: Readonly<{ chargeId: string; kind: "INVOICE" | "CREDIT_NOTE" }>): Promise<IssuedDocument | null>;
  /**
   * A17c, optional: a partial refund is a NEW invoice with one negative line at the refunded total (tax
   * included) naming the original `series-number`; `customer` is the original sale's buyer (P10a's
   * `saleRecordOf(...).customer`). Absent → P10b sends the job dead as CREDIT_NOTE_MANUAL.
   */
  creditPartial?(i: RefundRecord & Readonly<{
    series: string; number: string; taxRateBasisPoints: number; customer: SaleRecord["customer"];
  }>): Promise<IssuedDocument>;
  /** A26b, optional: the legal PDF for the receipt e-mail attachment. Absent → M2 goes without it. */
  pdf?(i: Readonly<{ series: string; number: string }>): Promise<Uint8Array>;
}
