"use client";

import * as React from "react";
import {
  ContractHttpError, DIG_FREE_PICKS_MAX, DIG_PICKS_ONE_PATH, DIG_TOO_DEEP, FREE_DIG_PICKS_MAX, type AskParent, type QuestionLanguageChoice
} from "@debateai/contract";
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
import { useQuestionLanguageChoice } from "@/components/QuestionLanguageChoice";
import { catalogLocale, isLocale, type LocaleCode } from "@/lib/i18n/locales";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { effectiveDigMode, v4AskConfig, v4RoomQuery, type V4AskSettings } from "./askConfig";
import type { DigMode, ReadingLevel } from "./types";

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
  | Readonly<{ kind: "STARTED"; runId: string }>
  | Readonly<{ kind: "STOPPED" }>
  /** ASK-5 (V3 ruling L-USE-STICKS): `acceptedQuestion` is the rewrite the person chose ("Use this version") before the
   * refusal, so the next Start can send it again instead of asking a second time. */
  | Readonly<{ kind: "REFUSED"; message: string; acceptedQuestion?: string }>;

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

export function useV4Ask(input: Readonly<{
  catalog: MessageCatalog; homeCatalog: MessageCatalog; newDebateCatalog: MessageCatalog;
  locale: string; crisisCountryHint: string | null; mode: DigMode; readingLevel: ReadingLevel;
  /** W3-4: on the map page, the dig its room read is for; absent (the ask page), the read is for a new question. */
  dig?: V4DigRoom | null;
}>): Readonly<{
  /** W3-4: a dig sends its `parent` (the debate it digs, its places, mode and picks); a new question sends none. */
  submit(questionLine: string, mode: DigMode, origin?: V4AskOrigin, parent?: AskParent | null): Promise<V4AskOutcome>;
  /** ASK-3: whether this text reads as a person in crisis (the page enables Start for it even when it is short). */
  flagsCrisis(text: string): boolean;
  room: AskRoom | null;
  planTier: "free" | "premium";
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
  const [room, setRoom] = useAskRoom(contractClient, roomQuery);

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

  // The latest state, for a submit fired later (a dig sends after its 10-second Undo): never a stale closure.
  const live = React.useRef({ planTier, shapeSettings, lengthSettings, readingLevel, room, catalog, newDebateCatalog,
    pageLocale, consent, crisis, languageChoice });
  React.useEffect(() => {
    live.current = { planTier, shapeSettings, lengthSettings, readingLevel, room, catalog, newDebateCatalog,
      pageLocale, consent, crisis, languageChoice };
  });

  const submit = React.useCallback(async (questionLine: string, askMode: DigMode, origin: V4AskOrigin = "ask",
    parent: AskParent | null = null): Promise<V4AskOutcome> => {
    if (submitFlight.current) return STOPPED;
    const now = live.current;
    const question = questionLine.trim();
    const dig = origin === "dig";
    // V, 2026-09-30: a question that reads as a person in crisis gets help numbers, never a debate — before anything else.
    // ASK-4: a dig is AI-written text around a question that already passed this check, so the page's check is skipped
    // for it (the API's own gate still runs; its refusal is answered below without the help pop-up).
    if (!dig && now.crisis.offerIfCrisis(question)) return STOPPED;
    if (question.length < QUESTION_MIN_LENGTH) return { kind: "REFUSED", message: t(now.catalog, "v4.askError.tooShort") };
    // Sentence D: one question already waits.
    if (now.room?.room === "ALREADY_WAITING") return { kind: "REFUSED", message: t(now.catalog, "v4.askError.alreadyWaiting") };
    submitFlight.current = true;
    setSubmitting(true);
    let askSettings = settingsFor(now.planTier, now.shapeSettings, now.lengthSettings);
    const askRoomQuery = (): ReturnType<typeof v4RoomQuery> => v4RoomQuery(askMode, now.readingLevel, askSettings);
    // ASK-5: the rewrite the person accepted in this press, returned with any later refusal.
    let acceptedRewrite: string | undefined;
    const refused = (message: string): V4AskOutcome => (acceptedRewrite === undefined
      ? { kind: "REFUSED", message }
      : { kind: "REFUSED", message, acceptedQuestion: acceptedRewrite });
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
      let debate: { id: string } | null = null;
      while (debate === null) {
        // Rebuilt on every pass: the one retry after a 409 settings-changed (ASK-7) sends the adopted switches.
        const config = v4AskConfig(askMode, now.readingLevel, askSettings, new Date(), now.newDebateCatalog);
        // Question language (spec 2026-10-13; ruling CR-5, D1 order), exactly as /new: the page's language goes with the
        // ask only once the room said the shape row is in force (L-SITELANG-GATED); one offer per press, a second offer
        // is answered with the person's own wording, a stale reference is checked once more without a choice.
        const sendsLanguage = askSettings.shapeSettings;
        try {
          // W3-4: a dig's parent rides with every pass of the same press (today's calls when there is none).
          const sentParent = parent ?? undefined;
          debate = !sendsLanguage
            ? sentParent === undefined
              ? await createDebate(next.line, config, COOKIE_SESSION_MARKER)
              : await createDebate(next.line, config, COOKIE_SESSION_MARKER, undefined, undefined, sentParent)
            : await createDebate(next.line, config, COOKIE_SESSION_MARKER, undefined,
              next.choice === undefined ? { siteLanguage } : { siteLanguage, choice: next.choice }, sentParent);
        } catch (refusal) {
          // Today's one retry after the consent screen; it is not one of the four asks.
          if (isSensitiveDataConsentRefusal(refusal) && !consentRetried) {
            consentRetried = true;
            if (!await now.consent.ensureConsent({ known: "required" })) return STOPPED;
            continue;
          }
          // ASK-7: V4 shows none of the switches a 409 names, so the room is read again, its version adopted (R50/R51)
          // and the ask sent ONCE more; only a second refusal (or a re-read naming no version) reaches the person.
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
      return { kind: "STARTED", runId: debate.id };
    } catch (exc) {
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
        return refused(shown?.room === "ALREADY_WAITING"
          ? t(now.catalog, "v4.askError.alreadyWaiting")
          : requestFailureMessage("DEBATE_CREATE", exc, now.newDebateCatalog));
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
      {consent.declined ? (
        <p className="sensitiveConsentDeclined" role="status">{t(homeCatalog, "home.sensitiveConsent.declined")}</p>
      ) : null}
      {consent.dialog}
      {crisis.dialog}
      {languageChoice.dialog}
    </>
  );

  return { submit, flagsCrisis, room, planTier, submitting, dialogs };
}
