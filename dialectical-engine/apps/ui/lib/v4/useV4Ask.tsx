"use client";

import * as React from "react";
import {
  ContractHttpError, DIG_FREE_PICKS_MAX, DIG_PICKS_ONE_PATH, DIG_TOO_DEEP, FREE_DIG_PICKS_MAX, FREE_PUBLIC_NOTICE_REQUIRED, START_PATHS_EXPIRED,
  START_PATHS_INVALID, START_PATHS_NARROWED, START_PATHS_STALE, START_STEP_LIMITS, type AskParent, type PublicDigParent, type PurposeLines,
  type QuestionLanguageChoice
} from "@debateai/contract";
import { crisisWordsOf } from "./askText.js";
import { COOKIE_SESSION_MARKER, contractClient, createDebate } from "@/lib/api";
import { readAskRoom, useAskRoom, waitingRoomOf, type AskRoom } from "@/lib/billing/room";
import {
  classifyRequestFailure,
  isAskSettingsChanged,
  isQuestionLanguageCheckStale,
  QuestionLanguageChoiceNeededError,
  requestFailureMessage
} from "@/lib/v3/requestFailure";
import { isSensitiveDataConsentRefusal, useSensitiveDataConsent } from "@/components/SensitiveDataConsent";
import { isCrisisSupportRefusal, useCrisisSupport } from "@/components/CrisisSupport";
import { questionRefusalOf, useQuestionRefusal } from "@/components/QuestionRefusal";
import { useQuestionLanguageChoice } from "@/components/QuestionLanguageChoice";
import { catalogLocale, isLocale, type LocaleCode } from "@/lib/i18n/locales";
import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import { effectiveDigMode, v4AskConfig, v4RoomQuery, type V4AskSettings } from "./askConfig";
import { publicDigRefusalWords } from "./publicPage";
import type { DigMode, ReadingLevel, V4StartHandOver } from "./types";

/*
 * V4 initial (spec 2026-10-28, B2): ONE hook for the ask page and the dig buttons — a faithful port of /new's submit
 * (app/new/NewDebatePageClient.tsx, state ~L175–360, submit ~L366–510) without editing it: the crisis check first, the
 * one-time consent, the room and its settings version (rulings R50/R51), the shape and length switches, the plan the
 * server decided (INTERNAL funding included), the question-language offer (CR-5: at most four asks per press, plus the
 * one retry after the consent screen), the 409 "settings changed" and ALREADY_WAITING. What /new shows in a banner comes
 * back here as a REFUSED outcome with the same plain sentence.
 */

/** /new's LANGUAGE_ASKS_PER_PRESS (spec 2026-10-13, ruling CR-5): the first ask, the answer, one re-check, a second answer. */
const LANGUAGE_ASKS_PER_PRESS = 4;
/** /new's `ready` rule: a question needs more than six characters. */
const QUESTION_MIN_LENGTH = 7;

export type V4AskOutcome =
  | Readonly<{ kind: "STARTED"; runId: string; notJoined?: boolean }>
  /**
   * A pop-up took over (or nothing was sent). `acceptedQuestion`: as on REFUSED, a rewrite accepted before the question check's screen.
   * V4 start step, Task 68 (ask-f2): `noticeNeeded`, the server held a Free question for its notice; the notice now shows above Start
   * (`freePublicNotice`), and the next press carries it.
   */
  | Readonly<{ kind: "STOPPED"; acceptedQuestion?: string; noticeNeeded?: true }>
  /** ASK-5 (V3 ruling L-USE-STICKS): `acceptedQuestion` is the rewrite the person chose ("Use this version") before the
   * refusal, so the next Start can send it again instead of asking a second time. Task 68: `startPathsStale`, the chosen
   * paths are from another reading (a plan change since Next: the page reads the question again); `startPathsNarrowed`, the
   * site now allows fewer paths than were chosen (answer Q8: the room was read again; the person combines or removes first).
   * Task 70b (read-f17): `code` ALREADY_WAITING, one question already waits; while the room notice says so (sentence D), the
   * page adds no refusal line of its own. */
  | Readonly<{ kind: "REFUSED"; message: string; code?: "ALREADY_WAITING"; acceptedQuestion?: string; startPathsStale?: true; startPathsNarrowed?: true }>;

/** Where an ask comes from: the ask page, or a dig button (AI-written text around the person's earlier question). */
export type V4AskOrigin = "ask" | "dig";


type DecidedPlan = NonNullable<AskRoom["plan_id"]>;
type InternalFunding = Readonly<{ kind: "INTERNAL"; expires_at: string }>;

const STOPPED: V4AskOutcome = Object.freeze({ kind: "STOPPED" });

/**
 * W3-4: the dig the map page is about to send, so its room read says the dig's share of today (`dig_share_percent`):
 * the debate it digs and how many picks it combines (0: a dig of a whole path or one open question).
 */
export type V4DigRoom = Readonly<{ parentRunId: string; picks: number }>;

/** W3-4: the API's 409 for a dig that would go past the deepest level (two quick clicks): nothing started, nothing used. */
function isDigTooDeep(failure: unknown): boolean {
  return failure instanceof ContractHttpError && failure.status === 409 && failure.serverCode === DIG_TOO_DEEP;
}

/**
 * R22 W3-8: the API's 400 for a dig the page should never send, each with its own code: picks from more than one path
 * (DIG_PICKS_ONE_PATH, owner Q-D1) or more picks than Free combines (DIG_FREE_PICKS_MAX). Nothing started, nothing used.
 */
function digRefusalCode(failure: unknown): typeof DIG_PICKS_ONE_PATH | typeof DIG_FREE_PICKS_MAX | null {
  if (!(failure instanceof ContractHttpError) || failure.status !== 400) return null;
  return failure.serverCode === DIG_PICKS_ONE_PATH || failure.serverCode === DIG_FREE_PICKS_MAX ? failure.serverCode : null;
}

/** V4 start step, Task 68 (ask-f2): the API's 403 for a Free question sent without the notice (Task 36). Nothing was checked or used. */
export function isFreeNoticeRequired(error: unknown): boolean {
  return error instanceof ContractHttpError && error.status === 403 && error.serverCode === FREE_PUBLIC_NOTICE_REQUIRED;
}

/**
 * Task 68: Start's chosen paths refused. STALE: 409 START_PATHS_STALE or 400 START_PATHS_INVALID, the paths are from another
 * reading (409 START_PATHS_EXPIRED is no longer answered, Task 26b; met, it reads as STALE). NARROWED: 409
 * START_PATHS_NARROWED, the site now allows fewer paths (answer Q8). Nothing started, nothing used.
 */
function startPathsRefusal(failure: unknown): "STALE" | "NARROWED" | null {
  if (!(failure instanceof ContractHttpError)) return null;
  if (failure.status === 409 && failure.serverCode === START_PATHS_NARROWED) return "NARROWED";
  return (failure.status === 409 && (failure.serverCode === START_PATHS_STALE || failure.serverCode === START_PATHS_EXPIRED))
    || (failure.status === 400 && failure.serverCode === START_PATHS_INVALID) ? "STALE" : null;
}

/** Task 68 (answer Q8): the most paths a room's settings allow this person (Free 3, whatever the row says); null without the step. */
function widestOf(room: AskRoom | null): number | null {
  const options = room?.start_step?.widths.options;
  if (room === null || options === undefined || options.length === 0) return null;
  const widest = Math.max(...options);
  return room.plan_id === "FREE" && !("funding" in room) ? Math.min(widest, START_STEP_LIMITS.freePathsMax) : widest;
}

/** Task 68: the lane createDebate carries for Start (its ninth argument), each member only when the hand-over has it; none: undefined. */
function startLaneOf(handOver: V4StartHandOver | undefined): Parameters<typeof createDebate>[8] {
  if (handOver === undefined) return undefined;
  const lane = {
    ...(handOver.startCheck === undefined ? {} : { startCheck: handOver.startCheck }),
    ...(handOver.startPaths === undefined ? {} : { startPaths: handOver.startPaths }),
    ...(handOver.carryOnToReport === true ? { carryOnToReport: true as const } : {}),
    // V4 start step, Task 76f (saved-questions spec §3.7): the question the account keeps, removed once the debate is accepted.
    ...(handOver.savedQuestionId === undefined ? {} : { savedQuestionId: handOver.savedQuestionId })
  };
  return Object.keys(lane).length === 0 ? undefined : lane;
}

export function useV4Ask(input: Readonly<{
  catalog: MessageCatalog; homeCatalog: MessageCatalog; newDebateCatalog: MessageCatalog;
  locale: string; crisisCountryHint: string | null; mode: DigMode; readingLevel: ReadingLevel;
  /** W3-4: on the map page, the dig its room read is for; absent (the ask page), the read is for a new question. */
  dig?: V4DigRoom | null;
  /**
   * V4 start step, Task 70b (ask-f8): absent or true, `dialogs` holds today's line for a declined consent (the map's dig
   * buttons keep it: a dig has no Next to sit under). The ask page passes false and shows its own line right under Next.
   */
  showDeclinedLine?: boolean;
  /**
   * A public page's dig only (agreed with the start step, 9 Nov): true when that debate already shows a report, so a further report
   * waits for the reset too. A refused dig's used-up month line then goes without "You can still write your report."
   * (publicDigRefusalWords). Absent: false.
   */
  publicReportWaits?: boolean;
}>): Readonly<{
  /**
   * W3-4: a dig sends its `parent` (the debate it digs, its places, mode and picks); a new question sends none.
   * Decision 13: a dig on a public page sends a `public_parent` the same way (the page's own reference, never a run id).
   * dig-f9 (screen review, 3 Nov): `about` names the dig the question check's screen is about, when that screen opens for
   * a dig carrying the person's own view ("About your dig on “Mostly renewables”:"); absent, the screen is as before.
   * V4 start step, Task 68: `handOver` is Start's (the question box's line, which the page also passes as `questionLine`;
   * the check of Next, the chosen paths, the carry-on box and the person's own path words). Absent: today's ask.
   */
  submit(questionLine: string, mode: DigMode, origin?: V4AskOrigin, parent?: AskParent | PublicDigParent | null, purposeLines?: PurposeLines,
    about?: React.ReactNode, handOver?: V4StartHandOver): Promise<V4AskOutcome>;
  /**
   * Task 68: opens the question check's own screen (the one a refused send opens) for a refusal the page met elsewhere,
   * such as the lists stream's REFUSED before Start; true when it opened, false when `error` is not the check's.
   */
  showRefusal(error: unknown): boolean;
  /** Decision 29: the one-time sensitive-data consent, asked before the question goes to step 2's AI. The dialog is in `dialogs`. */
  ensureConsent(): Promise<boolean>;
  /** ASK-3: whether this text reads as a person in crisis (the page enables Start for it even when it is short). */
  flagsCrisis(text: string): boolean;
  /**
   * The crisis check on a dig's own views at its click, before its Undo window starts: true
   * when any of `words` reads as a person in crisis, and the help screen (in `dialogs`, the same one the send uses) opened.
   */
  offerCrisisHelp(words: readonly string[]): boolean;
  room: AskRoom | null;
  /** Task 70b (read-f3, 4 Nov night): the room read again (useAskRoom's own re-read); null when it could not be read. */
  refreshRoom: () => Promise<AskRoom | null>;
  planTier: "free" | "premium";
  /**
   * Task 70b (ask-f2): what the page knows of the plan. LOADING until a room read answers; KNOWN once one has (a site with
   * no plans included); FAILED only after one more read failed too. The ask page's buttons read "Getting ready…" while LOADING.
   */
  planState: "LOADING" | "KNOWN" | "FAILED";
  /**
   * Task 70b (read-f3): the server named the plan FREE, with no internal grant. Free-only things read this, never `planTier`
   * alone (which is also "free" while the plan is unknown, and on a site with no plans).
   */
  planIsFree: boolean;
  /**
   * Decision 13: show the notice that a Free debate is public, and send that it was shown. A plan the server named as Free,
   * or a plan that could not be read even on a second try (Task 70b, ask-f2: a Free question is never private unseen), unless
   * the person is known to be on a paid plan. Never before the first read answers, and never on a site with no plans.
   */
  freePublicNotice: boolean;
  submitting: boolean;
  dialogs: React.ReactNode;
}> {
  const { catalog, homeCatalog, newDebateCatalog, locale, crisisCountryHint, mode, readingLevel } = input;
  const digParent = input.dig?.parentRunId ?? null;
  const digPicks = input.dig?.picks ?? 0;
  const [submitting, setSubmitting] = React.useState(false);
  const submitFlight = React.useRef(false);
  const consent = useSensitiveDataConsent({ catalog: homeCatalog, locale });
  const crisis = useCrisisSupport({ catalog: homeCatalog, locale, countryHint: crisisCountryHint });
  const questionRefusal = useQuestionRefusal({ catalog: homeCatalog, locale, countryHint: crisisCountryHint });
  // Question language (spec 2026-10-13): the page's language goes with the question (PF-L56: `locale` is a string).
  const pageLocale: LocaleCode = isLocale(locale) ? locale : "en";
  const languageChoice = useQuestionLanguageChoice({ catalog: newDebateCatalog, locale: pageLocale });

  // Debate shape P2c (Contract deviation 7) and length guidance (spec 2026-10-15 §3.8): true once a room read said the
  // row is in force; kept for the page's life, so a later failed or refused read never changes what the ask sends.
  const [shapeSettings, setShapeSettings] = React.useState(false);
  const [lengthSettings, setLengthSettings] = React.useState(false);

  // Paid plans (spec 2026-09-29 §2.3.4; ruling Q-8): the plan the SERVER decided, remembered once known.
  const [decidedPlan, setDecidedPlan] = React.useState<DecidedPlan | null>(null);
  const [internalFunding, setInternalFunding] = React.useState<InternalFunding | null>(null);
  React.useEffect(() => {
    if (internalFunding === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expire = (): void => {
      const remaining = Date.parse(internalFunding.expires_at) - Date.now();
      if (!(remaining > 0)) setInternalFunding(null);
      else timer = setTimeout(expire, Math.min(2147483647, remaining));
    };
    expire();
    return () => { if (timer !== undefined) clearTimeout(timer); };
  }, [internalFunding]);
  // V4 has no plan chooser: the tier is the decided one, Free until the server says otherwise (/new's default).
  const planTier: "free" | "premium" = internalFunding !== null
    ? "premium" : decidedPlan === null || decidedPlan === "FREE" ? "free" : "premium";
  // V4 start step, Task 68 (ask-f2): once the server held a question for the Free notice, the notice shows for the page's
  // life, whatever a later room read says, so the next press carries it.
  const [noticeRequired, setNoticeRequired] = React.useState(false);
  // Task 70b (ask-f2, read-f3): the plan read's state; FAILED only after one more read failed too (below).
  const [planState, setPlanState] = React.useState<"LOADING" | "KNOWN" | "FAILED">("LOADING");
  const planIsFree = internalFunding === null && decidedPlan === "FREE";
  const freePublicNotice = noticeRequired
    || (internalFunding === null && (decidedPlan === "FREE" || (planState === "FAILED" && decidedPlan === null)));

  // Side-by-side spec §13 (Task S12): the settings version the switches above were read under, sent back with the ask.
  const settingsVersion = React.useRef<number | undefined>(undefined);
  // Ruling R50: after a 409 whose room re-read failed, the next read naming a version is adopted as a switch.
  const adoptNextVersion = React.useRef(false);

  const settingsFor = React.useCallback((tier: "free" | "premium", shape: boolean, length: boolean): V4AskSettings => ({
    planTier: tier, shapeSettings: shape, lengthSettings: length,
    ...(settingsVersion.current === undefined ? {} : { settingsVersion: settingsVersion.current })
  }), []);
  // Contract deviation 9: the room for the ask this page would send now (the page's mode and level).
  const baseQuery = v4RoomQuery(mode, readingLevel, settingsFor(planTier, shapeSettings, lengthSettings));
  // W3-4 (owner Q14): a dig's read names its parent, mode and picks, so the answer says the dig's share of today.
  const roomQuery = digParent === null ? baseQuery : {
    ...baseQuery,
    dig_parent: digParent,
    dig_mode: effectiveDigMode(mode, planTier),
    ...(digPicks > 0 ? { dig_picks: digPicks } : {})
  };
  const [room, setRoom, refreshRoom, roomRead] = useAskRoom(contractClient, roomQuery);
  // Task 70b (ask-f2): a read that answered makes the plan known; while it is still unknown, a failed read is tried once
  // more, and only that second failure makes it FAILED. A later failed read never forgets a plan once known.
  const planRetried = React.useRef(false);
  React.useEffect(() => {
    if (roomRead === "READ") {
      setPlanState("KNOWN");
      return;
    }
    if (roomRead !== "FAILED" || planState !== "LOADING" || planRetried.current) return;
    planRetried.current = true;
    void refreshRoom().then((value) => {
      if (value === null) setPlanState((now) => (now === "LOADING" ? "FAILED" : now));
    });
  }, [roomRead, planState, refreshRoom]);

  /** Ruling R51: a read from another version is authoritative — its switches apply as they are (they may turn off). */
  const adoptSettingsRead = React.useCallback((read: AskRoom) => {
    setShapeSettings(read.shape_settings === true);
    setLengthSettings(read.length_settings === true);
  }, []);
  React.useEffect(() => {
    if (room === null) return;
    const named = room.settings_version;
    const switched = named !== undefined && settingsVersion.current !== undefined && named !== settingsVersion.current;
    if (switched || (named !== undefined && adoptNextVersion.current)) {
      // V4 shows none of these switches, so the person's visible choices (mode, level) stay as they are: the new
      // version's switches are adopted without a banner (an assumption; /new says settingsChangedMessage here).
      adoptSettingsRead(room);
      adoptNextVersion.current = false;
    } else {
      if (room.shape_settings === true) setShapeSettings(true);
      if (room.length_settings === true) setLengthSettings(true);
    }
    if (named !== undefined) settingsVersion.current = named;
    if (room.plan_id !== null) setDecidedPlan(room.plan_id);
    setInternalFunding("funding" in room ? room.funding : null);
  }, [room, adoptSettingsRead]);

  // The latest state, for a submit fired later (a dig sends after its Undo window): never a stale closure.
  const publicReportWaits = input.publicReportWaits === true;
  const live = React.useRef({ planTier, freePublicNotice, shapeSettings, lengthSettings, readingLevel, room, catalog, newDebateCatalog,
    pageLocale, consent, crisis, questionRefusal, languageChoice, publicReportWaits });
  React.useEffect(() => {
    live.current = { planTier, freePublicNotice, shapeSettings, lengthSettings, readingLevel, room, catalog, newDebateCatalog,
      pageLocale, consent, crisis, questionRefusal, languageChoice, publicReportWaits };
  });

  const submit = React.useCallback(async (questionLine: string, askMode: DigMode, origin: V4AskOrigin = "ask",
    parent: AskParent | PublicDigParent | null = null, purposeLines?: PurposeLines, about?: React.ReactNode,
    handOver?: V4StartHandOver): Promise<V4AskOutcome> => {
    if (submitFlight.current) return STOPPED;
    const now = live.current;
    const question = questionLine.trim();
    const dig = origin === "dig";
    // Task 68: the person's own words in the paths Start hands over are theirs too, so the crisis check reads them with the rest.
    const startOwnWords = handOver?.ownWords ?? [];
    // V, 2026-09-30: a question that reads as a person in crisis gets help numbers, never a debate — before anything else.
    // ASK-4: a dig's question is AI-written text around a question that already passed this check, so that text is not read here. The
    // person's own views in a dig are their words: the owner, 1 Nov: the same pop-up on public digs and on own views on the map.
    if (crisisWordsOf(origin, question, parent, startOwnWords).some((words) => now.crisis.offerIfCrisis(words))) return STOPPED;
    if (question.length < QUESTION_MIN_LENGTH) return { kind: "REFUSED", message: t(now.catalog, "v4.askError.tooShort") };
    // Task 68: a hand-over is for the line pressed (the page passes the box's line as both); another line is a page fault,
    // refused before anything is sent, so the check of Next never goes with a line it was not handed for.
    if (handOver !== undefined && handOver.questionLine.trim() !== question) return { kind: "REFUSED", message: t(now.catalog, "v4.ask.failed") };
    const startLane = startLaneOf(handOver);
    // Sentence D: one question already waits (Task 70b, read-f17: coded, so the page adds no line while the notice says it).
    if (now.room?.room === "ALREADY_WAITING") return { kind: "REFUSED", message: t(now.catalog, "v4.askError.alreadyWaiting"), code: "ALREADY_WAITING" };
    submitFlight.current = true;
    setSubmitting(true);
    let askSettings = settingsFor(now.planTier, now.shapeSettings, now.lengthSettings);
    const askRoomQuery = (): ReturnType<typeof v4RoomQuery> => v4RoomQuery(askMode, now.readingLevel, askSettings);
    // ASK-5: the rewrite the person accepted in this press, returned with any later refusal.
    let acceptedRewrite: string | undefined;
    const refused = (message: string,
      startFlag?: Readonly<{ startPathsStale: true } | { startPathsNarrowed: true } | { code: "ALREADY_WAITING" }>): V4AskOutcome => ({
      kind: "REFUSED", message, ...(acceptedRewrite === undefined ? {} : { acceptedQuestion: acceptedRewrite }), ...startFlag
    });
    // Task 68 (answer Q8): the site now allows fewer paths than were chosen: its words name the new widest (unknown: the
    // settings sentence), and the page asks to combine or remove down to it.
    const narrowed = (widest: number | null): V4AskOutcome => refused(widest === null
      ? t(now.catalog, "v4.askError.settingsChanged")
      : tPlural(now.catalog, "v4.start.narrowed", widest, now.pageLocale), { startPathsNarrowed: true });
    // Task 68: the room read again and its version adopted (R50/R51), as after a second 409 below; no version named: the next read's.
    const readRoomAgain = async (): Promise<AskRoom | null> => {
      const fresh = await readAskRoom(contractClient, askRoomQuery());
      if (fresh !== null) setRoom(fresh);
      if (fresh?.settings_version === undefined) {
        settingsVersion.current = undefined;
        adoptNextVersion.current = true;
      } else {
        adoptSettingsRead(fresh);
        settingsVersion.current = fresh.settings_version;
        adoptNextVersion.current = false;
      }
      return fresh;
    };
    try {
      // V, 2026-09-29: no debate starts before the one-time sensitive-data consent.
      if (!await now.consent.ensureConsent()) return STOPPED;
      const siteLanguage = catalogLocale(now.pageLocale);
      let next: Readonly<{ line: string; choice?: QuestionLanguageChoice }> = { line: question };
      let asks = 0;
      let consentRetried = false;
      let offerShown = false;
      let rechecked = false;
      let settingsRetried = false;
      let debate: { id: string; public_dig_not_joined?: boolean } | null = null;
      while (debate === null) {
        // Rebuilt on every pass: the one retry after a 409 settings-changed (ASK-7) sends the adopted switches.
        const config = v4AskConfig(askMode, now.readingLevel, askSettings, new Date(), now.newDebateCatalog);
        // Question language (spec 2026-10-13; ruling CR-5, D1 order), exactly as /new: the page's language goes with the
        // ask only once the room said the shape row is in force (L-SITELANG-GATED); one offer per press, a second offer
        // is answered with the person's own wording, a stale reference is checked once more without a choice.
        const sendsLanguage = askSettings.shapeSettings;
        try {
          // W3-4: a dig's parent rides with every pass of the same press (today's calls when there is none).
          const sentParent = parent !== null && "parent_run_id" in parent ? parent : undefined;
          // Decision 13: a public page's dig, or that this new question showed the Free notice (the notice is never about a dig).
          const publicLane = parent !== null && "public_ref" in parent ? { publicParent: parent }
            : !dig && now.freePublicNotice ? { freePublicNotice: true as const } : undefined;
          // Task 68: Start's lane rides with every pass of the same press as the ninth argument; without one, today's calls.
          const send = (language: Parameters<typeof createDebate>[4]) => startLane === undefined
            ? createDebate(next.line, config, COOKIE_SESSION_MARKER, undefined, language, sentParent, purposeLines, publicLane)
            : createDebate(next.line, config, COOKIE_SESSION_MARKER, undefined, language, sentParent, purposeLines, publicLane, startLane);
          debate = !sendsLanguage
            ? sentParent === undefined && purposeLines === undefined && publicLane === undefined && startLane === undefined
              ? await createDebate(next.line, config, COOKIE_SESSION_MARKER)
              : await send(undefined)
            : await send(next.choice === undefined ? { siteLanguage } : { siteLanguage, choice: next.choice });
        } catch (refusal) {
          // Today's one retry after the consent screen; it is not one of the four asks.
          if (isSensitiveDataConsentRefusal(refusal) && !consentRetried) {
            consentRetried = true;
            if (!await now.consent.ensureConsent({ known: "required" })) return STOPPED;
            continue;
          }
          // Task 68 (answer Q8): with chosen paths the ask is never sent again by itself: the room is read again, and when it
          // allows fewer paths than were chosen the person combines or removes first; else the update banner says it (Task 76e).
          if (isAskSettingsChanged(refusal) && startLane?.startPaths !== undefined) {
            const widest = widestOf(await readRoomAgain());
            return widest !== null && widest < startLane.startPaths.paths.length
              ? narrowed(widest) : refused(t(now.catalog, "v4.askError.settingsChanged"));
          }
          // ASK-7: V4 shows none of the switches a 409 names, so the room is read again, its version adopted (R50/R51)
          // and the ask sent ONCE more; only a second refusal (or a re-read naming no version) reaches the person. With only
          // Start's check in the lane (no paths), this one retry carries the same lane.
          if (isAskSettingsChanged(refusal) && !settingsRetried) {
            settingsRetried = true;
            const fresh = await readAskRoom(contractClient, askRoomQuery());
            if (fresh !== null) setRoom(fresh);
            if (fresh?.settings_version === undefined) {
              settingsVersion.current = undefined;
              adoptNextVersion.current = true;
              return refused(t(now.catalog, "v4.askError.settingsChanged"));
            }
            adoptSettingsRead(fresh);
            settingsVersion.current = fresh.settings_version;
            adoptNextVersion.current = false;
            askSettings = settingsFor(now.planTier, fresh.shape_settings === true, fresh.length_settings === true);
            continue;
          }
          asks += 1;
          if (asks >= LANGUAGE_ASKS_PER_PRESS) throw refusal;
          if (refusal instanceof QuestionLanguageChoiceNeededError) {
            const offer = refusal.offer;
            // A dig's text is mostly AI-written: it is sent as written, never rewritten, so the account's question list
            // can still find it from its parent (fix wave 1, Decision A). An assumption; the owner may rule otherwise.
            if (offerShown || dig) {
              next = { line: question, choice: { check_ref: offer.check_ref, choice: "KEEP_MINE" } };
              continue;
            }
            offerShown = true;
            const answer = await now.languageChoice.ensureChoice(offer);
            // "Edit": nothing is sent; the person is back at their question.
            if (answer === "EDIT") return STOPPED;
            if (answer === "USE") acceptedRewrite = offer.proposed_question;
            next = answer === "USE"
              ? { line: offer.proposed_question,
                choice: { check_ref: offer.check_ref, choice: "USE_REWRITE", original_question_line: question } }
              : { line: question, choice: { check_ref: offer.check_ref, choice: "KEEP_MINE" } };
            continue;
          }
          if (next.choice !== undefined && !rechecked && isQuestionLanguageCheckStale(refusal)) {
            rechecked = true;
            next = { line: question };
            continue;
          }
          throw refusal;
        }
      }
      return { kind: "STARTED", runId: debate.id, ...(debate.public_dig_not_joined === true ? { notJoined: true } : {}) };
    } catch (exc) {
      // Decision 13: a public page's dig says its refusals in its own words: no level, no count, no code.
      const publicRefusal = parent !== null && "public_ref" in parent ? publicDigRefusalWords(exc, now.catalog, now.room, now.pageLocale, now.publicReportWaits)
        : null;
      if (publicRefusal !== null) return refused(publicRefusal);
      // Task 68 (ask-f2): the server held a Free question sent without the notice. The notice shows from now on, nothing is
      // resent, and the next press carries it; no extra line, the notice itself stands above Start. Never about a dig.
      if (!dig && isFreeNoticeRequired(exc)) {
        setNoticeRequired(true);
        const fresh = await readAskRoom(contractClient, askRoomQuery());
        if (fresh !== null) setRoom(fresh);
        return acceptedRewrite === undefined ? { kind: "STOPPED", noticeNeeded: true }
          : { kind: "STOPPED", noticeNeeded: true, acceptedQuestion: acceptedRewrite };
      }
      // Task 68 (read-d2): the chosen paths are from another reading (a plan change since Next): the question is read again.
      const startRefused = startPathsRefusal(exc);
      if (startRefused === "STALE") return refused(t(now.catalog, "v4.start.readAgainNeeded"), { startPathsStale: true });
      // Answer Q8: the site now allows fewer paths than were chosen: the room is read again for its widest, nothing is resent.
      if (startRefused === "NARROWED") return narrowed(widestOf(await readRoomAgain()));
      // W3-4: two quick clicks past the deepest level; the API started nothing and used nothing (label 5.5).
      if (isDigTooDeep(exc)) return refused(t(now.catalog, "v4.nest.tooDeep"));
      // W3-8: the two dig refusals the page never sends, said plainly where DIG_TOO_DEEP is (drafts for the click-test).
      const digRefused = digRefusalCode(exc);
      if (digRefused === DIG_PICKS_ONE_PATH) return refused(t(now.catalog, "v4.nest.picksOnePath"));
      if (digRefused === DIG_FREE_PICKS_MAX) return refused(t(now.catalog, "v4.nest.freePicksMax", { count: FREE_DIG_PICKS_MAX }));
      if (isCrisisSupportRefusal(exc)) {
        // ASK-4: the API's crisis gate refused a dig: no help pop-up for AI-written text, a plain sentence instead.
        if (dig) return refused(t(now.catalog, "v4.digError.cannotFollow"));
        now.crisis.offer();
        return STOPPED;
      }
      // R22's first debate (2026-11-02): the question check's own answers, as /new shows them (its subject's screen, or the retry screen), never
      // "could not be reached". A dig's text is AI-written around a question that already passed: a plain sentence instead (ASK-4, as above),
      // unless it carries the person's own views, which are their words (the owner, 1 Nov): those get the screens, help numbers included.
      const checkAnswer = questionRefusalOf(exc);
      if (checkAnswer !== null) {
        if (dig && crisisWordsOf(origin, question, parent, startOwnWords).length === 0) {
          return refused(t(now.catalog, checkAnswer === "UNAVAILABLE" ? "v4.ask.failed" : "v4.digError.cannotFollow"));
        }
        // A dig's screen opens only once its Undo window after the click is over, so it names the dig it is about.
        now.questionRefusal.offer(exc, dig ? about : undefined);
        // ASK-5: a rewrite accepted before the screen opened sticks for the next Start, as after a refusal.
        return acceptedRewrite === undefined ? STOPPED : { kind: "STOPPED", acceptedQuestion: acceptedRewrite };
      }
      // A second 409 after the retry (ASK-7): nothing started; the room is read again and its version adopted (R50), so
      // the next press sends the new version's ask. V4 has no settings to check, so its own sentence is shown.
      if (isAskSettingsChanged(exc)) {
        const fresh = await readAskRoom(contractClient, askRoomQuery());
        if (fresh?.settings_version === undefined) {
          settingsVersion.current = undefined;
          adoptNextVersion.current = true;
        } else {
          adoptSettingsRead(fresh);
          settingsVersion.current = fresh.settings_version;
          adoptNextVersion.current = false;
        }
        if (fresh !== null) setRoom(fresh);
        return refused(t(now.catalog, "v4.askError.settingsChanged"));
      }
      // DL3-F7: ALREADY_WAITING is shown by the room notice (sentence D, with its time), from the room re-read or the
      // refusal's own body; the plain V4 sentence goes with it, and /new's banner only when neither names a wait.
      if (classifyRequestFailure("DEBATE_CREATE", exc).kind === "ALREADY_WAITING") {
        const fresh = await readAskRoom(contractClient, askRoomQuery());
        const shown = fresh === null ? waitingRoomOf(exc) : fresh;
        setRoom(shown);
        return shown?.room === "ALREADY_WAITING"
          ? refused(t(now.catalog, "v4.askError.alreadyWaiting"), { code: "ALREADY_WAITING" })
          : refused(requestFailureMessage("DEBATE_CREATE", exc, now.newDebateCatalog));
      }
      return refused(requestFailureMessage("DEBATE_CREATE", exc, now.newDebateCatalog));
    } finally {
      submitFlight.current = false;
      setSubmitting(false);
    }
  }, [settingsFor, adoptSettingsRead, setRoom]);

  // ASK-3: the same test the crisis check runs, so a short message in crisis can still reach the help numbers.
  // Read each render (not memoised): it turns true once the crisis patterns finish warming up, like /new's Start.
  const flagsCrisis = crisis.flags;

  const dialogs = (
    <>
      {consent.declined && input.showDeclinedLine !== false ? (
        <p className="sensitiveConsentDeclined" role="status">{t(homeCatalog, "home.sensitiveConsent.declined")}</p>
      ) : null}
      {consent.dialog}
      {crisis.dialog}
      {questionRefusal.dialog}
      {languageChoice.dialog}
    </>
  );

  const ensureConsent = React.useCallback(() => live.current.consent.ensureConsent(), []);
  // dig-f9: the send's own crisis check (the same patterns and help screen), run on a dig's own views at its click.
  const offerCrisisHelp = React.useCallback((words: readonly string[]) => words.some((text) => live.current.crisis.offerIfCrisis(text)), []);
  // Task 68: the check's own screen for a refusal met outside a send (the same screen a refused send opens).
  const showRefusal = React.useCallback((error: unknown) => live.current.questionRefusal.offer(error), []);
  return {
    submit, showRefusal, ensureConsent, flagsCrisis, offerCrisisHelp, room, refreshRoom, planTier, planState, planIsFree, freePublicNotice,
    submitting, dialogs
  };
}
