"use client";

import Link from "next/link";
import { useState } from "react";
import type { PathRewrite, PathsChangedSince, PointOfViewVerdict } from "@debateai/contract";
import { formatDate, t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import { isFinishedRewrite, rewriteStateOf } from "@/lib/v4/mapModel";
import { levelHref } from "@/lib/v4/storage";
import type { DigView, ReadingLevel, RewriteState, V4Map, V4Path, V4Point } from "@/lib/v4/types";
import { V4SourceList } from "./V4Sources";

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

function day(locale: string, iso: string): string {
  return formatDate(locale, iso, { dateStyle: "medium" });
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

/** The one line a path's card on the map carries about its rewrites (the panel shows the rest). */
function cardLine(path: V4Path, catalog: MessageCatalog, locale: string): string | null {
  switch (pathRewriteState(path)) {
    case "REWRITING":
      return t(catalog, "v4.rewrite.state.WRITING");
    case "NO_CHANGE":
      return t(catalog, "v4.rewrite.state.NO_CHANGE");
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
export function V4RewriteCardNote(props: Readonly<{ path: V4Path; catalog: MessageCatalog; locale: string }>) {
  const { path, catalog } = props;
  const line = cardLine(path, catalog, props.locale);
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
export function V4WhatChanged(props: Readonly<{ sentences: readonly string[]; catalog: MessageCatalog }>) {
  return (
    <section className="v4RewriteChanged">
      <h3 className="v4PanelH3">{t(props.catalog, "v4.rewrite.whatChanged")}</h3>
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

/** The dig's own points with their trust words and sources; points no second AI checked are only counted. */
function DigPoints(props: Readonly<{ points: readonly V4Point[]; catalog: MessageCatalog; locale: string }>) {
  const { catalog } = props;
  const checked = props.points.filter((point) => point.trust !== null);
  const unchecked = props.points.length - checked.length;
  return (
    <div className="v4RewriteDigPoints">
      <ul className="v4PanelPoints">
        {checked.map((point) => (
          <li key={point.id} className={`v4PanelPoint v4PanelPoint${point.trust}`}>
            <span className="v4PanelMark" aria-hidden="true" />
            <div className="v4PanelPointBody">
              <span className="v4RewritePointWord">{t(catalog, `v4.trust.${point.trust}`)}</span>
              <p className="v4PanelPointText" data-ai-generated="true">{point.text}</p>
              <V4SourceList sources={point.sources} catalog={catalog} locale={props.locale} />
            </div>
          </li>
        ))}
      </ul>
      {unchecked > 0 ? <p className="v4PanelUnchecked v4Muted">{tPlural(catalog, "v4.panel.unchecked", unchecked, props.locale)}</p> : null}
    </div>
  );
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
  const stateKey = state === null ? undefined : STATE_KEYS[state];
  const rewritten = rewrittenLine(path, catalog, locale);
  const summary = state === "REWRITTEN" && latest !== null ? latest.text.summary.trim() : "";
  return (
    <section className={`v4Rewrite${state === null ? "" : ` v4Rewrite${state}`}`} aria-label={t(catalog, "v4.rewrite.whatChanged")}>
      {stateKey === undefined ? null : <p className="v4RewriteState" role="status">{t(catalog, stateKey)}</p>}
      {rewritten === null ? null : <p className="v4RewriteWhen v4Muted">{rewritten}</p>}
      {summary.length > 0 ? <p className="v4PanelText" data-ai-generated="true">{summary}</p> : null}
      {latest !== null ? <V4WhatChanged sentences={latest.what_changed} catalog={catalog} /> : null}
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
              ? <DigPoints points={digPoints} catalog={catalog} locale={locale} />
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
 * The top of the map (owner Q-D11): how many paths digs changed since the answer was written, or since the latest report
 * (version n), with "Write my report". Hidden when nothing changed since.
 */
export function V4ChangedSince(props: Readonly<{
  changedSince: PathsChangedSince | null | undefined;
  reportHref: string;
  catalog: MessageCatalog;
  locale: string;
}>) {
  const { changedSince, catalog } = props;
  if (changedSince === null || changedSince === undefined || changedSince.count === 0) return null;
  const line = changedSince.since_report_version === null
    ? tPlural(catalog, "v4.rewrite.changedSince", changedSince.count, props.locale)
    : t(catalog, "v4.rewrite.changedSinceReport", { n: changedSince.since_report_version, count: changedSince.count });
  return (
    <section className="v4ChangedSince" aria-label={line}>
      <p className="v4ChangedSinceText">{line}</p>
      <Link className="v4Btn v4BtnPrimary v4ChangedSinceReport" href={props.reportHref}>{t(catalog, "v4.rail.writeReport")}</Link>
    </section>
  );
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
