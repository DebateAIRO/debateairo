"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ContractHttpError, type TeamAllowancePage } from "@debateai/contract";
import { createTeamAllowanceClient, type TeamAllowanceClient, type TeamAllowanceGift } from "../lib/teamAllowanceApi.js";
import { dollarsToMicros, formatDollars } from "../lib/teamLimitApi.js";
import { formatDate, t, type MessageCatalog } from "../lib/i18n/translate.js";
import type { LocaleCode } from "../lib/i18n/locales.js";
import staffEnglish from "../messages/en/staff.json";
import { focusIsLost, isFocusParked } from "../lib/focusGuard.js";
import "./StaffAccessPanel.css";

type Member = TeamAllowancePage["members"][number];
type LogEntry = TeamAllowancePage["log"][number];
type Pending =
  | Readonly<{ kind: "give"; member: Member; gift: TeamAllowanceGift }>
  | Readonly<{ kind: "takeBack"; member: Member; grantId: string }>;
const DAY_MS = 86_400_000;
const staffName = (staffId: string) => `staff-${staffId.replaceAll("-", "")}`;

function failureKey(failure: unknown): string {
  if (failure instanceof Error && failure.message.startsWith("STAFF_WEBAUTHN_")) return "staff.teamAllowance.nothingChanged";
  if (failure instanceof ContractHttpError) {
    if (failure.status === 409 && failure.serverCode === "TEAM_ALLOWANCE_STALE") return "staff.teamAllowance.stale";
    if (failure.status === 409 && failure.serverCode === "TEAM_ALLOWANCE_EXISTS") return "staff.teamAllowance.exists";
    if (failure.status === 409 && failure.serverCode === "TEAM_ALLOWANCE_MEMBER_UNAVAILABLE") return "staff.teamAllowance.unavailable";
    if (failure.status === 422 && failure.serverCode === "TEAM_ALLOWANCE_INVALID") return "staff.teamAllowance.tooMuch";
    if (failure.status === 503 && failure.serverCode === "STAFF_ALERT_UNAVAILABLE") return "staff.teamAllowance.locked";
  }
  return "staff.teamAllowance.failed";
}

function logLine(entry: LogEntry, catalog: MessageCatalog, locale: string): string {
  const name = staffName(entry.subject_staff_id);
  const dollars = (micros: number | undefined) => formatDollars(locale, micros ?? 0);
  if (entry.kind === "GIVEN") return t(catalog, "staff.teamAllowance.log.given", { name, amount: dollars(entry.amount_micros), day: dollars(entry.day_micros), week: dollars(entry.week_micros) });
  if (entry.kind === "TAKEN_BACK") return t(catalog, "staff.teamAllowance.log.takenBack", { name });
  return t(catalog, `staff.teamAllowance.log.ended.${entry.cause ?? "STAFF_DISABLED"}`, { name });
}

/**
 * The Owner's allowances for team members (plan 2026-10-31-r22-owner-changes decision 32). The server is the only judge of who is the Owner: any
 * failed read renders nothing at all, so everyone else, the partner included, sees no hint that this panel exists.
 */
export function TeamAllowancePanel({ client, catalog = staffEnglish, locale = "en" }: { client?: TeamAllowanceClient; catalog?: MessageCatalog; locale?: LocaleCode }) {
  const api = useMemo(() => client ?? createTeamAllowanceClient(), [client]);
  const [page, setPage] = useState<TeamAllowancePage | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [message, setMessage] = useState<Readonly<{ key: string; good: boolean }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [formGeneration, setFormGeneration] = useState(0);
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
    let value: TeamAllowancePage;
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
    void load();
    return () => {
      reads.current++;
      authority.current++;
      window.removeEventListener("debateai:staff-authority-changed", authorityChanged);
      api.cancel();
    };
  }, [api]);

  // Keyboard audit 2026-11-12: asking switches the form (or Take back) off under focus and opens the confirm away from
  // it: focus goes to Confirm. Cancel gives focus back to where the person asked from, once that is switched on again.
  const confirmButton = useRef<HTMLButtonElement>(null);
  const asker = useRef<HTMLElement | null>(null);
  const backToAsker = useRef(false);
  useEffect(() => {
    if (pending === null) return;
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused !== document.body && !isFocusParked(focused)) asker.current = focused;
    if (focusIsLost() || focused?.matches(":disabled")) confirmButton.current?.focus();
  }, [pending]);
  useEffect(() => {
    if (!backToAsker.current || pending !== null || busy) return;
    backToAsker.current = false;
    const back = asker.current;
    if (back?.isConnected && !back.matches(":disabled") && focusIsLost()) back.focus();
  });

  if (page === null) return null;
  const { limits, members } = page;
  const dollars = (micros: number) => formatDollars(locale, micros);
  const maxDays = Math.floor(limits.maximum_lifetime_ms / DAY_MS);
  const nameOf = (member: Member) => member.is_owner ? t(catalog, "staff.teamAllowance.you", { name: member.pseudonym }) : member.pseudonym;

  async function go(change: Pending) {
    if (busy) return;
    const epoch = authority.current;
    setBusy(true);
    setMessage(null);
    try {
      if (change.kind === "give") await api.give(change.gift);
      else await api.takeBack(change.member.staff_id, change.grantId, change.member.revision);
      if (authority.current !== epoch) return;
      setPending(null);
      setFormGeneration(value => value + 1);
      setMessage({ key: "staff.teamAllowance.done", good: true });
      await load();
    } catch (failure) {
      if (authority.current !== epoch) return;
      const key = failureKey(failure);
      setPending(null);
      setMessage({ key, good: false });
      // A cancelled passkey changed nothing here or anywhere. Every other failure may mean the page is out of date, or the authority is gone.
      if (key !== "staff.teamAllowance.nothingChanged") await load();
    } finally {
      if (authority.current === epoch) setBusy(false);
    }
  }
  function refuse(key: string) {
    setPending(null);
    setMessage({ key, good: false });
  }
  function askGive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const member = members.find(row => row.staff_id === String(data.get("person") ?? ""));
    if (member === undefined) return refuse("staff.teamAllowance.chooseFirst");
    const amountMicros = dollarsToMicros(String(data.get("amount") ?? "")), dayMicros = dollarsToMicros(String(data.get("day") ?? "")), weekMicros = dollarsToMicros(String(data.get("week") ?? ""));
    if (amountMicros === null || dayMicros === null || weekMicros === null || amountMicros === 0 || dayMicros === 0 || weekMicros === 0) return refuse("staff.teamAllowance.invalidAmount");
    if (dayMicros > weekMicros || weekMicros > amountMicros) return refuse("staff.teamAllowance.outOfOrder");
    if (amountMicros > limits.maximum_grant_micros || dayMicros > limits.maximum_day_micros || weekMicros > limits.maximum_week_micros) return refuse("staff.teamAllowance.tooMuch");
    const days = Number(String(data.get("days") ?? "").trim());
    if (!Number.isInteger(days) || days < 1 || days > maxDays) return refuse("staff.teamAllowance.invalidDays");
    setMessage(null);
    setPending({ kind: "give", member, gift: { staffId: member.staff_id, revision: member.revision, amountMicros, dayMicros, weekMicros, days } });
  }
  function pendingLine(change: Pending): string {
    if (change.kind === "takeBack") return t(catalog, "staff.teamAllowance.confirmTakeBack", { name: nameOf(change.member) });
    const { gift } = change;
    return t(catalog, "staff.teamAllowance.confirmGive", { name: nameOf(change.member), amount: dollars(gift.amountMicros), day: dollars(gift.dayMicros), week: dollars(gift.weekMicros), days: String(gift.days) });
  }
  const locked = busy || pending !== null;
  const withoutOne = members.filter(member => member.allowance === null);

  return <div className="setInner staffAccess teamLimitPanel" data-team-allowance-panel aria-busy={busy}>
    <section className="setCard">
      <h2 className="staffSectionTitle">{t(catalog, "staff.teamAllowance.title")}</h2>
      <p className="setCardHint">{t(catalog, "staff.teamAllowance.hint")}</p>
      <ul className="staffAuditList" data-team-allowance-members>
        {members.map(member => <li key={member.staff_id} data-team-allowance-member={member.staff_id}>
          <strong>{nameOf(member)}</strong>
          {member.allowance === null ? <span className="setCardHint">{t(catalog, "staff.teamAllowance.none")}</span> : <>
            <span>{t(catalog, "staff.teamAllowance.line", { spent: dollars(member.allowance.spent_micros), amount: dollars(member.allowance.amount_micros),
              day: dollars(member.allowance.day_micros), week: dollars(member.allowance.week_micros), ends: formatDate(locale, member.allowance.expires_at, { dateStyle: "medium" }) })}</span>
            <div className="staffActions"><button className="setBtn" type="button" disabled={locked} onClick={() => { setMessage(null); setPending({ kind: "takeBack", member, grantId: member.allowance!.grant_id }); }}>{t(catalog, "staff.teamAllowance.takeBack")}</button></div>
          </>}
        </li>)}
      </ul>
    </section>
    <section className="setCard">
      <h2 className="staffSectionTitle">{t(catalog, "staff.teamAllowance.give")}</h2>
      {withoutOne.length === 0 ? <p className="setCardHint">{t(catalog, "staff.teamAllowance.nobody")}</p> : <>
        <p className="setCardHint" data-team-allowance-most>{t(catalog, "staff.teamAllowance.most", { amount: dollars(limits.maximum_grant_micros), day: dollars(limits.maximum_day_micros), week: dollars(limits.maximum_week_micros), days: String(maxDays) })}</p>
        <form className="teamLimitForm" data-team-allowance-form key={`give-${formGeneration}`} onSubmit={askGive}><fieldset disabled={locked}>
          <div className="staffField"><label htmlFor="team-allowance-person">{t(catalog, "staff.teamAllowance.person")}</label><select id="team-allowance-person" name="person" required defaultValue="">
            <option value="" disabled>{t(catalog, "staff.teamAllowance.choose")}</option>
            {withoutOne.map(member => <option key={member.staff_id} value={member.staff_id}>{nameOf(member)}</option>)}
          </select></div>
          <div className="staffField"><label htmlFor="team-allowance-amount">{t(catalog, "staff.teamAllowance.amount")}</label><input id="team-allowance-amount" name="amount" inputMode="decimal" autoComplete="off" required maxLength={20}/></div>
          <div className="staffField"><label htmlFor="team-allowance-day">{t(catalog, "staff.teamAllowance.day")}</label><input id="team-allowance-day" name="day" inputMode="decimal" autoComplete="off" required maxLength={20}/></div>
          <div className="staffField"><label htmlFor="team-allowance-week">{t(catalog, "staff.teamAllowance.week")}</label><input id="team-allowance-week" name="week" inputMode="decimal" autoComplete="off" required maxLength={20}/></div>
          <div className="staffField"><label htmlFor="team-allowance-days">{t(catalog, "staff.teamAllowance.days")}</label><input id="team-allowance-days" name="days" inputMode="numeric" autoComplete="off" required maxLength={3} defaultValue={String(maxDays)}/></div>
          <div className="staffActions"><button className="setBtn setBtnPrimary" type="submit">{t(catalog, "staff.teamAllowance.give")}</button></div>
        </fieldset></form>
      </>}
      {message !== null ? <p className={message.good ? "staffNotice" : "setError"} role="status">{t(catalog, message.key)}</p> : null}
      {pending !== null ? <div className="staffMutation" data-team-allowance-confirm={pending.kind}>
        <p>{pendingLine(pending)}</p>
        <p className="setCardHint">{t(catalog, "staff.teamAllowance.passkey")}</p>
        <div className="staffActions">
          <button className="setBtn setBtnPrimary" type="button" ref={confirmButton} disabled={busy} onClick={() => { void go(pending); }}>{t(catalog, "staff.teamAllowance.confirm")}</button>
          <button className="setBtn" type="button" disabled={busy} onClick={() => { backToAsker.current = true; setPending(null); }}>{t(catalog, "staff.teamAllowance.cancel")}</button>
        </div>
      </div> : null}
    </section>
    <section className="setCard">
      <h2 className="staffSectionTitle">{t(catalog, "staff.teamAllowance.log.title")}</h2>
      {page.log.length === 0 ? <p className="setCardHint">{t(catalog, "staff.teamAllowance.log.empty")}</p> : <ul className="staffAuditList" data-team-allowance-log>
        {page.log.map((entry, index) => <li key={`${entry.at}-${entry.kind}-${index}`}>
          <strong>{logLine(entry, catalog, locale)}</strong>
          <time dateTime={entry.at}>{formatDate(locale, entry.at, { dateStyle: "medium", timeStyle: "short" })}</time>
          <span className="setCardHint">{entry.actor_staff_id === null ? t(catalog, "staff.teamAllowance.log.automatic") : t(catalog, "staff.teamAllowance.log.by", { name: staffName(entry.actor_staff_id) })}</span>
          {entry.notice === "WAITING" ? <span className="setCardHint">{t(catalog, "staff.teamAllowance.notice.WAITING")}</span> : null}
          {entry.notice === "FAILED" ? <p className="setError teamLimitNoticeFailed">{t(catalog, "staff.teamAllowance.notice.FAILED")}</p> : null}
        </li>)}
      </ul>}
    </section>
  </div>;
}
