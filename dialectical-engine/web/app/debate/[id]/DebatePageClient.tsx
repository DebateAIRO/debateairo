"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ContractHttpError, type ExecutionLedgerDigest, type Inspection, type RunEvent } from "@debateai/contract";
import { COOKIE_SESSION_MARKER, contractClient } from "@/lib/api";
import type { Answer, Node } from "@/lib/types";
import { applyRunEvent, createEmptyLiveAnswerState, projectAnswerSurface, type LiveAnswerState } from "@/lib/v3Presentation";
import { VerdictBanner } from "@/components/VerdictBanner";
import { DebateCanvas } from "@/components/DebateCanvas";
import { NodeDetailDrawer } from "@/components/NodeDetailDrawer";
import { DebateWorkspaceDrawer } from "@/components/DebateWorkspaceDrawer";
import { PublicationControl } from "@/components/PublicationControl";

const EMPTY_LIVE_STATE: LiveAnswerState = createEmptyLiveAnswerState();

export default function DebatePageClient({ id, initialAnswer, initialError }: { id: string; initialAnswer: Answer | null; initialError: string | null }) {
  const [answer, setAnswer] = useState(initialAnswer);
  const [error, setError] = useState(initialError);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [live, setLive] = useState<LiveAnswerState>(EMPTY_LIVE_STATE);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [ledgerDigest, setLedgerDigest] = useState<ExecutionLedgerDigest | null>(null);
  const [actionState, setActionState] = useState<string | null>(null);
  const [investigationInput, setInvestigationInput] = useState<Readonly<Record<string, string>>>({});
  const surface = useMemo(() => answer === null ? null : projectAnswerSurface(answer), [answer]);

  const refresh = useCallback(async () => {
    try {
      let next;
      try { next = await contractClient.readAnswer(id, COOKIE_SESSION_MARKER); }
      catch (failure) {
        if (!(failure instanceof ContractHttpError) || failure.code !== "NOT_FOUND") throw failure;
        next = await contractClient.readRunAnswer(id, COOKIE_SESSION_MARKER);
      }
      setAnswer(next); setError(null);
    } catch (failure) {
      setError(failure instanceof ContractHttpError ? failure.code : "NETWORK_FAILURE");
    }
  }, [id]);

  useEffect(() => { if (answer === null) void refresh(); }, [answer, refresh]);
  useEffect(() => {
    if (answer === null) return;
    void contractClient.readLedgerDigest(answer.answer_id, COOKIE_SESSION_MARKER)
      .then(setLedgerDigest)
      .catch((failure) => setActionState(failure instanceof ContractHttpError ? failure.code : "NETWORK_FAILURE"));
  }, [answer]);
  useEffect(() => {
    const controller = new AbortController();
    const consume = (event: RunEvent) => {
      setLive((current) => applyRunEvent(current, event));
      if (event.event_type === "honesty.staleness_trigger_fired") void refresh();
      if (event.event_type === "run.terminal") void refresh();
    };
    void contractClient.streamEvents(
      answer?.run_ref ?? id,
      COOKIE_SESSION_MARKER,
      consume,
      controller.signal
    ).catch((failure) => {
      if (!controller.signal.aborted) setError(failure instanceof ContractHttpError ? failure.code : "NETWORK_FAILURE");
    });
    return () => controller.abort();
  }, [answer?.run_ref, id, refresh]);
  useEffect(() => {
    const wake = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", wake);
    return () => document.removeEventListener("visibilitychange", wake);
  }, [refresh]);

  const showInspection = useCallback(async () => {
    if (answer === null) { setActionState("SESSION_REQUIRED"); return; }
    try {
      setInspection(await contractClient.readInspection(
        answer.answer_id,
        COOKIE_SESSION_MARKER,
        answer.answer_version
      ));
      setActionState(null);
    } catch (failure) {
      setActionState(failure instanceof ContractHttpError ? failure.code : "NETWORK_FAILURE");
    }
  }, [answer]);

  const unlinkMemory = useCallback(async () => {
    if (answer === null) { setActionState("SESSION_REQUIRED"); return; }
    try {
      await contractClient.unlinkMemory(answer.answer_id, COOKIE_SESSION_MARKER);
      setAnswer(await contractClient.readAnswer(answer.answer_id, COOKIE_SESSION_MARKER));
      setActionState("MEMORY_UNLINKED");
    } catch (failure) {
      setActionState(failure instanceof ContractHttpError ? failure.code : "NETWORK_FAILURE");
    }
  }, [answer]);

  const recordInvestigation = useCallback(async (gapRef: string, acceptsUserInput: boolean) => {
    if (answer === null) { setActionState("SESSION_REQUIRED"); return; }
    const verbatim = investigationInput[gapRef] ?? "";
    try {
      const accepted = await contractClient.recordInvestigation(answer.answer_id, gapRef, {
        user_input: acceptsUserInput && verbatim.length > 0 ? verbatim : null,
        human_steer_input: true
      }, COOKIE_SESSION_MARKER);
      setActionState(`${accepted.status} · ${accepted.replay_handle}`);
    } catch (failure) {
      setActionState(failure instanceof ContractHttpError ? failure.code : "NETWORK_FAILURE");
    }
  }, [answer, investigationInput]);

  const exportHref = useMemo(() => answer === null || ledgerDigest === null ? null : `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ answer, execution_ledger_digest: ledgerDigest }, null, 2))}`, [answer, ledgerDigest]);

  if (surface === null) return <main className="screen"><div className="screenInner"><div className="eyebrow">Answer</div><h1 className="display">No served answer yet</h1>{error ? <div className="error">{error}</div> : <p>Loading the asker-scoped projection…</p>}<button className="button" onClick={() => void refresh()}>Read current state</button></div></main>;
  return <main className="screen scroll"><div className="screenInner wide">
    <nav style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><Link href="/">DebateAI</Link><div><button className="button" onClick={() => void refresh()}>Refresh current state</button>{exportHref ? <a className="button" href={exportHref} download={`${surface.identity.answerId}-v${surface.identity.answerVersion}.json`}>Export answer + honesty + ledger</a> : <span className="pill">Ledger digest loading</span>}</div></nav>
    <p className="eyebrow" style={{ marginTop: 30 }}>{surface.risk.tier} · {surface.time.stalenessState} · live {live.runPhase}/{live.servePhase}</p>
    <h1 className="display">{surface.questionLine}</h1>
    <VerdictBanner answer={surface} />
    {surface.mode === "COMPONENTS_ONLY" ? <section className="error"><strong>Components only</strong><p>Composed prose was not cleared to serve. Verified projections remain below.</p></section> : <section className="card">{surface.valueHinges.length > 0 ? <h2>What is true</h2> : null}{surface.text.map((text, index) => <p key={index}>{text}</p>)}</section>}
    {surface.valueHinges.length > 0 ? <section className="card"><h2>What follows given your values</h2><p>{surface.reversalPoint}</p></section> : null}
    <DebateCanvas nodes={surface.nodes} edges={surface.edges} liveNodes={live.nodes} onSelect={setSelectedNode} />
    {live.placeholderEdges.length > 0 ? <section className="card"><h2>Live graph connections</h2>{live.placeholderEdges.map((edge, index) => <p key={`${edge.from}:${edge.to}:${index}`}>{edge.from} → {edge.to} · {edge.relation}</p>)}</section> : null}
    {live.cycleRefusals.map((code, index) => <div className="error" key={`${code}:${index}`}>{code}: redirected to a shared crux.</div>)}
    {live.investigationGaps.length > 0 ? <section className="card"><h2>Investigate deeper</h2>{live.investigationGaps.map((gap) => <article key={gap.gap_ref}><span className="pill">Model-authored remediation · {gap.verdict}</span><h3>{gap.gap}</h3><p>{gap.why} · effort {gap.effort_grade}</p><pre>{gap.constructed_prompt}</pre>{gap.accepts_user_input ? <label>Optional verbatim input<textarea value={investigationInput[gap.gap_ref] ?? ""} onChange={(event) => setInvestigationInput((current) => ({ ...current, [gap.gap_ref]: event.target.value }))} /></label> : null}<button className="button" onClick={() => void recordInvestigation(gap.gap_ref, gap.accepts_user_input)}>Record investigate-deeper request</button></article>)}</section> : null}
    <DebateWorkspaceDrawer answer={surface} />
    <PublicationControl runId={answer!.run_ref} />
    {surface.memoryDisclosure ? <section className="card"><h2>Builds on a previous answer</h2><p>{surface.memoryDisclosure.tier} · {surface.memoryDisclosure.relation}</p><p>Prior freshness: {surface.memoryDisclosure.prior?.staleness_state ?? "No linked prior answer"}</p>{surface.memoryDisclosure.unlink.available ? <button className="button" onClick={() => void unlinkMemory()}>Unlink prior answer</button> : null}</section> : <section className="card"><h2>Builds on a previous answer</h2><p>No matched prior answer.</p></section>}
    <section className="card"><h2>Authorized inspection</h2><p>Handle: {surface.inspectionHandle}</p><button className="button" onClick={() => void showInspection()}>Show me why</button>{inspection ? <pre>{JSON.stringify(inspection, null, 2)}</pre> : null}</section>
    {ledgerDigest ? <section className="card"><h2>Execution ledger digest</h2><p>{ledgerDigest.entries.length} executed ledger entries.</p>{ledgerDigest.work_items.map((item) => <p key={item.node_ref}>{item.node_ref} · {item.status}{item.reason ? ` · ${item.reason}` : ""}</p>)}</section> : null}
    {actionState ? <div className="pill" role="status">{actionState}</div> : null}
    <NodeDetailDrawer node={selectedNode} onClose={() => setSelectedNode(null)} />
  </div></main>;
}
