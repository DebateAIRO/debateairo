"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import type { PathRewrite, PathsChangedSince, PointOfViewVerdict } from "@debateai/contract";
import { formatDate, t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import { cardLabel, digOutcome, pathHolds, pathOutcome, type DigOutcome } from "@/lib/v4/mapLooks";
import { isFinishedRewrite, rewriteStateOf } from "@/lib/v4/mapModel";
import type { ReportStage } from "@/lib/v4/reportWriting";
import { servedRewriteWords } from "@/lib/v4/trust";
import { levelHref } from "@/lib/v4/storage";
import type { DigView, ReadingLevel, RewriteState, TrustWord, V4Map, V4Path, V4Point } from "@/lib/v4/types";
import { V4SourcesFold } from "./V4Sources";

/*
 * Dig model revision W4-6 (plan 2026-10-30-dig-model-revision.md; owner answers of 30-31 Oct): what a dig did to a path.
 * A dig runs a short follow-up debate and then rewrites the path it came from; the map shows the new text, "What the dig
 * changed", the verdict on the person's own point of view (draft 5.3, approved word for word: the page picks the line from
 * the outcome and scope, an AI never writes it), the text before each rewrite, the dig's own points and sources, and a
 * link to the dig's map. Four states (draft 5.5): rewriting, rewritten, no change, failed. A path higher up is only
 * marked ("A dig further down changed part of this.", owner Q-D5). Also here: the top of the map ("Paths changed since the
 * answer was written", owner Q-D11) and what a dig's own page says in place of a short answer (owner Q-D13: a dig keeps its
 * points and its answer text, and writes no story). Nothing here fetches or stores anything; no score reaches the page.
 */

type FinishedRewrite = Extract<PathRewrite, { state: "READY" | "READY_WITH_RESERVATION" }>;

/** A sign no AI text or person's words can hold, so a sentence splits around it and the inserted text alone is marked. */
const SLOT = "⁣⁣";

/** The catalogue sentence `key` cut where `name` goes: the parts before and after it. */
function around(catalog: MessageCatalog, key: string, name: string, values: Readonly<Record<string, string | number>> = {}):
  Readonly<{ before: string; after: string }> {
  const [before = "", after = ""] = t(catalog, key, { ...values, [name]: SLOT }).split(SLOT);
  return { before, after };
}

/**
 * The owner's answers of 5 Nov (question 4 A): "Rewritten after a dig on …" and "Before the dig on …" take the long form with
 * the year, as the record writes dates ("3 November 2026", report-f13), through the shared date helper.
 */
function day(locale: string, iso: string): string {
  return formatDate(locale, iso, { dateStyle: "long" });
}

/** The newest rewrite of a path (the one whose state the path shows), or null when a dig only changed something below. */
function newestOf(path: V4Path): PathRewrite | null {
  return path.rewrites?.history.at(-1) ?? null;
}

/** The finished rewrites of a path, oldest first; the newest is the path's text now. */
function finishedOf(path: V4Path): readonly FinishedRewrite[] {
  return (path.rewrites?.history ?? []).filter(isFinishedRewrite);
}

/** The path's state: what became of its newest rewrite (null: no dig rewrote it). */
export function pathRewriteState(path: V4Path): RewriteState | null {
  return rewriteStateOf(newestOf(path));
}

/** "Rewritten after a dig on {date}." or "Rewritten after {count} digs. Latest on {date}."; null when no dig changed it. */
export function rewrittenLine(path: V4Path, catalog: MessageCatalog, locale: string): string | null {
  const changed = finishedOf(path).filter((rewrite) => rewrite.changed);
  const latest = changed.at(-1);
  if (latest === undefined) return null;
  const date = day(locale, latest.rewritten_at);
  return changed.length === 1
    ? t(catalog, "v4.rewrite.rewrittenOnce", { date })
    : t(catalog, "v4.rewrite.rewrittenMany", { count: changed.length, date });
}

/**
 * The one line a path's card on the map carries about its rewrites (the panel shows the rest). map-d5 / journey-f11: a
 * dig that changed nothing says what it found ("Confirmed: the answer holds", or that nothing new was found), never only
 * that nothing changed, when the page can tell.
 */
function cardLine(path: V4Path, digs: readonly DigView[], catalog: MessageCatalog, locale: string): string | null {
  switch (pathRewriteState(path)) {
    case "REWRITING":
      return t(catalog, "v4.rewrite.state.WRITING");
    case "NO_CHANGE": {
      const outcome = pathOutcome(path, digs)?.outcome ?? null;
      if (outcome === "CONFIRMED") return t(catalog, "v4.result.card.CONFIRMED");
      if (outcome === "NOTHING_NEW") return t(catalog, "v4.result.card.NOTHING_NEW");
      return t(catalog, "v4.rewrite.state.NO_CHANGE");
    }
    case "FAILED":
      return t(catalog, "v4.rewrite.card.FAILED");
    case "REWRITTEN":
      return rewrittenLine(path, catalog, locale);
    case null:
      return null;
  }
}

/**
 * On a path's card (the desktop tree, the phone outline): one line about its rewrites, and the "changed further down"
 * mark. Plain spans: the card is a button, so nothing in it may be a control of its own.
 */
export function V4RewriteCardNote(props: Readonly<{ path: V4Path; catalog: MessageCatalog; locale: string; digs?: readonly DigView[] }>) {
  const { path, catalog } = props;
  const line = cardLine(path, props.digs ?? [], catalog, props.locale);
  const below = path.rewrites?.changedBelow === true;
  if (line === null && !below) return null;
  const state = pathRewriteState(path);
  return (
    <span className={`v4RewriteNote${state === null ? "" : ` v4RewriteNote${state}`}`}>
      {line === null ? null : <span className="v4RewriteNoteLine">{line}</span>}
      {below ? <span className="v4RewriteNoteBelow">{t(catalog, "v4.rewrite.changedBelow")}</span> : null}
    </span>
  );
}

/** The verdict line of draft 5.3 for an outcome and scope (one line for NOT_SETTLED, whatever its scope). */
export function viewLine(view: PointOfViewVerdict, catalog: MessageCatalog): string {
  return t(catalog, view.outcome === "NOT_SETTLED" ? "v4.view.NOT_SETTLED" : `v4.view.${view.outcome}.${view.scope}`);
}

/** "Your point of view": the person's own words quoted, the verdict line, the AI's reason, and that it stayed theirs. */
export function V4PointOfView(props: Readonly<{ view: PointOfViewVerdict; catalog: MessageCatalog }>) {
  const { view, catalog } = props;
  const why = around(catalog, "v4.view.why", "reason");
  return (
    <section className="v4RewriteView">
      <h3 className="v4PanelH3">{t(catalog, "v4.view.heading")}</h3>
      {/* The person's own words: theirs, not AI text. */}
      <ul className="v4RewriteOwnWords">
        {view.own_words.map((words, index) => <li key={index}><q>{words}</q></li>)}
      </ul>
      <p className="v4RewriteVerdict">{viewLine(view, catalog)}</p>
      <p className="v4PanelText">{why.before}<span data-ai-generated="true">{view.reason}</span>{why.after}</p>
      <p className="v4PanelHint v4Muted">{t(catalog, "v4.view.asYours")}</p>
    </section>
  );
}

/** "What the dig changed": one to three plain sentences (AI text). */
export function V4WhatChanged(props: Readonly<{ sentences: readonly string[]; catalog: MessageCatalog; below?: boolean }>) {
  return (
    <section className="v4RewriteChanged">
      <h3 className="v4PanelH3">{t(props.catalog, props.below === true ? "v4.rewrite.whatChangedBelow" : "v4.rewrite.whatChanged")}</h3>
      <ul className="v4RewriteSentences" data-ai-generated="true">
        {props.sentences.map((sentence, index) => <li key={index}>{sentence}</li>)}
      </ul>
    </section>
  );
}

/** Each text the path had before a dig changed it, oldest first: "Before the dig on {date}:" and the line then. */
function earlierTexts(path: V4Path): ReadonlyArray<Readonly<{ key: string; date: string; line: string }>> {
  const original = path.rewrites?.original.line ?? "";
  let before = original;
  const out: Array<{ key: string; date: string; line: string }> = [];
  for (const rewrite of finishedOf(path)) {
    if (rewrite.changed && before.trim().length > 0) out.push({ key: rewrite.rewrite_id, date: rewrite.dig_finished_at, line: before });
    before = rewrite.text.line;
  }
  return out;
}

/**
 * The dig's own points with their trust words and sources; points no second AI checked are only counted. W4-8: a point the
 * rewrite rests on carries the word the server worked out for the path (`served`), the others their own.
 */
function DigPoints(props: Readonly<{ points: readonly V4Point[]; served: ReadonlyMap<string, TrustWord | null>; catalog: MessageCatalog;
  locale: string }>) {
  const { catalog } = props;
  const points = props.points.map((point) => (props.served.has(point.id) ? { ...point, trust: props.served.get(point.id) ?? null } : point));
  const checked = points.filter((point) => point.trust !== null);
  const unchecked = points.length - checked.length;
  return (
    <div className="v4RewriteDigPoints">
      <ul className="v4PanelPoints">
        {checked.map((point) => (
          <li key={point.id} className={`v4PanelPoint v4PanelPoint${point.trust}`}>
            <span className="v4PanelMark" aria-hidden="true" />
            <div className="v4PanelPointBody">
              <span className="v4RewritePointWord">{t(catalog, `v4.trust.${point.trust}`)}</span>
              <p className="v4PanelPointText" data-ai-generated="true">{point.text}</p>
              {/* map-d4 A: a finding's sources folded into one line, as in the panel's own findings. */}
              <V4SourcesFold sources={point.sources} catalog={catalog} locale={props.locale} />
            </div>
          </li>
        ))}
      </ul>
      {unchecked > 0 ? <p className="v4PanelUnchecked v4Muted">{tPlural(catalog, "v4.panel.unchecked", unchecked, props.locale)}</p> : null}
    </div>
  );
}

const RESULT_BOX_KEYS: Readonly<Record<Exclude<DigOutcome, "CONFIRMED">, string>> = Object.freeze({
  CORRECTED: "v4.result.tag.CORRECTED",
  ADDED_TO: "v4.result.tag.ADDED_TO",
  NOTHING_NEW: "v4.result.box.NOTHING_NEW"
});
const RESULT_BOX_SHAPES: Readonly<Record<DigOutcome, string>> = Object.freeze({ CORRECTED: "↻", ADDED_TO: "▲", CONFIRMED: "✓", NOTHING_NEW: "" });

/**
 * dig-d4 A (3 Nov): what the newest finished dig found, first in the panel: "Corrected" or "Added to" (the sentences of
 * what changed follow), "Confirmed" with its sentence (the path holds, or the dig found nothing that changes it), or
 * "Nothing new was found. This path stays as it was."
 */
export function V4RewriteResult(props: Readonly<{ path: V4Path; digs: readonly DigView[]; catalog: MessageCatalog }>) {
  const { path, catalog } = props;
  const outcome = pathOutcome(path, props.digs)?.outcome ?? null;
  if (outcome === null) return null;
  return <ResultBox outcome={outcome} holds={pathHolds(path)} catalog={catalog} />;
}

/** The result box itself: its shape and its one sentence (a confirmed path that holds says so). */
function ResultBox(props: Readonly<{ outcome: DigOutcome; holds: boolean; catalog: MessageCatalog }>) {
  const { outcome, catalog } = props;
  const key = outcome === "CONFIRMED"
    ? props.holds ? "v4.result.box.CONFIRMED_HOLDS" : "v4.result.box.CONFIRMED"
    : RESULT_BOX_KEYS[outcome];
  return (
    <p className={`v4RewriteResult v4RewriteResult${outcome}`} role="status">
      {RESULT_BOX_SHAPES[outcome].length > 0 ? <span className="v4RewriteResultShape" aria-hidden="true">{RESULT_BOX_SHAPES[outcome]}</span> : null}
      {t(catalog, key)}
    </p>
  );
}

/**
 * dig-f32 (3 Nov): a finished dig's own panel opens with the same result box as the path it rewrote (dig-d4): what THIS
 * dig found ("Corrected", "Added to", "Confirmed: this path holds…", or nothing new). Only for a dig whose rewrite of a
 * path is finished and whose path is on this map; null otherwise (its panel then reads as before).
 */
export function V4DigResult(props: Readonly<{ dig: DigView; path: V4Path | null; catalog: MessageCatalog }>) {
  const outcome = digResultOf(props.dig, props.path);
  if (outcome === null || props.path === null) return null;
  return <ResultBox outcome={outcome} holds={pathHolds(props.path)} catalog={props.catalog} />;
}

/** What V4DigResult shows for a dig (null: no box, as for a dig still at work or one that rewrote no path here). */
export function digResultOf(dig: DigView, path: V4Path | null): DigOutcome | null {
  const rewrite = dig.rewrite ?? null;
  if (dig.state !== "DONE" || path === null || rewrite === null || !isFinishedRewrite(rewrite)) return null;
  return digOutcome(dig);
}

const STATE_KEYS: Readonly<Partial<Record<RewriteState, string>>> = Object.freeze({
  REWRITING: "v4.rewrite.state.WRITING",
  NO_CHANGE: "v4.rewrite.state.NO_CHANGE",
  FAILED: "v4.rewrite.state.FAILED"
});

/**
 * Everything the panel shows about a path's rewrites, under its new text: its state, when it was rewritten, its summary,
 * "What the dig changed", "Your point of view", "Show earlier text", the dig's points and sources, and the dig's map.
 * `digs` are the digs of this map as read: the newest rewrite's dig gives its points (a failed rewrite shows them open).
 */
export function V4PathRewrite(props: Readonly<{
  path: V4Path;
  digs: readonly DigView[];
  linkLevel: ReadingLevel | null;
  catalog: MessageCatalog;
  locale: string;
  /**
   * dig-d4 A (3 Nov): what the newest finished dig looked into, in its own words (the panel renders the title, AI text
   * marked only when an AI wrote it); shown as "You asked: …" under the result. Absent or null: no line.
   */
  asked?: ReactNode;
}>) {
  const { path, catalog, locale } = props;
  const state = pathRewriteState(path);
  const newest = newestOf(path);
  const latest = finishedOf(path).at(-1) ?? null;
  const earlier = earlierTexts(path);
  const [showEarlier, setShowEarlier] = useState(false);
  const [pointsOpen, setPointsOpen] = useState<boolean | null>(null);
  const below = path.rewrites?.changedBelow === true;
  if (state === null && !below) return null;
  const dig = newest === null ? null : props.digs.find((candidate) => candidate.link.childRunId === newest.dig_run_id) ?? null;
  const digPoints = dig?.points ?? null;
  // Draft 5.5: a failed rewrite says the dig's points and sources "are below", so they start open there.
  const showPoints = pointsOpen ?? state === "FAILED";
  // dig-d4 A: a finished dig's result is said first; "The dig didn't change this path." only when the page cannot tell it.
  const result = pathOutcome(path, props.digs);
  const stateKey = state === null || (state === "NO_CHANGE" && result !== null) ? undefined : STATE_KEYS[state];
  const rewritten = rewrittenLine(path, catalog, locale);
  const summary = state === "REWRITTEN" && latest !== null ? latest.text.summary.trim() : "";
  const asked = around(catalog, "v4.rewrite.youAsked", "question");
  return (
    <section className={`v4Rewrite${state === null ? "" : ` v4Rewrite${state}`}`} aria-label={t(catalog, "v4.rewrite.whatChanged")}>
      {result === null ? null : <V4RewriteResult path={path} digs={props.digs} catalog={catalog} />}
      {props.asked === undefined || props.asked === null || latest === null ? null : (
        <p className="v4RewriteAsked">{asked.before}{props.asked}{asked.after}</p>
      )}
      {stateKey === undefined ? null : <p className="v4RewriteState" role="status">{t(catalog, stateKey)}</p>}
      {rewritten === null ? null : <p className="v4RewriteWhen v4Muted">{rewritten}</p>}
      {summary.length > 0 ? <p className="v4PanelText" data-ai-generated="true">{summary}</p> : null}
      {latest !== null ? <V4WhatChanged sentences={latest.what_changed} catalog={catalog} below={latest.cause === "CHILD_PATH"} /> : null}
      {latest !== null && latest.view !== null ? <V4PointOfView view={latest.view} catalog={catalog} /> : null}
      {earlier.length > 0 ? (
        <div className="v4RewriteEarlier">
          <button type="button" className="v4Link v4RewriteToggle" aria-expanded={showEarlier} onClick={() => setShowEarlier((open) => !open)}>
            {t(catalog, showEarlier ? "v4.rewrite.hideEarlier" : "v4.rewrite.showEarlier")}
          </button>
          {showEarlier ? (
            <ol className="v4RewriteEarlierList">
              {earlier.map((text) => (
                <li key={text.key}>
                  <span className="v4PanelSmallHead">{t(catalog, "v4.rewrite.before", { date: day(locale, text.date) })}</span>{" "}
                  <span data-ai-generated="true">{text.line}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
      {newest === null ? null : (
        <div className="v4RewriteDig">
          <button type="button" className="v4Link v4RewriteToggle" aria-expanded={showPoints} onClick={() => setPointsOpen(!showPoints)}>
            {t(catalog, showPoints ? "v4.rewrite.hideDigPoints" : "v4.rewrite.seeDigPoints")}
          </button>
          {showPoints
            ? (digPoints !== null && digPoints.length > 0
              ? <DigPoints points={digPoints} served={servedRewriteWords(path.rewrites?.history)} catalog={catalog} locale={locale} />
              : <p className="v4PanelHint v4Muted">{t(catalog, "v4.rewrite.digPointsElsewhere")}</p>)
            : null}
          <Link className="v4Btn v4RewriteDigMap" href={levelHref(`/v4/debate/${encodeURIComponent(newest.dig_run_id)}`, props.linkLevel)}>
            {t(catalog, "v4.rewrite.openDigMap")}
          </Link>
        </div>
      )}
      {below ? <p className="v4RewriteBelow">{t(catalog, "v4.rewrite.changedBelow")}</p> : null}
    </section>
  );
}

/**
 * The top of the map. Owner Q-D11 counted the paths digs changed since the answer (or the latest report) was written. V4
 * screen review (owner picks 3 Nov 2026), dig-f19 / map-f17: since the 31 Oct ruling the main answer updates itself after
 * each change, so a line shows only once a report exists and the map has moved on since it: "Your report is older than
 * the map." with [Update my report], the changed paths named under it (never a count), and while a dig runs "It will
 * wait for your dig in progress." (ruling F7; the owner's words in the fourth round, 6 Nov). Hidden before any report, and
 * when nothing changed since it. The fourth round also hides it whole while a new report version waits for digs or is
 * being written (that version takes these changes in), and brings it back only when the map changes after that version
 * (`reportStage`; reportCoversChanges below).
 */
export function V4ChangedSince(props: Readonly<{
  changedSince: PathsChangedSince | null | undefined;
  reportHref: string;
  catalog: MessageCatalog;
  locale: string;
  /** dig-f19: the paths that changed since the report (lib/v4/readyMoment.ts pathsChangedSinceReport), in the map's order. */
  changedPaths?: readonly V4Path[];
  /** A dig is still running: the report it writes will wait for it. */
  digRunning?: boolean;
  /**
   * The owner's fourth round (6 Nov 2026): the map's report stage (useMapReport's `stage`). While a new version waits for
   * digs or is written, the box is hidden; it comes back when the map changes after that version. Absent: as before.
   */
  reportStage?: ReportStage;
  /**
   * The start step's hand-over (9 Nov): false until the map's first report check has answered (useMapReport's
   * `firstCheckAnswered`). Until then the box draws nothing, as the report button's place is held ([data-report-hold]): on a
   * page opened while a new version is written, the box would otherwise flash before the stage says it takes the changes
   * in. A check that answered and failed shows the box as before. Absent: as before.
   */
  reportRead?: boolean;
}>) {
  const { changedSince, catalog } = props;
  const titleId = useId();
  if (changedSince === null || changedSince === undefined || changedSince.since_report_version === null || changedSince.count === 0) {
    return null;
  }
  if (props.reportRead === false) return null;
  if (props.reportStage !== undefined && reportCoversChanges(props.reportStage, changedSince.since_report_version)) return null;
  const named = props.changedPaths ?? [];
  return (
    <section className="v4ChangedSince" aria-labelledby={titleId}>
      <p id={titleId} className="v4ChangedSinceText">{t(catalog, "v4.rewrite.reportOlder")}</p>
      {/* map-f15: the one "Write my report" button is in the top bar; this line's [Update my report] is a plain link to the same place. */}
      <Link className="v4Link v4ChangedSinceReport" href={props.reportHref}>{t(catalog, "v4.rewrite.updateReport")}</Link>
      {named.length === 0 ? null : (
        <div className="v4ChangedSincePaths">
          <p className="v4ChangedSinceLead v4Muted">{t(catalog, "v4.rewrite.changedSinceYourReport")}</p>
          <ul className="v4ChangedSinceList">
            {/* map-f25 / r2-20 A: each path by its short label, so no outcome words ("held up") show; the panel has the whole line. */}
            {named.map((path) => <li key={path.id} data-ai-generated="true"><span dir="auto">{cardLabel(path.line)}</span></li>)}
          </ul>
        </div>
      )}
      {props.digRunning === true ? <p className="v4ChangedSinceWait v4Muted">{t(catalog, "v4.rewrite.waitsForDig")}</p> : null}
    </section>
  );
}

/**
 * The owner's fourth round (6 Nov 2026): whether a report version newer than the one the map's count is against
 * (`sinceVersion`, the server's newest written report) takes the changes in. A version that waits for digs or is being
 * written does (it reads every finished rewrite when it starts); so does one written since, when the map was read before
 * it was (the count then still names the older version). A version that did not finish takes nothing in, and an
 * investigation reopened by a dig (or not read) says nothing about versions: the count speaks for itself, as before.
 *
 * The DONE case is a stand-in for the map's next read of the answer, and it has one known gap. A rewrite that finishes
 * after the new version began but before it was written is in that old count, yet the version does not have it. Until the
 * answer is read again, the box stays hidden for it. The page closes that gap by reading the answer again as soon as a
 * version is written (wiring list item 21, with the `reportStage` prop): the fresh count then names the new version, and
 * this case only keeps the box from flashing between the version's end and that read.
 */
function reportCoversChanges(stage: ReportStage, sinceVersion: number): boolean {
  switch (stage.kind) {
    case "WAITING_DIGS":
    case "WRITING":
    case "DONE":
      return stage.version > sinceVersion;
    case "FAILED":
    case "NONE":
    case "UNKNOWN":
      return false;
  }
}

const DIG_PAGE_STATE_KEYS: Readonly<Record<RewriteState, string>> = Object.freeze({
  REWRITING: "v4.digPage.rewriting",
  REWRITTEN: "v4.digPage.rewrote",
  NO_CHANGE: "v4.rewrite.state.NO_CHANGE",
  FAILED: "v4.rewrite.state.FAILED"
});

/**
 * A dig's own page, in place of a short answer (a dig writes no story, Q-D13): what it looked into, the path it rewrote and
 * what became of that rewrite, and a link back to that path. `pathLine` is that path's line on the map above (from the
 * trail), used when the dig was of the whole path (no picks).
 */
export function V4DigPageIntro(props: Readonly<{
  map: V4Map;
  pathLine: string | null;
  linkLevel: ReadingLevel | null;
  catalog: MessageCatalog;
}>) {
  const { catalog } = props;
  const dig = props.map.dig ?? null;
  if (dig === null) return null;
  const picks = dig.picks.length > 0
    ? dig.picks.map((pick) => ({ text: pick.text, ai: pick.by === "AI_SUGGESTION" }))
    : props.pathLine === null ? [] : [{ text: props.pathLine, ai: true }];
  const looked = around(catalog, "v4.digPage.lookedInto", "picks");
  const rewrite = dig.rewrite;
  const state = rewriteStateOf(rewrite);
  const finished = rewrite !== null && isFinishedRewrite(rewrite) ? rewrite : null;
  const rewrote = around(catalog, "v4.digPage.rewrote", "line");
  const back = dig.position_ref === null
    ? null
    : levelHref(`/v4/debate/${encodeURIComponent(dig.parent_run_id)}?path=${encodeURIComponent(dig.position_ref)}`, props.linkLevel);
  return (
    <section className="v4DigPage">
      {picks.length > 0 ? (
        <div className="v4DigPageLooked">
          {looked.before.trim().length > 0 ? <p className="v4PanelText">{looked.before.trim()}</p> : null}
          <ul className="v4DigPagePicks">
            {picks.map((pick, index) => <li key={index} data-ai-generated={pick.ai ? "true" : undefined}>{pick.text}</li>)}
          </ul>
          {looked.after.trim().length > 0 ? <p className="v4PanelText">{looked.after.trim()}</p> : null}
        </div>
      ) : null}
      {state === null ? null : state === "REWRITTEN" && finished !== null ? (
        <p className="v4PanelText">{rewrote.before}<span data-ai-generated="true">{finished.text.line}</span>{rewrote.after}</p>
      ) : (
        <p className="v4RewriteState" role="status">{t(catalog, DIG_PAGE_STATE_KEYS[state])}</p>
      )}
      {finished !== null ? <V4WhatChanged sentences={finished.what_changed} catalog={catalog} /> : null}
      {finished !== null && finished.view !== null ? <V4PointOfView view={finished.view} catalog={catalog} /> : null}
      {back === null ? null : <Link className="v4Btn v4DigPageBack" href={back}>{t(catalog, "v4.digPage.backToPath")}</Link>}
    </section>
  );
}
