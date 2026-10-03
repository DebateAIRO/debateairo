"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { StaffApiClient } from "../lib/staffApi.js";
import { t, type MessageCatalog } from "../lib/i18n/translate.js";
export function OwnerPossessionPanel({ client, catalog, disabled, onAuthorityEnded, onBusyChange }: {
    client: StaffApiClient;
    catalog: MessageCatalog;
    disabled: boolean;
    onAuthorityEnded: () => void;
    onBusyChange: (busy: boolean) => void;
}) {
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [receipts, setReceipts] = useState<Array<Awaited<ReturnType<StaffApiClient["possess"]>>>>([]);
    useEffect(() => {
        const ended = () => { setReceipts([]); setStatus(null); };
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
        setStatus(null);
        setReceipts([]);
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
    return <section className="setCard">
    <h2 className="setCardTitle">{t(catalog, "staff.possession")}</h2>
    <p className="setCardHint">{t(catalog, "staff.possessionHint")}</p>
    <form data-owner-possession onSubmit={submit}>
      <fieldset disabled={disabled || busy}>
        {([["command_id", "staff.command"], ["command_nonce", "staff.nonce"], ["credential_one", "staff.keyOne"], ["credential_two", "staff.keyTwo"], ["password", "staff.password"], ["totp_code", "staff.code"]] as const).map(([name, key]) => <div className="setField" key={name}>
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
