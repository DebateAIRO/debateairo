"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { contractClient } from "@/lib/api";
import { ContractHttpError } from "@debateai/contract";
import type { ContractClient } from "@debateai/contract";
import publicEnglish from "@/messages/en/public.json";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

type Visibility = Readonly<{
  state: "PRIVATE" | "PUBLISHED";
  public_ref: string | null;
}>;

export type PrivateDeletionStatus="PENDING"|"CLEANED";
type PublicationControlClient=Pick<ContractClient,
  "readRunVisibility"|"stepUp"|"publishRun"|"unpublishRun"|"deletePrivateDebate"
>;

export function PublicationControl({ runId,onPrivateDeletion,client=contractClient,catalog=publicEnglish }: {
  readonly runId:string;
  readonly onPrivateDeletion?:(status:PrivateDeletionStatus)=>void;
  readonly client?:PublicationControlClient;
  readonly catalog?:MessageCatalog;
}) {
  const [visibility, setVisibility] = useState<Visibility | null>(null);
  const [action, setAction] = useState<"PUBLISH" | "UNPUBLISH" | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteCode, setDeleteCode] = useState("");
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleted, setDeleted] = useState(false);

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
    setBusy(true);
    setMessage(null);
    try {
      const steppedUp = await client.stepUp(password, code, {
        action,
        target_run_id: runId
      });
      const grant = steppedUp.step_up_grant;
      if (grant === undefined) throw new Error("STEP_UP_GRANT_MISSING");
      const changed = action === "PUBLISH"
        ? await client.publishRun(runId, grant.token)
        : await client.unpublishRun(runId, grant.token);
      setVisibility(changed);
      setAction(null);
      setPassword("");
      setCode("");
      setAcknowledged(false);
      setMessage(action === "PUBLISH"
        ? t(catalog, "public.publication.publishedSuccess")
        : t(catalog, "public.publication.unpublishedSuccess"));
    } catch {
      setMessage(t(catalog, "public.publication.changeUnauthorized"));
    } finally {
      setBusy(false);
    }
  }

  async function deletePrivate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!deleteAcknowledged || busy || visibility?.state !== "PRIVATE") return;
    setBusy(true);
    setMessage(null);
    try {
      const steppedUp = await client.stepUp(deletePassword, deleteCode, {
        action: "DELETE_PRIVATE_DEBATE",
        target_run_id: runId
      });
      const grant = steppedUp.step_up_grant;
      if (grant === undefined || grant.action !== "DELETE_PRIVATE_DEBATE") {
        throw new Error("DELETE_PRIVATE_DEBATE_GRANT_MISSING");
      }
      const { status } = await client.deletePrivateDebate(runId, grant.token);
      setDeletePassword("");
      setDeleteCode("");
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
    }
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
    <section className="card" data-support-primary-control aria-label={t(catalog, "public.publication.controlsAria")}>
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
      {action === null ? (
        <button
          type="button"
          className="button"
          disabled={visibility === null}
          onClick={() => {
            setDeleteOpen(false);
            setAction(visibility?.state === "PUBLISHED" ? "UNPUBLISH" : "PUBLISH");
          }}
        >
          {visibility?.state === "PUBLISHED"
            ? t(catalog, "public.publication.unpublishEllipsis")
            : t(catalog, "public.publication.publishEllipsis")}
        </button>
      ) : (
        <form onSubmit={(event) => void submit(event)}>
          <p><strong>{warning}</strong></p>
          <label>
            {t(catalog, "public.publication.accountPassword")}
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <label>
            {t(catalog, "public.publication.authenticatorCode")}
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
            />
          </label>
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
            <button type="button" className="button" disabled={busy} onClick={() => setAction(null)}>{t(catalog, "public.publication.cancel")}</button>
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
              onClick={() => { setAction(null); setDeleteOpen(true); }}
            >
              {deletePending
                ? t(catalog, "public.publication.deletionPendingShort")
                : t(catalog, "public.publication.deletePrivateEllipsis")}
            </button>
          ) : (
            <form onSubmit={(event) => void deletePrivate(event)}>
              <label>
                {t(catalog, "public.publication.accountPassword")}
                <input
                  type="password"
                  autoComplete="current-password"
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                  required
                />
              </label>
              <label>
                {t(catalog, "public.publication.authenticatorCode")}
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  value={deleteCode}
                  onChange={(event) => setDeleteCode(event.target.value)}
                  required
                />
              </label>
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
                <button type="button" className="button" disabled={busy} onClick={() => setDeleteOpen(false)}>
                  {t(catalog, "public.publication.cancel")}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
