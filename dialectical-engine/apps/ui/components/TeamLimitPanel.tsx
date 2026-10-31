"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ContractHttpError, type TeamLimitPage } from "@debateai/contract";
import { createTeamLimitClient, dollarsToMicros, formatDollars, isPracticeRef, type TeamLimitClient, type TeamMember } from "../lib/teamLimitApi.js";
import { formatDate, t, type MessageCatalog } from "../lib/i18n/translate.js";
import type { LocaleCode } from "../lib/i18n/locales.js";
import staffEnglish from "../messages/en/staff.json";
import "./StaffAccessPanel.css";

type LogEntry = TeamLimitPage["log"][number];
type Partner = NonNullable<TeamLimitPage["partner"]>;
/** The one change waiting for its passkey. Each names what it will send, so the words read and the amount proved cannot differ. */
type Pending =
  | Readonly<{ kind: "limit"; amountMicros: number }>
  | Readonly<{ kind: "pick"; member: TeamMember }>
  | Readonly<{ kind: "takeBack"; partner: Partner }>
  | Readonly<{ kind: "practice"; practiceRef: string; chargeMicros: number }>;
type Message = Readonly<{ key: string; good: boolean; at: "limit" | "partner" | "practice" }>;

const staffName = (staffId: string) => `staff-${staffId.replaceAll("-", "")}`;
const areaOf = (kind: Pending["kind"]): Message["at"] => kind === "limit" ? "limit" : kind === "practice" ? "practice" : "partner";

function failureKey(failure: unknown): string {
  if (failure instanceof Error && failure.message.startsWith("STAFF_WEBAUTHN_")) return "staff.teamLimit.nothingChanged";
  if (failure instanceof ContractHttpError) {
    if (failure.status === 409 && failure.serverCode === "TEAM_LIMIT_STALE") return "staff.teamLimit.stale";
    if (failure.status === 409 && failure.serverCode === "TEAM_LIMIT_PARTNER_EXISTS") return "staff.teamLimit.partnerExists";
    if (failure.status === 409 && failure.serverCode === "TEAM_PRACTICE_ALREADY_RECORDED") return "staff.teamLimit.alreadyCounted";
    if (failure.status === 503 && failure.serverCode === "STAFF_ALERT_UNAVAILABLE") return "staff.teamLimit.locked";
  }
  return "staff.teamLimit.failed";
}

function logLine(entry: LogEntry, catalog: MessageCatalog, locale: string): string {
  const dollars = (micros: number | null | undefined) => formatDollars(locale, micros ?? 0);
  const name = entry.subject_staff_id === undefined ? "" : staffName(entry.subject_staff_id);
  switch (entry.kind) {
    case "LIMIT":
      return entry.previous_micros === null || entry.previous_micros === undefined
        ? t(catalog, "staff.teamLimit.log.limitSet", { amount: dollars(entry.amount_micros) })
        : t(catalog, "staff.teamLimit.log.limitChanged", { old: dollars(entry.previous_micros), amount: dollars(entry.amount_micros) });
    case "PRACTICE":
      return t(catalog, "staff.teamLimit.log.practice", { amount: dollars(entry.amount_micros) });
    case "PARTNER_GRANTED":
      return t(catalog, "staff.teamLimit.log.picked", { name });
    case "PARTNER_REVOKED":
      return t(catalog, `staff.teamLimit.log.takenBack.${entry.cause ?? "OWNER_REVOKED"}`, { name });
  }
}

/**
 * The team's one limit (plan 2026-10-31-r22-owner-changes decision 24), for the two accounts that hold it. The server is the only judge of who
 * they are: any failed read renders nothing at all, so everyone else sees no hint that this panel exists.
 */
export function TeamLimitPanel({ client, catalog = staffEnglish, locale = "en" }: { client?: TeamLimitClient; catalog?: MessageCatalog; locale?: LocaleCode }) {
  const api = useMemo(() => client ?? createTeamLimitClient(), [client]);
  const [page, setPage] = useState<TeamLimitPage | null>(null);
  const [members, setMembers] = useState<readonly TeamMember[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const [formGeneration, setFormGeneration] = useState(0);
  const reads = useRef(0);
  const authority = useRef(0);

  const hide = () => {
    reads.current++;
    authority.current++;
    api.cancel();
    setPage(null); setMembers([]); setPending(null); setMessage(null); setBusy(false);
  };
  async function load() {
    const current = ++reads.current;
    let value: TeamLimitPage;
    try {
      value = await api.read();
    } catch {
      if (current === reads.current) hide();
      return;
    }
    if (current !== reads.current) return;
    setPage(value);
    if (!value.is_owner) { setMembers([]); return; }
    // The figures stand on their own: a team list that will not read only leaves nobody to pick.
    const team = await api.team().catch(() => []);
    if (current === reads.current) setMembers(team);
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

  if (page === null) return null;
  const current = page;
  const dollars = (micros: number) => formatDollars(locale, micros);

  async function go(change: Pending) {
    if (busy) return;
    const epoch = authority.current, at = areaOf(change.kind);
    setBusy(true);
    setMessage(null);
    try {
      if (change.kind === "limit") await api.setLimit(change.amountMicros, current);
      else if (change.kind === "pick") await api.pickPartner(change.member.staff_id, change.member.grant_revision);
      else if (change.kind === "takeBack") await api.takeBackPartner(change.partner.staff_id, change.partner.grant_revision);
      else await api.recordPractice(change.practiceRef, change.chargeMicros);
      if (authority.current !== epoch) return;
      setPending(null);
      setFormGeneration(value => value + 1);
      setMessage({ key: "staff.teamLimit.done", good: true, at });
      await load();
    } catch (failure) {
      if (authority.current !== epoch) return;
      const key = failureKey(failure);
      setPending(null);
      setMessage({ key, good: false, at });
      // A cancelled passkey changed nothing here or anywhere. Every other failure may mean the page is out of date, or the authority is gone.
      if (key !== "staff.teamLimit.nothingChanged") await load();
    } finally {
      if (authority.current === epoch) setBusy(false);
    }
  }
  function refuse(key: string, at: Message["at"]) {
    setPending(null);
    setMessage({ key, good: false, at });
  }
  function askLimit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountMicros = dollarsToMicros(String(new FormData(event.currentTarget).get("amount") ?? ""));
    if (amountMicros === null) return refuse("staff.teamLimit.invalidAmount", "limit");
    if (amountMicros === current.amount_micros) return refuse("staff.teamLimit.sameAmount", "limit");
    setMessage(null);
    setPending({ kind: "limit", amountMicros });
  }
  function askPick(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const person = String(new FormData(event.currentTarget).get("person") ?? "");
    const member = members.find(row => row.staff_id === person);
    if (member === undefined) return refuse("staff.teamLimit.partner.chooseFirst", "partner");
    setMessage(null);
    setPending({ kind: "pick", member });
  }
  function askPractice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const practiceRef = String(data.get("ref") ?? "").trim().toLowerCase();
    const chargeMicros = dollarsToMicros(String(data.get("amount") ?? ""));
    if (!isPracticeRef(practiceRef)) return refuse("staff.teamLimit.practice.invalidRef", "practice");
    if (chargeMicros === null) return refuse("staff.teamLimit.invalidAmount", "practice");
    setMessage(null);
    setPending({ kind: "practice", practiceRef, chargeMicros });
  }

  function pendingLine(change: Pending): string {
    switch (change.kind) {
      case "limit":
        return current.amount_micros === null
          ? t(catalog, "staff.teamLimit.confirmSet", { new: dollars(change.amountMicros) })
          : t(catalog, "staff.teamLimit.confirmChange", { old: dollars(current.amount_micros), new: dollars(change.amountMicros) });
      case "pick": return t(catalog, "staff.teamLimit.partner.confirmPick", { name: change.member.pseudonym });
      case "takeBack": return t(catalog, "staff.teamLimit.partner.confirmTakeBack", { name: change.partner.pseudonym });
      case "practice": return t(catalog, "staff.teamLimit.practice.confirm", { amount: dollars(change.chargeMicros), ref: change.practiceRef });
    }
  }
  const area = (at: Message["at"]) => <>
    {message?.at === at ? <p className={message.good ? "staffNotice" : "setError"} role="status">{t(catalog, message.key)}</p> : null}
    {pending !== null && areaOf(pending.kind) === at ? <div className="staffMutation" data-team-limit-confirm={pending.kind}>
      <p>{pendingLine(pending)}</p>
      <p className="setCardHint">{t(catalog, "staff.teamLimit.passkey")}</p>
      <div className="staffActions">
        <button className="setBtn setBtnPrimary" type="button" disabled={busy} onClick={() => { void go(pending); }}>{t(catalog, "staff.teamLimit.confirm")}</button>
        <button className="setBtn" type="button" disabled={busy} onClick={() => setPending(null)}>{t(catalog, "staff.teamLimit.cancel")}</button>
      </div>
    </div> : null}
  </>;

  const roomLeft = Math.max(0, (page.amount_micros ?? 0) - page.spent_micros - page.committed_micros);
  const month = formatDate(locale, page.month_starts_at, { month: "long", year: "numeric", timeZone: "UTC" });
  const pickable = members.filter(member => member.status === "ACTIVE" && !member.capabilities.includes("TEAM_GRANT"));
  const log = [...page.log].sort((left, right) => Date.parse(right.at) - Date.parse(left.at));
  const locked = busy || pending !== null;

  return <div className="setInner staffAccess teamLimitPanel" data-team-limit-panel aria-busy={busy}>
    <section className="setCard">
      <h2 className="staffSectionTitle">{t(catalog, "staff.teamLimit.title")}</h2>
      {page.amount_micros === null ? <p className="setCardHint" data-team-limit-empty>{t(catalog, "staff.teamLimit.noLimit")}</p> : <dl className="teamLimitFigures" data-team-limit-figures>
        {([["limit", "staff.teamLimit.limit", dollars(page.amount_micros)], ["spent", "staff.teamLimit.spent", dollars(page.spent_micros)],
          ["held", "staff.teamLimit.held", dollars(page.committed_micros)], ["room", "staff.teamLimit.roomLeft", dollars(roomLeft)],
          ["month", "staff.teamLimit.month", t(catalog, "staff.teamLimit.monthValue", { month })]] as const).map(([part, label, value]) =>
          <div key={part} data-team-limit-figure={part}><dt>{t(catalog, label)}</dt><dd>{value}</dd></div>)}
      </dl>}
      <form className="teamLimitForm" data-team-limit-form="limit" key={`limit-${formGeneration}`} onSubmit={askLimit}><fieldset disabled={locked}>
        <div className="staffField"><label htmlFor="team-limit-amount">{t(catalog, "staff.teamLimit.newAmount")}</label><input id="team-limit-amount" name="amount" inputMode="decimal" autoComplete="off" required maxLength={20}/></div>
        <div className="staffActions"><button className="setBtn setBtnPrimary" type="submit">{t(catalog, page.amount_micros === null ? "staff.teamLimit.set" : "staff.teamLimit.change")}</button></div>
      </fieldset></form>
      {area("limit")}
    </section>
    <section className="setCard">
      <h2 className="staffSectionTitle">{t(catalog, "staff.teamLimit.partner.title")}</h2>
      <p>{page.partner?.pseudonym ?? t(catalog, "staff.teamLimit.partner.none")}</p>
      {page.is_owner && page.partner !== null ? <>
        <div className="staffActions"><button className="setBtn" type="button" disabled={locked} onClick={() => { setMessage(null); setPending({ kind: "takeBack", partner: page.partner! }); }}>{t(catalog, "staff.teamLimit.partner.takeBack")}</button></div>
        <p className="setCardHint">{t(catalog, "staff.teamLimit.partner.onlyOne")}</p>
      </> : null}
      {page.is_owner && page.partner === null ? pickable.length === 0 ? <p className="setCardHint">{t(catalog, "staff.teamLimit.partner.nobody")}</p>
        : <form className="teamLimitForm" data-team-limit-form="pick" key={`pick-${formGeneration}`} onSubmit={askPick}><fieldset disabled={locked}>
          <div className="staffField"><label htmlFor="team-limit-person">{t(catalog, "staff.teamLimit.partner.pick")}</label><select id="team-limit-person" name="person" required defaultValue="">
            <option value="" disabled>{t(catalog, "staff.teamLimit.partner.choose")}</option>
            {pickable.map(member => <option key={member.staff_id} value={member.staff_id}>{member.pseudonym}</option>)}
          </select></div>
          <div className="staffActions"><button className="setBtn" type="submit">{t(catalog, "staff.teamLimit.partner.pickGo")}</button></div>
        </fieldset></form> : null}
      {area("partner")}
    </section>
    <section className="setCard">
      <h2 className="staffSectionTitle">{t(catalog, "staff.teamLimit.practice.title")}</h2>
      <p className="setCardHint">{t(catalog, "staff.teamLimit.practice.hint")}</p>
      <form className="teamLimitForm" data-team-limit-form="practice" key={`practice-${formGeneration}`} onSubmit={askPractice}><fieldset disabled={locked}>
        <div className="staffField"><label htmlFor="team-practice-ref">{t(catalog, "staff.teamLimit.practice.ref")}</label><input id="team-practice-ref" name="ref" autoComplete="off" required maxLength={36}/></div>
        <div className="staffField"><label htmlFor="team-practice-amount">{t(catalog, "staff.teamLimit.practice.amount")}</label><input id="team-practice-amount" name="amount" inputMode="decimal" autoComplete="off" required maxLength={20}/></div>
        <div className="staffActions"><button className="setBtn" type="submit">{t(catalog, "staff.teamLimit.practice.add")}</button></div>
      </fieldset></form>
      {area("practice")}
    </section>
    <section className="setCard">
      <h2 className="staffSectionTitle">{t(catalog, "staff.teamLimit.log.title")}</h2>
      {log.length === 0 ? <p className="setCardHint">{t(catalog, "staff.teamLimit.log.empty")}</p> : <ul className="staffAuditList" data-team-limit-log>
        {log.map((entry, index) => <li key={`${entry.at}-${entry.kind}-${index}`}>
          <strong>{logLine(entry, catalog, locale)}</strong>
          <time dateTime={entry.at}>{formatDate(locale, entry.at, { dateStyle: "medium", timeStyle: "short" })}</time>
          <span className="setCardHint">{entry.actor_staff_id === null ? t(catalog, "staff.teamLimit.log.automatic") : t(catalog, "staff.teamLimit.log.by", { name: staffName(entry.actor_staff_id) })}</span>
          {entry.notice === "WAITING" ? <span className="setCardHint">{t(catalog, "staff.teamLimit.notice.WAITING")}</span> : null}
          {entry.notice === "FAILED" ? <p className="setError teamLimitNoticeFailed">{t(catalog, "staff.teamLimit.notice.FAILED")}</p> : null}
        </li>)}
      </ul>}
    </section>
  </div>;
}
