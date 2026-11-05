"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { StartStepRoom } from "@debateai/contract";
import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import type { MoneyLine } from "@/lib/v4/money";
import {
  PATH_PLAN_LIMITS, pathPlanReduce, type PathPlan, type PathPlanAction, type PathPlanRefusal, type PlanPath
} from "@/lib/v4/pathPlan";
import type { StartCardPhase, StartNoneLine, V4StartCardState } from "@/lib/v4/useStartPaths";
import { V4StartMore } from "./V4StartMore";
import { V4StartList, type StartPlanProps } from "./V4StartRow";
import { V4StartSuggest } from "./V4StartSuggest";
import { V4StartWays } from "./V4StartWays";

/*
 * V4 start step, Task 73 (read-d4, choose-d1, choose-f4, choose-f5, choose-f11, choose-f10, choose-f3, choose-f15, choose-f8,
 * choose-f7, choose-f16, choose-f2, chat-quota-word-on-choosing-card, read-d2; owner answers Q6 and Q8, and "Four per path"
 * A of 5 Nov; spec 2026-11-03 §2 items 2, 3 and 5 and "When the list is missing"): step 2's card "What we'll look into".
 *  - While the AIs read (CHECKING, LANGUAGE_CHOICE, READING, MERGING): one low paper band, like unmapped ground. The question
 *    is a small dot at its start edge, one small dot per AI lights up as it answers, the words sit in one polite status line,
 *    and places the size of a real row wait (How wide's number, Free 3; on a phone 3 and "and N more"). Only the places are
 *    dashed (answer Q6). At READY the band clears (the "clear" move) and the rows take the places; with fewer paths than
 *    places, the extra places go (choose-f22).
 *  - Why a list is missing, one line each (choose-f11, choose-f3); REFUSED and STALE say theirs. There is no out-of-date
 *    line and no "Read it again" anywhere (read-d2, answer Q8); after a site update, one line asks to combine or remove down
 *    to the new number, and it goes once the paths fit.
 *  - Notices, one at a time above the list (choose-f16), a newer one replacing the older: a combine written or not, a path
 *    moved to "+ N more" to make room, narrowing with its own Undo (choose-f8), and why a change was refused. One hidden
 *    live region says what changed: the list ready, late ideas, a combine with the paths and the share after it.
 *  - Undo and Ctrl/Cmd+Z on every change until Start; in a text box Ctrl/Cmd+Z is the text's own undo.
 *  - The person's own path (decision 2): crisis words open only the help screen; then the AI says where the words fit
 *    ("Add it there (no extra path) or make it its own path?"); a full list is never a dead end: add to a path, swap, or
 *    look wider with the share it costs (choose-f7; not on Free). The same words never go in twice (Task 33's rule).
 *  - The answered clarifying questions fold into one line once the person first acts on a path (read-d4 A): the card says
 *    when (`onPathsUsed`), the page folds them with V4StartAnswersFold.
 * Task 74 (choose-f18, choose-f6, choose-f7; spec §2 items 4 and 5): "Another way to see it" (V4StartWays) and the one-tap
 * suggestions (V4StartSuggest) above the paths, "+ N more to explore" (V4StartMore) under them. A new path from an idea or a
 * card on a full list gets the same choice as the person's own path (V4StartFullChoice: add to a path, swap, look wider).
 * "Make this my question" is sent from here with the line the check read at Next (the server compares that line), then the
 * page puts the card's question in the box. Every change goes through the hook's dispatch (the path plan model). Nothing here
 * fetches, stores or keeps anything in the browser.
 */

/** A share and its change, as Task 69's startShareChange gives it. */
export type StartShare = Readonly<{ percent: number; delta: number }>;

const WAITING: ReadonlySet<StartCardPhase> = new Set<StartCardPhase>(["CHECKING", "LANGUAGE_CHOICE", "READING", "MERGING"]);
type WaitingPhase = "CHECKING" | "LANGUAGE_CHOICE" | "READING" | "MERGING";
const PHASE_KEYS: Readonly<Record<WaitingPhase, string>> = Object.freeze({
  CHECKING: "v4.start.phase.CHECKING",
  LANGUAGE_CHOICE: "v4.start.phase.LANGUAGE_CHOICE",
  READING: "v4.start.phase.READING",
  MERGING: "v4.start.phase.MERGING"
});
const NONE_KEYS: Readonly<Record<StartNoneLine, string>> = Object.freeze({
  PASSING: "v4.start.none.PASSING",
  NOT_OFFERED: "v4.start.none.NOT_OFFERED",
  QUOTA: "v4.start.none.QUOTA",
  OFFLINE: "v4.start.none.OFFLINE",
  SIGNED_OUT: "v4.start.none.SIGNED_OUT",
  TOO_SLOW: "v4.start.none.TOO_SLOW"
});
const REFUSAL_KEYS: Readonly<Record<Exclude<PathPlanRefusal, "PATHS_FULL">, string>> = Object.freeze({
  VIEWPOINTS_FULL: "v4.start.refusal.VIEWPOINTS_FULL",
  OWN_WORDS_FULL: "v4.start.refusal.OWN_WORDS_FULL",
  EMPTY: "v4.start.refusal.EMPTY",
  TOO_LONG: "v4.start.refusal.TOO_LONG",
  LAST_PATH: "v4.start.refusal.LAST_PATH"
});
/** On a phone the band shows three places and says how many more (choose-d1). */
const NARROW_PLACES = 3;

/**
 * The missing-list line's key (choose-f11). QUOTA's is the line shown only when the page has no reset line to give
 * (`quotaLine` null); with one, the card shows the page's reset line, the same as step 1's.
 */
export function startNoneLineKey(line: StartNoneLine): string {
  return NONE_KEYS[line];
}

/** "Look wider" goes to How wide's next width up (choose-f7: 5 → 7); none at the widest, on Free or without widths. */
export function startWiderWidth(widths: StartStepRoom["widths"] | null, width: number, freePlan: boolean): number | null {
  if (freePlan || widths === null) return null;
  const wider = widths.options.filter((option) => option > width && option <= PATH_PLAN_LIMITS.pathsMax);
  return wider.length === 0 ? null : Math.min(...wider);
}

/** The most characters the refused words may have: a rewritten title 120, a rewritten question or the person's own words 1000. */
function tooLongMax(action: PathPlanAction | undefined): number {
  if (action?.type !== "REWRITE") return PATH_PLAN_LIMITS.ownTextMaxChars;
  return action.title !== undefined && action.title.trim().length > PATH_PLAN_LIMITS.titleMaxChars
    ? PATH_PLAN_LIMITS.titleMaxChars
    : PATH_PLAN_LIMITS.questionMaxChars;
}

/** What else a refusal's line may need: the refused action (TOO_LONG's limit), and look wider's share (PATHS_FULL). */
export type StartRefusalContext = Readonly<{ action?: PathPlanAction; wider?: StartShare | null }>;

/**
 * Why a change was refused, in one line (owner answer "Four per path" A, 5 Nov: a fifth of the person's own points; only the
 * technical bound says the path is full). A full list is never a dead end (choose-f7): add to a path or swap, and look wider
 * to the next width with its share when there is one (not on Free, not at the widest, not without a share).
 */
export function startRefusalLine(
  refusal: PathPlanRefusal, plan: PathPlan, widths: StartStepRoom["widths"] | null, catalog: MessageCatalog, context: StartRefusalContext = {}
): string {
  if (refusal === "PATHS_FULL") {
    if (plan.freePlan) return t(catalog, "v4.start.full.free", { count: PATH_PLAN_LIMITS.freePathsMax });
    const wider = startWiderWidth(widths, plan.width, false);
    const share = context.wider ?? null;
    if (wider !== null && share !== null) {
      return t(catalog, "v4.start.full.wider", { count: plan.paths.length, wider, percent: share.percent, delta: share.delta });
    }
    return t(catalog, "v4.start.full.widest", { count: plan.paths.length });
  }
  if (refusal === "TOO_LONG") return t(catalog, REFUSAL_KEYS.TOO_LONG, { count: tooLongMax(context.action) });
  return t(catalog, REFUSAL_KEYS[refusal]);
}

/** The paths that left the list for "+ N more" between two plans, in their list order. */
function movedToMore(before: PathPlan, after: PathPlan): readonly PlanPath[] {
  const onList = new Set(after.paths.map((path) => path.key));
  const inMore = new Set(after.more.map((path) => path.key));
  return before.paths.filter((path) => !onList.has(path.key) && inMore.has(path.key));
}

/** The person is typing: Ctrl/Cmd+Z there is the text's own undo. */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("input, textarea, select") !== null) return true;
  return target instanceof HTMLElement && target.isContentEditable;
}

/** The person's own words already on the list (Task 33: the same own words never reach Start twice). */
function holdsOwn(plan: PathPlan, words: string): boolean {
  return plan.paths.some((path) => path.viewpoints.some((viewpoint) => viewpoint.source.kind === "OWN" && viewpoint.question === words));
}

/** Where a new path goes on a full list: into a path on the list, or in the place of one (`swapWithKey`). */
export type StartFullTarget = Readonly<{ intoPathKey: string | null; swapWithKey?: string }>;

/**
 * A new path the full list refused (choose-f7: never a dead end), as Task 74's parts hand it to the full-list choice: the
 * action for a target, whether widening alone already put it on the list (an idea from "+ N more"), and what follows.
 */
export type StartFullRequest = Readonly<{
  make(target: StartFullTarget): PathPlanAction;
  listed?(plan: PathPlan): boolean;
  /** It is on the list (the choice goes). */
  onDone(): void;
  onCancel(): void;
}>;

/**
 * "Look wider": How wide one step up, then the new path in. Widening brings the next ideas from "+ N more" up to the new
 * width, so when that fills the list the new path takes the place of the last one widening added (the model's swap, which
 * sends it back to the front of more) and the list holds exactly the wider number. `action` is null when SET_WIDTH was
 * refused (`refusal`) or widening alone put it on the list.
 */
function lookWiderThen(
  plan: PathPlan, width: number, send: (action: PathPlanAction) => PathPlanRefusal | null, request: Pick<StartFullRequest, "make" | "listed">
): Readonly<{ action: PathPlanAction | null; refusal: PathPlanRefusal | null }> {
  const widened = pathPlanReduce(plan, { type: "SET_WIDTH", width });
  const refusal = send({ type: "SET_WIDTH", width });
  if (refusal !== null) return { action: null, refusal };
  if (request.listed?.(widened.plan) === true) return { action: null, refusal: null };
  const last = widened.added.at(-1);
  const full = widened.plan.paths.length >= widened.plan.width;
  const action = request.make({ intoPathKey: null, ...(full && last !== undefined ? { swapWithKey: last } : {}) });
  return { action, refusal: send(action) };
}

/**
 * The full list's buttons (choose-f7): "Add to a path…", "Swap for a path…", look wider with its share (not on Free, not at
 * the widest, not without a share) and Cancel; the first two then list the paths as "Path {n}: {title}" with Cancel.
 */
function V4StartFullButtons({ plan, catalog, widerWidth, wider, onInto, onSwap, onWider, onCancel }: Readonly<{
  plan: PathPlan;
  catalog: MessageCatalog;
  widerWidth: number | null;
  wider: StartShare | null;
  onInto(key: string): void;
  onSwap(key: string): void;
  onWider(): void;
  onCancel(): void;
}>) {
  const [pick, setPick] = useState<"NONE" | "ADD" | "SWAP">("NONE");
  const cancel = <button type="button" className="v4Btn" onClick={onCancel}>{t(catalog, "v4.start.full.cancel")}</button>;
  if (pick !== "NONE") {
    const choose = pick === "ADD" ? onInto : onSwap;
    return (
      <>
        {plan.paths.map((path, at) => (
          <button key={path.key} type="button" className="v4Btn v4StartOwnPick" onClick={() => choose(path.key)}>
            {t(catalog, "v4.start.full.path", { n: at + 1, title: path.title })}
          </button>
        ))}
        {cancel}
      </>
    );
  }
  return (
    <>
      <button type="button" className="v4Btn" onClick={() => setPick("ADD")}>{t(catalog, "v4.start.full.addTo")}</button>
      <button type="button" className="v4Btn" onClick={() => setPick("SWAP")}>{t(catalog, "v4.start.full.swap")}</button>
      {widerWidth !== null && wider !== null ? (
        <button type="button" className="v4Btn" onClick={onWider}>
          {t(catalog, "v4.start.lookWider", { wider: widerWidth, percent: wider.percent, delta: wider.delta })}
        </button>
      ) : null}
      {cancel}
    </>
  );
}

/**
 * Task 74: the full-list choice for an idea from "+ N more" or an "Another way to see it" card, the same as the person's own
 * path has (choose-f7): the full list's line, then add to a path, swap, or look wider. A refusal of the chosen way (a fifth of
 * the person's own points in that path, the technical bound) is said under it.
 */
export function V4StartFullChoice({ plan, widths, catalog, wider, send, request }: Readonly<{
  plan: PathPlan;
  widths: StartStepRoom["widths"] | null;
  catalog: MessageCatalog;
  wider: StartShare | null;
  send(action: PathPlanAction): PathPlanRefusal | null;
  request: StartFullRequest;
}>) {
  const [error, setError] = useState<string | null>(null);
  const planNow = useRef(plan);
  planNow.current = plan;
  const settle = (refusal: PathPlanRefusal | null, action: PathPlanAction): void => {
    if (refusal === null) {
      request.onDone();
      return;
    }
    setError(startRefusalLine(refusal, planNow.current, widths, catalog, { action, wider }));
  };
  const finish = (action: PathPlanAction): void => settle(send(action), action);
  const widerWidth = startWiderWidth(widths, plan.width, plan.freePlan);
  const lookWider = (): void => {
    if (widerWidth === null) return;
    const result = lookWiderThen(planNow.current, widerWidth, send, request);
    if (result.action !== null) settle(result.refusal, result.action);
    else if (result.refusal === null) request.onDone();
  };
  return (
    <div className="v4StartFull">
      <p className="v4StartFullLine" role="status">{startRefusalLine("PATHS_FULL", plan, widths, catalog, { wider })}</p>
      <div className="v4StartFullButtons">
        <V4StartFullButtons
          plan={plan}
          catalog={catalog}
          widerWidth={widerWidth}
          wider={wider}
          onInto={(key) => finish(request.make({ intoPathKey: key }))}
          onSwap={(key) => finish(request.make({ intoPathKey: null, swapWithKey: key }))}
          onWider={lookWider}
          onCancel={request.onCancel}
        />
      </div>
      {error === null ? null : <p className="v4StartFullError" role="status">{error}</p>}
    </div>
  );
}

/**
 * read-d4 A: the answered clarifying questions, folded into one line ("Your answers are in your question above. Show the
 * questions") once the person first acts on a path. The page wraps the answered ones in it; unanswered ones stay outside,
 * open. Folded, they stay on the page, hidden, so nothing in them is lost; "Show the questions" opens them again.
 */
export function V4StartAnswersFold({ folded, onShow, catalog, children }: Readonly<{
  folded: boolean;
  onShow(): void;
  catalog: MessageCatalog;
  children: ReactNode;
}>) {
  const box = useRef<HTMLDivElement>(null);
  const opened = useRef(false);
  useEffect(() => {
    if (folded || !opened.current) return;
    opened.current = false;
    box.current?.focus();
  }, [folded]);
  return (
    <>
      {folded ? (
        <p className="v4StartFold">
          {t(catalog, "v4.start.answersFolded")}{" "}
          <button type="button" className="v4Link v4StartFoldShow" onClick={() => { opened.current = true; onShow(); }}>
            {t(catalog, "v4.start.showQuestions")}
          </button>
        </p>
      ) : null}
      <div ref={box} className="v4StartFoldBox" tabIndex={-1} hidden={folded}>{children}</div>
    </>
  );
}

export type V4StartCardProps = Readonly<{
  start: V4StartCardState;
  widths: StartStepRoom["widths"] | null;
  /** The page's planIsFree (read-f3): an unknown plan is never Free. */
  freePlan: boolean;
  catalog: MessageCatalog;
  locale: string;
  /** The page's crisis check on the person's own words: true when it opened the help screen (then nothing is added). */
  offerIfCrisis(text: string): boolean;
  /**
   * Task 74's "Make this my question": called once the plan took the card's question (the card sends MAKE_MY_QUESTION with
   * the line the check read), so the page puts the card's question in the box.
   */
  onMakeMyQuestion(cardId: string): void;
  /** Clarifying questions are on screen (choose-f15: then the page says Free's line, not the card). */
  questionsShown: boolean;
  /** The page's reset line when the quota is used up (startsWaitLine, the same as step 1's). */
  quotaLine: MoneyLine | null;
  /** At most 600 px wide (choose-d1, choose-f6). */
  narrow: boolean;
  /** Look wider's share: the share at the next width up and its change (startShareChange(step, paths, wider)). */
  share: Readonly<{ wider: StartShare | null }>;
  /** read-d4 A: the person first acted on a path, once per card (the page folds the answered questions). */
  onPathsUsed?(): void;
}>;

/** One notice above the list; `undoAt`: its own Undo shows while the plan's Undo stack is this deep (narrowing's). */
type Notice = Readonly<{ text: string; undoAt: number | null }>;

export function V4StartCard(props: V4StartCardProps) {
  const { start, widths, freePlan, catalog, locale, narrow, share } = props;
  const { phase, plan } = start;
  const titleId = useId();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [spoken, setSpoken] = useState("");
  const listShown = plan !== null && (phase === "READY" || phase === "STALE");
  const planNow = useRef(plan);
  planNow.current = plan;
  /** The last change the card sent, with the plan it was sent on (so a change the hook made itself is never taken for it). */
  const sent = useRef<Readonly<{ type: PathPlanAction["type"]; from: PathPlan }> | null>(null);
  const used = useRef(false);
  const onPathsUsed = useRef(props.onPathsUsed);
  onPathsUsed.current = props.onPathsUsed;

  const send = (action: PathPlanAction): PathPlanRefusal | null => {
    if (!used.current) {
      used.current = true;
      onPathsUsed.current?.();
    }
    const previous = sent.current;
    if (planNow.current !== null) sent.current = { type: action.type, from: planNow.current };
    if (action.type === "UNDO") setNotice(null);
    const refusal = start.dispatch(action);
    // A refused change changed nothing: it is never taken for the next change (one the hook makes by itself).
    if (refusal !== null) sent.current = previous;
    return refusal;
  };
  const onRefusal = (refusal: PathPlanRefusal, action: PathPlanAction): void => {
    const current = planNow.current;
    if (current === null) return;
    const text = startRefusalLine(refusal, current, widths, catalog, { action, wider: share.wider });
    setNotice({ text, undoAt: null });
    setSpoken(text);
  };

  // What a change to the list says, one notice at a time (choose-f16).
  const planBefore = useRef(plan);
  useEffect(() => {
    const before = planBefore.current;
    planBefore.current = plan;
    const action = sent.current !== null && sent.current.from === before ? sent.current.type : null;
    sent.current = null;
    if (before === null || plan === null || before === plan) return;
    if (before.paths === plan.paths && before.more === plan.more && before.width === plan.width) return;
    if (action === "UNDO") return;
    if (plan.width < before.width) {
      const moved = movedToMore(before, plan);
      if (moved.length === 0) return;
      const text = moved.length === 1
        ? t(catalog, "v4.start.notice.narrowed.one", { title: moved[0]!.title })
        : tPlural(catalog, "v4.start.notice.narrowed", moved.length, locale);
      setNotice({ text, undoAt: plan.undo.length });
      setSpoken(text);
      return;
    }
    const madeRoom = action !== null && action !== "REMOVE" ? movedToMore(before, plan) : [];
    if (madeRoom.length > 0) {
      const text = madeRoom.length === 1
        ? t(catalog, "v4.start.notice.madeRoom.one", { title: madeRoom[0]!.title })
        : tPlural(catalog, "v4.start.notice.madeRoom", madeRoom.length, locale);
      setNotice({ text, undoAt: null });
      setSpoken(text);
      return;
    }
    const was = new Map([...before.paths, ...before.more].map((path) => [path.key, path] as const));
    if (plan.paths.some((path) => path.wording === "FALLBACK" && was.get(path.key)?.wording === "WRITING")) {
      const text = t(catalog, "v4.start.notice.combineFailed");
      setNotice({ text, undoAt: null });
      setSpoken(text);
      return;
    }
    if (plan.paths.some((path) => path.wording === "COMBINED" && (was.get(path.key)?.wording === "WRITING" || !was.has(path.key)))) {
      setNotice({ text: t(catalog, "v4.start.notice.combined"), undoAt: null });
      const count = plan.paths.length;
      const percent = start.sharePercent;
      setSpoken(percent === null
        ? tPlural(catalog, "v4.start.combinedAnnounceNoShare", count, locale)
        : tPlural(catalog, freePlan ? "v4.start.combinedAnnounceMonth" : "v4.start.combinedAnnounce", count, locale, { percent }));
      return;
    }
    // Another change of the person's (one the card sent, or How wide): the older notice no longer says what just happened.
    if (action !== null || plan.width !== before.width) setNotice(null);
  }, [plan]);

  // The list ready, once per landing (choose-f5); a new reading starts with no notice.
  const sawBand = useRef(false);
  const phaseBefore = useRef<StartCardPhase | null>(null);
  useEffect(() => {
    const before = phaseBefore.current;
    phaseBefore.current = phase;
    if (WAITING.has(phase)) sawBand.current = true;
    if (phase !== "READY" && phase !== "STALE") setNotice(null);
    if (phase === "READY" && before !== "READY" && plan !== null) {
      setSpoken(tPlural(catalog, "v4.start.readyAnnounce", plan.paths.length, locale));
    }
  }, [phase]);

  // Late ideas, said once per rise (choose-f4, choose-f5).
  const lateBefore = useRef(start.lateIdeas);
  useEffect(() => {
    const before = lateBefore.current;
    lateBefore.current = start.lateIdeas;
    if (start.lateIdeas > before) setSpoken(t(catalog, "v4.start.lateIdeasAnnounce"));
  }, [start.lateIdeas]);

  // Ctrl/Cmd+Z undoes the last change while the list shows; in a text box it is the text's own undo.
  const undoKey = useRef<() => boolean>(() => false);
  undoKey.current = (): boolean => {
    if (!listShown || (planNow.current?.undo.length ?? 0) === 0) return false;
    send({ type: "UNDO" });
    return true;
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() !== "z" || typing(event.target)) return;
      if (undoKey.current()) event.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (phase === "OFF" || phase === "IDLE") return null;
  const waiting = WAITING.has(phase);
  const missing = missingLine(start, catalog, props.quotaLine);
  const undoCount = plan?.undo.length ?? 0;
  // Task 74: what the rows, "Another way to see it", the suggestions and "+ N more" share; their changes go through `send`.
  const parts: StartPlanProps | null = listShown ? { plan, catalog, locale, dispatch: send, onRefusal, share: null, narrow } : null;
  const fullChoice = (request: StartFullRequest): ReactNode => parts === null ? null : (
    <V4StartFullChoice plan={parts.plan} widths={widths} catalog={catalog} wider={share.wider} send={send} request={request} />
  );
  const checkedLine = start.checkedLine;
  // The words the check read at Next are what the server compares a question swap with (Task 33), so they are the ones kept.
  const makeMyQuestion = checkedLine === null ? null : (cardId: string): PathPlanRefusal | null => {
    const action: PathPlanAction = { type: "MAKE_MY_QUESTION", cardId, originalQuestion: checkedLine };
    const refusal = send(action);
    if (refusal === null) props.onMakeMyQuestion(cardId);
    else if (refusal !== "PATHS_FULL") onRefusal(refusal, action);
    return refusal;
  };
  return (
    <section className="v4StartCard" aria-labelledby={titleId}>
      <h2 id={titleId} className="v4AskSubTitle v4StartCardTitle">{t(catalog, "v4.start.title")}</h2>
      {freePlan && !props.questionsShown
        ? <p className="v4StartCardLine">{tPlural(catalog, "v4.start.freeLine", PATH_PLAN_LIMITS.freePathsMax, locale)}</p>
        : null}
      {start.menu !== null ? <p className="v4StartCardLine">{t(catalog, "v4.start.reloadLine")}</p> : null}
      {waiting ? <V4StartBand start={start} freePlan={freePlan} narrow={narrow} catalog={catalog} /> : null}
      {missing === null ? null : <p className="v4StartMissing" role="status">{missing}</p>}
      {listShown && start.narrowedTo !== null
        ? <p className="v4StartNarrowed">{tPlural(catalog, "v4.start.narrowed", start.narrowedTo, locale)}</p>
        : null}
      {listShown && notice !== null ? (
        <div className="v4StartNotice">
          <p>{notice.text}</p>
          {notice.undoAt !== null && notice.undoAt === undoCount ? (
            <button type="button" className="v4Btn v4StartNoticeUndo" onClick={() => { send({ type: "UNDO" }); }}>
              {t(catalog, "v4.start.undo")}
            </button>
          ) : null}
        </div>
      ) : null}
      {parts !== null ? (
        <div className={sawBand.current ? "v4StartRows v4StartRows--clear" : "v4StartRows"}>
          {/* Row D §4: "Another way to see it" between the questions and the paths, then the suggestions (§5). */}
          <V4StartWays {...parts} onMakeMyQuestion={makeMyQuestion} fullChoice={fullChoice} />
          <V4StartSuggest {...parts} />
          <V4StartList {...parts} />
        </div>
      ) : null}
      {listShown && start.lateIdeas > 0 ? <p className="v4StartLate">{t(catalog, "v4.start.lateIdeas")}</p> : null}
      {parts !== null ? <V4StartMore {...parts} angles={start.menu?.menu.angles ?? []} fullChoice={fullChoice} /> : null}
      {listShown && undoCount > 0 ? (
        <div className="v4StartTools">
          <button type="button" className="v4Btn v4StartUndo" onClick={() => { send({ type: "UNDO" }); }}>{t(catalog, "v4.start.undo")}</button>
        </div>
      ) : null}
      {phase === "READY" && plan !== null ? (
        <V4StartOwnPath
          plan={plan}
          widths={widths}
          catalog={catalog}
          wider={share.wider}
          send={send}
          fitOwn={start.fitOwn}
          offerIfCrisis={props.offerIfCrisis}
        />
      ) : null}
      <p className="v4SrOnly v4StartSpoken" role="status" aria-live="polite">{spoken}</p>
    </section>
  );
}

/** Why the list is missing, or REFUSED's or STALE's line; null in every other phase. */
function missingLine(start: V4StartCardState, catalog: MessageCatalog, quotaLine: MoneyLine | null): string | null {
  if (start.phase === "REFUSED") return t(catalog, "v4.start.refused");
  if (start.phase === "STALE") return t(catalog, "v4.start.readAgainNeeded");
  if (start.phase !== "NONE" || start.noneLine === null) return null;
  if (start.noneLine === "QUOTA" && quotaLine !== null) return t(catalog, quotaLine.key, quotaLine.values);
  return t(catalog, startNoneLineKey(start.noneLine));
}

/** The waiting band: the question's dot, one dot per AI (lit as each answers), the words, and the dashed places. */
function V4StartBand({ start, freePlan, narrow, catalog }: Readonly<{
  start: V4StartCardState;
  freePlan: boolean;
  narrow: boolean;
  catalog: MessageCatalog;
}>) {
  const phase = start.phase as WaitingPhase;
  const progress = start.progress;
  const of = progress === null ? 0 : Math.max(0, Math.trunc(progress.of));
  const answered = progress === null ? 0 : Math.min(of, Math.max(0, Math.trunc(progress.answered)));
  const width = freePlan ? Math.min(start.width, PATH_PLAN_LIMITS.freePathsMax) : start.width;
  const shown = narrow ? Math.min(NARROW_PLACES, width) : width;
  return (
    <div className="v4StartBand">
      <div className="v4StartBandTrack" aria-hidden="true">
        <span className="v4StartBandQuestion" />
        {of > 0 ? (
          <span className="v4StartDots">
            {Array.from({ length: of }, (_, at) => <span key={at} className={at < answered ? "v4StartDot v4StartDot--lit" : "v4StartDot"} />)}
          </span>
        ) : null}
      </div>
      <p className="v4StartBandStatus" role="status">
        <span className="v4StartBandWords">{t(catalog, PHASE_KEYS[phase])}</span>
        {phase === "READING" && progress !== null ? (
          <>
            {" "}
            <span className="v4StartBandCount">{t(catalog, "v4.start.answered", { answered, of })}</span>
          </>
        ) : null}
      </p>
      <ul className="v4StartPlaces" aria-hidden="true">
        {Array.from({ length: shown }, (_, at) => <li key={at} className="v4StartPlace v4StartPlace--dashed" />)}
      </ul>
      {width > shown ? <p className="v4StartPlacesMore">{t(catalog, "v4.start.morePlaces", { count: width - shown })}</p> : null}
    </div>
  );
}

/** Where the own-path box is: typing, asking where it fits, offering the fit, or the full-list choice. */
type OwnStep =
  | Readonly<{ kind: "EDIT" }>
  | Readonly<{ kind: "FINDING" }>
  | Readonly<{ kind: "FITS"; key: string }>
  | Readonly<{ kind: "FULL" }>;
const EDITING: OwnStep = Object.freeze({ kind: "EDIT" });

/** "Add your own path": the person's words, kept as written, with the AI's fit and the full-list choice (choose-f7). */
function V4StartOwnPath(props: Readonly<{
  plan: PathPlan;
  widths: StartStepRoom["widths"] | null;
  catalog: MessageCatalog;
  wider: StartShare | null;
  send(action: PathPlanAction): PathPlanRefusal | null;
  fitOwn(text: string): Promise<string | null>;
  offerIfCrisis(text: string): boolean;
}>) {
  const { plan, widths, catalog } = props;
  const [text, setText] = useState("");
  const [step, setStep] = useState<OwnStep>(EDITING);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const planNow = useRef(plan);
  planNow.current = plan;
  /** Bumped by every new Add and every edit, so an older fit answer is never applied to other words. */
  const asking = useRef(0);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const fieldId = useId();
  const hintId = useId();
  const messageId = useId();
  const words = text.trim();

  const line = (refusal: PathPlanRefusal, action?: PathPlanAction): string =>
    startRefusalLine(refusal, planNow.current, widths, catalog, { ...(action === undefined ? {} : { action }), wider: props.wider });
  /** A change sent and answered: done (the box empties), the full list's choice, or why not. */
  const settle = (refusal: PathPlanRefusal | null, action: PathPlanAction): void => {
    if (refusal === null) {
      setText("");
      setError(null);
      setStep(EDITING);
      field.current?.focus();
      return;
    }
    if (refusal === "PATHS_FULL") {
      setError(null);
      setStep({ kind: "FULL" });
      return;
    }
    setStep(EDITING);
    setError(line(refusal, action));
  };
  const finish = (action: PathPlanAction): void => settle(props.send(action), action);
  const asPath = (own: string): void => finish({ type: "ADD_OWN", text: own, intoPathKey: null });
  const into = (key: string): void => finish({ type: "ADD_OWN", text: words, intoPathKey: key });
  const swap = (key: string): void => finish({ type: "ADD_OWN", text: words, intoPathKey: null, swapWithKey: key });
  const widerWidth = startWiderWidth(widths, plan.width, plan.freePlan);
  const lookWider = (): void => {
    if (widerWidth === null) return;
    // The person's words take the place of the last idea widening brought up when that filled the list (lookWiderThen).
    const result = lookWiderThen(planNow.current, widerWidth, props.send, { make: (target) => ({ type: "ADD_OWN", text: words, ...target }) });
    if (result.action !== null) settle(result.refusal, result.action);
  };

  const submit = async (): Promise<void> => {
    if (step.kind === "FINDING") return;
    const early: PathPlanRefusal | null = words === "" ? "EMPTY" : words.length > PATH_PLAN_LIMITS.ownTextMaxChars ? "TOO_LONG" : null;
    if (early !== null) {
      setStep(EDITING);
      setError(line(early));
      return;
    }
    // Crisis words: the page opens only the help screen; nothing is added and no fit is asked.
    if (props.offerIfCrisis(words)) return;
    if (holdsOwn(planNow.current, words)) {
      setText("");
      setError(null);
      setStep(EDITING);
      return;
    }
    setError(null);
    setStep({ kind: "FINDING" });
    asking.current += 1;
    const ask = asking.current;
    const own = words;
    const key = await props.fitOwn(own);
    if (!alive.current || ask !== asking.current) return;
    if (key !== null && planNow.current.paths.some((path) => path.key === key)) setStep({ kind: "FITS", key });
    else asPath(own);
  };
  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void submit();
  };
  const cancel = (): void => {
    setStep(EDITING);
    field.current?.focus();
  };

  const fits = step.kind === "FITS" ? plan.paths.find((path) => path.key === step.key) ?? null : null;
  let message: string | null = error;
  let choice: ReactNode = null;
  if (step.kind === "FINDING") message = t(catalog, "v4.start.own.finding");
  else if (step.kind === "FITS" && fits !== null) {
    message = t(catalog, "v4.start.own.fits", { title: fits.title });
    choice = (
      <>
        <button type="button" className="v4Btn" onClick={() => into(fits.key)}>{t(catalog, "v4.start.own.addThere")}</button>
        <button type="button" className="v4Btn" onClick={() => asPath(words)}>{t(catalog, "v4.start.own.ownPath")}</button>
      </>
    );
  } else if (step.kind === "FULL") {
    message = line("PATHS_FULL");
    choice = (
      <V4StartFullButtons
        plan={plan}
        catalog={catalog}
        widerWidth={widerWidth}
        wider={props.wider}
        onInto={into}
        onSwap={swap}
        onWider={lookWider}
        onCancel={cancel}
      />
    );
  }
  return (
    <form className="v4StartOwn" onSubmit={onSubmit}>
      <label className="v4StartOwnLabel" htmlFor={fieldId}>{t(catalog, "v4.start.own.label")}</label>
      <p id={hintId} className="v4StartOwnHint">{t(catalog, "v4.start.own.hint")}</p>
      <div className="v4StartOwnRow">
        <textarea
          ref={field}
          id={fieldId}
          className="v4StartOwnField"
          dir="auto"
          rows={2}
          value={text}
          aria-describedby={message === null ? hintId : `${hintId} ${messageId}`}
          onChange={(event) => {
            asking.current += 1;
            setText(event.target.value);
            if (step.kind !== "EDIT") setStep(EDITING);
            setError(null);
          }}
        />
        <button type="submit" className="v4Btn v4StartOwnAdd" disabled={step.kind === "FINDING"}>{t(catalog, "v4.start.own.add")}</button>
      </div>
      {message === null ? null : <p id={messageId} className="v4StartOwnMessage" role="status">{message}</p>}
      {choice === null ? null : <div className="v4StartOwnChoice">{choice}</div>}
    </form>
  );
}
