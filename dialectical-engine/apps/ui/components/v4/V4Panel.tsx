"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { formatDate, t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import { addedLines, ownWords } from "@/lib/v4/askText";
import type { DigProgress } from "@/lib/v4/digProgress";
import { findOpenQuestion, isFinishedRewrite } from "@/lib/v4/mapModel";
import { digWords, type V4DigQuota } from "@/lib/v4/digQuota";
import { rootPicksTarget } from "@/lib/v4/digDock";
import { placeOf } from "@/components/v4/mapDigHelpers";
import type { MoneyLine } from "@/lib/v4/money";
import { pauseOfDig } from "@/lib/v4/monthPause";
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
  type V4Path,
  type V4Point,
  type V4Selection
} from "@/lib/v4/types";
import { cardLabel, groundClass } from "@/lib/v4/mapLooks";
import {
  digFor,
  DigPauseDot,
  digNote,
  digsUnder,
  digTitle,
  digWorking,
  OpenWord,
  openNote,
  pathTitle,
  PickBox,
  resolveSelection,
  rootPanelOpen,
  shortText,
  TitleText,
  undugOpen,
  viaKeyboard,
  type ResolvedSelection,
  type Title
} from "./V4MapTree";
import { V4FullAnswerFold } from "./V4AnswerCard";
import { V4DigFailed, type V4FailedDigs } from "./V4DigFailed";
import { pickReasonPlaces, V4DigCompose, V4MoneyLines, V4PickReason, type V4DigChoice } from "./V4DigSuggest";
import { V4MonthPause } from "./V4MonthPause";
import { V4ShareChange } from "./V4ShareChange";
import { digResultOf, V4DigPageIntro, V4DigResult, V4PathRewrite, V4WhatChanged } from "./V4PathRewrite";
import { V4DigRunning } from "./V4DigRunning";
import { V4OtherPages, V4SearchNote, V4SourcesFold, V4WebNoteLine, type V4ResearchedPress } from "./V4Sources";
import { V4TrustBar } from "./V4TrustBar";

/*
 * V4 initial (2026-10-28): what one question on the map knows (D3 panel), always in the same order: where you are,
 * the question, the answer here so far, the bar, the points in the four trust words, then where to dig and the dig
 * button. Points no second AI checked are only counted (decision 6). The reading level decides how much each point
 * says. Nothing here fetches or stores anything.
 * Perplexity plan W2-6 (2026-10-30): each point shows its sources at every reading level (V4Sources.tsx); the question
 * shows the debate's web note (Free, a failed search, switched off) and a path its own search note, above the points;
 * a path then lists the other pages its search found, each with "Add to researched" (W4-4) where it is offered.
 * Dig model revision W4-6: a path a dig rewrote shows its rewrite under its new text (V4PathRewrite.tsx); a dig's own page
 * says what it looked into and the path it rewrote in place of a short answer (a dig writes no story, owner Q-D13), then its
 * answer text and its points as usual; a dig's panel says what became of its rewrite, or that it is paused at the month wall.
 * Screen review fixes (owner picks, 3 Nov): the first group with points opens (map-f1); a long suggestion list gets "Skip
 * to the dig button" (dig-f24); "Nothing is open here" goes when suggestions follow (dig-f33); a dig's way back to its path
 * names the path and waits until the dig is done (dig-f13); a waiting dig says so only after 10 seconds (dig-f28).
 * Owner review 3 Nov (wait-f2, public-f16, wait-f18, dig-f12): a paused dig's panel shows the one pause block (with
 * Continue once the server says its month has reset), and a dig that did not finish its reason and "Try this dig again".
 * Wave 2 (map-d4 A, map-f14, dig-f22): evidence first, each finding's sources folded into one line and "Other pages found"
 * folded; "Skip to the dig button" near the top; the dig block pinned to the panel's foot on a computer; one pick reads
 * "Dig into your pick", and "Your question" digs the picks it lists; a greyed pick box has its reason right above it.
 * Owner review 3 Nov (dig-d1 B, dig-f32): a dig at work shows its own running panel (V4DigRunning: the waiting card, the
 * steps and checked findings when the server reports them, the path's text now); a finished dig opens with the same result
 * box as the path it rewrote, its bar in words only, "Open this dig's map" below.
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
  /**
   * V4 screen review (3 Nov 2026), report-d2: while the report waits for digs or is written, every dig button here rests
   * with this quiet reason ("Digging opens again when your report is written."). Absent or null: as before.
   */
  digRest?: string | null;
  /**
   * dig-d3 / dig-f8: the line for a dig of this place still in its 10 seconds ("Your dig starts in a few seconds. You can
   * still undo it. [Undo]"), or null when none waits there. While it shows, this place's dig button does nothing more.
   * Absent: as before.
   */
  digStarting?: (target: DigTarget) => ReactNode | null;
  /** dig-d3 B (phone): a path's starting line sits under the path's text, at the top of its screen, not by the button. */
  digStartingAtTop?: boolean;
  roomNotice?: ReactNode;
  /** W4-4: "Add to researched" on one of a path's other pages; absent where it is not offered (Free, new starts waiting for a reset). */
  onAddResearched?: (pathId: string, pageRef: string) => void;
  /** W4-4: what the page knows of a press before the answer says so, by page. */
  researchedPresses?: ReadonlyMap<string, V4ResearchedPress>;
  /** W3-4: choosing what to dig (suggestions, edits, own view, the one-path rule, "Dig here too", the deepest level). */
  choice?: V4DigChoice;
  /** W3-4: the money lines before a dig (its share of today; new starts waiting for the reset). Never a price. */
  money?: readonly MoneyLine[];
  /**
   * Owner's screen review (3 Nov): the dig buttons' quota words (lib/v4/digQuota.ts): each button's own share or, while
   * new digs wait for a reset, its reset time and the line saying why; the period by the switch. Absent: the words alone.
   */
  digQuota?: V4DigQuota;
  /** W4-6: on a dig's own map, the line of the path it dug, on the map above (null: not known yet, or no path). */
  digPathLine?: string | null;
  /**
   * R22 W5-1 (owner Q-D11): the answer of the investigation's current report version, shown in place of the first
   * debate's answer, which stays one click away. Absent or null: no finished report yet.
   */
  reportAnswer?: Readonly<{ version: number; segments: readonly string[] }> | null;
  /**
   * Owner review 3 Nov (wait-f18, dig-f12): what a dig that did not finish says and offers (its reason, "Try this dig
   * again", "This keeps failing…"). Absent: its panel says only that it did not finish, as before.
   */
  failedDigs?: V4FailedDigs;
  /**
   * map-d1 (3 Nov): the answer stands in its own card above the map (V4AnswerCard), so the panel of "Your question" shows
   * the evidence, not a second copy of the answer. Absent or false: the panel shows the answer as before.
   */
  answerOnTop?: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
  /**
   * V4 screen review (3 Nov 2026): what sits right under the where-you-are line — map-f19's "Since you last looked:
   * Confirmed" and, on a computer, dig-f18's pinned "Next change › · Done" during the changes tour. Absent: nothing.
   */
  underCrumbs?: ReactNode;
  /**
   * dig-d1 B (3 Nov): what the server reported of the OPEN dig's steps and checked findings while it works (the page reads it
   * for the dig whose panel is open, lib/v4/useDigProgress.ts). Absent or null: the running dig shows the one calm line.
   */
  openDigProgress?: DigProgress | null;
  /** When the open dig was last checked (the waiting card's reduced-motion "Still working · checked 14:09"). Absent: none. */
  openDigCheckedAt?: number | null;
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
        {/* map-d4 A: the sources folded into one line under the point; open, each page in full. */}
        <V4SourcesFold sources={point.sources} catalog={catalog} locale={props.locale} />
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

/**
 * The points in the four trust words, as folded groups; only groups with points. map-f1: the first group that has points
 * is open at first, in the words' order (Sure, then Sure for the case named, then Still argued), so a debate with no
 * "Sure" (every Free one, older ones) never opens on folded headings only; "Didn't hold" always starts folded.
 * Exported for the public page (public-d1 A, owner review 3 Nov), which reads a path's findings the same way.
 */
export function PointGroups(props: Readonly<{ points: readonly V4Point[]; level: ReadingLevel; catalog: MessageCatalog; locale: string }>) {
  const groups = TRUST_WORDS.map((word) => ({ word, points: props.points.filter((point) => point.trust === word) }))
    .filter((group) => group.points.length > 0);
  if (groups.length === 0) return null;
  const opened = groups.find((group) => group.word !== "DIDNT_HOLD")?.word ?? null;
  return (
    <div className="v4PanelGroups">
      {/* map-d4 A (the drawn option): the findings come first under one heading, "What we found". */}
      <h3 className="v4PanelH3">{t(props.catalog, "v4.panel.found")}</h3>
      {groups.map((group) => (
        <details key={group.word} className={`v4PanelGroup v4PanelGroup${group.word}`} open={group.word === opened}>
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
function Crumbs(props: Readonly<{ resolved: ResolvedSelection; map: V4Map; onSelect: PanelProps["onSelect"]; catalog: MessageCatalog }>) {
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
    parts.push({ id: `dig:${resolved.dig.link.childRunId}`, title: digTitle(resolved.dig, catalog, 40, props.map) });
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

function DigLinkRow(props: Readonly<{ dig: DigView; map: V4Map; onSelect: PanelProps["onSelect"]; catalog: MessageCatalog; locale: string }>) {
  const { dig } = props;
  const working = digWorking(dig) && dig.pausedUntil === undefined;
  return (
    <li>
      <button
        type="button"
        className="v4PanelRowBtn"
        onClick={(event) => props.onSelect(`dig:${dig.link.childRunId}`, viaKeyboard(event))}
      >
        <TitleText className="v4PanelRowTitle" title={digTitle(dig, props.catalog, 70, props.map)} catalog={props.catalog} />
        <span className="v4MapNote">
          {working ? <span className="v4MapPulse" aria-hidden="true" /> : null}
          <DigPauseDot dig={dig} />
          {digNote(dig, props.catalog, props.locale)}
        </span>
      </button>
    </li>
  );
}

/**
 * "Where to dig from here": the open questions under this selection (pick box + a button that opens it), then digs.
 * dig-f33: `emptyKey` null says nothing when nothing is open (the path's own suggestions follow, under "Choose what to
 * dig"); with no digs either, the section is left out rather than shown as a bare heading.
 */
function WhereToDig(props: Readonly<{
  open: readonly V4OpenQuestion[];
  digs: readonly DigView[];
  emptyKey: "v4.panel.noOpenRoot" | "v4.panel.noOpenPath" | null;
  panel: PanelProps;
}>) {
  const { panel, emptyKey } = props;
  if (props.open.length === 0 && props.digs.length === 0 && emptyKey === null) return null;
  // dig-f22: the visible reason sits right above the first box greyed for it (each question is its own group here, since
  // the main question's list can hold the starred question of a path beside its own).
  const reasons = pickReasonPlaces(
    props.open.map((question) => ({ key: question.id, path: null, open: [question], suggestions: false })), panel.picked, panel.choice
  );
  return (
    <Section title={t(panel.catalog, "v4.panel.whereToDig")}>
      {props.open.length === 0
        ? (emptyKey === null ? null : <p className="v4Muted">{t(panel.catalog, emptyKey)}</p>)
        : (
          <ul className="v4PanelRows">
            {props.open.flatMap((question) => {
              const picked = panel.picked.has(question.id);
              const reason = reasons.get(question.id);
              return [
                reason === undefined || panel.choice === undefined ? null : (
                  <li key={`reason/${question.id}`} className="v4PanelReasonRow">
                    <V4PickReason reason={reason.reason} choice={panel.choice} paths={panel.map.paths} catalog={panel.catalog} />
                  </li>
                ),
                <li key={`${question.pathId ?? "root"}/${question.id}`} className={`v4PanelOpenRow ${groundClass("OPEN")}`}>
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
                      <OpenWord catalog={panel.catalog} />
                      {question.star ? <span className="v4MapStarWords">{t(panel.catalog, "v4.map.starHint")}</span> : null}
                      <span>{openNote(question, picked, panel.catalog)}</span>
                    </span>
                  </button>
                </li>
              ];
            })}
          </ul>
        )}
      {props.digs.length > 0
        ? (
          <>
            <h4 className="v4PanelSmallHead">{t(panel.catalog, "v4.panel.digsHere")}</h4>
            <ul className="v4PanelRows">
              {props.digs.map((dig) => (
                <DigLinkRow key={dig.link.childRunId} dig={dig} map={panel.map} onSelect={panel.onSelect} catalog={panel.catalog} locale={panel.locale} />
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
 * dig-f24 / map-d4 A: "Skip to the dig button" near the top of a panel that has one, above the findings and any long
 * suggestion list, so a keyboard user reaches the pinned button in about two presses instead of Tabbing through every
 * source line, pick box and wording link. It moves focus only (never the address): to the dig button, or to its block
 * when the button cannot take focus (busy, or hidden on the phone, where the pinned bar carries it; map-f18). Seen only
 * while it has focus.
 */
function SkipToDig(props: Readonly<{ targetId: string; catalog: MessageCatalog }>) {
  const jump = (): void => {
    const block = document.getElementById(props.targetId);
    if (block === null) return;
    const button = block.querySelector<HTMLButtonElement>(".v4PanelDigBtn");
    const usable = button !== null && !button.disabled && window.getComputedStyle(button).display !== "none";
    (usable ? button : block).focus();
  };
  return (
    <button type="button" className="v4Link v4PanelSkip" onClick={jump}>
      {t(props.catalog, "v4.panel.skipToDig")}
    </button>
  );
}

/**
 * Quick look / Thorough, then the dig button (row D decisions 1 and 5). W3-4: the person's picks (journey-f23: no count);
 * the money lines before the dig; at the deepest level the "deepest level" line instead of all of it. map-d4 A: on a
 * computer the block is pinned to the panel's foot (v4-debate.css), so the evidence comes first and the button is never
 * out of view.
 * Owner's screen review (3 Nov), with `digQuota` (lib/v4/digQuota.ts): one dig button, "Dig here · up to 3%" or "Dig into
 * your picks · up to 6%", its share from its own check (journey-f13, dig-f5; `again` no longer changes the words: "Dig
 * here too" is gone); the period named once, by the switch (public-d3 A); one hint under each choice (read-f20); a changed
 * share in grey for 2 seconds (journey-f8). While new digs wait for a reset the button stays, greyed, with the reset time
 * on it, the line beside it says why and from when, and an open question offers "Add to tray" (dig-f11, journey-f14).
 * journey-f14 (the wave-2 review, 4 Nov): one pattern for every reason a dig cannot start now, the reset wait and the
 * report's rest alike: the button stays focusable (aria-disabled), points at the visible line that says why, and a press
 * gives that line the highlight again; "Add to tray" keeps the choice in both cases.
 */
function DigBlock(props: Readonly<{ target: DigTarget; panel: PanelProps; again?: boolean; id?: string; startingAbove?: boolean }>) {
  const { panel } = props;
  const waitId = useId();
  const restId = useId();
  const [replay, setReplay] = useState(0);
  const button = useRef<HTMLButtonElement | null>(null);
  const block = useRef<HTMLElement | null>(null);
  const shown = panel.choice === undefined || panel.choice.canDig;
  usePinRoom(block, shown);
  if (!shown) return <DeepestLine catalog={panel.catalog} />;
  const quota = panel.digQuota;
  const label = quota === undefined ? digWords(props.target, panel.catalog, panel.locale) : quota.label(props.target);
  const waitLine = quota?.waitLine ?? null;
  const waiting = waitLine !== null;
  const resting = panel.digRest !== null && panel.digRest !== undefined;
  // dig-f11: the line beside the greyed button says the same as the reset line, so that one is not said twice here.
  const money = waiting ? (panel.money ?? []).filter((line) => !/^v4\.money\.startsWait\./u.test(line.key)) : panel.money ?? [];
  // journey-f14: an open question that cannot be dug now can still be kept, in the tray (the person's picks).
  const keep = (waiting || resting) && props.target.kind === "open" && props.target.questions.length === 1
    && !panel.picked.has(props.target.questions[0]!.id) ? props.target.questions[0]! : null;
  // dig-f7: a place whose dig waits keeps its button focusable (aria-disabled), so focus can come back to it after Undo.
  const starting = panel.digStarting?.(props.target) ?? null;
  // public-d3 A: the period by the switch, only where this button names a share.
  const period = quota === undefined || quota.share(props.target) === null ? null : quota.periodLine;
  const describedBy = resting ? restId : waiting ? waitId : undefined;
  // journey-f8: the change mark is for this place's share only (another place's button is not a change of this one).
  const subject = placeOf(props.target);
  return (
    // dig-f24: `id` is where "Skip to the dig button" lands (the block itself takes focus only when its button cannot).
    <section ref={block} className="v4PanelDig" {...(props.id === undefined ? {} : { id: props.id, tabIndex: -1 })}>
      {panel.showDigModes === false ? null : (
        <div className="v4PanelModes" role="group" aria-label={t(panel.catalog, "v4.panel.modeLabel")}>
          {DIG_MODES.map((mode) => (
            <div key={mode} className="v4PanelMode">
              <button
                type="button"
                className="v4Chip"
                aria-pressed={panel.digMode === mode}
                onClick={() => panel.onDigMode(mode)}
              >
                {t(panel.catalog, `v4.digMode.${mode}`)}
              </button>
              {/* read-f20: one short hint under each choice, so what Thorough adds is said before it is chosen. */}
              <p className="v4PanelHint v4PanelModeHint v4Muted">{t(panel.catalog, `v4.panel.modeHint.${mode}`)}</p>
            </div>
          ))}
        </div>
      )}
      {period === null ? null : <p className="v4PanelHint v4DigPeriod v4Muted">{period}</p>}
      <div className="v4DigBtnRow">
        <button
          ref={button}
          type="button"
          className={`v4Btn v4BtnPrimary v4PanelDigBtn${waiting || resting ? " v4DigWaiting" : ""}`}
          disabled={panel.digBusy}
          // report-d2 / journey-f14: while the report waits for digs or is written, digging rests, with its reason below.
          aria-disabled={starting !== null || waiting || resting ? "true" : undefined}
          aria-describedby={describedBy}
          onClick={() => {
            // public-d4 A: pressing a greyed button explains why: its line takes the highlight again.
            if (waiting || resting) setReplay((count) => count + 1);
            else if (starting === null) panel.onDig(props.target);
          }}
        >
          {label}
        </button>
        <V4ShareChange share={quota?.share(props.target) ?? null} subject={subject} />
      </div>
      {waiting && !resting ? (
        <p key={replay} id={waitId} className={`v4PanelHint v4DigWaitLine${replay > 0 ? " v4Highlight" : ""}`} role="note">{waitLine}</p>
      ) : null}
      {keep === null ? null : (
        <button type="button" className="v4Btn v4DigAddTray" onClick={() => {
          panel.onTogglePick(keep.id);
          // ACCESS-5: this button goes once the question is in the tray, so focus stays at the dig button in the same place
          // (or the block, where a phone hides that button).
          button.current?.focus();
          if (document.activeElement !== button.current) {
            if (block.current !== null && !block.current.hasAttribute("tabindex")) block.current.setAttribute("tabindex", "-1");
            block.current?.focus();
          }
        }}>
          {t(panel.catalog, "v4.dig.addToTray")}
        </button>
      )}
      {starting !== null
        ? (props.startingAbove === true ? null : starting)
        : resting ? (
          <p key={replay} id={restId} className={`v4PanelHint v4Muted${replay > 0 ? " v4Highlight" : ""}`} data-dig-rest="">{panel.digRest}</p>
        )
          : panel.digBusy ? <p className="v4PanelHint v4Muted">{t(panel.catalog, "v4.panel.digBusy")}</p> : null}
      <V4MoneyLines lines={money} catalog={panel.catalog} />
      {panel.roomNotice ?? null}
    </section>
  );
}

/**
 * ACCESS-2 (the wave-2 review, 4 Nov): the pinned dig block's real height on its panel column (--v4-pin-room), so the
 * column's scroll padding keeps a control the keyboard reaches clear of it (v4-debate.css). Nothing is kept anywhere.
 */
function usePinRoom(block: RefObject<HTMLElement | null>, shown: boolean): void {
  useEffect(() => {
    const element = block.current;
    const column = element?.closest<HTMLElement>(".v4DebPanelCol") ?? null;
    if (!shown || element === null || column === null) return undefined;
    const set = (): void => column.style.setProperty("--v4-pin-room", `${Math.ceil(element.getBoundingClientRect().height)}px`);
    set();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(set) : null;
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      column.style.removeProperty("--v4-pin-room");
    };
  }, [block, shown]);
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
  const open = rootPanelOpen(map, panel.digs);
  // map-f14 / dig-f4: the tray shows only from two picks, so a pick made here is dug by this panel's own pinned button
  // ("Dig into your pick"), offered only when the panel lists every pick.
  const picksTarget = panel.choice?.canDig === true ? rootPicksTarget(open, panel.choice.draft, map.paths) : null;
  const digId = useId();
  // DATA-2: with no short answer yet, the whole composed answer is shown, so there is always an answer to read.
  const fallback = (map.fallbackText ?? "").split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter((paragraph) => paragraph.length > 0);
  const writing = map.storyState === "WRITING";
  // W4-6 (Q-D13): a dig has no short answer by design: its answer text is the answer, with nothing said to be missing.
  const noStory = map.storyState === "NONE";
  // map-f16 + r2-11 (review F10): "You can dig or write your report now." only where a dig can start now: not at the deepest
  // level, and not while new questions and digs wait for the quota's reset. Elsewhere the approved line stops after "You
  // don't need to wait."
  // WHOLE-5 (the wave-2 review): nor while the report waits for digs or is written (report-d2: digging rests).
  const canDigNow = panel.choice?.canDig !== false && !(panel.money ?? []).some((line) => /^v4\.money\.startsWait\./u.test(line.key))
    && (panel.digRest === null || panel.digRest === undefined);
  const missingKey = canDigNow ? (fallback.length > 0 ? "v4.panel.fallbackMissing" : "v4.panel.storyMissing") : "v4.panel.noShortAnswerNoDig";
  const firstAnswer = (
    <>
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
        : fallback.length > 0 && writing
          // V4 screen review (3 Nov 2026), map-f21 / wait-f9: while the short answer is written, one line says so and the
          // long answer waits under "Read the full answer" (below), so nothing swaps under the reader's eyes.
          ? <p className="v4PanelHint v4Muted">{t(catalog, "v4.panel.fallbackWriting")}</p>
          : fallback.length > 0
            ? (
              <>
                <div className="v4PanelFallback" data-ai-generated="true">
                  {fallback.map((paragraph, index) => <p key={index} className="v4PanelText">{paragraph}</p>)}
                </div>
                {noStory ? null : <p className="v4PanelHint v4Muted">{t(catalog, missingKey)}</p>}
              </>
            )
            : noStory ? null : <p className="v4Muted">{t(catalog, writing ? "v4.panel.storyWriting" : missingKey)}</p>}
      <V4FullAnswerFold paragraphs={writing ? fallback : []} catalog={catalog} />
    </>
  );
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
      {/* R22 W5-1 (Q-D11): the current report version's answer first; the first debate's answer one click away.
          map-d1: with the answer card above the map, this panel shows the evidence only. */}
      {panel.answerOnTop === true ? null : panel.reportAnswer !== null && panel.reportAnswer !== undefined ? (
        <Section title={t(catalog, "v4.investigation.fromReport", { n: panel.reportAnswer.version })} className="v4PanelReportAnswer">
          <div data-ai-generated="true">
            {panel.reportAnswer.segments.map((segment, index) => <p key={index} className="v4PanelText">{segment}</p>)}
          </div>
          <details className="v4PanelFirstAnswer">
            <summary>{t(catalog, "v4.investigation.firstAnswer")}</summary>
            <div className="v4PanelFirstAnswerBody">
              {firstAnswer}
            </div>
          </details>
        </Section>
      ) : (
        <Section title={t(catalog, "v4.panel.answerRoot")}>
          {firstAnswer}
        </Section>
      )}
      {picksTarget !== null ? <SkipToDig targetId={digId} catalog={catalog} /> : null}
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
      <WhereToDig open={open} digs={digsUnder(map, panel.digs, null)} emptyKey="v4.panel.noOpenRoot" panel={panel} />
      {picksTarget !== null ? <DigBlock target={picksTarget} panel={panel} id={digId} /> : null}
    </>
  );
}

/**
 * "The answer here so far" for one path. map-f8: each chosen path's own answer so far comes with the start step (its
 * path outcome); until then this slot holds the path's whole line when the heading shows only its short label (map-f25:
 * the line may name the path's outcome in a sentence; the card never does). The "How sure" line is under the bar.
 */
function AnswerSoFar(props: Readonly<{ line: string | null; catalog: MessageCatalog }>) {
  return props.line === null
    ? <p className="v4Muted">{t(props.catalog, "v4.panel.pathNoMore")}</p>
    : <p className="v4PanelText" data-ai-generated="true">{props.line}</p>;
}

/**
 * dig-d4 A: what the dig behind the path's newest finished rewrite looked into, in its own words ("You asked: …"); null
 * when that dig is not on this map, or when only the site's own words could title it (a whole-path dig).
 */
function askedTitle(path: V4Path, panel: PanelProps): ReactNode {
  const latest = (path.rewrites?.history ?? []).filter(isFinishedRewrite).at(-1);
  const dig = latest === undefined ? undefined : panel.digs.find((candidate) => candidate.link.childRunId === latest.dig_run_id);
  if (dig === undefined) return null;
  const title = digTitle(dig, panel.catalog, HEADING_MAX, panel.map);
  const siteWords = [t(panel.catalog, "v4.map.digWholePath"), t(panel.catalog, "v4.map.digUntitled")];
  if (!title.ai && siteWords.includes(title.text)) return null;
  return <TitleText title={title} catalog={panel.catalog} />;
}

function PathBody(props: Readonly<{ panel: PanelProps; resolved: Extract<ResolvedSelection, { kind: "path" }> }>) {
  const { panel } = props;
  const { path } = props.resolved;
  const line = path.line.replace(/\s+/g, " ").trim();
  // The heading shows the path's label in full; the whole line is said here only when it says more than the heading.
  const more = line.length > 0 && cardLabel(line) !== line;
  const addResearched = panel.onAddResearched;
  const digId = useId();
  // The suggestions "Choose what to dig" lists (none at the deepest level, where it is not shown).
  const suggestions = panel.choice?.canDig === true ? path.suggestions ?? [] : [];
  // dig-f33: "Nothing is open here. You can still dig deeper…" only when no suggestion follows it; at the deepest level
  // nothing can be dug, so the plain "nothing is left" line.
  const emptyKey = suggestions.length > 0 ? null : panel.choice?.canDig === false ? "v4.panel.noOpenRoot" : "v4.panel.noOpenPath";
  // map-d4 A (with dig-f24): the way past the findings and the suggestions to the pinned button, wherever there is one.
  const skip = panel.choice === undefined || panel.choice.canDig;
  const startingTop = panel.digStartingAtTop === true ? panel.digStarting?.(pathTarget(path, panel)) ?? null : null;
  return (
    <>
      <Section title={t(panel.catalog, "v4.panel.answerHere")}>
        <AnswerSoFar line={more ? line : null} catalog={panel.catalog} />
        {startingTop}
      </Section>
      <V4PathRewrite
        path={path}
        digs={panel.digs}
        linkLevel={panel.linkLevel === undefined ? panel.readingLevel : panel.linkLevel}
        catalog={panel.catalog}
        locale={panel.locale}
        asked={askedTitle(path, panel)}
      />
      {skip ? <SkipToDig targetId={digId} catalog={panel.catalog} /> : null}
      {path.web !== undefined
        ? <V4SearchNote search={path.web.search} catalog={panel.catalog} />
        : <V4WebNoteLine note={panel.map.webNote} catalog={panel.catalog} />}
      <TrustSection counts={path.counts} points={path.points} unchecked={path.unchecked} panel={panel} />
      {path.web !== undefined && path.web.otherPages.length > 0
        ? (
          // map-d4 A: "Other pages found ▸", folded, after the findings (paid plans only: Free searches nothing).
          <details className="v4PanelOtherPages">
            <summary className="v4PanelOtherPagesHead">{t(panel.catalog, "v4.web.otherPages")}</summary>
            <V4OtherPages
              pages={path.web.otherPages}
              catalog={panel.catalog}
              locale={panel.locale}
              actions
              heading={false}
              {...(addResearched === undefined ? {} : { onAddResearched: (pageRef: string) => addResearched(path.id, pageRef) })}
              {...(panel.researchedPresses === undefined ? {} : { presses: panel.researchedPresses })}
            />
          </details>
        )
        : null}
      <WhereToDig
        open={undugOpen(path.open, panel.digs)}
        digs={digsUnder(panel.map, panel.digs, path.id)}
        emptyKey={emptyKey}
        panel={panel}
      />
      {panel.choice !== undefined ? <V4DigCompose path={path} choice={panel.choice} catalog={panel.catalog} locale={panel.locale} /> : null}
      <DigBlock
        target={pathTarget(path, panel)}
        panel={panel}
        again={panel.choice?.digHereToo(path.id) === true}
        {...(skip ? { id: digId } : {})}
        startingAbove={startingTop !== null}
      />
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

/** Stands in for the path's title while the sentence around it is read from the catalogue (the title is AI text). */
const PATH_MARK = "\u0000path\u0000";

/**
 * W3-4: digging again from a dig's panel: a dig of a path offers a way back to that path, where the person chooses what
 * to dig again; a dig of open questions digs the ones still on the map ("Dig here too"). Nothing at the deepest level but
 * its line; nothing for a dig that failed. dig-f13: the way back says where it goes ("Go to “Mostly renewables” to dig
 * again"), because everywhere else "Dig here too" starts a dig; and nothing is offered while the dig is still at work.
 */
function DigAgain(props: Readonly<{ panel: PanelProps; resolved: Extract<ResolvedSelection, { kind: "dig" }> }>) {
  const { panel } = props;
  const { dig, home } = props.resolved;
  if (panel.choice === undefined || dig.state === "FAILED" || digWorking(dig)) return null;
  if (!panel.choice.canDig) return <DeepestLine catalog={panel.catalog} />;
  const pathPlace = dig.link.openQuestionIds.find((id) => id.startsWith("path:"));
  if (pathPlace !== undefined && home.path !== null) {
    const pathId = home.path.id;
    const title = pathTitle(home.path, panel.catalog, 40);
    const [before = "", after = ""] = t(panel.catalog, "v4.nest.goDigAgain", { path: PATH_MARK }).split(PATH_MARK);
    return (
      <button type="button" className="v4Btn v4PanelGoDig" onClick={(event) => panel.onSelect(`path:${pathId}`, viaKeyboard(event))}>
        <span>
          {before}
          <span data-ai-generated={title.ai ? "true" : undefined}>{title.text}</span>
          {after}
        </span>
      </button>
    );
  }
  const questions = dig.link.openQuestionIds.flatMap((id) => {
    const question = findOpenQuestion(panel.map, id);
    return question === null ? [] : [question];
  });
  return questions.length === 0 ? null : <DigBlock target={{ kind: "open", questions }} panel={panel} again />;
}

/** dig-f28: a dig sent this long ago that still waits for a free spot is told so; until then it is only starting. */
const WAITING_TOLD_AFTER_MS = 10_000;

/** How much longer until a dig sent at `startedAt` has waited long enough to be told so (0: now; unknown start: now). */
function waitLeft(startedAt: string | null, now: number): number {
  const sent = startedAt === null ? Number.NaN : Date.parse(startedAt);
  if (Number.isNaN(sent)) return 0;
  // A start "in the future" (this device's clock is behind) waits the 10 seconds from now, never longer.
  return Math.min(WAITING_TOLD_AFTER_MS, Math.max(0, sent + WAITING_TOLD_AFTER_MS - now));
}

/**
 * dig-f28: a waiting dig's line. In its first 10 seconds "Starting your dig…"; after that "Waiting for a free spot. It
 * starts on its own. You can close this page." (no "usually within a minute" until the waits are measured). One timer,
 * for this dig only (the caller keys it by the dig).
 */
function WaitingLine(props: Readonly<{ startedAt: string | null; catalog: MessageCatalog }>) {
  const { startedAt } = props;
  const [waited, setWaited] = useState(() => waitLeft(startedAt, Date.now()) === 0);
  useEffect(() => {
    if (waited) return undefined;
    const timer = window.setTimeout(() => setWaited(true), waitLeft(startedAt, Date.now()));
    return () => window.clearTimeout(timer);
  }, [waited, startedAt]);
  return <>{t(props.catalog, waited ? "v4.panel.digState.WAITING" : "v4.undo.sendingDig")}</>;
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
  // Owner review 3 Nov (wait-f2): one pause block, the same as the waiting card's, with Continue once the month has reset.
  const pause = pauseOfDig(dig);
  // dig-d1 B / dig-f32: a dig at work (running, or rewriting its path) shows the running dig's own panel; a dig still
  // waiting keeps its line (dig-f28), and one held at the month wall its pause block.
  const running = pause === null && dig.state !== "WAITING" && digWorking(dig);
  // dig-f32: a finished dig opens with the same result box as the path it rewrote (its mode word follows the box).
  const boxed = digResultOf(dig, props.resolved.home.path) !== null;
  const modeTag = dig.link.mode !== null && panel.showDigModes !== false
    ? <span className="v4PanelModeTag">{t(panel.catalog, `v4.digMode.${dig.link.mode}`)}</span>
    : null;
  return (
    <>
      {boxed ? (
        <>
          <V4DigResult dig={dig} path={props.resolved.home.path} catalog={panel.catalog} />
          {modeTag === null ? null : <p className="v4PanelText">{modeTag}</p>}
        </>
      ) : null}
      {more.length > 0
        ? (
          <Section title={t(panel.catalog, "v4.panel.digAlso")}>
            <ul className="v4PanelWhy" data-ai-generated="true">
              {more.map((question, index) => <li key={index}>{question}</li>)}
            </ul>
          </Section>
        )
        : null}
      {running ? (
        <V4DigRunning
          key={dig.link.childRunId}
          dig={dig}
          progress={panel.openDigProgress ?? null}
          pathLine={props.resolved.home.path?.line ?? null}
          showMode={panel.showDigModes !== false}
          checkedAt={panel.openDigCheckedAt ?? null}
          catalog={panel.catalog}
          locale={panel.locale}
        />
      ) : null}
      {/* A dig waiting, held at the month wall, failed or done without a result box: its state line, as before. */}
      {running || boxed ? null : (
      <Section title={t(panel.catalog, "v4.panel.answerHere")}>
        {pause !== null ? (
          <>
            <V4MonthPause runId={dig.link.childRunId} pause={pause} catalog={panel.catalog} locale={panel.locale} className="v4PanelPause" />
            {dig.link.mode !== null && panel.showDigModes !== false ? <p className="v4PanelText"><span className="v4PanelModeTag">{t(panel.catalog, `v4.digMode.${dig.link.mode}`)}</span></p> : null}
          </>
        ) : (
          <p className="v4PanelText">
            {digWorking(dig) ? <span className="v4MapPulse" aria-hidden="true" /> : null}
            {rewrite !== undefined && dig.state === "DONE"
              ? digNote(dig, panel.catalog, panel.locale)
              : dig.state === "WAITING"
                ? <WaitingLine key={dig.link.childRunId} startedAt={dig.link.startedAt} catalog={panel.catalog} />
                : t(panel.catalog, `v4.panel.digState.${dig.state}`)}
            {/* dig-f8: Free has no Quick look / Thorough choice, so its digs carry no mode word. */}
            {dig.link.mode !== null && panel.showDigModes !== false
              ? <> <span className="v4PanelModeTag">{t(panel.catalog, `v4.digMode.${dig.link.mode}`)}</span></>
              : null}
          </p>
        )}
        {panel.failedDigs !== undefined
          ? <V4DigFailed dig={dig} failed={panel.failedDigs} digBusy={panel.digBusy || (panel.digRest ?? null) !== null} catalog={panel.catalog} />
          : null}
        {dig.state === "DONE" && rewrite === undefined
          ? (headline.length > 0
            ? <p className="v4PanelHeadline v4Serif" data-ai-generated="true">{headline}</p>
            : <p className="v4Muted">{t(panel.catalog, "v4.panel.digNoHeadline")}</p>)
          : null}
      </Section>
      )}
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

/** A heading is shown whole (map-f11): long enough for any title the map gives. */
const HEADING_MAX = 2_000;

/** The panel heading; the site's own fallback words are not marked as AI text (RULES-14). */
function headingOf(resolved: ResolvedSelection, map: V4Map, catalog: MessageCatalog): Title {
  // map-f25: a path's heading is its own label, uncut; its whole line (outcome words and all) is in "The answer here so far".
  if (resolved.kind === "path") return pathTitle(resolved.path, catalog, HEADING_MAX);
  if (resolved.kind === "open") return { text: resolved.question.text, ai: true, more: 0 };
  // map-f29 / dig-f20: what the dig looked into, in its own words, marked as AI text only when an AI wrote them.
  if (resolved.kind === "dig") return { ...digTitle(resolved.dig, catalog, HEADING_MAX, map), more: 0 };
  // The person's own words; the lines added from their choices sit in "What we asked the AIs".
  return { text: ownWords(map.question), ai: true, more: 0 };
}

export function V4Panel(props: PanelProps) {
  const { map, catalog } = props;
  const resolved = resolveSelection(map, props.digs, props.selected);
  const heading = headingOf(resolved, map, catalog);
  return (
    <div className={`v4Panel v4Panel-${resolved.kind}`}>
      <Crumbs resolved={resolved} map={map} onSelect={props.onSelect} catalog={catalog} />
      {props.underCrumbs ?? null}
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
