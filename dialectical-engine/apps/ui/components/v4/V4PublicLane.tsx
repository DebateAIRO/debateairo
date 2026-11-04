"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { WEB_CONTRACT_LIMITS, type PublicDebate, type PublicReportVersion } from "@debateai/contract";
import { FinishedReportBody } from "@/components/v4/V4ReportClient";
import {
  DIG_RETURN_PARAM, DIG_RETURN_UNDER_PARAM, publicDigReturnPath, signInHrefs, usePublicSignedIn
} from "@/components/v4/V4PublicSession";
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
/** The Reports section's place on the page: where "Write a report" brings a visitor back to after signing in. */
const REPORTS_ANCHOR = "public-reports";

export type V4PublicLaneConfig = Readonly<{
  catalog: MessageCatalog;
  homeCatalog: MessageCatalog | undefined;
  newDebateCatalog: MessageCatalog | undefined;
  locale: string;
  crisisCountryHint: string | null;
}>;

/** What a dig press came to: a refusal in plain words, or a dig that runs as the person's own private debate (public-f10). */
type DigOutcome = Readonly<{ kind: "REFUSED"; message: string }> | Readonly<{ kind: "PRIVATE"; href: string }>;

type LaneActions = Readonly<{
  /** null while the session read has not answered: the places are held, nothing is offered yet. */
  signedIn: boolean | null;
  /** This page's address, with the way back to one path's dig box (public-f13); null: the page itself. */
  returnPath(path: PublicPathView | null): string;
  planTier: "free" | "premium";
  busy: boolean;
  /** Starts the dig and goes to its own page; what it came to when it did not go there, null when it did (or the person stopped it). */
  startDig(path: PublicPathView, views: readonly string[]): Promise<DigOutcome | null>;
  writeReport(): Promise<PublicReportPress>;
}>;

const LaneContext = createContext<LaneActions | null>(null);

/** public-f23: who made each dig on the page, by the dig's reference, so a deeper level can say "From Quiet Heron's dig". */
const DigMakersContext = createContext<ReadonlyMap<string, string | null>>(new Map());

function SignedInActions({ debate, lane, returnPath, children }: Readonly<{
  debate: PublicDebate; lane: V4PublicLaneConfig; returnPath: LaneActions["returnPath"]; children: ReactNode;
}>) {
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
  const startDig = useCallback(async (path: PublicPathView, views: readonly string[]): Promise<DigOutcome | null> => {
    const failed: DigOutcome = { kind: "REFUSED", message: t(catalog, "v4.dig.failed") };
    const sent = publicDigAsk({ publicRef: debate.public_ref, question: debate.question, path, views, catalog, locale });
    if (sent === null) return failed;
    try {
      const outcome = await submit(sent.questionLine, "quick", "dig", sent.parent);
      if (outcome.kind === "REFUSED") return { kind: "REFUSED", message: outcome.message };
      if (outcome.kind !== "STARTED") return null;
      const href = levelHref(`/v4/debate/${encodeURIComponent(outcome.runId)}`, savedLevel);
      // public-f10: it started, as the person's own private debate; the page stays, with a calm note and the way to it.
      if (outcome.notJoined === true) return { kind: "PRIVATE", href };
      setStarted(true);
      router.push(href);
      return null;
    } catch {
      return failed;
    }
  }, [debate.public_ref, debate.question, catalog, locale, submit, router, savedLevel]);
  const writeReport = useCallback(() => pressPublicReport(debate.public_ref, { catalog, room, locale }), [debate.public_ref, catalog, room, locale]);
  const actions = useMemo<LaneActions>(() => ({ signedIn: true, returnPath, planTier, busy: submitting || started, startDig, writeReport }),
    [returnPath, planTier, submitting, started, startDig, writeReport]);
  return (
    <LaneContext.Provider value={actions}>
      {children}
      {dialogs}
    </LaneContext.Provider>
  );
}

/** The session comes from the page's one read (public-f13): a stranger's page is served alike to everyone, so what it offers is decided in the browser. */
export function V4PublicLaneProvider({ debate, lane, children }: Readonly<{ debate: PublicDebate; lane: V4PublicLaneConfig; children: ReactNode }>) {
  const signedIn = usePublicSignedIn();
  const returnPath = useCallback((path: PublicPathView | null) => publicDigReturnPath(debate.public_ref, path), [debate.public_ref]);
  const makers = useMemo(() => {
    const byDig = new Map<string, string | null>();
    for (const contribution of debate.contributions ?? []) {
      if (contribution.update_ref !== undefined && !byDig.has(contribution.update_ref)) byDig.set(contribution.update_ref, contribution.contributor);
    }
    return byDig;
  }, [debate.contributions]);
  const quiet = useMemo<LaneActions>(() => ({
    signedIn, returnPath, planTier: "free", busy: false, startDig: async () => null, writeReport: async () => ({ kind: "REFUSED", message: "" })
  }), [signedIn, returnPath]);
  return (
    <DigMakersContext.Provider value={makers}>
      {signedIn === true
        ? <SignedInActions debate={debate} lane={lane} returnPath={returnPath}>{children}</SignedInActions>
        : <LaneContext.Provider value={quiet}>{children}</LaneContext.Provider>}
    </DigMakersContext.Provider>
  );
}

function useDayWords(locale: string): (day: string) => string {
  // A contribution's day is a calendar date: said as written, whatever the reader's clock.
  return (day) => formatDate(locale, `${day}T00:00:00.000Z`, { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" });
}

/** r2-17: "Quiet Heron added to this on 2 November", a whole sentence; a name that went starts it as "A contributor". */
function Addition({ addition, catalog, locale }: Readonly<{ addition: PublicAddition; catalog: MessageCatalog; locale: string }>) {
  const day = useDayWords(locale);
  const date = day(addition.on);
  return (
    <p className="v4PubAddedBy">
      {addition.contributor === null
        ? t(catalog, "v4.public.addedByGone", { date })
        : t(catalog, "v4.public.addedBy", { name: addition.contributor, date })}
    </p>
  );
}

/** r2-21: a signed-out visitor is offered both ways in, each bringing them back to the same place (public-f13). */
function SignInChoice({ lead, returnPath, catalog }: Readonly<{ lead: string; returnPath: string; catalog: MessageCatalog }>) {
  const hrefs = signInHrefs(returnPath);
  return (
    <p className="v4PubSignIn" data-public-sign-in>
      <span>{t(catalog, lead)}</span>{" "}
      <Link className="v4Link" href={hrefs.signUp}>{t(catalog, "v4.public.signedOut.createAccount")}</Link>
      <span aria-hidden="true"> · </span>
      <Link className="v4Link" href={hrefs.signIn}>{t(catalog, "v4.public.signedOut.signIn")}</Link>
    </p>
  );
}

/** public-f13: the button's place, held while the session read has not answered, so nothing pops in under the reader. */
function HeldPlace({ label }: Readonly<{ label: string }>) {
  return <span className="v4Btn v4PubAction v4PubHold" aria-hidden="true" data-public-held>{label}</span>;
}

/** True when this page's address names this path's dig box: the way back after signing in (public-f13), from the address only. */
function addressOpensDig(path: PublicPathView): boolean {
  const query = new URLSearchParams(window.location.search);
  return query.get(DIG_RETURN_PARAM) === path.ref && (query.get(DIG_RETURN_UNDER_PARAM) ?? null) === path.digRef;
}

type ViewBox = Readonly<{ id: number; text: string }>;

/** "Dig into this": the person's own view, up to what their plan combines, on their own quota. */
function DigBox({ path, catalog }: Readonly<{ path: PublicPathView; catalog: MessageCatalog }>) {
  const actions = useContext(LaneContext);
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState<readonly ViewBox[]>([{ id: 0, text: "" }]);
  const nextView = useRef(1);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [privateHref, setPrivateHref] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const fields = useRef(new Map<number, HTMLTextAreaElement>());
  /** Where focus goes once the box has drawn: a box's field, the open button, or (back from sign-in) the first field, scrolled to. */
  const focusNext = useRef<Readonly<{ kind: "FIELD"; id: number; scroll: boolean }> | Readonly<{ kind: "OPEN_BUTTON" }> | null>(null);
  const signedIn = actions?.signedIn ?? null;
  const returned = useRef(false);
  useEffect(() => {
    // Once, when the session is known: the address keeps naming this box, so a reload lands here again, and nothing else is kept.
    if (returned.current || signedIn !== true) return;
    returned.current = true;
    if (!addressOpensDig(path)) return;
    focusNext.current = { kind: "FIELD", id: 0, scroll: true };
    setOpen(true);
  }, [signedIn, path]);
  useEffect(() => {
    // A target whose element is not drawn yet waits for the render that draws it (the box opened from the address).
    const target = focusNext.current;
    if (target === null) return;
    if (target.kind === "OPEN_BUTTON") {
      if (openButton.current === null) return;
      focusNext.current = null;
      openButton.current.focus();
      return;
    }
    const field = fields.current.get(target.id);
    if (field === undefined) return;
    focusNext.current = null;
    if (target.scroll) box.current?.scrollIntoView?.({ block: "center" });
    field.focus({ preventScroll: target.scroll });
  });
  if (actions === null) return null;
  if (actions.signedIn === null) return <HeldPlace label={t(catalog, "v4.public.dig.open")} />;
  if (!actions.signedIn) return <SignInChoice lead="v4.public.signedOut.dig" returnPath={actions.returnPath(path)} catalog={catalog} />;
  if (privateHref !== null) {
    return (
      <p className="v4PubNote" role="status" data-public-dig-private>
        {t(catalog, "v4.public.dig.notJoined")}{" "}
        <Link className="v4Link" href={privateHref}>{t(catalog, "v4.public.dig.openIt")}</Link>
      </p>
    );
  }
  if (!open) {
    return (
      <button type="button" ref={openButton} className="v4Btn v4PubAction" onClick={() => { focusNext.current = { kind: "FIELD", id: views[0]!.id, scroll: false }; setOpen(true); }}>
        {t(catalog, "v4.public.dig.open")}
      </button>
    );
  }
  const room = picksMax(actions.planTier) - views.length;
  const written = views.some((view) => view.text.trim().length > 0);
  const start = async (): Promise<void> => {
    setRefusal(null);
    const outcome = await actions.startDig(path, views.map((view) => view.text));
    if (outcome === null) return;
    if (outcome.kind === "PRIVATE") setPrivateHref(outcome.href);
    else setRefusal(outcome.message);
  };
  const add = (): void => {
    const id = nextView.current;
    nextView.current += 1;
    focusNext.current = { kind: "FIELD", id, scroll: false };
    setViews([...views, { id, text: "" }]);
  };
  // public-f12: an extra box can be taken out again; focus goes to the box before it.
  const remove = (at: number): void => {
    focusNext.current = { kind: "FIELD", id: views[at - 1]!.id, scroll: false };
    setViews(views.filter((_, where) => where !== at));
  };
  const close = (): void => {
    focusNext.current = { kind: "OPEN_BUTTON" };
    setOpen(false);
  };
  return (
    <div className="v4PubDig" ref={box}>
      {/* r2-16: the two facts that matter, with the rest folded under "How this works". */}
      <p className="v4PubHint">{t(catalog, "v4.public.dig.terms")}</p>
      <details className="v4PubHow">
        <summary>{t(catalog, "v4.public.dig.howItWorks")}</summary>
        <p className="v4PubHint">{t(catalog, "v4.public.dig.termsMore")}</p>
      </details>
      {views.map((view, at) => {
        const fieldId = `${ids}-${view.id}`;
        return (
          <div key={view.id} className="v4PubDigField">
            <div className="v4PubDigFieldHead">
              <label className="v4PubLabel" id={`${fieldId}-label`} htmlFor={fieldId}>
                {at === 0 ? t(catalog, "v4.suggest.ownViewLabel") : t(catalog, "v4.public.dig.viewLabel", { number: at + 1 })}
              </label>
              {at === 0 ? null : (
                <button type="button" className="v4Link v4PubRemove" aria-describedby={`${fieldId}-label`} disabled={actions.busy} onClick={() => remove(at)}>
                  {t(catalog, "v4.public.dig.removeView")}
                </button>
              )}
            </div>
            <textarea
              id={fieldId}
              ref={(field) => { if (field === null) fields.current.delete(view.id); else fields.current.set(view.id, field); }}
              className="v4PubText"
              rows={2}
              dir="auto"
              value={view.text}
              maxLength={WEB_CONTRACT_LIMITS.pickTextMaxChars}
              onChange={(event) => setViews(views.map((other) => (other.id === view.id ? { ...other, text: event.target.value } : other)))}
            />
          </div>
        );
      })}
      {room > 0 ? (
        <button type="button" className="v4Link" onClick={add}>{t(catalog, "v4.public.dig.addView")}</button>
      ) : <p className="v4PubHint">{t(catalog, "v4.public.dig.viewsFull")}</p>}
      <div className="v4PubDigActions">
        <button type="button" className="v4Btn v4BtnPrimary" disabled={!written || actions.busy} aria-busy={actions.busy} onClick={() => void start()}>
          {t(catalog, actions.busy ? "v4.ask.starting" : "v4.public.dig.start")}
        </button>
        <button type="button" className="v4Link" disabled={actions.busy} onClick={close}>{t(catalog, "v4.public.dig.cancel")}</button>
      </div>
      {refusal === null ? null : <p className="v4AskRefusal" role="alert">{refusal}</p>}
    </div>
  );
}

/** A deeper level's tag (public-f23): who made the dig these paths came from, said once, with no further indent. */
function digFromWords(makers: ReadonlyMap<string, string | null>, digRef: string | null, catalog: MessageCatalog): string {
  if (digRef === null || !makers.has(digRef)) return t(catalog, "v4.public.digFromAnother");
  const maker = makers.get(digRef)!;
  return maker === null ? t(catalog, "v4.public.digFromGone") : t(catalog, "v4.public.digFrom", { name: maker });
}

/**
 * Under one path: its newest text, who added to it and when, the digs on it with their own paths, and the Dig action. public-f23: the digs' paths
 * are indented once only; a dig on a dig's path sits at that same indent, tagged with whose dig it came from.
 */
export function V4PublicPathNote({ path, catalog, locale, actions = true, depth = 0 }: Readonly<{
  path: PublicPathView; catalog: MessageCatalog; locale: string; actions?: boolean; depth?: number;
}>) {
  const makers = useContext(DigMakersContext);
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
        <div key={dig.ref ?? at} className={depth === 0 ? "v4PubDigPaths" : "v4PubDigPaths v4PubDigPathsDeeper"}>
          {depth === 0
            ? <p className="v4PubLabel">{t(catalog, "v4.public.digPaths")}</p>
            : <p className="v4PubLabel v4PubDigFrom">{digFromWords(makers, dig.ref, catalog)}</p>}
          <ul className="v4PubDigPathList">
            {dig.paths.map((own) => (
              <li key={own.ref}>
                <p className="v4PubDigPathLine" dir="auto" data-ai-generated="true">{own.line}</p>
                <V4PublicPathNote path={own} catalog={catalog} locale={locale} actions={actions} depth={depth + 1} />
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
  if (actions === null) return null;
  if (actions.signedIn === null) return <HeldPlace label={t(catalog, "v4.public.report.write")} />;
  if (!actions.signedIn) {
    return <SignInChoice lead="v4.public.signedOut.report" returnPath={`${actions.returnPath(null)}#${REPORTS_ANCHOR}`} catalog={catalog} />;
  }
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
    <section id={REPORTS_ANCHOR} className="v4Root v4PublicLane v4PubReports" aria-labelledby="public-reports-title">
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
