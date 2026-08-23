"use client";

import { useMemo, useState } from "react";
import {
  beginMfaEnrollment,
  confirmMfaRecoveryCode,
  createMfaRecoveryCodes,
  MfaEnrollmentHttpError,
  verifyMfaTotp
} from "@/lib/mfaEnrollment";
import { totpQrMatrix } from "@/lib/totpQr";

type Provisioning = Readonly<{ secret: string; otpauthUri: string }>;

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
      viewBox={`0 0 ${size} ${size}`}
      width="260"
      height="260"
      role="img"
      aria-label="QR code containing the one-time DebateAIRO authenticator setup key"
      style={{ maxWidth: "100%", height: "auto", background: "white", border: "1px solid var(--line)" }}
    >
      <rect width={size} height={size} fill="white" />
      <path d={path} fill="black" />
    </svg>
  );
}

export default function EnrollMfaPage() {
  const [token, setToken] = useState("");
  const [provisioning, setProvisioning] = useState<Provisioning | null>(null);
  const [totp, setTotp] = useState("");
  const [codes, setCodes] = useState<readonly string[] | null>(null);
  const [typeback, setTypeback] = useState("");
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
      <main className="screen scroll">
        <div className="screenInner medium">
          <h1 className="display sm">Account protected</h1>
          <p className="lede">Your authenticator and newest set of recovery codes are active.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="screen scroll">
      <div className="screenInner medium" style={{ maxWidth: 760 }}>
        <h1 className="display sm">Protect your account</h1>
        <p className="lede" style={{ marginTop: 6 }}>
          An authenticator is required before this account can be used. No phone number or smartphone is required.
        </p>

        {error ? <div className="error" role="alert" style={{ marginTop: 24 }}>{error}</div> : null}

        <section className="miniCard" aria-labelledby="enrolment-link" style={{ marginTop: 24 }}>
          <h2 id="enrolment-link">1. Enter your enrolment token</h2>
          <p className="optionHint">Use the one-time token from your verified-email flow. It is not saved in this browser.</p>
          <label className="fieldGroup" htmlFor="mfa-token">
            Enrolment token
            <input
              id="mfa-token"
              type="password"
              autoComplete="one-time-code"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              disabled={busy || provisioning !== null || codes !== null}
            />
          </label>
          <div className="formActions" style={{ flexWrap: "wrap" }}>
            <button
              type="button"
              className="startBtn"
              disabled={busy || token.trim() === "" || provisioning !== null || codes !== null}
              onClick={() => void perform(async () => setProvisioning(await beginMfaEnrollment(token.trim())))}
            >
              Start authenticator setup
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || token.trim() === "" || provisioning !== null || codes !== null}
              onClick={() => void generateCodes()}
            >
              Recover an interrupted code setup
            </button>
          </div>
        </section>

        {provisioning ? (
          <section className="miniCard" aria-labelledby="authenticator-setup" style={{ marginTop: 20 }}>
            <h2 id="authenticator-setup">2. Add DebateAIRO to any authenticator</h2>
            <p className="optionHint">Scan the QR code, or copy the setup key. This secret is shown only for this setup attempt.</p>
            <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", alignItems: "start" }}>
              <TotpQr uri={provisioning.otpauthUri} />
              <div>
                <label className="fieldGroup" htmlFor="totp-secret">
                  Copyable setup key
                  <input id="totp-secret" value={provisioning.secret} readOnly spellCheck={false} />
                </label>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void navigator.clipboard.writeText(provisioning.secret).then(() => setCopied(true))}
                >
                  Copy setup key
                </button>
                <span role="status" className="optionHint" style={{ marginLeft: 10 }}>{copied ? "Copied" : ""}</span>
              </div>
            </div>
            <label className="fieldGroup" htmlFor="totp-code">
              Current six-digit code
              <input
                id="totp-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={totp}
                onChange={(event) => setTotp(event.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </label>
            <button
              type="button"
              className="startBtn"
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
          </section>
        ) : null}

        {codes ? (
          <section className="miniCard" aria-labelledby="recovery-codes" style={{ marginTop: 20 }}>
            <h2 id="recovery-codes">3. Save these ten recovery codes</h2>
            <p className="optionHint">
              Each code works once. Store them offline. Regenerating replaces this whole set; DebateAIRO cannot show it again.
            </p>
            <ol style={{ columns: "260px 2", paddingLeft: 30 }}>
              {codes.map((code) => <li key={code} style={{ margin: "8px 0" }}><code>{code}</code></li>)}
            </ol>
            <div className="formActions" style={{ flexWrap: "wrap" }}>
              <button type="button" className="btn" onClick={() => window.print()}>Print codes</button>
              <button type="button" className="btn" disabled={busy} onClick={() => void generateCodes()}>
                Replace with a new set
              </button>
            </div>
            <label className="fieldGroup" htmlFor="recovery-typeback">
              Type one code from the newest set to confirm you saved it
              <input
                id="recovery-typeback"
                value={typeback}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setTypeback(event.target.value.toUpperCase())}
              />
            </label>
            <button
              type="button"
              className="startBtn"
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
          </section>
        ) : null}
      </div>
    </main>
  );
}
