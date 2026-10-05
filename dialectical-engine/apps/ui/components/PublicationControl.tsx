"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { contractClient } from "@/lib/api";
import { ContractHttpError } from "@debateai/contract";
import type { ContractClient, PublicationPartKind, PublicationRefusalStatement } from "@debateai/contract";
import {SecurityConfirmation,type SecurityConfirmationClient} from '@/components/auth/SecurityConfirmation';
import {useSelectedAuthCatalog} from '@/components/AuthShell';
import {useChromeI18n} from '@/lib/i18n/I18nProvider';
import type {ConfirmedSecurityAction} from '@/lib/securityConfirmation';
import publicEnglish from "@/messages/en/public.json";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

type Visibility = Readonly<{
  state: "PRIVATE" | "PUBLISHED";
  public_ref: string | null;
}>;

export type PrivateDeletionStatus="PENDING"|"CLEANED";
type PublicationControlClient=Pick<ContractClient,
  "readRunVisibility"|"publishRun"|"unpublishRun"|"deletePrivateDebate"
> & SecurityConfirmationClient;

export function PublicationControl({ runId,onPrivateDeletion,client=contractClient,catalog=publicEnglish }: {
  readonly runId:string;
  readonly onPrivateDeletion?:(status:PrivateDeletionStatus)=>void;
  readonly client?:PublicationControlClient;
  readonly catalog?:MessageCatalog;
}) {
  const [visibility, setVisibility] = useState<Visibility | null>(null);
  const [action, setAction] = useState<"PUBLISH" | "UNPUBLISH" | null>(null);
  const {locale}=useChromeI18n(),authCatalog=useSelectedAuthCatalog(locale),[confirming,setConfirming]=useState<"publication"|"delete"|null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [statement, setStatement] = useState<PublicationRefusalStatement | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleted, setDeleted] = useState(false);
  // Every finished action bumps this, so the card can bring its answer into view (ui-B1): the card is height-capped and
  // scrolls (globals.css, D-S02-24), and the owner scrolled it down to reach the button that produced the answer.
  const [answered, setAnswered] = useState(0);
  const cardRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const card = cardRef.current;
    const answer = card?.querySelector<HTMLElement>(':scope > [role="status"]');
    if (answered === 0 || !card || !answer) return;
    // Put the answer's top at the top of the card's visible box, whatever the owner's scroll position and whatever
    // the browser's scroll anchoring did when the answer was inserted above the controls.
    // The card's own window, not a global: the component also mounts where only window/document are installed.
    const paddingTop = Number.parseFloat(card.ownerDocument.defaultView?.getComputedStyle(card).paddingTop ?? "") || 0;
    card.scrollTop += answer.getBoundingClientRect().top - (card.getBoundingClientRect().top + card.clientTop + paddingTop);
  }, [answered]);

  useEffect(() => {
    let active = true;
    void client.readRunVisibility(runId)
      .then((next) => { if (active) setVisibility(next); })
      .catch(() => { if (active) setMessage(t(catalog, "public.publication.statusUnavailable")); });
    return () => { active = false; };
  }, [catalog,client,runId]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (action === null || !acknowledged || busy) return;
    setConfirming('publication');
  }
  async function publishConfirmed(result:ConfirmedSecurityAction):Promise<void> {
    if(action===null||!acknowledged)return;
    setBusy(true);setMessage(null);setStatement(null);
    try {
      const grant=result.step_up_grant;
      const changed = action === "PUBLISH"
        ? await client.publishRun(runId, grant.token)
        : await client.unpublishRun(runId, grant.token);
      setVisibility(changed);
      setAction(null);
      setConfirming(null);
      setAcknowledged(false);
      setMessage(action === "PUBLISH"
        ? t(catalog, "public.publication.publishedSuccess")
        : t(catalog, "public.publication.unpublishedSuccess"));
    } catch (failure) {
      if (failure instanceof ContractHttpError && failure.statement !== null) {
        setStatement(failure.statement);
      } else if (failure instanceof ContractHttpError && failure.serverCode === "PUBLICATION_CHECK_UNAVAILABLE") {
        setMessage(t(catalog, "public.publication.contentCheck.unavailable"));
      } else if (failure instanceof ContractHttpError && failure.status >= 400 && failure.status < 500) {
        setMessage(t(catalog, "public.publication.changeUnauthorized"));
      } else {
        // A 5xx, no answer, an unreadable answer or a step-up without a grant: the server did not refuse the
        // credentials, and whether the change happened is unknown — never the wrong-password sentence (sd-N4).
        setMessage(t(catalog, "public.publication.statusUnavailable"));
      }
    } finally {
      setBusy(false);
      setAnswered((count) => count + 1);
    }
  }

  async function deletePrivate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!deleteAcknowledged || busy || visibility?.state !== "PRIVATE") return;
    setConfirming('delete');
  }
  async function deleteConfirmed(result:ConfirmedSecurityAction):Promise<void> {
    if(!deleteAcknowledged||visibility?.state!=='PRIVATE')return;
    setBusy(true);setMessage(null);setStatement(null);
    try {
      const grant=result.step_up_grant;
      const { status } = await client.deletePrivateDebate(runId, grant.token);
      setConfirming(null);
      setDeleteAcknowledged(false);
      setDeleteOpen(false);
      setDeleted(status === "CLEANED");
      setDeletePending(status === "PENDING");
      onPrivateDeletion?.(status);
      setMessage(status === "CLEANED"
        ? t(catalog, "public.publication.deletedCleaned")
        : t(catalog, "public.publication.deletionPending"));
    } catch (failure) {
      if (failure instanceof ContractHttpError && failure.serverCode === "DEBATE_MUST_BE_PRIVATE") {
        setMessage(t(catalog, "public.publication.mustBePrivate"));
      } else if (failure instanceof ContractHttpError && failure.serverCode === "LEGACY_CONTENT_RETAINED") {
        setMessage(t(catalog, "public.publication.legacyRetained"));
      } else {
        setMessage(t(catalog, "public.publication.deletionUnauthorized"));
      }
    } finally {
      setBusy(false);
      setAnswered((count) => count + 1);
    }
  }

  function proofFailure(failure:unknown) {
    if(confirming==='delete')setMessage(t(catalog,"public.publication.deletionUnauthorized"));
    else if(failure instanceof ContractHttpError&&failure.status>=400&&failure.status<500)setMessage(t(catalog,"public.publication.changeUnauthorized"));
    else setMessage(t(catalog,"public.publication.statusUnavailable"));
    setAnswered(count=>count+1);
  }
  const selected = action ?? (visibility?.state === "PUBLISHED" ? "UNPUBLISH" : "PUBLISH");
  const warning = selected === "PUBLISH"
    ? t(catalog, "public.publication.publishWarning")
    : t(catalog, "public.publication.unpublishWarning");


  if (deleted) {
    return (
      <section className="card" aria-label={t(catalog, "public.publication.deletedAria")}>
        <h2>{t(catalog, "public.publication.privateDeletedHeading")}</h2>
        <p role="status">{t(catalog, "public.publication.tombstone")}</p>
      </section>
    );
  }

  return (
    <section ref={cardRef} className="card publicationControl" data-support-primary-control aria-label={t(catalog, "public.publication.controlsAria")}>
      <h2>{t(catalog, "public.publication.visibility")}</h2>
      <p>
        {visibility === null
          ? t(catalog, "public.publication.checking")
          : visibility.state === "PRIVATE"
            ? t(catalog, "public.publication.privateStatus")
            : t(catalog, "public.publication.publishedStatus")}
      </p>
      {visibility?.state === "PUBLISHED" && visibility.public_ref !== null ? (
        <p><Link href={`/public/debate/${visibility.public_ref}`}>{t(catalog, "public.publication.openPublicVersion")}</Link></p>
      ) : null}
      {/* The card's answer to the last action sits above its controls: the card is height-capped and scrolls
          (globals.css, D-S02-24), so anything below the form and the delete section starts out of view (pt-B2). */}
      {statement !== null ? (
        <PublicationStatement statement={statement} catalog={catalog}/>
      ) : message ? <p role="status">{message}</p> : null}
      {action === null ? (
        <button
          type="button"
          className="button"
          disabled={visibility === null}
          onClick={() => {
            setStatement(null);
            setDeleteOpen(false);
            setConfirming(null);
            setAction(visibility?.state === "PUBLISHED" ? "UNPUBLISH" : "PUBLISH");
          }}
        >
          {visibility?.state === "PUBLISHED"
            ? t(catalog, "public.publication.unpublishEllipsis")
            : t(catalog, "public.publication.publishEllipsis")}
        </button>
      ) : (
        <form noValidate onSubmit={(event) => void submit(event)}>
          <p><strong>{warning}</strong></p>
          <label>
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              required
            />
            {selected === "PUBLISH"
              ? t(catalog, "public.publication.acknowledgePublish")
              : t(catalog, "public.publication.acknowledgeUnpublish")}
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="button" disabled={!acknowledged || busy}>
              {busy
                ? t(catalog, "public.publication.authorizing")
                : selected === "PUBLISH"
                  ? t(catalog, "public.publication.publishPublicly")
                  : t(catalog, "public.publication.unpublish")}
            </button>
            <button type="button" className="button" disabled={busy} onClick={() => { setStatement(null); setAction(null); setConfirming(null); }}>{t(catalog, "public.publication.cancel")}</button>
          </div>
        </form>
      )}
      {visibility?.state === "PRIVATE" ? (
        <div style={{ marginTop: 24 }}>
          <h3>{t(catalog, "public.publication.deleteHeading")}</h3>
          <p>
            {t(catalog, "public.publication.deleteExplanation")}
          </p>
          {!deleteOpen ? (
            <button
              type="button"
              className="button"
              disabled={busy || deletePending}
              onClick={() => { setStatement(null); setAction(null); setConfirming(null); setDeleteOpen(true); }}
            >
              {deletePending
                ? t(catalog, "public.publication.deletionPendingShort")
                : t(catalog, "public.publication.deletePrivateEllipsis")}
            </button>
          ) : (
            <form noValidate onSubmit={(event) => void deletePrivate(event)}>
              <label>
                <input
                  type="checkbox"
                  checked={deleteAcknowledged}
                  onChange={(event) => setDeleteAcknowledged(event.target.checked)}
                  required
                />
                {t(catalog, "public.publication.deleteAcknowledgement")}
              </label>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="button" disabled={busy || !deleteAcknowledged}>
                  {busy
                    ? t(catalog, "public.publication.authorizing")
                    : t(catalog, "public.publication.permanentlyDelete")}
                </button>
                <button type="button" className="button" disabled={busy} onClick={() => {setDeleteOpen(false);setConfirming(null);}}>
                  {t(catalog, "public.publication.cancel")}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}
      {confirming==='publication'&&action?<SecurityConfirmation catalog={authCatalog} client={client} authorization={{action,target_run_id:runId}} disabled={!acknowledged} onError={proofFailure} onConfirmed={publishConfirmed} onCancel={()=>setConfirming(null)}/>:null}
      {confirming==='delete'?<SecurityConfirmation catalog={authCatalog} client={client} authorization={{action:'DELETE_PRIVATE_DEBATE',target_run_id:runId}} disabled={!deleteAcknowledged} onError={proofFailure} onConfirmed={deleteConfirmed} onCancel={()=>setConfirming(null)}/>:null}
    </section>
  );
}

/** Shared server refusal statement for ordinary and provider-resumed publication. */
export function PublicationStatement({statement,catalog}:{statement:PublicationRefusalStatement;catalog:MessageCatalog}) {
  const partLabels: Record<PublicationPartKind, string> = {
    QUESTION: t(catalog, "public.publication.contentCheck.part.question"),
    SUMMARY: t(catalog, "public.publication.contentCheck.part.summary"),
    ARGUMENTS: t(catalog, "public.publication.contentCheck.part.arguments"),
    REVIEWS: t(catalog, "public.publication.contentCheck.part.reviews"),
    STORY: t(catalog, "public.publication.contentCheck.part.story")
  };

  return (
        <div role="status">
          <h3>{t(catalog, "public.publication.contentCheck.refusedHeading")}</h3>
          <p>{statement.outcome === "BLOCK"
            ? t(catalog, "public.publication.contentCheck.refusedWhatBlock")
            : t(catalog, "public.publication.contentCheck.refusedWhatUnsure")}</p>
          <p>{t(catalog, "public.publication.contentCheck.partsIntro")}</p>
          <ul>{statement.parts.map((part) => <li key={part}>{partLabels[part]}</li>)}</ul>
          <p>{t(catalog, "public.publication.contentCheck.groundTerms")}</p>
          {statement.ground === "TERMS_AND_POSSIBLY_ILLEGAL"
            ? <p>{t(catalog, "public.publication.contentCheck.groundIllegal")}</p> : null}
          <p>{t(catalog, "public.publication.contentCheck.automated")}</p>
          <p>{t(catalog, "public.publication.contentCheck.stillPrivate")}</p>
          <p>{t(catalog, "public.publication.contentCheck.appeal")}</p>
        </div>
  );
}
