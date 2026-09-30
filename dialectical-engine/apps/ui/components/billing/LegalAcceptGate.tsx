"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ContractHttpError, type ContractClient } from "@debateai/contract";
import { PrivacyPolicyModal } from "@/components/consent/PrivacyPolicyModal";
import { TermsOfServiceModal } from "@/components/consent/TermsOfServiceModal";
import { useLegalDocument } from "@/components/consent/useLegalDocument";
import { clearStoredSupportConversation } from "@/components/support/conversation";
import { contractClient } from "@/lib/api";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

type GateClient = Pick<ContractClient, "getLegalStatus" | "acceptLegal" | "logout">;
type Kind = "TERMS" | "PRIVACY";
type GateState = "checking" | "clear" | "required";
type GateError = "failed" | "stale" | "signOutFailed";

/**
 * Paid plans L4 (spec 2026-09-29 §2.3.2). After sign-in, a person whose last acceptance of the Terms
 * or Privacy Policy is below the manifest's re-acceptance floor, or who has no record of it (in hosted
 * mode; in local mode only when the manifest's floor is set), must read the current version to its
 * end and accept it before the page shows. The server decides which documents are owed (the status
 * read); this screen only shows what it answers. The server is the gate
 * that matters — billing routes refuse LEGAL_REACCEPTANCE_REQUIRED — so a failed STATUS read lets the
 * page through rather than lock a person out of their own debates.
 *
 * TWO WAYS OUT. Declining new terms never costs a person their account rights: the screen offers
 * sign-out and a link to /settings, which AuthGate never covers (legalGate={false}), so account
 * deletion, consent withdrawal and sign-out stay reachable without accepting anything.
 */
export function LegalAcceptGate({
  catalog,
  children,
  client = contractClient,
  onSignedOut = () => window.location.assign("/login")
}: Readonly<{
  catalog?: MessageCatalog | undefined;
  children: ReactNode;
  client?: GateClient;
  /** Where a signed-out person goes; a prop so render tests never navigate jsdom. */
  onSignedOut?: () => void;
}>) {
  const { locale } = useChromeI18n();
  const terms = useLegalDocument("terms");
  const privacy = useLegalDocument("privacy");
  const [state, setState] = useState<GateState>("checking");
  const [required, setRequired] = useState<readonly Kind[]>([]);
  const [read, setRead] = useState<ReadonlySet<Kind>>(new Set());
  const [open, setOpen] = useState<Kind | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<GateError | null>(null);

  useEffect(() => {
    let active = true;
    // Promise.resolve().then(...) turns a synchronous throw (a composition without the method)
    // into the same "read failed" path as a network error.
    void Promise.resolve().then(() => client.getLegalStatus(locale)).then((status) => {
      if (!active) return;
      const kinds = status.must_accept.map((document) => document.kind);
      setRequired(kinds);
      setState(kinds.length === 0 ? "clear" : "required");
      // Ruling Q-10: a failed read lets the page through (fail open); the billing routes' own
      // LEGAL_REACCEPTANCE_REQUIRED refusal is the guard that cannot be skipped.
    }, () => { if (active) setState("clear"); });
    return () => { active = false; };
  }, [client, locale]);

  if (state === "clear") return <>{children}</>;
  if (state === "checking") {
    return <div className="screen scroll"><div className="screenInner narrow"><p className="muted">{t(catalog, "newDebate.checkingSession")}</p></div></div>;
  }

  const allRead = required.every((kind) => read.has(kind));
  const acknowledge = (kind: Kind) => () => {
    setRead(new Set([...read, kind]));
    setOpen(null);
  };

  async function acceptAll(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await client.acceptLegal({
        documents: required.map((kind) => {
          const document = kind === "TERMS" ? terms : privacy;
          return { kind, version: document.version, sha256: document.sha256 };
        }),
        locale
      });
      const after = await client.getLegalStatus(locale);
      if (after.must_accept.length === 0) setState("clear");
      else setRequired(after.must_accept.map((document) => document.kind));
    } catch (failure) {
      setError(failure instanceof ContractHttpError && failure.serverCode === "LEGAL_DOCUMENT_STALE" ? "stale" : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function signOut(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await client.logout();
      // DL3-F3, the same clear SessionControls runs: the support transcript never outlives the session.
      clearStoredSupportConversation();
      onSignedOut();
    } catch {
      setError("signOutFailed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen scroll">
      <div className="screenInner narrow" role="region" aria-labelledby="legal-gate-title">
        <p className="eyebrow">{t(catalog, "newDebate.legalGate.eyebrow")}</p>
        <h1 id="legal-gate-title">{t(catalog, "newDebate.legalGate.title")}</h1>
        <p>{t(catalog, "newDebate.legalGate.body")}</p>
        {error === null ? null : (
          <div className="authAlert" role="alert">
            {error === "stale" ? t(catalog, "newDebate.legalGate.stale")
              : error === "signOutFailed" ? t(catalog, "newDebate.legalGate.signOutFailed")
                : t(catalog, "newDebate.legalGate.failed")}
          </div>
        )}
        <ul className="legalGateList">
          {required.includes("TERMS") ? (
            <li>
              <button type="button" className="consentPolicyLink" onClick={() => setOpen("TERMS")}>
                {t(catalog, "newDebate.legalGate.readTerms")}
              </button>
              {read.has("TERMS") ? <span className="muted"> {t(catalog, "newDebate.legalGate.done")}</span> : null}
            </li>
          ) : null}
          {required.includes("PRIVACY") ? (
            <li>
              <button type="button" className="consentPolicyLink" onClick={() => setOpen("PRIVACY")}>
                {t(catalog, "newDebate.legalGate.readPrivacy")}
              </button>
              {read.has("PRIVACY") ? <span className="muted"> {t(catalog, "newDebate.legalGate.done")}</span> : null}
            </li>
          ) : null}
        </ul>
        <button className="authPrimary" type="button" disabled={!allRead || busy} onClick={() => void acceptAll()}>
          {busy ? t(catalog, "newDebate.legalGate.accepting") : t(catalog, "newDebate.legalGate.accept")}
        </button>
        <div className="legalGateExits">
          <Link href="/settings">{t(catalog, "newDebate.legalGate.manageAccount")}</Link>
          <button type="button" className="authTextButton" disabled={busy} onClick={() => void signOut()}>
            {t(catalog, "newDebate.legalGate.signOut")}
          </button>
        </div>
      </div>
      {open === "TERMS" ? (
        <TermsOfServiceModal open mode="consent" onClose={() => setOpen(null)} onAcknowledge={acknowledge("TERMS")} />
      ) : null}
      {open === "PRIVACY" ? (
        <PrivacyPolicyModal open mode="consent" onClose={() => setOpen(null)} onAcknowledge={acknowledge("PRIVACY")} />
      ) : null}
    </div>
  );
}
