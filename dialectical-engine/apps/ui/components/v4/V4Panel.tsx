"use client";

import Link from "next/link";
import type { ReactNode, RefObject } from "react";
import { formatDate, t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import { addedLines, ownWords, startsWithLabel } from "@/lib/v4/askText";
import { findOpenQuestion, openQuestionsOf } from "@/lib/v4/mapModel";
import type { MoneyLine } from "@/lib/v4/money";
import { draftTarget } from "@/lib/v4/suggestions";
import { levelHref } from "@/lib/v4/storage";
import { countTrust } from "@/lib/v4/trust";
import {
  basisKey,
  DIG_MODES,
  TRUST_WORDS,
  type DigMode,
  type DigTarget,
  type DigView,
  type ReadingLevel,
  type TrustCounts,
  type TrustWord,
  type V4Map,
  type V4OpenQuestion,
  type V4Point,
  type V4Selection
} from "@/lib/v4/types";
import {
  digFor,
  digNote,
  digsUnder,
  digTitle,
  digWorking,
  openNote,
  pathTitle,
  PickBox,
  resolveSelection,
  shortText,
  TitleText,
  undugOpen,
  viaKeyboard,
  type ResolvedSelection,
  type Title
} from "./V4MapTree";
import { V4DigCompose, V4MoneyLines, type V4DigChoice } from "./V4DigSuggest";
import { V4DigPageIntro, V4PathRewrite, V4WhatChanged } from "./V4PathRewrite";
import { V4OtherPages, V4SearchNote, V4SourceList, V4WebNoteLine } from "./V4Sources";
import { V4TrustBar } from "./V4TrustBar";

/*
 * V4 initial (2026-10-28): what one question on the map knows (D3 panel), always in the same order: where you are,
 * the question, the answer here so far, the bar, the points in the four trust words, then where to dig and the dig
 * button. Points no second AI checked are only counted (decision 6). The reading level decides how much each point
 * says. Nothing here fetches or stores anything.
 * Perplexity plan W2-6 (2026-10-30): each point shows its sources at every reading level (V4Sources.tsx); the question
 * shows the debate's web note (Free, a failed search, switched off) and a path its own search note, above the points;
 * a path then lists the other pages its search found, each with "Add to researched" (wired in W4-4).
 * Dig model revision W4-6: a path a dig rewrote shows its rewrite under its new text (V4PathRewrite.tsx); a dig's own page
 * says what it looked into and the path it rewrote in place of a short answer (a dig writes no story, owner Q-D13), then its
 * answer text and its points as usual; a dig's panel says what became of its rewrite, or that it is paused at the month wall.
 */

type PanelProps = Readonly<{
  map: V4Map;
  digs: readonly DigView[];
  selected: V4Selection;
  /** How much each point says (display only). */
  readingLevel: ReadingLevel;
  /**
   * R2REG-5: the level links carry — only one the person chose (null: none). Left out, links carry `readingLevel`
   * as before.
   */
  linkLevel?: ReadingLevel | null;
  picked: ReadonlySet<string>;
  onTogglePick: (openQuestionId: string) => void;
  onSelect: (selection: V4Selection, viaKeyboard: boolean) => void;
  digMode: DigMode;
  onDigMode: (mode: DigMode) => void;
  /** Owner N13: false on Free, which has no Quick look / Thorough choice (every Free dig is a quick look). */
  showDigModes?: boolean;
  onDig: (target: DigTarget) => void;
  digBusy: boolean;
  roomNotice?: ReactNode;
  /** W2-6: "Add to researched" on one of a path's other pages; W4-4 wires it (until then the button cannot be used). */
  onAddResearched?: (pathId: string, pageRef: string) => void;
  /** W3-4: choosing what to dig (suggestions, edits, own view, the one-path rule, "Dig here too", the deepest level). */
  choice?: V4DigChoice;
  /** W3-4: the money lines before a dig (its share of today; new starts waiting for the reset). Never a price. */
  money?: readonly MoneyLine[];
  /** W4-6: on a dig's own map, the line of the path it dug, on the map above (null: not known yet, or no path). */
  digPathLine?: string | null;
  headingRef: RefObject<HTMLHeadingElement | null>;
  catalog: MessageCatalog;
  locale: string;
}>;

function basisLine(point: V4Point, catalog: MessageCatalog, locale: string): string | null {
  if (point.basis === null) return null;
  if (point.basis === "AGREED_BUT_DATED") {
    return point.asOf === null
      ? t(catalog, "v4.basis.AGREED_BUT_DATED.noDate")
      : t(catalog, "v4.basis.AGREED_BUT_DATED", { date: formatDate(locale, point.asOf, { dateStyle: "medium" }) });
  }
  return t(catalog, basisKey(point.basis));
}

function PointItem(props: Readonly<{ point: V4Point; word: TrustWord; level: ReadingLevel; catalog: MessageCatalog; locale: string }>) {
  const { point, word, level, catalog } = props;
  const basis = level === "plain" ? null : basisLine(point, catalog, props.locale);
  const reasons = level === "expert" ? point.reasons.filter((reason) => reason.trim().length > 0) : [];
  return (
    <li className={`v4PanelPoint v4PanelPoint${word}`}>
      <span className="v4PanelMark" aria-hidden="true" />
      <div className="v4PanelPointBody">
        <p className="v4PanelPointText" data-ai-generated="true">{point.text}</p>
        {basis !== null ? <p className="v4PanelBasis">{basis}</p> : null}
        {reasons.length > 0
          ? (
            <div className="v4PanelReasons">
              <span className="v4PanelSmallHead">{t(catalog, "v4.panel.reasons")}</span>
              <ul data-ai-generated="true">
                {reasons.map((reason, index) => <li key={index}>{reason}</li>)}
              </ul>
            </div>
          )
          : null}
        <V4SourceList sources={point.sources} catalog={catalog} locale={props.locale} />
        {level === "expert" && word === "DIDNT_HOLD" && point.answeredBy !== null
          ? (
            <p className="v4PanelBasis">
              <span className="v4PanelSmallHead">{t(catalog, "v4.panel.answeredBy")}</span>{" "}
              <span data-ai-generated="true">{point.answeredBy}</span>
            </p>
          )
          : null}
      </div>
    </li>
  );
}

/** The points in the four trust words, as folded groups; only groups with points; Sure is open at first. */
function PointGroups(props: Readonly<{ points: readonly V4Point[]; level: ReadingLevel; catalog: MessageCatalog; locale: string }>) {
  const groups = TRUST_WORDS.map((word) => ({ word, points: props.points.filter((point) => point.trust === word) }))
    .filter((group) => group.points.length > 0);
  if (groups.length === 0) return null;
  return (
    <div className="v4PanelGroups">
      {groups.map((group) => (
        <details key={group.word} className={`v4PanelGroup v4PanelGroup${group.word}`} open={group.word === "SURE"}>
          <summary>
            {t(props.catalog, "v4.panel.group", {
              word: t(props.catalog, `v4.trust.${group.word}`),
              count: group.points.length
            })}
          </summary>
          <ul className="v4PanelPoints">
            {group.points.map((point) => (
              <PointItem
                key={point.id}
                point={point}
                word={group.word}
                level={props.level}
                catalog={props.catalog}
                locale={props.locale}
              />
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

/** Breadcrumb: every part but the last can be clicked. */
function Crumbs(props: Readonly<{ resolved: ResolvedSelection; onSelect: PanelProps["onSelect"]; catalog: MessageCatalog }>) {
  const { resolved, onSelect, catalog } = props;
  const parts: { id: V4Selection; title: Title }[] = [
    { id: "root", title: { text: t(catalog, "v4.panel.crumbRoot"), ai: false, more: 0 } }
  ];
  if (resolved.kind === "path") parts.push({ id: `path:${resolved.path.id}`, title: pathTitle(resolved.path, catalog, 40) });
  if (resolved.kind === "open") {
    if (resolved.path !== null) parts.push({ id: `path:${resolved.path.id}`, title: pathTitle(resolved.path, catalog, 40) });
    parts.push({ id: `open:${resolved.question.id}`, title: { text: shortText(resolved.question.text, 40), ai: true, more: 0 } });
  }
  if (resolved.kind === "dig") {
    if (resolved.home.path !== null) {
      parts.push({ id: `path:${resolved.home.path.id}`, title: pathTitle(resolved.home.path, catalog, 40) });
    }
    parts.push({ id: `dig:${resolved.dig.link.childRunId}`, title: digTitle(resolved.dig, catalog, 40) });
  }
  return (
    <nav className="v4PanelCrumbs" aria-label={t(catalog, "v4.panel.crumbsLabel")}>
      <ol>
        {parts.map((part, index) => {
          const last = index === parts.length - 1;
          return (
            <li key={part.id}>
              {last
                ? <span aria-current="location"><TitleText title={part.title} catalog={catalog} /></span>
                : (
                  <button
                    type="button"
                    className="v4Link"
                    onClick={(event) => onSelect(part.id, viaKeyboard(event))}
                  >
                    <TitleText title={part.title} catalog={catalog} />
                  </button>
                )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Section(props: Readonly<{ title: string; children: ReactNode; className?: string }>) {
  return (
    <section className={`v4PanelSection${props.className === undefined ? "" : ` ${props.className}`}`}>
      <h3 className="v4PanelH3">{props.title}</h3>
      {props.children}
    </section>
  );
}

function DigLinkRow(props: Readonly<{ dig: DigView; onSelect: PanelProps["onSelect"]; catalog: MessageCatalog }>) {
  const { dig } = props;
  const working = digWorking(dig) && dig.pausedUntil === undefined;
  return (
    <li>
      <button
        type="button"
        className="v4PanelRowBtn"
        onClick={(event) => props.onSelect(`dig:${dig.link.childRunId}`, viaKeyboard(event))}
      >
        <TitleText className="v4PanelRowTitle" title={digTitle(dig, props.catalog)} catalog={props.catalog} />
        <span className="v4MapNote">
          {working ? <span className="v4MapPulse" aria-hidden="true" /> : null}
          {digNote(dig, props.catalog)}
        </span>
      </button>
    </li>
  );
}

/** "Where to dig from here": the open questions under this selection (pick box + a button that opens it), then digs. */
function WhereToDig(props: Readonly<{
  open: readonly V4OpenQuestion[];
  digs: readonly DigView[];
  emptyKey: "v4.panel.noOpenRoot" | "v4.panel.noOpenPath";
  panel: PanelProps;
}>) {
  const { panel } = props;
  return (
    <Section title={t(panel.catalog, "v4.panel.whereToDig")}>
      {props.open.length === 0
        ? <p className="v4Muted">{t(panel.catalog, props.emptyKey)}</p>
        : (
          <ul className="v4PanelRows">
            {props.open.map((question) => {
              const picked = panel.picked.has(question.id);
              return (
                <li key={`${question.pathId ?? "root"}/${question.id}`} className="v4PanelOpenRow">
                  <PickBox
                    question={question}
                    picked={picked}
                    onTogglePick={panel.onTogglePick}
                    catalog={panel.catalog}
                    className="v4PanelPick"
                    {...(panel.choice === undefined ? {} : { choice: panel.choice })}
                  />
                  <button
                    type="button"
                    className="v4PanelRowBtn"
                    onClick={(event) => panel.onSelect(`open:${question.id}`, viaKeyboard(event))}
                  >
                    <span className="v4PanelRowTitle">
                      {question.star ? <span className="v4MapStar" aria-hidden="true">★ </span> : null}
                      <span data-ai-generated="true">{shortText(question.text, 120)}</span>
                    </span>
                    <span className="v4MapNote">
                      {question.star ? `${t(panel.catalog, "v4.map.starHint")} · ` : null}
                      {openNote(question, picked, panel.catalog)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      {props.digs.length > 0
        ? (
          <>
            <h4 className="v4PanelSmallHead">{t(panel.catalog, "v4.panel.digsHere")}</h4>
            <ul className="v4PanelRows">
              {props.digs.map((dig) => (
                <DigLinkRow key={dig.link.childRunId} dig={dig} onSelect={panel.onSelect} catalog={panel.catalog} />
              ))}
            </ul>
          </>
        )
        : null}
    </Section>
  );
}

/** W3-4: at the deepest level the dig button is replaced by this line (label 5.5). */
function DeepestLine(props: Readonly<{ catalog: MessageCatalog }>) {
  return <p className="v4PanelHint v4PanelDeepest" role="note">{t(props.catalog, "v4.nest.deepest")}</p>;
}

/**
 * Quick look / Thorough, then "Dig deeper here" (row D decisions 1 and 5). W3-4: "Dig here too" where a dig already
 * exists (and on every path of a dig's own map); the person's picks name how many they are; the money lines before the
 * dig; at the deepest level the "deepest level" line instead of all of it.
 */
function DigBlock(props: Readonly<{ target: DigTarget; panel: PanelProps; again?: boolean }>) {
  const { panel } = props;
  if (panel.choice !== undefined && !panel.choice.canDig) return <DeepestLine catalog={panel.catalog} />;
  // Several picks: "Dig into {count} together" (today's tray words); one, or a whole path: as before, or "Dig here too".
  const label = props.target.kind === "picks" && props.target.picks.length >= 2
    ? tPlural(panel.catalog, "v4.dig.trayDig", props.target.picks.length, panel.locale)
    : t(panel.catalog, props.again === true ? "v4.nest.digHereToo" : "v4.panel.dig");
  return (
    <section className="v4PanelDig">
      {panel.showDigModes === false ? null : (
        <>
          <div className="v4PanelModes" role="group" aria-label={t(panel.catalog, "v4.panel.modeLabel")}>
            {DIG_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                className="v4Chip"
                aria-pressed={panel.digMode === mode}
                onClick={() => panel.onDigMode(mode)}
              >
                {t(panel.catalog, `v4.digMode.${mode}`)}
              </button>
            ))}
          </div>
          <p className="v4PanelHint v4Muted">{t(panel.catalog, `v4.panel.modeHint.${panel.digMode}`)}</p>
        </>
      )}
      <button
        type="button"
        className="v4Btn v4BtnPrimary v4PanelDigBtn"
        disabled={panel.digBusy}
        onClick={() => panel.onDig(props.target)}
      >
        {label}
      </button>
      {panel.digBusy ? <p className="v4PanelHint v4Muted">{t(panel.catalog, "v4.panel.digBusy")}</p> : null}
      <V4MoneyLines lines={panel.money ?? []} catalog={panel.catalog} />
      {panel.roomNotice ?? null}
    </section>
  );
}

function TrustSection(props: Readonly<{
  counts: TrustCounts;
  points: readonly V4Point[];
  unchecked: number;
  panel: PanelProps;
}>) {
  const { panel } = props;
  return (
    <>
      <div className="v4PanelBar">
        <V4TrustBar counts={props.counts} catalog={panel.catalog} size="large" showCounts />
      </div>
      <PointGroups points={props.points} level={panel.readingLevel} catalog={panel.catalog} locale={panel.locale} />
      {props.unchecked > 0
        ? <p className="v4PanelUnchecked v4Muted">{tPlural(panel.catalog, "v4.panel.unchecked", props.unchecked, panel.locale)}</p>
        : null}
    </>
  );
}

function RootBody(props: Readonly<{ panel: PanelProps }>) {
  const { panel } = props;
  const { map, catalog } = panel;
  const headline = map.headline?.trim() ?? "";
  const summary = map.summary?.trim() ?? "";
  const confidence = map.confidence?.trim() ?? "";
  const star = openQuestionsOf(map).find((question) => question.star && question.pathId !== null);
  const open = undugOpen(star === undefined ? map.open : [...map.open, star], panel.digs);
  // DATA-2: with no short answer yet, the whole composed answer is shown, so there is always an answer to read.
  const fallback = (map.fallbackText ?? "").split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter((paragraph) => paragraph.length > 0);
  const writing = map.storyState === "WRITING";
  // W4-6 (Q-D13): a dig has no short answer by design: its answer text is the answer, with nothing said to be missing.
  const noStory = map.storyState === "NONE";
  return (
    <>
      {addedLines(map.question).length > 0
        ? (
          <details className="v4PanelSent">
            <summary>{t(catalog, "v4.panel.sentHeading")}</summary>
            <p className="v4PanelSentText" data-ai-generated="true">{map.question.trim()}</p>
          </details>
        )
        : null}
      {map.dig !== null && map.dig !== undefined ? (
        <V4DigPageIntro
          map={map}
          pathLine={panel.digPathLine ?? null}
          linkLevel={panel.linkLevel === undefined ? panel.readingLevel : panel.linkLevel}
          catalog={catalog}
        />
      ) : null}
      <Section title={t(catalog, "v4.panel.answerRoot")}>
        {headline.length > 0 || summary.length > 0
          ? (
            <>
              <div data-ai-generated="true">
                {headline.length > 0 ? <p className="v4PanelHeadline v4Serif">{headline}</p> : null}
                {summary.length > 0 ? <p className="v4PanelText">{summary}</p> : null}
              </div>
              {map.reservation ? <p className="v4PanelHint v4Muted">{t(catalog, "v4.story.reservation")}</p> : null}
            </>
          )
          : fallback.length > 0
            ? (
              <>
                <div className="v4PanelFallback" data-ai-generated="true">
                  {fallback.map((paragraph, index) => <p key={index} className="v4PanelText">{paragraph}</p>)}
                </div>
                {noStory ? null : (
                  <p className="v4PanelHint v4Muted">{t(catalog, writing ? "v4.panel.fallbackWriting" : "v4.panel.fallbackMissing")}</p>
                )}
              </>
            )
            : noStory ? null : <p className="v4Muted">{t(catalog, writing ? "v4.panel.storyWriting" : "v4.panel.storyMissing")}</p>}
      </Section>
      <V4WebNoteLine note={map.webNote} catalog={catalog} />
      <TrustSection counts={map.counts} points={map.points} unchecked={map.unchecked} panel={panel} />
      {panel.readingLevel === "expert" && map.why.length > 0
        ? (
          <Section title={t(catalog, "v4.panel.why")}>
            <ul className="v4PanelWhy" data-ai-generated="true">
              {map.why.map((reason, index) => <li key={index}>{reason}</li>)}
            </ul>
          </Section>
        )
        : null}
      {panel.readingLevel === "expert" && confidence.length > 0
        ? (
          <p className="v4PanelText">
            {startsWithLabel(confidence, t(catalog, "v4.panel.confidence"))
              ? null
              : <><b>{t(catalog, "v4.panel.confidence")}</b>{" "}</>}
            <span data-ai-generated="true">{confidence}</span>
          </p>
        )
        : null}
      <WhereToDig open={open} digs={digsUnder(map, panel.digs, null)} emptyKey="v4.panel.noOpenRoot" panel={panel} />
    </>
  );
}

function PathBody(props: Readonly<{ panel: PanelProps; resolved: Extract<ResolvedSelection, { kind: "path" }> }>) {
  const { panel } = props;
  const { path } = props.resolved;
  const line = path.line.replace(/\s+/g, " ").trim();
  // The heading shows the short title; the full line is repeated here only when the title had to be cut.
  const cut = line.length > 0 && shortText(line) !== line;
  const addResearched = panel.onAddResearched;
  return (
    <>
      <Section title={t(panel.catalog, "v4.panel.answerHere")}>
        {path.fate !== null
          ? <p className="v4PanelText"><span className={`v4MapFate v4MapFate${path.fate}`}>{t(panel.catalog, `v4.fate.${path.fate}`)}</span></p>
          : null}
        {cut ? <p className="v4PanelText" data-ai-generated="true">{line}</p> : null}
        {!cut && path.fate === null ? <p className="v4Muted">{t(panel.catalog, "v4.panel.pathNoMore")}</p> : null}
      </Section>
      <V4PathRewrite
        path={path}
        digs={panel.digs}
        linkLevel={panel.linkLevel === undefined ? panel.readingLevel : panel.linkLevel}
        catalog={panel.catalog}
        locale={panel.locale}
      />
      {path.web !== undefined
        ? <V4SearchNote search={path.web.search} catalog={panel.catalog} />
        : <V4WebNoteLine note={panel.map.webNote} catalog={panel.catalog} />}
      <TrustSection counts={path.counts} points={path.points} unchecked={path.unchecked} panel={panel} />
      {path.web !== undefined && path.web.otherPages.length > 0
        ? (
          <Section title={t(panel.catalog, "v4.web.otherPages")}>
            <V4OtherPages
              pages={path.web.otherPages}
              catalog={panel.catalog}
              locale={panel.locale}
              actions
              heading={false}
              {...(addResearched === undefined ? {} : { onAddResearched: (pageRef: string) => addResearched(path.id, pageRef) })}
            />
          </Section>
        )
        : null}
      <WhereToDig
        open={undugOpen(path.open, panel.digs)}
        digs={digsUnder(panel.map, panel.digs, path.id)}
        emptyKey="v4.panel.noOpenPath"
        panel={panel}
      />
      {panel.choice !== undefined ? <V4DigCompose path={path} choice={panel.choice} catalog={panel.catalog} locale={panel.locale} /> : null}
      <DigBlock target={pathTarget(path, panel)} panel={panel} again={panel.choice?.digHereToo(path.id) === true} />
    </>
  );
}

/** W3-4: a path's dig button digs the person's picks on this path when there are some, else the whole path (as before). */
function pathTarget(path: V4Map["paths"][number], panel: PanelProps): DigTarget {
  const draft = panel.choice?.draft;
  if (draft !== undefined && draft.group === path.id && draft.picks.length > 0) {
    return draftTarget(draft, panel.map.paths) ?? { kind: "path", path };
  }
  return { kind: "path", path };
}

function OpenBody(props: Readonly<{ panel: PanelProps; resolved: Extract<ResolvedSelection, { kind: "open" }> }>) {
  const { panel } = props;
  const { question } = props.resolved;
  const dig = digFor(question, panel.digs);
  // A still-argued point is its own open question: show that point and what the second AI said about it.
  const point = question.kind === "STILL_ARGUED"
    ? panel.map.points.find((candidate) => `p:${candidate.id}` === question.id) ?? null
    : null;
  const points = point === null ? [] : [point];
  const { counts, unchecked } = countTrust(points);
  return (
    <>
      <Section title={t(panel.catalog, "v4.panel.answerHere")}>
        <p className="v4PanelText"><b>{t(panel.catalog, dig === null ? "v4.panel.notYet" : "v4.panel.dugAlready")}</b></p>
        <p className="v4PanelText">{t(panel.catalog, `v4.panel.whyOpen.${question.kind}`)}</p>
        {question.star ? <p className="v4PanelText">{t(panel.catalog, "v4.panel.star")}</p> : null}
      </Section>
      {point !== null ? <TrustSection counts={counts} points={points} unchecked={unchecked} panel={panel} /> : null}
      {dig === null
        ? (
          <>
            <p className="v4PanelHint v4Muted">{t(panel.catalog, "v4.panel.digDoes")}</p>
            <DigBlock target={{ kind: "open", questions: [question] }} panel={panel} />
          </>
        )
        : (
          <>
            <button
              type="button"
              className="v4Btn"
              onClick={(event) => panel.onSelect(`dig:${dig.link.childRunId}`, viaKeyboard(event))}
            >
              {t(panel.catalog, "v4.panel.seeDig")}
            </button>
            {/* W3-4: an open question that already has a dig offers "Dig here too" (the deepest level: its line). */}
            {panel.choice !== undefined ? <DigBlock target={{ kind: "open", questions: [question] }} panel={panel} again /> : null}
          </>
        )}
    </>
  );
}

/**
 * W3-4: "Dig here too" under a dig: a dig of a path opens that path, where the person chooses what to dig again; a dig of
 * open questions digs the ones still on the map. Nothing at the deepest level but its line; nothing for a dig that failed.
 */
function DigAgain(props: Readonly<{ panel: PanelProps; resolved: Extract<ResolvedSelection, { kind: "dig" }> }>) {
  const { panel } = props;
  const { dig, home } = props.resolved;
  if (panel.choice === undefined || dig.state === "FAILED") return null;
  if (!panel.choice.canDig) return <DeepestLine catalog={panel.catalog} />;
  const pathPlace = dig.link.openQuestionIds.find((id) => id.startsWith("path:"));
  if (pathPlace !== undefined && home.path !== null) {
    const pathId = home.path.id;
    return (
      <button type="button" className="v4Btn" onClick={(event) => panel.onSelect(`path:${pathId}`, viaKeyboard(event))}>
        {t(panel.catalog, "v4.nest.digHereToo")}
      </button>
    );
  }
  const questions = dig.link.openQuestionIds.flatMap((id) => {
    const question = findOpenQuestion(panel.map, id);
    return question === null ? [] : [question];
  });
  return questions.length === 0 ? null : <DigBlock target={{ kind: "open", questions }} panel={panel} again />;
}

function DigBody(props: Readonly<{ panel: PanelProps; resolved: Extract<ResolvedSelection, { kind: "dig" }> }>) {
  const { panel } = props;
  const { dig } = props.resolved;
  const headline = dig.headline?.trim() ?? "";
  const more = dig.link.questions.slice(1).filter((question) => question.trim().length > 0);
  // W4-6: a dig of the new model writes no story; it says what became of its rewrite of the path it came from.
  const rewrite = dig.rewrite;
  const finished = rewrite !== undefined && rewrite !== null && (rewrite.state === "READY" || rewrite.state === "READY_WITH_RESERVATION")
    ? rewrite
    : null;
  const paused = dig.pausedUntil;
  return (
    <>
      {more.length > 0
        ? (
          <Section title={t(panel.catalog, "v4.panel.digAlso")}>
            <ul className="v4PanelWhy" data-ai-generated="true">
              {more.map((question, index) => <li key={index}>{question}</li>)}
            </ul>
          </Section>
        )
        : null}
      <Section title={t(panel.catalog, "v4.panel.answerHere")}>
        <p className="v4PanelText">
          {digWorking(dig) && paused === undefined ? <span className="v4MapPulse" aria-hidden="true" /> : null}
          {paused !== undefined
            ? t(panel.catalog, "v4.money.paused", { date: formatDate(panel.locale, paused, { dateStyle: "medium" }) })
            : rewrite !== undefined && dig.state === "DONE"
              ? digNote(dig, panel.catalog)
              : t(panel.catalog, `v4.panel.digState.${dig.state}`)}
          {dig.link.mode !== null
            ? <> <span className="v4PanelModeTag">{t(panel.catalog, `v4.digMode.${dig.link.mode}`)}</span></>
            : null}
        </p>
        {dig.state === "DONE" && rewrite === undefined
          ? (headline.length > 0
            ? <p className="v4PanelHeadline v4Serif" data-ai-generated="true">{headline}</p>
            : <p className="v4Muted">{t(panel.catalog, "v4.panel.digNoHeadline")}</p>)
          : null}
      </Section>
      {dig.state === "DONE" && finished !== null ? <V4WhatChanged sentences={finished.what_changed} catalog={panel.catalog} /> : null}
      {dig.state === "DONE" && dig.counts !== null
        ? (
          <div className="v4PanelBar">
            <V4TrustBar counts={dig.counts} catalog={panel.catalog} size="large" showCounts />
          </div>
        )
        : null}
      {dig.state === "DONE"
        ? (
          <Link
            className="v4Btn"
            href={levelHref(
              `/v4/debate/${encodeURIComponent(dig.link.childRunId)}`,
              panel.linkLevel === undefined ? panel.readingLevel : panel.linkLevel
            )}
          >
            {t(panel.catalog, "v4.panel.openDig")}
          </Link>
        )
        : null}
      <DigAgain panel={panel} resolved={props.resolved} />
    </>
  );
}

/** The panel heading; the site's own fallback words are not marked as AI text (RULES-14). */
function headingOf(resolved: ResolvedSelection, map: V4Map, catalog: MessageCatalog): Title {
  if (resolved.kind === "path") return pathTitle(resolved.path, catalog);
  if (resolved.kind === "open") return { text: resolved.question.text, ai: true, more: 0 };
  if (resolved.kind === "dig") {
    const first = resolved.dig.link.questions[0];
    return first !== undefined && first.trim().length > 0
      ? { text: first, ai: true, more: 0 }
      : { text: t(catalog, "v4.map.digUntitled"), ai: false, more: 0 };
  }
  // The person's own words; the lines added from their choices sit in "What we asked the AIs".
  return { text: ownWords(map.question), ai: true, more: 0 };
}

export function V4Panel(props: PanelProps) {
  const { map, catalog } = props;
  const resolved = resolveSelection(map, props.digs, props.selected);
  const heading = headingOf(resolved, map, catalog);
  return (
    <div className={`v4Panel v4Panel-${resolved.kind}`}>
      <Crumbs resolved={resolved} onSelect={props.onSelect} catalog={catalog} />
      <span className="v4Eyebrow">{t(catalog, `v4.panel.kind.${resolved.kind}`)}</span>
      <h2 className="v4PanelH2" ref={props.headingRef} tabIndex={-1} data-ai-generated={heading.ai ? "true" : undefined}>
        {heading.text}
      </h2>
      {resolved.kind === "root" ? <RootBody panel={props} /> : null}
      {resolved.kind === "path" ? <PathBody panel={props} resolved={resolved} /> : null}
      {resolved.kind === "open" ? <OpenBody panel={props} resolved={resolved} /> : null}
      {resolved.kind === "dig" ? <DigBody panel={props} resolved={resolved} /> : null}
    </div>
  );
}
