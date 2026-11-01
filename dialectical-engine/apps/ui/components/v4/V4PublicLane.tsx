"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { WEB_CONTRACT_LIMITS, type PublicDebate, type PublicReportVersion } from "@debateai/contract";
import { FinishedReportBody } from "@/components/v4/V4ReportClient";
import { validateSession } from "@/lib/api";
import { formatDate, t, type MessageCatalog } from "@/lib/i18n/translate";
import {
  contributorName, pressPublicReport, publicDigAsk, reportsNewestFirst, type PublicAddition, type PublicPathView, type PublicReportPress
} from "@/lib/v4/publicPage";
import { levelHref, useReadingLevel } from "@/lib/v4/storage";
import { picksMax } from "@/lib/v4/suggestions";
import { useV4Ask } from "@/lib/v4/useV4Ask";

/*
 * Decisions 13, 16 and 22 of 31 Oct on a public page. Under each path: who added to it and when, the digs on it with their own paths, and "Dig into this";
 * the Reports section, with "Write a report". A signed-in stranger digs and writes on their own quota; no AI suggestions on a stranger's page in R22. The
 * dig goes through the one ask hook (consent, room, refusals), so the page starts nothing another way. English for R22 (owner N10), like V4's other labels.
 */

/** "Write a report": how often the page reads itself again while the report is written, and how long before it stops asking. */
const REPORT_REFRESH_MS = 15_000;
const REPORT_REFRESHES_MAX = 40;

export type V4PublicLaneConfig = Readonly<{
  catalog: MessageCatalog;
  homeCatalog: MessageCatalog | undefined;
  newDebateCatalog: MessageCatalog | undefined;
  locale: string;
  crisisCountryHint: string | null;
}>;

type LaneActions = Readonly<{
  /** null while the session read has not answered: nothing is offered yet. */
  signedIn: boolean | null;
  signInHref: string;
  planTier: "free" | "premium";
  busy: boolean;
  /** Starts the dig and goes to its own page; the plain refusal when it did not start, null when it did (or the person stopped it). */
  startDig(path: PublicPathView, views: readonly string[]): Promise<string | null>;
  writeReport(): Promise<PublicReportPress>;
}>;

const LaneContext = createContext<LaneActions | null>(null);

function SignedInActions({ debate, lane, signInHref, children }: Readonly<{ debate: PublicDebate; lane: V4PublicLaneConfig; signInHref: string; children: ReactNode }>) {
  const router = useRouter();
  const { catalog, locale } = lane;
  const [savedLevel] = useReadingLevel(null);
  const ask = useV4Ask({
    catalog,
    homeCatalog: lane.homeCatalog ?? {},
    newDebateCatalog: lane.newDebateCatalog ?? {},
    locale,
    crisisCountryHint: lane.crisisCountryHint,
    mode: "quick",
    readingLevel: savedLevel ?? "plain"
  });
  const { submit, room, planTier, submitting, dialogs } = ask;
  const [started, setStarted] = useState(false);
  const startDig = useCallback(async (path: PublicPathView, views: readonly string[]): Promise<string | null> => {
    const sent = publicDigAsk({ publicRef: debate.public_ref, question: debate.question, path, views, catalog, locale });
    if (sent === null) return t(catalog, "v4.dig.failed");
    try {
      const outcome = await submit(sent.questionLine, "quick", "dig", sent.parent);
      if (outcome.kind === "REFUSED") return outcome.message;
      if (outcome.kind === "STARTED" && outcome.notJoined === true) return t(catalog, "v4.public.dig.notJoined");
      if (outcome.kind === "STARTED") {
        setStarted(true);
        router.push(levelHref(`/v4/debate/${encodeURIComponent(outcome.runId)}`, savedLevel));
      }
      return null;
    } catch {
      return t(catalog, "v4.dig.failed");
    }
  }, [debate.public_ref, debate.question, catalog, locale, submit, router, savedLevel]);
  const writeReport = useCallback(() => pressPublicReport(debate.public_ref, { catalog, room, locale }), [debate.public_ref, catalog, room, locale]);
  const actions = useMemo<LaneActions>(() => ({ signedIn: true, signInHref, planTier, busy: submitting || started, startDig, writeReport }),
    [signInHref, planTier, submitting, started, startDig, writeReport]);
  return (
    <LaneContext.Provider value={actions}>
      {children}
      {dialogs}
    </LaneContext.Provider>
  );
}

/** Reads the session once, from the browser: a stranger's page is served alike to everyone, so what it offers is decided here. */
export function V4PublicLaneProvider({ debate, lane, children }: Readonly<{ debate: PublicDebate; lane: V4PublicLaneConfig; children: ReactNode }>) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    void validateSession().then(() => { if (active) setSignedIn(true); }, () => { if (active) setSignedIn(false); });
    return () => { active = false; };
  }, []);
  const signInHref = `/login?next=${encodeURIComponent(`/public/debate/${encodeURIComponent(debate.public_ref)}`)}`;
  if (signedIn === true) return <SignedInActions debate={debate} lane={lane} signInHref={signInHref}>{children}</SignedInActions>;
  const quiet: LaneActions = {
    signedIn, signInHref, planTier: "free", busy: false, startDig: async () => null, writeReport: async () => ({ kind: "REFUSED", message: "" })
  };
  return <LaneContext.Provider value={quiet}>{children}</LaneContext.Provider>;
}

function useDayWords(locale: string): (day: string) => string {
  // A contribution's day is a calendar date: said as written, whatever the reader's clock.
  return (day) => formatDate(locale, `${day}T00:00:00.000Z`, { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" });
}

function Addition({ addition, catalog, locale }: Readonly<{ addition: PublicAddition; catalog: MessageCatalog; locale: string }>) {
  const day = useDayWords(locale);
  return <p className="v4PubAddedBy">{t(catalog, "v4.public.addedBy", { name: contributorName(addition.contributor, catalog), date: day(addition.on) })}</p>;
}

/** "Dig into this": the person's own view, up to what their plan combines, on their own quota. */
function DigBox({ path, catalog }: Readonly<{ path: PublicPathView; catalog: MessageCatalog }>) {
  const actions = useContext(LaneContext);
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState<readonly string[]>([""]);
  const [refusal, setRefusal] = useState<string | null>(null);
  if (actions === null || actions.signedIn === null) return null;
  if (!actions.signedIn) return <Link className="v4Link v4PubAction" href={actions.signInHref}>{t(catalog, "v4.public.dig.signIn")}</Link>;
  if (!open) {
    return <button type="button" className="v4Btn v4PubAction" onClick={() => setOpen(true)}>{t(catalog, "v4.public.dig.open")}</button>;
  }
  const room = picksMax(actions.planTier) - views.length;
  const written = views.some((view) => view.trim().length > 0);
  const start = async (): Promise<void> => {
    setRefusal(null);
    setRefusal(await actions.startDig(path, views));
  };
  return (
    <div className="v4PubDig">
      <p className="v4PubHint">{t(catalog, "v4.public.dig.terms")}</p>
      {views.map((view, at) => (
        <div key={at} className="v4PubDigField">
          <label className="v4PubLabel" htmlFor={`${ids}-${at}`}>{t(catalog, "v4.suggest.ownViewLabel")}</label>
          <textarea
            id={`${ids}-${at}`}
            className="v4PubText"
            rows={2}
            dir="auto"
            value={view}
            maxLength={WEB_CONTRACT_LIMITS.pickTextMaxChars}
            onChange={(event) => setViews(views.map((other, where) => (where === at ? event.target.value : other)))}
          />
        </div>
      ))}
      {room > 0 ? (
        <button type="button" className="v4Link" onClick={() => setViews([...views, ""])}>{t(catalog, "v4.public.dig.addView")}</button>
      ) : <p className="v4PubHint">{t(catalog, "v4.public.dig.viewsFull")}</p>}
      <div className="v4PubDigActions">
        <button type="button" className="v4Btn v4BtnPrimary" disabled={!written || actions.busy} aria-busy={actions.busy} onClick={() => void start()}>
          {t(catalog, actions.busy ? "v4.ask.starting" : "v4.public.dig.start")}
        </button>
        <button type="button" className="v4Link" disabled={actions.busy} onClick={() => setOpen(false)}>{t(catalog, "v4.public.dig.cancel")}</button>
      </div>
      {refusal === null ? null : <p className="v4AskRefusal" role="alert">{refusal}</p>}
    </div>
  );
}

/** Under one path: its newest text, who added to it and when, the digs on it with their own paths, and the Dig action. */
export function V4PublicPathNote({ path, catalog, locale, actions = true }: Readonly<{ path: PublicPathView; catalog: MessageCatalog; locale: string; actions?: boolean }>) {
  const newest = path.additions[0];
  return (
    <div className="v4Root v4PublicLane v4PubPathNote">
      {path.summary === null ? null : <p className="v4PubSummary" dir="auto" data-ai-generated="true">{path.summary}</p>}
      {newest === undefined || newest.whatChanged.length === 0 ? null : (
        <ul className="v4PubChanged">
          {newest.whatChanged.map((line, at) => <li key={at} dir="auto" data-ai-generated="true">{line}</li>)}
        </ul>
      )}
      {path.additions.map((addition, at) => <Addition key={at} addition={addition} catalog={catalog} locale={locale} />)}
      {path.points.length === 0 ? null : (
        <ul className="v4PubChanged">
          {path.points.map((point, at) => <li key={at} dir="auto" data-ai-generated="true">{point}</li>)}
        </ul>
      )}
      {actions && path.canDig ? <DigBox path={path} catalog={catalog} /> : null}
      {path.digs.map((dig, at) => (dig.paths.length === 0 ? null : (
        <div key={dig.ref ?? at} className="v4PubDigPaths">
          <p className="v4PubLabel">{t(catalog, "v4.public.digPaths")}</p>
          <ul className="v4PubDigPathList">
            {dig.paths.map((own) => (
              <li key={own.ref}>
                <p className="v4PubDigPathLine" dir="auto" data-ai-generated="true">{own.line}</p>
                <V4PublicPathNote path={own} catalog={catalog} locale={locale} actions={actions} />
              </li>
            ))}
          </ul>
        </div>
      )))}
    </div>
  );
}

/** The writer only as a reference, the day it was written, and the report. */
function PublicReport({ report, catalog, locale }: Readonly<{ report: PublicReportVersion; catalog: MessageCatalog; locale: string }>) {
  const written = formatDate(locale, report.written_at, { year: "numeric", month: "long", day: "numeric" });
  return (
    <>
      <p className="v4PubAddedBy">{t(catalog, "v4.public.report.writtenBy", { name: contributorName(report.writer, catalog) })} · {written}</p>
      <FinishedReportBody version={report} state="READY" catalog={catalog} />
    </>
  );
}

/** Refreshes the page from the server until it shows the version being written; the press's own line stays meanwhile. */
function ReportButton({ debate, catalog }: Readonly<{ debate: PublicDebate; catalog: MessageCatalog }>) {
  const actions = useContext(LaneContext);
  const [state, setState] = useState<Readonly<{ kind: "IDLE" | "PRESSING" }> | PublicReportPress>({ kind: "IDLE" });
  if (actions === null || actions.signedIn === null) return null;
  if (!actions.signedIn) return <Link className="v4Link v4PubAction" href={actions.signInHref}>{t(catalog, "v4.public.report.signIn")}</Link>;
  const press = async (): Promise<void> => {
    setState({ kind: "PRESSING" });
    setState(await actions.writeReport());
  };
  const writingVersion = state.kind === "WRITING" ? state.version : null;
  const shown = writingVersion !== null && (debate.reports ?? []).some((report) => report.report_version >= writingVersion);
  return (
    <div className="v4PubReportPress">
      {writingVersion === null || shown ? (
        <>
          <p className="v4PubHint">{t(catalog, "v4.public.report.terms")}</p>
          <button type="button" className="v4Btn" disabled={state.kind === "PRESSING"} aria-busy={state.kind === "PRESSING"} onClick={() => void press()}>
            {t(catalog, "v4.public.report.write")}
          </button>
        </>
      ) : (
        <>
          <p className="v4PubHint" role="status">{t(catalog, "v4.public.report.writing")}</p>
          <ReportRefresher />
        </>
      )}
      {state.kind === "REFUSED" ? <p className="v4AskRefusal" role="alert">{state.message}</p> : null}
    </div>
  );
}

function ReportRefresher() {
  const router = useRouter();
  useEffect(() => {
    let reads = 0;
    const timer = window.setInterval(() => {
      reads += 1;
      if (reads > REPORT_REFRESHES_MAX) window.clearInterval(timer);
      else router.refresh();
    }, REPORT_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [router]);
  return null;
}

/** Reports: every version anyone wrote, newest first; the earlier ones stay readable, one click away. */
export function V4PublicReports({ debate, catalog, locale }: Readonly<{ debate: PublicDebate; catalog: MessageCatalog; locale: string }>) {
  const actions = useContext(LaneContext);
  const [current, ...earlier] = reportsNewestFirst(debate.reports);
  // A page with no way to press (a publication review) and nothing written has no section.
  if (current === undefined && actions === null) return null;
  return (
    <section className="v4Root v4PublicLane v4PubReports" aria-labelledby="public-reports-title">
      <h2 id="public-reports-title" className="v4PubHeading">{t(catalog, "v4.public.reports")}</h2>
      {current === undefined ? null : <PublicReport report={current} catalog={catalog} locale={locale} />}
      {earlier.map((report) => (
        <details key={report.report_version} className="v4PubEarlier">
          <summary>{t(catalog, "v4.public.report.earlier", { version: report.report_version })}</summary>
          <PublicReport report={report} catalog={catalog} locale={locale} />
        </details>
      ))}
      <ReportButton debate={debate} catalog={catalog} />
    </section>
  );
}
