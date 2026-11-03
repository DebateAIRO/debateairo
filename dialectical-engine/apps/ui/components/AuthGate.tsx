"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ageConfirmationHref, ageConfirmationRequired } from "@/lib/ageConfirmation";
import { LegalAcceptGate } from "@/components/billing/LegalAcceptGate";
import { COOKIE_SESSION_MARKER, validateSession } from "@/lib/api";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

const SESSION_MARKER = COOKIE_SESSION_MARKER;

/**
 * public-f13 (owner screen review, 3 Nov): the sign-in page carries the way back to this page, from its path and query
 * only (a fragment never travels to the server); lib/returnPath decides which addresses sign-in may return to (a V4
 * debate, its report, /v4, settings…), and any other comes back to the default, as before.
 */
function signInHref(): string {
  return `/login?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`;
}

export function AuthGate({
  children,
  catalog,
  legalGate = true
}: {
  children: (sessionMarker: string) => React.ReactNode;
  catalog?: MessageCatalog;
  /**
   * Paid plans L4: the accept screen covers the page unless this is false. /settings passes false, so
   * account deletion, consent withdrawal and sign-out never wait on accepting new documents; the
   * billing routes' own LEGAL_REACCEPTANCE_REQUIRED still stops a paid action there.
   */
  legalGate?: boolean;
}) {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [signIn, setSignIn] = useState("/login");
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
          setSignIn(signInHref());
          setAuthenticated(false);
          setChecking(false);
        }
      }
    );
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!checking && !authenticated) window.location.replace(signIn);
  }, [authenticated, checking, signIn]);

  if (checking) {
    return <div className="screen scroll"><div className="screenInner narrow"><p className="muted">{t(catalog, "newDebate.checkingSession")}</p></div></div>;
  }
  if (authenticated) {
    // Paid plans L4: only reached once the session AND the age gate's one-time check have cleared.
    return legalGate
      ? <LegalAcceptGate catalog={catalog}>{children(SESSION_MARKER)}</LegalAcceptGate>
      : <>{children(SESSION_MARKER)}</>;
  }

  return (
    <div className="screen scroll">
      <div className="screenInner narrow">
        <p className="muted" role="status">{t(catalog, "newDebate.redirectingToSignIn")}</p>
        <Link href={signIn}>{t(catalog, "newDebate.continueToSignIn")}</Link>
      </div>
    </div>
  );
}
