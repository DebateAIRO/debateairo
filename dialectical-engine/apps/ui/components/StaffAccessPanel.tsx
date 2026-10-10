"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ContractHttpError, type StaffActionIntent, type StaffAuditPage, type StaffElevationResponse, type StaffTeamPage } from "@debateai/contract";
import { createStaffApiClient, type StaffApiClient } from "../lib/staffApi.js";
import { formatDate, t, type MessageCatalog } from "../lib/i18n/translate.js";
import type { LocaleCode } from "../lib/i18n/locales.js";
import staffEnglish from "../messages/en/staff.json";
import { OwnerPossessionPanel, type OwnerPossessionRecord } from "./OwnerPossessionPanel.js";
import "./StaffAccessPanel.css";
type Member = StaffTeamPage["members"][number];
type MutationKind = "invite" | "grant" | "disable" | "compromise";
const delegatedCapabilities = ["TEAM_READ", "AUDIT_READ", "EMERGENCY_DISABLE"] as const;
function failureKey(failure: unknown): string {
    if (failure instanceof Error && failure.message.startsWith("STAFF_WEBAUTHN_"))
        return "staff.webauthn";
    if (failure instanceof ContractHttpError && failure.status === 503 && failure.serverCode === "STAFF_ALERT_UNAVAILABLE")
        return "staff.locked";
    if (failure instanceof ContractHttpError && failure.status === 503)
        return "staff.unavailable";
    if (failure instanceof ContractHttpError && failure.status === 401)
        return "staff.signIn";
    return "staff.failed";
}
function capabilityLabel(catalog: MessageCatalog, capability: string) {
    return t(catalog, `staff.permission.${capability}`);
}
function memberDisplayName(member: Member, currentStaffId: string | undefined, catalog: MessageCatalog) {
    if (member.staff_id === currentStaffId) return t(catalog, "staff.yourAccount");
    const generated = /^staff[-_](?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/iu.test(member.pseudonym);
    // A generated pseudonym is shown by a stable tag from the staff ID, never by its place on the page:
    // the place changes with paging, and a disable or compromise form must name the same member every time.
    return generated ? t(catalog, "staff.memberTag", { tag: member.staff_id.replaceAll("-", "").slice(-6) }) : member.pseudonym;
}
function MutationForm({ kind, member, selectedName, busy, catalog, onSubmit, onCancel }: {
    kind: MutationKind;
    member?: Member;
    selectedName?: string;
    busy: boolean;
    catalog: MessageCatalog;
    onSubmit: (kind: MutationKind, data: FormData, member?: Member) => Promise<void>;
    onCancel: () => void;
}) {
    const label = kind === "grant" ? "staff.grant" : kind === "disable" ? "staff.disable" : kind === "compromise" ? "staff.compromise" : "staff.invite";
    const prefix = `staff-${kind}-${member?.staff_id ?? "target"}`;
    return <form className="staffMutation" data-staff-mutation={kind} onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void onSubmit(kind, data, member); }}>
      <fieldset disabled={busy}>
        <legend>{t(catalog, `staff.action.${kind}`)}</legend>
        <p className="setCardHint">{t(catalog, `staff.help.${kind}`)}</p>
        {member !== undefined ? <p className="staffTarget">{t(catalog, "staff.selectedMember", { name: selectedName ?? member.pseudonym })}</p> : <>
          <div className="staffField"><label htmlFor={`${prefix}-target`}>{t(catalog, kind === "invite" ? "staff.target" : "staff.targetStaff")}</label><input id={`${prefix}-target`} name="target_id" required maxLength={36} aria-describedby={`${prefix}-target-help`}/><p className="setCardHint" id={`${prefix}-target-help`}>{t(catalog, kind === "invite" ? "staff.targetHint" : "staff.targetStaffHint")}</p></div>
          {kind !== "invite" ? <div className="staffField"><label htmlFor={`${prefix}-revision`}>{t(catalog, "staff.inviteRevision")}</label><input id={`${prefix}-revision`} name="expected_revision" type="number" min="0" max={Number.MAX_SAFE_INTEGER} required/></div> : null}
        </>}
        {kind === "invite" || kind === "grant" ? <div className="staffPermissionChoices" role="group" aria-label={t(catalog, "staff.permissions")}>
          {delegatedCapabilities.map((capability) => <label className="staffCheckbox" key={capability}><input type="checkbox" name="capabilities" value={capability} defaultChecked={member?.capabilities.includes(capability) ?? false}/><span>{capabilityLabel(catalog, capability)}</span></label>)}
        </div> : null}
        <div className="staffField"><label htmlFor={`${prefix}-ticket`}>{t(catalog, "staff.ticket")}</label><input id={`${prefix}-ticket`} name="ticket_ref" maxLength={128}/></div>
        <label className="staffCheckbox staffConfirm"><input type="checkbox" name="confirmed" required/><span>{t(catalog, "staff.confirm")}</span></label>
        <div className="staffActions"><button className={`setBtn ${kind === "disable" || kind === "compromise" ? "setBtnDanger" : "setBtnPrimary"}`} type="submit">{t(catalog, label)}</button><button className="setBtn" type="button" onClick={onCancel}>{t(catalog, "staff.cancel")}</button></div>
      </fieldset>
    </form>;
}
export function StaffAccessPanel({ client, catalog = staffEnglish, locale = "en" }: {
    client?: StaffApiClient;
    catalog?: MessageCatalog;
    locale?: LocaleCode;
}) {
    const baseApi = useMemo(() => client ?? createStaffApiClient(), [client]);
    const generation = useRef(0);
    const [enrollment, setEnrollment] = useState<Awaited<ReturnType<StaffApiClient["enrollment"]>> | null>(null);
    const selectedVersion = enrollment !== null && "funding_policy_version" in enrollment ? enrollment.funding_policy_version : undefined;
    const api = useMemo(() => baseApi.withFundingPolicyVersion(selectedVersion),[baseApi,selectedVersion]);
    const activeApi = useRef(api); activeApi.current=api;
    useEffect(()=>()=>api.cancel(),[api]);
    const [self, setSelf] = useState<StaffElevationResponse | null>(null);
    const [team, setTeam] = useState<StaffTeamPage | null>(null);
    const [audit, setAudit] = useState<StaffAuditPage | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [credentialId, setCredentialId] = useState<string | null>(null);
    const [setupOpen, setSetupOpen] = useState(false);
    const [ownerSetupOpen, setOwnerSetupOpen] = useState(false);
    const [ownerRecord, setOwnerRecord] = useState<OwnerPossessionRecord>({ receipts: [], status: null });
    const [activeMutation, setActiveMutation] = useState<{ kind: MutationKind; staffId?: string } | null>(null);
    const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
    function clearAuthority() { generation.current++; activeApi.current.cancel(); baseApi.cancel(); setSelf(null); setTeam(null); setAudit(null); setActiveMutation(null); }
    useEffect(() => {
        let active = true;
        void baseApi.enrollment().then((value) => {
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
        const ended = () => { clearAuthority(); setEnrollment(null); setCredentialId(null); setOwnerRecord({ receipts: [], status: null }); setStatus("staff.signIn"); };
        window.addEventListener("debateai:staff-session-ended", ended);
        return () => { active = false; generation.current++; api.cancel(); window.removeEventListener("debateai:staff-session-ended", ended); };
    }, [baseApi]);
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
            setActiveMutation(null);
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
    const form = (kind: MutationKind, member?: Member) => activeMutation?.kind === kind && activeMutation.staffId === member?.staff_id
        ? <MutationForm kind={kind} {...(member === undefined ? {} : { member, selectedName: memberDisplayName(member, self?.staff_id, catalog) })} busy={busy} catalog={catalog} onSubmit={mutate} onCancel={() => setActiveMutation(null)}/>
        : null;
    const action = (kind: MutationKind, member?: Member) => <button className="setBtn" type="button" disabled={busy} aria-expanded={activeMutation?.kind === kind && activeMutation.staffId === member?.staff_id} onClick={() => setActiveMutation({ kind, ...(member === undefined ? {} : { staffId: member.staff_id }) })}>{t(catalog, `staff.action.${kind}`)}</button>;
    return <div className="setInner staffAccess" aria-busy={busy || loading}>
      <header className="staffHeading"><p className="setEyebrow">{t(catalog, "staff.eyebrow")}</p><h1 className="setTitle">{t(catalog, "staff.title")}</h1><p className="setLede">{t(catalog, "staff.intro")}</p></header>
      {status !== null ? <p className={status === "staff.complete" ? "staffNotice" : "setError"} role="status">{t(catalog, status)}</p> : null}
      {loading ? <p className="setStatus" role="status">{t(catalog, "staff.loading")}</p> : null}
      <section className="setCard staffAccessSummary">
        <div className="staffSectionHead"><h2 className="setCardTitle">{t(catalog, self === null ? "staff.unlockTitle" : "staff.verified")}</h2><span className="staffBadge" data-state={self === null ? "locked" : "active"}>{t(catalog, self === null ? "staff.lockedBadge" : "staff.verifiedBadge")}</span></div>
        {self === null ? <><p className="setCardHint">{t(catalog, "staff.unlockHint")}</p><div className="staffActions"><button className="setBtn setBtnPrimary" type="button" disabled={!eligible || busy} onClick={() => { void elevate(); }}>{t(catalog, "staff.elevate")}</button></div>{r !== undefined && !eligible ? <p className="setCardHint">{t(catalog, "staff.notReady")}</p> : null}</> : <>
          <p className="setCardHint">{t(catalog, "staff.expires", { date: formatDate(locale, self.expires_at, { dateStyle: "medium", timeStyle: "short" }) })}</p>
          <ul className="staffPermissions" aria-label={t(catalog, "staff.permissions")}>{self.capabilities.map(capability => <li key={capability}>{capabilityLabel(catalog, capability)}</li>)}</ul>
          <details className="staffDetails"><summary>{t(catalog, "staff.securityKeys")}</summary><p className="setCardHint">{t(catalog, "staff.addKeyHint")}</p><div className="staffActions"><button className="setBtn" type="button" disabled={busy} onClick={() => { void addKey(); }}>{t(catalog, "staff.addKey")}</button></div>{credentialId !== null ? <p className="staffIdentifier" role="status">{t(catalog, "staff.registered", { id: credentialId })}</p> : null}</details>
        </>}
        {r !== undefined ? <div className="staffReadiness"><p>{t(catalog, "staff.keys", { count: r.verified_credential_count })}</p><details className="staffDetails" data-staff-account-details><summary>{t(catalog, "staff.accountDetails")}</summary><p className="staffIdentifier">{t(catalog, "staff.accountId", { id: enrollment!.user_id })}</p>{self !== null ? <p className="staffIdentifier">{t(catalog, "staff.self", { id: self.staff_id })}</p> : null}<dl className="staffReadinessList">{([["staff.accountLabel", r.account_active], ["staff.emailLabel", r.email_verified], ["staff.totpLabel", r.totp_active], ["staff.holdLabel", r.security_hold], ["staff.ownerKeysLabel", r.owner_credential_requirement_met], ["staff.delegatedKeysLabel", r.delegated_credential_requirement_met]] as const).map(([key, value]) => <div key={key}><dt>{t(catalog, key)}</dt><dd>{yesNo(value)}</dd></div>)}</dl></details></div> : null}
      </section>
      {has("TEAM_INVITE") || has("TEAM_READ") && team !== null ? <section className="setCard">
        <div className="staffSectionHead"><div><h2 className="staffSectionTitle">{t(catalog, "staff.members")}</h2><p className="setCardHint">{t(catalog, "staff.membersHint")}</p></div><div className="staffActions">{has("TEAM_READ") ? <button className="setBtn" type="button" disabled={busy} onClick={() => { void refresh(); }}>{t(catalog, "staff.refresh")}</button> : null}{has("TEAM_INVITE") ? action("invite") : null}</div></div>
        {has("TEAM_INVITE") ? form("invite") : null}
        {has("TEAM_READ") && team !== null ? <div className="staffMemberList">{team.members.length === 0 ? <p className="setCardHint">{t(catalog, "staff.empty")}</p> : team.members.map((member) => {
          const isSelf = member.staff_id === self?.staff_id;
          const memberName = memberDisplayName(member, self?.staff_id, catalog);
          return <article className="staffMember" data-staff-member key={member.staff_id}>
            <div className="staffMemberHeading"><div><h3>{memberName}{isSelf ? <span className="staffYou">{t(catalog, "staff.you")}</span> : null}</h3><p className="staffMemberMeta">{t(catalog, "staff.keys", { count: member.credential_count })}</p></div><span className="staffBadge" data-state={member.status === "ACTIVE" ? "active" : "inactive"}>{t(catalog, `staff.memberStatus.${member.status}`)}</span></div>
            <ul className="staffPermissions" aria-label={t(catalog, "staff.permissions")}>{member.capabilities.map(capability => <li key={capability}>{capabilityLabel(catalog, capability)}</li>)}</ul>
            <div className="staffMemberFooter"><p className="staffDelivery" data-state={member.delivery_state}>{t(catalog, `staff.deliveryStatus.${member.delivery_state}`)}</p>{member.status === "ACTIVE" && !isSelf ? <div className="staffActions">{has("TEAM_GRANT") ? action("grant", member) : null}{has("TEAM_DISABLE") ? action("disable", member) : null}{has("EMERGENCY_DISABLE") ? action("compromise", member) : null}</div> : null}</div>
            {member.status === "ACTIVE" && !isSelf ? <>{has("TEAM_GRANT") ? form("grant", member) : null}{has("TEAM_DISABLE") ? form("disable", member) : null}{has("EMERGENCY_DISABLE") ? form("compromise", member) : null}</> : null}
            <details className="staffDetails"><summary>{t(catalog, "staff.memberDetails")}</summary><p className="staffIdentifier">{t(catalog, "staff.memberReference", { name: member.pseudonym })}</p><p className="staffIdentifier">{t(catalog, "staff.memberId", { id: member.staff_id })}</p><p>{t(catalog, "staff.revision", { revision: member.grant_revision })}</p></details>
          </article>;
        })}</div> : null}
        {team?.next_cursor != null ? <div className="staffActions"><button className="setBtn" type="button" disabled={busy} onClick={() => { void refresh(team.next_cursor!); }}>{t(catalog, "staff.more")}</button></div> : null}
      </section> : null}
      {!has("TEAM_READ") && has("EMERGENCY_DISABLE") ? <section className="setCard"><h2 className="setCardTitle">{t(catalog, "staff.emergency")}</h2><p className="setCardHint">{t(catalog, "staff.help.compromise")}</p><div className="staffActions">{action("compromise")}</div>{form("compromise")}</section> : null}
      {has("AUDIT_READ") && audit !== null ? <section className="setCard"><div className="staffSectionHead"><h2 className="staffSectionTitle">{t(catalog, "staff.audit")}</h2><button className="setBtn" type="button" disabled={busy} onClick={() => { void refresh(); }}>{t(catalog, "staff.auditRefresh")}</button></div>{audit.events.length === 0 ? <p className="setCardHint">{t(catalog, "staff.auditEmpty")}</p> : <ul className="staffAuditList">{audit.events.map(event => <li key={event.event_id}><strong>{t(catalog, `staff.event.${event.event}`)}</strong><time dateTime={event.recorded_at}>{formatDate(locale, event.recorded_at, { dateStyle: "medium", timeStyle: "short" })}</time><span className="staffDelivery" data-state={event.delivery_state}>{t(catalog, `staff.deliveryStatus.${event.delivery_state}`)}</span></li>)}</ul>}{audit.next_cursor !== null ? <div className="staffActions"><button className="setBtn" type="button" disabled={busy} onClick={() => { void refresh(undefined, audit.next_cursor!); }}>{t(catalog, "staff.more")}</button></div> : null}</section> : null}
      {self === null ? <details className="setCard staffAdvanced" open={setupOpen}><summary onClick={(event) => { event.preventDefault(); if (busy) return; setSetupOpen(!setupOpen); setOwnerSetupOpen(false); }}>{t(catalog, "staff.advanced")}</summary>{setupOpen ? <><p className="setCardHint">{t(catalog, "staff.advancedHint")}</p>
        <section className="staffSetup"><h2 className="setCardTitle">{t(catalog, "staff.register")}</h2><p className="setCardHint">{t(catalog, "staff.registerHint")}</p><form className="staffMutation" data-staff-registration onSubmit={register}><fieldset disabled={!eligible || busy}><div className="staffField"><label htmlFor="staff-password">{t(catalog, "staff.password")}</label><input id="staff-password" name="password" type="password" autoComplete="current-password" maxLength={1024} required/></div><div className="staffField"><label htmlFor="staff-code">{t(catalog, "staff.code")}</label><input id="staff-code" name="totp_code" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required/></div><div className="staffActions"><button className="setBtn setBtnPrimary" type="submit">{t(catalog, "staff.register")}</button></div></fieldset></form>{credentialId !== null ? <p className="staffIdentifier" role="status">{t(catalog, "staff.registered", { id: credentialId })}</p> : null}</section>
        <details className="staffDetails staffOwnerSetup" open={ownerSetupOpen}><summary onClick={(event) => { event.preventDefault(); if (busy) return; setOwnerSetupOpen(!ownerSetupOpen); }}>{t(catalog, "staff.ownerSetup")}</summary>{ownerSetupOpen ? <><p className="setCardHint">{t(catalog, "staff.recovery")}</p><OwnerPossessionPanel client={api} catalog={catalog} disabled={!eligible || busy} onAuthorityEnded={clearAuthority} onBusyChange={setBusy} record={ownerRecord} onRecordChange={setOwnerRecord}/></> : null}</details>
      </> : null}</details> : null}
    </div>;
}
