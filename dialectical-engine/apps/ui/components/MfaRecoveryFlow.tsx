"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ContractHttpError, createMfaRecoveryClient, type MfaRecoveryClient, type MfaRecoveryState } from "@debateai/contract";
import { AuthShell } from "@/components/AuthShell";
import { API_BASE } from "@/lib/api";
import { setRecoveryAcknowledgementPending } from "@/lib/authNavigationGuard";
import { totpQrMatrix } from "@/lib/totpQr";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import english from "@/messages/en/mfa-recovery.json";
const browserClient = createMfaRecoveryClient(fetch, API_BASE);
type Phase = MfaRecoveryState["status"] | "request" | "sent" | "email_link" | "cancel_link" | "expired";
function SetupQr({ uri, label, fallback }: { uri: string; label: string; fallback: string }) {
  const matrix = useMemo(() => { try { return totpQrMatrix(uri); } catch { return null; } }, [uri]);
  if (!matrix) return <p className="authFieldHint">{fallback}</p>;
  const size = matrix.length + 8, path = matrix.flatMap((row, y) => row.flatMap((dark, x) => dark ? [`M${x + 4} ${y + 4}h1v1h-1z`] : [])).join("");
  return <svg className="mfaQr" width="170" height="170" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}><rect width={size} height={size} fill="var(--qr-paper)" /><path d={path} fill="var(--qr-ink)" /></svg>;
}
export function MfaRecoveryFlow({ catalog = english, locale = "en", client = browserClient }: Readonly<{ catalog?: MessageCatalog; locale?: "en" | "ro"; client?: MfaRecoveryClient }>) {
  const [phase, setPhase] = useState<Phase>("request"), [email, setEmail] = useState(""), [destination, setDestination] = useState<"primary" | "backup">("primary"), [password, setPassword] = useState(""), [ready, setReady] = useState(false), [code, setCode] = useState(""), [secret, setSecret] = useState(""), [uri, setUri] = useState(""), [label, setLabel] = useState(""), [codes, setCodes] = useState<string[]>([]), [ack, setAck] = useState(""), [expires, setExpires] = useState<string | null>(null), [busy, setBusy] = useState(false), [unknown, setUnknown] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null), [switchConfirm, setSwitchConfirm] = useState(false);
  const link = useRef<string | null>(null), cancellation = useRef<string | null>(null), mounted = useRef(true), inFlight = useRef(false), switching = useRef(false);
  const text = (key: string) => t(catalog, key);
  function clearSensitive() { setPassword(""); setCode(""); setSecret(""); setUri(""); setCodes([]); setAck(""); setRecoveryAcknowledgementPending(false); }
  function clear() { link.current = null; cancellation.current = null; clearSensitive(); setNotice(null); setSwitchConfirm(false); }
  function apply(state: MfaRecoveryState) {
    link.current = null; cancellation.current = null; setExpires(state.expires_at); setUnknown(false);
    if (state.status === "totp_required" && !secret) { setPhase("factor_required"); setNotice(text("restart.hint")); }
    else if (state.status === "ack_required" && codes.length === 0) { setPhase("codes_required"); setNotice(text("restart.hint")); }
    else setPhase(state.status);
    if (["codes_required", "ack_required", "ready"].includes(state.status)) { setSecret(""); setUri(""); }
    if (state.status === "ready") { setCodes([]); setAck(""); setRecoveryAcknowledgementPending(false); }
    if (["completed", "cancelled", "refused"].includes(state.status)) { clear(); switching.current = false; }
  }
  useEffect(() => {
    mounted.current = true;
    const hash = location.hash.slice(1);
    if (hash) {
      history.replaceState(null, "", location.pathname + location.search);
      const entries = [...new URLSearchParams(hash).entries()];
      if (entries.length === 1 && /^[A-Za-z0-9_-]{43}$/.test(entries[0]![1])) { const [name, value] = entries[0]!; if (name === "token") { link.current = value; setPhase("email_link"); } else if (name === "cancel") { cancellation.current = value; setPhase("cancel_link"); } else setPhase("expired"); } else setPhase("expired");
    } else if (link.current === null && cancellation.current === null) void client.status().then(state => { if (mounted.current) apply(state); }).catch(() => {});
    return () => { mounted.current = false; queueMicrotask(() => { if (!mounted.current) { link.current = null; cancellation.current = null; setRecoveryAcknowledgementPending(false); } }); };
  }, [client]);
  const active = ["factor_required", "totp_required", "codes_required", "ack_required", "ready"].includes(phase);
  useEffect(() => { if (!active || !expires) return; const remaining = Date.parse(expires) - Date.now(); if (remaining > 2147483647) return; const timer = setTimeout(() => { clear(); setPhase("expired"); if (unknown) setError(text("deadline.unknown")); }, Math.max(0, remaining)); return () => clearTimeout(timer); }, [active, expires, unknown]);
  async function perform(operation: () => Promise<void>, reconcile = false) {
    if (inFlight.current || unknown && !reconcile) return; inFlight.current = true; setBusy(true); setError(null);
    try { await operation(); }
    catch (failure) {
      if (!mounted.current) return;
      const status = failure instanceof ContractHttpError ? failure.status : 0, server = failure instanceof ContractHttpError ? failure.serverCode : null;
      if (status === 401 && server === "MFA_RECOVERY_PROOF_INVALID") { setCode(""); setError(text("error.proof")); }
      else if (status === 429) { setCode(""); setError(text("error.rate")); }
      else if ([401, 403, 410].includes(status) && !switching.current && !reconcile) { clear(); setUnknown(false); setPhase("refused"); }
      else { setPassword(""); setCode(""); setUnknown(true); setError(text(switching.current ? "switch.unknown" : "error.unknown")); }
    } finally { inFlight.current = false; if (mounted.current) { setPassword(""); setBusy(false); } }
  }
  const submit = (operation: () => Promise<void>) => (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (phase === "email_link" && !ready) return; void perform(operation); };
  function showConfirmedCancellation() { clear(); switching.current = false; setPhase("cancelled"); setUnknown(false); setSwitchConfirm(false); setNotice(text("cancel.pause")); }
  const prefix = phase === "email_link" ? "link" : phase === "cancel_link" ? "cancel" : phase === "factor_required" ? "factor" : phase === "totp_required" ? "totp" : phase === "codes_required" || phase === "ack_required" ? "codes" : phase === "completed" ? "done" : phase;
  const disabled = busy || unknown;
  function download() { const value = new Blob([codes.join("\n") + "\n"], { type: "text/plain;charset=utf-8" }); const url = URL.createObjectURL(value); const a = document.createElement("a"); a.href = url; a.download = "recovery-codes.txt"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 0); }
  return <AuthShell lang={locale} eyebrow={text("eyebrow")} title={text(`${prefix}.title`)} description={text(`${prefix}.description`)} footer={<><p><a href="/login" onClick={clear}>{text("login")}</a></p>{active ? <p><button className="authTextButton" type="button" disabled={disabled} onClick={() => setSwitchConfirm(true)}>{text("saved.link")}</button></p> : !unknown && phase !== "cancelled" && <p><a href="/recover" onClick={clear}>{text("saved.link")}</a><span className="authFieldHint">{text("saved.hint")}</span></p>}</>}>
    {active && expires && <p className="authFieldHint">{text("deadline")} <time dateTime={expires}>{new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(expires))}</time></p>}
    {error && <div className="authAlert" role="alert">{error}</div>}{notice && <p className="authFieldHint" role="status">{notice}</p>}
    {unknown && <button className="authSecondary recoveryCancel" type="button" disabled={busy} onClick={() => void perform(async () => { const state = await client.status(); if (!mounted.current) return; if (switching.current && state.status === "cancelled") { showConfirmedCancellation(); return; } if (state.status === "refused") { switching.current = false; setSwitchConfirm(false); apply(state); return; } apply(state); if (switching.current && !["completed", "cancelled", "refused"].includes(state.status)) { await client.cancelCurrent(); if (mounted.current) showConfirmedCancellation(); } }, true)}>{text("check.state")}</button>}
    {switchConfirm && <section className="recoveryStatus" aria-label={text("switch.title")}><p>{text("cancel.pause")}</p><button className="authPrimary" type="button" disabled={disabled} onClick={() => { switching.current = true; void perform(async () => { await client.cancelCurrent(); if (mounted.current) showConfirmedCancellation(); }); }}>{text("switch.confirm")}</button><button className="authSecondary" type="button" disabled={disabled} onClick={() => setSwitchConfirm(false)}>{text("switch.stay")}</button></section>}
    {phase === "request" && <form className="authForm" method="post" action="/recover-authenticator" onSubmit={submit(async () => { await client.start(email.trim(), destination); if (mounted.current) { setEmail(""); setPhase("sent"); } })}><div className="authField"><label htmlFor="mfa-email">{text("email")}</label><input id="mfa-email" name="email" type="email" autoComplete="email" required disabled={disabled} value={email} onChange={event => setEmail(event.target.value)} aria-describedby="mfa-email-hint" /><p id="mfa-email-hint" className="authFieldHint">{text("email.hint")}</p></div><div className="authField"><label htmlFor="mfa-destination">{text("destination")}</label><select className="mfaRecoveryDestination" id="mfa-destination" name="destination" disabled={disabled} value={destination} onChange={event => setDestination(event.target.value as "primary" | "backup")}><option value="primary">{text("destination.primary")}</option><option value="backup">{text("destination.backup")}</option></select><p className="authFieldHint">{text("destination.hint")}</p></div><button className="authPrimary" disabled={disabled}>{busy ? text("working") : text("request.button")}</button><p className="authFieldHint">{text("recognized.hint")}</p></form>}
    {phase === "sent" && <div className="recoveryStatus" role="status"><p>{text("sent.hint")}</p><button className="authSecondary" type="button" onClick={() => setPhase("request")}>{text("sent.another")}</button></div>}
    {phase === "email_link" && <form className="authForm" method="post" action="/recover-authenticator" onSubmit={submit(async () => { if (!ready) return; if (!link.current) throw new Error("MFA_LINK_MISSING"); const state = await client.exchange(link.current, password); if (mounted.current) { apply(state); setPassword(""); } })}><div className="authField"><label htmlFor="mfa-current-password">{text("password")}</label><input id="mfa-current-password" name="current-password" type="password" autoComplete="current-password" required disabled={disabled} value={password} onChange={event => setPassword(event.target.value)} aria-describedby="mfa-password-hint" /><p id="mfa-password-hint" className="authFieldHint">{text("password.hint")}</p></div><label className="authCheck"><input name="ready" type="checkbox" checked={ready} onChange={event => setReady(event.target.checked)} required disabled={disabled} />{text("ready.device")}</label><button className="authPrimary" disabled={disabled || !ready}>{busy ? text("working") : text("continue")}</button><p className="authFieldHint">{text("recognized.hint")}</p></form>}
    {phase === "factor_required" && <button className="authPrimary" type="button" disabled={disabled} onClick={() => void perform(async () => { const factor = await client.beginFactor(); if (mounted.current) { setSecret(factor.secret); setUri(factor.otpauth_uri); setLabel(factor.account_label); setNotice(null); setPhase("totp_required"); } })}>{busy ? text("working") : text("factor.button")}</button>}
    {phase === "totp_required" && <><div className="recoverySetup"><SetupQr uri={uri} label={text("qr.label")} fallback={text("qr.fallback")} /><p className="authFieldHint">{label}</p><div className="authField"><label htmlFor="mfa-setup-key">{text("setup.key")}</label><output id="mfa-setup-key" className="recoverySetupKey">{secret}</output></div><p className="authFieldHint">{text("setup.hint")}</p></div><form className="authForm" method="post" action="/recover-authenticator" onSubmit={submit(async () => { if (!/^[0-9]{6}$/.test(code)) { setError(text("error.code")); return; } await client.verifyFactor(code); if (mounted.current) { setCode(""); setSecret(""); setUri(""); setPhase("codes_required"); } })}><div className="authField"><label htmlFor="mfa-new-code">{text("code")}</label><input id="mfa-new-code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={12} required disabled={disabled} value={code} onChange={event => setCode(event.target.value.replace(/\s/g, ""))} /></div><button className="authPrimary" disabled={disabled}>{busy ? text("working") : text("totp.button")}</button></form></>}
    {phase === "codes_required" && <button className="authPrimary" type="button" disabled={disabled} onClick={() => void perform(async () => { const result = await client.generateCodes(); if (mounted.current) { setCodes(result.recovery_codes); setRecoveryAcknowledgementPending(true); setPhase("ack_required"); } })}>{text("codes.generate")}</button>}
    {phase === "ack_required" && <><ol className="recoveryCodes">{codes.map(value => <li key={value}><code>{value}</code></li>)}</ol><button className="authSecondary recoveryCancel" type="button" disabled={disabled} onClick={download}>{text("codes.download")}</button><form className="authForm" method="post" action="/recover-authenticator" onSubmit={submit(async () => { await client.acknowledge(ack.trim()); if (mounted.current) { setAck(""); setCodes([]); setRecoveryAcknowledgementPending(false); setPhase("ready"); } })}><div className="authField"><label htmlFor="mfa-saved-code">{text("codes.confirm")}</label><input id="mfa-saved-code" name="saved-code" autoComplete="off" spellCheck={false} required disabled={disabled} value={ack} onChange={event => setAck(event.target.value)} /><p className="authFieldHint">{text("codes.hint")}</p></div><button className="authPrimary" disabled={disabled}>{text("codes.button")}</button></form></>}
    {phase === "ready" && <button className="authPrimary" type="button" disabled={disabled} onClick={() => void perform(async () => { await client.complete(); if (mounted.current) { clear(); setPhase("completed"); } })}>{busy ? text("working") : text("ready.button")}</button>}
    {phase === "completed" && <div className="recoveryStatus" role="status"><p>{text("done.hint")}</p><a className="authPrimary" href="/login" onClick={clear}>{text("login")}</a></div>}
    {phase === "cancel_link" && <button className="authPrimary" type="button" disabled={disabled} onClick={() => void perform(async () => { if (!cancellation.current) throw new Error("MFA_LINK_MISSING"); await client.cancel(cancellation.current); if (mounted.current) { clear(); setPhase("cancelled"); } })}>{text("cancel.button")}</button>}
    {(phase === "expired" || phase === "refused") && <button className="authPrimary" type="button" disabled={disabled} onClick={() => { clear(); setUnknown(false); setError(null); setPhase("request"); }}>{text("expired.button")}</button>}
    {active && <button className="authSecondary recoveryCancel" type="button" disabled={disabled} onClick={() => setSwitchConfirm(true)}>{text("cancel")}</button>}
  </AuthShell>;
}
