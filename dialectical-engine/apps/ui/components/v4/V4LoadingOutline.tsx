"use client";

import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { ownWords } from "@/lib/v4/askText";

/*
 * V4 screen review, 3 Nov.
 * map-f6: while the map page loads it shows ONE look, a grey outline of itself (an empty answer card and a few empty
 * question cards), from the session check to the first read, instead of "Checking session…" in the old site look and then
 * a bare "Loading…". It stands still (no shimmer: not one of the approved moves) and changes at once when the page is
 * there. Screen readers hear one "Loading…".
 * wait-f1: when the server says the sign-in has ended, the card says so and offers [Sign in] with the way back here.
 */

/** The outline of the map page's body: the answer card and four question cards. */
export function V4LoadingOutline(props: Readonly<{ catalog: MessageCatalog }>) {
  return (
    <div className="v4DebOutline" role="status">
      <span className="v4SrOnly">{t(props.catalog, "v4.common.loading")}</span>
      <div className="v4DebOutlineAnswer" aria-hidden="true">
        <span className="v4DebOutlineLine v4DebOutlineLineShort" />
        <span className="v4DebOutlineLine" />
        <span className="v4DebOutlineLine" />
        <span className="v4DebOutlineLine v4DebOutlineLineMid" />
      </div>
      <div className="v4DebOutlineCards" aria-hidden="true">
        <span className="v4DebOutlineCard" />
        <span className="v4DebOutlineCard" />
        <span className="v4DebOutlineCard" />
        <span className="v4DebOutlineCard" />
      </div>
    </div>
  );
}

/**
 * The whole page's outline, header included, for the moment before the page itself can draw (the session check): the
 * header is an empty bar of the header's own size, so nothing moves when the real one arrives.
 */
export function V4LoadingPage(props: Readonly<{ catalog: MessageCatalog }>) {
  return (
    <div className="v4DebPage">
      <div className="v4Hdr v4DebOutlineHdr" aria-hidden="true"><span className="v4DebOutlineBrand" /></div>
      <div className="v4DebMain"><V4LoadingOutline catalog={props.catalog} /></div>
    </div>
  );
}

/** wait-f1: "Please sign in again to see your question." with [Sign in]; the person's own words when the page has them. */
export function V4SignInAgain(props: Readonly<{ questionLine: string | null; signInHref: string; catalog: MessageCatalog }>) {
  const { questionLine, signInHref, catalog } = props;
  const words = questionLine === null ? "" : ownWords(questionLine);
  return (
    <section className="v4Card v4DebStatus">
      {words.length > 0 ? (
        <>
          <p className="v4Eyebrow">{t(catalog, "v4.debate.yourQuestion")}</p>
          <p className="v4Serif v4DebStatusQuestion" data-ai-generated="true">{words}</p>
        </>
      ) : null}
      {/* A live region around the heading: someone waiting on this card hears that it changed. */}
      <div role="status"><h1 className="v4DebStatusTitle">{t(catalog, "v4.debate.signedOut")}</h1></div>
      <div className="v4DebStatusActions">
        {/* A plain link: /login sends a signed-in visitor on to ?next as a full page load (W11 fix 1). */}
        <a className="v4Btn v4BtnPrimary" href={signInHref}>{t(catalog, "v4.debate.signIn")}</a>
      </div>
    </section>
  );
}
