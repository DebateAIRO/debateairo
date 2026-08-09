"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { contractClient, getStoredToken } from "@/lib/api";
import type { AskRequest } from "@/lib/types";
import { ContractHttpError } from "@debateai/contract";

export default function NewQuestionPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getStoredToken();
    if (token === null) { setError("Add your development identity token in Settings first."); return; }
    const data = new FormData(event.currentTarget);
    const agentCount = Number(data.get("agent_count"));
    const depth = Number(data.get("depth"));
    const asOf = new Date(String(data.get("as_of") ?? ""));
    if (!Number.isInteger(agentCount) || agentCount < 1 || !Number.isInteger(depth) || depth < 0) {
      setError("Agent count and depth must be explicit whole numbers."); return;
    }
    if (Number.isNaN(asOf.valueOf())) { setError("As-of must be an explicit date and time."); return; }
    const lines = (name: string) => String(data.get(name) ?? "").split("\n").filter((line) => line.trim().length > 0);
    const ask: AskRequest = {
      question_line: String(data.get("question_line") ?? ""),
      risk_tier: String(data.get("risk_tier")) as AskRequest["risk_tier"],
      tier_source: "ASKER",
      tier_provenance_ref: "asker:ui-selection",
      composition_budget_tier: String(data.get("composition_budget_tier")) as AskRequest["composition_budget_tier"],
      depth_params: { depth },
      agent_count: agentCount,
      decision_owner: String(data.get("decision_owner") ?? ""),
      action_owner: String(data.get("action_owner") ?? ""),
      decision_scope: String(data.get("decision_scope") ?? ""),
      caller_scope: "ASKER",
      as_of: asOf.toISOString(),
      steering_presets: lines("steering_presets"),
      steering_annotations: lines("steering_annotations")
    };
    setSubmitting(true); setError(null);
    try {
      const accepted = await contractClient.submitAsk(ask, token);
      router.push(`/debate/${encodeURIComponent(accepted.run_ref)}`);
    } catch (failure) {
      setError(failure instanceof ContractHttpError ? failure.code : "NETWORK_FAILURE");
    } finally { setSubmitting(false); }
  }

  return <main className="screen scroll"><div className="screenInner">
    <div className="eyebrow">New question</div><h1 className="display">Set the run contract</h1>
    <form onSubmit={submit} className="card" style={{ display: "grid", gap: 16, marginTop: 24 }}>
      <label>Question<textarea name="question_line" required rows={4} /></label>
      <label>Risk tier<select name="risk_tier" required defaultValue=""><option value="" disabled>Choose</option><option value="casual">Casual</option><option value="standard">Standard</option><option value="high-stakes">High stakes</option></select></label>
      <label>Composition budget tier<select name="composition_budget_tier" required defaultValue=""><option value="" disabled>Choose</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
      <label>Depth<input name="depth" inputMode="numeric" required /></label>
      <label>Agent count<input name="agent_count" inputMode="numeric" required /></label>
      <label>Decision owner<input name="decision_owner" required /></label>
      <label>Action owner<input name="action_owner" required /></label>
      <label>Decision scope<textarea name="decision_scope" required rows={3} /></label>
      <label>As of<input name="as_of" type="datetime-local" required /></label>
      <label>Steering menu selections (one per line)<textarea name="steering_presets" rows={3} /></label>
      <label>Free-text steering annotations (logged verbatim, one per line)<textarea name="steering_annotations" rows={3} /></label>
      {error ? <div className="error" role="alert">{error}</div> : null}
      <button className="button primary" disabled={submitting}>{submitting ? "Submitting…" : "Start run"}</button>
    </form>
  </div></main>;
}
