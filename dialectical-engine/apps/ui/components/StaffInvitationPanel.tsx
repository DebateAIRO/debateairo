"use client";
import { useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ContractHttpError } from "@debateai/contract";
import { createStaffApiClient, type StaffApiClient } from "../lib/staffApi.js";
import { t, type MessageCatalog } from "../lib/i18n/translate.js";
import staffEnglish from "../messages/en/staff.json";
export function StaffInvitationPanel({ client, catalog = staffEnglish }: {
    client?: StaffApiClient;
    catalog?: MessageCatalog;
}) {
    const api = useMemo(() => client ?? createStaffApiClient(), [client]);
    const handle = useRef<string | null>(null), captured = useRef(false);
    const [stage, setStage] = useState("staff.loading");
    const [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
    useLayoutEffect(() => {
        // First browser action: remove the bearer, including any query, before network/auth work.
        if (!captured.current) {
            const fragment = window.location.hash.slice(1);
            window.history.replaceState(null, "", window.location.pathname);
            handle.current = /^[A-Za-z0-9_-]{43}$/u.test(fragment) ? fragment : null;
            captured.current = true;
        }
        let active = true;
        if (handle.current === null) {
            setStage("staff.reopen");
            return;
        }
        void api.enrollment().then((value) => {
            if (!active)
                return;
            const r = value.readiness;
            setReady(r.account_active && r.email_verified && r.totp_active && !r.security_hold && r.delegated_credential_requirement_met);
            setStage("staff.acceptHint");
        }, (failure: unknown) => {
            if (!active)
                return;
            handle.current = null;
            setStage(failure instanceof ContractHttpError && failure.status === 401 ? "staff.reopenSignedIn" : "staff.acceptFailed");
        });
        const clear = () => { handle.current = null; api.cancel(); setReady(false); setStage("staff.reopenSignedIn"); };
        window.addEventListener("debateai:staff-session-ended", clear);
        return () => { active = false; api.cancel(); window.removeEventListener("debateai:staff-session-ended", clear); };
    }, [api]);
    async function accept(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!ready || busy || handle.current === null)
            return;
        const data = new FormData(event.currentTarget), invitation_handle = handle.current;
        if (data.get("confirmed") !== "on")
            return;
        setBusy(true);
        try {
            await api.accept({ invitation_handle, operation_id: crypto.randomUUID() });
            handle.current = null;
            setReady(false);
            setStage("staff.accepted");
        }
        catch (failure) {
            setStage(failure instanceof ContractHttpError && failure.status === 401 ? "staff.reopenSignedIn" : "staff.acceptFailed");
            handle.current = null;
            setReady(false);
        }
        finally {
            setBusy(false);
        }
    }
    return <section className="setCard">
    <h1 className="setCardTitle">{t(catalog, "staff.invitation")}</h1>
    <p role="status">{t(catalog, stage)}</p>
    {ready ? <form data-invitation-accept onSubmit={accept}>
      <label><input type="checkbox" name="confirmed" required/>{t(catalog, "staff.confirm")}</label>
      <button className="setBtn setBtnPrimary" type="submit" disabled={busy}>{t(catalog, "staff.accept")}</button>
    </form> : null}
    <a className="setBtn setBtnQuiet" href="/admin/team">{t(catalog, "staff.teamLink")}</a>
  </section>;
}
