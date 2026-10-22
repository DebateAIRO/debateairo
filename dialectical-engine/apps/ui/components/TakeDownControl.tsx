"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ContractHttpError, type ContractClient } from "@debateai/contract";
import { contractClient } from "@/lib/api";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import { useSelectedAuthCatalog } from "@/components/AuthShell";
import { SecurityConfirmation, type SecurityConfirmationClient } from "@/components/auth/SecurityConfirmation";
import type { ConfirmedSecurityAction } from "@/lib/securityConfirmation";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

type TakeDownClient = Pick<ContractClient, "unpublishRun"> & SecurityConfirmationClient;

export function TakeDownControl({ runRef, homeCatalog, publicCatalog, client = contractClient }: {
  runRef: string;
  homeCatalog: MessageCatalog;
  publicCatalog: MessageCatalog;
  client?: TakeDownClient;
}) {
  const router = useRouter();
  const { locale } = useChromeI18n();
  const authCatalog = useSelectedAuthCatalog(locale);
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function cancel() {
    setOpen(false);
    setConfirming(false);
    setAcknowledged(false);
    setMessage(null);
  }

  async function confirmed(result: ConfirmedSecurityAction) {
    if (!acknowledged || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await client.unpublishRun(runRef, result.step_up_grant.token);
      cancel();
      router.refresh();
    } catch (failure) {
      setOpen(false);
      setConfirming(false);
      setAcknowledged(false);
      setMessage(t(publicCatalog, failure instanceof ContractHttpError && failure.status >= 400 && failure.status < 500
        ? "public.publication.changeUnauthorized" : "public.publication.statusUnavailable"));
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (acknowledged && !busy) setConfirming(true);
  }

  return <div className="libTakeDownArea">
    {!open ? <button type="button" className="libTakeDown" onClick={() => { setOpen(true); setAcknowledged(false); setMessage(null); }}>{t(homeCatalog, "home.takeDown.button")}</button> :
      <div className="tdPanel">
        <p>{t(publicCatalog, "public.publication.unpublishWarning")}</p>
        <form noValidate onSubmit={submit}>
          <label className="authCheck"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />{t(publicCatalog, "public.publication.acknowledgeUnpublish")}</label>
          <div className="tdActions"><button className="setBtn setBtnPrimary" disabled={!acknowledged || busy}>{t(publicCatalog, "public.publication.unpublish")}</button><button type="button" className="setBtn" onClick={cancel}>{t(publicCatalog, "public.publication.cancel")}</button></div>
        </form>
        {confirming ? <SecurityConfirmation catalog={authCatalog} client={client} authorization={{ action: "UNPUBLISH", target_run_id: runRef }} disabled={!acknowledged || busy} onConfirmed={confirmed} onCancel={() => setConfirming(false)} onError={(failure) => { setOpen(false); setConfirming(false); setAcknowledged(false); setMessage(t(publicCatalog, failure instanceof ContractHttpError && failure.status < 500 ? "public.publication.changeUnauthorized" : "public.publication.statusUnavailable")); }} /> : null}
      </div>}
    {message ? <p role="status" className="tdStatus">{message}</p> : null}
  </div>;
}
