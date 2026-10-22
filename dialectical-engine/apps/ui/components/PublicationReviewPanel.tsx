"use client";

import { useState, type FormEvent } from "react";
import { ContractHttpError, type ContractClient, type PublicationReviewState } from "@debateai/contract";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import { useSelectedAuthCatalog } from "@/components/AuthShell";
import { SecurityConfirmation, type SecurityConfirmationClient } from "@/components/auth/SecurityConfirmation";
import type { ConfirmedSecurityAction } from "@/lib/securityConfirmation";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

type ReviewClient = Pick<ContractClient, "requestPublicationReview"> & SecurityConfirmationClient;

function categoryLines(state: PublicationReviewState, catalog: MessageCatalog) {
  return state.categories.map((category) => <li key={category}>{t(catalog, "public.publicationReview.ruleLine", {
    category: t(catalog, `public.publicationReview.category.${category}`),
    rule: t(catalog, `public.publicationReview.rule.${category}`)
  })}</li>);
}

export function PublicationReviewStatement({ state, catalog }: { state: PublicationReviewState; catalog: MessageCatalog }) {
  return <div className="publicationReviewStatement" role="status">
    <h3>{t(catalog, "public.publicationReview.statement.heading")}</h3>
    <p>{t(catalog, "public.publicationReview.statement.what")}</p>
    <p>{t(catalog, "public.publicationReview.statement.facts")}</p>
    <p>{t(catalog, "public.publicationReview.statement.automated")}</p>
    <p>{t(catalog, "public.publicationReview.statement.categoriesIntro")}</p>
    <ul>{state.categories.map((category) => <li key={category}>{t(catalog, `public.publicationReview.category.${category}`)}</li>)}</ul>
    <p>{t(catalog, "public.publicationReview.statement.groundIntro")}</p>
    <ul>{categoryLines(state, catalog)}</ul>
    <p>{t(catalog, "public.publicationReview.statement.reasonIntro")}</p>
    <blockquote>{state.refusal?.reason ?? ""}</blockquote>
    <p>{t(catalog, state.asks_used < 2 ? "public.publicationReview.statement.challengeFirst" : "public.publicationReview.statement.challengeFinal")}</p>
  </div>;
}

export function PublicationReviewPanel({ runId, state, client, catalog, onAsked }: {
  runId: string;
  state: PublicationReviewState;
  client: ReviewClient;
  catalog: MessageCatalog;
  onAsked: () => void;
}) {
  const { locale } = useChromeI18n();
  const authCatalog = useSelectedAuthCatalog(locale);
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [answerOnly, setAnswerOnly] = useState(false);

  function close() { setOpen(false); setConfirming(false); setAcknowledged(false); }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (acknowledged && !busy) setConfirming(true);
  }
  async function confirmed(result: ConfirmedSecurityAction) {
    if (!acknowledged || busy) return;
    setBusy(true); setMessage(null);
    try {
      await client.requestPublicationReview(runId, result.step_up_grant.token);
      close();
      onAsked();
      setMessage(t(catalog, "public.publicationReview.asked"));
    } catch (failure) {
      close();
      const finalAnswer = failure instanceof ContractHttpError &&
        (failure.serverCode === "PUBLICATION_REVIEW_PENDING" || failure.serverCode === "PUBLICATION_REVIEW_NOT_ALLOWED");
      setAnswerOnly(finalAnswer);
      const key = failure instanceof ContractHttpError && failure.serverCode === "PUBLICATION_REVIEW_PENDING"
        ? "public.publicationReview.pendingError"
        : failure instanceof ContractHttpError && failure.serverCode === "PUBLICATION_REVIEW_NOT_ALLOWED"
          ? "public.publicationReview.notAllowed"
          : failure instanceof ContractHttpError && failure.status === 404
            ? "public.publication.changeUnauthorized"
            : "public.publication.statusUnavailable";
      setMessage(t(catalog, key));
    } finally { setBusy(false); }
  }

  return <div className="publicationReviewPanel">
    {!answerOnly ? <>
    {state.state === "NONE" ? <><p>{t(catalog, "public.publication.approvalRequired")}</p><p>{t(catalog, "public.publicationReview.flaggedLine")}</p><ul>{categoryLines(state, catalog)}</ul></> : null}
    {state.state === "UNDER_REVIEW" && message === null ? <p>{t(catalog, "public.publicationReview.underReview")}</p> : null}
    {state.state === "REFUSED" ? <PublicationReviewStatement state={state} catalog={catalog} /> : null}
    {state.may_ask && state.state !== "UNDER_REVIEW" && !open ? <button type="button" className="button" onClick={() => { setOpen(true); setAcknowledged(false); setMessage(null); }}>{t(catalog, "public.publicationReview.askButton")}</button> : null}
    {open ? <form noValidate onSubmit={submit}>
      <p><strong>{t(catalog, "public.publicationReview.askWarning")}</strong></p>
      <label><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />{t(catalog, "public.publicationReview.askAcknowledge")}</label>
      <div><button className="button" disabled={!acknowledged || busy}>{t(catalog, "public.publicationReview.askSubmit")}</button><button type="button" className="button" onClick={close}>{t(catalog, "public.publication.cancel")}</button></div>
    </form> : null}
    {confirming ? <SecurityConfirmation catalog={authCatalog} client={client} authorization={{ action: "PUBLISH", target_run_id: runId }} disabled={!acknowledged || busy} onConfirmed={confirmed} onCancel={() => setConfirming(false)} onError={() => { close(); setMessage(t(catalog, "public.publication.statusUnavailable")); }} /> : null}
    </> : null}
    {message ? <p role="status">{message}</p> : null}
  </div>;
}
