"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { contractClient } from "@/lib/api";

type Visibility = Readonly<{
  state: "PRIVATE" | "PUBLISHED";
  public_ref: string | null;
}>;

export function PublicationControl({ runId }: { readonly runId: string }) {
  const [visibility, setVisibility] = useState<Visibility | null>(null);
  const [action, setAction] = useState<"PUBLISH" | "UNPUBLISH" | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void contractClient.readRunVisibility(runId)
      .then((next) => { if (active) setVisibility(next); })
      .catch(() => { if (active) setMessage("Publication status is unavailable."); });
    return () => { active = false; };
  }, [runId]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (action === null || !acknowledged || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const steppedUp = await contractClient.stepUp(password, code, {
        action,
        target_run_id: runId
      });
      const grant = steppedUp.step_up_grant;
      if (grant === undefined) throw new Error("STEP_UP_GRANT_MISSING");
      const changed = action === "PUBLISH"
        ? await contractClient.publishRun(runId, grant.token)
        : await contractClient.unpublishRun(runId, grant.token);
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

  const selected = action ?? (visibility?.state === "PUBLISHED" ? "UNPUBLISH" : "PUBLISH");
  const warning = selected === "PUBLISH"
    ? "Publishing makes this debate readable by anyone and may allow search engines to index it. It leaves your private deletion envelope, and public copies may persist even if you later unpublish or delete your account."
    : "Unpublishing stops future anonymous reads from DebateAI, but copies already downloaded, quoted, cached, or indexed may persist.";

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
          onClick={() => setAction(visibility?.state === "PUBLISHED" ? "UNPUBLISH" : "PUBLISH")}
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
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
