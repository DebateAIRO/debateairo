// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import { CardChangeFlow, type CardChangeClient } from "../../apps/ui/components/billing/CardChangeFlow.js";
import billingEnglish from "../../apps/ui/messages/en/billing.json" with { type: "json" };

const EN = billingEnglish as Readonly<Record<string, string>>;
const CONSENT = Object.freeze({ version: "consent-renewal-1", sha256: "a".repeat(64) });
const DETAILS = Object.freeze({
  country: "RO", region: "Cluj", first_name: "Ana", last_name: "Pop", phone: "+40712345678", street: "Strada Memorandumului 1",
  city: "Cluj-Napoca", postal_code: "400001"
});
const SUBSCRIBED = Object.freeze({ subscription: { renewal_total: "24.20", currency: "USD" } });
const PAGE = "https://secure-sandbox.netopia-payments.com/ui/card?p=fedcba987654";
const continueButton = (container: HTMLElement) =>
  [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === EN["billing.card.checkCard"]);

const mocks = vi.hoisted(() => ({
  session: null as string | null, billingOn: true, sessionLive: true, sessionCheckedWith: [] as string[]
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "__Host-debateai-session" && mocks.session !== null ? { value: mocks.session } : undefined)
  }),
  headers: async () => new Headers({ "user-agent": "card-page-test" })
}));
// P19's judge carry (progress.md, before P20): billing off is "not found" before any redirect, and a cookie alone is
// not a session, so the page asks P19's sessionConfirmed, as /checkout does.
vi.mock("@/lib/billing/serverBilling", () => ({
  billingIsOn: async () => mocks.billingOn,
  sessionConfirmed: async (sessionToken: string) => { mocks.sessionCheckedWith.push(sessionToken); return mocks.sessionLive; }
}));

import CardChangePage from "../../apps/ui/app/settings/card/page.js";
import { readRedirects, resetRedirects } from "./stubs/next-navigation.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  resetRedirects();
  // A case that fails part-way must not leak its session or billing switch into the next one.
  mocks.session = null;
  mocks.billingOn = true;
  mocks.sessionLive = true;
  mocks.sessionCheckedWith = [];
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
async function settle(): Promise<void> {
  for (let hop = 0; hop < 6; hop += 1) await act(async () => { await Promise.resolve(); });
}

describe("P20 the card change page (A11, A12)", () => {
  it("pre-fills the billing details, keeps the country and region fixed, takes the agreement and leaves for NETOPIA's check", async () => {
    const goToPayment = vi.fn();
    const client = {
      getBillingCardDetails: vi.fn(async () => DETAILS),
      getBillingSubscription: vi.fn(async () => SUBSCRIBED),
      startCardChange: vi.fn(async () => ({ redirect_url: PAGE, charge_ref: "fedcba9876543210fedcba9876543210", hold_amount: "0.00" })),
      getBillingCharge: vi.fn()
    };
    await act(async () => {
      root.render(<CardChangeFlow catalog={billingEnglish} locale="en" renewalConsent={CONSENT}
        client={client as unknown as CardChangeClient} goToPayment={goToPayment} />);
    });
    await settle();
    expect(container.querySelector<HTMLInputElement>("#card-firstName")!.value).toBe("Ana");
    expect(container.querySelector<HTMLInputElement>("#card-country")!.readOnly).toBe(true);
    expect(container.querySelector<HTMLInputElement>("#card-region")!.value).toBe("Cluj");
    expect(container.textContent).toContain(EN["billing.card.noHoldNote"]);
    expect(container.textContent).toContain(EN["billing.card.taxPlaceNote"]);
    // Spec §2.18: the card-saving agreement with the plan's monthly total, before the button.
    expect(container.textContent).toContain(EN["billing.consent.renewal"]!.replace("{total}", "$24.20"));
    expect(continueButton(container)!.disabled).toBe(true);
    await act(async () => { container.querySelector<HTMLInputElement>("#card-agreement")!.click(); });
    await act(async () => { continueButton(container)!.click(); });
    await settle();
    expect(client.startCardChange).toHaveBeenCalledWith({
      locale: "en", renewal_terms: CONSENT, first_name: "Ana", last_name: "Pop", phone: "+40712345678",
      street: "Strada Memorandumului 1", city: "Cluj-Napoca", postal_code: "400001"
    });
    expect(goToPayment.mock.calls).toEqual([[PAGE]]);
  });

  it("names why no check is offered when the read has no total, never a button that cannot enable", async () => {
    for (const [subscription, sentence] of [
      // A pending cancel: the plan is charged no more, so there is no agreement to give.
      [{ renewal_total: null, currency: "USD", cancel_requested: true }, EN["billing.subscription.wontRenew"]],
      // Any other read without a total: a plain error, not a silent page.
      [{ renewal_total: null, currency: "USD", cancel_requested: false }, EN["billing.checkout.genericError"]]
    ] as const) {
      act(() => root.unmount());
      root = createRoot(container);
      const client = {
        getBillingCardDetails: vi.fn(async () => DETAILS), getBillingSubscription: vi.fn(async () => ({ subscription })),
        startCardChange: vi.fn(), getBillingCharge: vi.fn()
      };
      await act(async () => {
        root.render(<CardChangeFlow catalog={billingEnglish} locale="en" renewalConsent={CONSENT}
          client={client as unknown as CardChangeClient} />);
      });
      await settle();
      // Control: the details did load, so the sentence stands where the agreement and the button would.
      expect(container.querySelector<HTMLInputElement>("#card-firstName")!.value).toBe("Ana");
      expect(container.textContent).toContain(sentence);
      expect(continueButton(container)).toBeUndefined();
      expect(container.querySelector("#card-agreement")).toBeNull();
    }
  });

  it("says a check that saved no card asks to try again, then another card, and names no wallet (N13's CARD_NOT_SAVED, PR-63)", async () => {
    const client = {
      getBillingCardDetails: vi.fn(), getBillingSubscription: vi.fn(), startCardChange: vi.fn(),
      getBillingCharge: vi.fn(async () => ({ state: "FAILED" as const, reason_code: "CARD_NOT_SAVED", kind: "CARD_CHECK" as const }))
    };
    await act(async () => {
      root.render(<CardChangeFlow catalog={billingEnglish} locale="en" renewalConsent={CONSENT}
        returnedChargeRef="fedcba9876543210fedcba9876543210" client={client as unknown as CardChangeClient} />);
    });
    await settle();
    expect(container.textContent).toContain(EN["billing.card.notSaved"]);
    expect(EN["billing.card.notSaved"]).toBe("Your card was checked, but it couldn't be saved for your monthly payments."
      + " Please try again; if it happens again, use another card.");
    expect(client.startCardChange).not.toHaveBeenCalled();
  });

  it("says plainly that a card needs an active plan, that a pending deletion or an open payment takes no new card, and that the Terms come first", async () => {
    for (const [status, code, sentence] of [
      [409, "NOT_SUBSCRIBED", "You need an active plan to change the card."],
      [409, "ACCOUNT_ERASURE_PENDING", "Your account is scheduled for deletion. Cancel the deletion in Settings to subscribe or change your plan."],
      // D6b's P12e: a renewal or an upgrade payment is still being confirmed.
      [409, "CARD_CHANGE_NOT_AVAILABLE_NOW", "We couldn't save your new card just now because a payment on your plan is still being confirmed. Your current card stays in use; please try again in an hour."],
      [403, "LEGAL_REACCEPTANCE_REQUIRED", "Please accept the updated Terms first, then come back to this page."],
      // W10 (P2-M19): the card change spends the hourly budget it shares with quotes, downgrades and undos.
      [429, "ADMISSION_RATE_LIMITED", "Too many tries in the last hour. Please try again later."],
      // F4 (finding ui-2): the agreement the page carries was superseded while it was open; only a reload fixes it.
      [409, "LEGAL_DOCUMENT_STALE", "This page is out of date. Please reload it."]
    ] as const) {
      act(() => root.unmount());
      root = createRoot(container);
      const client = {
        getBillingCardDetails: vi.fn(async () => DETAILS), getBillingSubscription: vi.fn(async () => SUBSCRIBED),
        startCardChange: vi.fn(async () => { throw new ContractHttpError(status === 403 ? "FORBIDDEN" : "SERVER_FAILURE", status, "x", code); }),
        getBillingCharge: vi.fn()
      };
      await act(async () => {
        root.render(<CardChangeFlow catalog={billingEnglish} locale="en" renewalConsent={CONSENT}
          client={client as unknown as CardChangeClient} />);
      });
      await settle();
      await act(async () => { container.querySelector<HTMLInputElement>("#card-agreement")!.click(); });
      await act(async () => { continueButton(container)!.click(); });
      await settle();
      expect(container.textContent, code).toContain(sentence);
      expect(container.textContent, code).not.toContain("Something went wrong");
      // W10 (P2-M20): only the updated-Terms sentence is a link, a plain anchor to the signed-in home page (L4's
      // accept screen), so leaving the card page is a full page load (P2-I14).
      const link = container.querySelector<HTMLAnchorElement>('[role="alert"] a');
      if (code === "LEGAL_REACCEPTANCE_REQUIRED") {
        expect(link?.textContent, code).toBe(sentence);
        expect(link?.getAttribute("href"), code).toBe("/");
      } else {
        expect(link, code).toBeNull();
      }
    }
  });

  it("back from the bank's check (P12e's backUrl ?charge=), polls that charge instead of starting again", async () => {
    const client = {
      getBillingCardDetails: vi.fn(async () => DETAILS), getBillingSubscription: vi.fn(async () => SUBSCRIBED),
      startCardChange: vi.fn(),
      getBillingCharge: vi.fn(async () => ({ state: "SUCCEEDED" as const, reason_code: null }))
    };
    await act(async () => {
      root.render(<CardChangeFlow catalog={billingEnglish} locale="en" renewalConsent={CONSENT}
        returnedChargeRef="fedcba9876543210fedcba9876543210" client={client as unknown as CardChangeClient} />);
    });
    await settle();
    expect(client.getBillingCharge).toHaveBeenCalledWith("fedcba9876543210fedcba9876543210");
    expect(client.startCardChange).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Your new card is saved. Future payments use it.");
  });

  it("a new card from a country we cannot serve: the page says nothing was charged and the old card stays (no email follows)", async () => {
    const client = {
      getBillingCardDetails: vi.fn(async () => DETAILS), getBillingSubscription: vi.fn(async () => SUBSCRIBED),
      startCardChange: vi.fn(),
      getBillingCharge: vi.fn(async () => ({ state: "FAILED" as const, reason_code: "CARD_CHECK_REFUSED" }))
    };
    await act(async () => {
      root.render(<CardChangeFlow catalog={billingEnglish} locale="en" renewalConsent={CONSENT}
        returnedChargeRef="fedcba9876543210fedcba9876543210" client={client as unknown as CardChangeClient} />);
    });
    await settle();
    expect(container.textContent).toContain(
      "We can't accept cards issued in that card's country. Nothing was charged, and your plan keeps the card it had."
    );
    expect(container.textContent).not.toContain("The card couldn't be checked.");
  });

  it("a card check deferred because a plan payment is still open (D6b's CARD_CHECK_DEFERRED) asks to try again, never 'saved'", async () => {
    const client = {
      getBillingCardDetails: vi.fn(async () => DETAILS), getBillingSubscription: vi.fn(async () => SUBSCRIBED),
      startCardChange: vi.fn(),
      getBillingCharge: vi.fn(async () => ({ state: "FAILED" as const, reason_code: "CARD_CHECK_DEFERRED" }))
    };
    await act(async () => {
      root.render(<CardChangeFlow catalog={billingEnglish} locale="en" renewalConsent={CONSENT}
        returnedChargeRef="fedcba9876543210fedcba9876543210" client={client as unknown as CardChangeClient} />);
    });
    await settle();
    expect(container.textContent).toContain(
      "We couldn't save your new card just now because a payment on your plan is still being confirmed. Your current card stays in use; please try again in an hour."
    );
    expect(container.textContent).not.toContain("Your new card is saved.");
    expect(container.textContent).not.toContain("The card couldn't be checked.");
  });

  it("a plan that stopped being live during the check (CARD_CHECK_NOT_LIVE) says a card needs an active plan, never 'saved'", async () => {
    const client = {
      getBillingCardDetails: vi.fn(async () => DETAILS), getBillingSubscription: vi.fn(async () => SUBSCRIBED),
      startCardChange: vi.fn(),
      getBillingCharge: vi.fn(async () => ({ state: "FAILED" as const, reason_code: "CARD_CHECK_NOT_LIVE" }))
    };
    await act(async () => {
      root.render(<CardChangeFlow catalog={billingEnglish} locale="en" renewalConsent={CONSENT}
        returnedChargeRef="fedcba9876543210fedcba9876543210" client={client as unknown as CardChangeClient} />);
    });
    await settle();
    expect(container.textContent).toContain("You need an active plan to change the card.");
    expect(container.textContent).not.toContain("Your new card is saved.");
    expect(container.textContent).not.toContain("The card couldn't be checked.");
  });

  it("after two minutes of waiting on a card check, says it is still being confirmed and promises no email", async () => {
    vi.useFakeTimers();
    try {
      const client = {
        getBillingCardDetails: vi.fn(async () => DETAILS), getBillingSubscription: vi.fn(async () => SUBSCRIBED),
        startCardChange: vi.fn(),
        getBillingCharge: vi.fn(async () => ({ state: "PENDING" as const, reason_code: null }))
      };
      await act(async () => {
        root.render(<CardChangeFlow catalog={billingEnglish} locale="en" renewalConsent={CONSENT}
          returnedChargeRef="fedcba9876543210fedcba9876543210" client={client as unknown as CardChangeClient} />);
      });
      await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
      expect(container.querySelector('[data-charge-state="TIMED_OUT"]')).not.toBeNull();
      expect(container.textContent).toContain("We're still confirming this with the payment provider.");
      expect(container.textContent).not.toMatch(/email/iu);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends a signed-out person to sign in and back to /settings/card, and is not found while billing is off", async () => {
    await expect(CardChangePage({})).rejects.toThrow("NEXT_REDIRECT");
    expect(readRedirects()).toEqual(["/login?next=%2Fsettings%2Fcard"]);
    // Back from the bank's check signed out: the charge survives the sign-in, so the page polls it instead of
    // offering a second hold.
    resetRedirects();
    await expect(CardChangePage({ searchParams: Promise.resolve({ charge: "fedcba9876543210fedcba9876543210" }) }))
      .rejects.toThrow("NEXT_REDIRECT");
    expect(readRedirects()).toEqual([`/login?next=${encodeURIComponent("/settings/card?charge=fedcba9876543210fedcba9876543210")}`]);
    resetRedirects();
    await expect(CardChangePage({ searchParams: Promise.resolve({ charge: "../x" }) })).rejects.toThrow("NEXT_REDIRECT");
    expect(readRedirects()).toEqual(["/login?next=%2Fsettings%2Fcard"]);
    mocks.session = "t".repeat(43);
    expect(renderToStaticMarkup(await CardChangePage({}))).toContain("Update your card");
    mocks.billingOn = false;
    await expect(CardChangePage({})).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("is not found while billing is off even when signed out, and sends an expired session back to sign-in", async () => {
    // Like /pricing and /checkout: billing off (or local mode) answers 404 before any sign-in redirect.
    mocks.session = null;
    mocks.billingOn = false;
    resetRedirects();
    await expect(CardChangePage({})).rejects.toThrow("NEXT_NOT_FOUND");
    expect(readRedirects()).toEqual([]);
    // A cookie whose session expired or was revoked is no sign-in (spec §2.10); the charge still survives it.
    mocks.billingOn = true;
    mocks.session = "e".repeat(43);
    mocks.sessionLive = false;
    mocks.sessionCheckedWith = [];
    await expect(CardChangePage({ searchParams: Promise.resolve({ charge: "fedcba9876543210fedcba9876543210" }) }))
      .rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.sessionCheckedWith).toEqual(["e".repeat(43)]);
    expect(readRedirects()).toEqual([`/login?next=${encodeURIComponent("/settings/card?charge=fedcba9876543210fedcba9876543210")}`]);
    mocks.sessionLive = true;
  });

  it("a session that ended while the page was open goes back to sign-in and then to this page, with no error sentence", async () => {
    const navigated: string[] = [];
    const client = {
      getBillingCardDetails: vi.fn(async () => DETAILS), getBillingSubscription: vi.fn(async () => SUBSCRIBED),
      startCardChange: vi.fn(async () => { throw new ContractHttpError("SESSION_REQUIRED", 401, "x"); }),
      getBillingCharge: vi.fn()
    };
    await act(async () => {
      root.render(<CardChangeFlow catalog={billingEnglish} locale="en" renewalConsent={CONSENT}
        client={client as unknown as CardChangeClient} navigate={(href) => { navigated.push(href); }} />);
    });
    await settle();
    await act(async () => { container.querySelector<HTMLInputElement>("#card-agreement")!.click(); });
    await act(async () => { continueButton(container)!.click(); });
    await settle();
    expect(navigated).toEqual(["/login?next=%2Fsettings%2Fcard"]);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("reads only a well-formed ?charge= and hands it to the flow", async () => {
    mocks.session = "t".repeat(43);
    mocks.billingOn = true;
    const returned = renderToStaticMarkup(await CardChangePage({
      searchParams: Promise.resolve({ charge: "fedcba9876543210fedcba9876543210" })
    }));
    expect(returned).toContain('data-charge-state="PENDING"');
    expect(returned).not.toContain(EN["billing.card.checkCard"]);
    for (const charge of ["../x", "FEDCBA9876543210FEDCBA9876543210", ["fedcba9876543210fedcba9876543210"]]) {
      const html = renderToStaticMarkup(await CardChangePage({ searchParams: Promise.resolve({ charge }) }));
      expect(html, String(charge)).toContain(EN["billing.card.title"]);
      expect(html, String(charge)).not.toContain("data-charge-state");
    }
  });
});
