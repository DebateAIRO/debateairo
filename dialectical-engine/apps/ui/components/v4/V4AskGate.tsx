"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LegalAcceptGate } from "@/components/billing/LegalAcceptGate";
import { ageConfirmationHref, ageConfirmationRequired } from "@/lib/ageConfirmation";
import { contractClient, validateSession } from "@/lib/api";
import type { MessageCatalog } from "@/lib/i18n/translate";

/*
 * The ask page's session (owner picks ask-d1 D and ask-f16, 3 Nov 2026). The first frame is the real page — header,
 * title, box — for everyone: no "Checking session…" screen, and a signed-out visitor is not sent away. The page learns
 * the session beside it:
 *  - CHECKING until the session read answers; IN once it did and the one-time age check is not owed (owed: off to that
 *    check with the way back, exactly as AuthGate does); OUT when there is no session (or it could not be read);
 *  - for a signed-in person who owes the Terms or Privacy acceptance (paid plans L4), the page hides — kept, so nothing
 *    typed is lost — while the accept screen shows, and comes back once accepted. A failed status read lets the page
 *    through (ruling Q-10, as LegalAcceptGate does).
 * What Next does for a signed-out person (the sign-in panel) belongs to the step that starts the debate.
 */

export type V4Session = "CHECKING" | "IN" | "OUT";

/** Renders nothing; tells the page the accept screen has cleared (LegalAcceptGate renders its children once it has). */
function AcceptCleared({ onCleared }: Readonly<{ onCleared: () => void }>) {
  useEffect(() => { onCleared(); }, [onCleared]);
  return null;
}

export function V4AskGate({ catalog, locale, children }: Readonly<{
  /** newDebate.* (the accept screen's own words, as AuthGate passes them). */
  catalog: MessageCatalog;
  locale: string;
  children: (session: V4Session) => ReactNode;
}>) {
  const [session, setSession] = useState<V4Session>("CHECKING");
  const [legal, setLegal] = useState<"UNKNOWN" | "CLEAR" | "OWED">("UNKNOWN");

  useEffect(() => {
    let active = true;
    // Inside the promise chain on purpose: a client that throws at once is a failed read (OUT), never a crash.
    void Promise.resolve().then(() => validateSession()).then(
      async () => {
        if (await ageConfirmationRequired()) {
          window.location.replace(ageConfirmationHref(`${window.location.pathname}${window.location.search}`));
          return;
        }
        if (active) setSession("IN");
      },
      () => { if (active) setSession("OUT"); }
    );
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (session !== "IN") return;
    let active = true;
    void Promise.resolve().then(() => contractClient.getLegalStatus(locale)).then(
      (status) => { if (active) setLegal(status.must_accept.length === 0 ? "CLEAR" : "OWED"); },
      () => { if (active) setLegal("CLEAR"); }
    );
    return () => { active = false; };
  }, [session, locale]);

  return (
    <>
      <div className="v4AskGate" hidden={legal === "OWED"}>{children(session)}</div>
      {legal === "OWED" ? (
        <LegalAcceptGate catalog={catalog}>
          <AcceptCleared onCleared={() => setLegal("CLEAR")} />
        </LegalAcceptGate>
      ) : null}
    </>
  );
}
