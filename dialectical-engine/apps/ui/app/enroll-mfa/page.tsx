"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

type Provisioning = Readonly<{ secret: string; otpauthUri: string }>;

/* The document shows the Base32 seed in groups of four. Only the display is
   grouped — Copy setup key still yields the unspaced secret. */
const groupedSecret = (secret: string) => secret.replace(/(.{4})(?=.)/g, "$1 ");

function friendlyError(error: unknown): string {
  if (!(error instanceof MfaEnrollmentHttpError)) return "The enrolment service is temporarily unavailable.";
  switch (error.code) {
    case "MFA_TOTP_INVALID": return "That code was not accepted. Check the device clock and try the current code.";
    case "MFA_TOTP_REPLAYED": return "That code was already used. Wait for the next code and try again.";
    case "MFA_RATE_LIMITED": return "Too many attempts. Wait five minutes, then try again.";
    case "MFA_RECOVERY_CONFIRMATION_INVALID": return "That recovery code does not match the newest set.";
    case "MFA_ENROLLMENT_STATE_INVALID": return "This step is already complete. Continue to recovery codes below.";
    default: return "This enrolment link is invalid or expired.";
  }
}

function TotpQr({ uri }: { uri: string }) {
  const matrix = useMemo(() => {
    try {
      return totpQrMatrix(uri);
    } catch {
      return null;
    }
  }, [uri]);
  if (matrix === null) {
    return <p role="status">QR unavailable. Use the copyable setup key instead.</p>;
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
      aria-label="QR code containing the one-time DebateAIRO authenticator setup key"
    >
      <rect width={size} height={size} fill="var(--qr-paper)" />
      <path d={path} fill="var(--qr-ink)" />
    </svg>
  );
}

export default function EnrollMfaPage() {
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
      setError(friendlyError(failure));
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
      setError(friendlyError(failure));
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
            <p className="mfaEyebrow">MANDATORY MFA</p>
            <h1 className="mfaTitle">Account protected</h1>
            <p className="mfaLede">Your authenticator and newest set of recovery codes are active.</p>
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
          <p className="mfaEyebrow">MANDATORY MFA</p>
          <h1 className="mfaTitle">Protect your account</h1>
          <p className="mfaLede">
            An authenticator is required before this account can be used. No phone number or smartphone is required.
          </p>

          {error ? <div className="mfaAlert" role="alert">{error}</div> : null}

          <section className="mfaStep" data-state="done" aria-labelledby="enrolment-link">
            <span className="mfaStepNum" data-state={emailDone ? "done" : "active"} aria-hidden>1</span>
            <div>
              <h2 className="mfaStepTitle" id="enrolment-link">Verify the mailed link</h2>
              <p className="mfaStepHint">
                {busy && token === ""
                  ? "Verifying your email and preparing authenticator setup…"
                  : token === ""
                    ? "Open the private link from your verification email to continue."
                    : "Email verified. The one-time token was removed from the address bar and is not saved in this browser."}
              </p>
            </div>
            <span className="mfaSpacer" />
            {emailDone ? <p className="mfaStepDone">✓ Done</p> : null}
          </section>

          <section className="mfaStep" aria-labelledby="authenticator-setup">
            <div className="mfaStepHead">
              <span className="mfaStepNum" data-state={step2State} aria-hidden>2</span>
              <h2 className="mfaStepTitle" id="authenticator-setup">Add DebateAIRO to any authenticator</h2>
            </div>
            {provisioning ? (
              <div className="mfaSetup">
                <TotpQr uri={provisioning.otpauthUri} />
                <div className="mfaSetupBody">
                  <p className="mfaSetupHint">
                    Scan the QR code, or copy the setup key. This secret is shown only for this setup attempt.
                  </p>
                  <label className="srOnly" htmlFor="totp-secret">Copyable setup key</label>
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
                      Copy setup key
                    </button>
                    <span className="mfaCopied" role="status">{copied ? "Copied" : ""}</span>
                  </div>
                  <label className="mfaCodeLabel" htmlFor="totp-code">Current six-digit code</label>
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
                      Verify and create recovery codes
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mfaStepHint mfaStepBody">
                {codes
                  ? "Authenticator verified. The setup secret is not shown again."
                  : "Waiting for the verified link before a setup secret can be issued."}
              </p>
            )}
          </section>

          <section className="mfaStep" aria-labelledby="recovery-codes">
            <div className="mfaStepHead">
              <span className="mfaStepNum" data-state={step3State} aria-hidden>3</span>
              <h2 className="mfaStepTitle" id="recovery-codes">Save these ten recovery codes</h2>
            </div>
            <p className="mfaStepHint mfaStepBody">
              Each code works once. Store them offline. Regenerating replaces this whole set; DebateAIRO cannot
              show it again.
            </p>
            {codes ? (
              <>
                <ul className="mfaCodes">
                  {codes.map((code) => <li key={code}>{code}</li>)}
                </ul>
                <div className="mfaCodeActions">
                  <button type="button" className="mfaGhost" onClick={() => window.print()}>Print codes</button>
                  <button type="button" className="mfaGhost" disabled={busy} onClick={() => void generateCodes()}>
                    Replace with a new set
                  </button>
                  <label className="srOnly" htmlFor="recovery-typeback">
                    Type one code from the newest set to confirm you saved it
                  </label>
                  <input
                    id="recovery-typeback"
                    className="mfaTypeback"
                    placeholder="Type one code to confirm you saved it"
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
                    Activate account
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
