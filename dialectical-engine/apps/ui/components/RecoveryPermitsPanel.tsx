"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ContractHttpError, type RecoveryPermitsPage } from "@debateai/contract";
import { createRecoveryPermitsClient, type RecoveryPermitRequest, type RecoveryPermitsClient } from "../lib/recoveryPermitsApi.js";
import { holdsNoStaffSession } from "../lib/api.js";
import { formatDate, t, type MessageCatalog } from "../lib/i18n/translate.js";
import type { LocaleCode } from "../lib/i18n/locales.js";
import staffEnglish from "../messages/en/staff.json";
import { focusIsLost, isFocusParked } from "../lib/focusGuard.js";
import "./StaffAccessPanel.css";

/** The one decision waiting for the key. "stop" is the refusal of a request already approved. */
type Pending = Readonly<{ kind: "approve" | "refuse" | "stop"; request: RecoveryPermitRequest }>;
type Message = Readonly<{ key: string; good: boolean }>;

const K = "staff.recoveryPermits";
/** The API's refusals by name, each with its own plain sentence. Anything else is the general one. */
const REFUSALS: Readonly<Record<string, string>> = Object.freeze({
  RECOVERY_PERMITS_STALE: `${K}.stale`,
  RECOVERY_PERMIT_NOT_ALLOWED: `${K}.notAllowed`,
  RECOVERY_PERMITS_DAILY_CAP: `${K}.dailyCap`,
  STAFF_ALERT_UNAVAILABLE: `${K}.locked`
});

function failureKey(failure: unknown): string {
  if (failure instanceof Error && failure.message.startsWith("STAFF_WEBAUTHN_")) return `${K}.nothingChanged`;
  if (failure instanceof ContractHttpError && failure.serverCode !== null) return REFUSALS[failure.serverCode] ?? `${K}.failed`;
  return `${K}.failed`;
}
const rowName = (ref: string) => `recovery-permit-${ref}`;

/**
 * Requests to get back into an account (migration 0188): a person who lost every sign-in method and has no saved code
 * proved the mailbox and the password, and the Owner decides. The server is the only judge of who the Owner is: any failed
 * read (a 404 included, where the server does not offer this) renders nothing at all. Each request shows only what the
 * server sent, the address already shortened there; nothing is masked or worked out here.
 */
export function RecoveryPermitsPanel({ client, catalog = staffEnglish, locale = "en" }: { client?: RecoveryPermitsClient; catalog?: MessageCatalog; locale?: LocaleCode }) {
  const api = useMemo(() => client ?? createRecoveryPermitsClient(), [client]);
  const [page, setPage] = useState<RecoveryPermitsPage | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const reads = useRef(0);
  const authority = useRef(0);

  const hide = () => {
    reads.current++;
    authority.current++;
    api.cancel();
    setPage(null); setPending(null); setMessage(null); setBusy(false);
  };
  async function load() {
    const current = ++reads.current;
    let value: RecoveryPermitsPage;
    try {
      value = await api.read();
    } catch {
      if (current === reads.current) hide();
      return;
    }
    if (current === reads.current) setPage(value);
  }
  useEffect(() => {
    const authorityChanged = (event: Event) => {
      const capabilities = (event as CustomEvent<{ capabilities: string[] }>).detail.capabilities;
      if (capabilities.length === 0) hide();
      else void load();
    };
    window.addEventListener("debateai:staff-authority-changed", authorityChanged);
    // Before the team sign-in this browser holds no team cookie, and the read could only be refused (401), which makes the
    // browser forget the site password. The panel loads when the team sign-in says so (debateai:staff-authority-changed).
    if (!holdsNoStaffSession()) void load();
    return () => {
      reads.current++;
      authority.current++;
      window.removeEventListener("debateai:staff-authority-changed", authorityChanged);
      api.cancel();
    };
  }, [api]);

  // As on the other Team page panels: asking switches the buttons off under focus and opens the confirm away from them, so
  // focus goes to Confirm, and Cancel gives focus back to the button the Owner pressed, read the moment they pressed it.
  const confirmButton = useRef<HTMLButtonElement>(null);
  const asker = useRef<HTMLElement | null>(null);
  const backToAsker = useRef(false);
  const focusedNow = (): HTMLElement | null => {
    const focused = document.activeElement;
    return focused instanceof HTMLElement && focused !== document.body && !isFocusParked(focused) ? focused : null;
  };
  useEffect(() => {
    if (pending === null) return;
    if (focusIsLost() || document.activeElement?.matches(":disabled")) confirmButton.current?.focus();
  }, [pending]);
  useEffect(() => {
    if (!backToAsker.current || pending !== null || busy) return;
    backToAsker.current = false;
    const back = asker.current;
    if (back?.isConnected && !back.matches(":disabled") && focusIsLost()) back.focus();
  });

  if (page === null) return null;
  const capReached = page.approved_today >= page.daily_cap;

  function ask(kind: Pending["kind"], request: RecoveryPermitRequest) {
    if (busy || pending !== null) return;
    asker.current = focusedNow();
    setMessage(null);
    setPending({ kind, request });
  }
  async function go(change: Pending) {
    if (busy) return;
    const epoch = authority.current;
    setBusy(true);
    setMessage(null);
    try {
      if (change.kind === "approve") await api.approve(change.request.ref, change.request.revision);
      else await api.refuse(change.request.ref, change.request.revision);
      if (authority.current !== epoch) return;
      setPending(null);
      setMessage({ key: change.kind === "approve" ? `${K}.approved` : change.kind === "refuse" ? `${K}.refused` : `${K}.stopped`, good: true });
      await load();
    } catch (failure) {
      if (authority.current !== epoch) return;
      const key = failureKey(failure);
      setPending(null);
      setMessage({ key, good: false });
      // A cancelled key changed nothing here or anywhere. Every other failure may mean the list is out of date, or the authority is gone.
      if (key !== `${K}.nothingChanged`) await load();
    } finally {
      if (authority.current === epoch) setBusy(false);
    }
  }
  function cancel() {
    backToAsker.current = true;
    setPending(null);
  }

  const date = (value: string) => formatDate(locale, value, { dateStyle: "medium", timeStyle: "short" });
  const shown = (masked: string | null) => masked ?? t(catalog, `${K}.unreadable`);
  const yesNo = (value: boolean | null) => t(catalog, value === null ? `${K}.unknown` : value ? `${K}.yes` : `${K}.no`);
  /** Why Approve is off for this request, or null when it is on. The server refuses the same cases on its own. */
  const blocked = (request: RecoveryPermitRequest): string | null => request.security_hold ? t(catalog, `${K}.blockedHold`)
    : request.risk_mark ? t(catalog, `${K}.blockedRisk`)
      : capReached ? t(catalog, `${K}.blockedCap`, { cap: String(page.daily_cap) }) : null;
  const pendingLine = (change: Pending) => t(catalog, change.kind === "approve" ? `${K}.confirmApprove` : change.kind === "refuse" ? `${K}.confirmRefuse` : `${K}.confirmStop`,
    { address: shown(change.request.masked_address) });
  const locked = busy || pending !== null;
  const asks = page.requests.filter(request => request.stage === "REQUESTED");
  const approved = page.requests.filter(request => request.stage !== "REQUESTED");
  const fact = (label: string, value: string) => <div><dt>{t(catalog, label)}</dt><dd>{value}</dd></div>;

  return <div className="setInner staffAccess teamLimitPanel" data-recovery-permits-panel aria-busy={busy}>
    <section className="setCard" aria-labelledby="recovery-permits-title">
      <h2 className="staffSectionTitle" id="recovery-permits-title">{t(catalog, `${K}.title`)}</h2>
      <p className="setCardHint">{t(catalog, `${K}.hint`)}</p>
      <p data-recovery-permits-used>{t(catalog, `${K}.used`, { count: String(page.approved_today), cap: String(page.daily_cap) })}</p>
      {asks.length === 0 ? <p className="setCardHint" data-recovery-permits-empty>{t(catalog, `${K}.empty`)}</p> : <ul className="staffAuditList staffMemberList" data-recovery-permits-list>
        {asks.map(request => {
          const reason = blocked(request);
          return <li className="staffMember" key={request.ref} data-recovery-permit={request.ref}>
            <h3 className="staffTarget" id={rowName(request.ref)}>{shown(request.masked_address)}</h3>
            <dl className="teamLimitFigures">
              {fact(`${K}.asked`, date(request.requested_at))}
              {fact(`${K}.endsBy`, date(request.request_expires_at))}
              {fact(`${K}.created`, formatDate(locale, request.account_created_at, { dateStyle: "medium" }))}
              {fact(`${K}.lastSignIn`, request.last_sign_in_at === null ? t(catalog, `${K}.never`) : date(request.last_sign_in_at))}
              {fact(`${K}.proofs`, t(catalog, `${K}.proofsValue`))}
              {fact(`${K}.passkeys`, String(request.passkeys))}
              {fact(`${K}.app`, yesNo(request.authenticator_app))}
              {fact(`${K}.codesLeft`, yesNo(request.saved_codes_left))}
              {fact(`${K}.hold`, yesNo(request.security_hold))}
              {fact(`${K}.risk`, yesNo(request.risk_mark))}
              {fact(`${K}.paid`, yesNo(request.ever_paid))}
              {fact(`${K}.earlier`, String(request.earlier_requests))}
            </dl>
            {reason === null ? null : <p className="setCardHint" id={`${rowName(request.ref)}-blocked`} data-recovery-permit-blocked>{reason}</p>}
            <div className="staffActions">
              <button className="setBtn setBtnPrimary" type="button" disabled={locked || reason !== null}
                aria-describedby={[rowName(request.ref), reason === null ? null : `${rowName(request.ref)}-blocked`].filter(Boolean).join(" ")}
                onClick={() => ask("approve", request)}>{t(catalog, `${K}.approve`)}</button>
              <button className="setBtn" type="button" disabled={locked} aria-describedby={rowName(request.ref)}
                onClick={() => ask("refuse", request)}>{t(catalog, `${K}.refuse`)}</button>
            </div>
          </li>;
        })}
      </ul>}
      {approved.length === 0 ? null : <>
        <h3 className="staffTarget" id="recovery-permits-approved-title">{t(catalog, `${K}.approvedTitle`)}</h3>
        <ul className="staffAuditList" aria-labelledby="recovery-permits-approved-title" data-recovery-permits-approved>
          {approved.map(request => <li key={request.ref} data-recovery-permit={request.ref}>
            <strong id={rowName(request.ref)}>{shown(request.masked_address)}</strong>
            {request.approved_at === null ? null : <span className="setCardHint"> {t(catalog, `${K}.approvedAt`, { date: date(request.approved_at) })}</span>}
            {request.not_before === null || request.finish_expires_at === null ? null
              : <span className="setCardHint"> {t(catalog, `${K}.window`, { from: date(request.not_before), until: date(request.finish_expires_at) })}</span>}
            {request.stage === "OPENED" ? <span className="setCardHint"> {t(catalog, `${K}.opened`)}</span> : null}
            <div className="staffActions"><button className="setBtn" type="button" disabled={locked} aria-describedby={rowName(request.ref)}
              onClick={() => ask("stop", request)}>{t(catalog, `${K}.stop`)}</button></div>
          </li>)}
        </ul>
      </>}
      {message !== null ? <p className={message.good ? "staffNotice" : "setError"} role="status">{t(catalog, message.key, { cap: String(page.daily_cap) })}</p> : null}
      {pending !== null ? <div className="staffMutation" data-recovery-permits-confirm={pending.kind}>
        <p>{pendingLine(pending)}</p>
        <p className="setCardHint">{t(catalog, `${K}.key`)}</p>
        <div className="staffActions">
          <button className="setBtn setBtnPrimary" type="button" ref={confirmButton} disabled={busy} onClick={() => { void go(pending); }}>{t(catalog, `${K}.confirm`)}</button>
          <button className="setBtn" type="button" disabled={busy} onClick={cancel}>{t(catalog, `${K}.cancel`)}</button>
        </div>
      </div> : null}
    </section>
  </div>;
}
