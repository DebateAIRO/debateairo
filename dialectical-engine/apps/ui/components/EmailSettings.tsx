"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ContractHttpError,
  type AccountEmail,
  type ContractClient,
  type EmailChangePending
} from "@debateai/contract";
import { contractClient } from "@/lib/api";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import settingsEnglish from "@/messages/en/settings.json";

/**
 * Turn 14 — change email (design doc 14A Email card, 14B change form, 14C
 * pending state). The card sits on Settings between the identity panel and the
 * sessions; the form replaces the Settings body in place; the links mailed to
 * the new address (confirm) and the current one (cancel) open Settings with the
 * bearer in the URL fragment, which `takeEmailChangeLink` reads once and scrubs.
 */

type EmailCardClient = Pick<ContractClient, "readAccountEmail" | "resendEmailChange" | "cancelEmailChange">;
type ChangeFormClient = Pick<ContractClient, "stepUp" | "requestEmailChange">;
type LinkClient = Pick<ContractClient, "confirmEmailChange" | "cancelEmailChangeByLink">;

export type EmailChangeLink = Readonly<{ action: "confirm" | "cancel"; token: string }>;

const LINK_FRAGMENT = /^#email-change=(confirm|cancel)&token=([A-Za-z0-9_-]{43})$/;
const ADDRESS_SHAPE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;.]+$/;

export function takeEmailChangeLink(
  target: Pick<Window, "location" | "history"> = window
): EmailChangeLink | null {
  const match = LINK_FRAGMENT.exec(target.location.hash);
  if (target.location.hash.startsWith("#email-change=")) {
    // The bearer never stays in the address bar, history or a shared screenshot.
    target.history.replaceState(null, "", `${target.location.pathname}${target.location.search}`);
  }
  if (match === null) return null;
  return Object.freeze({ action: match[1] as "confirm" | "cancel", token: match[2]! });
}

function normalizedAddress(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

function serverCode(failure: unknown): string | null {
  return failure instanceof ContractHttpError ? failure.serverCode : null;
}

export function EmailSettingsCard({
  client = contractClient,
  catalog = settingsEnglish,
  onChange,
  notice = null
}: Readonly<{
  client?: EmailCardClient;
  catalog?: MessageCatalog;
  onChange: (currentEmail: string) => void;
  notice?: string | null;
}>) {
  const [account, setAccount] = useState<AccountEmail | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(notice);

  useEffect(() => {
    let active = true;
    client.readAccountEmail().then(
      (current) => { if (active) setAccount(current); },
      () => { if (active) setFailed(true); }
    );
    return () => { active = false; };
  }, [client]);

  async function resend(): Promise<void> {
    if (busy || account === null) return;
    setBusy(true);
    setMessage(null);
    try {
      const pending = await client.resendEmailChange();
      setAccount({ ...account, pending: { new_email: pending.new_email, expires_at: pending.expires_at } });
      setMessage(t(catalog, "settings.email.resent"));
    } catch (failure) {
      setMessage(serverCode(failure) === "RESEND_COOLDOWN"
        ? t(catalog, "settings.email.resendCooldown")
        : t(catalog, "settings.email.actionFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(): Promise<void> {
    if (busy || account === null) return;
    setBusy(true);
    setMessage(null);
    try {
      await client.cancelEmailChange();
      setAccount({ ...account, pending: null });
      setMessage(t(catalog, "settings.email.cancelled"));
    } catch {
      setMessage(t(catalog, "settings.email.actionFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (account === null) {
    return (
      <section className="setCard emlCard" aria-labelledby="account-email-heading">
        <h2 className="emlCardTitle" id="account-email-heading">{t(catalog, "settings.email.title")}</h2>
        <p className="setStatus" role="status">
          {failed ? t(catalog, "settings.email.unavailable") : t(catalog, "settings.email.loading")}
        </p>
      </section>
    );
  }

  const pending = account.pending;
  return (
    <section
      className="setCard emlCard"
      data-state={pending === null ? "current" : "pending"}
      aria-labelledby="account-email-heading"
    >
      {pending === null ? (
        <div className="emlCardRow">
          <div className="emlCardMain">
            <div className="emlCardHead">
              <h2 className="emlCardTitle" id="account-email-heading">{t(catalog, "settings.email.title")}</h2>
              <span className="emlVerified">{t(catalog, "settings.email.verified")}</span>
            </div>
            <p className="emlAddress">{account.email}</p>
            <p className="emlRecovery">{t(catalog, "settings.email.recovery", { email: account.recovery_email })}</p>
          </div>
          <button type="button" className="emlPill" onClick={() => onChange(account.email)}>
            {t(catalog, "settings.email.change")}
          </button>
        </div>
      ) : (
        <>
          <span className="emlPendingTab" aria-hidden="true" />
          <div className="emlCardHead">
            <h2 className="emlCardTitle" id="account-email-heading">{t(catalog, "settings.email.title")}</h2>
            <span className="emlPendingBadge">{t(catalog, "settings.email.pendingBadge")}</span>
          </div>
          <dl className="emlPendingGrid">
            <dt>{t(catalog, "settings.email.current")}</dt>
            <dd>{account.email}</dd>
            <dt>{t(catalog, "settings.email.new")}</dt>
            <dd>{pending.new_email}</dd>
          </dl>
          <p className="emlPendingHint">{t(catalog, "settings.email.pendingHint")}</p>
          <div className="emlPendingActions">
            <button type="button" className="emlPill emlPillSmall" disabled={busy} onClick={() => { void resend(); }}>
              {t(catalog, "settings.email.resend")}
            </button>
            <button type="button" className="emlPill emlPillSmall emlPillQuiet" disabled={busy}
              onClick={() => { void cancel(); }}>
              {t(catalog, "settings.email.cancel")}
            </button>
          </div>
        </>
      )}
      {message ? <p className="setStatus" role="status">{message}</p> : null}
    </section>
  );
}

type FieldCheck = "empty" | "valid" | "invalid" | "same" | "mismatch";

export function ChangeEmailScreen({
  client = contractClient,
  catalog = settingsEnglish,
  currentEmail,
  onBack,
  onRequested
}: Readonly<{
  client?: ChangeFormClient;
  catalog?: MessageCatalog;
  currentEmail: string;
  onBack: () => void;
  onRequested: (pending: EmailChangePending) => void;
}>) {
  const [newEmail, setNewEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const normalized = normalizedAddress(newEmail);
  const newCheck: FieldCheck = newEmail.trim() === ""
    ? "empty"
    : !ADDRESS_SHAPE.test(normalized) || normalized.length > 254
      ? "invalid"
      : normalized === normalizedAddress(currentEmail) ? "same" : "valid";
  const confirmCheck: FieldCheck = confirmEmail.trim() === ""
    ? "empty"
    : normalizedAddress(confirmEmail) === normalized ? "valid" : "mismatch";
  const ready = newCheck === "valid" && confirmCheck === "valid" && password !== "" && /^[0-9]{6}$/.test(code);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setMessage(null);
    let grant: string;
    try {
      const steppedUp = await client.stepUp(password, code, { action: "CHANGE_EMAIL" });
      if (steppedUp.step_up_grant === undefined || steppedUp.step_up_grant.action !== "CHANGE_EMAIL") {
        throw new Error("CHANGE_EMAIL_GRANT_MISSING");
      }
      grant = steppedUp.step_up_grant.token;
    } catch (failure) {
      setMessage(failure instanceof ContractHttpError && failure.code === "RATE_LIMITED"
        ? t(catalog, "settings.emailChange.rateLimited")
        : t(catalog, "settings.emailChange.credentialsInvalid"));
      setBusy(false);
      return;
    }
    try {
      const pending = await client.requestEmailChange(normalized, grant);
      setPassword("");
      setCode("");
      onRequested(pending);
    } catch (failure) {
      const reason = serverCode(failure);
      setMessage(reason === "EMAIL_UNCHANGED"
        ? t(catalog, "settings.emailChange.sameAsCurrent")
        : reason === "EMAIL_INVALID"
          ? t(catalog, "settings.emailChange.invalid")
          : reason === "STEP_UP_REQUIRED"
            ? t(catalog, "settings.emailChange.stepUpExpired")
            : t(catalog, "settings.emailChange.failed"));
    } finally {
      setBusy(false);
    }
  }

  const checkMessage = (check: FieldCheck): string | null => check === "valid"
    ? t(catalog, "settings.emailChange.valid")
    : check === "invalid"
      ? t(catalog, "settings.emailChange.invalid")
      : check === "same"
        ? t(catalog, "settings.emailChange.sameAsCurrent")
        : check === "mismatch" ? t(catalog, "settings.emailChange.mismatch") : null;
  const newMessage = checkMessage(newCheck);
  const confirmMessage = confirmCheck === "mismatch" ? checkMessage(confirmCheck) : null;

  return (
    <div className="screen scroll setScreen emlScreen">
      <div className="emlScreenBody">
        <div className="emlScreenInner">
          <button type="button" className="emlBack" onClick={onBack}>{t(catalog, "settings.emailChange.back")}</button>
          <p className="emlEyebrow">{t(catalog, "settings.emailChange.eyebrow")}</p>
          <h1 className="emlTitle">{t(catalog, "settings.emailChange.title")}</h1>
          <p className="emlLede">{t(catalog, "settings.emailChange.lede")}</p>
          <form className="emlShell" onSubmit={(event) => { void submit(event); }} noValidate>
            <div className="emlCore">
              <div className="emlField">
                <span className="emlLabel" id="email-change-current-label">
                  {t(catalog, "settings.emailChange.currentLabel")}
                </span>
                <div className="emlCurrent" aria-labelledby="email-change-current-label">{currentEmail}</div>
              </div>
              <div className="emlField">
                <label className="emlLabel" htmlFor="email-change-new">{t(catalog, "settings.emailChange.newLabel")}</label>
                <input
                  id="email-change-new"
                  className="emlInput"
                  type="email"
                  autoComplete="email"
                  spellCheck={false}
                  value={newEmail}
                  aria-invalid={newCheck === "invalid" || newCheck === "same" ? true : undefined}
                  aria-describedby={newMessage === null ? undefined : "email-change-new-check"}
                  data-check={newCheck}
                  onChange={(event) => setNewEmail(event.target.value)}
                />
                {newMessage === null ? null : (
                  <p className="emlCheck" id="email-change-new-check" data-check={newCheck}>{newMessage}</p>
                )}
              </div>
              <div className="emlField">
                <label className="emlLabel" htmlFor="email-change-confirm">
                  {t(catalog, "settings.emailChange.confirmLabel")}
                </label>
                <input
                  id="email-change-confirm"
                  className="emlInput"
                  type="email"
                  autoComplete="off"
                  spellCheck={false}
                  value={confirmEmail}
                  aria-invalid={confirmCheck === "mismatch" ? true : undefined}
                  aria-describedby={confirmMessage === null ? undefined : "email-change-confirm-check"}
                  data-check={confirmCheck}
                  onChange={(event) => setConfirmEmail(event.target.value)}
                />
                {confirmMessage === null ? null : (
                  <p className="emlCheck" id="email-change-confirm-check" data-check={confirmCheck}>{confirmMessage}</p>
                )}
              </div>
              <div className="emlRule" aria-hidden="true" />
              <fieldset className="emlVerify">
                <legend className="emlLabel">{t(catalog, "settings.emailChange.verifyTitle")}</legend>
                <p className="emlVerifyHint">{t(catalog, "settings.emailChange.verifyHint")}</p>
                <div className="emlVerifyRow">
                  <input
                    className="emlInput emlPassword"
                    type="password"
                    autoComplete="current-password"
                    aria-label={t(catalog, "settings.password")}
                    placeholder={t(catalog, "settings.password")}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <input
                    className="emlInput emlCode"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    aria-label={t(catalog, "settings.emailChange.codePlaceholder")}
                    placeholder={t(catalog, "settings.emailChange.codePlaceholder")}
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, ""))}
                  />
                </div>
              </fieldset>
              <button type="submit" className="emlSubmit" disabled={!ready || busy}>
                {busy ? t(catalog, "settings.emailChange.submitting") : t(catalog, "settings.emailChange.submit")}
              </button>
              <p className="emlNote">{t(catalog, "settings.emailChange.note")}</p>
              {message ? <p className="setError" role="alert">{message}</p> : null}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

type LinkOutcome = "checking" | "confirmed" | "cancelled" | "invalid" | "expired" | "unavailable" | "failed";

function outcomeCopy(catalog: MessageCatalog, outcome: Exclude<LinkOutcome, "checking">): readonly [string, string] {
  switch (outcome) {
    case "confirmed":
      return [t(catalog, "settings.emailLink.confirmedTitle"), t(catalog, "settings.emailLink.confirmedBody")];
    case "cancelled":
      return [t(catalog, "settings.emailLink.cancelledTitle"), t(catalog, "settings.emailLink.cancelledBody")];
    case "invalid":
      return [t(catalog, "settings.emailLink.invalidTitle"), t(catalog, "settings.emailLink.invalidBody")];
    case "expired":
      return [t(catalog, "settings.emailLink.expiredTitle"), t(catalog, "settings.emailLink.expiredBody")];
    case "unavailable":
      return [t(catalog, "settings.emailLink.unavailableTitle"), t(catalog, "settings.emailLink.unavailableBody")];
    case "failed":
      return [t(catalog, "settings.emailLink.failedTitle"), t(catalog, "settings.emailLink.failedBody")];
  }
}

function outcomeOf(failure: unknown): LinkOutcome {
  const reason = serverCode(failure);
  if (reason === "LINK_EXPIRED") return "expired";
  if (reason === "LINK_INVALID") return "invalid";
  if (reason === "ADDRESS_UNAVAILABLE") return "unavailable";
  return "failed";
}

// A bearer is single-use: React's development double-effect must not spend it
// twice, so each token is presented at most once per page load.
const presented = new WeakMap<object, Map<string, Promise<LinkOutcome>>>();

export function EmailChangeLinkScreen({
  client = contractClient,
  catalog = settingsEnglish,
  link,
  onDone
}: Readonly<{
  client?: LinkClient;
  catalog?: MessageCatalog;
  link: EmailChangeLink;
  onDone: () => void;
}>) {
  const [outcome, setOutcome] = useState<LinkOutcome>("checking");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const key = `${link.action}:${link.token}`;
    const spent = presented.get(client) ?? new Map<string, Promise<LinkOutcome>>();
    presented.set(client, spent);
    let attempt = spent.get(key);
    if (attempt === undefined) {
      attempt = (link.action === "confirm"
        ? client.confirmEmailChange(link.token).then((): LinkOutcome => "confirmed")
        : client.cancelEmailChangeByLink(link.token).then((): LinkOutcome => "cancelled")
      ).catch(outcomeOf);
      spent.set(key, attempt);
    }
    void attempt.then((result) => { if (mounted.current) setOutcome(result); });
    return () => { mounted.current = false; };
  }, [client, link]);

  const copy = outcome === "checking" ? null : outcomeCopy(catalog, outcome);
  return (
    <div className="screen scroll setScreen emlScreen">
      <div className="emlScreenBody">
        <div className="emlScreenInner" role="status" aria-live="polite">
          <p className="emlEyebrow">{t(catalog, "settings.emailChange.eyebrow")}</p>
          {copy === null ? (
            <p className="emlLede">{t(catalog, "settings.emailLink.checking")}</p>
          ) : (
            <>
              <h1 className="emlTitle">{copy[0]}</h1>
              <p className="emlLede">{copy[1]}</p>
              <button type="button" className="emlSubmit emlContinue" onClick={onDone}>
                {t(catalog, "settings.emailLink.continue")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
