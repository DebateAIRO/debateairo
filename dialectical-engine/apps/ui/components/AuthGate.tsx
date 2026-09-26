"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { COOKIE_SESSION_MARKER, validateSession } from "@/lib/api";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

const SESSION_MARKER = COOKIE_SESSION_MARKER;

export function AuthGate({
  children,
  catalog
}: {
  children: (sessionMarker: string) => React.ReactNode;
  catalog?: MessageCatalog;
}) {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let active = true;
    void validateSession().then(
      () => { if (active) setAuthenticated(true); },
      () => { if (active) setAuthenticated(false); }
    ).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!checking && !authenticated) window.location.replace("/login");
  }, [authenticated, checking]);

  if (checking) {
    return <div className="screen scroll"><div className="screenInner narrow"><p className="muted">{t(catalog, "newDebate.checkingSession")}</p></div></div>;
  }
  if (authenticated) {
    return <>{children(SESSION_MARKER)}</>;
  }

  return (
    <div className="screen scroll">
      <div className="screenInner narrow">
        <p className="muted" role="status">{t(catalog, "newDebate.redirectingToSignIn")}</p>
        <Link href="/login">{t(catalog, "newDebate.continueToSignIn")}</Link>
      </div>
    </div>
  );
}
