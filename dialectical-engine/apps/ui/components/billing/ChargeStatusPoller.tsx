"use client";

import { useEffect, useRef, useState } from "react";
import type { ContractClient } from "@debateai/contract";
import { contractClient } from "@/lib/api";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import billingEnglish from "@/messages/en/billing.json";

export type ChargePollerState = "PENDING" | "SUCCEEDED" | "FAILED" | "TIMED_OUT";

const POLL_EVERY_MS = 2_000;
const POLL_FOR_MS = 120_000;

/**
 * P8c: these FAILED reasons mean the money was taken and refunded (P7's REFUND_REASONS_REFUSING_THE_PAYMENT). F4
 * (ruling PR-55, finding ui-1): the server answers them only once the refund is recorded; before, it answers
 * REFUND_PENDING, the refund on its way. UPGRADE_CLOSED (N12's closed upgrade paid late) is one of them.
 */
const REFUNDED_REASONS: ReadonlySet<string> = new Set(["ALREADY_SUBSCRIBED", "SUBSCRIPTION_ENDED", "UPGRADE_CLOSED"]);

/**
 * The sentence for a settled failure: a refund says it was refunded, and only a decline or a void may say no money
 * was taken (the caller's `failureText`). `null` = the caller's text.
 * W15 F1 (P2-M5): FAILED + PROVIDER_REFUND is a checkout's payment refunded at the payment provider before we verified
 * it. Only a checkout can read so (every other kind counts as started), so its sentence speaks of the plan; it promises
 * no email, because none is sent. FAILED + PROVIDER_VOID released a hold, so no money was taken: the caller's text.
 * Part 4 final review C-19: FAILED + CHARGEBACK is a checkout's payment charged back before we verified it; the bank
 * gave the money back and the plan never started, so it takes the same sentence (no new key; the owner may reword it).
 */
export function chargeOutcomeKey(state: "NEEDS_ACTION" | "FAILED", reasonCode: string | null): string | null {
  if (state === "FAILED" && reasonCode === "CARD_COUNTRY_BLOCKED") return "billing.checkout.cardCountryRefused";
  // P12e (D6a's CARD_CHECK_REFUSED): a card change's hold on a card we cannot serve is released with no email.
  if (state === "FAILED" && reasonCode === "CARD_CHECK_REFUSED") return "billing.card.countryRefused";
  // P12e (D6b's CARD_CHECK_DEFERRED): a payment on the plan was still open, so the card was not saved; try later.
  if (state === "FAILED" && reasonCode === "CARD_CHECK_DEFERRED") return "billing.card.tryAgainShortly";
  // P20 (CARD_CHECK_NOT_LIVE): the plan stopped being live during the card check, so nothing changed and the hold was
  // released: the start route's NOT_SUBSCRIBED sentence for the same condition, never "saved".
  if (state === "FAILED" && reasonCode === "CARD_CHECK_NOT_LIVE") return "billing.card.notSubscribed";
  // N13 (spec §2.11): the check passed but NETOPIA left no saved card (a wallet): try again with a card.
  if (state === "FAILED" && reasonCode === "CARD_NOT_SAVED") return "billing.card.notSaved";
  // F4: a payment we refused, its refund not recorded yet (the owner refunds by hand): on its way, its email to come.
  if (state === "FAILED" && reasonCode === "REFUND_PENDING") return "billing.checkout.refundPending";
  if (state === "FAILED" && reasonCode !== null && REFUNDED_REASONS.has(reasonCode)) return "billing.checkout.refunded";
  if (state === "FAILED" && (reasonCode === "PROVIDER_REFUND" || reasonCode === "CHARGEBACK")) {
    return "billing.checkout.refundedBeforeStart";
  }
  return null;
}

/**
 * B5 (spec 2026-09-29 §2.5.3): polls OUR server every 2 s for up to 2 minutes. The state shown is the server's;
 * the browser never decides a payment. P8c's NEEDS_ACTION is a bank decline the person may retry: settled, like FAILED.
 * `timedOutText` replaces the "we'll email you" sentence after the 2 minutes, for a charge no email follows (P20's
 * card check); without it, checkout's and the upgrade's sentence stays.
 */
export function ChargeStatusPoller({
  chargeRef,
  catalog = billingEnglish,
  client = contractClient,
  successText,
  upgradeSuccessText,
  failureText,
  timedOutText,
  onSettled
}: Readonly<{
  chargeRef: string;
  catalog?: MessageCatalog;
  client?: Pick<ContractClient, "getBillingCharge">;
  successText: string;
  /** N18 (spec §2.6.5): the confirmation when the charge is an upgrade. */
  upgradeSuccessText?: string;
  failureText: string;
  timedOutText?: string;
  onSettled?: (state: "SUCCEEDED" | "FAILED" | "TIMED_OUT") => void;
}>) {
  const [state, setState] = useState<ChargePollerState>("PENDING");
  const [failureKey, setFailureKey] = useState<string | null>(null);
  const [kind, setKind] = useState<string | null>(null);
  const settled = useRef(onSettled);
  settled.current = onSettled;

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    const poll = async (): Promise<void> => {
      try {
        const answer = await client.getBillingCharge(chargeRef);
        if (!active) return;
        setKind(answer.kind);
        if (answer.state === "SUCCEEDED") {
          setState("SUCCEEDED");
          settled.current?.("SUCCEEDED");
          return;
        }
        if (answer.state === "FAILED" || answer.state === "NEEDS_ACTION") {
          setFailureKey(chargeOutcomeKey(answer.state, answer.reason_code));
          setState("FAILED");
          settled.current?.("FAILED");
          return;
        }
      } catch {
        if (!active) return;
      }
      if (Date.now() - startedAt >= POLL_FOR_MS) {
        setState("TIMED_OUT");
        settled.current?.("TIMED_OUT");
        return;
      }
      timer = setTimeout(() => { void poll(); }, POLL_EVERY_MS);
    };
    void poll();
    return () => {
      active = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [chargeRef, client]);

  const text = state === "SUCCEEDED" ? (kind === "UPGRADE" && upgradeSuccessText !== undefined ? upgradeSuccessText : successText)
    : state === "FAILED" ? (failureKey === null ? failureText : t(catalog, failureKey))
      : state === "TIMED_OUT" ? (timedOutText ?? t(catalog, "billing.checkout.willEmail"))
        : t(catalog, "billing.checkout.waitingForBank");
  return <p className="billingStatus" role="status" data-charge-state={state}>{text}</p>;
}
