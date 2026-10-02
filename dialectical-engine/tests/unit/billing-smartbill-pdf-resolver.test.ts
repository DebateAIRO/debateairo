import { describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import { smartBillPdfResolver, type SmartBillPort } from "../../apps/api/src/billing/invoice-smartbill.js";

/** Only `pdf` is exercised; the other members are never called by the resolver. */
function issuerWithPdf(pdf: NonNullable<SmartBillPort["pdf"]>): SmartBillPort {
  const unused = async (): Promise<never> => { throw new Error("not called"); };
  return { issue: unused, storno: unused, pdf };
}

const FIELDS = { series: "DBAI", number: "0042" };

describe("P10b the SmartBill PDF attachment of M2", () => {
  it("resolves to nothing when SmartBill refuses the PDF, so M2 goes out at once without it", async () => {
    const resolve = smartBillPdfResolver({
      issuer: issuerWithPdf(async () => { throw new TypedDomainError("INVOICE_SERVICE_REFUSED", "SMARTBILL_PDF_INVALID"); })
    });
    await expect(resolve(FIELDS, "ro")).resolves.toBeNull();
  });

  it("rejects when SmartBill cannot be reached, so the EMAIL job retries", async () => {
    const resolve = smartBillPdfResolver({
      issuer: issuerWithPdf(async () => { throw new TypedDomainError("INVOICE_SERVICE_UNAVAILABLE", "SmartBill could not be reached"); })
    });
    await expect(resolve(FIELDS, "ro")).rejects.toMatchObject({ code: "INVOICE_SERVICE_UNAVAILABLE" });
  });

  it("attaches a working PDF as <series>-<number>.pdf", async () => {
    const bytes = Buffer.from("%PDF-1.4 DBAI 0042");
    const resolve = smartBillPdfResolver({ issuer: issuerWithPdf(async () => bytes) });
    expect(await resolve(FIELDS, "ro")).toEqual({ filename: "DBAI-0042.pdf", contentType: "application/pdf", content: bytes });
  });
});
