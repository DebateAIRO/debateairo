"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ContractHttpError, ModerationGroundSchema, ModerationSourceSchema, type ModerationGround, type ModerationSource, type PublicFlagQueue, type PublicReviewList, type PublicReviewPage } from "@debateai/contract";
import { createPublicReviewClient, NO_GROUND, publicationRefOf, type PublicReviewClient, type PublicReviewGround, type PublicReviewStepInput } from "../lib/publicReviewApi.js";
import { t, type MessageCatalog } from "../lib/i18n/translate.js";
import staffEnglish from "../messages/en/staff.json";
import "./StaffAccessPanel.css";

/**
 * Decision 33, on the private team page, for the two accounts of the team limit: nobody else's page shows it (the list answers them only). Hide a public debate at once, read it piece by piece, take a dig out, replace one
 * text, hide a report, put it back. Each step asks for a passkey, says first what it will do, and goes in the log.
 * THE GROUND (migration 0157; DSA Art 17(3)): the confirm box also asks what the statement of reasons needs. A removal, a hidden report, a correction and
 * "Decide: keep it hidden" wait for a rule, where the facts came from (the Report button names its report) and the facts; a hide asks too, and never waits;
 * a re-publish and a put-back ask nothing. The facts are what the person concerned reads on their statement: never the reporter's name.
 */
type Piece = PublicReviewPage["snapshot"][number];
type GroundNeed = "NONE" | "OPTIONAL" | "REQUIRED";
type Pending = Readonly<{ line: string; need: GroundNeed; run: (client: PublicReviewClient, page: PublicReviewPage | null, ref: string, ground: PublicReviewGround) => Promise<unknown> }>;
const FAILURE_CODES: ReadonlySet<string> = new Set(["PUBLIC_REVIEW_STALE", "PUBLIC_REVIEW_NOT_HIDDEN", "PUBLIC_REVIEW_ALREADY_HIDDEN", "PUBLIC_REVIEW_NOT_PUBLIC", "PUBLIC_REVIEW_PIECE_UNKNOWN", "STAFF_ALERT_UNAVAILABLE", "STAFF_INPUT_INVALID",
  "PUBLIC_REVIEW_GROUND_INVALID"]);
const STEP_NEEDS: Readonly<Record<PublicReviewStepInput["step"], GroundNeed>> = Object.freeze({ REPUBLISH: "NONE", PUT_BACK: "NONE", REMOVE_DIG: "REQUIRED", CORRECT: "REQUIRED", HIDE_REPORT: "REQUIRED", DECIDE: "REQUIRED" });
const groundWhole = (ground: PublicReviewGround): boolean => ground.grounds.length > 0 && ground.source !== null && (ground.source === "REPORT_BUTTON") === (ground.flagId !== null) && ground.facts !== null;
/** What a step sends: a hide drops a half-chosen report and never sends facts. */
const sentGround = (need: GroundNeed, ground: PublicReviewGround): PublicReviewGround => need === "NONE" ? NO_GROUND
  : { grounds: ModerationGroundSchema.options.filter((code) => ground.grounds.includes(code)), source: ground.source, flagId: ground.source === "REPORT_BUTTON" ? ground.flagId : null,
    facts: need === "REQUIRED" ? ground.facts : null };
const failureLine = (catalog: MessageCatalog, failure: unknown): string => {
  if (failure instanceof ContractHttpError && failure.serverCode !== null && FAILURE_CODES.has(failure.serverCode)) return t(catalog, `staff.publicReview.failure.${failure.serverCode}`);
  return t(catalog, failure instanceof Error && failure.name === "NotAllowedError" ? "staff.publicReview.failure.passkeyCancelled" : "staff.publicReview.failure.other");
};
const SIX_MONTHS_MS = 183 * 24 * 60 * 60_000;
const when = (at: string) => new Date(at).toISOString().slice(0, 16).replace("T", " ");

export function PublicReviewPanel({ client, catalog = staffEnglish }: Readonly<{ client?: PublicReviewClient; catalog?: MessageCatalog }>) {
  const api = useMemo(() => client ?? createPublicReviewClient(), [client]);
  const [list, setList] = useState<PublicReviewList | null>(null);
  const [queue, setQueue] = useState<PublicFlagQueue["reports"]>([]);
  const [ref, setRef] = useState<string | null>(null);
  const [page, setPage] = useState<PublicReviewPage | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [message, setMessage] = useState<Readonly<{ text: string; good: boolean }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [find, setFind] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [ground, setGround] = useState<Readonly<{ grounds: readonly ModerationGround[]; source: ModerationSource | null; flagId: string | null; facts: string }>>({ grounds: [], source: null, flagId: null, facts: "" });
  const reads = useRef(0);
  const load = useCallback(async (publicationRef: string | null) => {
    const read = ++reads.current;
    try {
      const nextList = await api.list();
      if (read !== reads.current) return;
      setList(nextList);
      setQueue((await api.readReports()).reports);
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
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const typed = ground.facts.trim();
      await change.run(api, page, ref ?? "", sentGround(change.need, { ...ground, facts: typed === "" ? null : typed }));
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
  /** A new confirm box starts with an empty ground. */
  const ask = (next: Pending) => { setGround({ grounds: [], source: null, flagId: null, facts: "" }); setPending(next); };
  const stepOf = (line: string, input: PublicReviewStepInput): Pending => ({ line, need: STEP_NEEDS[input.step],
    run: (client2, current, at, chosen) => client2.step(at, current?.revision ?? 0, STEP_NEEDS[input.step] === "NONE" ? input : { ...input, ground: chosen }) });
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
        ask(stepOf(t(catalog, "staff.publicReview.confirm.correct"), { step: "CORRECT", pieceKind: kind, pieceId: id, pointer: piece.pointer, text }));
      }}><div className="staffField"><label htmlFor={`review-${key}`}>{t(catalog, "staff.publicReview.newText")}</label><textarea id={`review-${key}`} name="text" defaultValue={piece.corrected ?? piece.original} rows={3} /></div>
        <div className="staffActions"><button className="setBtn" type="submit">{t(catalog, "staff.publicReview.replace")}</button><button className="setBtn" type="button" onClick={() => setEditing(null)}>{t(catalog, "staff.publicReview.cancel")}</button></div></form>
        : <div className="staffActions"><button className="setBtn" type="button" disabled={busy} onClick={() => setEditing(key)}>{t(catalog, "staff.publicReview.replaceThis")}</button></div>) : null}
    </li>;
  };
  const reportsHere = queue.filter((report) => report.publication_ref === (page?.publication_ref ?? ref));
  const groundFields = pending === null || pending.need === "NONE" ? null : <fieldset className="staffField" data-review-ground={pending.need}>
    <legend>{t(catalog, "staff.publicReview.ground.legend")}</legend>
    <p className="setCardHint">{t(catalog, pending.need === "OPTIONAL" ? "staff.publicReview.ground.optional" : "staff.publicReview.ground.needed")}</p>
    {ModerationGroundSchema.options.map((code) => <p key={code}><input id={`review-ground-${code}`} type="checkbox" checked={ground.grounds.includes(code)}
      onChange={(event) => setGround({ ...ground, grounds: event.target.checked ? [...ground.grounds, code] : ground.grounds.filter((one) => one !== code) })} /> <label htmlFor={`review-ground-${code}`}>{t(catalog, `staff.publicReview.ground.${code}`)}</label></p>)}
    <p className="setCardHint">{t(catalog, "staff.publicReview.source.legend")}</p>
    {ModerationSourceSchema.options.map((code) => <p key={code}><input id={`review-source-${code}`} type="radio" name="review-source" checked={ground.source === code}
      onChange={() => setGround({ ...ground, source: code, flagId: code === "REPORT_BUTTON" ? ground.flagId : null })} /> <label htmlFor={`review-source-${code}`}>{t(catalog, `staff.publicReview.source.${code}`)}</label></p>)}
    {ground.source === "REPORT_BUTTON" ? <div className="staffField"><label htmlFor="review-source-report">{t(catalog, "staff.publicReview.source.whichReport")}</label>
      <select id="review-source-report" value={ground.flagId ?? ""} onChange={(event) => setGround({ ...ground, flagId: event.target.value === "" ? null : event.target.value })}>
        <option value="">{t(catalog, "staff.publicReview.source.chooseReport")}</option>
        {reportsHere.map((report) => <option key={report.flag_id} value={report.flag_id}>{when(report.created_at)}</option>)}
      </select></div> : null}
    {pending.need === "REQUIRED" ? <div className="staffField"><label htmlFor="review-facts">{t(catalog, "staff.publicReview.facts")}</label>
      <textarea id="review-facts" rows={3} maxLength={4000} value={ground.facts} onChange={(event) => setGround({ ...ground, facts: event.target.value })} /></div> : null}
  </fieldset>;
  const ready = pending === null || pending.need !== "REQUIRED" || groundWhole({ ...ground, facts: ground.facts.trim() === "" ? null : ground.facts });
  const confirm = pending === null ? null : <div className="staffMutation" data-review-confirm>
    <p>{pending.line}</p>{groundFields}<p className="setCardHint">{t(catalog, "staff.publicReview.passkeyConfirms")}</p>
    <div className="staffActions"><button className="setBtn setBtnPrimary" type="button" disabled={busy || !ready} onClick={() => { void go(pending); }}>{t(catalog, "staff.publicReview.confirm")}</button>
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
        {list.hidden.map((row) => <li key={row.publication_ref}><button className="setBtn" type="button" onClick={() => { setRef(row.publication_ref); void load(row.publication_ref); }}>{row.publication_ref}</button> <span className="setCardHint">{t(catalog, "staff.publicReview.hiddenSince", { at: when(row.hidden_at) })}</span>{Date.now() - Date.parse(row.hidden_at) > SIX_MONTHS_MS ? <p className="setError" data-review-long-hidden>{t(catalog, "staff.publicReview.longHidden")}</p> : null}</li>)}
      </ul>}
      {page === null ? notice : null}
    </section>
    <section className="setCard" data-report-queue>
      <h2 className="staffSectionTitle">{t(catalog, "staff.publicReports.title")}</h2>
      <p className="setCardHint">{t(catalog, "staff.publicReports.hint")}</p>
      {queue.length === 0 ? <p className="setCardHint">{t(catalog, "staff.publicReports.empty")}</p> : <ul className="staffAuditList">
        {queue.map((report) => <li key={report.flag_id} data-report={report.state}>
          <strong>{t(catalog, `staff.publicReports.state.${report.state}`)}</strong> <time dateTime={report.created_at}>{when(report.created_at)}</time>
          <p>{report.reporter === null ? t(catalog, "staff.publicReports.byGone") : t(catalog, "staff.publicReports.by", { name: report.reporter })}</p>
          {report.claim === null ? <p className="setCardHint">{t(catalog, "staff.publicReports.wordsGone")}</p> : <>
            <p>{t(catalog, "staff.publicReports.where", { text: report.where ?? "" })}</p><p>{t(catalog, "staff.publicReports.claim", { text: report.claim })}</p></>}
          <p className="setCardHint">{t(catalog, report.verdict === null ? "staff.publicReports.verdict.none" : `staff.publicReports.verdict.${report.verdict}`)}{report.reason === null ? "" : ` ${t(catalog, `staff.publicReports.reason.${report.reason}`)}`}{report.debate_hidden ? ` ${t(catalog, "staff.publicReports.debateHidden")}` : ""}</p>
          <div className="staffActions">
            <button className="setBtn" type="button" onClick={() => { setRef(report.publication_ref); void load(report.publication_ref); }}>{t(catalog, "staff.publicReports.open")}</button>
            {/* 0157 (D4): the close says what the person found, and the reporter is told. 0172 (M6): a step that named the report closed it already. */}
            {report.dismissed_at === null ? <>
              <button className="setBtn" type="button" disabled={busy} onClick={() => ask({ line: t(catalog, "staff.publicReports.confirmNoBreach"), need: "NONE", run: (client2) => client2.closeReport(report.flag_id, "NO_BREACH") })}>{t(catalog, "staff.publicReports.closeNoBreach")}</button>
              <button className="setBtn" type="button" disabled={busy} onClick={() => ask({ line: t(catalog, "staff.publicReports.confirmActed"), need: "NONE", run: (client2) => client2.closeReport(report.flag_id, "ACTED") })}>{t(catalog, "staff.publicReports.closeActed")}</button>
            </> : <span className="setCardHint">{t(catalog, report.closed_by_step ? "staff.publicReports.closedByStep" : report.outcome === null ? "staff.publicReports.dismissed" : `staff.publicReports.closed.${report.outcome}`)}</span>}
          </div>
        </li>)}
      </ul>}
      {page === null ? confirm : null}
    </section>
    {page === null ? null : <section className="setCard" data-review-debate={page.hidden ? "HIDDEN" : "PUBLIC"}>
      <h2 className="staffSectionTitle">{page.question}</h2>
      <p>{page.hidden ? t(catalog, "staff.publicReview.isHidden") : t(catalog, "staff.publicReview.isPublic")}</p>
      <div className="staffActions">
        {page.hidden ? <button className="setBtn setBtnPrimary" type="button" disabled={busy || pending !== null} onClick={() => ask(stepOf(t(catalog, "staff.publicReview.confirm.republish"), { step: "REPUBLISH" }))}>{t(catalog, "staff.publicReview.putBack")}</button> : null}
        {page.hidden ? <button className="setBtn" type="button" disabled={busy || pending !== null} onClick={() => ask(stepOf(t(catalog, "staff.publicReview.confirm.decide"), { step: "DECIDE" }))}>{t(catalog, "staff.publicReview.decide")}</button>
          : <button className="setBtn setBtnPrimary" type="button" disabled={busy || pending !== null} onClick={() => ask({ line: t(catalog, "staff.publicReview.confirm.hide"), need: "OPTIONAL", run: (client2, current, at, chosen) => client2.hide(at, current?.revision ?? 0, chosen) })}>{t(catalog, "staff.publicReview.hideNow")}</button>}
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
        {page.hidden && !dig.removed ? <div className="staffActions"><button className="setBtn" type="button" disabled={busy || pending !== null} onClick={() => ask(stepOf(t(catalog, "staff.publicReview.confirm.removeDig", { who: dig.contributor ?? t(catalog, "staff.publicReview.thePerson") }), { step: "REMOVE_DIG", pieceKind: "DIG", pieceId: dig.dig_run_id }))}>{t(catalog, "staff.publicReview.takeOut")}</button></div> : null}
        {page.updates.filter((row) => row.dig_run_id === dig.dig_run_id).map((row) => <div key={row.update_id} data-review-update={row.state}>
          <p><strong>{t(catalog, row.kind === "PATH" ? "staff.publicReview.kind.PATH" : "staff.publicReview.kind.MAIN")}</strong> <span className="setCardHint">{t(catalog, "staff.publicReview.updateLine", { at: when(row.recorded_at), state: t(catalog, `staff.publicReview.state.${row.state}`) })}</span></p>
          {row.before === null ? null : <p className="setCardHint">{t(catalog, "staff.publicReview.before", { text: row.before })}</p>}
          <ul className="staffAuditList">{row.pieces.map((piece) => pieceRow("UPDATE", row.update_id, piece))}</ul>
          {page.hidden && row.state === "AFFECTED" ? <div className="staffActions"><button className="setBtn" type="button" disabled={busy || pending !== null} onClick={() => ask(stepOf(t(catalog, "staff.publicReview.confirm.putBackUpdate"), { step: "PUT_BACK", pieceKind: "UPDATE", pieceId: row.update_id }))}>{t(catalog, "staff.publicReview.putThisBack")}</button></div> : null}
        </div>)}
      </article>)}
      <h3>{t(catalog, "staff.publicReview.reports")}</h3>
      {page.reports.length === 0 ? <p className="setCardHint">{t(catalog, "staff.publicReview.noReports")}</p> : null}
      {page.reports.map((report) => <article key={report.report_id} data-review-report={report.state}>
        <h4>{report.writer === null ? t(catalog, "staff.publicReview.reportHeading", { version: report.report_version, at: when(report.recorded_at) }) : t(catalog, "staff.publicReview.reportHeadingWriter", { version: report.report_version, writer: report.writer, at: when(report.recorded_at) })}</h4>
        <p className="setCardHint">{t(catalog, `staff.publicReview.state.${report.state}`)}</p>
        <ul className="staffAuditList">{report.pieces.map((piece) => pieceRow("REPORT", report.report_id, piece))}</ul>
        {page.hidden ? <div className="staffActions">
          {report.state !== "HIDDEN" ? <button className="setBtn" type="button" disabled={busy || pending !== null} onClick={() => ask(stepOf(t(catalog, "staff.publicReview.confirm.hideReport"), { step: "HIDE_REPORT", pieceKind: "REPORT", pieceId: report.report_id }))}>{t(catalog, "staff.publicReview.hideReport")}</button> : null}
          {report.state === "AFFECTED" ? <button className="setBtn" type="button" disabled={busy || pending !== null} onClick={() => ask(stepOf(t(catalog, "staff.publicReview.confirm.putBackReport"), { step: "PUT_BACK", pieceKind: "REPORT", pieceId: report.report_id }))}>{t(catalog, "staff.publicReview.putThisBack")}</button> : null}
        </div> : null}
      </article>)}
      <h3>{t(catalog, "staff.publicReview.log")}</h3>
      <ul className="staffAuditList" data-review-log>{[...page.log].reverse().map((entry) => <li key={entry.revision}><strong>{t(catalog, `staff.publicReview.action.${entry.action}`)}</strong> <time dateTime={entry.at}>{when(entry.at)}</time> <span className="setCardHint">{t(catalog, "staff.publicReview.logBy", { id: entry.actor_staff_id.replaceAll("-", "") })}</span></li>)}</ul>
    </section>}
  </div>;
}
