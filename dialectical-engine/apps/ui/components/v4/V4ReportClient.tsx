"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Answer, AnswerStory } from "@debateai/contract";
import { AuthGate } from "@/components/AuthGate";
import { V4Header } from "@/components/v4/V4Header";
import { V4TrustBar } from "@/components/v4/V4TrustBar";
import { formatDate, t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import { loadDigView, loadStory, loadV4 } from "@/lib/v4/load";
import { buildV4Map } from "@/lib/v4/mapModel";
import { readDigLinks, useReadingLevel } from "@/lib/v4/storage";
import { TRUST_WORDS, type DigLink, type DigView, type ReadingLevel, type V4Map, type V4Path } from "@/lib/v4/types";

/*
 * V4 initial (2026-10-28), D5: the report. A document made from the same served answer as the map — nothing is
 * invented; parts the engine has no data for yet ("Gives up:", the per-round rewrite) are left out (row D 3, 4).
 */

type Props = Readonly<{ id: string; locale: string; catalog: MessageCatalog; newDebateCatalog: MessageCatalog }>;

type ReportLoad =
  | Readonly<{ kind: "LOADING" }>
  | Readonly<{ kind: "ERROR" }>
  | Readonly<{ kind: "NOT_READY"; failed: boolean }>
  | Readonly<{ kind: "SERVED"; runId: string; answer: Answer; story: AnswerStory | null }>;

/** A dig as the report lists it; `view` is null when its follow-up could not be read just now. */
type ReportDig = Readonly<{ link: DigLink; view: DigView | null }>;

const STORY_POLL_MS = 10_000;
const STORY_POLL_MAX = 30;
/** Spec D5: the reading level defaults to "Some background" when none is saved. */
const DEFAULT_LEVEL: ReadingLevel = "background";

export function V4ReportClient({ id, locale, catalog, newDebateCatalog }: Props) {
  // AuthGate reads newDebate.* keys (checking session / sign-in redirect), so it gets that namespace.
  return <AuthGate catalog={newDebateCatalog}>{() => <ReportBody id={id} locale={locale} catalog={catalog} />}</AuthGate>;
}

function ReportBody({ id, locale, catalog }: Readonly<{ id: string; locale: string; catalog: MessageCatalog }>) {
  const [savedLevel, setLevel, levelLoaded] = useReadingLevel();
  const level: ReadingLevel = savedLevel ?? DEFAULT_LEVEL;
  const [load, setLoad] = useState<ReportLoad>({ kind: "LOADING" });
  const [attempt, setAttempt] = useState(0);
  const [digs, setDigs] = useState<readonly ReportDig[]>([]);
  const [today] = useState(() => new Date());
  // B1's rule: a missing story reads as "still being written" until the page stops waiting for it.
  const [storyGaveUp, setStoryGaveUp] = useState(false);

  useEffect(() => {
    let active = true;
    setLoad({ kind: "LOADING" });
    setStoryGaveUp(false);
    loadV4(id).then(
      (result) => {
        if (!active) return;
        if (result.kind === "SERVED") {
          setLoad({ kind: "SERVED", runId: result.runId, answer: result.answer, story: result.story });
        } else {
          setLoad({ kind: "NOT_READY", failed: result.run.state === "FAILED" });
        }
      },
      () => { if (active) setLoad({ kind: "ERROR" }); }
    );
    return () => { active = false; };
  }, [id, attempt]);

  const map: V4Map | null = useMemo(
    () => load.kind === "SERVED" ? buildV4Map({ runId: load.runId, answer: load.answer, story: load.story, storyGaveUp }) : null,
    [load, storyGaveUp]
  );

  // Same rule as the map page: a missing or still-writing story is read again every 10 s, at most 30 times.
  const answerId = load.kind === "SERVED" ? load.answer.answer_id : null;
  const storyPending = map !== null && map.storyState === "WRITING" && !storyGaveUp;
  useEffect(() => {
    if (answerId === null || !storyPending) return;
    let active = true;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (tries > STORY_POLL_MAX) { window.clearInterval(timer); setStoryGaveUp(true); return; }
      loadStory(answerId).then(
        (story) => {
          if (!active || story === null) return;
          setLoad((current) => current.kind === "SERVED" && current.answer.answer_id === answerId ? { ...current, story } : current);
        },
        () => { /* a failed read waits for the next tick */ }
      );
    }, STORY_POLL_MS);
    return () => { active = false; window.clearInterval(timer); };
  }, [answerId, storyPending]);

  // Digs are linked in this browser only (lib/v4/storage.ts); each is read once — the report is a snapshot.
  const runId = load.kind === "SERVED" ? load.runId : null;
  useEffect(() => {
    if (runId === null) return;
    let active = true;
    const links = readDigLinks(runId);
    if (links.length === 0) { setDigs([]); return; }
    void Promise.allSettled(links.map((link) => loadDigView(link))).then((results) => {
      if (!active) return;
      setDigs(results.map((result, index) => ({
        link: links[index] as DigLink,
        view: result.status === "fulfilled" ? result.value : null
      })));
    });
    return () => { active = false; };
  }, [runId]);

  const mapHref = `/v4/debate/${encodeURIComponent(id)}`;
  const classicHref = `/debate/${encodeURIComponent(id)}`;
  // V3's PDF (app/debate/[id]/report/route.ts) resolves an answer id first, then a run id, and serves only READY stories.
  const pdfReady = map !== null && map.storyState === "READY";

  const header = (
    <div className="v4RepChrome">
      <V4Header catalog={catalog} readingLevel={levelLoaded ? level : savedLevel} onReadingLevel={setLevel} classicHref={classicHref}>
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

  if (load.kind !== "SERVED" || map === null) {
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
          <h1 id="v4-report-title" className="v4RepTitle" data-ai-generated="true">{map.question}</h1>
        </header>

        <section className="v4RepAnswer" aria-labelledby="v4-report-answer">
          <h2 id="v4-report-answer" className="v4Eyebrow v4RepAnswerLabel">{t(catalog, "v4.report.answerHeading")}</h2>
          {map.headline !== null ? <p className="v4RepHeadline" data-ai-generated="true">{map.headline}</p> : null}
          {map.summary !== null ? <p className="v4RepProse" data-ai-generated="true">{map.summary}</p> : null}
          {map.headline === null && map.summary === null ? (
            <p className="v4RepNote" role="status">
              {storyPending ? t(catalog, "v4.report.storyWriting") : t(catalog, "v4.report.storyUnavailable")}
            </p>
          ) : null}
          {showConfidence ? (
            <p className="v4RepConfidence">
              <b>{t(catalog, "v4.report.confidenceLabel")}</b>{" "}
              <span data-ai-generated="true">{map.confidence}</span>
            </p>
          ) : null}
        </section>

        {map.why.length > 0 ? (
          <section className="v4RepSection" aria-labelledby="v4-report-why">
            <h2 id="v4-report-why" className="v4RepH2">{t(catalog, "v4.report.whyHeading")}</h2>
            <ul className="v4RepList">
              {map.why.map((reason, index) => <li key={index} data-ai-generated="true">{reason}</li>)}
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
              {map.objections.map((objection, index) => <li key={index} data-ai-generated="true">{objection}</li>)}
            </ul>
          </section>
        ) : null}

        {map.paths.length > 0 ? (
          <section className="v4RepSection" aria-labelledby="v4-report-paths">
            <h2 id="v4-report-paths" className="v4RepH2">{t(catalog, "v4.report.pathsHeading")}</h2>
            <ol className="v4RepPaths">
              {map.paths.map((path) => <ReportPath key={path.id} path={path} level={level} catalog={catalog} locale={locale} />)}
            </ol>
          </section>
        ) : null}

        {digs.length > 0 ? (
          <section className="v4RepSection" aria-labelledby="v4-report-digs">
            <h2 id="v4-report-digs" className="v4RepH2">{t(catalog, "v4.report.digsHeading")}</h2>
            <ul className="v4RepDigs">
              {digs.map((dig) => <ReportDigItem key={dig.link.childRunId} dig={dig} catalog={catalog} />)}
            </ul>
          </section>
        ) : null}

        {level === "expert" && map.sections.length > 0 ? (
          <section className="v4RepSection" aria-labelledby="v4-report-story">
            <h2 id="v4-report-story" className="v4RepH2">{t(catalog, "v4.report.fullStoryHeading")}</h2>
            <div className="v4RepStory">
              {map.sections.map((section, index) => (
                <div key={index} className="v4RepStoryPart">
                  <h3 className="v4RepH3" data-ai-generated="true">{section.title}</h3>
                  {section.paragraphs.map((paragraph, paragraphIndex) => (
                    <p key={paragraphIndex} className="v4RepProse" data-ai-generated="true">{paragraph}</p>
                  ))}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="v4RepSection" aria-labelledby="v4-report-checked">
          <h2 id="v4-report-checked" className="v4RepH2">{t(catalog, "v4.report.checkedHeading")}</h2>
          <p className="v4RepProse">{t(catalog, "v4.report.checkedSecondAi")}</p>
          <p className="v4RepProse">{t(catalog, "v4.report.checkedNoWeb")}</p>
          <p className="v4RepProse">{t(catalog, "v4.report.checkedWordsIntro")}</p>
          <ul className="v4RepWords">
            {TRUST_WORDS.map((word) => (
              <li key={word} className="v4RepWord">
                <b>{t(catalog, `v4.trust.${word}`)}</b>
                <span>{t(catalog, `v4.report.word.${word}`)}</span>
              </li>
            ))}
          </ul>
        </section>
      </article>
    </div>
  );
}

function ReportPath({ path, level, catalog, locale }: Readonly<{ path: V4Path; level: ReadingLevel; catalog: MessageCatalog; locale: string }>) {
  const checked = path.points.filter((point) => point.trust !== null);
  return (
    <li className="v4RepPath">
      {path.fate !== null ? <span className="v4RepFate" data-fate={path.fate}>{t(catalog, `v4.fate.${path.fate}`)}</span> : null}
      <p className="v4RepPathLine" data-ai-generated="true">{path.line}</p>
      <div className="v4RepBar">
        <V4TrustBar counts={path.counts} unchecked={path.unchecked} catalog={catalog} size="small" showCounts />
      </div>
      {level === "expert" && checked.length > 0 ? (
        <ul className="v4RepPoints">
          {checked.map((point) => (
            <li key={point.id} className="v4RepPoint" data-trust={point.trust ?? undefined}>
              <span className="v4RepPointMark" aria-hidden="true" />
              <span className="v4RepPointBody">
                <span className="v4RepPointWord">{t(catalog, `v4.trust.${point.trust}`)}</span>
                <span data-ai-generated="true">{point.text}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {level === "expert" && path.unchecked > 0 ? (
        <p className="v4RepNote">{tPlural(catalog, "v4.report.pathUnchecked", path.unchecked, locale)}</p>
      ) : null}
    </li>
  );
}

function ReportDigItem({ dig, catalog }: Readonly<{ dig: ReportDig; catalog: MessageCatalog }>) {
  const view = dig.view;
  return (
    <li className="v4RepDig">
      <ul className="v4RepDigQuestions">
        {dig.link.questions.map((question, index) => <li key={index} data-ai-generated="true">{question}</li>)}
      </ul>
      <p className="v4RepDigMeta">
        {t(catalog, `v4.digMode.${dig.link.mode}`)}
        {" · "}
        {view !== null ? t(catalog, `v4.report.digState.${view.state}`) : t(catalog, "v4.report.digUnknown")}
      </p>
      {view !== null && view.state === "DONE" && view.headline !== null ? (
        <p className="v4RepProse" data-ai-generated="true">{view.headline}</p>
      ) : null}
      {view !== null && view.state === "DONE" && view.counts !== null ? (
        <div className="v4RepBar"><V4TrustBar counts={view.counts} catalog={catalog} size="small" showCounts /></div>
      ) : null}
      {view !== null && view.state === "DONE" ? (
        <Link className="v4Link v4RepDigLink" href={`/v4/debate/${encodeURIComponent(dig.link.childRunId)}`}>
          {t(catalog, "v4.report.digOpenMap")}
        </Link>
      ) : null}
    </li>
  );
}
