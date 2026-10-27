"use client";

import * as React from "react";
import type { QuestionLanguageChoice } from "@debateai/contract";
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
import { v4AskConfig, v4RoomQuery, type V4AskSettings } from "./askConfig";
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
  | Readonly<{ kind: "REFUSED"; message: string }>;

type DecidedPlan = NonNullable<AskRoom["plan_id"]>;
type InternalFunding = Readonly<{ kind: "INTERNAL"; expires_at: string }>;

const STOPPED: V4AskOutcome = Object.freeze({ kind: "STOPPED" });

export function useV4Ask(input: Readonly<{
  catalog: MessageCatalog; homeCatalog: MessageCatalog; newDebateCatalog: MessageCatalog;
  locale: string; crisisCountryHint: string | null; mode: DigMode; readingLevel: ReadingLevel;
}>): Readonly<{
  submit(questionLine: string, mode: DigMode): Promise<V4AskOutcome>;
  room: AskRoom | null;
  planTier: "free" | "premium";
  submitting: boolean;
  dialogs: React.ReactNode;
}> {
  const { catalog, homeCatalog, newDebateCatalog, locale, crisisCountryHint, mode, readingLevel } = input;
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
  const roomQuery = v4RoomQuery(mode, readingLevel, settingsFor(planTier, shapeSettings, lengthSettings));
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

  const submit = React.useCallback(async (questionLine: string, askMode: DigMode): Promise<V4AskOutcome> => {
    if (submitFlight.current) return STOPPED;
    const now = live.current;
    const question = questionLine.trim();
    // V, 2026-09-30: a question that reads as a person in crisis gets help numbers, never a debate — before anything else.
    if (now.crisis.offerIfCrisis(question)) return STOPPED;
    if (question.length < QUESTION_MIN_LENGTH) return { kind: "REFUSED", message: t(now.catalog, "v4.askError.tooShort") };
    // Sentence D: one question already waits.
    if (now.room?.room === "ALREADY_WAITING") return { kind: "REFUSED", message: t(now.catalog, "v4.askError.alreadyWaiting") };
    submitFlight.current = true;
    setSubmitting(true);
    const askSettings = settingsFor(now.planTier, now.shapeSettings, now.lengthSettings);
    const askRoomQuery = v4RoomQuery(askMode, now.readingLevel, askSettings);
    try {
      // V, 2026-09-29: no debate starts before the one-time sensitive-data consent.
      if (!await now.consent.ensureConsent()) return STOPPED;
      const config = v4AskConfig(askMode, now.readingLevel, askSettings, new Date(), now.newDebateCatalog);
      // Question language (spec 2026-10-13; ruling CR-5, D1 order), exactly as /new: the page's language goes with the
      // ask only once the room said the shape row is in force (L-SITELANG-GATED); one offer per press, a second offer is
      // answered with the person's own wording, a stale reference is checked once more without a choice.
      const sendsLanguage = now.shapeSettings;
      const siteLanguage = catalogLocale(now.pageLocale);
      let next: Readonly<{ line: string; choice?: QuestionLanguageChoice }> = { line: question };
      let asks = 0;
      let consentRetried = false;
      let offerShown = false;
      let rechecked = false;
      let debate: { id: string } | null = null;
      while (debate === null) {
        try {
          debate = !sendsLanguage
            ? await createDebate(next.line, config, COOKIE_SESSION_MARKER)
            : await createDebate(next.line, config, COOKIE_SESSION_MARKER, undefined,
              next.choice === undefined ? { siteLanguage } : { siteLanguage, choice: next.choice });
        } catch (refusal) {
          // Today's one retry after the consent screen; it is not one of the four asks.
          if (isSensitiveDataConsentRefusal(refusal) && !consentRetried) {
            consentRetried = true;
            if (!await now.consent.ensureConsent({ known: "required" })) return STOPPED;
            continue;
          }
          asks += 1;
          if (asks >= LANGUAGE_ASKS_PER_PRESS) throw refusal;
          if (refusal instanceof QuestionLanguageChoiceNeededError) {
            const offer = refusal.offer;
            if (offerShown) {
              next = { line: question, choice: { check_ref: offer.check_ref, choice: "KEEP_MINE" } };
              continue;
            }
            offerShown = true;
            const answer = await now.languageChoice.ensureChoice(offer);
            // "Edit": nothing is sent; the person is back at their question.
            if (answer === "EDIT") return STOPPED;
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
      if (isCrisisSupportRefusal(exc)) {
        now.crisis.offer();
        return STOPPED;
      }
      // Side-by-side spec §13 (Task S12): the choices for new debates changed under the page. Nothing started; the room
      // is read again and its version adopted (R50), so the next press sends the new version's ask.
      if (isAskSettingsChanged(exc)) {
        const fresh = await readAskRoom(contractClient, askRoomQuery);
        if (fresh?.settings_version === undefined) {
          settingsVersion.current = undefined;
          adoptNextVersion.current = true;
        } else {
          adoptSettingsRead(fresh);
          settingsVersion.current = fresh.settings_version;
          adoptNextVersion.current = false;
        }
        if (fresh !== null) setRoom(fresh);
        return { kind: "REFUSED", message: requestFailureMessage("DEBATE_CREATE", exc, now.newDebateCatalog) };
      }
      // DL3-F7: ALREADY_WAITING is shown by the room notice (sentence D, with its time), from the room re-read or the
      // refusal's own body; the plain V4 sentence goes with it, and /new's banner only when neither names a wait.
      if (classifyRequestFailure("DEBATE_CREATE", exc).kind === "ALREADY_WAITING") {
        const fresh = await readAskRoom(contractClient, askRoomQuery);
        const shown = fresh === null ? waitingRoomOf(exc) : fresh;
        setRoom(shown);
        return {
          kind: "REFUSED",
          message: shown?.room === "ALREADY_WAITING"
            ? t(now.catalog, "v4.askError.alreadyWaiting")
            : requestFailureMessage("DEBATE_CREATE", exc, now.newDebateCatalog)
        };
      }
      return { kind: "REFUSED", message: requestFailureMessage("DEBATE_CREATE", exc, now.newDebateCatalog) };
    } finally {
      submitFlight.current = false;
      setSubmitting(false);
    }
  }, [settingsFor, adoptSettingsRead, setRoom]);

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

  return { submit, room, planTier, submitting, dialogs };
}
