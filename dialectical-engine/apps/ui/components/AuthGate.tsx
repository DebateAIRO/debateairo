"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { COOKIE_SESSION_MARKER, validateSession } from "@/lib/api";

const SESSION_MARKER = COOKIE_SESSION_MARKER;

export function AuthGate({ children }: { children: (sessionMarker: string) => React.ReactNode }) {
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
    return <div className="screen scroll"><div className="screenInner narrow"><p className="muted">Checking session…</p></div></div>;
  }
  if (authenticated) {
    return <>{children(SESSION_MARKER)}</>;
  }

  return (
    <div className="screen scroll">
      <div className="screenInner narrow">
        <p className="muted" role="status">Taking you to sign in…</p>
        <Link href="/login">Continue to sign in</Link>
      </div>
    </div>
  );
}
