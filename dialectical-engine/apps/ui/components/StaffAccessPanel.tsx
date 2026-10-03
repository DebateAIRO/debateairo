"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ContractHttpError, type StaffActionIntent, type StaffAuditPage, type StaffElevationResponse, type StaffEnrollmentResponse, type StaffTeamPage } from "@debateai/contract";
import { createStaffApiClient, type StaffApiClient } from "../lib/staffApi.js";
import { formatDate, t, type MessageCatalog } from "../lib/i18n/translate.js";
import type { LocaleCode } from "../lib/i18n/locales.js";
import staffEnglish from "../messages/en/staff.json";
import { OwnerPossessionPanel } from "./OwnerPossessionPanel.js";
type Member = StaffTeamPage["members"][number];
type MutationKind = "invite" | "grant" | "disable" | "compromise";
const delegatedCapabilities = ["TEAM_READ", "AUDIT_READ", "EMERGENCY_DISABLE"] as const;
function failureKey(failure: unknown): string {
    if (failure instanceof Error && failure.message.startsWith("STAFF_WEBAUTHN_"))
        return "staff.webauthn";
    if (failure instanceof ContractHttpError && failure.status === 503)
        return "staff.unavailable";
    if (failure instanceof ContractHttpError && failure.status === 401)
        return "staff.signIn";
    return "staff.failed";
}
function MutationForm({ kind, member, busy, catalog, onSubmit }: {
    kind: MutationKind;
    member?: Member;
    busy: boolean;
    catalog: MessageCatalog;
    onSubmit: (kind: MutationKind, data: FormData, member?: Member) => Promise<void>;
}) {
    const label = kind === "grant" ? "staff.grant" : kind === "disable" ? "staff.disable" : kind === "compromise" ? "staff.compromise" : "staff.invite";
    const prefix = `staff-${kind}-${member?.staff_id ?? "target"}`;
    return <form data-staff-mutation={kind} onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void onSubmit(kind, data, member); }}>
    <fieldset disabled={busy}>
      {member === undefined ? <>
        <div className="setField"><label htmlFor={`${prefix}-target`}>{t(catalog, "staff.target")}</label><input id={`${prefix}-target`} name="target_id" required maxLength={36}/></div>
        {kind !== "invite" ? <div className="setField"><label htmlFor={`${prefix}-revision`}>{t(catalog, "staff.inviteRevision")}</label><input id={`${prefix}-revision`} name="expected_revision" type="number" min="0" max={Number.MAX_SAFE_INTEGER} required/></div> : null}
      </> : null}
      {kind === "invite" || kind === "grant" ? delegatedCapabilities.map((capability) => <label key={capability}>
        <input type="checkbox" name="capabilities" value={capability} defaultChecked={member?.capabilities.includes(capability) ?? false}/>{capability}
      </label>) : null}
      <div className="setField"><label htmlFor={`${prefix}-ticket`}>{t(catalog, "staff.ticket")}</label><input id={`${prefix}-ticket`} name="ticket_ref" maxLength={128}/></div>
      <label><input type="checkbox" name="confirmed" required/>{t(catalog, "staff.confirm")}</label>
      <button className="setBtn setBtnPrimary" type="submit">{t(catalog, label)}</button>
    </fieldset>
  </form>;
}
export function StaffAccessPanel({ client, catalog = staffEnglish, locale = "en" }: {
    client?: StaffApiClient;
    catalog?: MessageCatalog;
    locale?: LocaleCode;
}) {
    const api = useMemo(() => client ?? createStaffApiClient(), [client]);
    const generation = useRef(0);
    const [enrollment, setEnrollment] = useState<StaffEnrollmentResponse | null>(null);
    const [self, setSelf] = useState<StaffElevationResponse | null>(null);
    const [team, setTeam] = useState<StaffTeamPage | null>(null);
    const [audit, setAudit] = useState<StaffAuditPage | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [credentialId, setCredentialId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
    function clearAuthority() { generation.current++; api.cancel(); setSelf(null); setTeam(null); setAudit(null); }
    useEffect(() => {
        let active = true;
        void api.enrollment().then((value) => {
            if (active)
                setEnrollment(value);
        }, (failure: unknown) => {
            if (active) {
                setEnrollment(null);
                setStatus(failureKey(failure));
            }
        }).finally(() => {
            if (active)
                setLoading(false);
        });
        const ended = () => { clearAuthority(); setEnrollment(null); setCredentialId(null); setStatus("staff.signIn"); };
        window.addEventListener("debateai:staff-session-ended", ended);
        return () => { active = false; generation.current++; api.cancel(); window.removeEventListener("debateai:staff-session-ended", ended); };
    }, [api]);
    useEffect(() => {
        if (self === null)
            return;
        const delay = Math.max(0, Date.parse(self.expires_at) - Date.now());
        const timer = setTimeout(() => { clearAuthority(); setStatus("staff.denied"); }, Math.min(delay, 2147483647));
        return () => clearTimeout(timer);
    }, [self]);
    const has = (capability: StaffElevationResponse["capabilities"][number]) => self?.capabilities.includes(capability) ?? false;
    async function readData(authority: StaffElevationResponse, epoch: number, cursor?: string, auditCursor?: string) {
        let nextTeam: StaffTeamPage | null = null;
        if (authority.capabilities.includes("TEAM_READ")) {
            nextTeam = await api.team({ limit: 50, ...(cursor === undefined ? {} : { cursor }) });
            if (generation.current !== epoch)
                return null;
            setTeam(nextTeam);
        }
        if (authority.capabilities.includes("AUDIT_READ")) {
            const value = await api.audit({ limit: 50, ...(auditCursor === undefined ? {} : { cursor: auditCursor }) });
            if (generation.current !== epoch)
                return null;
            setAudit(value);
        }
        return nextTeam;
    }
    async function elevate() {
        if (busy)
            return;
        const epoch = generation.current;
        setBusy(true);
        setStatus(null);
        try {
            const value = await api.elevate();
            if (generation.current !== epoch)
                return;
            if (Date.parse(value.expires_at) <= Date.now())
                throw new ContractHttpError("FORBIDDEN", 403, "STAFF_AUTHORITY_INVALID");
            setSelf(value);
            await readData(value, epoch);
        }
        catch (failure) {
            if (generation.current === epoch) {
                clearAuthority();
                setStatus(failureKey(failure));
            }
        }
        finally {
            setBusy(false);
        }
    }
    async function refresh(cursor?: string, auditCursor?: string) {
        if (self === null || busy)
            return;
        const epoch = generation.current;
        setBusy(true);
        try {
            await readData(self, epoch, cursor, auditCursor);
        }
        catch (failure) {
            if (generation.current === epoch) {
                clearAuthority();
                setStatus(failureKey(failure));
            }
        }
        finally {
            setBusy(false);
        }
    }
    async function mutate(kind: MutationKind, data: FormData, member?: Member) {
        if (self === null || busy || data.get("confirmed") !== "on")
            return;
        const needed = kind === "invite" ? "TEAM_INVITE" : kind === "grant" ? "TEAM_GRANT" : kind === "disable" ? "TEAM_DISABLE" : "EMERGENCY_DISABLE";
        if (!has(needed))
            return;
        const epoch = generation.current, authority = self;
        const revisionText = String(data.get("expected_revision") ?? "");
        const expected_revision = kind === "invite" ? 0 : member?.grant_revision ?? (/^(0|[1-9][0-9]*)$/u.test(revisionText) ? Number(revisionText) : NaN);
        const target = member?.staff_id ?? String(data.get("target_id") ?? "").trim();
        const ticket = String(data.get("ticket_ref") ?? "").trim();
        const reason = { code: kind === "invite" ? "TEAM_ONBOARDING" as const : kind === "grant" ? "GRANT_CHANGE" as const : kind === "disable" ? "OFFBOARDING" as const : "SECURITY_RESPONSE" as const, ...(ticket === "" ? {} : { ticket_ref: ticket }) };
        const common = { expected_revision, operation_id: crypto.randomUUID(), reason };
        const capabilities = data.getAll("capabilities").map(String) as Array<typeof delegatedCapabilities[number]>;
        const intent: StaffActionIntent = kind === "invite" ? { action: "TEAM_INVITE", target_user_id: target, capabilities, ...common }
            : kind === "grant" ? { action: "TEAM_GRANT", target_staff_id: target, capabilities, ...common }
                : kind === "disable" ? { action: "TEAM_DISABLE", target_staff_id: target, mode: "OFFBOARD", ...common }
                    : { action: "EMERGENCY_DISABLE", target_staff_id: target, mode: "COMPROMISE", ...common };
        setBusy(true);
        setStatus(null);
        try {
            await api.mutate(intent);
            if (generation.current !== epoch)
                return;
            await readData(authority, epoch);
            setStatus("staff.complete");
        }
        catch (failure) {
            if (generation.current !== epoch)
                return;
            if (failure instanceof ContractHttpError && (failure.status === 401 || failure.code === "INVALID_RESPONSE" || failure.serverCode === "STAFF_AUTHORITY_INVALID"
                || failure.status === 403 && !authority.capabilities.some(capability => capability === "TEAM_READ" || capability === "AUDIT_READ"))) {
                clearAuthority();
                setStatus("staff.denied");
            }
            else if (failure instanceof ContractHttpError && [403, 409, 422].includes(failure.status)) {
                try {
                    const current = await readData(authority, epoch);
                    if (generation.current !== epoch)
                        return;
                    const currentMember = current?.members.find(row => row.staff_id === target);
                    setStatus(member !== undefined && currentMember !== undefined && currentMember.grant_revision !== expected_revision ? "staff.stale" : "staff.failed");
                }
                catch {
                    clearAuthority();
                    setStatus("staff.denied");
                }
            }
            else
                setStatus(failureKey(failure));
        }
        finally {
            setBusy(false);
        }
    }
    async function register(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy)
            return;
        const data = new FormData(event.currentTarget), password = String(data.get("password") ?? ""), totp_code = String(data.get("totp_code") ?? "");
        event.currentTarget.reset();
        clearAuthority();
        const epoch = generation.current;
        setBusy(true);
        setStatus(null);
        setCredentialId(null);
        try {
            const prerequisite = await api.prerequisite({ purpose: "KEY_PREREGISTRATION", password, totp_code });
            if (generation.current !== epoch)
                return;
            const result = await api.register({ prerequisite_handle: prerequisite.prerequisite_handle });
            if (generation.current !== epoch)
                return;
            setCredentialId(result.credentialId);
            setEnrollment(await api.enrollment());
        }
        catch (failure) {
            if (generation.current === epoch)
                setStatus(failureKey(failure));
        }
        finally {
            setBusy(false);
        }
    }
    async function addKey() {
        if (self === null || busy)
            return;
        const epoch = generation.current, operation_id = crypto.randomUUID();
        setBusy(true);
        setStatus(null);
        try {
            const proof = await api.proveAction({ action: "CREDENTIAL_REGISTER", operation_id });
            if (generation.current !== epoch)
                return;
            const result = await api.register({ proof_handle: proof.proof_handle, operation_id });
            if (generation.current !== epoch)
                return;
            setCredentialId(result.credentialId);
            setEnrollment(await api.enrollment());
        }
        catch (failure) {
            if (generation.current === epoch) {
                if (failure instanceof ContractHttpError && [401, 403].includes(failure.status))
                    clearAuthority();
                setStatus(failureKey(failure));
            }
        }
        finally {
            setBusy(false);
        }
    }
    const r = enrollment?.readiness;
    const eligible = r !== undefined && r.account_active && r.email_verified && r.totp_active && !r.security_hold;
    const yesNo = (value: boolean) => t(catalog, value ? "staff.yes" : "staff.no");
    return <div className="setInner">
    <h1 className="setTitle">{t(catalog, "staff.title")}</h1>
    {status !== null ? <p className="setError" role="status">{t(catalog, status)}</p> : null}
    {loading ? <p>{t(catalog, "staff.loading")}</p> : null}
    {r !== undefined ? <section className="setCard">
      <h2 className="setCardTitle">{t(catalog, "staff.readiness")}</h2>
      <p>{t(catalog, "staff.accountId", { id: enrollment!.user_id })}</p>
      <p>{t(catalog, "staff.keys", { count: r.verified_credential_count })}</p>
      {([["staff.account", r.account_active], ["staff.email", r.email_verified], ["staff.totp", r.totp_active], ["staff.hold", r.security_hold], ["staff.ownerKeys", r.owner_credential_requirement_met], ["staff.delegatedKeys", r.delegated_credential_requirement_met]] as const).map(([key, value]) => <p key={key}>{t(catalog, key, { value: yesNo(value) })}</p>)}
    </section> : null}
    <section className="setCard">
      <p className="setCardHint">{t(catalog, "staff.recovery")}</p>
      {self === null ? <button className="setBtn setBtnPrimary" type="button" disabled={!eligible || busy} onClick={() => { void elevate(); }}>{t(catalog, "staff.elevate")}</button> : <>
        <p>{t(catalog, "staff.self", { id: self.staff_id })}</p>
        <p>{t(catalog, "staff.capabilities", { capabilities: self.capabilities.join(", ") })}</p>
        <p>{t(catalog, "staff.expires", { date: formatDate(locale, self.expires_at, { dateStyle: "medium", timeStyle: "short" }) })}</p>
        <p>{t(catalog, "staff.alertUnknown")}</p>
        <button className="setBtn" type="button" disabled={busy} onClick={() => { void addKey(); }}>{t(catalog, "staff.addKey")}</button>
      </>}
    </section>
    {has("TEAM_INVITE") ? <section className="setCard"><h2>{t(catalog, "staff.invite")}</h2><MutationForm kind="invite" busy={busy} catalog={catalog} onSubmit={mutate}/></section> : null}
    {has("TEAM_READ") && team !== null ? <section className="setCard">
      <button className="setBtn" type="button" disabled={busy} onClick={() => { void refresh(); }}>{t(catalog, "staff.refresh")}</button>
      {team.members.length === 0 ? <p>{t(catalog, "staff.empty")}</p> : team.members.map(member => <div className="setSessionRow" key={member.staff_id}>
        <h3>{member.pseudonym}</h3><p>{member.staff_id}</p><p>{member.status}</p><p>{member.capabilities.join(", ")}</p>
        <p>{t(catalog, "staff.keys", { count: member.credential_count })}</p><p>{t(catalog, "staff.revision", { revision: member.grant_revision })}</p><p>{t(catalog, "staff.delivery", { state: member.delivery_state })}</p>
        {member.status === "ACTIVE" ? <>
          {has("TEAM_GRANT") ? <MutationForm kind="grant" member={member} busy={busy} catalog={catalog} onSubmit={mutate}/> : null}
          {has("TEAM_DISABLE") ? <MutationForm kind="disable" member={member} busy={busy} catalog={catalog} onSubmit={mutate}/> : null}
          {has("EMERGENCY_DISABLE") ? <MutationForm kind="compromise" member={member} busy={busy} catalog={catalog} onSubmit={mutate}/> : null}
        </> : null}
      </div>)}
      {team.next_cursor !== null ? <button className="setBtn" type="button" disabled={busy} onClick={() => { void refresh(team.next_cursor!); }}>{t(catalog, "staff.more")}</button> : null}
    </section> : null}
    {!has("TEAM_READ") && has("EMERGENCY_DISABLE") ? <section className="setCard"><MutationForm kind="compromise" busy={busy} catalog={catalog} onSubmit={mutate}/></section> : null}
    {has("AUDIT_READ") && audit !== null ? <section className="setCard">
      <h2>{t(catalog, "staff.audit")}</h2><button className="setBtn" type="button" disabled={busy} onClick={() => { void refresh(); }}>{t(catalog, "staff.auditRefresh")}</button>
      {audit.events.map(event => <p key={event.event_id}>{event.event} · {formatDate(locale, event.recorded_at, { dateStyle: "medium", timeStyle: "short" })} · {event.delivery_state}</p>)}
      {audit.next_cursor !== null ? <button className="setBtn" type="button" disabled={busy} onClick={() => { void refresh(undefined, audit.next_cursor!); }}>{t(catalog, "staff.more")}</button> : null}
    </section> : null}
    <section className="setCard"><h2>{t(catalog, "staff.register")}</h2><p className="setCardHint">{t(catalog, "staff.registerHint")}</p>
      <form data-staff-registration onSubmit={register}><fieldset disabled={!eligible || busy}>
        <div className="setField"><label htmlFor="staff-password">{t(catalog, "staff.password")}</label><input id="staff-password" name="password" type="password" autoComplete="current-password" maxLength={1024} required/></div>
        <div className="setField"><label htmlFor="staff-code">{t(catalog, "staff.code")}</label><input id="staff-code" name="totp_code" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required/></div>
        <button className="setBtn setBtnPrimary" type="submit">{t(catalog, "staff.register")}</button>
      </fieldset></form>
      {credentialId !== null ? <p role="status">{t(catalog, "staff.registered", { id: credentialId })}</p> : null}
    </section>
    <OwnerPossessionPanel client={api} catalog={catalog} disabled={!eligible || busy} onAuthorityEnded={clearAuthority} onBusyChange={setBusy}/>
  </div>;
}
