"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { AnswerMainAnswer } from "@debateai/contract";
import { formatDate, t, type MessageCatalog } from "@/lib/i18n/translate";
import { cardLabel } from "@/lib/v4/mapLooks";
import type { V4Map } from "@/lib/v4/types";
import { shortText } from "./V4MapTree";
import { V4TrustBar } from "./V4TrustBar";

/*
 * V4 screen review (owner picks of 3 Nov): the answer card.
 *   - map-d1 A: one full-width card across the top, when the person arrives and whenever "Your question" is open. Opening
 *     any other question, or a short window, folds it into one line ("Answer: …") that opens it again (on a phone it goes
 *     back to "Your question"). The panel of "Your question" then shows the evidence, not a second copy of the answer.
 *   - map-f2: only one answer is ever called current: the newest of the first answer, the answer rewritten after a dig
 *     and the report's answer. The others are under one fold, "Earlier versions of the answer", with their dates; the fold
 *     appears only once an earlier version exists.
 *   - map-f8: the "How sure" line, built from the findings' trust words, beside the four-shade bar.
 * The fold is one of the six approved moves (under half a second; instant under reduced motion, v4-map-looks.css).
 * Nothing here fetches or stores anything; no score, price or model reaches it.
 */

/** The report's answer as the page read it (R22 W5-1): its version, its text, and when it was written. */
export type V4ReportAnswer = Readonly<{ version: number; segments: readonly string[]; writtenAt?: string | null }>;

type Version =
  | Readonly<{ kind: "FIRST"; key: string; at: string | null }>
  | Readonly<{ kind: "MAIN"; key: string; at: string; version: number; segments: readonly string[]; trigger: string; reservation: boolean; positionRef: string }>
  | Readonly<{ kind: "REPORT"; key: string; at: string | null; version: number; segments: readonly string[] }>;

/** A sign no AI text holds, so a sentence splits around the path's name and the name alone is marked as AI text. */
const SLOT = "\u2063\u2063";

const time = (at: string | null): number => (at === null ? Number.NEGATIVE_INFINITY : Date.parse(at));

/**
 * map-f2: every answer this debate has had, newest first. The first answer is always the oldest (a rewrite and a report
 * both come after it); a rewritten answer and a report's answer go by their dates (a report wins a tie).
 */
export function answerVersions(input: Readonly<{
  mainAnswer: AnswerMainAnswer | null | undefined;
  reportAnswer: V4ReportAnswer | null | undefined;
  answeredAt: string | null;
}>): readonly Version[] {
  const all: Version[] = [{ kind: "FIRST", key: "first", at: input.answeredAt }];
  for (const version of input.mainAnswer?.history ?? []) {
    all.push({
      kind: "MAIN",
      key: `main:${version.version}`,
      at: version.updated_at,
      version: version.version,
      segments: version.segments.map((segment) => segment.text),
      trigger: version.trigger,
      reservation: version.with_reservation === true,
      positionRef: version.position_ref
    });
  }
  const report = input.reportAnswer ?? null;
  if (report !== null) {
    all.push({ kind: "REPORT", key: `report:${report.version}`, at: report.writtenAt ?? null, version: report.version, segments: report.segments });
  }
  const [first, ...later] = all;
  const rank = { FIRST: 0, MAIN: 1, REPORT: 2 } as const;
  return [...later.sort((a, b) => time(b.at) - time(a.at) || rank[b.kind] - rank[a.kind]), first!];
}

/**
 * V4 screen review (3 Nov 2026), map-f21: the long answer under "Read the full answer" while the short one is written. It
 * keeps what it was given, so when the short answer arrives (and the long one is no longer the fallback) a reader who
 * opened it goes on reading in the same place; the short answer fills the empty place above it. Shared by the answer card
 * above the map (map-d1) and the panel of "Your question" when the card is not shown.
 */
export function V4FullAnswerFold(props: Readonly<{ paragraphs: readonly string[]; catalog: MessageCatalog }>) {
  const text = props.paragraphs.join("\n\n");
  const [held, setHeld] = useState(text);
  useEffect(() => {
    if (text !== "") setHeld(text);
  }, [text]);
  const shown = text !== "" ? text : held;
  if (shown === "") return null;
  return (
    <details className="v4PanelFullAnswer">
      <summary>{t(props.catalog, "v4.panel.readFullAnswer")}</summary>
      <div className="v4PanelFallback" data-ai-generated="true">
        {shown.split("\n\n").map((paragraph, index) => <p key={index} className="v4PanelText">{paragraph}</p>)}
      </div>
    </details>
  );
}

/** The first answer's words: the story's short answer, else the whole composed answer (DATA-2). */
function FirstAnswer(props: Readonly<{ map: V4Map; catalog: MessageCatalog; lead: boolean }>) {
  const { map, catalog } = props;
  const headline = map.headline?.trim() ?? "";
  const summary = map.summary?.trim() ?? "";
  const fallback = (map.fallbackText ?? "").split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter((paragraph) => paragraph.length > 0);
  const writing = map.storyState === "WRITING";
  const noStory = map.storyState === "NONE";
  const words = headline.length > 0 || summary.length > 0
    ? (
      <>
        <div data-ai-generated="true">
          {headline.length > 0 ? <p className={props.lead ? "v4AnswerHeadline v4Serif" : "v4AnswerText"}>{headline}</p> : null}
          {summary.length > 0 ? <p className="v4AnswerText">{summary}</p> : null}
        </div>
        {map.reservation ? <p className="v4AnswerNote v4Muted">{t(catalog, "v4.story.reservation")}</p> : null}
      </>
    )
    : fallback.length > 0 && writing
      // map-f21 / wait-f9 (the ready-digs track): while the short answer is written, one line says so and the long answer
      // waits under "Read the full answer" (below), so nothing swaps under the reader's eyes.
      ? <p className="v4AnswerNote v4Muted">{t(catalog, "v4.panel.fallbackWriting")}</p>
      : fallback.length > 0
        ? (
          <>
            <div className="v4AnswerFallback" data-ai-generated="true">
              {fallback.map((paragraph, index) => <p key={index} className="v4AnswerText">{paragraph}</p>)}
            </div>
            {noStory ? null : <p className="v4AnswerNote v4Muted">{t(catalog, "v4.panel.fallbackMissing")}</p>}
          </>
        )
        : noStory ? null : <p className="v4Muted">{t(catalog, writing ? "v4.panel.storyWriting" : "v4.panel.storyMissing")}</p>;
  return (
    <>
      {words}
      <V4FullAnswerFold paragraphs={writing ? fallback : []} catalog={catalog} />
    </>
  );
}

function Segments(props: Readonly<{ segments: readonly string[]; lead: boolean }>) {
  return (
    <div data-ai-generated="true">
      {props.segments.map((segment, index) => (
        <p key={index} className={props.lead && index === 0 ? "v4AnswerHeadline v4Serif" : "v4AnswerText"}>{segment}</p>
      ))}
    </div>
  );
}

/** One line that names the answer when folded: its first words. */
function firstWords(version: Version, map: V4Map): string {
  if (version.kind !== "FIRST") return version.segments[0] ?? "";
  const headline = map.headline?.trim() ?? "";
  if (headline.length > 0) return headline;
  return (map.fallbackText ?? "").trim();
}

function VersionBody(props: Readonly<{ version: Version; map: V4Map; catalog: MessageCatalog; locale: string; lead: boolean;
  pathName: (positionRef: string) => string | null }>) {
  const { version, catalog } = props;
  if (version.kind === "FIRST") return <FirstAnswer map={props.map} catalog={catalog} lead={props.lead} />;
  if (version.kind === "REPORT") return <Segments segments={version.segments} lead={props.lead} />;
  const name = props.pathName(version.positionRef);
  const date = formatDate(props.locale, version.at, { dateStyle: "medium" });
  // "Updated on 3 Nov because a dig changed “Whole-system costs”": the path's name is AI text, the rest the site's.
  const [before = "", after = ""] = t(catalog, `v4.answerCard.updated.${version.trigger}`, { date, path: SLOT }).split(SLOT);
  return (
    <>
      <Segments segments={version.segments} lead={props.lead} />
      {name === null ? (
        <p className="v4AnswerNote v4Muted">
          {t(catalog, `v4.mainAnswer.trigger.${version.trigger}`)} {t(catalog, "v4.mainAnswer.updated", { date })}
        </p>
      ) : (
        <p className="v4AnswerNote v4Muted">{before}<span data-ai-generated="true">{name}</span>{after}</p>
      )}
      {version.reservation ? <p className="v4AnswerNote v4Muted">{t(catalog, "v4.mainAnswer.reservation")}</p> : null}
    </>
  );
}

function versionTitle(version: Version, catalog: MessageCatalog, locale: string): string {
  const date = version.at === null ? null : formatDate(locale, version.at, { dateStyle: "medium" });
  if (version.kind === "MAIN") return t(catalog, "v4.mainAnswer.version", { version: version.version, date: date ?? "" });
  if (version.kind === "REPORT") return t(catalog, "v4.investigation.fromReport", { n: version.version });
  return date === null ? t(catalog, "v4.answerCard.first") : t(catalog, "v4.answerCard.firstOn", { date });
}

export function V4AnswerCard(props: Readonly<{
  map: V4Map;
  mainAnswer: AnswerMainAnswer | null | undefined;
  reportAnswer?: V4ReportAnswer | null;
  /** When the first answer was served (the answer's `as_of`), for its date among the earlier versions. */
  answeredAt: string | null;
  /** map-d1: another question is open, or the window is short. */
  folded: boolean;
  /** The folded line was pressed: unfold here (desktop) or go back to "Your question" (phone). */
  onUnfold: () => void;
  /** Folds an unfolded card again where it may fold (a short window); absent: no fold button. */
  onFold?: () => void;
  catalog: MessageCatalog;
  locale: string;
  /** Extra lines under the answer (the dig's own page says what it looked into). */
  children?: ReactNode;
}>) {
  const { map, catalog, locale } = props;
  const bodyId = useId();
  // dig-f7 / map-d1: the control pressed hides itself (the folded line) or goes inert (Fold): focus moves on to the
  // card's eyebrow after unfolding, and back to the folded line after folding, never to the page's top. Only a press of
  // the card's own controls moves focus: a fold the page makes by itself (another question opened) leaves focus alone.
  const lineRef = useRef<HTMLButtonElement | null>(null);
  const eyebrowRef = useRef<HTMLParagraphElement | null>(null);
  const focusAfter = useRef<"line" | "eyebrow" | null>(null);
  useEffect(() => {
    const to = focusAfter.current;
    // Once the change the press asked for is drawn.
    if (to === null || (to === "line") !== props.folded) return;
    focusAfter.current = null;
    (to === "line" ? lineRef.current : eyebrowRef.current)?.focus();
  }, [props.folded]);
  const versions = answerVersions({ mainAnswer: props.mainAnswer, reportAnswer: props.reportAnswer, answeredAt: props.answeredAt });
  const current = versions[0]!;
  const earlier = versions.slice(1);
  const pathName = (positionRef: string): string | null => {
    const path = map.paths.find((candidate) => (candidate.positionRef ?? candidate.id) === positionRef);
    return path === undefined ? null : shortText(cardLabel(path.line), 60);
  };
  const label = current.kind === "REPORT"
    ? t(catalog, "v4.investigation.fromReport", { n: current.version })
    : t(catalog, "v4.panel.answerRoot");
  const lineWords = shortText(firstWords(current, map), 90);
  const showWhole = current.kind === "FIRST" && map.sections.length > 0;
  return (
    <section
      className={`v4AnswerCard${props.folded ? " v4AnswerCardFolded" : ""}`}
      aria-label={t(catalog, "v4.answerCard.region")}
    >
      <button
        ref={lineRef}
        type="button"
        className="v4AnswerFoldLine"
        aria-expanded={!props.folded}
        aria-controls={bodyId}
        hidden={!props.folded}
        onClick={() => {
          focusAfter.current = "eyebrow";
          props.onUnfold();
        }}
      >
        <span className="v4AnswerFoldLabel">{t(catalog, "v4.answerCard.folded")}</span>{" "}
        <span className="v4AnswerFoldWords" data-ai-generated={lineWords.length > 0 ? "true" : undefined}>{lineWords}</span>
        <span aria-hidden="true">{" ▾"}</span>
      </button>
      <div className="v4AnswerFold" id={bodyId} inert={props.folded} aria-hidden={props.folded ? "true" : undefined}>
        <div className="v4AnswerInner">
          <div className="v4AnswerHead">
            <p ref={eyebrowRef} className="v4Eyebrow" tabIndex={-1}>{label}</p>
            {props.onFold !== undefined ? (
              <button type="button" className="v4Link v4AnswerFoldBtn" aria-expanded="true" aria-controls={bodyId} onClick={() => {
                focusAfter.current = "line";
                props.onFold?.();
              }}>
                {t(catalog, "v4.answerCard.fold")}
              </button>
            ) : null}
          </div>
          <VersionBody version={current} map={map} catalog={catalog} locale={locale} lead pathName={pathName} />
          {props.mainAnswer?.writing === true ? <p className="v4AnswerNote v4Muted" role="status">{t(catalog, "v4.mainAnswer.writing")}</p> : null}
          <div className="v4AnswerSure">
            <V4TrustBar counts={map.counts} unchecked={map.unchecked} catalog={catalog} size="large" showCounts />
          </div>
          {props.children}
          {showWhole ? (
            <details className="v4AnswerMore">
              <summary>{t(catalog, "v4.answerCard.readWhole")}</summary>
              <div className="v4AnswerMoreBody" data-ai-generated="true">
                {map.sections.map((section, index) => (
                  <section key={index}>
                    {section.title.trim().length > 0 ? <h3 className="v4AnswerSectionTitle">{section.title}</h3> : null}
                    {section.paragraphs.map((paragraph, at) => <p key={at} className="v4AnswerText">{paragraph}</p>)}
                  </section>
                ))}
              </div>
            </details>
          ) : null}
          {earlier.length > 0 ? (
            <details className="v4AnswerMore v4AnswerEarlier">
              <summary>{t(catalog, "v4.mainAnswer.earlier")}</summary>
              <div className="v4AnswerMoreBody">
                {earlier.map((version) => (
                  <article key={version.key} className="v4AnswerVersion">
                    <h3 className="v4AnswerSectionTitle">{versionTitle(version, catalog, locale)}</h3>
                    <VersionBody version={version} map={map} catalog={catalog} locale={locale} lead={false} pathName={pathName} />
                  </article>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </section>
  );
}
