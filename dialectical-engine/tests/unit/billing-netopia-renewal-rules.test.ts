import { describe, expect, it } from "vitest";
import { MAIL_TEMPLATES, renderMail } from "@debateai/mail-templates";
import { NETOPIA_NOTIFY_PATH } from "../../apps/api/src/billing/index.js";
import {
  clientIdOf, netopiaNotifyUrl, payerFromProfile, paymentReturnUrl
} from "../../apps/api/src/billing/netopia-payer.js";
import type { BillingProfile } from "../../apps/api/src/billing/records.js";
import { isThisPaymentSystem } from "../../apps/api/src/billing/outbox.js";
import { renewalFailureOf } from "../../apps/api/src/billing/renewal.js";

const PROFILE: BillingProfile = Object.freeze({
  email: "stored@example.test", locale: "ro", name: "Ana Pop", firstName: "Ana", lastName: "Pop", phone: "+40712345678",
  paymentIp: "198.51.100.7", country: "RO", region: "Cluj", postalCode: "400001", city: "Cluj-Napoca",
  street: "Strada Memorandumului 1", company: null
});

describe("N11 the payer NETOPIA receives (spec §2.5.3, §2.9.2 step 1)", () => {
  it("takes names, phone and address from the newest profile and the email from the account's current address", () => {
    expect(payerFromProfile(PROFILE, "current@example.test")).toEqual({
      firstName: "Ana", lastName: "Pop", email: "current@example.test", phone: "+40712345678", country: "RO",
      region: "Cluj", city: "Cluj-Napoca", postalCode: "400001", street: "Strada Memorandumului 1"
    });
  });

  it("keeps a missing region and a missing postcode as null (NETOPIA's state falls back to the city in the package)", () => {
    expect(payerFromProfile({ ...PROFILE, region: null, postalCode: null }, "current@example.test"))
      .toMatchObject({ region: null, postalCode: null });
  });

  it("is incomplete (null) without a first name, last name, phone, city, street or a current address", () => {
    for (const field of ["firstName", "lastName", "phone", "city", "street"] as const) {
      expect(payerFromProfile({ ...PROFILE, [field]: null }, "current@example.test"), field).toBeNull();
      expect(payerFromProfile({ ...PROFILE, [field]: "   " }, "current@example.test"), field).toBeNull();
    }
    expect(payerFromProfile(PROFILE, null)).toBeNull();
    expect(payerFromProfile(null, "current@example.test")).toBeNull();
  });

  it("refuses a phone that is not E.164", () => {
    expect(payerFromProfile({ ...PROFILE, phone: "0712345678" }, "current@example.test")).toBeNull();
  });
});

describe("N11 the ids and addresses every NETOPIA payment carries", () => {
  it("writes the client id as the customer uuid without dashes, in lower case (spec §2.6.4)", () => {
    expect(clientIdOf("0B4E2A9C-6F1D-4C3E-9A7B-2D5F8E1C0A93")).toBe("0b4e2a9c6f1d4c3e9a7b2d5f8e1c0a93");
    expect(() => clientIdOf("not-a-uuid")).toThrow("BILLING_CUSTOMER_ID_INVALID");
  });

  it("points the notify address at the UI proxy's path of the notify route", () => {
    expect(netopiaNotifyUrl("https://dezbatere.test")).toBe("https://dezbatere.test/api/v1/billing/netopia/notify");
    expect(new URL(netopiaNotifyUrl("https://dezbatere.test")).pathname).toBe(`/api${NETOPIA_NOTIFY_PATH}`);
  });

  it("returns to the page that polls the charge", () => {
    expect(paymentReturnUrl("https://dezbatere.test", "/checkout/return", "0123456789abcdef0123456789abcdef"))
      .toBe("https://dezbatere.test/checkout/return?charge=0123456789abcdef0123456789abcdef");
    expect(paymentReturnUrl("https://dezbatere.test", "/settings/card", "0123456789abcdef0123456789abcdef"))
      .toBe("https://dezbatere.test/settings/card?charge=0123456789abcdef0123456789abcdef");
  });
});

describe("N11 which payment system a row belongs to (spec §2.5.4)", () => {
  it("serves the API's NETOPIA environment, and nothing else (N23: `isThisPaymentSystem`)", () => {
    expect(isThisPaymentSystem({ paymentProvider: "netopia", paymentEnvironment: "sandbox" }, "sandbox")).toBe(true);
    expect(isThisPaymentSystem({ paymentProvider: "netopia", paymentEnvironment: "live" }, "live")).toBe(true);
    // Provider and environment together: a NETOPIA row of the other environment is another system's.
    expect(isThisPaymentSystem({ paymentProvider: "netopia", paymentEnvironment: "live" }, "sandbox")).toBe(false);
    expect(isThisPaymentSystem({ paymentProvider: "netopia", paymentEnvironment: "sandbox" }, "live")).toBe(false);
  });
});

describe("N11 the final unpaid states of a renewal (spec §2.9.2 step 4, §2.9.4)", () => {
  it("maps each state NETOPIA reports to its FAILED code, and leaves the others undecided", () => {
    expect(renewalFailureOf("DECLINED")).toBe("PAYMENT_DECLINED");
    expect(renewalFailureOf("ACTION_REQUIRED")).toBe("AUTHENTICATION_REQUIRED");
    expect(renewalFailureOf("FAILED")).toBe("PAYMENT_FAILED");
    expect(renewalFailureOf("EXPIRED")).toBe("PAYMENT_EXPIRED");
    expect(renewalFailureOf("VOIDED")).toBe("VOIDED");
    for (const state of ["PENDING", "AUTHORIZED", "PAID", "REFUNDED", "CHARGEBACK_OPENED", "CHARGEBACK_LOST",
      "CHARGEBACK_REPRESENTED", "UNCLEAR"] as const) {
      expect(renewalFailureOf(state), state).toBeNull();
    }
  });
});

describe("N11 M5 when the bank asks the person to confirm a renewal (mail.M5.confirmCard)", () => {
  const base = { plan: "PLUS", retryDate: "2026-11-02T10:00:00.000Z", cardPageUrl: "https://dezbatere.test/settings/card" };
  it("asks for the card to be confirmed, in English and Romanian, and never says the bank refused", () => {
    const en = renderMail("M5A", "en", { ...base, bankDeclined: "false", confirmCard: "true" });
    expect(en.text).toContain("Your bank asked you to confirm this payment. Please confirm your card in Settings, and we'll try again.");
    expect(en.text).not.toContain("Your bank refused the payment.");
    const ro = renderMail("M5A", "ro", { ...base, bankDeclined: "false", confirmCard: "true" });
    expect(ro.text).toContain(
      "Banca dumneavoastră a cerut să confirmați această plată. Vă rugăm să vă confirmați cardul în Setări, iar noi vom încerca din nou."
    );
  });

  it("lets the confirmation sentence win over the bank's refusal, and keeps today's M5 without the flag", () => {
    expect(renderMail("M5B", "en", { ...base, bankDeclined: "true", confirmCard: "true" }).text)
      .not.toContain("Your bank refused the payment.");
    const declined = renderMail("M5C", "en", { ...base, bankDeclined: "true" }).text;
    expect(declined).toContain("Your bank refused the payment.");
    expect(declined).not.toContain("confirm this payment");
    expect(MAIL_TEMPLATES.M5A.optional).toEqual({ confirmCard: "flag" });
  });
});

describe("N11 O3 for a payment that needs the owner (paymentAlert)", () => {
  it("says what happened to a payment instead of the dead-job sentences", () => {
    const owner = renderMail("O3", "en", {
      jobKind: "PAYMENT", reference: "charge 0123456789abcdef0123456789abcdef", reasonCode: "RENEWAL_OUTCOME_OPEN",
      nextSteps: "Check the order in NETOPIA's admin.", paymentAlert: "true"
    });
    expect(owner.subject).toBe("Billing needs your attention (RENEWAL_OUTCOME_OPEN)");
    expect(owner.text).toContain("A payment needs your attention. Nothing more was charged, and the customer was not emailed about it.");
    expect(owner.text).toContain("Reason code: RENEWAL_OUTCOME_OPEN");
    expect(owner.text).not.toContain("A job that issues an invoice");
    expect(owner.text).toContain("This email is sent once for this reference and reason within the hour.");
  });
});
