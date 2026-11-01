"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ContractHttpError, type PublicReviewList, type PublicReviewPage } from "@debateai/contract";
import { createPublicReviewClient, publicationRefOf, type PublicReviewClient, type PublicReviewStepInput } from "../lib/publicReviewApi.js";
import { t, type MessageCatalog } from "../lib/i18n/translate.js";
import staffEnglish from "../messages/en/staff.json";
import "./StaffAccessPanel.css";

/**
 * Decision 33, on the private team page, for the two accounts of the team limit: nobody else's page shows it (the list answers them only). Hide a public debate at once, read it piece by piece, take a dig out, replace one
 * text, hide a report, put it back. Each step asks for a passkey, says first what it will do, and goes in the log.
 */
type Piece = PublicReviewPage["snapshot"][number];
type Pending = Readonly<{ line: string; run: (client: PublicReviewClient, page: PublicReviewPage | null, ref: string) => Promise<unknown> }>;
const FAILURE_CODES: ReadonlySet<string> = new Set(["PUBLIC_REVIEW_STALE", "PUBLIC_REVIEW_NOT_HIDDEN", "PUBLIC_REVIEW_ALREADY_HIDDEN", "PUBLIC_REVIEW_NOT_PUBLIC", "PUBLIC_REVIEW_PIECE_UNKNOWN", "STAFF_ALERT_UNAVAILABLE", "STAFF_INPUT_INVALID"]);
const failureLine = (catalog: MessageCatalog, failure: unknown): string => {
  if (failure instanceof ContractHttpError && failure.serverCode !== null && FAILURE_CODES.has(failure.serverCode)) return t(catalog, `staff.publicReview.failure.${failure.serverCode}`);
  return t(catalog, failure instanceof Error && failure.name === "NotAllowedError" ? "staff.publicReview.failure.passkeyCancelled" : "staff.publicReview.failure.other");
};
const when = (at: string) => new Date(at).toISOString().slice(0, 16).replace("T", " ");

export function PublicReviewPanel({ client, catalog = staffEnglish }: Readonly<{ client?: PublicReviewClient; catalog?: MessageCatalog }>) {
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
      setMessage({ text: failureLine(catalog, failure), good: false });
    }
  }, [api, catalog]);
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
      setMessage({ text: t(catalog, "staff.publicReview.done"), good: true });
    } catch (failure) {
      setPending(null);
      setMessage({ text: failureLine(catalog, failure), good: false });
    } finally {
      await load(ref);
      setBusy(false);
    }
  }
  const stepOf = (line: string, input: PublicReviewStepInput): Pending => ({ line, run: (client2, current, at) => client2.step(at, current?.revision ?? 0, input) });
  function open(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = publicationRefOf(String(new FormData(event.currentTarget).get("link") ?? ""));
    if (found === null) { setMessage({ text: t(catalog, "staff.publicReview.pasteLink"), good: false }); return; }
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
        setPending(stepOf(t(catalog, "staff.publicReview.confirm.correct"), { step: "CORRECT", pieceKind: kind, pieceId: id, pointer: piece.pointer, text }));
      }}><div className="staffField"><label htmlFor={`review-${key}`}>{t(catalog, "staff.publicReview.newText")}</label><textarea id={`review-${key}`} name="text" defaultValue={piece.corrected ?? piece.original} rows={3} /></div>
        <div className="staffActions"><button className="setBtn" type="submit">{t(catalog, "staff.publicReview.replace")}</button><button className="setBtn" type="button" onClick={() => setEditing(null)}>{t(catalog, "staff.publicReview.cancel")}</button></div></form>
        : <div className="staffActions"><button className="setBtn" type="button" disabled={busy} onClick={() => setEditing(key)}>{t(catalog, "staff.publicReview.replaceThis")}</button></div>) : null}
    </li>;
  };
  const confirm = pending === null ? null : <div className="staffMutation" data-review-confirm>
    <p>{pending.line}</p><p className="setCardHint">{t(catalog, "staff.publicReview.passkeyConfirms")}</p>
    <div className="staffActions"><button className="setBtn setBtnPrimary" type="button" disabled={busy} onClick={() => { void go(pending); }}>{t(catalog, "staff.publicReview.confirm")}</button>
      <button className="setBtn" type="button" disabled={busy} onClick={() => setPending(null)}>{t(catalog, "staff.publicReview.cancel")}</button></div>
  </div>;
  const notice = message === null ? null : <p className={message.good ? "staffNotice" : "setError"} role="status">{message.text}</p>;

  return <div className="setInner staffAccess publicReviewPanel" data-public-review-panel aria-busy={busy}>
    <section className="setCard">
      <h2 className="staffSectionTitle">{t(catalog, "staff.publicReview.title")}</h2>
      <p className="setCardHint">{t(catalog, "staff.publicReview.hint")}</p>
      <form onSubmit={open}><div className="staffField"><label htmlFor="public-review-link">{t(catalog, "staff.publicReview.link")}</label><input id="public-review-link" name="link" autoComplete="off" /></div>
        <div className="staffActions"><button className="setBtn" type="submit">{t(catalog, "staff.publicReview.open")}</button></div></form>
      {list.hidden.length === 0 ? <p className="setCardHint">{t(catalog, "staff.publicReview.noneHidden")}</p> : <ul className="staffAuditList" data-review-hidden>
        {list.hidden.map((row) => <li key={row.publication_ref}><button className="setBtn" type="button" onClick={() => { setRef(row.publication_ref); void load(row.publication_ref); }}>{row.publication_ref}</button> <span className="setCardHint">{t(catalog, "staff.publicReview.hiddenSince", { at: when(row.hidden_at) })}</span></li>)}
      </ul>}
      {page === null ? notice : null}
    </section>
    {page === null ? null : <section className="setCard" data-review-debate={page.hidden ? "HIDDEN" : "PUBLIC"}>
      <h2 className="staffSectionTitle">{page.question}</h2>
      <p>{page.hidden ? t(catalog, "staff.publicReview.isHidden") : t(catalog, "staff.publicReview.isPublic")}</p>
      <div className="staffActions">
        {page.hidden ? <button className="setBtn setBtnPrimary" type="button" disabled={busy || pending !== null} onClick={() => setPending(stepOf(t(catalog, "staff.publicReview.confirm.republish"), { step: "REPUBLISH" }))}>{t(catalog, "staff.publicReview.putBack")}</button>
          : <button className="setBtn setBtnPrimary" type="button" disabled={busy || pending !== null} onClick={() => setPending({ line: t(catalog, "staff.publicReview.confirm.hide"), run: (client2, current, at) => client2.hide(at, current?.revision ?? 0) })}>{t(catalog, "staff.publicReview.hideNow")}</button>}
      </div>
      {confirm}{notice}
      <div className="staffField"><label htmlFor="public-review-find">{t(catalog, "staff.publicReview.find")}</label><input id="public-review-find" value={find} onChange={(event) => setFind(event.target.value)} autoComplete="off" /></div>
      {page.snapshot_unreadable ? <p className="setError">{t(catalog, "staff.publicReview.snapshotUnreadable")}</p> : null}
      <h3>{t(catalog, "staff.publicReview.snapshot", { at: when(page.published_at) })}</h3>
      <ul className="staffAuditList" data-review-snapshot>{page.snapshot.map((piece) => pieceRow("SNAPSHOT", page.publication_ref, piece))}</ul>
      <h3>{t(catalog, "staff.publicReview.digs")}</h3>
      {page.digs.length === 0 ? <p className="setCardHint">{t(catalog, "staff.publicReview.noDigs")}</p> : null}
      {page.digs.map((dig) => <article key={dig.dig_run_id} data-review-dig={dig.removed ? "REMOVED" : "ALLOWED"}>
        <h4>{t(catalog, dig.removed ? "staff.publicReview.digHeadingRemoved" : "staff.publicReview.digHeading", { who: dig.contributor ?? t(catalog, "staff.publicReview.contributor"), at: when(dig.contributed_at) })}</h4>
        {page.hidden && !dig.removed ? <div className="staffActions"><button className="setBtn" type="button" disabled={busy || pending !== null} onClick={() => setPending(stepOf(t(catalog, "staff.publicReview.confirm.removeDig", { who: dig.contributor ?? t(catalog, "staff.publicReview.thePerson") }), { step: "REMOVE_DIG", pieceKind: "DIG", pieceId: dig.dig_run_id }))}>{t(catalog, "staff.publicReview.takeOut")}</button></div> : null}
        {page.updates.filter((row) => row.dig_run_id === dig.dig_run_id).map((row) => <div key={row.update_id} data-review-update={row.state}>
          <p><strong>{t(catalog, row.kind === "PATH" ? "staff.publicReview.kind.PATH" : "staff.publicReview.kind.MAIN")}</strong> <span className="setCardHint">{t(catalog, "staff.publicReview.updateLine", { at: when(row.recorded_at), state: t(catalog, `staff.publicReview.state.${row.state}`) })}</span></p>
          {row.before === null ? null : <p className="setCardHint">{t(catalog, "staff.publicReview.before", { text: row.before })}</p>}
          <ul className="staffAuditList">{row.pieces.map((piece) => pieceRow("UPDATE", row.update_id, piece))}</ul>
          {page.hidden && row.state === "AFFECTED" ? <div className="staffActions"><button className="setBtn" type="button" disabled={busy || pending !== null} onClick={() => setPending(stepOf(t(catalog, "staff.publicReview.confirm.putBackUpdate"), { step: "PUT_BACK", pieceKind: "UPDATE", pieceId: row.update_id }))}>{t(catalog, "staff.publicReview.putThisBack")}</button></div> : null}
        </div>)}
      </article>)}
      <h3>{t(catalog, "staff.publicReview.reports")}</h3>
      {page.reports.length === 0 ? <p className="setCardHint">{t(catalog, "staff.publicReview.noReports")}</p> : null}
      {page.reports.map((report) => <article key={report.report_id} data-review-report={report.state}>
        <h4>{report.writer === null ? t(catalog, "staff.publicReview.reportHeading", { version: report.report_version, at: when(report.recorded_at) }) : t(catalog, "staff.publicReview.reportHeadingWriter", { version: report.report_version, writer: report.writer, at: when(report.recorded_at) })}</h4>
        <p className="setCardHint">{t(catalog, `staff.publicReview.state.${report.state}`)}</p>
        <ul className="staffAuditList">{report.pieces.map((piece) => pieceRow("REPORT", report.report_id, piece))}</ul>
        {page.hidden ? <div className="staffActions">
          {report.state !== "HIDDEN" ? <button className="setBtn" type="button" disabled={busy || pending !== null} onClick={() => setPending(stepOf(t(catalog, "staff.publicReview.confirm.hideReport"), { step: "HIDE_REPORT", pieceKind: "REPORT", pieceId: report.report_id }))}>{t(catalog, "staff.publicReview.hideReport")}</button> : null}
          {report.state === "AFFECTED" ? <button className="setBtn" type="button" disabled={busy || pending !== null} onClick={() => setPending(stepOf(t(catalog, "staff.publicReview.confirm.putBackReport"), { step: "PUT_BACK", pieceKind: "REPORT", pieceId: report.report_id }))}>{t(catalog, "staff.publicReview.putThisBack")}</button> : null}
        </div> : null}
      </article>)}
      <h3>{t(catalog, "staff.publicReview.log")}</h3>
      <ul className="staffAuditList" data-review-log>{[...page.log].reverse().map((entry) => <li key={entry.revision}><strong>{t(catalog, `staff.publicReview.action.${entry.action}`)}</strong> <time dateTime={entry.at}>{when(entry.at)}</time> <span className="setCardHint">{t(catalog, "staff.publicReview.logBy", { id: entry.actor_staff_id.replaceAll("-", "") })}</span></li>)}</ul>
    </section>}
  </div>;
}
