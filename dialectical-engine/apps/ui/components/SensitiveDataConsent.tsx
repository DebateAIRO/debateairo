"use client";

import * as React from "react";
import { ContractHttpError, SENSITIVE_DATA_CONSENT_REQUIRED, type ContractClient } from "@debateai/contract";
import { backdropCloseHandler, useModalSurface } from "@/components/consent/modalSemantics";
import { useHideOutside } from "@/components/dialogSurface";
import { contractClient } from "@/lib/api";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

type ConsentClient = Pick<ContractClient, "readSensitiveDataConsent" | "giveSensitiveDataConsent">;

/** True when a debate was refused because the account has not agreed yet. */
export function isSensitiveDataConsentRefusal(failure: unknown): boolean {
  return failure instanceof ContractHttpError && failure.status === 403
    && failure.serverCode === SENSITIVE_DATA_CONSENT_REQUIRED;
}

/**
 * Sensitive-data consent (V's ruling of 2026-09-29). Before the first debate a person starts,
 * they agree — once — that the sensitive information they choose to put in their own questions
 * may be processed to run their debates. Agree, and the debate starts. Decline, and it does not;
 * the screen comes back the next time they try. The API enforces the same rule on
 * `POST /v1/asks`, so this screen is the explanation, never the only lock.
 *
 * `ensureConsent()` resolves `true` when the account has agreed (now or before) and `false`
 * when the person declined or the answer could not be saved. `dialog` is rendered by the caller.
 *
 * `returnFocusRef` names where keyboard focus goes when the screen closes and the control that
 * opened it can no longer hold focus: a press of Start disables Start for as long as the screen is
 * up, so the browser has already dropped focus to the page. Callers pass their question field, so
 * declining (or Escape) leaves the person where they can edit the question.
 */
export function useSensitiveDataConsent({
  catalog,
  locale,
  client = contractClient,
  returnFocusRef
}: Readonly<{
  catalog: MessageCatalog;
  locale: string;
  client?: ConsentClient;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}>): Readonly<{
  ensureConsent: (options?: Readonly<{ known?: "required" }>) => Promise<boolean>;
  declined: boolean;
  dialog: React.ReactElement | null;
}> {
  const given = React.useRef(false);
  const pending = React.useRef<((agreed: boolean) => void) | null>(null);
  const [open, setOpen] = React.useState(false);
  const [declined, setDeclined] = React.useState(false);

  const settle = (agreed: boolean): void => {
    setOpen(false);
    setDeclined(!agreed);
    const resolve = pending.current;
    pending.current = null;
    resolve?.(agreed);
  };

  const ensureConsent = async (options?: Readonly<{ known?: "required" }>): Promise<boolean> => {
    if (options?.known === "required") given.current = false;
    if (given.current) return true;
    if (options?.known !== "required") {
      try {
        if ((await client.readSensitiveDataConsent()).status === "given") {
          given.current = true;
          return true;
        }
      } catch {
        // Unknown: show the screen. Agreeing again changes nothing on the server.
      }
    }
    setDeclined(false);
    setOpen(true);
    return new Promise<boolean>((resolve) => { pending.current = resolve; });
  };

  const agree = async (): Promise<void> => {
    await client.giveSensitiveDataConsent(locale);
    given.current = true;
    settle(true);
  };

  const dialog = open ? (
    <SensitiveDataConsentDialog
      catalog={catalog}
      onAgree={agree}
      onDecline={() => settle(false)}
      returnFocusRef={returnFocusRef}
    />
  ) : null;
  return { ensureConsent, declined, dialog };
}

export function SensitiveDataConsentDialog({
  catalog,
  onAgree,
  onDecline,
  returnFocusRef
}: Readonly<{
  catalog: MessageCatalog;
  onAgree: () => Promise<void>;
  onDecline: () => void;
  /** Where focus goes on close when the opener can no longer hold it (see the hook above). */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}>): React.ReactElement {
  const scrimRef = React.useRef<HTMLDivElement | null>(null);
  const dialogRef = React.useRef<HTMLElement | null>(null);
  const agreeRef = React.useRef<HTMLElement | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  // Esc, the backdrop and "I don't agree" all decline: no dismissal can agree on anyone's behalf.
  useHideOutside(dialogRef);
  useModalSurface(true, { containerRef: dialogRef, initialFocusRef: agreeRef, onClose: onDecline, returnFocusRef });

  async function agree(): Promise<void> {
    setBusy(true);
    setFailed(false);
    try {
      await onAgree();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <div
      className="policyScrim"
      ref={scrimRef}
      onClick={(event) => backdropCloseHandler(scrimRef.current, onDecline)(event)}
    >
      <div
        className="policyBezel sensitiveConsent"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sensitive-consent-title"
        aria-describedby="sensitive-consent-lede"
        data-dialog="sensitive-data-consent"
        ref={(node) => { dialogRef.current = node; }}
      >
        <div className="policyCore">
          <span className="policyTab" aria-hidden="true" />
          <div className="policyHead">
            <div className="policyHeadText">
              <div className="policyEyebrow">{t(catalog, "home.sensitiveConsent.eyebrow")}</div>
              <h2 id="sensitive-consent-title" className="policyTitle">
                {t(catalog, "home.sensitiveConsent.title")}
              </h2>
              <p id="sensitive-consent-lede" className="policyLede">
                {t(catalog, "home.sensitiveConsent.lede")}
              </p>
            </div>
          </div>
          <div className="sensitiveConsentBody">
            <ul className="sensitiveConsentPoints">
              <li>{t(catalog, "home.sensitiveConsent.pointPurpose")}</li>
              <li>{t(catalog, "home.sensitiveConsent.pointModels")}</li>
              <li>{t(catalog, "home.sensitiveConsent.pointOthers")}</li>
              <li>{t(catalog, "home.sensitiveConsent.pointDelete")}</li>
            </ul>
            <p className="sensitiveConsentStatement">{t(catalog, "home.sensitiveConsent.statement")}</p>
            <a className="sensitiveConsentLink" href="/privacy" target="_blank" rel="noopener">
              {t(catalog, "home.sensitiveConsent.privacyLink")}
            </a>
            {failed ? (
              <div className="authAlert" role="alert">{t(catalog, "home.sensitiveConsent.failed")}</div>
            ) : null}
          </div>
          <div className="policyFoot">
            <span className="policyFootSpacer" />
            <button type="button" className="sensitiveConsentDecline" onClick={onDecline} disabled={busy}>
              {t(catalog, "home.sensitiveConsent.decline")}
            </button>
            <button
              type="button"
              className="policyPrimary"
              onClick={() => { void agree(); }}
              disabled={busy}
              ref={(node) => { agreeRef.current = node; }}
            >
              {t(catalog, "home.sensitiveConsent.agree")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
