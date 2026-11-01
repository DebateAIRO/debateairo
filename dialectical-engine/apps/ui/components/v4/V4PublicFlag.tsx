"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { PublicFlagRequestSchema, type PublicFlagAnswer } from "@debateai/contract";
import { contractClient, validateSession } from "@/lib/api";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/**
 * Decision 35: "Report" on a public page. Signed in: what is wrong and where, then one line back, never who else reported or why a refusal was one. Signed out: sign-in, and the address, so people without an account can
 * still reach us (Terms section 10). English under the V4 convention.
 */
export function V4PublicFlag({ publicRef, catalog, send = (ref, body) => contractClient.flagPublicDebate(ref, body), readSession = validateSession }: Readonly<{
  publicRef: string; catalog: MessageCatalog;
  send?: (publicRef: string, body: Readonly<{ where: string; claim: string }>) => Promise<PublicFlagAnswer>;
  readSession?: () => Promise<unknown>;
}>) {
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void readSession().then(() => { if (active) setSignedIn(true); }, () => { if (active) setSignedIn(false); });
    return () => { active = false; };
  }, [readSession]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const body = PublicFlagRequestSchema.safeParse({ where: String(data.get("where") ?? ""), claim: String(data.get("claim") ?? "") });
    if (!body.success) return;
    setBusy(true);
    try {
      const answer = await send(publicRef, body.data);
      setLine(t(catalog, `v4.public.flag.${answer.state}`));
      setOpen(false);
    } catch {
      setLine(t(catalog, "v4.public.flag.failed"));
    } finally {
      setBusy(false);
    }
  }
  const signIn = `/login?next=${encodeURIComponent(`/public/debate/${encodeURIComponent(publicRef)}`)}`;
  return (
    <div className="publicReportLink" data-public-flag>
      <button className="v4Link" type="button" data-public-report aria-expanded={open} onClick={() => setOpen((value) => !value)}>{t(catalog, "v4.public.report")}</button>
      {line === null ? null : <p role="status" data-public-flag-line>{line}</p>}
      {!open ? null : signedIn === false ? (
        <p data-public-flag-signed-out>{t(catalog, "v4.public.flag.signedOut")} <Link className="v4Link" href={signIn}>{t(catalog, "v4.public.flag.signIn")}</Link></p>
      ) : signedIn === null ? null : (
        <form onSubmit={(event) => { void submit(event); }}>
          <label htmlFor="public-flag-where">{t(catalog, "v4.public.flag.where")}</label>
          <input id="public-flag-where" name="where" required maxLength={300} autoComplete="off" />
          <label htmlFor="public-flag-claim">{t(catalog, "v4.public.flag.claim")}</label>
          <textarea id="public-flag-claim" name="claim" required minLength={10} maxLength={2000} rows={4} />
          <button className="v4Link" type="submit" disabled={busy}>{t(catalog, "v4.public.flag.send")}</button>
          <button className="v4Link" type="button" onClick={() => setOpen(false)}>{t(catalog, "v4.public.flag.cancel")}</button>
        </form>
      )}
    </div>
  );
}
