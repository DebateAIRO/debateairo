"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ContractHttpError, PreviewBuyerFindRequestSchema, type PreviewBuyersPage } from "@debateai/contract";
import { createPreviewBuyersClient, type PreviewBuyer, type PreviewBuyersClient } from "../lib/previewBuyersApi.js";
import { holdsNoStaffSession } from "../lib/api.js";
import { formatDate, t, type MessageCatalog } from "../lib/i18n/translate.js";
import type { LocaleCode } from "../lib/i18n/locales.js";
import staffEnglish from "../messages/en/staff.json";
import { focusIsLost, isFocusParked } from "../lib/focusGuard.js";
import "./StaffAccessPanel.css";

/** The one change waiting for the key. An addition keeps the typed address only here, in memory, until it is sent or dropped. */
type Pending =
  | Readonly<{ kind: "add"; address: string; masked: string }>
  | Readonly<{ kind: "remove"; buyer: PreviewBuyer }>;
type Message = Readonly<{ key: string; good: boolean }>;

const K = "staff.previewBuyers";
/** The API's refusals by name, each with its own plain sentence. Anything else is the general one. */
const REFUSALS: Readonly<Record<string, string>> = Object.freeze({
  PREVIEW_BUYER_ACCOUNT_UNKNOWN: `${K}.unknown`,
  PREVIEW_BUYER_ON_TEAM: `${K}.onTeam`,
  PREVIEW_BUYER_ALREADY: `${K}.already`,
  PREVIEW_BUYERS_FULL: `${K}.full`,
  PREVIEW_BUYERS_STALE: `${K}.stale`,
  PREVIEW_BUYER_NOT_LISTED: `${K}.notListed`,
  PREVIEW_BUYERS_NOT_OPEN: `${K}.notOpen`,
  STAFF_ALERT_UNAVAILABLE: `${K}.locked`,
  STAFF_OPERATION_CONFLICT: `${K}.conflict`,
  STAFF_INPUT_INVALID: `${K}.invalid`
});

function failureKey(failure: unknown): string {
  if (failure instanceof Error && failure.message.startsWith("STAFF_WEBAUTHN_")) return `${K}.nothingChanged`;
  if (failure instanceof ContractHttpError && failure.serverCode !== null) return REFUSALS[failure.serverCode] ?? `${K}.failed`;
  return `${K}.failed`;
}
const rowName = (ref: string) => `preview-buyer-${ref}`;

/**
 * Who may buy while the whole site is open with buying kept to listed accounts: the Owner's list (migration 0186), beside
 * the team. The server is the only judge of who the Owner is: any failed read renders nothing at all, so everyone else
 * sees no hint that this panel exists. An addition shows the account's shortened address before the key is touched, so
 * the Owner sees whom it names; the full address is typed here and never shown back. The title, the hint and the
 * confirmation say whether the list buys with test payments or with real money, as the server's answer names them.
 */
export function PreviewBuyersPanel({ client, catalog = staffEnglish, locale = "en" }: { client?: PreviewBuyersClient; catalog?: MessageCatalog; locale?: LocaleCode }) {
  const api = useMemo(() => client ?? createPreviewBuyersClient(), [client]);
  const [page, setPage] = useState<PreviewBuyersPage | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const reads = useRef(0);
  const authority = useRef(0);
  const addressField = useRef<HTMLInputElement>(null);

  const hide = () => {
    reads.current++;
    authority.current++;
    api.cancel();
    setPage(null); setPending(null); setMessage(null); setBusy(false);
  };
  async function load() {
    const current = ++reads.current;
    let value: PreviewBuyersPage;
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

  // As on the other Team page panels: asking switches the form (or Remove) off under focus and opens the confirm away from
  // it, so focus goes to Confirm, and Cancel gives focus back to where the person asked from. Where they asked from is
  // read the moment they ask, before anything is switched off; nothing focused then means no place is kept.
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
  const current = page;
  /** The typed address leaves the field once its attempt is over, whatever the outcome. */
  const clearAddress = () => { if (addressField.current !== null) addressField.current.value = ""; };

  async function askAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || pending !== null) return;
    const from = focusedNow();
    const address = (addressField.current?.value ?? "").trim();
    setMessage(null);
    if (!PreviewBuyerFindRequestSchema.safeParse({ address }).success) {
      clearAddress();
      setMessage({ key: `${K}.invalid`, good: false });
      return;
    }
    const epoch = authority.current;
    setBusy(true);
    try {
      // The look-up touches no key and changes nothing: the Owner sees whom the address names before confirming.
      const found = await api.find(address);
      if (authority.current !== epoch) return;
      asker.current = from;
      setPending({ kind: "add", address, masked: found.masked_address });
    } catch (failure) {
      if (authority.current !== epoch) return;
      clearAddress();
      const key = failureKey(failure);
      setMessage({ key, good: false });
      if (key === `${K}.failed` || key === `${K}.full` || key === `${K}.already` || key === `${K}.notOpen`) await load();
    } finally {
      if (authority.current === epoch) setBusy(false);
    }
  }
  function askRemove(buyer: PreviewBuyer) {
    if (busy || pending !== null) return;
    asker.current = focusedNow();
    setMessage(null);
    setPending({ kind: "remove", buyer });
  }
  async function go(change: Pending) {
    if (busy) return;
    const epoch = authority.current;
    setBusy(true);
    setMessage(null);
    try {
      if (change.kind === "add") await api.add(change.address, current.revision);
      else await api.remove(change.buyer.ref, current.revision);
      if (authority.current !== epoch) return;
      setPending(null);
      clearAddress();
      setMessage({ key: change.kind === "add" ? `${K}.added` : `${K}.removed`, good: true });
      await load();
    } catch (failure) {
      if (authority.current !== epoch) return;
      const key = failureKey(failure);
      setPending(null);
      clearAddress();
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
    clearAddress();
  }

  const shown = (masked: string | null) => masked ?? t(catalog, `${K}.unreadable`);
  /** With real payments the box says real money, and its confirmation carries no test-plan rule. */
  const real = page.environment === "live";
  const pendingLine = (change: Pending) => change.kind === "add"
    ? t(catalog, real ? `${K}.confirmAddReal` : `${K}.confirmAdd`, { address: change.masked })
    : t(catalog, `${K}.confirmRemove`, { address: shown(change.buyer.masked_address) });
  const locked = busy || pending !== null;
  const count = page.team_count + page.buyers.length;

  return <div className="setInner staffAccess teamLimitPanel" data-preview-buyers-panel aria-busy={busy}>
    <section className="setCard" aria-labelledby="preview-buyers-title">
      <h2 className="staffSectionTitle" id="preview-buyers-title">{t(catalog, real ? `${K}.titleReal` : `${K}.title`)}</h2>
      <p className="setCardHint">{t(catalog, real ? `${K}.hintReal` : `${K}.hint`)}</p>
      {page.applies ? null : <p className="setCardHint" data-preview-buyers-not-now>{t(catalog, `${K}.notNow`)}</p>}
      {/* While the list counts for nothing its accounts cannot buy through it, so the line only counts who is on it. */}
      {page.applies ? <p data-preview-buyers-count>{t(catalog, `${K}.count`, { count: String(count), cap: String(page.cap) })}</p>
        : page.buyers.length === 0 ? null : <p data-preview-buyers-count>{t(catalog, `${K}.countIdle`, { count: String(page.buyers.length) })}</p>}
      {page.buyers.length === 0 ? <p className="setCardHint" data-preview-buyers-empty>{t(catalog, `${K}.empty`)}</p> : <ul className="staffAuditList" data-preview-buyers-list>
        {page.buyers.map(buyer => <li key={buyer.ref} data-preview-buyer={buyer.ref}>
          <strong id={rowName(buyer.ref)}>{shown(buyer.masked_address)}</strong>
          <span className="setCardHint">{t(catalog, `${K}.since`, { date: formatDate(locale, buyer.since, { dateStyle: "medium" }) })}</span>
          <div className="staffActions"><button className="setBtn" type="button" disabled={locked} aria-describedby={rowName(buyer.ref)}
            onClick={() => askRemove(buyer)}>{t(catalog, `${K}.remove`)}</button></div>
        </li>)}
      </ul>}
      {/* noValidate: the panel says what is wrong in its own words, and a browser's own rule for e-mail fields never stops an address the site accepts. */}
      {page.applies ? <form className="teamLimitForm" data-preview-buyers-form noValidate onSubmit={(event) => { void askAdd(event); }}><fieldset disabled={locked}>
        <div className="staffField"><label htmlFor="preview-buyer-address">{t(catalog, `${K}.address`)}</label>
          <input id="preview-buyer-address" name="address" type="email" ref={addressField} autoComplete="off" spellCheck={false} required maxLength={320}/></div>
        <div className="staffActions"><button className="setBtn setBtnPrimary" type="submit">{t(catalog, `${K}.add`)}</button></div>
        <p className="setCardHint">{t(catalog, `${K}.lockHint`)}</p>
      </fieldset></form> : null}
      {message !== null ? <p className={message.good ? "staffNotice" : "setError"} role="status">{t(catalog, message.key, { cap: String(page.cap) })}</p> : null}
      {pending !== null ? <div className="staffMutation" data-preview-buyers-confirm={pending.kind}>
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
