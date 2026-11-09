"use client";

import { useRef, useState, type ReactNode } from "react";
import { t } from "@/lib/i18n/translate";
import { digGround, groundClass } from "@/lib/v4/mapLooks";
import { useMapKeys } from "@/lib/v4/useMapKeys";
import type { DigView, V4OpenQuestion, V4Selection } from "@/lib/v4/types";
import {
  DigPauseDot,
  digNote,
  digSprouts,
  digsUnder,
  digTitle,
  firstCardQuestion,
  HoldsSeal,
  LevelWords,
  MapLegendItems,
  MoreToExploreRow,
  NewDot,
  OpenWord,
  openNote,
  pathExtras,
  pathMarks,
  pathTitle,
  PickBox,
  PickReasonRow,
  resolveSelection,
  ResultTag,
  selectionIdOf,
  shortText,
  TitleText,
  TrustWordTag,
  undugOpen,
  V4PathCard,
  viaKeyboard,
  type MapPiecesProps
} from "./V4MapTree";
import { useDigSeeds, V4DigSeedLeaves } from "./V4DigSeed";
import { pickReasonPlaces, type PickGroup, type PickReasonPlace } from "./V4DigSuggest";
import { V4RewriteCardNote } from "./V4PathRewrite";
import { V4TrustBar } from "./V4TrustBar";

/*
 * V4 initial (2026-10-28): the phone map (D7) as an indented list: the question, then its own open questions, then
 * each path with its open questions and digs. Every open question has its pick box (the outline doubles as the tray).
 * Tapping a row calls onSelect; the page then shows that question in the panel. W4-6: a rewritten path's row carries its
 * new text and one line about its rewrite, as the tree's card does; the panel shows the rest.
 * V4 screen review (3 Nov): the same looks as the tree (journey-f2: open ground hatched with "Open", a dig at work with a
 * slow pulse, the paths a dig opened dashed "New", the rest solid with its bar), each path's one trust word and its result
 * tag (r2-20 A, journey-f11), no counts (map-f28). map-f10: the real tree promised for screen readers: one keyboard stop
 * moved with the arrow keys, every row says its level, a path folds (Right and Left, or its own fold button beside it,
 * which alone says whether it is open: the row itself opens the path in the panel), and "What the shades mean" is one
 * folded line at the top. map-d3 shows it beside the panel on tablets too.
 * V4 start step, Task 61: a chosen path's row is its one card in compact form (V4MapTree's V4PathCard), the same while the
 * AIs look into it (the title, the step line, the dots to its right) and once it is filled in; what the page adds under the
 * question (rootExtra) sits right under its row; "+ N more to explore" under the paths; a map with no path lists none.
 */

function OpenRow(props: Readonly<{ question: V4OpenQuestion; pieces: MapPiecesProps; selectedId: V4Selection; group: string; level: number }>) {
  const { question, pieces } = props;
  const id: V4Selection = `open:${question.id}`;
  const picked = pieces.picked.has(question.id);
  const selected = props.selectedId === id;
  return (
    <li className={`v4OutRow v4OutOpen ${groundClass("OPEN")}${selected ? " v4OutSelected" : ""}`}>
      {/* public-d1 A: the read-only map of a public debate has no pick boxes (MapPiecesProps.readOnly). */}
      {pieces.readOnly === true ? null : (
        <PickBox
          question={question}
          picked={picked}
          onTogglePick={pieces.onTogglePick}
          catalog={pieces.catalog}
          className="v4OutPick"
          {...(pieces.choice === undefined ? {} : { choice: pieces.choice })}
        />
      )}
      <button
        type="button"
        className="v4OutMain"
        data-rove=""
        data-row={`${id}@${props.group}`}
        data-parent={props.group}
        aria-current={selected ? "true" : undefined}
        onClick={(event) => pieces.onSelect(id, viaKeyboard(event))}
      >
        <span className="v4OutTitle">
          {question.star ? <span className="v4MapStar" aria-hidden="true">★ </span> : null}
          <span data-ai-generated="true">{shortText(question.text)}</span>
        </span>
        <span className="v4MapNote">
          <OpenWord catalog={pieces.catalog} />
          {question.star ? <span className="v4MapStarWords">{t(pieces.catalog, "v4.map.starHint")}</span> : null}
          <span>{openNote(question, picked, pieces.catalog)}</span>
        </span>
        {selected ? <span className="v4OutHere">{t(pieces.catalog, "v4.outline.here")}</span> : null}
        {pieces.changed.has(id) ? <NewDot catalog={pieces.catalog} /> : null}
        <LevelWords level={props.level} catalog={pieces.catalog} />
      </button>
    </li>
  );
}

function DigRow(props: Readonly<{ dig: DigView; pieces: MapPiecesProps; selectedId: V4Selection; group: string; level: number }>) {
  const { dig, pieces } = props;
  const id: V4Selection = `dig:${dig.link.childRunId}`;
  const selected = props.selectedId === id;
  const ground = digGround(dig);
  const row = `${id}@${props.group}`;
  const sprouts = digSprouts(dig);
  const fresh = pieces.changed.has(id) || pieces.changed.has(props.group);
  return (
    <li className={`v4OutRow v4OutDig${selected ? " v4OutSelected" : ""}`}>
      <button
        type="button"
        className={`v4OutMain ${groundClass(ground)}${pieces.reveal?.has(id) === true ? " v4Reveal" : ""}`}
        data-rove=""
        data-row={row}
        data-parent={props.group}
        aria-current={selected ? "true" : undefined}
        onClick={(event) => pieces.onSelect(id, viaKeyboard(event))}
      >
        <TitleText className="v4OutTitle" title={digTitle(dig, pieces.catalog, 70, pieces.map)} catalog={pieces.catalog} />
        <span className="v4MapNote">
          {ground === "LOOKING" ? <span className="v4MapPulse" aria-hidden="true" /> : null}
          <DigPauseDot dig={dig} />
          {digNote(dig, pieces.catalog, pieces.locale)}
        </span>
        {dig.state === "DONE" && dig.counts !== null ? <V4TrustBar counts={dig.counts} catalog={pieces.catalog} /> : null}
        {selected ? <span className="v4OutHere">{t(pieces.catalog, "v4.outline.here")}</span> : null}
        {pieces.changed.has(id) ? <NewDot catalog={pieces.catalog} /> : null}
        <LevelWords level={props.level} catalog={pieces.catalog} />
      </button>
      {sprouts.length > 0 ? (
        <ul className="v4OutGroup v4OutSprouts" data-group={row}>
          {sprouts.map((sprout) => (
            <li key={sprout.key} className="v4OutRow">
              <button
                type="button"
                className={`v4OutMain v4MapSprout ${groundClass(fresh ? "NEW" : "SETTLED")}`}
                data-rove=""
                data-row={`sprout:${dig.link.childRunId}:${sprout.key}`}
                data-parent={row}
                onClick={(event) => pieces.onSelect(id, viaKeyboard(event))}
              >
                {fresh ? <span className="v4GroundNewTag">{t(pieces.catalog, "v4.ground.new")}</span> : null}
                <span className="v4MapSproutTitle" data-ai-generated="true">{sprout.line}</span>
                <LevelWords level={props.level + 1} catalog={pieces.catalog} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function Children(props: Readonly<{
  open: readonly V4OpenQuestion[];
  digs: readonly DigView[];
  pieces: MapPiecesProps;
  selectedId: V4Selection;
  groupKey: string;
  /** The row these hang under ("root", or the path's selection id). */
  group: string;
  level: number;
  /** W3-4: the path's suggestions and "Dig here too" (null: none). */
  extra?: ReactNode;
  /** dig-f22: where this group's visible reason line goes (absent: it has none). */
  reason?: PickReasonPlace;
}>) {
  const extra = props.extra ?? null;
  // dig-d3 B: a dig in its 10 seconds grows its seed in the outline too (the tablet's list, the phone's Map sheet).
  const seeds = useDigSeeds(props.pieces.map.runId, props.groupKey);
  if (props.open.length === 0 && props.digs.length === 0 && extra === null && seeds.length === 0) return null;
  const reasonRow = (before: string): ReactNode => (props.reason?.before === before
    ? <PickReasonRow key={`reason/${props.groupKey}`} place={props.reason} pieces={props.pieces} className="v4OutRow v4OutReason" />
    : null);
  return (
    <ul className="v4OutGroup v4OutLeaves" data-group={props.group}>
      {props.open.flatMap((question) => [
        reasonRow(question.id),
        <OpenRow
          key={`${props.groupKey}/${question.id}`}
          question={question}
          pieces={props.pieces}
          selectedId={props.selectedId}
          group={props.group}
          level={props.level}
        />
      ])}
      {props.digs.map((dig) => (
        <DigRow key={dig.link.childRunId} dig={dig} pieces={props.pieces} selectedId={props.selectedId} group={props.group} level={props.level} />
      ))}
      {extra === null ? null : reasonRow("suggestions")}
      {extra}
      <V4DigSeedLeaves runId={props.pieces.map.runId} groupKey={props.groupKey} catalog={props.pieces.catalog} />
    </ul>
  );
}

export function V4Outline(props: MapPiecesProps) {
  const { map, digs, catalog } = props;
  const selectedId = selectionIdOf(resolveSelection(map, digs, props.selected));
  const rootSelected = selectedId === "root";
  /** map-f10: the paths folded with Left (or their fold button); every path starts open. */
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set());
  const treeRef = useRef<HTMLUListElement | null>(null);
  const setFold = (row: string, fold: boolean): boolean => {
    if (!row.startsWith("path:")) return false;
    const id = row.slice("path:".length);
    if (folded.has(id) === fold) return false;
    setFolded((before) => (fold ? new Set([...before, id]) : new Set([...before].filter((key) => key !== id))));
    return true;
  };
  const keys = useMapKeys(treeRef, { onExpand: (row) => setFold(row, false), onCollapse: (row) => setFold(row, true) });
  // dig-f22: a visible line above the first box greyed for each reason, in the order the rows are drawn (a folded path
  // draws none of its boxes).
  const rootOpen = undugOpen(map.open, digs);
  const reasons = pickReasonPlaces([
    { key: "root", path: null, open: rootOpen, suggestions: false },
    ...map.paths.map((path): PickGroup => (folded.has(path.id)
      ? { key: path.id, path, open: [], suggestions: false }
      : { key: path.id, path, open: undugOpen(path.open, digs), suggestions: pathExtras(path, props, "outline") !== null }))
  ], props.picked, props.choice);
  const reasonOf = (key: string) => {
    const place = reasons.get(key);
    return place === undefined ? {} : { reason: place };
  };
  return (
    <nav className="v4Out" aria-label={t(catalog, "v4.outline.label")}>
      <details className="v4OutShades">
        <summary>{t(catalog, "v4.outline.shades")}</summary>
        <ul className="v4MapLegend v4OutLegend">
          <MapLegendItems catalog={catalog} />
        </ul>
      </details>
      <ul className="v4OutTree" ref={treeRef} onKeyDown={keys.onKeyDown} onFocus={keys.onFocus}>
        <li className="v4OutRow">
          <button
            type="button"
            className={`v4OutRoot${rootSelected ? " v4OutSelected" : ""}`}
            data-rove=""
            data-row="root"
            data-parent=""
            aria-current={rootSelected ? "true" : undefined}
            onClick={(event) => props.onSelect("root", viaKeyboard(event))}
          >
            {/* V4 start step, Task 62 (r2-8): a path debate's question as it was sent, its answers sentences in it. */}
            <span className="v4OutRootTitle v4Serif" data-ai-generated="true">{firstCardQuestion(map)}</span>
            {props.changed.has("root") ? <NewDot catalog={catalog} /> : null}
            <LevelWords level={1} catalog={catalog} />
          </button>
          {props.rootExtra === undefined ? null : <div className="v4MapRootExtra">{props.rootExtra}</div>}
          <Children
            groupKey="root"
            group="root"
            level={2}
            open={rootOpen}
            digs={digsUnder(map, digs, null)}
            pieces={props}
            selectedId={selectedId}
            {...reasonOf("root")}
          />
          {map.paths.length === 0
            ? (map.phase === "RUN" ? null : <p className="v4MapEmpty v4Muted">{t(catalog, "v4.map.noPaths")}</p>)
            : (
              <ul className="v4OutGroup" data-group="root">
                {map.paths.map((path) => {
                  const id: V4Selection = `path:${path.id}`;
                  const selected = selectedId === id;
                  const news = props.changed.has(id);
                  const marks = pathMarks(path, digs, news);
                  const open = undugOpen(path.open, digs);
                  const below = digsUnder(map, digs, path.id);
                  const extra = pathExtras(path, props, "outline");
                  const hasChildren = open.length > 0 || below.length > 0 || extra !== null;
                  const isFolded = folded.has(path.id);
                  return (
                    <li key={path.id} className="v4OutRow">
                      <div className="v4OutPathLine">
                      {path.branch !== undefined ? (
                        // Task 61: a chosen path's one card, in its compact form.
                        <V4PathCard
                          path={path}
                          selected={selected}
                          changed={news}
                          phase={map.phase === "RUN" ? "RUN" : "ANSWER"}
                          running={props.running === true}
                          compact
                          onSelect={(keyboard) => props.onSelect(id, keyboard)}
                          catalog={catalog}
                          locale={props.locale ?? "en"}
                          digs={digs}
                          reveal={props.reveal?.has(id) === true}
                          {...(hasChildren ? { expanded: !isFolded } : {})}
                        />
                      ) : (
                      <button
                        type="button"
                        className={`v4OutPath ${groundClass("SETTLED")}${selected ? " v4OutSelected" : ""}${props.reveal?.has(id) === true ? " v4Reveal" : ""}`}
                        data-rove=""
                        data-row={id}
                        data-parent="root"
                        data-expanded={hasChildren ? String(!isFolded) : undefined}
                        aria-current={selected ? "true" : undefined}
                        onClick={(event) => props.onSelect(id, viaKeyboard(event))}
                      >
                        {marks.tag !== null ? <ResultTag result={marks.tag} catalog={catalog} /> : null}
                        <TitleText className="v4OutTitle" title={pathTitle(path, catalog)} catalog={catalog} />
                        <span className="v4OutMeta">
                          <TrustWordTag path={path} catalog={catalog} />
                          {marks.seal ? <HoldsSeal catalog={catalog} /> : null}
                          {selected ? <span className="v4OutHere">{t(catalog, "v4.outline.here")}</span> : null}
                          {news && marks.tag === null ? <NewDot catalog={catalog} /> : null}
                        </span>
                        <V4TrustBar counts={path.counts} unchecked={path.unchecked} catalog={catalog} />
                        <V4RewriteCardNote path={path} catalog={catalog} locale={props.locale ?? "en"} digs={digs} />
                        <LevelWords level={2} catalog={catalog} />
                      </button>
                      )}
                      {hasChildren ? (
                        // map-f10: the path's own fold button, for a pointer or a finger (the arrow keys reach it from the row).
                        <button
                          type="button"
                          className="v4OutFold"
                          data-no-rove=""
                          aria-expanded={!isFolded}
                          aria-label={t(catalog, isFolded ? "v4.outline.unfold" : "v4.outline.fold")}
                          onClick={() => setFold(id, !isFolded)}
                        >
                          <span className="v4OutFoldMark" aria-hidden="true">▾</span>
                        </button>
                      ) : null}
                      </div>
                      {hasChildren && isFolded ? (
                        <span className="v4MapGroundMark v4OutFoldedMark">
                          <span className="v4MapGroundKey" aria-hidden="true" />
                          {t(catalog, "v4.map.openGround")}
                        </span>
                      ) : null}
                      {isFolded ? null : (
                        <Children
                          groupKey={path.id}
                          group={id}
                          level={3}
                          open={open}
                          digs={below}
                          pieces={props}
                          selectedId={selectedId}
                          extra={extra}
                          {...reasonOf(path.id)}
                        />
                      )}
                    </li>
                  );
                })}
                <MoreToExploreRow pieces={props} selected={selectedId === "more"} />
              </ul>
            )}
        </li>
      </ul>
    </nav>
  );
}
