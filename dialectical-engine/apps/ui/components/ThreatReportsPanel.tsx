"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { ContractHttpError, ThreatReportListSchema, ThreatReportSchema } from "@debateai/contract";
import type { z } from "zod";
import { createThreatReportsClient, type ThreatReportsClient } from "../lib/threatReportsApi.js";
import { formatDate, t, type MessageCatalog } from "../lib/i18n/translate.js";
import { focusIsLost } from "../lib/focusGuard.js";
import type { LocaleCode } from "../lib/i18n/locales.js";
import staffEnglish from "../messages/en/staff.json";
import "./StaffAccessPanel.css";

type Summary = z.infer<typeof ThreatReportListSchema>["reports"][number];
type Report = z.infer<typeof ThreatReportSchema>;
type View = "list" | "item" | "noAccess" | "gone" | "loadFailed" | "verifyFirst";
const requestedReport = () => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("report");
export function ThreatReportsPanel({ client, catalog = staffEnglish, locale = "en" }: {
  client?: ThreatReportsClient;
  catalog?: MessageCatalog;
  locale?: LocaleCode;
}) {
  const api = useMemo(() => client ?? createThreatReportsClient(), [client]);
  const [view, setView] = useState<View>("list");
  const [rows, setRows] = useState<Summary[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [alreadyDecided, setAlreadyDecided] = useState(false);
  // Keyboard audit 2026-11-12: each view swap takes the focused link or button with it. A swap the person asked for
  // (Open, Back, the browser's Back) puts focus on the report's heading, or on the row just read in the list (the
  // list's heading when that row is gone); a decision puts it on the notice that says it was recorded. A page opened
  // straight on a report takes no focus.
  const steered = useRef(false);
  const shownView = useRef(view);
  const lastRead = useRef<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const itemHeading = useRef<HTMLHeadingElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const noticeLine = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (shownView.current === view) return;
    shownView.current = view;
    if (!steered.current) return;
    steered.current = false;
    if (!focusIsLost()) return;
    if (view === "item") itemHeading.current?.focus();
    else if (view === "list") {
      const row = lastRead.current === null ? null : panel.current?.querySelector<HTMLElement>(`[data-report-ref="${lastRead.current}"] a`);
      (row ?? listHeading.current)?.focus();
    }
  }, [view]);
  useEffect(() => {
    if (notice !== null && (focusIsLost() || document.activeElement?.matches(":disabled"))) noticeLine.current?.focus();
  }, [notice]);
  const shortDate = (value: string) => formatDate(locale, value, { dateStyle: "medium", timeStyle: "short" });
  const reportedDate = (value: string) => formatDate(locale, value, { dateStyle: "medium" });
  const status = (failure: unknown, missing: View = "loadFailed"): View => failure instanceof ContractHttpError && failure.status === 403
    ? "noAccess" : failure instanceof ContractHttpError && failure.status === 401 ? "verifyFirst"
      : failure instanceof ContractHttpError && failure.status === 404 ? missing : "loadFailed";
  const loadList = useCallback(async () => {
    setReport(null);
    setAlreadyDecided(false);
    setBusy(true);
    try {
      const value = await api.list();
      setRows([...value.reports].filter(row => row.decision !== "NOT_REPORTED")
        .sort((a, b) => a.kept_at.localeCompare(b.kept_at) || a.report_ref.localeCompare(b.report_ref)));
      setView("list");
    } catch (failure) {
      setRows([]);
      setView(status(failure));
    } finally { setBusy(false); }
  }, [api]);
  const loadItem = useCallback(async (ref: string) => {
    setReport(null);
    setAlreadyDecided(false);
    setBusy(true);
    lastRead.current = ref;
    try {
      const value = await api.read(ref);
      setReport(value);
      setView("item");
    } catch (failure) {
      setView(status(failure, "gone"));
    } finally { setBusy(false); }
  }, [api]);
  useEffect(() => {
    const loadLocation = () => {
      const ref = requestedReport(); void (ref === null ? loadList() : loadItem(ref));
    };
    loadLocation();
    const moved = () => { steered.current = true; loadLocation(); };
    window.addEventListener("popstate", moved);
    return () => { window.removeEventListener("popstate", moved); api.cancel(); };
  }, [api, loadItem, loadList]);
  function open(event: MouseEvent<HTMLAnchorElement>, ref: string) {
    event.preventDefault();
    history.pushState(null, "", `/admin/threat-reports?report=${encodeURIComponent(ref)}`);
    steered.current = true;
    void loadItem(ref);
  }
  function backList() {
    history.pushState(null, "", "/admin/threat-reports");
    setNotice(null);
    steered.current = true;
    void loadList();
  }
  async function decide(decision: "REPORTED" | "NOT_REPORTED") {
    if (report === null || busy || report.decision !== "UNREAD") return;
    const ref = report.report_ref;
    setBusy(true);
    setNotice(null);
    try {
      await api.decide(ref, decision);
      history.replaceState(null, "", "/admin/threat-reports");
      // Said before the list is read again (the decision is recorded either way), so focus waits on it meanwhile.
      setNotice("staff.complete");
      await loadList();
    } catch (failure) {
      if (failure instanceof ContractHttpError && failure.status === 409) {
        try {
          const current = await api.read(ref);
          setReport(current);
          setAlreadyDecided(true);
          setView("item");
        } catch (reloadFailure) {
          setReport(null);
          setView(status(reloadFailure, "gone"));
        }
      } else {
        setReport(null);
        setView(status(failure, "gone"));
      }
    } finally { setBusy(false); }
  }
  function badge(row: Summary) {
    const reported = row.decision === "REPORTED";
    return <span className="staffBadge" data-state={reported ? "active" : "unread"}>{reported
      ? t(catalog, "staff.threatReports.decision.REPORTED", { date: row.decided_at === null ? "" : reportedDate(row.decided_at) })
      : t(catalog, "staff.threatReports.decision.UNREAD")}</span>;
  }
  return <div className="setInner staffAccess threatReportsPage" aria-busy={busy} ref={panel}>
    {view !== "item" && view !== "gone" ? <a className="setBtn setBtnQuiet threatReportsBackTop" href="/admin/team">{t(catalog, "staff.threatReports.backTeam")}</a> : null}
    <header className="staffHeading"><p className="setEyebrow">{t(catalog, "staff.eyebrow")}</p><h1 className="setTitle">{t(catalog, "staff.threatReports.title")}</h1><p className="setLede">{t(catalog, "staff.threatReports.lede")}</p></header>
    {notice !== null ? <p className="staffNotice" role="status" ref={noticeLine} tabIndex={-1}>{t(catalog, notice)}</p> : null}
    {view === "noAccess" ? <p className="setError" role="status">{t(catalog, "staff.threatReports.noAccess")}</p> : null}
    {view === "gone" ? <p className="setError" role="status">{t(catalog, "staff.threatReports.gone")}</p> : null}
    {view === "verifyFirst" ? <p className="setError" role="status">{t(catalog, "staff.threatReports.verifyFirst")}</p> : null}
    {view === "loadFailed" ? <p className="setError" role="status">{t(catalog, "staff.threatReports.loadFailed")}</p> : null}
    {view === "gone" ? <button className="setBtn setBtnQuiet threatReportsBackList" type="button" onClick={backList}>{t(catalog, "staff.threatReports.backList")}</button> : null}
    {view === "item" && alreadyDecided ? <p className="setError" role="status">{t(catalog, "staff.threatReports.alreadyDecided")}</p> : null}
    {view === "list" ? <section className="setCard"><h2 className="staffSectionTitle" ref={listHeading} tabIndex={-1}>{t(catalog, "staff.threatReports.listTitle")}</h2>
      {rows.length === 0 ? <p className="setCardHint">{t(catalog, "staff.threatReports.empty")}</p> : <ul className="threatReportsList">{rows.map(row => <li className="threatReportsRow" data-report-ref={row.report_ref} key={row.report_ref}><time className="threatReportsKeptAt" dateTime={row.kept_at}>{shortDate(row.kept_at)}</time>{badge(row)}<a className="setBtn" href={`/admin/threat-reports?report=${encodeURIComponent(row.report_ref)}`} onClick={event => open(event, row.report_ref)}>{t(catalog, "staff.threatReports.open")}</a></li>)}</ul>}
    </section> : null}
    {view === "item" && report !== null ? <section className="setCard"><div className="staffSectionHead"><h2 className="staffSectionTitle" ref={itemHeading} tabIndex={-1}>{t(catalog, "staff.threatReports.itemTitle")}</h2>{badge(report)}</div>
      <p className="threatReportsQuestion">{report.question}</p>
      <dl className="threatReportsFacts"><div><dt>{t(catalog, "staff.threatReports.keptAt")}</dt><dd><time dateTime={report.kept_at}>{shortDate(report.kept_at)}</time></dd></div><div><dt>{t(catalog, "staff.threatReports.email")}</dt><dd>{report.account?.email ?? "—"}</dd></div><div><dt>{t(catalog, "staff.threatReports.userId")}</dt><dd>{report.account?.user_id ?? "—"}</dd></div></dl>
      {report.decision === "UNREAD" && !alreadyDecided ? <><p className="setCardHint threatReportsDecideHint">{t(catalog, "staff.threatReports.decideHint")}</p><div className="staffActions threatReportsDecisions"><button className="setBtn setBtnPrimary" type="button" disabled={busy} onClick={() => { void decide("REPORTED"); }}>{t(catalog, "staff.threatReports.reported")}</button><button className="setBtn" type="button" disabled={busy} onClick={() => { void decide("NOT_REPORTED"); }}>{t(catalog, "staff.threatReports.notReported")}</button></div></> : null}
      <button className="setBtn setBtnQuiet threatReportsBackList" type="button" onClick={backList}>{t(catalog, "staff.threatReports.backList")}</button>
    </section> : null}
  </div>;
}
