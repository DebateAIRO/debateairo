"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSelectedAuthCatalog } from "@/components/AuthShell";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import {
  beginMfaEnrollment,
  confirmMfaRecoveryCode,
  consumeMailedEnrollmentTokenFromUrl,
  createMfaRecoveryCodes,
  MfaEnrollmentHttpError,
  verifyMfaEmail,
  verifyMfaTotp
} from "@/lib/mfaEnrollment";
import { totpQrMatrix } from "@/lib/totpQr";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

type Provisioning = Readonly<{ secret: string; otpauthUri: string }>;

/* The document shows the Base32 seed in groups of four. Only the display is
   grouped — Copy setup key still yields the unspaced secret. */
const groupedSecret = (secret: string) => secret.replace(/(.{4})(?=.)/g, "$1 ");

function friendlyError(error: unknown, catalog: MessageCatalog): string {
  if (!(error instanceof MfaEnrollmentHttpError)) return t(catalog, "auth.enroll.serviceUnavailable");
  switch (error.code) {
    case "MFA_TOTP_INVALID": return t(catalog, "auth.enroll.invalidTotp");
    case "MFA_TOTP_REPLAYED": return t(catalog, "auth.enroll.replayedTotp");
    case "MFA_RATE_LIMITED": return t(catalog, "auth.enroll.rateLimited");
    case "MFA_RECOVERY_CONFIRMATION_INVALID": return t(catalog, "auth.enroll.recoveryMismatch");
    case "MFA_ENROLLMENT_STATE_INVALID": return t(catalog, "auth.enroll.stateComplete");
    default: return t(catalog, "auth.enroll.invalidLink");
  }
}

function TotpQr({ uri, catalog }: { uri: string; catalog: MessageCatalog }) {
  const matrix = useMemo(() => {
    try {
      return totpQrMatrix(uri);
    } catch {
      return null;
    }
  }, [uri]);
  if (matrix === null) {
    return <p role="status">{t(catalog, "auth.enroll.qrUnavailable")}</p>;
  }
  const quiet = 4;
  const size = matrix.length + quiet * 2;
  const path = matrix.flatMap((row, y) => row.flatMap((dark, x) =>
    dark ? [`M${x + quiet} ${y + quiet}h1v1h-1z`] : [])).join("");
  return (
    <svg
      className="mfaQr"
      viewBox={`0 0 ${size} ${size}`}
      width="170"
      height="170"
      role="img"
      aria-label={t(catalog, "auth.enroll.qrAria")}
    >
      <rect width={size} height={size} fill="var(--qr-paper)" />
      <path d={path} fill="var(--qr-ink)" />
    </svg>
  );
}

export default function EnrollMfaPage() {
  const { locale } = useChromeI18n();
  const catalog = useSelectedAuthCatalog(locale);
  const initializationStarted = useRef(false);
  const [token, setToken] = useState("");
  const [provisioning, setProvisioning] = useState<Provisioning | null>(null);
  const [totp, setTotp] = useState("");
  const [codes, setCodes] = useState<readonly string[] | null>(null);
  const [typeback, setTypeback] = useState("");
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (initializationStarted.current) return;
    initializationStarted.current = true;
    void consumeMailedEnrollmentTokenFromUrl(
      window.location,
      window.history,
      async (mailedToken) => {
        try {
          await verifyMfaEmail(mailedToken);
        } catch (failure) {
          // A response may have been lost after S3 consumed the token. The S4
          // begin/generate calls still require its exact, unexpired binding, so
          // retrying there is both recoverable and fail-closed.
          if (!(failure instanceof MfaEnrollmentHttpError)
            || failure.code !== "VERIFICATION_TOKEN_INVALID") throw failure;
        }
      }
    ).then(async (mailedToken) => {
      if (mailedToken === null) {
        throw new MfaEnrollmentHttpError("MFA_ENROLLMENT_INVALID", 400);
      }
      setToken(mailedToken);
      try {
        setProvisioning(await beginMfaEnrollment(mailedToken));
      } catch (failure) {
        if (!(failure instanceof MfaEnrollmentHttpError)
          || failure.code !== "MFA_ENROLLMENT_STATE_INVALID") throw failure;
        setCodes(await createMfaRecoveryCodes(mailedToken));
      }
    }).catch((failure: unknown) => {
      setError(friendlyError(failure, catalog));
    }).finally(() => {
      setBusy(false);
    });
  }, []);

  async function perform(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (failure) {
      setError(friendlyError(failure, catalog));
    } finally {
      setBusy(false);
    }
  }

  const generateCodes = () => perform(async () => {
    const generated = await createMfaRecoveryCodes(token.trim());
    setProvisioning(null); // never redisplay the shared TOTP secret after proof
    setCodes(generated);
    setTypeback("");
  });

  if (active) {
    return (
      <main className="mfaScreen">
        <div className="mfaCard">
          <div className="mfaBody">
            <p className="mfaEyebrow">{t(catalog, "auth.enroll.mandatoryMfa")}</p>
            <h1 className="mfaTitle">{t(catalog, "auth.enroll.accountProtected")}</h1>
            <p className="mfaLede">{t(catalog, "auth.enroll.activeDescription")}</p>
          </div>
        </div>
      </main>
    );
  }

  const emailDone = !busy && token !== "";
  const step2State = provisioning ? "active" : emailDone ? "done" : "pending";
  const step3State = codes ? "active" : "pending";

  return (
    <main className="mfaScreen">
      <div className="mfaCard">
        <div className="mfaBody">
          <p className="mfaEyebrow">{t(catalog, "auth.enroll.mandatoryMfa")}</p>
          <h1 className="mfaTitle">{t(catalog, "auth.enroll.protectAccount")}</h1>
          <p className="mfaLede">
            {t(catalog, "auth.enroll.requiredDescription")}
          </p>

          {error ? <div className="mfaAlert" role="alert">{error}</div> : null}

          <section className="mfaStep" data-state="done" aria-labelledby="enrolment-link">
            <span className="mfaStepNum" data-state={emailDone ? "done" : "active"} aria-hidden>1</span>
            <div>
              <h2 className="mfaStepTitle" id="enrolment-link">{t(catalog, "auth.enroll.verifyMailedLink")}</h2>
              <p className="mfaStepHint">
                {busy && token === ""
                  ? t(catalog, "auth.enroll.verifyingEmail")
                  : token === ""
                    ? t(catalog, "auth.enroll.openPrivateLink")
                    : t(catalog, "auth.enroll.emailVerified")}
              </p>
            </div>
            <span className="mfaSpacer" />
            {emailDone ? <p className="mfaStepDone">{t(catalog, "auth.enroll.done")}</p> : null}
          </section>

          <section className="mfaStep" aria-labelledby="authenticator-setup">
            <div className="mfaStepHead">
              <span className="mfaStepNum" data-state={step2State} aria-hidden>2</span>
              <h2 className="mfaStepTitle" id="authenticator-setup">{t(catalog, "auth.enroll.addToAuthenticator")}</h2>
            </div>
            {provisioning ? (
              <div className="mfaSetup">
                <TotpQr uri={provisioning.otpauthUri} catalog={catalog} />
                <div className="mfaSetupBody">
                  <p className="mfaSetupHint">
                    {t(catalog, "auth.enroll.scanQr")}
                  </p>
                  <label className="srOnly" htmlFor="totp-secret">{t(catalog, "auth.enroll.copyableSetupKey")}</label>
                  <input
                    id="totp-secret"
                    className="mfaSecret"
                    value={groupedSecret(provisioning.secret)}
                    readOnly
                    spellCheck={false}
                  />
                  <div className="mfaGhostRow">
                    <button
                      type="button"
                      className="mfaGhost"
                      onClick={() => void navigator.clipboard.writeText(provisioning.secret).then(() => setCopied(true))}
                    >
                      {t(catalog, "auth.enroll.copySetupKey")}
                    </button>
                    <span className="mfaCopied" role="status">{copied ? t(catalog, "auth.enroll.copied") : ""}</span>
                  </div>
                  <label className="mfaCodeLabel" htmlFor="totp-code">{t(catalog, "auth.enroll.currentSixDigitCode")}</label>
                  <div className="mfaCodeRow">
                    <input
                      id="totp-code"
                      className="mfaCodeInput"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      placeholder="000000"
                      value={totp}
                      onChange={(event) => setTotp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                    <button
                      type="button"
                      className="mfaPrimary"
                      disabled={busy || !/^\d{6}$/.test(totp)}
                      onClick={() => void perform(async () => {
                        await verifyMfaTotp(token.trim(), totp);
                        setTotp("");
                        setProvisioning(null);
                        await generateCodes();
                      })}
                    >
                      {t(catalog, "auth.enroll.verifyAndCreateRecoveryCodes")}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mfaStepHint mfaStepBody">
                {codes
                  ? t(catalog, "auth.enroll.authenticatorVerified")
                  : t(catalog, "auth.enroll.waitingForVerifiedLink")}
              </p>
            )}
          </section>

          <section className="mfaStep" aria-labelledby="recovery-codes">
            <div className="mfaStepHead">
              <span className="mfaStepNum" data-state={step3State} aria-hidden>3</span>
              <h2 className="mfaStepTitle" id="recovery-codes">{t(catalog, "auth.enroll.saveRecoveryCodes")}</h2>
            </div>
            <p className="mfaStepHint mfaStepBody">
              {t(catalog, "auth.enroll.recoveryCodesDescription")}
            </p>
            {codes ? (
              <>
                <ul className="mfaCodes">
                  {codes.map((code) => <li key={code}>{code}</li>)}
                </ul>
                <div className="mfaCodeActions">
                  <button type="button" className="mfaGhost" onClick={() => window.print()}>
                    {t(catalog, "auth.enroll.printCodes")}
                  </button>
                  <button type="button" className="mfaGhost" disabled={busy} onClick={() => void generateCodes()}>
                    {t(catalog, "auth.enroll.replaceCodes")}
                  </button>
                  <label className="srOnly" htmlFor="recovery-typeback">
                    {t(catalog, "auth.enroll.typeOneCodeLabel")}
                  </label>
                  <input
                    id="recovery-typeback"
                    className="mfaTypeback"
                    placeholder={t(catalog, "auth.enroll.typeOneCodePlaceholder")}
                    value={typeback}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => setTypeback(event.target.value.toUpperCase())}
                  />
                  <button
                    type="button"
                    className="mfaActivate"
                    disabled={busy || typeback.trim() === ""}
                    onClick={() => void perform(async () => {
                      await confirmMfaRecoveryCode(token.trim(), typeback);
                      setCodes(null);
                      setToken("");
                      setTypeback("");
                      setActive(true);
                    })}
                  >
                    {t(catalog, "auth.enroll.activateAccount")}
                  </button>
                </div>
              </>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
