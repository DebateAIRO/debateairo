"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { publicPageHref, usePublicStage, type PublicStage } from "@/lib/v4/publicState";
import { useOpenSide } from "@/lib/v4/useOpenSide";

/*
 * V4 screen review (owner picks 3 Nov 2026): one small grey line with a globe mark, in the same spot under the question
 * on every page of a debate that has a public page (journey-f20's "Public · Copy link", public-f26's line under the
 * breadcrumb with "See its page" and "Copy link"; on a phone "Copy link" opens the phone's own share sheet). Before it is
 * public, and when it was kept private, it says that stage instead, once the server says it (lib/v4/publicState.ts).
 * A stage that changes while the page is open changes at once, with the shared 1-second soft highlight. Nothing is kept
 * in the browser; the link is the public page's own address.
 */

type CopyState = "IDLE" | "COPIED" | "FAILED";

function Globe() {
  return (
    <svg className="v4PublicMarkGlobe" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <ellipse cx="8" cy="8" rx="2.6" ry="6.25" fill="none" stroke="currentColor" strokeWidth="1.1" />
      <path d="M2 8h12M3 4.8h10M3 11.2h10" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

/** A phone (a coarse pointer) with the browser's share sheet: the link goes through it; anywhere else it is copied. */
function sharesBySheet(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
}

async function shareOrCopy(url: string): Promise<CopyState | "SHARED"> {
  if (sharesBySheet()) {
    try {
      await navigator.share({ url });
      return "SHARED";
    } catch (failure) {
      // The person closed the sheet: nothing to say.
      if (failure instanceof Error && failure.name === "AbortError") return "IDLE";
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "COPIED";
  } catch {
    return "FAILED";
  }
}

/**
 * "Copy link" for a public page's address (on a phone, the phone's own share sheet), with its quiet "Link copied." line.
 * public-f26 (owner's screen review): the same button on the debate's own pages (in the line below) and at the top of the
 * public page itself. The link is the public page's own address; nothing is kept.
 */
export function V4CopyLink({ href, catalog, className = "v4Link" }: Readonly<{ href: string; catalog: MessageCatalog; className?: string }>) {
  const [copy, setCopy] = useState<CopyState>("IDLE");
  // RC-2 (the checks of the last fixes, 4 Nov): in the public page's computer bar the line sits under the link (public-lane.css),
  // opening toward the room from it, so the longer "We couldn't copy the link…" stays inside the window too.
  const button = useRef<HTMLButtonElement>(null);
  const side = useOpenSide(button, copy !== "IDLE");
  const press = async (): Promise<void> => {
    const url = new URL(href, window.location.origin).toString();
    const outcome = await shareOrCopy(url);
    setCopy(outcome === "SHARED" ? "IDLE" : outcome);
  };
  return (
    <>
      <button ref={button} type="button" className={className} data-public-copy-link="" onClick={() => void press()}>{t(catalog, "v4.publicMark.copyLink")}</button>
      <span className="v4PublicMarkCopied" role="status" data-side={side}>
        {copy === "COPIED" ? t(catalog, "v4.publicMark.linkCopied") : copy === "FAILED" ? t(catalog, "v4.publicMark.copyFailed") : ""}
      </span>
    </>
  );
}

export function V4PublicMark({ stage, catalog }: Readonly<{ stage: PublicStage | null; catalog: MessageCatalog }>) {
  // A stage after another one on this page gets the 1-second highlight (the first one does not). The line is keyed by
  // its stage, so each change plays it once.
  const shown = useRef<string | null>(null);
  const [glow, setGlow] = useState(false);
  // ACCESS-16 (the wave-2 review, 4 Nov): one region that stays on the page says a stage that follows another one out loud
  // (a region drawn with its words already in it is often not read); the first stage is read with the page.
  const [said, setSaid] = useState("");
  const kind = stage?.kind ?? null;
  useEffect(() => {
    if (kind === null) return;
    if (shown.current !== null && shown.current !== kind) {
      setGlow(true);
      setSaid(t(catalog, kind === "PUBLIC" ? "v4.publicMark.public" : `v4.publicMark.${kind}`));
    }
    shown.current = kind;
  }, [kind, catalog]);
  const live = <span className="v4SrOnly" role="status" data-public-stage-said="">{said}</span>;
  if (stage === null) return live;
  const className = `v4PublicMark${glow ? " v4Highlight" : ""}`;
  if (stage.kind !== "PUBLIC") {
    return (
      <>
        <p key={stage.kind} className={className} data-public-stage={stage.kind}>
          <Globe />
          <span>{t(catalog, `v4.publicMark.${stage.kind}`)}</span>
        </p>
        {live}
      </>
    );
  }
  const href = publicPageHref(stage.publicRef);
  return (
    <>
    <p key={stage.kind} className={className} data-public-stage="PUBLIC">
      <Globe />
      <span className="v4PublicMarkWord">{t(catalog, "v4.publicMark.public")}</span>
      <span aria-hidden="true"> · </span>
      <Link className="v4Link" href={href}>{t(catalog, "v4.publicMark.seePage")}</Link>
      <span aria-hidden="true"> · </span>
      <V4CopyLink href={href} catalog={catalog} />
    </p>
    {live}
    </>
  );
}

/** The line for one debate, reading its stage itself (a page that has no other use for it: the report). */
export function V4PublicMarkFor({ runId, catalog }: Readonly<{ runId: string | null; catalog: MessageCatalog }>) {
  const stage = usePublicStage(runId);
  return <V4PublicMark stage={stage} catalog={catalog} />;
}
