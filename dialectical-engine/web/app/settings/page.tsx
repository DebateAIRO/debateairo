"use client";

import { useState, type FormEvent } from "react";
import { clearStoredToken, contractClient, getStoredToken, setStoredToken } from "@/lib/api";
import type { Deployment, Session } from "@/lib/types";
import { ContractHttpError } from "@debateai/contract";

export default function SettingsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = String(new FormData(event.currentTarget).get("token") ?? "").trim();
    if (token.length === 0) { setError("SESSION_REQUIRED"); return; }
    try {
      const [resolved, currentDeployment] = await Promise.all([
        contractClient.readSession(token), contractClient.readDeployment(token)
      ]);
      setStoredToken(token); setSession(resolved); setDeployment(currentDeployment); setError(null);
    }
    catch (failure) { setError(failure instanceof ContractHttpError ? failure.code : "NETWORK_FAILURE"); }
  }
  return <main className="screen scroll"><div className="screenInner">
    <div className="eyebrow">Identity</div><h1 className="display">Your asker scope</h1>
    <p className="lede">This prototype uses the provisional user development token. Every answer, inspection and node read remains scoped to its asker.</p>
    <form onSubmit={verify} className="card" style={{ display: "flex", gap: 12, marginTop: 24 }}>
      <input name="token" type="password" autoComplete="off" defaultValue={getStoredToken() ?? ""} aria-label="Development token" />
      <button className="button primary">Verify</button>
      <button className="button" type="button" onClick={() => { clearStoredToken(); setSession(null); setDeployment(null); }}>Clear</button>
    </form>
    {error ? <div className="error" role="alert">{error}</div> : null}
    {session ? <dl className="card"><dt>Asker</dt><dd>{session.asker_id}</dd><dt>Scope</dt><dd>{session.caller_scope}</dd><dt>Identity model</dt><dd>Provisional — revisit before credentialed launch</dd></dl> : null}
    {deployment ? <section className="card"><h2>Deployment register v{deployment.register.register_version}</h2>{deployment.register.rows.map((row) => <dl key={row.row_key}><dt>{row.row_key}</dt><dd>{JSON.stringify(row.value)} · {row.source_ref}</dd></dl>)}</section> : null}
    {deployment ? <section className="card"><h2>Model scorecards</h2>{deployment.scorecards.length === 0 ? <p>No derived scorecard cells have been recorded.</p> : deployment.scorecards.map((cell) => <p key={`${cell.model_id}:${cell.task_class}:${cell.metric}`}>{cell.provider}/{cell.model_id}@{cell.model_version} · {cell.task_class}/{cell.metric}: {cell.value ?? "No measured value"} · {cell.basis}</p>)}</section> : null}
    {deployment ? <section className="card"><h2>Session model ledger</h2>{deployment.model_ledger.length === 0 ? <p>No model assignment has been recorded for this session.</p> : deployment.model_ledger.map((entry) => <p key={entry.routing_decision_ref}>{entry.task_class} · {entry.provider}/{entry.model_id}@{entry.model_version}</p>)}</section> : null}
  </div></main>;
}
