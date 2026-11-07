"use client";

import { useEffect, useState } from "react";
import { ageConfirmationHref, ageConfirmationRequired } from "@/lib/ageConfirmation";
import { LegalAcceptGate } from "@/components/billing/LegalAcceptGate";
import { COOKIE_SESSION_MARKER, validateSession } from "@/lib/api";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { signInHrefFor, currentReturnPath } from "@/lib/signInWayBack";

const SESSION_MARKER = COOKIE_SESSION_MARKER;

export function AuthGate({
  children,
  catalog,
  legalGate = true,
  checkingView
}: {
  children: (sessionMarker: string) => React.ReactNode;
  catalog?: MessageCatalog;
  /**
   * V4 screen review (map-f6): what shows while the session (and the legal status) is checked. Left out: the site's
   * "Checking session…" line, as before. The V4 map page passes a grey outline of itself.
   */
  checkingView?: React.ReactNode;
  /**
   * Paid plans L4: the accept screen covers the page unless this is false. /settings passes false, so
   * account deletion, consent withdrawal and sign-out never wait on accepting new documents; the
   * billing routes' own LEGAL_REACCEPTANCE_REQUIRED still stops a paid action there.
   */
  legalGate?: boolean;
}) {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let active = true;
    void validateSession().then(
      async () => {
        // Age gate (8k): a session opened before the date-of-birth field still owes the
        // one-time check, so the page waits behind "checking" while the interstitial loads.
        if (await ageConfirmationRequired()) {
          window.location.replace(ageConfirmationHref(`${window.location.pathname}${window.location.search}`));
          return;
        }
        if (active) {
          setAuthenticated(true);
          setChecking(false);
        }
      },
      () => {
        if (active) {
          setAuthenticated(false);
          setChecking(false);
        }
      }
    );
    return () => { active = false; };
  }, []);

  // V4 screen review (map-f6, wait-f1): the sign-in page gets the way back to this page (its path and query), so the
  // person lands on the same page afterwards; the sign-in page keeps only a path on this site (lib/returnPath.ts).
  const [signIn, setSignIn] = useState("/login");
  useEffect(() => {
    if (checking || authenticated) return;
    const href = signInHrefFor(currentReturnPath());
    setSignIn(href);
    window.location.replace(href);
  }, [authenticated, checking]);

  if (checking) {
    return checkingView !== undefined
      ? <>{checkingView}</>
      : <div className="screen scroll"><div className="screenInner narrow"><p className="muted">{t(catalog, "newDebate.checkingSession")}</p></div></div>;
  }
  if (authenticated) {
    // Paid plans L4: only reached once the session AND the age gate's one-time check have cleared.
    return legalGate
      ? <LegalAcceptGate catalog={catalog} checkingView={checkingView}>{children(SESSION_MARKER)}</LegalAcceptGate>
      : <>{children(SESSION_MARKER)}</>;
  }

  return (
    <div className="screen scroll">
      <div className="screenInner narrow">
        <p className="muted" role="status">{t(catalog, "newDebate.redirectingToSignIn")}</p>
        {/* A plain link: /login may send a signed-in visitor on to ?next as a full page load (W11 fix 1). */}
        <a href={signIn}>{t(catalog, "newDebate.continueToSignIn")}</a>
      </div>
    </div>
  );
}
