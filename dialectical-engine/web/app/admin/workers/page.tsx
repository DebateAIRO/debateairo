"use client";

import { useState } from "react";
import type { Deployment } from "@/lib/types";
import { contractClient, getStoredToken } from "@/lib/api";
import { ContractHttpError } from "@debateai/contract";

export default function FleetPage() {
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function readFleet() {
    const token = getStoredToken();
    if (token === null) { setError("SESSION_REQUIRED"); return; }
    try { setDeployment(await contractClient.readDeployment(token)); setError(null); }
    catch (failure) { setError(failure instanceof ContractHttpError ? failure.code : "NETWORK_FAILURE"); }
  }
  return <main className="screen scroll"><div className="screenInner">
    <div className="eyebrow">Fleet</div><h1 className="display">Execution state</h1>
    <button className="button primary" onClick={() => void readFleet()}>Read typed deployment state</button>
    {error ? <div className="error">{error}</div> : null}
    {deployment?.fleet.state === "UNAVAILABLE" ? <div className="card"><strong>Fleet unavailable</strong><p>{deployment.fleet.reason}. No worker state is fabricated or silently defaulted.</p></div> : null}
    {deployment?.fleet.state === "AVAILABLE" ? <div className="card">{deployment.fleet.workers.map((worker) => <p key={worker.worker_ref}>{worker.worker_ref} · {worker.status} · {worker.source_ref}</p>)}</div> : null}
  </div></main>;
}
