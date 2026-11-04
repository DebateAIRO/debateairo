"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { V4Header } from "@/components/v4/V4Header";
import { validateSession } from "@/lib/api";
import type { MessageCatalog } from "@/lib/i18n/translate";

/*
 * public-f13 (owner screen review, 3 Nov): one sign-in check for the whole public page. The page reads the session once,
 * here, and every part that offers something (Dig here, Write a report, Report a problem) reads that one answer, so
 * nothing pops in at a different moment. A part mounted without this provider (a test, the publication review) reads it
 * itself. Nothing is kept in the browser.
 */

/** null while the read has not answered. */
type PublicSession = Readonly<{ signedIn: boolean | null }>;

const PublicSessionContext = createContext<PublicSession | undefined>(undefined);

function useSessionRead(readSession: () => Promise<unknown>, skip: boolean): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    if (skip) return;
    let active = true;
    void readSession().then(() => { if (active) setSignedIn(true); }, () => { if (active) setSignedIn(false); });
    return () => { active = false; };
  }, [readSession, skip]);
  return signedIn;
}

export function V4PublicSessionProvider({ children, readSession = validateSession }: Readonly<{ children: ReactNode; readSession?: () => Promise<unknown> }>) {
  const signedIn = useSessionRead(readSession, false);
  return <PublicSessionContext.Provider value={{ signedIn }}>{children}</PublicSessionContext.Provider>;
}

/** Whether the visitor is signed in: the page's one read when there is one, else this part's own. */
export function usePublicSignedIn(readSession: () => Promise<unknown> = validateSession): boolean | null {
  const shared = useContext(PublicSessionContext);
  const own = useSessionRead(readSession, shared !== undefined);
  return shared === undefined ? own : shared.signedIn;
}

/**
 * The public page's V4 header (ask-d6 A): its account button reads the page's one session answer above (public-f13), so the page reads the session once
 * (the wave-2 review, 4 Nov). journey-f19 (review F8): no quota on a public page, and none is read.
 */
export function V4PublicHeader({ catalog, children }: Readonly<{ catalog: MessageCatalog; children?: ReactNode }>) {
  const signedIn = usePublicSignedIn();
  return (
    <V4Header catalog={catalog} readingLevel={null} showQuota={false} session={signedIn === null ? "CHECKING" : signedIn ? "IN" : "OUT"}>
      {children}
    </V4Header>
  );
}

/** The query names of the way back to one path's dig box: `?dig=<path>` and, under a dig, `&under=<that dig's reference>`. */
export const DIG_RETURN_PARAM = "dig";
export const DIG_RETURN_UNDER_PARAM = "under";

/** The page's own address with the way back to one path's dig box, only from what the page already shows (no storage). */
export function publicDigReturnPath(publicRef: string, path: Readonly<{ ref: string; digRef: string | null }> | null): string {
  const base = `/public/debate/${encodeURIComponent(publicRef)}`;
  if (path === null) return base;
  const query = new URLSearchParams({ [DIG_RETURN_PARAM]: path.ref });
  if (path.digRef !== null) query.set(DIG_RETURN_UNDER_PARAM, path.digRef);
  return `${base}?${query.toString()}`;
}

/** r2-21: "Create a free account · Sign in", both carrying the same way back. */
export function signInHrefs(returnPath: string): Readonly<{ signUp: string; signIn: string }> {
  const next = encodeURIComponent(returnPath);
  return { signUp: `/sign-up?next=${next}`, signIn: `/login?next=${next}` };
}
