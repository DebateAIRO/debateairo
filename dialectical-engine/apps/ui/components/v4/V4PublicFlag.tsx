"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { PublicFlagRequestSchema, type PublicFlagAnswer } from "@debateai/contract";
import { useModalSurface } from "@/components/consent/modalSemantics";
import { useHideOutside } from "@/components/dialogSurface";
import { contractClient, validateSession } from "@/lib/api";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { usePublicSignedIn } from "@/components/v4/V4PublicSession";

/**
 * Decision 35: "Report a problem" on a public page (r2-14). Signed in: what is wrong and where, then one line back, never who else reported or why a
 * refusal was one. Signed out: sign-in, and the address, so people without an account can still reach us (Terms section 10). English under the V4
 * convention. public-f5: the form closes at once with a thank-you, and the check's answer replaces it later in the same quiet line by the link, so nobody
 * watches the check; a box left too short says so under it; focus goes into the form when it opens and back to the link when it closes. The session is the
 * page's one read (public-f13).
 * public-f4 (owner review, 3 Nov): the link sits in the page's top bar and at the foot of each question, where the form already knows which question is
 * meant (`where`). The form opens as a small window under the link on a computer and as a sheet from the bottom on a phone (public-lane.css), never as
 * loose lines above the page.
 * ACCESS-12 (the wave-2 checks, 4 Nov): the form is a real dialog, through the site's one dialog helper (components/dialogSurface.ts: the shared modal
 * semantics): named "Report a problem", focus goes into it and Tab and Shift+Tab stay inside it, the page behind is hidden from screen readers and covered,
 * so a tap or click beside it closes it (on a phone the sheet's page cannot be reached), and Escape, Cancel or that tap give focus back to the link.
 */

/**
 * The open form's dialog: the site's shared modal helpers (useHideOutside and useModalSurface, as useDialogSurface combines
 * them), and the cover beside it that closes it (it holds the page behind). Focus goes into the form's first box when the
 * form is there (public-f5), else onto the dialog itself, which says its name.
 */
function FlagDialog({ id, label, onClose, toggle, initialFocus, children }: Readonly<{
  id: string; label: string; onClose: () => void; toggle: RefObject<HTMLButtonElement | null>;
  initialFocus: RefObject<HTMLElement | null> | null; children: ReactNode;
}>) {
  const dialog = useRef<HTMLDivElement | null>(null);
  useHideOutside(dialog);
  useModalSurface(true, { containerRef: dialog, initialFocusRef: initialFocus ?? dialog, onClose, returnFocusRef: toggle });
  return (
    <>
      {/* A press on the cover keeps focus where it is until the click closes the form (the page's <main> would take it). */}
      <div className="v4PubFlagScrim" data-public-flag-scrim="" onMouseDown={(event) => event.preventDefault()} onClick={onClose} />
      <div ref={dialog} className="v4PubFlagPanel" id={id} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        {children}
      </div>
    </>
  );
}
export function V4PublicFlag({ publicRef, catalog, where: whereShown, placement = "top", send = (ref, body) => contractClient.flagPublicDebate(ref, body),
  readSession = validateSession }: Readonly<{
  publicRef: string; catalog: MessageCatalog;
  /** At the foot of a question: that question, already written in "Where is the problem?" (the person can still change it). */
  where?: string;
  /** "top": in the page's top bar; "foot": at the foot of a question. */
  placement?: "top" | "foot";
  send?: (publicRef: string, body: Readonly<{ where: string; claim: string }>) => Promise<PublicFlagAnswer>;
  readSession?: () => Promise<unknown>;
}>) {
  const ids = useId();
  const signedIn = usePublicSignedIn(readSession);
  const [open, setOpen] = useState(false);
  const [where, setWhere] = useState(() => (whereShown ?? "").slice(0, 300));
  const [claim, setClaim] = useState("");
  const [tooShort, setTooShort] = useState<Readonly<{ where: boolean; claim: boolean }>>({ where: false, claim: false });
  const [sending, setSending] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const whereField = useRef<HTMLInputElement>(null);
  const claimField = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (open && signedIn === true) whereField.current?.focus();
  }, [open, signedIn]);
  function close() {
    setOpen(false);
    setTooShort({ where: false, claim: false });
    toggle.current?.focus();
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault();
    close();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const body = PublicFlagRequestSchema.safeParse({ where, claim });
    if (!body.success) {
      // Spaces only, or too little to act on: a short line under that box, and focus on it. Nothing is sent.
      const short = {
        where: !PublicFlagRequestSchema.shape.where.safeParse(where).success,
        claim: !PublicFlagRequestSchema.shape.claim.safeParse(claim).success
      };
      setTooShort(short);
      (short.where ? whereField.current : claimField.current)?.focus();
      return;
    }
    setLine(t(catalog, "v4.public.flag.thanks"));
    close();
    setSending(true);
    try {
      const answer = await send(publicRef, body.data);
      setLine(t(catalog, `v4.public.flag.${answer.state}`));
      setWhere((whereShown ?? "").slice(0, 300));
      setClaim("");
    } catch {
      // The words stay in the form, so trying again needs no retyping.
      setLine(t(catalog, "v4.public.flag.failed"));
    } finally {
      setSending(false);
    }
  }
  const signIn = `/login?next=${encodeURIComponent(`/public/debate/${encodeURIComponent(publicRef)}`)}`;
  const whereHint = `${ids}-where-more`;
  const claimHint = `${ids}-claim-more`;
  return (
    <div className={`v4PubFlag v4PubFlag-${placement}`} data-public-flag data-placement={placement} onKeyDown={onKeyDown}>
      <button ref={toggle} className="v4Link v4PubFlagToggle" type="button" data-public-report aria-expanded={open} aria-controls={`${ids}-panel`}
        onClick={() => (open ? close() : setOpen(true))}>
        {t(catalog, "v4.public.report")}
      </button>
      {" "}
      <span className="v4PubFlagLine" role="status" data-public-flag-line>{line ?? ""}</span>
      {!open ? null : (
        <FlagDialog id={`${ids}-panel`} label={t(catalog, "v4.public.report")} onClose={close} toggle={toggle}
          initialFocus={signedIn === true ? whereField : null}>
          {signedIn === false ? (
            <p data-public-flag-signed-out>{t(catalog, "v4.public.flag.signedOut")} <Link className="v4Link" href={signIn}>{t(catalog, "v4.public.flag.signIn")}</Link></p>
          ) : signedIn === null ? (
            <p className="v4PubFlagLine" data-public-flag-waiting>{t(catalog, "v4.public.oneMoment")}</p>
          ) : (
            <form className="v4PubFlagForm" noValidate onSubmit={(event) => { void submit(event); }}>
              <label className="v4PubLabel" htmlFor={`${ids}-where`}>{t(catalog, "v4.public.flag.where")}</label>
              <input
                ref={whereField} id={`${ids}-where`} className="v4PubText" name="where" dir="auto" required maxLength={300} autoComplete="off" value={where}
                aria-invalid={tooShort.where || undefined} aria-describedby={tooShort.where ? whereHint : undefined}
                onChange={(event) => setWhere(event.target.value)}
              />
              {tooShort.where ? <p id={whereHint} className="v4PubFlagMore" data-public-flag-more>{t(catalog, "v4.public.flag.whereMore")}</p> : null}
              <label className="v4PubLabel" htmlFor={`${ids}-claim`}>{t(catalog, "v4.public.flag.claim")}</label>
              <textarea
                ref={claimField} id={`${ids}-claim`} className="v4PubText" name="claim" dir="auto" required maxLength={2000} rows={4} value={claim}
                aria-invalid={tooShort.claim || undefined} aria-describedby={tooShort.claim ? claimHint : undefined}
                onChange={(event) => setClaim(event.target.value)}
              />
              {tooShort.claim ? <p id={claimHint} className="v4PubFlagMore" data-public-flag-more>{t(catalog, "v4.public.flag.claimMore")}</p> : null}
              <div className="v4PubDigActions">
                <button className="v4Btn v4BtnPrimary" type="submit" disabled={sending}>{t(catalog, "v4.public.flag.send")}</button>
                <button className="v4Link" type="button" onClick={close}>{t(catalog, "v4.public.flag.cancel")}</button>
              </div>
            </form>
          )}
        </FlagDialog>
      )}
    </div>
  );
}
