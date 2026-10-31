"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Answer, AnswerStory, DigLinks, InvestigationReports, InvestigationReportVersion } from "@debateai/contract";
import { AuthGate } from "@/components/AuthGate";
import { V4Header } from "@/components/v4/V4Header";
import { V4OtherPages, V4SearchNote, V4SourceList, V4WebNoteLine } from "@/components/v4/V4Sources";
import { V4TrustBar } from "@/components/v4/V4TrustBar";
import { formatDate, t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import { STORY_POLLING, unreadableStory } from "@/lib/v3/useAnswerStory";
import { addedLines, ownWords, startsWithLabel } from "@/lib/v4/askText";
import { digLinksFor, readQuestionIndex, type IndexEntry } from "@/lib/v4/digIndex";
import {
  loadDigView, loadInvestigation, loadStory, loadV4, reopenInvestigation, storyReadFailed, writeReport, type FinishedReportVersion
} from "@/lib/v4/load";
import { buildV4Map } from "@/lib/v4/mapModel";
import { mergeDigLinks, readDigRecords } from "@/lib/v4/accountMemory";
import { levelHref, useReadingLevel } from "@/lib/v4/storage";
import { basisKey, TRUST_WORDS, type DigLink, type DigView, type ReadingLevel, type V4Map, type V4Path } from "@/lib/v4/types";

/*
 * V4 initial (2026-10-28), D5: the report. A document made from the same served answer as the map — nothing is
 * invented; parts the engine has no data for yet ("Gives up:", the per-round rewrite) are left out (row D 3, 4).
 * Fix wave 1, Decision A: nothing is kept in the browser — the level comes from the address (or, N7, the account), and
 * the digs from the account (N11: its dig records, then its question list by text).
 * Perplexity plan W2-6 (2026-10-30): the report shows the web part as the map does — the debate's web note (Free, a
 * failed search, switched off) above the paths, each path's own search note, and at the expert level each point's
 * sources and each path's other pages (listed only: the report has no buttons). The old line "This first version does
 * not search the web for sources yet." gives way to these notes.
 * R22 W5-1: the final report over the investigation (the debate and all its digs) sits above the debate's own report:
 * "Write my report", its versions (newest first, the current one marked), the chosen version under the approved
 * sections (W0-1 §2.6) with its sources, and while the newest is being written the page says so and reads it again on
 * the story poll's chained timer. Once a finished version stands, "Keep digging" reopens the investigation.
 */

type Props = Readonly<{
  id: string;
  locale: string;
  initialLevel: ReadingLevel | null;
  catalog: MessageCatalog;
  newDebateCatalog: MessageCatalog;
}>;

type ReportLoad =
  | Readonly<{ kind: "LOADING" }>
  | Readonly<{ kind: "ERROR" }>
  | Readonly<{ kind: "NOT_READY"; failed: boolean }>
  /** readFailures: failed story reads in a row (V3's rule: the fourth one is accepted as the story's state). */
  | Readonly<{ kind: "SERVED"; runId: string; answer: Answer; story: AnswerStory | null; readFailures: number }>;

/** A dig as the report lists it; `view` is undefined while it loads and null when it could not be read just now. */
type ReportDig = Readonly<{ link: DigLink; view: DigView | null | undefined }>;

/*
 * R2TIME-3 / R2TIME-7: the same rule as the map page's story poll. While the story is being written it is read again
 * on a chained timer (never two reads in flight), backing off 10 s → 20 s → 40 s → 60 s; there is no try cap while it
 * is WRITING. The page gives up only after V3's read-failure limit (failed reads in a row) or about 15 minutes in all.
 */
const STORY_POLL_FIRST_MS = 10_000;
const STORY_POLL_MAX_MS = 60_000;
const STORY_WAIT_MAX_MS = 15 * 60_000;
/** Spec D5: the reading level defaults to "Some background" when none is chosen. */
const DEFAULT_LEVEL: ReadingLevel = "background";

export function V4ReportClient({ id, locale, initialLevel, catalog, newDebateCatalog }: Props) {
  // AuthGate reads newDebate.* keys (checking session / sign-in redirect), so it gets that namespace.
  return (
    <AuthGate catalog={newDebateCatalog}>
      {() => <ReportBody id={id} locale={locale} initialLevel={initialLevel} catalog={catalog} />}
    </AuthGate>
  );
}

function ReportBody({ id, locale, initialLevel, catalog }: Readonly<{
  id: string;
  locale: string;
  initialLevel: ReadingLevel | null;
  catalog: MessageCatalog;
}>) {
  // Decision A: the level lives in the address; choosing one rewrites `?level=` (useReadingLevel does that).
  const [chosenLevel, chooseLevel] = useReadingLevel(initialLevel);
  const level: ReadingLevel = chosenLevel ?? DEFAULT_LEVEL;

  const [load, setLoad] = useState<ReportLoad>({ kind: "LOADING" });
  const [attempt, setAttempt] = useState(0);
  const [today] = useState(() => new Date());
  // B1's rule: a story still being written reads as such until the page stops waiting for it.
  const [storyGaveUp, setStoryGaveUp] = useState(false);

  useEffect(() => {
    let active = true;
    setLoad({ kind: "LOADING" });
    setStoryGaveUp(false);
    loadV4(id).then(
      (result) => {
        if (!active) return;
        if (result.kind === "SERVED") {
          setLoad({
            kind: "SERVED",
            runId: result.runId,
            answer: result.answer,
            story: result.story,
            readFailures: storyReadFailed(result.story) ? 1 : 0
          });
        } else {
          setLoad({ kind: "NOT_READY", failed: result.run.state === "FAILED" });
        }
      },
      () => { if (active) setLoad({ kind: "ERROR" }); }
    );
    return () => { active = false; };
  }, [id, attempt]);

  // DATA-3: the fourth failed story read in a row ends the wait too (buildV4Map reads a failed read as "still being
  // written" until the page gives up).
  const gaveUp = storyGaveUp || (load.kind === "SERVED" && load.readFailures >= STORY_POLLING.readFailureLimit);
  const map: V4Map | null = useMemo(
    () => load.kind === "SERVED" ? buildV4Map({ runId: load.runId, answer: load.answer, story: load.story, storyGaveUp: gaveUp }) : null,
    [load, gaveUp]
  );

  // A story still being written, or a read that failed for a moment, is read again (rule above); a failed read is
  // accepted only on the fourth failure in a row (DATA-3).
  const answerId = load.kind === "SERVED" ? load.answer.answer_id : null;
  const answerVersion = load.kind === "SERVED" ? load.answer.answer_version : null;
  const storyPending = map !== null && !gaveUp && map.storyState === "WRITING";
  const retrying = storyPending && load.kind === "SERVED" && storyReadFailed(load.story);
  useEffect(() => {
    if (answerId === null || answerVersion === null || !storyPending) return;
    let active = true;
    let timer: number | undefined;
    let delay = STORY_POLL_FIRST_MS;
    let failuresInARow = 0;
    const startedAt = Date.now();
    // null: the read itself threw; it counts as a failed read, labelled as V3 labels it.
    const settle = (read: AnswerStory | null): AnswerStory => {
      const next = read ?? unreadableStory(answerId, answerVersion, "STORY_READ_FAILED");
      setLoad((current) => {
        if (current.kind !== "SERVED" || current.answer.answer_id !== answerId) return current;
        if (!storyReadFailed(next)) return { ...current, story: next, readFailures: 0 };
        const readFailures = current.readFailures + 1;
        // Until the limit the page keeps what it shows; the last failure then becomes the story's state.
        return readFailures < STORY_POLLING.readFailureLimit ? { ...current, readFailures } : { ...current, story: next, readFailures };
      });
      return next;
    };
    const tick = async (): Promise<void> => {
      let read: AnswerStory | null = null;
      try {
        read = await loadStory(answerId, undefined, answerVersion);
      } catch {
        read = null;
      }
      if (!active) return;
      const next = settle(read);
      if (storyReadFailed(next)) {
        failuresInARow += 1;
        // The failure limit ends the wait through `readFailures` (gaveUp above); nothing more to schedule.
        if (failuresInARow >= STORY_POLLING.readFailureLimit) return;
      } else {
        failuresInARow = 0;
        // Written (or finally unavailable): the effect stops here; `storyPending` turns false on the next render.
        if (next.status !== "WRITING") return;
      }
      if (Date.now() - startedAt >= STORY_WAIT_MAX_MS) {
        setStoryGaveUp(true);
        return;
      }
      delay = Math.min(STORY_POLL_MAX_MS, delay * 2);
      timer = window.setTimeout(() => void tick(), delay);
    };
    timer = window.setTimeout(() => void tick(), delay);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [answerId, answerVersion, storyPending]);

  // Decision A: digs are found again from the account's question list (lib/v4/digIndex.ts); read once — the report is a
  // snapshot. Digs are newer than their parent, so the list is paged only until this run has been seen (FIXES2,
  // R2DIG-6). A failed list read leaves the digs out quietly.
  const runId = load.kind === "SERVED" ? load.runId : null;
  const questionLine = load.kind === "SERVED" ? load.answer.question_line : null;
  const [index, setIndex] = useState<readonly IndexEntry[] | null>(null);
  useEffect(() => {
    if (runId === null) return;
    let active = true;
    setIndex(null);
    readQuestionIndex(undefined, { untilRunId: runId }).then(
      (entries) => { if (active) setIndex(entries); },
      () => { if (active) setIndex([]); }
    );
    return () => { active = false; };
  }, [runId]);

  // N11: the dig records (read once too) decide which debates are digs of this one; the text finds only digs without a
  // record. A failed read leaves the records out (null), and the digs found by text stay.
  const [records, setRecords] = useState<DigLinks | null | undefined>(undefined);
  useEffect(() => {
    if (runId === null) return;
    let active = true;
    setRecords(undefined);
    readDigRecords(runId).then(
      (read) => { if (active) setRecords(read); },
      () => { if (active) setRecords(null); }
    );
    return () => { active = false; };
  }, [runId]);

  const digLinks: readonly DigLink[] = useMemo(
    () => runId === null || questionLine === null || index === null || records === undefined
      ? [] : mergeDigLinks(records, digLinksFor(runId, questionLine, map, index, catalog), map),
    [runId, questionLine, map, index, records, catalog]
  );

  // Each dig's follow-up is read once (by its run id), even when the links are worked out again after the story lands.
  const [views, setViews] = useState<ReadonlyMap<string, DigView | null>>(() => new Map());
  const requested = useRef(new Set<string>());
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    for (const link of digLinks) {
      if (requested.current.has(link.childRunId)) continue;
      requested.current.add(link.childRunId);
      const done = (view: DigView | null) => {
        if (alive.current) setViews((current) => new Map(current).set(link.childRunId, view));
      };
      loadDigView(link).then(done, () => done(null));
    }
  }, [digLinks]);
  const digs: readonly ReportDig[] = digLinks.map((link) => ({ link, view: views.get(link.childRunId) }));

  // The person's own words, not the added lines. R2TIME-8: the site's DocumentTitle names the tab (and a printed file)
  // after the h1, so the "Report:" prefix sits inside the h1 (hidden on screen) instead of a document.title write.
  const ownQuestion = map !== null ? ownWords(map.question) : null;

  const mapHref = levelHref(`/v4/debate/${encodeURIComponent(id)}`, chosenLevel);
  const classicHref = `/debate/${encodeURIComponent(id)}`;
  // V3's PDF (app/debate/[id]/report/route.ts) resolves an answer id first, then a run id, and serves only READY stories.
  const pdfReady = map !== null && map.storyState === "READY";

  const header = (
    <div className="v4RepChrome">
      {/* R2REG-5: the menu shows the level in use, but links carry only a level the person chose. */}
      <V4Header catalog={catalog} readingLevel={level} linkLevel={chosenLevel} onReadingLevel={chooseLevel} classicHref={classicHref}>
        <div className="v4RepActions">
          <Link className="v4Btn" href={mapHref}>{t(catalog, "v4.report.backToMap")}</Link>
          {pdfReady ? <a className="v4Btn" href={`${classicHref}/report`}>{t(catalog, "v4.report.downloadPdf")}</a> : null}
          {map !== null ? (
            <button type="button" className="v4Btn v4BtnPrimary" onClick={() => window.print()}>{t(catalog, "v4.report.print")}</button>
          ) : null}
        </div>
      </V4Header>
    </div>
  );

  if (load.kind !== "SERVED" || map === null || ownQuestion === null) {
    return (
      <div className="v4RepPage">
        {header}
        <div className="v4RepState">
          {load.kind === "LOADING" ? <p role="status" className="v4Muted">{t(catalog, "v4.common.loading")}</p> : null}
          {load.kind === "ERROR" ? (
            <>
              <p role="alert">{t(catalog, "v4.report.loadFailed")}</p>
              <button type="button" className="v4Btn" onClick={() => setAttempt((value) => value + 1)}>{t(catalog, "v4.common.retry")}</button>
            </>
          ) : null}
          {load.kind === "NOT_READY" ? (
            <>
              <p className="v4RepProse">{load.failed ? t(catalog, "v4.report.failed") : t(catalog, "v4.report.notReady")}</p>
              <Link className="v4Btn" href={load.failed ? classicHref : mapHref}>
                {load.failed ? t(catalog, "v4.common.classicView") : t(catalog, "v4.report.backToMap")}
              </Link>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  const showConfidence = level !== "plain" && map.confidence !== null;
  const noShortAnswer = map.headline === null && map.summary === null;
  // DATA-2 ("always an answer"): with no written short answer, the AIs' whole composed answer stands in.
  const fallback = noShortAnswer && map.fallbackText !== null
    ? map.fallbackText.split(/\n\s*\n/).map((part) => part.trim()).filter((part) => part.length > 0)
    : [];
  const storyNote = retrying
    ? t(catalog, "v4.report.storyRetrying")
    : fallback.length > 0
      ? (storyPending ? t(catalog, "v4.report.fallbackWriting") : t(catalog, "v4.report.fallbackUnavailable"))
      : (storyPending ? t(catalog, "v4.report.storyWriting") : t(catalog, "v4.report.storyUnavailable"));
  const sent = addedLines(map.question).length > 0;

  return (
    <div className="v4RepPage">
      {header}
      <article className="v4RepDoc" aria-labelledby="v4-report-title">
        <p className="v4RepPrintBrand" aria-hidden="true">Dialectical Engine</p>
        <header className="v4RepTop">
          <p className="v4Eyebrow v4RepMeta">
            {t(catalog, "v4.report.eyebrow", {
              date: formatDate(locale, today, { dateStyle: "long" }),
              level: t(catalog, `v4.readingLevel.${level}`)
            })}
          </p>
          <h1 id="v4-report-title" className="v4RepTitle">
            <span className="v4SrOnly">{t(catalog, "v4.report.titlePrefix")} </span>
            <span data-ai-generated="true">{ownQuestion}</span>
          </h1>
        </header>

        <InvestigationReport runId={load.runId} locale={locale} catalog={catalog} />

        {sent ? (
          <section className="v4RepSent" aria-labelledby="v4-report-sent">
            <h2 id="v4-report-sent" className="v4Eyebrow v4RepSentLabel">{t(catalog, "v4.report.sentHeading")}</h2>
            <p className="v4RepSentText" data-ai-generated="true">{map.question}</p>
          </section>
        ) : null}

        <section className="v4RepAnswer" aria-labelledby="v4-report-answer">
          <h2 id="v4-report-answer" className="v4Eyebrow v4RepAnswerLabel">{t(catalog, "v4.report.answerHeading")}</h2>
          {map.headline !== null ? <p className="v4RepHeadline" data-ai-generated="true">{map.headline}</p> : null}
          {map.summary !== null ? <p className="v4RepProse" data-ai-generated="true">{map.summary}</p> : null}
          {fallback.length > 0 ? (
            <div className="v4RepFallback" data-ai-generated="true">
              {fallback.map((part, at) => <p key={at} className="v4RepProse">{part}</p>)}
            </div>
          ) : null}
          {/* RULES-1: V3's caveat for a READY_WITH_RESERVATION story; our own words, so not marked as AI text. */}
          {map.reservation ? <p className="v4RepNote">{t(catalog, "v4.story.reservation")}</p> : null}
          {noShortAnswer ? <p className="v4RepNote" role="status">{storyNote}</p> : null}
          {showConfidence ? (
            <p className="v4RepConfidence">
              {/* The story's sentence may already open with these words; then the label is not repeated. */}
              {startsWithLabel(map.confidence ?? "", t(catalog, "v4.report.confidenceLabel"))
                ? null
                : <><b>{t(catalog, "v4.report.confidenceLabel")}</b>{" "}</>}
              <span data-ai-generated="true">{map.confidence}</span>
            </p>
          ) : null}
        </section>

        {map.why.length > 0 ? (
          <section className="v4RepSection" aria-labelledby="v4-report-why">
            <h2 id="v4-report-why" className="v4RepH2">{t(catalog, "v4.report.whyHeading")}</h2>
            <ul className="v4RepList">
              {map.why.map((reason, at) => <li key={at} data-ai-generated="true">{reason}</li>)}
            </ul>
          </section>
        ) : null}

        {map.wouldChange !== null ? (
          <section className="v4RepSection" aria-labelledby="v4-report-change">
            <h2 id="v4-report-change" className="v4RepH2">{t(catalog, "v4.report.changeHeading")}</h2>
            <p className="v4RepProse" data-ai-generated="true">{map.wouldChange}</p>
          </section>
        ) : null}

        {map.objections.length > 0 ? (
          <section className="v4RepSection" aria-labelledby="v4-report-objections">
            <h2 id="v4-report-objections" className="v4RepH2">{t(catalog, "v4.report.objectionsHeading")}</h2>
            <ul className="v4RepList">
              {map.objections.map((objection, at) => <li key={at} data-ai-generated="true">{objection}</li>)}
            </ul>
          </section>
        ) : null}

        {map.paths.length > 0 ? (
          <section className="v4RepSection" aria-labelledby="v4-report-paths">
            <h2 id="v4-report-paths" className="v4RepH2">{t(catalog, "v4.report.pathsHeading")}</h2>
            <V4WebNoteLine note={map.webNote} catalog={catalog} className="v4RepNote" />
            <ol className="v4RepPaths">
              {map.paths.map((path) => (
                <ReportPath key={path.id} path={path} level={level} catalog={catalog} locale={locale} debateNote={map.webNote !== null && map.webNote !== undefined} />
              ))}
            </ol>
          </section>
        ) : null}

        {digs.length > 0 ? (
          <section className="v4RepSection" aria-labelledby="v4-report-digs">
            <h2 id="v4-report-digs" className="v4RepH2">{t(catalog, "v4.report.digsHeading")}</h2>
            <ul className="v4RepDigs">
              {digs.map((dig) => <ReportDigItem key={dig.link.childRunId} dig={dig} level={chosenLevel} catalog={catalog} />)}
            </ul>
          </section>
        ) : null}

        {level === "expert" && map.sections.length > 0 ? (
          <section className="v4RepSection" aria-labelledby="v4-report-story">
            <h2 id="v4-report-story" className="v4RepH2">{t(catalog, "v4.report.fullStoryHeading")}</h2>
            <div className="v4RepStory">
              {map.sections.map((section, at) => (
                <div key={at} className="v4RepStoryPart">
                  <h3 className="v4RepH3" data-ai-generated="true">{section.title}</h3>
                  {section.paragraphs.map((paragraph, paragraphAt) => (
                    <p key={paragraphAt} className="v4RepProse" data-ai-generated="true">{paragraph}</p>
                  ))}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="v4RepSection" aria-labelledby="v4-report-checked">
          <h2 id="v4-report-checked" className="v4RepH2">{t(catalog, "v4.report.checkedHeading")}</h2>
          <p className="v4RepProse">{t(catalog, "v4.report.checkedSecondAi")}</p>
          <p className="v4RepProse">{t(catalog, "v4.report.checkedWordsIntro")}</p>
          <ul className="v4RepWords">
            {TRUST_WORDS.map((word) => (
              <li key={word} className="v4RepWord">
                <b>{t(catalog, `v4.trust.${word}`)}</b>
                {/* W2-6: "Sure" now means a page this debate looked up, in the owner-approved words of its basis. */}
                <span>{t(catalog, word === "SURE" ? basisKey("WEB_CHECKED_AND_AGREED") : `v4.report.word.${word}`)}</span>
              </li>
            ))}
          </ul>
        </section>
      </article>
    </div>
  );
}

function ReportPath({ path, level, catalog, locale, debateNote }: Readonly<{
  path: V4Path;
  level: ReadingLevel;
  catalog: MessageCatalog;
  locale: string;
  /** W2-6: the debate's own web note is shown above the paths, so the paths do not repeat it. */
  debateNote: boolean;
}>) {
  const checked = path.points.filter((point) => point.trust !== null);
  return (
    <li className="v4RepPath">
      {path.fate !== null ? <span className="v4RepFate" data-fate={path.fate}>{t(catalog, `v4.fate.${path.fate}`)}</span> : null}
      <p className="v4RepPathLine" data-ai-generated="true">{path.line}</p>
      <div className="v4RepBar">
        <V4TrustBar counts={path.counts} unchecked={path.unchecked} catalog={catalog} size="small" showCounts />
      </div>
      {path.web !== undefined && !debateNote ? <V4SearchNote search={path.web.search} catalog={catalog} className="v4RepNote" /> : null}
      {level === "expert" && checked.length > 0 ? (
        <ul className="v4RepPoints">
          {checked.map((point) => (
            <li key={point.id} className="v4RepPoint" data-trust={point.trust ?? undefined}>
              <span className="v4RepPointMark" aria-hidden="true" />
              <div className="v4RepPointBody">
                <span className="v4RepPointWord">{t(catalog, `v4.trust.${point.trust}`)}</span>
                <span data-ai-generated="true">{point.text}</span>
                <V4SourceList sources={point.sources} catalog={catalog} locale={locale} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {level === "expert" && path.unchecked > 0 ? (
        <p className="v4RepNote">{tPlural(catalog, "v4.report.pathUnchecked", path.unchecked, locale)}</p>
      ) : null}
      {level === "expert" && path.web !== undefined
        ? <V4OtherPages pages={path.web.otherPages} catalog={catalog} locale={locale} actions={false} headingClassName="v4RepSmallHead" />
        : null}
    </li>
  );
}

function ReportDigItem({ dig, level, catalog }: Readonly<{ dig: ReportDig; level: ReadingLevel | null; catalog: MessageCatalog }>) {
  const view = dig.view;
  const state = view === undefined
    ? t(catalog, "v4.common.loading")
    : view === null ? t(catalog, "v4.report.digUnknown") : t(catalog, `v4.report.digState.${view.state}`);
  return (
    <li className="v4RepDig">
      <ul className="v4RepDigQuestions">
        {dig.link.questions.map((question, at) => <li key={at} data-ai-generated="true">{question}</li>)}
      </ul>
      <p className="v4RepDigMeta">
        {/* A dig found again from the account list has no known mode: then only its state is shown. */}
        {dig.link.mode !== null ? <>{t(catalog, `v4.digMode.${dig.link.mode}`)}{" · "}</> : null}
        {state}
      </p>
      {view?.state === "DONE" && view.headline !== null ? (
        <p className="v4RepProse" data-ai-generated="true">{view.headline}</p>
      ) : null}
      {view?.state === "DONE" && view.counts !== null ? (
        <div className="v4RepBar"><V4TrustBar counts={view.counts} catalog={catalog} size="small" showCounts /></div>
      ) : null}
      {view?.state === "DONE" ? (
        <Link className="v4Link v4RepDigLink" href={levelHref(`/v4/debate/${encodeURIComponent(dig.link.childRunId)}`, level)}>
          {t(catalog, "v4.report.digOpenMap")}
        </Link>
      ) : null}
    </li>
  );
}

const finishedVersion = (version: InvestigationReportVersion | null | undefined): version is FinishedReportVersion =>
  version !== null && version !== undefined && (version.state === "READY" || version.state === "READY_WITH_RESERVATION");

/** When a version is dated: when it was written (or failed), or, while it is being written, when it was asked for. */
const versionDate = (version: InvestigationReportVersion): string => version.state === "WRITING" ? version.closed_at : version.written_at;

/**
 * R22 W5-1: the final report over the investigation. Read on its own (a failed read leaves it out quietly: the debate's
 * report below stays); "Write my report" and "Keep digging" post, then read it again.
 */
function InvestigationReport({ runId, locale, catalog }: Readonly<{ runId: string; locale: string; catalog: MessageCatalog }>) {
  const [read, setRead] = useState<InvestigationReports | null | undefined>(undefined);
  const [refresh, setRefresh] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    let active = true;
    loadInvestigation(runId).then((next) => { if (active && next !== null) setRead(next); }, () => undefined);
    return () => { active = false; };
  }, [runId, refresh]);

  const newest = read?.versions.at(-1) ?? null;
  const writingVersion = newest?.state === "WRITING" ? newest.report_version : null;
  // The story poll's rule (R2TIME-3): a version still being written is read again on a chained timer, never two reads in
  // flight, 10 s → 20 s → 40 s → 60 s, for about 15 minutes in all; a read that fails keeps what the page shows.
  useEffect(() => {
    if (writingVersion === null) return;
    let active = true;
    let timer: number | undefined;
    let delay = STORY_POLL_FIRST_MS;
    const startedAt = Date.now();
    const tick = async (): Promise<void> => {
      const next = await loadInvestigation(runId);
      if (!active) return;
      if (next !== null) setRead(next);
      if (next !== null && next.versions.at(-1)?.state !== "WRITING") return;
      if (Date.now() - startedAt >= STORY_WAIT_MAX_MS) return;
      delay = Math.min(STORY_POLL_MAX_MS, delay * 2);
      timer = window.setTimeout(() => void tick(), delay);
    };
    timer = window.setTimeout(() => void tick(), delay);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [runId, writingVersion]);

  if (read === undefined || read === null) return null;
  const act = (post: (id: string) => Promise<unknown>) => async () => {
    setBusy(true);
    await post(runId);
    if (!alive.current) return;
    setBusy(false);
    // The newest version (the one just asked for) is shown next.
    setChosen(null);
    setRefresh((value) => value + 1);
  };
  // The newest version is shown first (being written, failed, or the current one); any other is one click away.
  const shownNumber = chosen ?? newest?.report_version ?? null;
  const shown = read.versions.find((version) => version.report_version === shownNumber) ?? null;
  // "Write my report" while the investigation is open (a debate in none too), and again after a version that failed.
  const canWrite = read.state === "OPEN" || newest?.state === "FAILED";
  const canKeepDigging = read.state === "CLOSED" && finishedVersion(newest);
  const actions = canWrite || canKeepDigging ? (
    <div className="v4RepActions v4RepNoPrint">
      {canWrite ? (
        <button type="button" className="v4Btn v4BtnPrimary v4RepWrite" disabled={busy} onClick={() => void act(writeReport)()}>
          {t(catalog, "v4.rail.writeReport")}
        </button>
      ) : null}
      {canKeepDigging ? (
        <button type="button" className="v4Btn v4RepKeepDigging" disabled={busy} onClick={() => void act(reopenInvestigation)()}>
          {t(catalog, "v4.investigation.keepDigging")}
        </button>
      ) : null}
    </div>
  ) : null;
  if (read.versions.length === 0) return actions;
  return (
    <section className="v4RepSection v4RepInvestigation" aria-labelledby="v4-report-versions">
      <h2 id="v4-report-versions" className="v4RepH2">{t(catalog, "v4.investigation.versions")}</h2>
      <ul className="v4RepVersions v4RepNoPrint">
        {[...read.versions].reverse().map((version) => (
          <li key={version.report_version}>
            <button
              type="button"
              className="v4Link v4RepVersion"
              aria-pressed={version.report_version === shownNumber}
              onClick={() => setChosen(version.report_version)}
            >
              {t(catalog, version.report_version === read.current ? "v4.investigation.versionCurrent" : "v4.investigation.version", {
                n: version.report_version,
                date: formatDate(locale, versionDate(version), { dateStyle: "medium" })
              })}
            </button>
          </li>
        ))}
      </ul>
      {shown !== null ? <ReportVersion version={shown} locale={locale} catalog={catalog} /> : null}
      {actions}
    </section>
  );
}

function ReportVersion({ version, locale, catalog }: Readonly<{ version: InvestigationReportVersion; locale: string; catalog: MessageCatalog }>) {
  if (version.state === "WRITING") {
    return (
      <div className="v4RepVersionBody" role="status">
        <p className="v4RepNote">{t(catalog, "v4.investigation.writing")}</p>
        {version.waiting_for_digs > 0 ? (
          <p className="v4RepNote">
            {tPlural(catalog, "v4.investigation.waitingDigs", version.waiting_for_digs, locale, { n: version.waiting_for_digs })}
          </p>
        ) : null}
      </div>
    );
  }
  if (version.state === "FAILED") {
    return <p className="v4RepNote v4RepVersionBody" role="status">{t(catalog, "v4.investigation.failed")}</p>;
  }
  const { story } = version;
  return (
    <div className="v4RepVersionBody" data-version={version.report_version}>
      {version.shortened ? <p className="v4RepNote v4RepShortened">{t(catalog, "v4.investigation.shortened")}</p> : null}
      <div className="v4RepAnswer">
        <h3 className="v4Eyebrow v4RepAnswerLabel">{t(catalog, "v4.investigation.heading.answer")}</h3>
        {story !== null ? <p className="v4RepHeadline" data-ai-generated="true">{story.short_answer}</p> : (
          <>
            {/* N14 (approved): no story this time; the report's whole answer stands in. */}
            <p className="v4RepNote v4RepNoStory" role="status">{t(catalog, "v4.investigation.noStory")}</p>
            <div className="v4RepFallback" data-ai-generated="true">
              {version.answer.segments.map((segment, at) => <p key={at} className="v4RepProse">{segment}</p>)}
            </div>
          </>
        )}
        {version.state === "READY_WITH_RESERVATION" ? <p className="v4RepNote">{t(catalog, "v4.story.reservation")}</p> : null}
      </div>
      {story !== null ? (
        <>
          <h3 className="v4RepH3">{t(catalog, "v4.investigation.heading.wouldChange")}</h3>
          <p className="v4RepProse" data-ai-generated="true">{story.what_would_change}</p>
          {story.how_it_went.length > 0 ? (
            <>
              <h3 className="v4RepH3">{t(catalog, "v4.investigation.heading.howItWent")}</h3>
              {story.how_it_went.map((entry) => (
                <p key={entry.dig_run_id} className="v4RepProse" data-ai-generated="true">{entry.paragraph}</p>
              ))}
            </>
          ) : null}
          {story.still_open.length > 0 ? (
            <>
              <h3 className="v4RepH3">{t(catalog, "v4.investigation.heading.stillOpen")}</h3>
              <ul className="v4RepList">
                {story.still_open.map((open, at) => <li key={at} data-ai-generated="true">{open}</li>)}
              </ul>
            </>
          ) : null}
        </>
      ) : null}
      {version.sources.length > 0 ? (
        <>
          <h3 className="v4RepH3">{t(catalog, "v4.investigation.heading.sources")}</h3>
          <ul className="v4RepSources">
            {version.sources.map((source, at) => (
              <li key={at} className="v4RepSource">
                <span className="v4RepSourceSite">{source.site}</span>
                {source.title !== null ? <b className="v4RepSourceTitle">{source.title}</b> : null}
                {/* Reader 1's line about the page (owner F9) is the AI's; the quote is the page's own words. */}
                {source.line !== null ? <p className="v4RepSourceLine" data-ai-generated="true">{source.line}</p> : null}
                <blockquote className="v4RepSourceQuote">{source.quote}</blockquote>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
