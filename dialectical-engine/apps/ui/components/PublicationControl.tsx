"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { contractClient } from "@/lib/api";
import { ContractHttpError } from "@debateai/contract";
import type { ContractClient } from "@debateai/contract";

type Visibility = Readonly<{
  state: "PRIVATE" | "PUBLISHED";
  public_ref: string | null;
}>;

export type PrivateDeletionStatus="PENDING"|"CLEANED";
type PublicationControlClient=Pick<ContractClient,
  "readRunVisibility"|"stepUp"|"publishRun"|"unpublishRun"|"deletePrivateDebate"
>;

export function PublicationControl({ runId,onPrivateDeletion,client=contractClient }: {
  readonly runId:string;
  readonly onPrivateDeletion?:(status:PrivateDeletionStatus)=>void;
  readonly client?:PublicationControlClient;
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
      .catch(() => { if (active) setMessage("Publication status is unavailable."); });
    return () => { active = false; };
  }, [client,runId]);

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
        ? "Published. Anyone with the link can read it, and search engines may index it."
        : "Unpublished here. Copies already taken may still exist.");
    } catch {
      setMessage("Publication change was not authorized. Recheck your password and authenticator code.");
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
        ? "Private debate deleted. Its encrypted content is now a tombstone and cannot be read."
        : "Private debate deletion is pending durable key cleanup.");
    } catch (failure) {
      if (failure instanceof ContractHttpError && failure.serverCode === "DEBATE_MUST_BE_PRIVATE") {
        setMessage("This debate must be unpublished, with public-key cleanup complete, before private deletion.");
      } else if (failure instanceof ContractHttpError && failure.serverCode === "LEGACY_CONTENT_RETAINED") {
        setMessage("This claimed legacy debate contains retained plaintext and cannot be reported as cleaned.");
      } else {
        setMessage("Private debate deletion was not authorized. Recheck your credentials.");
      }
    } finally {
      setBusy(false);
    }
  }

  const selected = action ?? (visibility?.state === "PUBLISHED" ? "UNPUBLISH" : "PUBLISH");
  const warning = selected === "PUBLISH"
    ? "Publishing makes this debate readable by anyone and may allow search engines to index it. It leaves your private deletion envelope, and public copies may persist even if you later unpublish or delete your account."
    : "Unpublishing stops future anonymous reads from DebateAI, but copies already downloaded, quoted, cached, or indexed may persist.";

  if (deleted) {
    return (
      <section className="card" aria-label="Deleted private debate">
        <h2>Private debate deleted</h2>
        <p role="status">This debate is a tombstone. Its encrypted private content is permanently unreadable.</p>
      </section>
    );
  }

  return (
    <section className="card" aria-label="Publication controls">
      <h2>Visibility</h2>
      <p>
        {visibility === null
          ? "Checking visibility…"
          : visibility.state === "PRIVATE"
            ? "Private — only your account can read this debate."
            : "Published — this debate has a separate permanent public snapshot."}
      </p>
      {visibility?.state === "PUBLISHED" && visibility.public_ref !== null ? (
        <p><Link href={`/public/debate/${visibility.public_ref}`}>Open the public version</Link></p>
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
          {visibility?.state === "PUBLISHED" ? "Unpublish…" : "Publish…"}
        </button>
      ) : (
        <form onSubmit={(event) => void submit(event)}>
          <p><strong>{warning}</strong></p>
          <label>
            Account password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <label>
            Authenticator code
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
            I understand and want to {selected === "PUBLISH" ? "publish" : "unpublish"} this debate.
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="button" disabled={!acknowledged || busy}>
              {busy ? "Authorizing…" : selected === "PUBLISH" ? "Publish publicly" : "Unpublish"}
            </button>
            <button type="button" className="button" disabled={busy} onClick={() => setAction(null)}>Cancel</button>
          </div>
        </form>
      )}
      {visibility?.state === "PRIVATE" ? (
        <div style={{ marginTop: 24 }}>
          <h3>Delete this private debate</h3>
          <p>
            Deleting destroys the private content keys and makes encrypted debate content permanently unreadable.
            This cannot be undone. Claimed legacy plaintext is retained and will not be reported as cleaned.
          </p>
          {!deleteOpen ? (
            <button
              type="button"
              className="button"
              disabled={busy || deletePending}
              onClick={() => { setAction(null); setDeleteOpen(true); }}
            >
              {deletePending ? "Deletion pending" : "Delete private debate…"}
            </button>
          ) : (
            <form onSubmit={(event) => void deletePrivate(event)}>
              <label>
                Account password
                <input
                  type="password"
                  autoComplete="current-password"
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                  required
                />
              </label>
              <label>
                Authenticator code
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
                I understand that this private debate cannot be recovered after key destruction.
              </label>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="button" disabled={busy || !deleteAcknowledged}>
                  {busy ? "Authorizing…" : "Permanently delete private debate"}
                </button>
                <button type="button" className="button" disabled={busy} onClick={() => setDeleteOpen(false)}>
                  Cancel
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
