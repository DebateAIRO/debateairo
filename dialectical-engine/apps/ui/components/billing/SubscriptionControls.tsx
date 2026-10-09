"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ContractHttpError, type ContractClient } from "@debateai/contract";
import { contractClient } from "@/lib/api";
import { formatLongDate, formatUsd, planName } from "@/lib/billing/format";
import type { PaidPlanId } from "@/lib/billing/plans";
import type { LocaleCode } from "@/lib/i18n/locales";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import billingEnglish from "@/messages/en/billing.json";
import { ChargeStatusPoller } from "./ChargeStatusPoller";

export type SubscriptionClient = Pick<ContractClient,
  | "getBillingSubscription" | "getBillingInvoices" | "quoteSubscriptionUpgrade" | "upgradeSubscription"
  | "downgradeSubscription" | "cancelSubscription" | "revokeSubscriptionCancel" | "withdrawSubscription"
  | "stepUp" | "getBillingCharge" | "getBillingPlans"
>;
type Subscription = NonNullable<Awaited<ReturnType<ContractClient["getBillingSubscription"]>>["subscription"]>;
type Invoice = Awaited<ReturnType<ContractClient["getBillingInvoices"]>>["invoices"][number];
type UpgradeQuote = Awaited<ReturnType<ContractClient["quoteSubscriptionUpgrade"]>>;
type UpgradeTarget = "PRO" | "MAX";
type DowngradeTarget = "PLUS" | "PRO";

/** Plan order is price order (billingPlans row); an upgrade is a higher one, a downgrade a lower paid one. */
const PAID_ORDER: readonly PaidPlanId[] = Object.freeze(["PLUS", "PRO", "MAX"]);
const UPGRADE_TARGETS: readonly UpgradeTarget[] = Object.freeze(["PRO", "MAX"]);
const DOWNGRADE_TARGETS: readonly DowngradeTarget[] = Object.freeze(["PLUS", "PRO"]);
const LIVE_STATUSES: ReadonlySet<string> = new Set(["ACTIVE", "PAST_DUE", "SUSPENDED"]);
const rankOf = (planId: string): number => (PAID_ORDER as readonly string[]).indexOf(planId);

type FailureWords = Readonly<{ key: string; reload: boolean }>;
const ACTION_FAILED: FailureWords = Object.freeze({ key: "billing.subscription.actionFailed", reload: false });
const STILL_CONFIRMING: FailureWords = Object.freeze({ key: "billing.subscription.stillConfirming", reload: true });
/**
 * D6b (403 LEGAL_REACCEPTANCE_REQUIRED, on the upgrade quote, the upgrade, the downgrade and the undo of a cancel):
 * the updated Terms come first. The route refuses before any read or quote, so nothing moved: the checkout's sentence.
 */
const REACCEPT_REQUIRED: FailureWords = Object.freeze({ key: "billing.checkout.reacceptRequired", reload: false });
/** P15 (409 ACCOUNT_ERASURE_PENDING): an account deletion is pending; cancelling it in Settings comes first. */
const ERASURE_PENDING: FailureWords = Object.freeze({ key: "billing.checkout.erasurePending", reload: false });
/**
 * W10 (P2-M19, 429 ADMISSION_RATE_LIMITED): the upgrade quote, the downgrade, the undo of a cancel and the card change
 * share one hourly budget with the checkout's quote. The route refuses before anything is read, so nothing moved.
 */
const RATE_LIMITED: FailureWords = Object.freeze({ key: "billing.checkout.rateLimited", reload: false });

/**
 * P12c's and P15's refusals of an upgrade quote or an upgrade, each with its own sentence (P18). `reload`: read the
 * subscription again, because the plan may have changed elsewhere or an earlier payment is still open. Only
 * QUOTE_EXPIRED, refused before any charge, says "Nothing changed".
 */
const UPGRADE_REFUSALS: Readonly<Record<string, FailureWords>> = Object.freeze({
  QUOTE_EXPIRED: Object.freeze({ key: "billing.subscription.upgradeFailed", reload: false }),
  UPGRADE_NOT_HIGHER: Object.freeze({ key: "billing.subscription.upgradeNotHigher", reload: true }),
  UPGRADE_NOT_AVAILABLE_NOW: Object.freeze({ key: "billing.subscription.upgradeNotAvailableNow", reload: false }),
  UPGRADE_IN_PROGRESS: Object.freeze({ key: "billing.subscription.upgradeInProgress", reload: true }),
  ACCOUNT_ERASURE_PENDING: ERASURE_PENDING,
  LEGAL_REACCEPTANCE_REQUIRED: REACCEPT_REQUIRED,
  // F4 (finding ui-2): the agreement the page carries was superseded while it was open; only a page reload fixes it.
  LEGAL_DOCUMENT_STALE: Object.freeze({ key: "billing.checkout.pageOutdated", reload: false }),
  ADMISSION_RATE_LIMITED: RATE_LIMITED,
  UPGRADE_PENDING: Object.freeze({ key: "billing.subscription.upgradeInProgress", reload: true }),
  PAYMENT_PROVIDER_UNAVAILABLE: Object.freeze({ key: "billing.checkout.formUnavailable", reload: false })
});

/** A request that may have reached the payment side: a network failure, a 5xx, or anything that is not an answer. */
function outcomeUnknown(failure: unknown): boolean {
  return !(failure instanceof ContractHttpError) || failure.status === 0 || failure.status >= 500;
}

function refusalOf(failure: unknown): string | null {
  return failure instanceof ContractHttpError ? failure.serverCode : null;
}

function upgradeFailureWords(failure: unknown): FailureWords {
  const code = refusalOf(failure);
  const known = code === null ? undefined : UPGRADE_REFUSALS[code];
  if (known !== undefined) return known;
  return outcomeUnknown(failure) ? STILL_CONFIRMING : ACTION_FAILED;
}

/** A quote moves no money: a known refusal gets its sentence, anything else the plain "try again". */
function quoteFailureWords(failure: unknown): FailureWords {
  const code = refusalOf(failure);
  return (code === null ? undefined : UPGRADE_REFUSALS[code]) ?? ACTION_FAILED;
}

/**
 * P12's DOWNGRADE_NOT_LOWER: the plan changed elsewhere, so say so and show the plan the server has now.
 * DOWNGRADE_NOT_AVAILABLE_NOW: the renewal charge is already written at the current plan, so nothing was scheduled;
 * the plan is unchanged, so the card is not read again.
 */
function downgradeFailureWords(failure: unknown): FailureWords {
  const code = refusalOf(failure);
  if (code === "LEGAL_REACCEPTANCE_REQUIRED") return REACCEPT_REQUIRED;
  if (code === "ADMISSION_RATE_LIMITED") return RATE_LIMITED;
  if (code === "DOWNGRADE_NOT_AVAILABLE_NOW") {
    return Object.freeze({ key: "billing.subscription.downgradeNotAvailableNow", reload: false });
  }
  return code === "DOWNGRADE_NOT_LOWER"
    ? Object.freeze({ key: "billing.subscription.downgradeNotLower", reload: true })
    : ACTION_FAILED;
}

/**
 * P12b's undo of a cancel: gated on the Terms (D6b), and (W7, P2-I10) refused while an account deletion is pending,
 * whose renewal stop it would undo; any other refusal keeps the plain "try again".
 */
function revokeFailureWords(failure: unknown): FailureWords {
  const code = refusalOf(failure);
  if (code === "LEGAL_REACCEPTANCE_REQUIRED") return REACCEPT_REQUIRED;
  if (code === "ADMISSION_RATE_LIMITED") return RATE_LIMITED;
  return code === "ACCOUNT_ERASURE_PENDING" ? ERASURE_PENDING : ACTION_FAILED;
}

/** Ruling Q-7: the confirm needs the lower plan's price; without the plans list it offers no confirm at all. */
const PLANS_UNAVAILABLE: FailureWords = Object.freeze({ key: "billing.pricing.unavailable", reload: false });

class PlanPriceUnavailable extends Error {
  constructor() {
    super("DOWNGRADE_PRICE_UNAVAILABLE");
  }
}

/** P12d's answer: a refund, nothing due back ("0.00"), or null when the owner settles what is still due. */
function withdrawDoneText(catalog: MessageCatalog, locale: LocaleCode, refund: string | null): string {
  if (refund === null) return t(catalog, "billing.subscription.withdrawOwnerReview");
  if (/^0+\.00$/u.test(refund)) return t(catalog, "billing.subscription.withdrawNothingDue");
  return t(catalog, "billing.subscription.withdrawDone", { amount: formatUsd(locale, refund) });
}

/** The step-up itself was refused (wrong password or code, or no grant came back): the one "check your code" case. */
class StepUpRefused extends Error {
  constructor(readonly transport: boolean) {
    super("WITHDRAW_STEP_UP_REFUSED");
  }
}

function withdrawFailureWords(failure: unknown): FailureWords {
  if (failure instanceof StepUpRefused) return failure.transport ? ACTION_FAILED : Object.freeze({ key: "billing.subscription.withdrawRefused", reload: false });
  const code = refusalOf(failure);
  if (code === "WITHDRAWAL_WINDOW_CLOSED") return Object.freeze({ key: "billing.subscription.withdrawWindowClosed", reload: true });
  // P12d (403): the grant expired or was already used. The password and code were right, so never blame them.
  if (code === "STEP_UP_REQUIRED") return Object.freeze({ key: "billing.subscription.stepUpExpired", reload: false });
  // A timeout after P12d queued the refund: the refund may be under way, so say so and read the state again.
  if (outcomeUnknown(failure)) return STILL_CONFIRMING;
  // Any other answer (NOT_SUBSCRIBED: withdrawn or ended meanwhile): read the state again, blame nobody.
  return Object.freeze({ key: "billing.subscription.actionFailed", reload: true });
}

export function SubscriptionControls({
  catalog = billingEnglish,
  locale = "en",
  client = contractClient,
  now = () => new Date(),
  renewalConsent = null,
  goToPayment = (url: string): void => { window.location.assign(url); }
}: Readonly<{
  catalog?: MessageCatalog;
  locale?: LocaleCode;
  client?: SubscriptionClient;
  now?: () => Date;
  /** Spec §2.18: the card-saving sentence's manifest pair in this locale; null: the upgrade offers no payment. */
  renewalConsent?: Readonly<{ version: string; sha256: string }> | null;
  /** Spec §2.10: NETOPIA's page for the upgrade is reached by a top-level navigation. */
  goToPayment?: (url: string) => void;
}>) {
  const [loaded, setLoaded] = useState<"LOADING" | "ABSENT" | "READY">("LOADING");
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  // null = not read yet: the invoices block shows only once a list has come back (never "No invoices yet." on a failure).
  const [invoices, setInvoices] = useState<readonly Invoice[] | null>(null);
  const [panel, setPanel] = useState<"NONE" | "CHANGE" | "CANCEL" | "WITHDRAW">("NONE");
  const [upgrade, setUpgrade] = useState<Readonly<{ planId: UpgradeTarget; quote: UpgradeQuote }> | null>(null);
  const [upgradeCharge, setUpgradeCharge] = useState<Readonly<{ planId: UpgradeTarget; chargeRef: string }> | null>(null);
  const [upgradeAgreed, setUpgradeAgreed] = useState(false);
  const [downgrade, setDowngrade] = useState<Readonly<{ planId: DowngradeTarget; netPrice: string }> | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  // `linksHome`: W10 (P2-M20) the updated-Terms sentence is a plain link to the signed-in home page, whose accept
  // screen L4 shows (a full page load, never a client-side move). Every other sentence is plain text.
  const [message, setMessageState] = useState<Readonly<{ text: string; linksHome: boolean }> | null>(null);
  const setMessage = useCallback((text: string | null, linksHome = false): void => {
    setMessageState(text === null ? null : { text, linksHome });
  }, []);

  /**
   * Reads the subscription, then the invoices. One after the other on purpose: with billing off (local mode, or
   * hosted before the switch) the first answer is a 404 and the invoices are never asked for. Returns the fresh
   * subscription, so an action can word its result from what the server now says.
   *
   * A plan is never worded from a failed read. A failed subscription read (a 401, a 429, a 5xx, a network failure, an
   * invalid answer) only says "try again" and keeps what the card showed: on the first load that is nothing at all
   * (in local mode a dead session's 401 comes before billing-off's 404, so no billing heading may appear on it), and
   * later it is the last plan the server named. A failed invoices read keeps the plan just read and the last list.
   */
  const reload = useCallback(async (): Promise<Subscription | null> => {
    let current: Awaited<ReturnType<SubscriptionClient["getBillingSubscription"]>>;
    try {
      current = await client.getBillingSubscription();
    } catch (failure) {
      if (failure instanceof ContractHttpError && failure.status === 404) {
        setLoaded("ABSENT");
        return null;
      }
      setMessage(t(catalog, "billing.subscription.actionFailed"));
      return null;
    }
    setSubscription(current.subscription);
    setLoaded("READY");
    try {
      const listed = await client.getBillingInvoices();
      setInvoices(listed.invoices);
    } catch {
      setMessage(t(catalog, "billing.subscription.actionFailed"));
    }
    return current.subscription;
  }, [catalog, client, setMessage]);

  useEffect(() => { void reload(); }, [reload]);

  async function run(
    action: () => Promise<void>,
    words: (failure: unknown) => FailureWords = () => ACTION_FAILED
  ): Promise<void> {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (failure) {
      const chosen = words(failure);
      if (chosen.reload) await reload();
      setMessage(t(catalog, chosen.key), chosen === REACCEPT_REQUIRED);
    } finally {
      setBusy(false);
    }
  }

  // Nothing at all until the server says billing exists: local mode and billing-off Settings stay exactly as today.
  if (loaded !== "READY") return null;
  const live = subscription !== null && LIVE_STATUSES.has(subscription.status) ? subscription : null;
  const date = (iso: string | null): string => (iso === null ? "" : formatLongDate(locale, iso));
  // The button follows the closing instant; the sentence names the last day in the person's calendar (P12b).
  const withdrawOpen = live !== null && live.status === "ACTIVE" && live.withdrawal_open_until !== null
    && live.withdrawal_last_day !== null && new Date(live.withdrawal_open_until).getTime() > now().getTime();
  const currentRank = live === null ? -1 : rankOf(live.plan_id);
  const nextRenewal = live === null ? null : live.renews_on ?? live.current_period_end;
  const nowMs = now().getTime();
  const today = formatLongDate(locale, now().toISOString());
  // The server's own rule (P12's requestCancelLocked accessEndsAt, revokeCancelForOwner's refusal): once the paid
  // period's end has passed there is nothing left to promise, a cancel ends the plan today, and it cannot be undone.
  const periodOver = live !== null && live.current_period_end !== null && Date.parse(live.current_period_end) <= nowMs;
  // A plan paused by a card dispute (spec §1.3): its paid features are off until the dispute is decided.
  const paused = live !== null && live.status === "SUSPENDED";
  // Ruling Q-1: an outage at renewal keeps the plan ACTIVE while the renewal is retried for up to 72 h, so renews_on
  // is already past. A price-notice postponement (RENEWAL_POSTPONED) keeps renews_on in the future and shows it.
  const renewalOverdue = live !== null && live.renews_on !== null && Date.parse(live.renews_on) <= nowMs;
  // The day a change "at renewal" takes effect, as a sentence may name it: never a day already past.
  const nextRenewalText = nextRenewal === null ? "" : Date.parse(nextRenewal) <= nowMs ? today : date(nextRenewal);

  function withdraw(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void run(async () => {
      let token: string;
      try {
        const stepped = await client.stepUp(password, code, { action: "WITHDRAW_SUBSCRIPTION" });
        const grant = stepped.step_up_grant;
        if (grant === undefined || grant.action !== "WITHDRAW_SUBSCRIPTION") throw new StepUpRefused(false);
        token = grant.token;
      } catch (failure) {
        throw failure instanceof StepUpRefused ? failure : new StepUpRefused(outcomeUnknown(failure));
      }
      const withdrawn = await client.withdrawSubscription(token);
      setPassword("");
      setCode("");
      setPanel("NONE");
      await reload();
      setMessage(withdrawDoneText(catalog, locale, withdrawn.refund));
    }, withdrawFailureWords);
  }

  /** Ruling Q-7: read the lower plan's public net price first; nothing moves until the person confirms. */
  function askDowngrade(planId: DowngradeTarget): void {
    void run(async () => {
      let netPrice: string | null = null;
      try {
        netPrice = (await client.getBillingPlans()).plans.find((plan) => plan.plan_id === planId)?.net_price ?? null;
      } catch {
        netPrice = null;
      }
      if (netPrice === null) throw new PlanPriceUnavailable();
      setUpgrade(null);
      setDowngrade({ planId, netPrice });
    }, (failure) => (failure instanceof PlanPriceUnavailable ? PLANS_UNAVAILABLE : ACTION_FAILED));
  }

  function confirmDowngrade(planId: DowngradeTarget): void {
    setDowngrade(null);
    void run(async () => {
      await client.downgradeSubscription(planId);
      setPanel("NONE");
      // A7: the lower plan's total is now the announced one (renewal_total), so the sentence names it.
      const fresh = await reload();
      const total = fresh?.renewal_total ?? null;
      setMessage(total === null
        ? t(catalog, "billing.subscription.downgradedNoTotal", { plan: planName(catalog, planId), date: nextRenewalText })
        : t(catalog, "billing.subscription.downgraded", {
          plan: planName(catalog, planId), date: nextRenewalText, total: formatUsd(locale, total)
        }));
    }, downgradeFailureWords);
  }

  return (
    <section className="setCard" aria-labelledby="subscription-heading">
      <h2 className="setCardTitle" id="subscription-heading">{t(catalog, "billing.subscription.title")}</h2>
      {live === null ? (
        <>
          <p className="setCardHint">{t(catalog, "billing.subscription.free")}</p>
          <div className="setCardRow">
            <a className="setBtn" href="/pricing">{t(catalog, "billing.subscription.choosePlan")}</a>
          </div>
        </>
      ) : null}
      {live !== null ? (
        <>
          <p className="setCardHint">{t(catalog, "billing.subscription.plan", { plan: planName(catalog, live.plan_id) })}</p>
          {live.status === "PAST_DUE" ? <p className="setCardNote">{t(catalog, "billing.subscription.pastDue")}</p> : null}
          {live.status === "SUSPENDED" ? <p className="setCardNote">{t(catalog, "billing.subscription.suspended")}</p> : null}
          {live.cancel_requested && paused
            // P2-W10: the paid features are paused, so no "ends on {date}" promise; only that it won't renew.
            ? <p className="setStatus">{t(catalog, "billing.subscription.wontRenew")}</p>
            : live.cancel_requested && live.current_period_end !== null
            ? <p className="setStatus">{t(catalog, "billing.subscription.endsOn", { date: periodOver ? today : date(live.current_period_end) })}</p>
            : renewalOverdue && live.status === "ACTIVE"
              // Ruling Q-1: no past date is promised while the renewal is retried; nothing has failed.
              ? <p className="setStatus">{t(catalog, "billing.subscription.renewalProcessing")}</p>
              : live.renews_on !== null && live.renewal_total !== null
                ? <p className="setStatus">{t(catalog, "billing.subscription.renews", { date: date(live.renews_on), total: formatUsd(locale, live.renewal_total) })}</p>
                : null}
          {live.scheduled_downgrade_plan_id !== null && nextRenewal !== null ? (
            <p className="setStatus">{t(catalog, "billing.subscription.downgradeScheduled", {
              plan: planName(catalog, live.scheduled_downgrade_plan_id), date: nextRenewalText
            })}</p>
          ) : null}
          <div className="setCardRow">
            {live.status === "ACTIVE" && !live.cancel_requested ? (
              <button type="button" className="setBtn" disabled={busy} onClick={() => setPanel(panel === "CHANGE" ? "NONE" : "CHANGE")}>
                {t(catalog, "billing.subscription.changePlan")}
              </button>
            ) : null}
            {live.can_change_card
              ? <a className="setBtn" href="/settings/card">{t(catalog, "billing.subscription.updateCard")}</a>
              : null}
            {/* C-15: Undo only where the server says the revoke route would accept it (`can_revoke_cancel`): never for
                a plan of another payment system, whose cancel stands. After the period end the server refuses the undo
                (NOT_SUBSCRIBED) and the sweep ends the plan: offer neither (the page's own clock hides it too, for a
                view read just before the end). While SUSPENDED it refuses the undo too, whatever wrote the cancel
                (P2-W10, the W7 review's item 3); a won dispute resumes the plan, and the undo comes back until the
                period end (C5). P2-W10: a plan paused by a dispute can be cancelled; nothing ends at once. */}
            {live.cancel_requested ? (!live.can_revoke_cancel || periodOver ? null : (
              <button type="button" className="setBtn" disabled={busy}
                onClick={() => { void run(async () => { await client.revokeSubscriptionCancel(); await reload(); }, revokeFailureWords); }}>
                {t(catalog, "billing.subscription.revoke")}
              </button>
            )) : (
              <button type="button" className="setBtn" disabled={busy} onClick={() => setPanel("CANCEL")}>
                {t(catalog, "billing.subscription.cancel")}
              </button>
            )}
            {withdrawOpen ? (
              <button type="button" className="setBtn" disabled={busy} onClick={() => setPanel("WITHDRAW")}>
                {t(catalog, "billing.subscription.withdraw")}
              </button>
            ) : null}
          </div>
          {panel === "CHANGE" ? (
            <div className="setCardRow">
              {live.can_upgrade ? UPGRADE_TARGETS.filter((planId) => rankOf(planId) > currentRank).map((planId) => (
                <button key={planId} type="button" className="setBtn" disabled={busy}
                  onClick={() => { void run(async () => {
                    setDowngrade(null);
                    const quote = await client.quoteSubscriptionUpgrade(planId);
                    setUpgradeAgreed(false);
                    setUpgrade({ planId, quote });
                  }, quoteFailureWords); }}>
                  {t(catalog, "billing.subscription.upgradeTo", { plan: planName(catalog, planId) })}
                </button>
              )) : null}
              {DOWNGRADE_TARGETS.filter((planId) => rankOf(planId) < currentRank).map((planId) => (
                <button key={planId} type="button" className="setBtn" disabled={busy} onClick={() => askDowngrade(planId)}>
                  {t(catalog, "billing.subscription.downgradeTo", { plan: planName(catalog, planId) })}
                </button>
              ))}
            </div>
          ) : null}
          {downgrade !== null ? (
            <div>
              {/* Ruling Q-7: the lower plan's net price from GET /v1/billing/plans, "+ tax", from the renewal date. */}
              <p className="setCardNote">{t(catalog, "billing.subscription.downgradeConfirm", {
                plan: planName(catalog, downgrade.planId), price: formatUsd(locale, downgrade.netPrice), date: nextRenewalText
              })}</p>
              <div className="setCardRow">
                <button type="button" className="setBtn" disabled={busy} onClick={() => confirmDowngrade(downgrade.planId)}>
                  {t(catalog, "billing.subscription.downgradeYes", { plan: planName(catalog, downgrade.planId) })}
                </button>
                <button type="button" className="setBtn" onClick={() => { setDowngrade(null); setPanel("NONE"); }}>
                  {t(catalog, "billing.subscription.keep")}
                </button>
              </div>
            </div>
          ) : null}
          {upgrade !== null ? (
            <div>
              <p className="billingTotal">{t(catalog, "billing.subscription.upgradeQuote", {
                total: formatUsd(locale, upgrade.quote.total), date: date(upgrade.quote.renews_on), plan: planName(catalog, upgrade.planId),
                // A7: this is the price the next renewal charges without an M3 notice, so it is seen before paying.
                recurringTotal: formatUsd(locale, upgrade.quote.recurring_total)
              })}</p>
              {/* Spec §2.18: the card-saving agreement with the new plan's monthly total, before NETOPIA's page. */}
              <label className="billingConsent">
                <input id="upgrade-agreement" type="checkbox" checked={upgradeAgreed}
                  onChange={(event) => setUpgradeAgreed(event.target.checked)} />
                <span>{t(catalog, "billing.consent.renewal", { total: formatUsd(locale, upgrade.quote.recurring_total) })}</span>
              </label>
              <div className="setCardRow">
                <button type="button" className="setBtn" disabled={busy || !upgradeAgreed || renewalConsent === null}
                  onClick={() => { void run(async () => {
                    if (renewalConsent === null) return;
                    let started: Awaited<ReturnType<SubscriptionClient["upgradeSubscription"]>>;
                    try {
                      started = await client.upgradeSubscription(upgrade.planId, upgrade.quote.quote_ref, {
                        locale, renewal_terms: renewalConsent
                      });
                    } catch (failure) {
                      // N19b (A3 (a)): a failed start holds this quote's one use, so it is never sent again; choosing
                      // the upgrade again asks for a fresh quote. `run` words the failure as for every other action.
                      setUpgrade(null);
                      throw failure;
                    }
                    // N12's 409 UPGRADE_PENDING read as data: wait on that charge instead of paying twice.
                    if ("state" in started) {
                      setUpgradeCharge({ planId: upgrade.planId, chargeRef: started.charge_ref });
                      setUpgrade(null);
                      setPanel("NONE");
                      return;
                    }
                    goToPayment(started.redirect_url);
                  }, upgradeFailureWords); }}>
                  {t(catalog, "billing.subscription.upgradePay", { amount: formatUsd(locale, upgrade.quote.total) })}
                </button>
              </div>
            </div>
          ) : null}
          {upgradeCharge !== null ? (
            <ChargeStatusPoller
              chargeRef={upgradeCharge.chargeRef}
              catalog={catalog}
              client={client}
              successText={t(catalog, "billing.subscription.upgraded", { plan: planName(catalog, upgradeCharge.planId) })}
              failureText={t(catalog, "billing.subscription.upgradeFailed")}
              onSettled={(state) => { if (state === "SUCCEEDED") void reload(); }}
            />
          ) : null}
          {panel === "CANCEL" ? (
            <div>
              {/* PAST_DUE: P12 ends access at once and the retries stop; there is no paid-through date to promise. Once
                  the period end has passed (ruling Q-1's grace, or a postponed renewal), P12 ends an ACTIVE plan today
                  too, as M7 says; before that, it runs to the next renewal. */}
              <p className="setCardNote">{live.status === "PAST_DUE"
                ? t(catalog, "billing.subscription.cancelConfirmPastDue")
                : paused
                  // P2-W10: no "you keep it until": its paid features stay paused while the dispute is open.
                  ? t(catalog, "billing.subscription.cancelConfirmSuspended")
                  : t(catalog, "billing.subscription.cancelConfirm", { date: periodOver ? today : date(nextRenewal) })}</p>
              <div className="setCardRow">
                <button type="button" className="setBtn" disabled={busy}
                  onClick={() => { void run(async () => { await client.cancelSubscription(); setPanel("NONE"); await reload(); }); }}>
                  {t(catalog, "billing.subscription.cancelYes")}
                </button>
                <button type="button" className="setBtn" onClick={() => setPanel("NONE")}>
                  {t(catalog, "billing.subscription.keep")}
                </button>
              </div>
            </div>
          ) : null}
          {panel === "WITHDRAW" ? (
            <form onSubmit={withdraw}>
              <p className="setCardNote">{t(catalog, "billing.subscription.withdrawHint", { date: date(live.withdrawal_last_day) })}</p>
              <p className="setCardNote">{t(catalog, "billing.subscription.stepUpHint")}</p>
              <div className="setCardRow">
                <div className="setField">
                  <label htmlFor="billing-withdraw-password">{t(catalog, "billing.subscription.password")}</label>
                  <input id="billing-withdraw-password" type="password" autoComplete="current-password"
                    value={password} onChange={(event) => setPassword(event.target.value)} required />
                </div>
                <div className="setField">
                  <label htmlFor="billing-withdraw-code">{t(catalog, "billing.subscription.code")}</label>
                  <input id="billing-withdraw-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}"
                    value={code} onChange={(event) => setCode(event.target.value)} required />
                </div>
              </div>
              <div className="setCardRow">
                <button type="submit" className="setBtn" disabled={busy}>{t(catalog, "billing.subscription.withdrawConfirm")}</button>
              </div>
            </form>
          ) : null}
        </>
      ) : null}
      {message !== null ? (
        <p className="setStatus" role="status">{message.linksHome ? <a href="/">{message.text}</a> : message.text}</p>
      ) : null}
      {invoices !== null ? (
        <div>
          <h3 className="setCardTitle">{t(catalog, "billing.subscription.invoices")}</h3>
          {invoices.length === 0 ? <p className="setCardHint">{t(catalog, "billing.subscription.noInvoices")}</p> : (
            <ul className="setInvoiceList">
              {invoices.map((invoice) => (
                <li key={`${invoice.kind}:${invoice.number}`}>
                  {t(catalog, "billing.subscription.invoiceRow", {
                    number: invoice.number, date: formatLongDate(locale, invoice.issued_on), total: formatUsd(locale, invoice.total)
                  })}
                  {invoice.kind === "CREDIT_NOTE" ? <> · {t(catalog, "billing.subscription.creditNote")}</> : null}
                  {invoice.url !== null ? <> · <a href={invoice.url} rel="noopener noreferrer" target="_blank">{t(catalog, "billing.subscription.openInvoice")}</a></> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
