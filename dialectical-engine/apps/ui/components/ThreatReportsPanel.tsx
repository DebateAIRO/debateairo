"use client";
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { ContractHttpError, ThreatReportListSchema, ThreatReportSchema } from "@debateai/contract";
import type { z } from "zod";
import { createThreatReportsClient, type ThreatReportsClient } from "../lib/threatReportsApi.js";
import { formatDate, t, type MessageCatalog } from "../lib/i18n/translate.js";
import type { LocaleCode } from "../lib/i18n/locales.js";
import staffEnglish from "../messages/en/staff.json";
import "./StaffAccessPanel.css";

type Summary = z.infer<typeof ThreatReportListSchema>["reports"][number];
type Report = z.infer<typeof ThreatReportSchema>;
type View = "list" | "item" | "noAccess" | "gone" | "loadFailed" | "verifyFirst";
const requestedReport = () => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("report");
function hasStaffAuthorityInThisTab(): boolean {
  try {
    const stored = sessionStorage.getItem("debateai:staff-authority");
    if (stored === null) return false;
    const authority: unknown = JSON.parse(stored);
    if (authority === null || typeof authority !== "object") return false;
    const expiresAt = (authority as { expires_at?: unknown }).expires_at;
    return typeof expiresAt === "string" && Date.parse(expiresAt) > Date.now();
  } catch { return false; }
}

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
      if (client === undefined && !hasStaffAuthorityInThisTab()) {
        setReport(null); setRows([]); setView("verifyFirst");
        return;
      }
      const ref = requestedReport(); void (ref === null ? loadList() : loadItem(ref));
    };
    loadLocation();
    window.addEventListener("popstate", loadLocation);
    return () => { window.removeEventListener("popstate", loadLocation); api.cancel(); };
  }, [api, client, loadItem, loadList]);
  function open(event: MouseEvent<HTMLAnchorElement>, ref: string) {
    event.preventDefault();
    history.pushState(null, "", `/admin/threat-reports?report=${encodeURIComponent(ref)}`);
    void loadItem(ref);
  }
  function backList() {
    history.pushState(null, "", "/admin/threat-reports");
    setNotice(null);
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
      await loadList();
      setNotice("staff.complete");
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
  return <div className="setInner staffAccess threatReportsPage" aria-busy={busy}>
    {view !== "item" && view !== "gone" ? <a className="setBtn setBtnQuiet threatReportsBackTop" href="/admin/team">{t(catalog, "staff.threatReports.backTeam")}</a> : null}
    <header className="staffHeading"><p className="setEyebrow">{t(catalog, "staff.eyebrow")}</p><h1 className="setTitle">{t(catalog, "staff.threatReports.title")}</h1><p className="setLede">{t(catalog, "staff.threatReports.lede")}</p></header>
    {notice !== null ? <p className="staffNotice" role="status">{t(catalog, notice)}</p> : null}
    {view === "noAccess" ? <p className="setError" role="status">{t(catalog, "staff.threatReports.noAccess")}</p> : null}
    {view === "gone" ? <p className="setError" role="status">{t(catalog, "staff.threatReports.gone")}</p> : null}
    {view === "verifyFirst" ? <p className="setError" role="status">{t(catalog, "staff.threatReports.verifyFirst")}</p> : null}
    {view === "loadFailed" ? <p className="setError" role="status">{t(catalog, "staff.threatReports.loadFailed")}</p> : null}
    {view === "gone" ? <button className="setBtn setBtnQuiet threatReportsBackList" type="button" onClick={backList}>{t(catalog, "staff.threatReports.backList")}</button> : null}
    {view === "item" && alreadyDecided ? <p className="setError" role="status">{t(catalog, "staff.threatReports.alreadyDecided")}</p> : null}
    {view === "list" ? <section className="setCard"><h2 className="staffSectionTitle">{t(catalog, "staff.threatReports.listTitle")}</h2>
      {rows.length === 0 ? <p className="setCardHint">{t(catalog, "staff.threatReports.empty")}</p> : <ul className="threatReportsList">{rows.map(row => <li className="threatReportsRow" data-report-ref={row.report_ref} key={row.report_ref}><time className="threatReportsKeptAt" dateTime={row.kept_at}>{shortDate(row.kept_at)}</time>{badge(row)}<a className="setBtn" href={`/admin/threat-reports?report=${encodeURIComponent(row.report_ref)}`} onClick={event => open(event, row.report_ref)}>{t(catalog, "staff.threatReports.open")}</a></li>)}</ul>}
    </section> : null}
    {view === "item" && report !== null ? <section className="setCard"><div className="staffSectionHead"><h2 className="staffSectionTitle">{t(catalog, "staff.threatReports.itemTitle")}</h2>{badge(report)}</div>
      <p className="threatReportsQuestion">{report.question}</p>
      <dl className="threatReportsFacts"><div><dt>{t(catalog, "staff.threatReports.keptAt")}</dt><dd><time dateTime={report.kept_at}>{shortDate(report.kept_at)}</time></dd></div><div><dt>{t(catalog, "staff.threatReports.email")}</dt><dd>{report.account.email}</dd></div><div><dt>{t(catalog, "staff.threatReports.userId")}</dt><dd>{report.account.user_id ?? "—"}</dd></div></dl>
      {report.decision === "UNREAD" && !alreadyDecided ? <><p className="setCardHint threatReportsDecideHint">{t(catalog, "staff.threatReports.decideHint")}</p><div className="staffActions threatReportsDecisions"><button className="setBtn setBtnPrimary" type="button" disabled={busy} onClick={() => { void decide("REPORTED"); }}>{t(catalog, "staff.threatReports.reported")}</button><button className="setBtn" type="button" disabled={busy} onClick={() => { void decide("NOT_REPORTED"); }}>{t(catalog, "staff.threatReports.notReported")}</button></div></> : null}
      <button className="setBtn setBtnQuiet threatReportsBackList" type="button" onClick={backList}>{t(catalog, "staff.threatReports.backList")}</button>
    </section> : null}
  </div>;
}
