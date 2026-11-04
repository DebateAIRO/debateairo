"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { publicPageHref, usePublicStage, type PublicStage } from "@/lib/v4/publicState";

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

export function V4PublicMark({ stage, catalog }: Readonly<{ stage: PublicStage | null; catalog: MessageCatalog }>) {
  const [copy, setCopy] = useState<CopyState>("IDLE");
  // A stage after another one on this page gets the 1-second highlight (the first one does not). The line is keyed by
  // its stage, so each change plays it once.
  const shown = useRef<string | null>(null);
  const [glow, setGlow] = useState(false);
  const kind = stage?.kind ?? null;
  useEffect(() => {
    if (kind === null) return;
    if (shown.current !== null && shown.current !== kind) setGlow(true);
    shown.current = kind;
  }, [kind]);
  if (stage === null) return null;
  const className = `v4PublicMark${glow ? " v4Highlight" : ""}`;
  if (stage.kind !== "PUBLIC") {
    return (
      <p key={stage.kind} className={className} role="status" data-public-stage={stage.kind}>
        <Globe />
        <span>{t(catalog, `v4.publicMark.${stage.kind}`)}</span>
      </p>
    );
  }
  const href = publicPageHref(stage.publicRef);
  const press = async (): Promise<void> => {
    const url = new URL(href, window.location.origin).toString();
    const outcome = await shareOrCopy(url);
    setCopy(outcome === "SHARED" ? "IDLE" : outcome);
  };
  return (
    <p key={stage.kind} className={className} data-public-stage="PUBLIC">
      <Globe />
      <span className="v4PublicMarkWord">{t(catalog, "v4.publicMark.public")}</span>
      <span aria-hidden="true"> · </span>
      <Link className="v4Link" href={href}>{t(catalog, "v4.publicMark.seePage")}</Link>
      <span aria-hidden="true"> · </span>
      <button type="button" className="v4Link" onClick={() => void press()}>{t(catalog, "v4.publicMark.copyLink")}</button>
      <span className="v4PublicMarkCopied" role="status">
        {copy === "COPIED" ? t(catalog, "v4.publicMark.linkCopied") : copy === "FAILED" ? t(catalog, "v4.publicMark.copyFailed") : ""}
      </span>
    </p>
  );
}

/** The line for one debate, reading its stage itself (a page that has no other use for it: the report). */
export function V4PublicMarkFor({ runId, catalog }: Readonly<{ runId: string | null; catalog: MessageCatalog }>) {
  const stage = usePublicStage(runId);
  return <V4PublicMark stage={stage} catalog={catalog} />;
}
