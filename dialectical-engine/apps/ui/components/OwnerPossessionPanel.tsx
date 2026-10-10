"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { StaffApiClient } from "../lib/staffApi.js";
import { t, type MessageCatalog } from "../lib/i18n/translate.js";
export type OwnerPossessionReceipt = Awaited<ReturnType<StaffApiClient["possess"]>>;
/** Receipts and status the parent keeps, so collapsing the disclosure that holds this panel never loses a receipt the owner still has to pass on. */
export interface OwnerPossessionRecord {
    readonly receipts: readonly OwnerPossessionReceipt[];
    readonly status: string | null;
}
export function OwnerPossessionPanel({ client, catalog, disabled, onAuthorityEnded, onBusyChange, record, onRecordChange }: {
    client: StaffApiClient;
    catalog: MessageCatalog;
    disabled: boolean;
    onAuthorityEnded: () => void;
    onBusyChange: (busy: boolean) => void;
    record?: OwnerPossessionRecord;
    onRecordChange?: (update: (current: OwnerPossessionRecord) => OwnerPossessionRecord) => void;
}) {
    const [busy, setBusy] = useState(false);
    const [own, setOwn] = useState<OwnerPossessionRecord>({ receipts: [], status: null });
    const { receipts, status } = record ?? own;
    const update = onRecordChange ?? setOwn;
    const setStatus = (next: string | null) => update((current) => ({ ...current, status: next }));
    const setReceipts = (next: (completed: readonly OwnerPossessionReceipt[]) => readonly OwnerPossessionReceipt[]) =>
        update((current) => ({ ...current, receipts: next(current.receipts) }));
    useEffect(() => {
        const ended = () => update(() => ({ receipts: [], status: null }));
        window.addEventListener("debateai:staff-session-ended", ended);
        return () => window.removeEventListener("debateai:staff-session-ended", ended);
    }, []);
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (disabled || busy)
            return;
        const form = event.currentTarget, data = new FormData(form);
        const command_id = String(data.get("command_id") ?? "").trim();
        const command_nonce = String(data.get("command_nonce") ?? "").trim();
        const firstCredentialId = String(data.get("credential_one") ?? "").trim();
        const secondCredentialId = String(data.get("credential_two") ?? "").trim();
        const credentialIds = secondCredentialId === "" ? [firstCredentialId] : [firstCredentialId, secondCredentialId];
        const password = String(data.get("password") ?? ""), totp_code = String(data.get("totp_code") ?? "");
        form.reset();
        setBusy(true);
        onBusyChange(true);
        update(() => ({ receipts: [], status: null }));
        try {
            if (firstCredentialId === "" || new Set(credentialIds).size !== credentialIds.length)
                throw new Error("STAFF_INPUT_INVALID");
            const prerequisite = await client.prerequisite({ purpose: "OWNER_POSSESSION", command_id, command_nonce, password, totp_code });
            onAuthorityEnded();
            for (const credential_id of credentialIds) {
                const receipt = await client.possess({ command_id, command_nonce, credential_id, prerequisite_handle: prerequisite.prerequisite_handle });
                setReceipts((completed) => [...completed, receipt]);
            }
            setStatus("staff.possessed");
        }
        catch {
            setStatus("staff.failed");
        }
        finally {
            setBusy(false);
            onBusyChange(false);
        }
    }
    return <section className="staffSetup">
    <h2 className="setCardTitle">{t(catalog, "staff.possession")}</h2>
    <p className="setCardHint">{t(catalog, "staff.possessionHint")}</p>
    <form className="staffMutation" data-owner-possession onSubmit={submit}>
      <fieldset disabled={disabled || busy}>
        {([["command_id", "staff.command"], ["command_nonce", "staff.nonce"], ["credential_one", "staff.keyOne"], ["credential_two", "staff.keyTwo"], ["password", "staff.password"], ["totp_code", "staff.code"]] as const).map(([name, key]) => <div className="staffField" key={name}>
          <label htmlFor={`owner-${name}`}>{t(catalog, key)}</label>
          <input id={`owner-${name}`} name={name} type={name === "password" || name === "command_nonce" ? "password" : "text"} autoComplete={name === "password" ? "current-password" : name === "totp_code" ? "one-time-code" : "off"} maxLength={name === "command_nonce" ? 43 : 1024} required={name !== "credential_two"}/>
        </div>)}
        <button className="setBtn setBtnPrimary" type="submit">{t(catalog, "staff.possess")}</button>
      </fieldset>
    </form>
    {receipts.length > 0 ? <div data-owner-receipts>
      <p className="setCardHint">{t(catalog, "staff.receiptsHint")}</p>
      <ol>{receipts.map((receipt) => <li key={receipt.receipt_id}>
        <p>{t(catalog, "staff.possessionReceipt", { id: receipt.receipt_id, expires: receipt.expires_at })}</p>
      </li>)}</ol>
    </div> : null}
    {status !== null ? <p role="status">{t(catalog, status)}</p> : null}
  </section>;
}
