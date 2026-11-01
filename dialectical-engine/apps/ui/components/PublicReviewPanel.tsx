"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ContractHttpError, type PublicReviewList, type PublicReviewPage } from "@debateai/contract";
import { createPublicReviewClient, publicationRefOf, type PublicReviewClient, type PublicReviewStepInput } from "../lib/publicReviewApi.js";
import "./StaffAccessPanel.css";

/**
 * Decision 33, on the private team page, for the two accounts of the team limit: nobody else's page shows it (the list answers them only). Hide a public debate at once, read it piece by piece, take a dig out, replace one
 * text, hide a report, put it back. Each step asks for a passkey, says first what it will do, and goes in the log. English, as the team pages are for these two.
 */
type Piece = PublicReviewPage["snapshot"][number];
type Pending = Readonly<{ line: string; run: (client: PublicReviewClient, page: PublicReviewPage | null, ref: string) => Promise<unknown> }>;
const FAILURES: Readonly<Record<string, string>> = Object.freeze({
  PUBLIC_REVIEW_STALE: "Someone else took a step first. Here is the debate as it is now; look again and try once more.",
  PUBLIC_REVIEW_NOT_HIDDEN: "Hide the debate first. Corrections happen only while it is hidden.",
  PUBLIC_REVIEW_ALREADY_HIDDEN: "This debate is already hidden.",
  PUBLIC_REVIEW_NOT_PUBLIC: "No public debate has that link.",
  PUBLIC_REVIEW_PIECE_UNKNOWN: "That piece cannot take this step.",
  STAFF_ALERT_UNAVAILABLE: "Team tools are locked, so only hiding works now. Everything else waits until they are back.",
  STAFF_INPUT_INVALID: "The page could not read that text. Check it and try again."
});
const failureLine = (failure: unknown): string => {
  if (failure instanceof ContractHttpError && failure.serverCode !== null && FAILURES[failure.serverCode] !== undefined) return FAILURES[failure.serverCode]!;
  return failure instanceof Error && failure.name === "NotAllowedError" ? "The passkey was cancelled. Nothing changed." : "That did not work. Nothing changed.";
};
const ACTION_WORDS: Readonly<Record<string, string>> = Object.freeze({ HIDE: "Hid the debate", REPUBLISH: "Put the debate back", REMOVE_DIG: "Took a dig out", PUT_BACK: "Put a piece back on the page", CORRECT: "Replaced a text", HIDE_REPORT: "Hid a report" });
const STATE_WORDS: Readonly<Record<string, string>> = Object.freeze({ ON_THE_PAGE: "On the page", ITS_DIG_REMOVED: "Off the page: its dig was taken out", AFFECTED: "Affected: written after a dig that was taken out, so it stays off the page until you read it and put it back", HIDDEN: "Hidden by hand" });
const when = (at: string) => new Date(at).toISOString().slice(0, 16).replace("T", " ");

export function PublicReviewPanel({ client }: Readonly<{ client?: PublicReviewClient }>) {
  const api = useMemo(() => client ?? createPublicReviewClient(), [client]);
  const [list, setList] = useState<PublicReviewList | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  const [page, setPage] = useState<PublicReviewPage | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [message, setMessage] = useState<Readonly<{ text: string; good: boolean }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [find, setFind] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const reads = useRef(0);
  const load = useCallback(async (publicationRef: string | null) => {
    const read = ++reads.current;
    try {
      const nextList = await api.list();
      if (read !== reads.current) return;
      setList(nextList);
      setPage(publicationRef === null ? null : await api.read(publicationRef));
    } catch (failure) {
      // Not one of the two: the section stays away, and says nothing.
      if (failure instanceof ContractHttpError && (failure.status === 403 || failure.status === 401)) { setList(null); return; }
      setMessage({ text: failureLine(failure), good: false });
    }
  }, [api]);
  useEffect(() => { void load(null); return () => { reads.current++; api.cancel(); }; }, [api, load]);
  if (list === null) return null;

  async function go(change: Pending) {
    if (busy || ref === null) return;
    setBusy(true);
    setMessage(null);
    try {
      await change.run(api, page, ref);
      setPending(null);
      setEditing(null);
      setMessage({ text: "Done. It is in the log, and both of you get an email that names nothing.", good: true });
    } catch (failure) {
      setPending(null);
      setMessage({ text: failureLine(failure), good: false });
    } finally {
      await load(ref);
      setBusy(false);
    }
  }
  const stepOf = (line: string, input: PublicReviewStepInput): Pending => ({ line, run: (client2, current, at) => client2.step(at, current?.revision ?? 0, input) });
  function open(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = publicationRefOf(String(new FormData(event.currentTarget).get("link") ?? ""));
    if (found === null) { setMessage({ text: "Paste the debate's public link.", good: false }); return; }
    setRef(found);
    setPending(null);
    setMessage(null);
    void load(found);
  }
  const pieceRow = (kind: "SNAPSHOT" | "UPDATE" | "REPORT", id: string, piece: Piece) => {
    const key = `${kind}:${id}:${piece.pointer}`;
    if (find !== "" && !`${piece.original} ${piece.corrected ?? ""}`.toLowerCase().includes(find.toLowerCase())) return null;
    return <li key={key} data-review-piece={piece.pointer}>
      <span className="setCardHint">{piece.pointer}</span>
      {piece.corrected === null ? <p>{piece.original}</p> : <><p data-review-original><del>{piece.original}</del></p><p data-review-corrected>{piece.corrected}</p></>}
      {page?.hidden === true ? (editing === key ? <form onSubmit={(event) => {
        event.preventDefault();
        const text = String(new FormData(event.currentTarget).get("text") ?? "").trim();
        if (text === "") return;
        setPending(stepOf("Replace this text. The original stays sealed, for the two of you only.", { step: "CORRECT", pieceKind: kind, pieceId: id, pointer: piece.pointer, text }));
      }}><div className="staffField"><label htmlFor={`review-${key}`}>New text</label><textarea id={`review-${key}`} name="text" defaultValue={piece.corrected ?? piece.original} rows={3} /></div>
        <div className="staffActions"><button className="setBtn" type="submit">Replace</button><button className="setBtn" type="button" onClick={() => setEditing(null)}>Cancel</button></div></form>
        : <div className="staffActions"><button className="setBtn" type="button" disabled={busy} onClick={() => setEditing(key)}>Replace this text</button></div>) : null}
    </li>;
  };
  const confirm = pending === null ? null : <div className="staffMutation" data-review-confirm>
    <p>{pending.line}</p><p className="setCardHint">Your passkey confirms this one step.</p>
    <div className="staffActions"><button className="setBtn setBtnPrimary" type="button" disabled={busy} onClick={() => { void go(pending); }}>Confirm</button>
      <button className="setBtn" type="button" disabled={busy} onClick={() => setPending(null)}>Cancel</button></div>
  </div>;
  const notice = message === null ? null : <p className={message.good ? "staffNotice" : "setError"} role="status">{message.text}</p>;

  return <div className="setInner staffAccess publicReviewPanel" data-public-review-panel aria-busy={busy}>
    <section className="setCard">
      <h2 className="staffSectionTitle">Public debates under review</h2>
      <p className="setCardHint">For a removal order or a report: hide a debate at once. It stays hidden until one of you puts it back. Hiding needs no money and no check, and works even while team tools are locked.</p>
      <form onSubmit={open}><div className="staffField"><label htmlFor="public-review-link">The debate's public link</label><input id="public-review-link" name="link" autoComplete="off" /></div>
        <div className="staffActions"><button className="setBtn" type="submit">Open</button></div></form>
      {list.hidden.length === 0 ? <p className="setCardHint">No debate is hidden now.</p> : <ul className="staffAuditList" data-review-hidden>
        {list.hidden.map((row) => <li key={row.publication_ref}><button className="setBtn" type="button" onClick={() => { setRef(row.publication_ref); void load(row.publication_ref); }}>{row.publication_ref}</button> <span className="setCardHint">hidden since {when(row.hidden_at)}</span></li>)}
      </ul>}
      {page === null ? notice : null}
    </section>
    {page === null ? null : <section className="setCard" data-review-debate={page.hidden ? "HIDDEN" : "PUBLIC"}>
      <h2 className="staffSectionTitle">{page.question}</h2>
      <p>{page.hidden ? "Hidden. Visitors see only a line that it is under review; no dig or report can start." : "Public. Anyone can read it now."}</p>
      <div className="staffActions">
        {page.hidden ? <button className="setBtn setBtnPrimary" type="button" disabled={busy || pending !== null} onClick={() => setPending(stepOf("Put this debate back on the site, with the corrected text. Digs and reports can start again. If anything was changed, the page says \"Part of this debate was changed after review\", with no reason.", { step: "REPUBLISH" }))}>Put back</button>
          : <button className="setBtn setBtnPrimary" type="button" disabled={busy || pending !== null} onClick={() => setPending({ line: "Hide this debate now, from every public page. A dig running on it finishes as its person's own and never changes the page.", run: (client2, current, at) => client2.hide(at, current?.revision ?? 0) })}>Hide now</button>}
      </div>
      {confirm}{notice}
      <div className="staffField"><label htmlFor="public-review-find">Find words in every piece</label><input id="public-review-find" value={find} onChange={(event) => setFind(event.target.value)} autoComplete="off" /></div>
      {page.snapshot_unreadable ? <p className="setError">The first snapshot could not be opened.</p> : null}
      <h3>First snapshot, {when(page.published_at)}</h3>
      <ul className="staffAuditList" data-review-snapshot>{page.snapshot.map((piece) => pieceRow("SNAPSHOT", page.publication_ref, piece))}</ul>
      <h3>Digs, each with what it changed</h3>
      {page.digs.length === 0 ? <p className="setCardHint">No dig has changed this debate.</p> : null}
      {page.digs.map((dig) => <article key={dig.dig_run_id} data-review-dig={dig.removed ? "REMOVED" : "ALLOWED"}>
        <h4>{dig.contributor ?? "a contributor"}, {when(dig.contributed_at)}{dig.removed ? ": taken out" : ""}</h4>
        {page.hidden && !dig.removed ? <div className="staffActions"><button className="setBtn" type="button" disabled={busy || pending !== null} onClick={() => setPending(stepOf(`Take this dig off the page. What was written after it also leaves the page until you read it and put it back. ${dig.contributor ?? "The person"} sees that it was removed after review, with no staff name. This cannot be undone here.`, { step: "REMOVE_DIG", pieceKind: "DIG", pieceId: dig.dig_run_id }))}>Take this dig out</button></div> : null}
        {page.updates.filter((row) => row.dig_run_id === dig.dig_run_id).map((row) => <div key={row.update_id} data-review-update={row.state}>
          <p><strong>{row.kind === "PATH" ? "Path text" : "Main answer version"}</strong> <span className="setCardHint">{when(row.recorded_at)}. {STATE_WORDS[row.state]}</span></p>
          {row.before === null ? null : <p className="setCardHint">Before it: {row.before}</p>}
          <ul className="staffAuditList">{row.pieces.map((piece) => pieceRow("UPDATE", row.update_id, piece))}</ul>
          {page.hidden && row.state === "AFFECTED" ? <div className="staffActions"><button className="setBtn" type="button" disabled={busy || pending !== null} onClick={() => setPending(stepOf("Put this piece back on the page. You have read it and it does not repeat what was taken out.", { step: "PUT_BACK", pieceKind: "UPDATE", pieceId: row.update_id }))}>Put this back</button></div> : null}
        </div>)}
      </article>)}
      <h3>Reports</h3>
      {page.reports.length === 0 ? <p className="setCardHint">No report on this debate.</p> : null}
      {page.reports.map((report) => <article key={report.report_id} data-review-report={report.state}>
        <h4>Version {report.report_version}{report.writer === null ? "" : `, by ${report.writer}`}, {when(report.recorded_at)}</h4>
        <p className="setCardHint">{STATE_WORDS[report.state]}</p>
        <ul className="staffAuditList">{report.pieces.map((piece) => pieceRow("REPORT", report.report_id, piece))}</ul>
        {page.hidden ? <div className="staffActions">
          {report.state !== "HIDDEN" ? <button className="setBtn" type="button" disabled={busy || pending !== null} onClick={() => setPending(stepOf("Hide this report version. This cannot be undone here.", { step: "HIDE_REPORT", pieceKind: "REPORT", pieceId: report.report_id }))}>Hide this report</button> : null}
          {report.state === "AFFECTED" ? <button className="setBtn" type="button" disabled={busy || pending !== null} onClick={() => setPending(stepOf("Put this report back on the page. You have read it and it does not repeat what was taken out.", { step: "PUT_BACK", pieceKind: "REPORT", pieceId: report.report_id }))}>Put this back</button> : null}
        </div> : null}
      </article>)}
      <h3>This debate's log</h3>
      <ul className="staffAuditList" data-review-log>{[...page.log].reverse().map((entry) => <li key={entry.revision}><strong>{ACTION_WORDS[entry.action]}</strong> <time dateTime={entry.at}>{when(entry.at)}</time> <span className="setCardHint">by staff-{entry.actor_staff_id.replaceAll("-", "")}</span></li>)}</ul>
    </section>}
  </div>;
}
