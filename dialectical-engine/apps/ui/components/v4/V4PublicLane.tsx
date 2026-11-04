"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { WEB_CONTRACT_LIMITS, type DigSuggestion, type PublicDebate, type PublicReportVersion } from "@debateai/contract";
import { V4DigStartingLine } from "@/components/v4/V4DigUndo";
import { PublicDigCard, PublicDigChips, PublicDigModes, V4PublicDigNotes } from "@/components/v4/V4PublicDig";
import { FinishedReportBody } from "@/components/v4/V4ReportClient";
import { V4WaitCard } from "@/components/v4/V4WaitCard";
import {
  DIG_RETURN_PARAM, DIG_RETURN_UNDER_PARAM, publicDigReturnPath, signInHrefs, usePublicSignedIn
} from "@/components/v4/V4PublicSession";
import { formatDate, t, type MessageCatalog } from "@/lib/i18n/translate";
import { digTargetQuestions } from "@/lib/v4/askText";
import { effectiveDigMode } from "@/lib/v4/askConfig";
import { addDig, DIG_UNDO_MS, dismissDig, readDigUndo, undoDig, useDigUndo, type DigUndoResult } from "@/lib/v4/digUndo";
import { firstByOf } from "@/lib/v4/mapLooks";
import { sharePeriodOf, type MoneyLine } from "@/lib/v4/money";
import {
  publicDigAnchor, publicDigParentKey, publicDigShareLine, publicPathAnchor, publicSuggestionsFor, rememberPublicDig, usePublicDigsStarted,
  waitingPublicDig, type PublicDigSuggestion
} from "@/lib/v4/publicDig";
import {
  contributorName, pressPublicReport, publicDigAsk, reportsNewestFirst, type PublicAddition, type PublicPathView, type PublicReportPress
} from "@/lib/v4/publicPage";
import { publicReportWriting, reportShown } from "@/lib/v4/publicReport";
import { useWaitPolling } from "@/lib/v4/useWaitPolling";
import { contractClient } from "@/lib/api";
import { levelHref, useReadingLevel } from "@/lib/v4/storage";
import { picksMax } from "@/lib/v4/suggestions";
import type { DigMode, PendingDig, ReadingLevel } from "@/lib/v4/types";
import { useV4Ask, type V4AskOutcome } from "@/lib/v4/useV4Ask";

/*
 * Decisions 13, 16 and 22 of 31 Oct on a public page. Under each path: who added to it and when, the digs on it with their own paths, and "Dig into this";
 * the Reports section, with "Write a report". A signed-in stranger digs and writes on their own quota. The dig goes through the one ask hook (consent, room,
 * refusals), so the page starts nothing another way. English for R22 (owner N10), like V4's other labels.
 * Owner screen review (3 Nov): the map's dig flow (public-f11, dig-f25): Quick look, with Thorough on paid plans; the share before the press when the room read
 * says one; the site's one 10-second Undo, during which nothing is sent or used (lib/v4/digUndo.ts). After it the person stays on the page, with a card under
 * the path (public-d2 A, V4PublicDig.tsx); the box starts with the path's own suggestions as chips when the public read carries them; "This will be public."
 * under the person's own words (journey-f20).
 */

/**
 * public-f9 (owner review, 3 Nov): while a report is written the page checks for it often at first, then less often, and not
 * at all while the tab is hidden (one check at once when it is shown again). Each step: until this long after the press,
 * check this often.
 */
const REPORT_CHECK_STEPS: ReadonlyArray<Readonly<{ untilMs: number; everyMs: number }>> = Object.freeze([
  { untilMs: 2 * 60_000, everyMs: 15_000 },
  { untilMs: 5 * 60_000, everyMs: 30_000 },
  { untilMs: Number.POSITIVE_INFINITY, everyMs: 60_000 }
]);
/** public-f9 (the record's own number): after 10 minutes the checks stop, and the card says it is taking longer than usual, with "Check again". */
const REPORT_CHECKS_STOP_MINUTES = 10;
/** While the tab is hidden the checks pause: the next one comes when the tab is shown again (useWaitPolling checks at once then). */
const REPORT_HIDDEN_PAUSE_MS = 24 * 60 * 60_000;
/**
 * A check this soon after the last read reads nothing: when the checks slow down, useWaitPolling starts afresh with a check at once, which would read the
 * debate twice in a row.
 */
const REPORT_READ_GAP_MS = 1_000;
/** The Reports section's place on the page: where "Write a report" brings a visitor back to after signing in. */
const REPORTS_ANCHOR = "public-reports";

export type V4PublicLaneConfig = Readonly<{
  catalog: MessageCatalog;
  homeCatalog: MessageCatalog | undefined;
  newDebateCatalog: MessageCatalog | undefined;
  locale: string;
  crisisCountryHint: string | null;
}>;

/** A press that could not be put in its 10 seconds: nothing was built to send (the plain line). */
type DigRefused = Readonly<{ kind: "REFUSED"; message: string }>;

/** What one press of "Start the dig" names: the chips tapped, the person's own views, and the mode. */
type DigPress = Readonly<{ chips: readonly DigSuggestion[]; views: readonly string[]; mode: DigMode }>;

type LaneActions = Readonly<{
  /** null while the session read has not answered: the places are held, nothing is offered yet. */
  signedIn: boolean | null;
  /** This page's address, with the way back to one path's dig box (public-f13); null: the page itself. */
  returnPath(path: PublicPathView | null): string;
  planTier: "free" | "premium";
  busy: boolean;
  publicRef: string;
  /** The reading level the person chose, for the links to a dig's own page. */
  level: ReadingLevel | null;
  /** public-f11: the share line before the press, when the room read says one for a dig (not yet on a public page). */
  share: MoneyLine | null;
  /** public-d2: the path's own suggestions, when the public read carries them. */
  suggestionsFor(path: PublicPathView): readonly PublicDigSuggestion[];
  /** Puts the dig in its 10-second Undo (the site's one list): its id there, or why nothing could be sent. */
  startDig(path: PublicPathView, press: DigPress): number | DigRefused;
  writeReport(): Promise<PublicReportPress>;
}>;

const LaneContext = createContext<LaneActions | null>(null);

/** public-f23: who made each dig on the page, by the dig's reference, so a deeper level can say "From Quiet Heron's dig". */
const DigMakersContext = createContext<ReadonlyMap<string, string | null>>(new Map());

function SignedInActions({ debate, lane, returnPath, children }: Readonly<{
  debate: PublicDebate; lane: V4PublicLaneConfig; returnPath: LaneActions["returnPath"]; children: ReactNode;
}>) {
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
  // The send runs after the 10 seconds, perhaps once the person has left this page: it uses the hook's last submit, which
  // reads everything through refs (as the map's digs do).
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  });
  const share = useMemo(() => publicDigShareLine(room, planTier), [room, planTier]);
  const publicRef = debate.public_ref;
  const question = debate.question;
  const startDig = useCallback((path: PublicPathView, press: DigPress): number | DigRefused => {
    const failed: DigRefused = { kind: "REFUSED", message: t(catalog, "v4.dig.failed") };
    // One waiting dig per box: a second press while it waits is the same dig.
    const waiting = waitingPublicDig(readDigUndo(), publicRef, path);
    if (waiting !== null) return waiting.id;
    // Owner N13: Free has no Thorough; its digs are quick looks.
    const mode = effectiveDigMode(press.mode, planTier);
    const sent = publicDigAsk({ publicRef, question, path, views: press.views, chips: press.chips, mode, catalog, locale });
    if (sent === null) return failed;
    const before = path.line;
    const first = digTargetQuestions(sent.target)[0] ?? "";
    const firstIsAi = firstByOf(sent.target) === "AI";
    const send = async (dig: PendingDig): Promise<DigUndoResult> => {
      let outcome: V4AskOutcome;
      try {
        // ASK-4: a dig carries AI-written text around the person's views; the hook reads the views for crisis words itself.
        outcome = await submitRef.current(sent.questionLine, dig.mode, "dig", sent.parent);
      } catch {
        return { kind: "REFUSED", message: t(catalog, "v4.dig.failed") };
      }
      if (outcome.kind === "REFUSED") return { kind: "REFUSED", message: outcome.message };
      if (outcome.kind !== "STARTED") return { kind: "STOPPED" };
      const startedAt = new Date().toISOString();
      // public-d2 A: the person stays on the page; the card under the path is kept for this visit (memory only).
      rememberPublicDig({ childRunId: outcome.runId, publicRef, pathRef: path.ref, digRef: path.digRef, startedAt,
        notJoined: outcome.notJoined === true, before, first, firstIsAi });
      return { kind: "STARTED", childRunId: outcome.runId, startedAt };
    };
    const sharePeriod = sharePeriodOf(room);
    return addDig({
      parentRunId: publicDigParentKey(publicRef, path.digRef),
      runIds: [],
      dig: { target: sent.target, mode, sendsAt: Date.now() + DIG_UNDO_MS },
      // dig-f8 / public-f14: the site's one note repeats the share, of its own window (Free's month, lib/v4/money.ts
      // sharePeriodOf), as the map's digs do.
      sharePercent: share === null ? null : Number(share.values.percent),
      ...(sharePeriod === "PERSON_DAY" ? {} : { sharePeriod }),
      period: sharePeriod === "PERSON_MONTH" ? "month" : "today",
      showMode: planTier !== "free",
      publicRef,
      send,
      failedLine: t(catalog, "v4.dig.failed")
    });
  }, [publicRef, question, catalog, locale, planTier, share, room]);
  const writeReport = useCallback(() => pressPublicReport(debate.public_ref, { catalog, room, locale }), [debate.public_ref, catalog, room, locale]);
  const suggestionsFor = useCallback((path: PublicPathView) => publicSuggestionsFor(debate, path), [debate]);
  const actions = useMemo<LaneActions>(() => ({
    signedIn: true, returnPath, planTier, busy: submitting, publicRef, level: savedLevel, share, suggestionsFor, startDig, writeReport
  }), [returnPath, planTier, submitting, publicRef, savedLevel, share, suggestionsFor, startDig, writeReport]);
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
    signedIn, returnPath, planTier: "free", busy: false, publicRef: debate.public_ref, level: null, share: null, suggestionsFor: () => [],
    startDig: () => ({ kind: "REFUSED", message: "" }), writeReport: async () => ({ kind: "REFUSED", message: "" })
  }), [signedIn, returnPath, debate.public_ref]);
  return (
    <DigMakersContext.Provider value={makers}>
      {signedIn === true
        ? <SignedInActions debate={debate} lane={lane} returnPath={returnPath}>{children}</SignedInActions>
        : <LaneContext.Provider value={quiet}>{children}</LaneContext.Provider>}
      {/* journey-f21 / dig-f25: a dig pressed here keeps the site's one Undo note, bottom-left, as on the V4 pages. */}
      <V4PublicDigNotes catalog={lane.catalog} locale={lane.locale} />
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

/** Where focus goes once the box has drawn: a view's field, the open button, or the box's first control (back from sign-in). */
type FocusTarget = Readonly<{ kind: "FIELD"; id: number }> | Readonly<{ kind: "OPEN_BUTTON" }> | Readonly<{ kind: "FIRST"; scroll: boolean }>;

/**
 * "Dig into this": the path's own suggestions as chips (when the page has them), the person's own views, up to what their
 * plan combines, on their own quota. Start puts the dig in the site's one 10-second Undo; nothing is sent before it ends.
 */
function DigBox({ path, catalog, locale }: Readonly<{ path: PublicPathView; catalog: MessageCatalog; locale: string }>) {
  const actions = useContext(LaneContext);
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState<readonly ViewBox[]>([{ id: 0, text: "" }]);
  const [chosen, setChosen] = useState<readonly DigSuggestion[]>([]);
  // public-d2: with chips, "Or write your own" is folded until tapped.
  const [writing, setWriting] = useState(false);
  const [mode, setMode] = useState<DigMode>("quick");
  const nextView = useRef(1);
  const [refusal, setRefusal] = useState<string | null>(null);
  // The dig this box put in its 10 seconds, until it started, was refused or was undone.
  const [pendingId, setPendingId] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const firstChip = useRef<HTMLButtonElement | null>(null);
  const fields = useRef(new Map<number, HTMLTextAreaElement>());
  const focusNext = useRef<FocusTarget | null>(null);
  const signedIn = actions?.signedIn ?? null;
  const publicRef = actions?.publicRef ?? "";
  const entries = useDigUndo();
  const startedDigs = usePublicDigsStarted(publicRef, path);
  const returned = useRef(false);
  useEffect(() => {
    // Once, when the session is known: the address keeps naming this box, so a reload lands here again, and nothing else is kept.
    if (returned.current || signedIn !== true) return;
    returned.current = true;
    if (!addressOpensDig(path)) return;
    focusNext.current = { kind: "FIRST", scroll: true };
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
    const field = target.kind === "FIELD" ? fields.current.get(target.id) : firstChip.current ?? fields.current.get(views[0]!.id);
    if (field === undefined || field === null) return;
    focusNext.current = null;
    const scroll = target.kind === "FIRST" && target.scroll;
    if (scroll) box.current?.scrollIntoView?.({ block: "center" });
    field.focus({ preventScroll: scroll });
  });
  // What became of the dig this box sent: started (the box closes; the card under the path takes over), refused (the box
  // stays with the person's words and says why here, so the site's note steps back), or undone (the box is as it was).
  const pending = pendingId === null ? null : entries.find((entry) => entry.id === pendingId) ?? null;
  const phase = pending?.phase ?? null;
  useEffect(() => {
    if (pendingId === null) return;
    if (phase === "STARTED") {
      setPendingId(null);
      setViews([{ id: nextView.current, text: "" }]);
      nextView.current += 1;
      setChosen([]);
      setWriting(false);
      // Focus that was in the box (or got lost with it) goes to "Dig into this"; focus the person took elsewhere stays there.
      const active = document.activeElement;
      if (active === null || active === document.body || (box.current?.contains(active) ?? false)) focusNext.current = { kind: "OPEN_BUTTON" };
      setOpen(false);
    } else if (phase === "REFUSED") {
      const result = pending?.result;
      setRefusal(result?.kind === "REFUSED" ? result.message : t(catalog, "v4.dig.failed"));
      dismissDig(pendingId);
      setPendingId(null);
    } else if (phase === null || phase === "CANCELLED") {
      setPendingId(null);
    }
  }, [pendingId, phase, pending, catalog]);
  if (actions === null) return null;
  if (actions.signedIn === null) return <HeldPlace label={t(catalog, "v4.public.dig.open")} />;
  if (!actions.signedIn) return <SignInChoice lead="v4.public.signedOut.dig" returnPath={actions.returnPath(path)} catalog={catalog} />;
  const cards = startedDigs.map((dig) => (
    <PublicDigCard key={dig.childRunId} dig={dig} catalog={catalog} locale={locale}
      openHref={levelHref(`/v4/debate/${encodeURIComponent(dig.childRunId)}`, actions.level)} />
  ));
  if (!open) {
    return (
      <>
        {cards}
        <button type="button" ref={openButton} className="v4Btn v4PubAction" onClick={() => { focusNext.current = { kind: "FIRST", scroll: false }; setOpen(true); }}>
          {t(catalog, "v4.public.dig.open")}
        </button>
      </>
    );
  }
  const chips = actions.suggestionsFor(path);
  const waiting = waitingPublicDig(entries, publicRef, path);
  const locked = waiting !== null;
  const showViews = chips.length === 0 || writing;
  const written = views.filter((view) => view.text.trim().length > 0).length;
  const picked = chosen.length + (showViews ? written : 0);
  const max = picksMax(actions.planTier);
  const full = chosen.length + (showViews ? views.length : 0) >= max;
  const start = (): void => {
    if (locked) return;
    setRefusal(null);
    const outcome = actions.startDig(path, { chips: chosen, views: showViews ? views.map((view) => view.text) : [], mode });
    if (typeof outcome === "number") setPendingId(outcome);
    else setRefusal(outcome.message);
  };
  const toggleChip = (suggestion: DigSuggestion): void => {
    setRefusal(null);
    setChosen(chosen.some((one) => one.suggestion_id === suggestion.suggestion_id)
      ? chosen.filter((one) => one.suggestion_id !== suggestion.suggestion_id)
      : [...chosen, suggestion]);
  };
  const add = (): void => {
    const id = nextView.current;
    nextView.current += 1;
    focusNext.current = { kind: "FIELD", id };
    setViews([...views, { id, text: "" }]);
  };
  // public-f12: an extra box can be taken out again; focus goes to the box before it.
  const remove = (at: number): void => {
    focusNext.current = { kind: "FIELD", id: views[at - 1]!.id };
    setViews(views.filter((_, where) => where !== at));
  };
  const close = (): void => {
    focusNext.current = { kind: "OPEN_BUTTON" };
    setOpen(false);
  };
  return (
    <>
      {cards}
      <div className="v4PubDig" ref={box}>
        {/* r2-16: the two facts that matter, with the rest folded under "How this works". */}
        <p className="v4PubHint">{t(catalog, "v4.public.dig.terms")}</p>
        <details className="v4PubHow">
          <summary>{t(catalog, "v4.public.dig.howItWorks")}</summary>
          <p className="v4PubHint">{t(catalog, "v4.public.dig.termsMore")}</p>
        </details>
        {chips.length === 0 ? null : (
          <PublicDigChips chips={chips} chosen={new Set(chosen.map((one) => one.suggestion_id))} full={full} onToggle={toggleChip} locked={locked}
            pathAnchor={publicPathAnchor(path)} catalog={catalog} locale={locale} firstRef={(element) => { firstChip.current = element; }} />
        )}
        {chips.length > 0 && !writing ? (
          <button type="button" className="v4Link v4PubWriteOwn" disabled={locked}
            onClick={() => { focusNext.current = { kind: "FIELD", id: views[0]!.id }; setWriting(true); }}>
            {t(catalog, "v4.public.dig.writeOwn")}
          </button>
        ) : null}
        {showViews ? views.map((view, at) => {
          const fieldId = `${ids}-${view.id}`;
          return (
            <div key={view.id} className="v4PubDigField">
              <div className="v4PubDigFieldHead">
                <label className="v4PubLabel" id={`${fieldId}-label`} htmlFor={fieldId}>
                  {at === 0 ? t(catalog, "v4.suggest.ownViewLabel") : t(catalog, "v4.public.dig.viewLabel", { number: at + 1 })}
                </label>
                {at === 0 ? null : (
                  <button type="button" className="v4Link v4PubRemove" aria-describedby={`${fieldId}-label`} disabled={actions.busy || locked} onClick={() => remove(at)}>
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
                readOnly={locked}
                aria-describedby={`${ids}-public`}
                maxLength={WEB_CONTRACT_LIMITS.pickTextMaxChars}
                onChange={(event) => setViews(views.map((other) => (other.id === view.id ? { ...other, text: event.target.value } : other)))}
              />
            </div>
          );
        }) : null}
        {/* journey-f20: before anything the person typed becomes public, one grey line. */}
        {showViews ? <p className="v4PubHint" id={`${ids}-public`} data-public-will-be>{t(catalog, "v4.publicMark.willBePublic")}</p> : null}
        {showViews && !full && !locked ? (
          <button type="button" className="v4Link v4PubAddView" onClick={add}>{t(catalog, "v4.public.dig.addView")}</button>
        ) : full ? <p className="v4PubHint">{t(catalog, "v4.public.dig.viewsFull")}</p> : null}
        {/* public-f11: Quick look by default, Thorough beside it on paid plans; Free's digs are quick looks with no mode word. */}
        {actions.planTier === "premium" ? <PublicDigModes mode={mode} onMode={(next) => { if (!locked) setMode(next); }} catalog={catalog} /> : null}
        {actions.share === null ? null : <p className="v4PubHint" data-public-dig-share>{t(catalog, actions.share.key, actions.share.values)}</p>}
        <div className="v4PubDigActions">
          <button type="button" className="v4Btn v4BtnPrimary" disabled={picked === 0 || (actions.busy && !locked)}
            aria-disabled={locked ? "true" : undefined} onClick={start}>
            {t(catalog, "v4.public.dig.start")}
          </button>
          <button type="button" className="v4Link" disabled={actions.busy || locked} onClick={close}>{t(catalog, "v4.public.dig.cancel")}</button>
        </div>
        {/* dig-f8: while it waits, the box says so, with the same Undo as the note. */}
        {waiting === null ? null : <V4DigStartingLine entry={waiting} onUndo={(id) => void undoDig(id)} catalog={catalog} />}
        {refusal === null ? null : <p className="v4AskRefusal" role="alert">{refusal}</p>}
      </div>
    </>
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
    <div className="v4Root v4PublicLane v4PubPathNote" id={publicPathAnchor(path)} tabIndex={-1}>
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
      {actions && path.canDig ? <DigBox path={path} catalog={catalog} locale={locale} /> : null}
      {path.digs.map((dig, at) => (dig.paths.length === 0 ? null : (
        <div key={dig.ref ?? at} className={depth === 0 ? "v4PubDigPaths" : "v4PubDigPaths v4PubDigPathsDeeper"}
          {...(dig.ref === null ? {} : { id: publicDigAnchor(dig.ref), tabIndex: -1 })}>
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

/**
 * public-f9: what "Write a report" came to on this page. PRESSING: the button says it is starting. WRITING: the card at the top of Reports, from this tab's
 * press (`mine`) or, after a reload or on another device, from the server's optional `report_writing` (lib/v4/publicReport.ts). READY: the new version
 * arrived (the "ready" line, once). FAILED: the server said the version could not be written.
 */
type ReportPressState =
  | Readonly<{ kind: "IDLE" }>
  | Readonly<{ kind: "PRESSING" }>
  | Readonly<{ kind: "REFUSED"; message: string }>
  | Readonly<{ kind: "WRITING"; version: number; startedAt: string; mine: boolean }>
  | Readonly<{ kind: "READY"; version: number; mine: boolean }>
  | Readonly<{ kind: "FAILED"; version: number }>;

/** How often to check, this long after the start (REPORT_CHECK_STEPS). */
function reportCheckEvery(elapsedMs: number): number {
  return (REPORT_CHECK_STEPS.find((step) => elapsedMs < step.untilMs) ?? REPORT_CHECK_STEPS[REPORT_CHECK_STEPS.length - 1]!).everyMs;
}

/**
 * The card at the top of Reports while a report is written (journey-d2's one waiting card): "Being written", "Started 14:02", "You can leave this page. It
 * keeps going.". The checks slow down and pause in a hidden tab; once the new version is there the page reads itself again. After 10 minutes they stop:
 * "taking longer than usual" with "Check again". Nothing is kept in the browser: a reload knows of the report only from the server.
 */
function ReportWriting({ debate, version, startedAt, catalog, locale, onSettled }: Readonly<{
  debate: PublicDebate; version: number; startedAt: string; catalog: MessageCatalog; locale: string; onSettled: (state: "READY" | "FAILED") => void;
}>) {
  const router = useRouter();
  const startedMs = Date.parse(startedAt);
  const stopAt = startedMs + REPORT_CHECKS_STOP_MINUTES * 60_000;
  // When the checks stopped: always past the ten minutes, so the card's "taking longer than usual" shows from then on.
  const stopNow = useCallback((): number => Math.max(Date.now(), stopAt + 1), [stopAt]);
  const [stoppedAt, setStoppedAt] = useState<number | null>(() => (Date.now() >= stopAt ? Math.max(Date.now(), stopAt + 1) : null));
  const [step, setStep] = useState(() => reportCheckEvery(Date.now() - startedMs));
  const settled = useRef(false);
  const lastRead = useRef(Number.NEGATIVE_INFINITY);
  const settle = useCallback((state: "READY" | "FAILED") => {
    if (settled.current) return;
    settled.current = true;
    if (state === "READY") router.refresh();
    onSettled(state);
  }, [router, onSettled]);
  // The page's own read already shows it (a refresh that came first): ready.
  useEffect(() => {
    if (reportShown(debate, version)) settle("READY");
  }, [debate, version, settle]);
  const check = useCallback(async (stillWanted: () => boolean): Promise<"AGAIN" | "DONE"> => {
    if (Date.now() - lastRead.current < REPORT_READ_GAP_MS) return "AGAIN";
    lastRead.current = Date.now();
    const fresh = await contractClient.readPublicDebate(debate.public_ref);
    if (!stillWanted()) return "DONE";
    if (reportShown(fresh, version)) { settle("READY"); return "DONE"; }
    const writing = publicReportWriting(fresh);
    // Only this version's failure counts: an earlier one that failed says nothing about it.
    if (writing?.state === "FAILED" && writing.report_version === version) { settle("FAILED"); return "DONE"; }
    if (Date.now() >= stopAt) { setStoppedAt(stopNow()); return "DONE"; }
    setStep(reportCheckEvery(Date.now() - startedMs));
    return "AGAIN";
  }, [debate.public_ref, version, settle, startedMs, stopAt, stopNow]);
  const polling = useWaitPolling(check, { everyMs: step, hiddenEveryMs: REPORT_HIDDEN_PAUSE_MS, enabled: stoppedAt === null });
  useEffect(() => {
    // The checks stop at 10 minutes even when none answers just then.
    if (stoppedAt !== null) return;
    const timer = window.setTimeout(() => setStoppedAt(stopNow()), Math.max(0, stopAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [stoppedAt, stopAt, stopNow]);
  const [checking, setChecking] = useState(false);
  const checkAgain = async (): Promise<void> => {
    setChecking(true);
    try {
      if (await check(() => true) === "AGAIN") setStoppedAt(stopNow());
    } catch {
      setStoppedAt(stopNow());
    } finally {
      setChecking(false);
    }
  };
  return (
    <div className="v4PubReportCard" data-public-report-writing>
      <V4WaitCard
        state={{ kind: "BEING_WRITTEN" }}
        variant="inline"
        headingLevel={3}
        startedAt={startedAt}
        checkedAt={stoppedAt ?? polling.checkedAt}
        reconnecting={stoppedAt === null && polling.reconnecting}
        onTryNow={polling.tryNow}
        // The record's own number (public-f9: "After 10 minutes the card says it is taking longer than usual"), not a guessed time.
        usualTopMinutes={REPORT_CHECKS_STOP_MINUTES}
        longerAction={stoppedAt === null ? null : (
          <button type="button" className="v4Btn" disabled={checking} aria-busy={checking} onClick={() => void checkAgain()} data-public-report-check>
            {t(catalog, "v4.investigation.checkAgain")}
          </button>
        )}
        catalog={catalog}
        locale={locale}
      />
    </div>
  );
}

/** Where "Write a report" stands on this page, and the press: the card's state (top of Reports) and the button's (bottom). */
function useReportPress(debate: PublicDebate): Readonly<{ state: ReportPressState; press: () => Promise<void>; settle: (state: "READY" | "FAILED") => void }> {
  const actions = useContext(LaneContext);
  const [state, setState] = useState<ReportPressState>(() => {
    // After a reload or on another device: only the server can say a report is being written (its optional `report_writing`).
    const writing = publicReportWriting(debate);
    if (writing === null || reportShown(debate, writing.report_version)) return { kind: "IDLE" };
    if (writing.state === "FAILED") return { kind: "FAILED", version: writing.report_version };
    return { kind: "WRITING", version: writing.report_version, startedAt: writing.started_at, mine: false };
  });
  const press = useCallback(async (): Promise<void> => {
    if (actions === null) return;
    setState({ kind: "PRESSING" });
    const answer: PublicReportPress = await actions.writeReport();
    setState(answer.kind === "WRITING" ? { kind: "WRITING", version: answer.version, startedAt: new Date().toISOString(), mine: true } : answer);
  }, [actions]);
  const settle = useCallback((next: "READY" | "FAILED") => {
    setState((before) => {
      if (before.kind !== "WRITING") return before;
      return next === "READY" ? { kind: "READY", version: before.version, mine: before.mine } : { kind: "FAILED", version: before.version };
    });
  }, []);
  return { state, press, settle };
}

/**
 * The press itself: the terms and "Write a report" (it says it is starting while the press is sent; after a failed report it offers to write it again),
 * or the signed-out choice. While a report is written the card at the top says so, and the button waits for it.
 */
function ReportButton({ state, press, catalog }: Readonly<{ state: ReportPressState; press: () => Promise<void>; catalog: MessageCatalog }>) {
  const actions = useContext(LaneContext);
  if (actions === null) return null;
  if (actions.signedIn === null) return <HeldPlace label={t(catalog, "v4.public.report.write")} />;
  if (!actions.signedIn) {
    return <SignInChoice lead="v4.public.signedOut.report" returnPath={`${actions.returnPath(null)}#${REPORTS_ANCHOR}`} catalog={catalog} />;
  }
  if (state.kind === "WRITING") return null;
  const pressing = state.kind === "PRESSING";
  const label = pressing ? "v4.ask.starting" : state.kind === "FAILED" ? "v4.investigation.writeAgain" : "v4.public.report.write";
  return (
    <div className="v4PubReportPress">
      <p className="v4PubHint">{t(catalog, "v4.public.report.terms")}</p>
      <button type="button" className="v4Btn" disabled={pressing} aria-busy={pressing} onClick={() => void press()} data-public-report-press>
        {t(catalog, label)}
      </button>
      {state.kind === "REFUSED" ? <p className="v4AskRefusal" role="alert">{state.message}</p> : null}
    </div>
  );
}

/** Reports: every version anyone wrote, newest first; the earlier ones stay readable, one click away. */
export function V4PublicReports({ debate, catalog, locale }: Readonly<{ debate: PublicDebate; catalog: MessageCatalog; locale: string }>) {
  const actions = useContext(LaneContext);
  const press = useReportPress(debate);
  const [current, ...earlier] = reportsNewestFirst(debate.reports);
  // A page with no way to press (a publication review) and nothing written has no section.
  if (current === undefined && actions === null) return null;
  const { state } = press;
  // public-f9: the "ready" line. Its status region is always there, so the line is read out once when it appears; it shows at once with the shared
  // 1-second soft highlight. Someone else's report (known only from the server) is not called "yours".
  const ready = state.kind === "READY" ? t(catalog, state.mine ? "v4.ready.report" : "v4.public.report.ready") : "";
  return (
    <section id={REPORTS_ANCHOR} className="v4Root v4PublicLane v4PubReports" aria-labelledby="public-reports-title">
      <h2 id="public-reports-title" className="v4PubHeading">{t(catalog, "v4.public.reports")}</h2>
      {state.kind === "WRITING" ? (
        <ReportWriting debate={debate} version={state.version} startedAt={state.startedAt} catalog={catalog} locale={locale} onSettled={press.settle} />
      ) : null}
      <p className={`v4PubReady${ready === "" ? "" : " v4Highlight"}`} role="status" data-public-report-ready>{ready}</p>
      {state.kind === "FAILED" ? (
        <p className="v4PubReportFailed" role="alert" data-public-report-failed>{t(catalog, "v4.investigation.failed")}</p>
      ) : null}
      {current === undefined ? null : <PublicReport report={current} catalog={catalog} locale={locale} />}
      {earlier.map((version) => (
        <details key={version.report_version} className="v4PubEarlier">
          <summary>{t(catalog, "v4.public.report.earlier", { version: version.report_version })}</summary>
          <PublicReport report={version} catalog={catalog} locale={locale} />
        </details>
      ))}
      <ReportButton state={state} press={press.press} catalog={catalog} />
    </section>
  );
}
