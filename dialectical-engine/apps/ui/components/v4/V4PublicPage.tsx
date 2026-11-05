"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import type { PublicDebate } from "@debateai/contract";
import { AlsoRaisedList } from "@/components/AlsoRaisedList";
import { FloorAnswer } from "@/components/FloorAnswer";
import { formatDate, t, type MessageCatalog } from "@/lib/i18n/translate";
import { floorAnswerView, publicFloorHost, resolveFloor } from "@/lib/v3/floorAnswer";
import { cardLabel } from "@/lib/v4/mapLooks";
import { publicHasWords, publicMapOf, publicSidesOf, type PublicSide } from "@/lib/v4/publicMap";
import type { PublicPathView } from "@/lib/v4/publicPage";
import { useOpenSide } from "@/lib/v4/useOpenSide";
import type { V4Map, V4OpenQuestion, V4Path, V4Selection } from "@/lib/v4/types";
import { DIG_RETURN_PARAM } from "./V4PublicSession";
import { V4PublicPathNote, V4PublicReports } from "./V4PublicLane";
import { V4PublicFlag } from "./V4PublicFlag";
import { TrustWordTag, V4MapTree, type MapPiecesProps } from "./V4MapTree";
import { V4Outline } from "./V4Outline";
import { PointGroups } from "./V4Panel";
import { V4TrustBar } from "./V4TrustBar";

/*
 * Owner's screen review, 3 Nov 2026 (public-d1 A, with the chat answers and Round 2): the public page, answer first. A stranger reads, in this order:
 *   - the answer card: the answer (a contribution's update first, the first answer one click away) and how sure it is, as the own map says it (the
 *     four-shade bar and the "How sure" sentence, never a number), then "For" and "Against": the strongest published point on each side, one sentence
 *     each, with no score, model code or count; then what is still open under the question itself;
 *   - the paths (r2-1 A: "path") as rows, each with its one trust word and its bar (r2-20 A: no outcome tags). A row unfolds what was found (with its
 *     sources), who added to it, the deeper questions, "Dig here" and, at its foot, "Report a problem" (public-f4) already naming the path;
 *   - the one star, "★ A good place to start" (journey-f12: one label on both pages, in place of public-d1's "Biggest open question · Dig here"), on an
 *     open question a public page can dig into;
 *   - "Explore the map": the same map as the person's own (V4MapTree, or V4Outline below 1100 px, as the own page chooses), with the read-only switch
 *     (MapPiecesProps.readOnly): one map, not a second copy. It lives in the page address (?view=map), so Back and a shared link keep it. Picking a
 *     card on it comes back to that path's row, opened (?path=<id>).
 *   - the Reports.
 * public-f1: nothing here shows a score, a percentage, a capital-letter measure, a model or maker, a for/against count or the old disclaimer; the scores
 * only choose the strongest point on each side (lib/v4/publicMap.ts) and stay there. public-f3: there is no Challenge and no Regenerate. Every line the
 * AIs wrote is marked as AI text and read in the debate's language (`storyLocale`). Nothing is kept in the browser.
 * V4 start step, Task 63: on a path debate each row is named by its path's title, and the person's own words (a path they added or rewrote, the views
 * they wrote into one) show as theirs, never marked as AI text, as the question is.
 */

/** The page address's word for the map view: `?view=map` (journey-d4: each view has its own address). */
const VIEW_PARAM = "view";
const VIEW_MAP = "map";
/** The page address's open path: `?path=<id>` (a map card picked, or a shared link to one path). */
const PATH_PARAM = "path";
/** The own map's widths (V4DebateClient useLayout): below 1100 px the outline, up to 1439 px the folded tree. */
const OUTLINE_QUERY = "(max-width: 1099px)";
const FOLD_QUERY = "(max-width: 1439px)";

type V4PublicPageProps = Readonly<{
  debate: PublicDebate;
  /** The V4 catalogue (English, owner N10). */
  catalog: MessageCatalog;
  /** The interface's `public` catalogue (what the strongest point on each side is read with; none of its words reach the page). */
  publicCatalog: MessageCatalog;
  /** The `public` catalogue of the debate's language (the floor answer and the also-raised list read in it). */
  storyCatalog: MessageCatalog;
  storyLocale: string;
  locale: string;
  /** False on a publication review: nothing to press, nothing to report. */
  actions: boolean;
  /**
   * A publication review only (PublicationReviewsPanel, through PublicDebateOverview with no lane): the reviewer's own two doors, "Details" on the
   * answer and "Read" on each side's strongest point, which open the review's local panels. A stranger's page never has them.
   */
  reviewDoors?: Readonly<{ onDetails: () => void; onRead: (nodeId: string) => void }>;
}>;

/** The paths whose rows the address opens: `?path=<id>`, or the path that holds the dig box `?dig=<ref>` names (the way back after signing in). */
function rowsOpenedByAddress(map: V4Map, views: ReadonlyMap<string, PublicPathView>): ReadonlySet<string> {
  const query = new URLSearchParams(window.location.search);
  const opened = new Set<string>();
  const path = query.get(PATH_PARAM);
  if (path !== null && map.paths.some((candidate) => candidate.id === path)) opened.add(path);
  const dig = query.get(DIG_RETURN_PARAM);
  if (dig !== null) {
    const holds = (view: PublicPathView): boolean => view.ref === dig || view.digs.some((one) => one.paths.some(holds));
    for (const [id, view] of views) if (holds(view)) opened.add(id);
  }
  return opened;
}

function mapShownByAddress(): boolean {
  return new URLSearchParams(window.location.search).get(VIEW_PARAM) === VIEW_MAP;
}

/** The address with the map view on or off and, optionally, one path open. */
function addressWith(showMap: boolean, path: string | null): string {
  const url = new URL(window.location.href);
  if (showMap) url.searchParams.set(VIEW_PARAM, VIEW_MAP);
  else url.searchParams.delete(VIEW_PARAM);
  if (path === null) url.searchParams.delete(PATH_PARAM);
  else url.searchParams.set(PATH_PARAM, path);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** The path a map card stands on: the path itself, or the path its open question hangs under (null: the question itself). */
function pathOfSelection(map: V4Map, selection: V4Selection): string | null {
  if (selection.startsWith("path:")) return selection.slice("path:".length);
  if (selection.startsWith("open:")) {
    const id = selection.slice("open:".length);
    return map.paths.find((path) => path.open.some((question) => question.id === id))?.id ?? null;
  }
  return null;
}

/** Which of the own map's two drawings fits this width: "outline" (phones and tablets), "fold" (laptops) or "tree". */
function useMapDrawing(): "outline" | "fold" | "tree" {
  const [drawing, setDrawing] = useState<"outline" | "fold" | "tree">("tree");
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const outline = window.matchMedia(OUTLINE_QUERY);
    const fold = window.matchMedia(FOLD_QUERY);
    const update = (): void => setDrawing(outline.matches ? "outline" : fold.matches ? "fold" : "tree");
    update();
    outline.addEventListener("change", update);
    fold.addEventListener("change", update);
    return () => {
      outline.removeEventListener("change", update);
      fold.removeEventListener("change", update);
    };
  }, []);
  return drawing;
}

/**
 * The answer: the update first when a contribution changed it, with the first answer, sealed as it was (its paths at their first text too), one click
 * away; else the story's short answer, the floor, or the composed text. The story's fixed words (its reservation line, "Worth knowing") read in the
 * debate's language, as they always have on this page (spec 2026-09-26 §14.3).
 */
function PublicAnswer({ debate, map, catalog, storyCatalog, storyLocale, locale }: Readonly<{
  debate: PublicDebate; map: V4Map; catalog: MessageCatalog; storyCatalog: MessageCatalog; storyLocale: string; locale: string;
}>) {
  const story = debate.story_short;
  const floor = resolveFloor(publicFloorHost(debate.answer), debate.floor);
  const floorView = floor === null ? null : floorAnswerView(floor, storyCatalog, storyLocale, storyLocale);
  const headline = map.headline?.trim() ?? "";
  const summary = map.summary?.trim() ?? "";
  const fallback = (map.fallbackText ?? "").split(/\n\s*\n/u).map((paragraph) => paragraph.trim()).filter((paragraph) => paragraph.length > 0);
  const lead = (at: number): string => (at === 0 ? "v4AnswerHeadline v4Serif" : "v4AnswerText");
  const update = debate.main_answer_update;
  const note = story?.reviewer_note?.text.trim() ?? "";
  const words = headline.length > 0 || summary.length > 0
    ? (
      <div data-ai-generated="true" lang={storyLocale} dir="auto" data-public-story>
        {headline.length > 0 ? <p className="v4AnswerHeadline v4Serif">{headline}</p> : null}
        {summary.length > 0 ? <p className="v4AnswerText">{summary}</p> : null}
      </div>
    )
    : floorView !== null
      ? <FloorAnswer view={floorView} showLabel={false} />
      : fallback.length > 0
        ? <div data-ai-generated="true" lang={storyLocale} dir="auto">{fallback.map((paragraph, at) => <p key={at} className={lead(at)}>{paragraph}</p>)}</div>
        // N14, the own report's approved line: nothing was written to read, and the paths below still say what the AIs found (no engine words).
        : <p className="v4Muted" data-public-no-answer>{t(catalog, "v4.report.storyUnavailable")}</p>;
  const thinBasis = headline.length > 0 || summary.length > 0 ? floorView?.thinBasis ?? null : null;
  const first = (
    <>
      {words}
      {/* A kept label that rests on less than usual says so under the story too (spec §14.4.4), in the question's words. */}
      {thinBasis === null ? null : <p className="floorAnswerNote v4AnswerNote" lang={floorView!.locale} dir={floorView!.direction}>{thinBasis}</p>}
      {map.reservation ? <p className="v4AnswerNote v4Muted" lang={storyLocale} data-public-reservation>{t(storyCatalog, "public.story.reservation")}</p> : null}
      {note.length > 0 ? (
        <p className="v4AnswerNote v4PubWorth" data-public-note>
          <span className="v4PubWorthTitle" lang={storyLocale}>{t(storyCatalog, "public.story.noteTitle")}</span>{" "}
          <span data-ai-generated="true" lang={storyLocale} dir="auto">{note}</span>
        </p>
      ) : null}
    </>
  );
  if (update === undefined) return first;
  const firstPaths = (story?.paths ?? []).map((path) => path.line.trim()).filter((line) => line.length > 0);
  return (
    <>
      <div className="publicMainUpdate" data-public-main-update>
        <div data-ai-generated="true" lang={storyLocale}>
          {update.segments.map((segment, at) => <p key={at} className={lead(at)} dir="auto">{segment.text}</p>)}
        </div>
        <p className="v4AnswerNote v4Muted">
          {t(catalog, "v4.public.mainUpdated", { date: formatDate(locale, update.updated_at, { year: "numeric", month: "long", day: "numeric" }) })}
        </p>
      </div>
      <details className="v4AnswerMore publicFirstAnswer">
        <summary>{t(catalog, "v4.public.firstAnswer")}</summary>
        <div className="v4AnswerMoreBody">
          {first}
          {firstPaths.length > 0 ? (
            <ul className="v4PubFirstPaths" data-ai-generated="true" lang={storyLocale}>
              {firstPaths.map((line, at) => <li key={at} dir="auto">{line}</li>)}
            </ul>
          ) : null}
        </div>
      </details>
    </>
  );
}

/** public-d1 A: "For" and "Against", one sentence each; a side with no published point is left out, and with neither there is nothing. */
function Sides({ debate, catalog, publicCatalog, storyLocale, onRead }: Readonly<{
  debate: PublicDebate; catalog: MessageCatalog; publicCatalog: MessageCatalog; storyLocale: string; onRead?: (nodeId: string) => void;
}>) {
  const { forSide, againstSide } = publicSidesOf(debate, publicCatalog);
  if (forSide === null && againstSide === null) return null;
  const line = (word: string, side: PublicSide | null, kind: "for" | "against") => (side === null ? null : (
    <p className={`v4PubSide v4PubSide-${kind}`} data-public-side={kind}>
      <span className="v4PubSideWord">{t(catalog, word)}</span>{" "}
      <span data-ai-generated="true" lang={storyLocale} dir="auto">{side.line}</span>
      {onRead === undefined ? null : (
        <>{" "}<button type="button" className="v4Link publicReadAction" onClick={() => onRead(side.nodeId)}>{t(publicCatalog, "public.overview.read")}</button></>
      )}
    </p>
  ));
  return (
    <div className="v4PubSides">
      {line("v4.public.side.for", forSide, "for")}
      {line("v4.public.side.against", againstSide, "against")}
    </div>
  );
}

/** One open question: the star's words when it carries the star, its kind in the site's words, and its text as the AIs wrote it. */
function OpenLine({ question, catalog, storyLocale }: Readonly<{ question: V4OpenQuestion; catalog: MessageCatalog; storyLocale: string }>) {
  return (
    <li className={`v4PubOpen${question.star ? " v4PubOpenStar" : ""}`} data-public-open={question.id}>
      {question.star ? (
        <span className="v4PubStar" data-public-star>
          <span aria-hidden="true">★</span> {t(catalog, "v4.map.starHint")}
        </span>
      ) : null}
      <span className="v4PubOpenKind">{t(catalog, `v4.map.openKind.${question.kind}`)}</span>
      <span className="v4PubOpenText" data-ai-generated="true" lang={storyLocale} dir="auto">{question.text}</span>
    </li>
  );
}

/** One path as a row: its name, its one trust word and its bar; unfolded, everything the page holds about it. */
function PathRow({ path, view, open, onToggle, words, props }: Readonly<{
  path: V4Path; view: PublicPathView | undefined; open: boolean; onToggle: () => void; words: boolean; props: V4PublicPageProps;
}>) {
  const { catalog, storyLocale, locale } = props;
  const bodyId = useId();
  // Task 63: a path debate's row is named by its path's title; a title the person wrote (a path they added or rewrote) is never marked as AI text.
  const title = view?.title ?? null;
  const label = title ?? cardLabel(path.line);
  const titleTheirs = title !== null && (view?.ownWords.includes(title) ?? false);
  const ownWords = (view?.ownWords ?? []).filter((words) => words !== title);
  const line = path.line.replace(/\s+/gu, " ").trim();
  const star = path.open.some((question) => question.star);
  const checked = path.points.some((point) => point.trust !== null);
  return (
    <li className={`v4PubRow${open ? " v4PubRowOpen" : ""}`} id={`public-path-${path.id}`} data-public-path={path.id}>
      <h3 className="v4PubRowHeading">
        <button type="button" className="v4PubRowHead" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
          <span className="v4PubRowTitle" {...(titleTheirs ? {} : { "data-ai-generated": "true" })} lang={storyLocale} dir="auto">{label}</span>
          <span className="v4PubRowMeta">
            {/* r2-20 A: the path's one trust word; a path that fell says "Didn't hold" even when its tree was not published. */}
            <TrustWordTag path={path} catalog={catalog} />
            {star && !open ? <span className="v4PubStar"><span aria-hidden="true">★</span> {t(catalog, "v4.map.starHint")}</span> : null}
          </span>
          {/* The browser check (4 Nov): an open row shows its bar once, the large one in its body; the head's small bar steps aside, as the star does. */}
          {words && checked && !open ? <V4TrustBar counts={path.counts} unchecked={path.unchecked} catalog={catalog} /> : null}
          <span className="v4PubRowChevron" aria-hidden="true">▾</span>
        </button>
      </h3>
      <div className="v4PubRowBody" id={bodyId} hidden={!open}>
        {open ? (
          <>
            {line !== label ? <p className="v4PubRowLine" data-ai-generated="true" lang={storyLocale} dir="auto">{line}</p> : null}
            {ownWords.length > 0 ? (
              // Task 63 (spec 2026-11-03 §7): what the person wrote into the path, like the question itself, as they wrote it.
              <div className="v4PubOwnWords" data-public-own-words>
                <p className="v4PubLabel">{t(catalog, "v4.public.pathOwnWords")}</p>
                <ul className="v4PubFirstPaths">
                  {ownWords.map((words, at) => <li key={at} lang={storyLocale} dir="auto">{words}</li>)}
                </ul>
              </div>
            ) : null}
            {checked ? (
              <div className="v4PubFound">
                <V4TrustBar counts={path.counts} unchecked={path.unchecked} catalog={catalog} size="large" showCounts />
                <PointGroups points={path.points} level="plain" catalog={catalog} locale={locale} />
              </div>
            ) : null}
            {path.open.length > 0 ? (
              <div className="v4PubDeeper">
                <p className="v4PubLabel">{t(catalog, "v4.panel.whereToDig")}</p>
                <ul className="v4PubOpenList">
                  {path.open.map((question) => <OpenLine key={question.id} question={question} catalog={catalog} storyLocale={storyLocale} />)}
                </ul>
              </div>
            ) : null}
            {view === undefined ? null : <V4PublicPathNote path={view} catalog={catalog} locale={locale} actions={props.actions} />}
            {props.actions ? (
              <div className="v4PubRowFoot">
                <V4PublicFlag publicRef={props.debate.public_ref} catalog={catalog} where={label} placement="foot" />
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </li>
  );
}

/** "Explore the map": the own map's drawing for this width, with nothing to tick; a card picked comes back to the page. */
function PublicMapView({ map, catalog, locale, onBack, focusBack }: Readonly<{
  map: V4Map; catalog: MessageCatalog; locale: string; onBack: (path: string | null) => void;
  /** Opened with "Explore the map" (not from the address): focus starts on the way back. */
  focusBack: boolean;
}>) {
  const drawing = useMapDrawing();
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusBack) back.current?.focus({ preventScroll: true });
  }, [focusBack]);
  const pieces: MapPiecesProps = {
    map,
    digs: [],
    selected: "root",
    changed: new Set(),
    picked: new Set(),
    onSelect: (selection) => onBack(pathOfSelection(map, selection)),
    onTogglePick: () => undefined,
    catalog,
    locale,
    readOnly: true
  };
  return (
    <div className="v4PubMapView" data-public-map data-drawing={drawing}>
      <button type="button" ref={back} className="v4Link v4PubMapBack" onClick={() => onBack(null)} data-public-map-back>
        <span aria-hidden="true">‹</span> {t(catalog, "v4.public.mapBack")}
      </button>
      {drawing === "outline" ? <V4Outline {...pieces} /> : <V4MapTree {...pieces} fold={drawing === "fold"} />}
    </div>
  );
}

/**
 * The public page's body under the title. PublicDebateOverview (the start-step's file) draws it through a thin switch, so the publication review shows the
 * same page with nothing to press.
 */
export function V4PublicAnswerFirst(props: V4PublicPageProps) {
  const { debate, catalog, publicCatalog, storyCatalog, storyLocale, locale } = props;
  const { map, views } = useMemo(() => publicMapOf(debate), [debate]);
  const words = publicHasWords(map);
  const [openRows, setOpenRows] = useState<ReadonlySet<string>>(() => new Set());
  const [showMap, setShowMap] = useState(false);
  const exploreButton = useRef<HTMLButtonElement>(null);
  const openedByButton = useRef(false);
  /** Where focus goes once the page is drawn again after the map: a path's row (its id), "Explore the map" (""), or nowhere (null). */
  const returning = useRef<string | null>(null);

  // The address decides the view and the open rows: at first, and again on Back and Forward.
  useEffect(() => {
    const read = (): void => {
      setShowMap(mapShownByAddress());
      const opened = rowsOpenedByAddress(map, views);
      if (opened.size > 0) setOpenRows((before) => new Set([...before, ...opened]));
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [map, views]);

  // Back from the map: the picked path's row is opened, scrolled to and focused once it is drawn; else focus goes back to "Explore the map".
  useEffect(() => {
    const id = returning.current;
    if (id === null || showMap) return;
    returning.current = null;
    if (id === "") {
      exploreButton.current?.focus();
      return;
    }
    const row = document.getElementById(`public-path-${id}`);
    row?.scrollIntoView?.({ block: "start" });
    row?.querySelector<HTMLButtonElement>(".v4PubRowHead")?.focus({ preventScroll: true });
  });

  const toggleRow = useCallback((id: string) => setOpenRows((before) => {
    const next = new Set(before);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }), []);

  const openMap = (): void => {
    window.history.pushState(null, "", addressWith(true, null));
    openedByButton.current = true;
    setShowMap(true);
  };
  const closeMap = (path: string | null): void => {
    window.history.pushState(null, "", addressWith(false, path));
    openedByButton.current = false;
    setShowMap(false);
    returning.current = path ?? "";
    if (path !== null) setOpenRows((before) => new Set([...before, path]));
  };

  if (showMap) return <PublicMapView map={map} catalog={catalog} locale={locale} onBack={closeMap} focusBack={openedByButton.current} />;

  return (
    <div className="v4PubBody" data-public-answer-first>
      {/* The own map's answer card (V4AnswerCard's look and parts): the answer, then how sure it is. */}
      <section className="v4AnswerCard v4PubAnswer" aria-label={t(catalog, "v4.answerCard.region")}>
        <div className="v4AnswerFold">
          <div className="v4AnswerInner">
            <div className="v4AnswerHead">
              <p className="v4Eyebrow">{t(catalog, "v4.panel.answerRoot")}</p>
              {props.reviewDoors === undefined ? null : (
                <button type="button" className="v4Link publicDetailsAction" onClick={props.reviewDoors.onDetails}>{t(publicCatalog, "public.overview.details")}</button>
              )}
            </div>
            <PublicAnswer debate={debate} map={map} catalog={catalog} storyCatalog={storyCatalog} storyLocale={storyLocale} locale={locale} />
            {words ? (
              <div className="v4AnswerSure">
                <V4TrustBar counts={map.counts} unchecked={map.unchecked} catalog={catalog} size="large" showCounts />
              </div>
            ) : map.confidence !== null && map.confidence.trim().length > 0 ? (
              // Without a published tree there is no bar: the storyteller's own plain sentence says how sure the answer is.
              <p className="v4AnswerNote" data-ai-generated="true" lang={storyLocale} dir="auto">{map.confidence}</p>
            ) : null}
            <Sides debate={debate} catalog={catalog} publicCatalog={publicCatalog} storyLocale={storyLocale}
              {...(props.reviewDoors === undefined ? {} : { onRead: props.reviewDoors.onRead })} />
            {map.open.length > 0 ? (
              <ul className="v4PubOpenList v4PubRootOpen">
                {map.open.map((question) => <OpenLine key={question.id} question={question} catalog={catalog} storyLocale={storyLocale} />)}
              </ul>
            ) : null}
          </div>
        </div>
      </section>

      {map.paths.length > 0 ? (
        <section className="v4PubPaths" aria-labelledby="public-paths-title">
          <div className="v4PubPathsHead">
            <h2 id="public-paths-title" className="v4PubHeading">{t(catalog, "v4.map.colPaths")}</h2>
            <button type="button" ref={exploreButton} className="v4Btn v4PubExplore" onClick={openMap} data-public-explore>
              {t(catalog, "v4.public.exploreMap")}
            </button>
          </div>
          <ul className="v4PubRows">
            {map.paths.map((path) => (
              <PathRow
                key={path.id}
                path={path}
                view={views.get(path.id)}
                open={openRows.has(path.id)}
                onToggle={() => toggleRow(path.id)}
                words={words}
                props={props}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {/* Debate shape P2c: what came up but was not debated, in the question's language. */}
      <AlsoRaisedList view={debate.map_view} catalog={storyCatalog} locale={storyLocale} />

      <V4PublicReports debate={debate} catalog={catalog} locale={locale} />
    </div>
  );
}

/**
 * public-f4 (owner review, 3 Nov): what the public page's top bar holds. On a computer its links sit in the bar itself; on a phone (CSS, below
 * 768 px) they fold into the bar's menu, opened with "Menu". The form a link opens is a sheet from the bottom there, so it is never cut by the menu.
 */
export function V4PublicTopMenu({ catalog, children }: Readonly<{ catalog: MessageCatalog; children: ReactNode }>) {
  const [open, setOpen] = useState(false);
  const itemsId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  // RC-1 (the checks of the last fixes, 4 Nov): the open box opens toward the room from wherever the header put the Menu
  // button (the start of its second row, or beside the brand near the end side), so it stays on screen at every phone width.
  const side = useOpenSide(button, open);
  // ACCESS-12 (the wave-2 checks, 4 Nov): like any menu (the header's level menu), it also closes on a click outside it
  // and when keyboard focus moves out of it. A blur with no new target is left to the click (Safari blurs without
  // focusing what is clicked).
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent): void => {
      if (root.current !== null && event.target instanceof Node && !root.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  const onBlur = (event: FocusEvent<HTMLDivElement>): void => {
    const next = event.relatedTarget;
    // The second browser check (4 Nov): a click on plain text gives focus to the page's <main> (it can take focus for the
    // skip link), which holds the menu: that is a click, left to the mousedown rule, not focus moving out by the keyboard.
    if (open && next instanceof Node && root.current !== null && !root.current.contains(next) && !next.contains(root.current)) setOpen(false);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    // A form inside closes first on Escape (it says so with preventDefault); the menu closes on the next one.
    if (event.key !== "Escape" || !open || event.defaultPrevented) return;
    event.preventDefault();
    setOpen(false);
    button.current?.focus();
  };
  return (
    <div ref={root} className="v4PubTopMenu" data-open={open ? "true" : "false"} data-side={side} onKeyDown={onKeyDown} onBlur={onBlur}
      data-public-top-menu>
      <button
        type="button"
        ref={button}
        className="v4Btn v4PubTopMenuButton"
        aria-expanded={open}
        aria-controls={itemsId}
        onClick={() => setOpen((value) => !value)}
      >
        {t(catalog, "v4.public.menu")} <span aria-hidden="true">▾</span>
      </button>
      <div className="v4PubTopMenuItems" id={itemsId}>{children}</div>
    </div>
  );
}
