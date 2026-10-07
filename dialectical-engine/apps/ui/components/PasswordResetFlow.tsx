"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ContractHttpError, createPasswordResetClient, type PasswordResetClient, type PasswordResetState } from "@debateai/contract";
import { AuthShell } from "@/components/AuthShell";
import { API_BASE } from "@/lib/api";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import english from "@/messages/en/password-reset.json";
import mfaEnglish from "@/messages/en/mfa-recovery.json";
import mfaRomanian from "@/messages/ro/mfa-recovery.json";

const browserClient = createPasswordResetClient(fetch, API_BASE);
type Phase = "request" | "sent" | "email_link" | "cancel_link" | "password_required" | "completed" | "cancelled" | "refused" | "expired";
const navigateToRecovery = () => { window.location.assign("/recover"); };
const navigateToAuthenticatorRecovery = () => { window.location.assign("/recover-authenticator"); };

export function PasswordResetFlow({ catalog = english, locale = "en", client = browserClient, onRecoverAccess = navigateToRecovery, onRecoverAuthenticator = navigateToAuthenticatorRecovery }: Readonly<{
  catalog?: MessageCatalog; locale?: "en" | "ro"; client?: PasswordResetClient; onRecoverAccess?: () => void; onRecoverAuthenticator?: () => void;
}>) {
  const [phase, setPhase] = useState<Phase>("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [code, setCode] = useState("");
  const [minimum, setMinimum] = useState(8);
  const [maximum, setMaximum] = useState<number | null>(1024);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [switchConfirmation, setSwitchConfirmation] = useState<"saved" | "known" | null>(null);
  const link = useRef<string | null>(null), cancellation = useRef<string | null>(null), mounted = useRef(true), inFlight = useRef(false), switchingToRecovery = useRef(false);
  const switchingMethod = useRef<"saved" | "known">("saved");
  const text = (key: string, values: Record<string, string | number> = {}) => t(catalog, key, values);
  const methodText = (key: string) => t(locale === "ro" ? mfaRomanian : mfaEnglish, key);

  function clearCredentials() { setPassword(""); setConfirmation(""); setCode(""); }
  function clearSecrets() { link.current = null; cancellation.current = null; clearCredentials(); setSwitchConfirmation(null); }
  function apply(state: PasswordResetState) {
    link.current = null;
    cancellation.current = null;
    setMinimum(state.password_min_length);
    setMaximum(state.password_max_length ?? 1024);
    setExpiresAt(state.expires_at);
    setPhase(state.status);
    setUnknown(false);
    if (state.status !== "password_required") clearSecrets();
  }
  function recoverAccessAfterClosure() {
    clearSecrets();
    switchingToRecovery.current = false;
    setUnknown(false);
    setPhase("cancelled");
    setSwitchConfirmation(null);
    if (switchingMethod.current === "known") onRecoverAuthenticator(); else onRecoverAccess();
  }
  function switchToRecovery(method: "saved" | "known") {
    if (busy || unknown || inFlight.current) return;
    switchingToRecovery.current = true;
    switchingMethod.current = method;
    clearCredentials();
    void perform(async () => {
      if (phase === "email_link") {
        if (link.current === null) throw new Error("PASSWORD_RESET_LINK_MISSING");
        const state = await client.exchange(link.current);
        if (!mounted.current) return;
        apply(state);
      }
      if (phase === "cancel_link") {
        if (cancellation.current === null) throw new Error("PASSWORD_RESET_LINK_MISSING");
        await client.cancel(cancellation.current);
      } else await client.cancelCurrent();
      if (mounted.current) recoverAccessAfterClosure();
    });
  }

  useEffect(() => {
    mounted.current = true;
    const fragment = location.hash.slice(1);
    if (fragment) {
      history.replaceState(null, "", location.pathname + location.search);
      const entries = [...new URLSearchParams(fragment).entries()];
      if (entries.length === 1 && /^[A-Za-z0-9_-]{43}$/.test(entries[0]![1])) {
        const [name, value] = entries[0]!;
        if (name === "token") { link.current = value; setPhase("email_link"); }
        else if (name === "cancel") { cancellation.current = value; setPhase("cancel_link"); }
        else setPhase("expired");
      } else setPhase("expired");
    } else if (link.current === null && cancellation.current === null) {
      void client.status().then(state => { if (mounted.current) apply(state); }).catch(() => {});
    }
    return () => {
      mounted.current = false;
      // React's effect rehearsal must not destroy a link before the real mount.
      queueMicrotask(() => { if (!mounted.current) { link.current = null; cancellation.current = null; } });
    };
  }, [client]);

  useEffect(() => {
    if (phase !== "password_required" || expiresAt === null) return;
    const remaining = Date.parse(expiresAt) - Date.now();
    if (remaining > 2_147_483_647) return;
    const timer = setTimeout(() => { clearSecrets(); setPhase("expired"); setUnknown(false); setError(null); }, Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [phase, expiresAt]);

  async function perform(operation: () => Promise<void>, reconciliation = false) {
    if (inFlight.current || (unknown && !reconciliation)) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try { await operation(); }
    catch (failure) {
      if (!mounted.current) return;
      const status = failure instanceof ContractHttpError ? failure.status : 0;
      const serverCode = failure instanceof ContractHttpError ? failure.serverCode : null;
      if (status === 401 && serverCode === "PASSWORD_RESET_PROOF_INVALID" && phase === "password_required") {
        setCode(""); setError(text("error.code"));
      } else if (status === 400) {
        setCode(""); setError(text("error.password"));
      } else if (reconciliation && switchingToRecovery.current && (status === 401 || status === 410)) {
        clearCredentials(); setUnknown(true); setError(text("fallback.unknown"));
      } else if (status === 401 || status === 403 || status === 410) {
        clearSecrets(); switchingToRecovery.current = false; setUnknown(false); setPhase("expired");
      } else if (status === 429) {
        setCode(""); setError(text("error.rate"));
      } else {
        clearCredentials(); setUnknown(true); setError(text("error.unknown"));
      }
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }

  function submitReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || unknown) return;
    if (password !== confirmation) { setError(text("password.mismatch")); return; }
    if (password.length < minimum || (maximum !== null && password.length > maximum)) { setError(text("error.password")); return; }
    if (!/^[0-9]{6}$/.test(code)) { setError(text("error.code.format")); return; }
    void perform(async () => {
      await client.complete(password, code);
      if (mounted.current) { clearSecrets(); setPhase("completed"); }
    });
  }

  const prefix = phase === "email_link" ? "link" : phase === "password_required" ? "password" : phase === "completed" ? "done" : phase === "cancel_link" ? "cancel" : phase === "refused" ? "expired" : phase;
  const disabled = busy || unknown;
  return <AuthShell lang={locale} eyebrow={text("eyebrow")} title={text(`${prefix}.title`)} description={text(`${prefix}.description`)} footer={<>
    <p><a href="/login" onClick={clearSecrets}>{text("login")}</a></p>
    {phase === "request" || phase === "cancelled" || phase === "refused" ? <><p><a href="/recover-authenticator" onClick={clearSecrets}>{methodText("known.link")}</a><span className="authFieldHint">{methodText("known.hint")}</span></p><p><a href="/recover" onClick={clearSecrets}>{text("fallback.link")}</a><span className="authFieldHint"> {text("fallback.hint")}</span></p></>
      : phase === "password_required" || phase === "email_link" || phase === "cancel_link" ? <><p><button className="authTextButton" type="button" disabled={disabled} onClick={() => setSwitchConfirmation("known")}>{methodText("known.link")}</button></p><p><button className="authTextButton" type="button" disabled={disabled} onClick={() => setSwitchConfirmation("saved")}>{text("fallback.link")}</button><span className="authFieldHint">{text("fallback.switch")}</span></p></>
        : phase === "sent" || phase === "expired" ? <p className="authFieldHint">{text("fallback.pending")}</p> : null}
  </>}>
    {error && <div className="authAlert" role="alert">{error}</div>}
    {notice && <p className="authFieldHint" role="status">{notice}</p>}
    {switchConfirmation && <section className="recoveryStatus" aria-label={methodText("switch.title")}><p>{methodText("switch.description")}</p><button className="authPrimary" type="button" disabled={disabled} onClick={() => switchToRecovery(switchConfirmation)}>{methodText("switch.confirm")}</button><button className="authSecondary" type="button" disabled={disabled} onClick={() => setSwitchConfirmation(null)}>{methodText("switch.stay")}</button></section>}
    {unknown && <button className="authSecondary" type="button" disabled={busy} onClick={() => void perform(async () => {
      const state = await client.status();
      if (!mounted.current) return;
      if (switchingToRecovery.current && (state.status === "cancelled" || state.status === "refused")) { recoverAccessAfterClosure(); return; }
      apply(state);
      if (switchingToRecovery.current && state.status === "password_required") {
        await client.cancelCurrent();
        if (mounted.current) recoverAccessAfterClosure();
      } else {
        switchingToRecovery.current = false;
        if (state.status === "password_required") setNotice(text("checked.hint"));
      }
    }, true)}>{busy ? text("working") : text("check.state")}</button>}
    {phase === "request" && <form className="authForm" method="post" action="/reset-password" aria-busy={busy} onSubmit={event => {
      event.preventDefault(); void perform(async () => { await client.start(email.trim()); if (mounted.current) { setEmail(""); setPhase("sent"); } });
    }}>
      <div className="authField"><label htmlFor="password-reset-email">{text("email")}</label><input id="password-reset-email" name="email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} aria-describedby="password-reset-email-hint" required disabled={disabled} /><p id="password-reset-email-hint" className="authFieldHint">{text("email.hint")}</p></div>
      <button className="authPrimary" disabled={disabled}>{busy ? text("working") : text("request.button")}</button>
      <p className="authFieldHint">{text("request.hint")}</p>
    </form>}
    {phase === "sent" && <div className="recoveryStatus" role="status"><p>{text("sent.hint")}</p><button className="authSecondary" type="button" onClick={() => { setUnknown(false); setError(null); setPhase("request"); }}>{text("sent.another")}</button></div>}
    {phase === "email_link" && <button className="authPrimary" type="button" disabled={disabled} onClick={() => void perform(async () => {
      if (link.current === null) throw new Error("PASSWORD_RESET_LINK_MISSING");
      const state = await client.exchange(link.current);
      if (mounted.current) apply(state);
    })}>{busy ? text("working") : text("continue")}</button>}
    {phase === "password_required" && <form className="authForm" method="post" action="/reset-password" aria-busy={busy} onSubmit={submitReset}>
      <div className="authField"><label htmlFor="password-reset-password">{text("password.label")}</label><input id="password-reset-password" name="new-password" type="password" autoComplete="new-password" minLength={minimum} maxLength={maximum ?? undefined} value={password} onChange={event => setPassword(event.target.value)} required disabled={disabled} aria-describedby="password-reset-password-hint" /><p id="password-reset-password-hint" className="authFieldHint">{text("password.hint", { minimum })}</p></div>
      <div className="authField"><label htmlFor="password-reset-confirmation">{text("password.confirm")}</label><input id="password-reset-confirmation" name="confirm-password" type="password" autoComplete="new-password" minLength={minimum} maxLength={maximum ?? undefined} value={confirmation} onChange={event => setConfirmation(event.target.value)} required disabled={disabled} /></div>
      <div className="authField"><label htmlFor="password-reset-code">{text("code.label")}</label><input id="password-reset-code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={12} value={code} onChange={event => setCode(event.target.value.replace(/\s/g, ""))} required disabled={disabled} aria-describedby="password-reset-code-hint" /><p id="password-reset-code-hint" className="authFieldHint">{text("code.hint")}</p></div>
      <button className="authPrimary" disabled={disabled}>{busy ? text("working") : text("password.button")}</button>
      <p className="authFieldHint">{text("password.effect")}</p>
    </form>}
    {phase === "completed" && <div className="recoveryStatus" role="status"><p>{text("done.hint")}</p><a className="authPrimary" href="/login" onClick={clearSecrets}>{text("login")}</a></div>}
    {phase === "cancel_link" && <button className="authPrimary" type="button" disabled={disabled} onClick={() => void perform(async () => {
      if (cancellation.current === null) throw new Error("PASSWORD_RESET_LINK_MISSING");
      await client.cancel(cancellation.current);
      if (mounted.current) { clearSecrets(); setPhase("cancelled"); }
    })}>{busy ? text("working") : text("cancel.button")}</button>}
    {phase === "expired" && <button className="authPrimary" type="button" onClick={() => { clearSecrets(); switchingToRecovery.current = false; setError(null); setUnknown(false); setPhase("request"); }}>{text("expired.button")}</button>}
    {phase === "password_required" && <button className="authSecondary recoveryCancel" type="button" disabled={disabled} onClick={() => void perform(async () => {
      await client.cancelCurrent();
      if (mounted.current) { clearSecrets(); setPhase("cancelled"); }
    })}>{text("cancel")}</button>}
  </AuthShell>;
}
