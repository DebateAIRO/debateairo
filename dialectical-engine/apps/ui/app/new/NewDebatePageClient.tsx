"use client";

import newDebateEnglish from '@/messages/en/newDebate.json';
import { AiNotice } from "@/components/AiNotice";

import { CSSProperties, FormEvent, KeyboardEvent, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { EXPANSION_DEPTH_MAX, EXPANSION_DEPTH_MIN, expansionDepthMaxFor, type QuestionLanguageChoice } from "@debateai/contract";
import { createDebate, contractClient } from "@/lib/api";
import { modelDot } from "@/lib/models";
import {
  classifyRequestFailure,
  isQuestionLanguageCheckStale,
  QuestionLanguageChoiceNeededError,
  requestFailureMessage
} from "@/lib/v3/requestFailure";
import { AuthGate } from "@/components/AuthGate";
import { RoomNotice } from "@/components/billing/RoomNotice";
import { UsageBars } from "@/components/billing/UsageBars";
import { readAskRoom, useAskRoom, waitingRoomOf, type AskRoom, type AskRoomQuery } from "@/lib/billing/room";
import { SupportWidget } from "@/components/support/SupportWidget";
import { isSensitiveDataConsentRefusal, useSensitiveDataConsent } from "@/components/SensitiveDataConsent";
import { isCrisisSupportRefusal, useCrisisSupport } from "@/components/CrisisSupport";
import { useQuestionLanguageChoice } from "@/components/QuestionLanguageChoice";
import { catalogLocale, isLocale, type LocaleCode } from "@/lib/i18n/locales";
import { PLAN_TIER_ROSTERS } from "@debateai/contract";
import type { ModelStrength } from "@debateai/kernel";
import {
  MODEL_STRENGTH_KEYS,
  MODEL_STRENGTH_OPTIONS,
  PLAN_CARD_KEYS,
  isModelStrength,
  modelStrengthControl,
  planCardNamesRoster,
  type ScorecardSignal
} from "@/lib/modelStrength";
import { previewPlanRoster } from "@/lib/previewPlanRoster";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import {
  ANSWER_LENGTHS,
  answerLengthHintVars,
  buildNewDebateAskConfig,
  DECISION_SCOPE_DEFAULT,
  DEPTH_MODES,
  dateTimeLocalValue,
  deriveSessionAskDefaults,
  fixedDepthAllowedFor,
  PROVISIONAL_COMPOSITION_BUDGET_DEFAULT,
  SCRUTINY_LEVELS,
  type AnswerLength,
  type CompositionBudgetTier,
  type DepthMode,
  type RiskTier,
  type Scrutiny
} from "./defaults";
import billingEnglish from "@/messages/en/billing.json";

// NEXT_PUBLIC is intentionally a direct reference so Next inlines this public build flag.
const displayPlanTierRosters = previewPlanRoster(process.env.NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON, PLAN_TIER_ROSTERS);
// Owner ruling 2026-10-10: a preview build (its public model-list flag is set) offers a shallower ceiling,
// declared beside the depth bound in @debateai/contract; hosted builds keep the whole range.
const depthMax = expansionDepthMaxFor(process.env.NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON !== undefined);

/*
 * Question language (spec 2026-10-13; P2L Task 18, ruling CR-5): one press of "Start debate" makes at
 * most four asks — the first, the answer to the offer, one re-check after a stale reference, and the
 * answer to a second offer — plus today's one retry after the consent screen.
 */
const LANGUAGE_ASKS_PER_PRESS = 4;

/*
 * Debate shape P2c (spec 2026-10-12 §3.2, rulings S6–S8): Depth mode, Depth of scrutiny and
 * Answer length are real choices sent with the ask. These tables hold each value's words.
 */
const DEPTH_MODE_WORDS: Readonly<Record<DepthMode, { label: string; help: string }>> = {
  adaptive: { label: "newDebate.adaptive", help: "newDebate.depthModeAdaptiveHelp" },
  fixed: { label: "newDebate.fixed", help: "newDebate.depthModeFixedHelp" }
};
const SCRUTINY_WORDS: Readonly<Record<Scrutiny, { label: string; help: string }>> = {
  standard: { label: "newDebate.scrutinyStandard", help: "newDebate.scrutinyStandardHelp" },
  deep: { label: "newDebate.scrutinyDeep", help: "newDebate.scrutinyDeepHelp" },
  exhaustive: { label: "newDebate.scrutinyExhaustive", help: "newDebate.scrutinyExhaustiveHelp" }
};
const ANSWER_LENGTH_WORDS: Readonly<Record<AnswerLength, string>> = {
  short: "newDebate.answerLengthShort",
  standard: "newDebate.answerLengthStandard",
  detailed: "newDebate.answerLengthDetailed"
};

const RISK_TIER_OPTIONS: ReadonlyArray<{ value: RiskTier; labelKey: string }> = [
  { value: "casual", labelKey: "newDebate.casual" },
  { value: "standard", labelKey: "newDebate.standard" },
  { value: "high-stakes", labelKey: "newDebate.highStakes" }
];

const BUDGET_TIER_OPTIONS: ReadonlyArray<{ value: CompositionBudgetTier; labelKey: string }> = [
  { value: "low", labelKey: "newDebate.low" },
  { value: "medium", labelKey: "newDebate.medium" },
  { value: "high", labelKey: "newDebate.high" }
];

const PLAN_TIER_OPTIONS = [
  { value: "free", nameKey: "newDebate.free", promiseKey: "newDebate.freePromise" },
  { value: "premium", nameKey: "newDebate.premium", promiseKey: "newDebate.premiumPromise" }
] as const;

type PlanTier = (typeof PLAN_TIER_OPTIONS)[number]["value"];
type DecidedPlan = NonNullable<AskRoom["plan_id"]>;

/** Ruling Q-8: the line that stands where the chooser was, once the server's plan is known. */
const CURRENT_PLAN_KEYS: Readonly<Record<DecidedPlan, string>> = Object.freeze({
  FREE: "newDebate.plan.current.FREE",
  PLUS: "newDebate.plan.current.PLUS",
  PRO: "newDebate.plan.current.PRO",
  MAX: "newDebate.plan.current.MAX"
});

/* The document draws every text field at its resting height — one line for the
   question — so the field grows with its content instead of scrolling inside a
   fixed frame. A ref callback rather than a hook, because it also has to run for
   a topic arriving in the query string. */
function grow(field: HTMLTextAreaElement | null): void {
  if (field === null) return;
  field.style.height = "auto";
  // scrollHeight covers content and padding; these fields are border-box, so
  // the border has to be added back or each one settles a border short.
  const border = field.offsetHeight - field.clientHeight;
  field.style.height = `${field.scrollHeight + border}px`;
}

export default function NewDebatePageClient({
  catalog,
  homeCatalog,
  chromeCatalog,
  locale = "en",
  billingCatalog = billingEnglish,
  crisisCountryHint = null
}: {
  catalog: MessageCatalog;
  homeCatalog: MessageCatalog;
  chromeCatalog: MessageCatalog;
  /** The interface locale, recorded with the sensitive-data consent. */
  locale?: string;
  /** The locale's `billing` catalogue: the usage bars (paid-plans spec §2.10). */
  billingCatalog?: MessageCatalog;
  /** The edge's country, so the crisis screen shows that country's helplines first. */
  crisisCountryHint?: string | null;
}) {
  return (
    <Suspense fallback={null}>
      <AuthGate catalog={catalog}>{(token) => (
        <NewDebateForm token={token} catalog={catalog} homeCatalog={homeCatalog} chromeCatalog={chromeCatalog} locale={locale} billingCatalog={billingCatalog} crisisCountryHint={crisisCountryHint} />
      )}</AuthGate>
    </Suspense>
  );
}

function NewDebateForm({
  token,
  catalog = newDebateEnglish,
  homeCatalog,
  chromeCatalog,
  locale,
  billingCatalog,
  crisisCountryHint
}: {
  token: string;
  catalog: MessageCatalog;
  homeCatalog: MessageCatalog;
  chromeCatalog: MessageCatalog;
  locale: string;
  billingCatalog: MessageCatalog;
  crisisCountryHint: string | null;
}) {
  // Everything the AI notice can read, in every variant: home + chrome (+ newDebate).
  const noticeCatalog = { ...homeCatalog, ...chromeCatalog, ...catalog };
  const router = useRouter();
  const searchParams = useSearchParams();
  const [topic, setTopic] = useState(searchParams.get("topic") ?? "");
  const [planTier, setPlanTier] = useState<PlanTier>("free");
  const [optionsOpen, setOptionsOpen] = useState(false);
  // S6: Adaptive by default; S7: Standard scrutiny by default.
  const [depthMode, setDepthMode] = useState<DepthMode>("adaptive");
  const [scrutiny, setScrutiny] = useState<Scrutiny>("standard");
  const [depth, setDepth] = useState(2);
  // S8: Answer length is every plan's choice, so choosing Free never resets it.
  const [answerLength, setAnswerLength] = useState<AnswerLength>("standard");
  const [riskTier, setRiskTier] = useState("standard");
  const [riskTierWasEdited, setRiskTierWasEdited] = useState(false);
  // A21: null = the asker has not chosen; the ask then omits model_strength.
  const [modelStrength, setModelStrength] = useState<ModelStrength | null>(null);
  // A21 O4: the control unlocks only once the session says a scored model list is in force.
  // A21.3 carry 14 / fix round 1: PENDING until the session answers, READ_FAILED if it cannot be read.
  const [modelScorecard, setModelScorecard] = useState<ScorecardSignal>("PENDING");
  const [budgetTier, setBudgetTier] = useState<CompositionBudgetTier>(PROVISIONAL_COMPOSITION_BUDGET_DEFAULT);
  const [decisionScope, setDecisionScope] = useState<string>(DECISION_SCOPE_DEFAULT);
  const [asOf, setAsOf] = useState(() => dateTimeLocalValue(new Date()));
  const [sessionDefaultsError, setSessionDefaultsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submitFlight = useRef(false);
  // Start is disabled while a press of it runs, which drops keyboard focus to the page. When the
  // consent or crisis screen then closes, focus comes back to the question instead.
  const topicField = useRef<HTMLTextAreaElement | null>(null);
  const consent = useSensitiveDataConsent({ catalog: homeCatalog, locale, returnFocusRef: topicField });
  const crisis = useCrisisSupport({ catalog: homeCatalog, locale, countryHint: crisisCountryHint, returnFocusRef: topicField });
  // Question language (spec 2026-10-13): the page's language goes with the question (PF-L56: `locale` is a string).
  const pageLocale: LocaleCode = isLocale(locale) ? locale : "en";
  const languageChoice = useQuestionLanguageChoice({ catalog, locale: pageLocale });
  const topicRef = useCallback((field: HTMLTextAreaElement | null) => {
    topicField.current = field;
    grow(field);
  }, []);
  // "Edit" on the language pop-up puts the person back in the question box. Focus moves in an effect,
  // so it lands after the closing pop-up has handed focus back to whatever opened it.
  const [topicFocusRequest, setTopicFocusRequest] = useState(0);
  useEffect(() => {
    if (topicFocusRequest > 0) topicField.current?.focus();
  }, [topicFocusRequest]);
  // The box grows with its content; "Use this version" changes it without a keystroke (L-USE-STICKS).
  useEffect(() => { grow(topicField.current); }, [topic]);
  // Budget spec §2.11: the room for the ask this form would send. It is a
  // word (FITS/CLOSE/FULL/ALREADY_WAITING), never a figure.
  // Debate shape P2c (Contract deviation 7): true once a room read has said the deployment's shape row is
  // in force. Kept for the page's life, like the decided plan below: a later failed, refused or
  // ALREADY_WAITING read never hides the controls mid-edit. Without it the page offers and sends none of
  // the three settings, which the API would otherwise drop without a word.
  const [shapeSettings, setShapeSettings] = useState(false);
  // Length guidance (spec 2026-10-15 §3.8): true once a room read said the length row is in force; kept for the page's
  // life like shapeSettings. With it alone the page offers and sends the answer length only.
  const [lengthSettings, setLengthSettings] = useState(false);
  // The plan's three answer targets from the room read (null: none named; the hint shows its own fallback numbers).
  const [answerWords, setAnswerWords] = useState<Readonly<{ short: number; standard: number; detailed: number }> | null>(null);
  // Contract deviation 9: the room is read for the ask this form would send, the three choices included
  // exactly when they are shown (and so sent).
  const roomQuery: AskRoomQuery = {
    plan_tier: planTier, composition_budget_tier: budgetTier, depth,
    ...(shapeSettings ? { depth_mode: depthMode, scrutiny, answer_length: answerLength }
      : lengthSettings ? { answer_length: answerLength } : {})
  };
  const [room, setRoom] = useAskRoom(contractClient, roomQuery);
  useEffect(() => {
    if (room?.shape_settings === true) setShapeSettings(true);
    if (room?.length_settings === true) setLengthSettings(true);
    if (room?.answer_words !== undefined) setAnswerWords(room.answer_words);
  }, [room]);
  // Paid plans (spec 2026-09-29 §2.3.4; ruling Q-8): the plan the SERVER decided
  // for this person (B8), as the room read (and B10c's usage read) names it. It
  // is remembered once known: a later failed or plan-less read never clears it,
  // so the chooser below never comes back. Null with billing off or locally.
  const [decidedPlan, setDecidedPlan] = useState<DecidedPlan | null>(null);
  const [internalFunding,setInternalFunding]=useState<Readonly<{kind:"INTERNAL";expires_at:string}>|null>(null);
  const rememberFunding=useCallback((funding:Readonly<{kind:"INTERNAL";expires_at:string}>|null)=>setInternalFunding(funding),[]);
  useEffect(()=>{
    if(internalFunding===null)return;
    let timer:ReturnType<typeof setTimeout>;
    const expire=()=>{const remaining=Date.parse(internalFunding.expires_at)-Date.now();if(remaining<=0)setInternalFunding(null);else timer=setTimeout(expire,Math.min(2147483647,remaining));};
    expire();return()=>clearTimeout(timer);
  },[internalFunding]);
  const rememberPlan = useCallback((planId: DecidedPlan | null) => {
    if (planId !== null) setDecidedPlan(planId);
  }, []);
  useEffect(() => {
    if (room !== null) { rememberPlan(room.plan_id); rememberFunding("funding" in room ? room.funding : null); }
  }, [room, rememberPlan, rememberFunding]);
  const decidedTier: PlanTier | null = internalFunding !== null ? "premium" : decidedPlan === null ? null : decidedPlan === "FREE" ? "free" : "premium";
  // Follow the decided tier ONCE per decision. Moving the form's tier changes
  // the room query and the room is read again; the guard keeps that re-read
  // from moving it a second time (or undoing what the person set since).
  const followedTier = useRef<PlanTier | null>(null);
  useEffect(() => {
    if (decidedTier === null || followedTier.current === decidedTier) return;
    followedTier.current = decidedTier;
    if (decidedTier === "free") choosePlanTier("free");
    else setPlanTier("premium");
  }, [decidedTier]);

  useEffect(() => {
    let active = true;
    void contractClient.readSession().then((session) => {
      if (!active) return;
      const defaults = deriveSessionAskDefaults(session, new Date(), catalog);
      setModelScorecard(session.model_scorecard_in_force === true ? "IN_FORCE" : "NOT_IN_FORCE");
      setDecisionScope((current) => current.trim().length > 0 ? current : defaults.decisionScope);
      setAsOf(defaults.asOf);
      setSessionDefaultsError(null);
    }).catch((failure: unknown) => {
      if (!active) return;
      setModelScorecard("READ_FAILED");
      // DL3-F7: classified copy, never the contract client's server-authored text.
      setSessionDefaultsError(requestFailureMessage("SESSION_DEFAULTS",failure,catalog));
    });
    return () => { active = false; };
  }, [catalog, token]);

  function choosePlanTier(value: PlanTier): void {
    setPlanTier(value);
    if (value !== "free") return;
    setRiskTier("standard");
    setRiskTierWasEdited(false);
    setModelStrength(null);
    setBudgetTier(PROVISIONAL_COMPOSITION_BUDGET_DEFAULT);
    setDepth(2);
    setDepthMode("adaptive");
    setScrutiny("standard");
  }

  const strengthControl = modelStrengthControl({ scorecard: modelScorecard, planTier });
  const askAsOf = new Date(asOf);
  // The button becomes ready only for the complete ask that will be submitted.
  // UX-01 makes machine-derived values visible and editable rather than hidden.
  const ready =
    topic.trim().length > 6 &&
    depth >= EXPANSION_DEPTH_MIN && depth <= depthMax &&
    riskTier.length > 0 &&
    budgetTier.length > 0 &&
    decisionScope.trim().length > 0 &&
    asOf.trim().length > 0 &&
    !Number.isNaN(askAsOf.valueOf());

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitFlight.current) return;
    // V, 2026-09-30: a question that reads as a person in crisis gets help numbers, never a
    // debate — and before anything else, the form's own rules and the consent screen included.
    if (crisis.offerIfCrisis(topic)) return;
    if (!ready) return;
    // Sentence D: one question already waits (the button is disabled too, except for a question
    // the crisis check flags, which the line above has answered).
    if (room?.room === "ALREADY_WAITING") return;
    submitFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      // V, 2026-09-29: no debate starts before the one-time sensitive-data consent.
      if (!await consent.ensureConsent()) return;
      const submitTime = new Date();
      setAsOf(dateTimeLocalValue(submitTime));
      const config = buildNewDebateAskConfig({
        planTier,
        riskTier: riskTier as RiskTier,
        budgetTier: budgetTier as CompositionBudgetTier,
        decisionScope,
        asOf,
        depth,
        // Debate shape P2c (Contract deviation 7): sent only when the room says the settings are in force.
        ...(shapeSettings ? { depthMode, scrutiny, answerLength } : lengthSettings ? { answerLength } : {}),
        asOfWasEdited: false,
        riskTierWasEdited,
        // A21 O4: a locked control sends nothing, so the deployment's own default applies.
        modelStrength: strengthControl.locked ? null : modelStrength
      }, submitTime, catalog);
      // Question language (spec 2026-10-13; ruling CR-5, D1 order). Every ask carries the page's
      // language — but only once the room read has said the shape row is in force (ruling
      // L-SITELANG-GATED, the same condition that builds the server's decider). Otherwise the call is
      // today's, byte for byte, and no offer can come back. A real mix is offered once per press; a
      // second offer in the same press is answered with the person's own wording. A stale reference is
      // never sent again: the question is checked once more, without a choice. Every other refusal goes
      // on to today's handling below.
      const sendsLanguage = shapeSettings;
      const siteLanguage = catalogLocale(pageLocale);
      const question = topic.trim();
      let next: Readonly<{ line: string; choice?: QuestionLanguageChoice }> = { line: question };
      let asks = 0;
      let consentRetried = false;
      let offerShown = false;
      let rechecked = false;
      let debate: { id: string } | null = null;
      while (debate === null) {
        try {
          debate = !sendsLanguage
            ? await createDebate(next.line, config, token)
            : await createDebate(next.line, config, token, undefined,
              next.choice === undefined ? { siteLanguage } : { siteLanguage, choice: next.choice });
        } catch (refusal) {
          // Today's one retry after the consent screen; it is not one of the four asks.
          if (isSensitiveDataConsentRefusal(refusal) && !consentRetried) {
            consentRetried = true;
            if (!await consent.ensureConsent({ known: "required" })) return;
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
            const answer = await languageChoice.ensureChoice(offer);
            if (answer === "EDIT") {
              setTopicFocusRequest((request) => request + 1);
              return;
            }
            if (answer === "USE") {
              // Ruling L-USE-STICKS: the box takes the rewrite, so a refusal on the answering call (plan,
              // daily limit, a waiting question, the network) never leaves the mixed wording for the next
              // press. `question` stays the press's own words, for the stale re-check below.
              setTopic(offer.proposed_question);
              next = { line: offer.proposed_question,
                choice: { check_ref: offer.check_ref, choice: "USE_REWRITE", original_question_line: question } };
            } else {
              next = { line: question, choice: { check_ref: offer.check_ref, choice: "KEEP_MINE" } };
            }
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
      router.push(`/debate/${encodeURIComponent(debate.id)}?starting=1`);
    } catch (exc) {
      if (isCrisisSupportRefusal(exc)) {
        crisis.offer();
        return;
      }
      // DL3-F7: see lib/v3/requestFailure.ts. ALREADY_WAITING is answered by
      // the room notice (sentence D, with its start time), not by a banner:
      // from the room re-read, or, when that read fails, from the refusal's
      // own body. The banner is the last fallback, when neither has a time.
      if (classifyRequestFailure("DEBATE_CREATE", exc).kind === "ALREADY_WAITING") {
        const fresh = await readAskRoom(contractClient, roomQuery);
        const shown = fresh === null ? waitingRoomOf(exc) : fresh;
        setRoom(shown);
        if (shown?.room !== "ALREADY_WAITING") setError(requestFailureMessage("DEBATE_CREATE", exc, catalog));
      } else {
        setError(requestFailureMessage("DEBATE_CREATE", exc, catalog));
      }
      // Start was disabled while the request ran, which drops keyboard focus to the page.
      // Put it back in the question so the reader stays in the form the alert talks about.
      window.setTimeout(() => document.getElementById("topic")?.focus(), 0);
    } finally {
      submitFlight.current = false;
      setSubmitting(false);
    }
  }

  // The footer advertises ⌃↵, so the shortcut has to work from inside the
  // multi-line fields where a bare Enter means "new line".
  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    void submit(event as unknown as FormEvent);
  }

  return (
    <div className="screen scroll ndScreen">
      <div className="ndInner">
        <p className="ndEyebrow">{t(catalog, "newDebate.eyebrow")}</p>
        <h1 className="ndTitle">{t(catalog, "newDebate.title")}</h1>
        <div className="ndAiDisclosure"><AiNotice catalog={noticeCatalog} body={t(catalog, "newDebate.aiNotice")} /></div>
        <UsageBars catalog={billingCatalog} locale={locale} onPlan={rememberPlan} onFunding={rememberFunding} />
      <form onSubmit={submit} onKeyDown={onKeyDown}>
          {error ? <div className="error" role="alert" style={{ marginTop: 16 }}>{error}</div> : null}
          {consent.declined ? (
            <p className="sensitiveConsentDeclined" role="status">{t(homeCatalog, "home.sensitiveConsent.declined")}</p>
          ) : null}

          {decidedPlan === null && internalFunding === null ? (
            <div className="ndTier" role="radiogroup" aria-label={t(catalog, "newDebate.planTier")}>
              {PLAN_TIER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  id={`planTier-${option.value}`}
                  data-field="planTier"
                  data-value={option.value}
                  aria-checked={planTier === option.value}
                  className="ndTierOption"
                  onClick={() => choosePlanTier(option.value)}
                >
                  <span className="ndTierName">{t(catalog, option.nameKey)}</span>
                  <span className="ndTierPromise">{t(catalog, option.promiseKey)}</span>
                  <PlanCardModels plan={option.value} scorecard={modelScorecard} catalog={catalog} />
                </button>
              ))}
            </div>
          ) : (
            // Paid plans (spec §2.3.4; ruling Q-8): with billing on the server
            // decides the tier (B8), so there is nothing to choose. The page names
            // the person's plan; Free's settings below stay disabled, a paid
            // plan's stay editable.
            <p className="ndPlanCurrent" data-plan={decidedPlan} data-funding={internalFunding?.kind}>{internalFunding === null ? t(catalog,CURRENT_PLAN_KEYS[decidedPlan!]) : t(billingCatalog,"billing.usage.internalTitle")}</p>
          )}

          <label className="srOnly" htmlFor="topic">
            {t(catalog, "newDebate.topic")}
          </label>
          <div className="ndTopicBezel">
            <div className="ndTopicCore">
              <textarea
                id="topic"
                className="ndTopic"
                ref={topicRef}
                rows={1}
                value={topic}
                onChange={(event) => {
                  setTopic(event.target.value);
                  grow(event.currentTarget);
                }}
                placeholder={t(catalog, "newDebate.topicPlaceholder")}
                autoFocus
                required aria-invalid="false"
              />
            </div>
          </div>

          <div className="ndCard">
            <p className="ndIntro">
              {planTier === "free"
                ? t(catalog, "newDebate.freeIntro")
                : t(catalog, "newDebate.premiumIntro")}
            </p>
            <SegmentedRow
              field="riskTier"
              label={t(catalog, "newDebate.riskTier")}
              hint={planTier === "free"
                ? t(catalog, "newDebate.riskFreeHint")
                : t(catalog, "newDebate.riskPremiumHint")}
              options={RISK_TIER_OPTIONS.map((option) => ({ value: option.value, label: t(catalog, option.labelKey) }))}
              value={riskTier}
              disabled={planTier === "free"}
              onChange={(value) => {
                setRiskTier(value);
                setRiskTierWasEdited(true);
              }}
            />
            <SegmentedRow
              field="budgetTier"
              label={t(catalog, "newDebate.budgetTier")}
              hint={planTier === "free"
                ? t(catalog, "newDebate.budgetFreeHint")
                : t(catalog, "newDebate.budgetPremiumHint")}
              options={BUDGET_TIER_OPTIONS.map((option) => ({ value: option.value, label: t(catalog, option.labelKey) }))}
              value={budgetTier}
              disabled={planTier === "free"}
              onChange={(value) => setBudgetTier(value as CompositionBudgetTier)}
            />
            <SliderRow
              id="treeDepth"
              label={t(catalog, "newDebate.treeDepth")}
              hint={t(catalog, "newDebate.treeDepthHint")}
              min={EXPANSION_DEPTH_MIN}
              max={EXPANSION_DEPTH_MAX}
              limit={depthMax}
              value={depth}
              disabled={planTier === "free"}
              onChange={setDepth}
            />
            <SegmentedRow
              field="modelStrength"
              label={t(catalog, MODEL_STRENGTH_KEYS.label)}
              hint={t(catalog, strengthControl.hintKey)}
              options={MODEL_STRENGTH_OPTIONS.map((option) => ({ value: option.value, label: t(catalog, option.labelKey) }))}
              value={strengthControl.locked ? "" : modelStrength ?? ""}
              disabled={strengthControl.locked}
              onChange={(value) => {
                if (isModelStrength(value)) setModelStrength(value);
              }}
            />
            {/* S1-2 · V ruling 2026-09-03: the two steering textareas that stood
                here are removed. Their values were collected and discarded — no
                consumer downstream reads steering_presets or steering_annotations —
                and a control that appears to steer a debate it cannot steer is
                worse than none. The contract fields stay, sent as empty arrays, so
                stored asks remain valid. Pinned by ux01-new-debate-form.test.tsx. */}
            <p className="ndProvenance">
              {t(catalog, "newDebate.provenance")}
            </p>
          </div>

          {sessionDefaultsError ? <div className="error" role="alert" style={{ marginTop: 14 }}>{sessionDefaultsError}</div> : null}

          <button
            type="button"
            className="ndOptionsToggle"
            aria-expanded={optionsOpen}
            aria-controls={optionsOpen ? "additionalRunOptions" : undefined}
            onClick={() => setOptionsOpen((value) => !value)}
          >
            ⚙ {t(catalog, "newDebate.options")} <span className="ndOptionsCaret" aria-hidden>{optionsOpen ? "▲" : "▼"}</span>
            <span className="ndOptionsRule" aria-hidden />
          </button>

          {optionsOpen ? (
            <div id="additionalRunOptions" className="ndCard ndLegacy">
              {/* Parallel calls (owner ruling 2026-10-12): no Branching width and no
                  Concurrency control here. How many calls run at once is an owner-only
                  register setting; how wide a claim branches is the algorithm's choice
                  (one support and one attack reply). */}
              {/* Debate shape P2c (Contract deviation 7): the three settings are offered only when the
                  room says they are in force; otherwise the API would drop them silently. */}
              {shapeSettings ? (
                <>
                  <SelectRow
                    id="depthMode"
                    label={t(catalog, "newDebate.depthMode")}
                    hint={t(catalog, DEPTH_MODE_WORDS[depthMode].help)}
                    value={depthMode}
                    disabled={planTier === "free"}
                    onChange={(value) => setDepthMode(value as DepthMode)}
                    options={DEPTH_MODES.map((mode) => ({
                      value: mode,
                      label: t(catalog, DEPTH_MODE_WORDS[mode].label),
                      // S6: Fixed is offered only where the plan allows it; the API normalises again.
                      disabled: mode === "fixed" && !fixedDepthAllowedFor(planTier)
                    }))}
                  />
                  <SelectRow
                    id="scrutinyDepth"
                    label={t(catalog, "newDebate.scrutinyDepth")}
                    hint={t(catalog, SCRUTINY_WORDS[scrutiny].help)}
                    value={scrutiny}
                    disabled={planTier === "free"}
                    onChange={(value) => setScrutiny(value as Scrutiny)}
                    options={SCRUTINY_LEVELS.map((level) => ({ value: level, label: t(catalog, SCRUTINY_WORDS[level].label) }))}
                  />
                </>
              ) : null}
              {/* S8 + length guidance: the answer length replaces Max tokens, is every plan's choice (Free's included)
                  and is offered with either row (spec 2026-10-15 §3.8). */}
              {shapeSettings || lengthSettings ? (
                <SegmentedRow
                  field="answerLength"
                  label={t(catalog, "newDebate.answerLength")}
                  hint={t(catalog, "newDebate.answerLengthHint", answerLengthHintVars(answerWords, pageLocale))}
                  hintHoldsFormattedNumbers
                  options={ANSWER_LENGTHS.map((length) => ({ value: length, label: t(catalog, ANSWER_LENGTH_WORDS[length]) }))}
                  value={answerLength}
                  onChange={(value) => setAnswerLength(value as AnswerLength)}
                />
              ) : null}
              <p className="ndProvenance">
                {t(catalog, "newDebate.roleOverrides")}{" "}
                <button type="button" className="ndSettingsLink" onClick={() => router.push("/settings")}>
                  {t(catalog, "newDebate.settings")}
                </button>
              </p>
            </div>
          ) : null}

          <RoomNotice room={room} catalog={{...catalog,...billingCatalog}} locale={locale} />
          <div className="ndActions">
            <button data-support-primary-control type="submit" className="ndStart" disabled={!(ready || crisis.flags(topic)) || submitting || (room?.room === "ALREADY_WAITING" && !crisis.flags(topic))}>
              {t(catalog, submitting ? "newDebate.starting" : "newDebate.startRun")} <span aria-hidden>→</span>
            </button>
            <button type="button" className="ndCancel" onClick={() => router.push("/")}>
              {t(catalog, "newDebate.cancel")}
            </button>
            <span className="ndActionsSpacer" aria-hidden />
            <span className="ndKeyHint">{t(catalog, "newDebate.keyHint")}</span>
          </div>
        </form>
        {consent.dialog}
        {crisis.dialog}
        {languageChoice.dialog}
      </div>
      <SupportWidget />
    </div>
  );
}

/* Final review C1: a plan card names its plan's usual models only while the
   session says no scored model list is in force — the one state in which that
   list is what a debate is seated with. Otherwise (in force, pending, failed)
   it carries one plain line, true in every one of those states. */
function PlanCardModels({ plan, scorecard, catalog }: { plan: PlanTier; scorecard: ScorecardSignal; catalog: MessageCatalog }) {
  if (!planCardNamesRoster(scorecard)) {
    return (
      <span className="ndTierModels">
        <span className="ndTierModelsNote">{t(catalog, PLAN_CARD_KEYS.modelsChosenPerPart)}</span>
      </span>
    );
  }
  return (
    <span className="ndTierModels">
      {displayPlanTierRosters[plan].map((modelId) => (
        <span key={modelId} className="ndTierModel">
          <span
            className="modelDot"
            style={{ "--dot": modelDot(modelId) } as CSSProperties}
            aria-hidden
          />
          {modelId}
        </span>
      ))}
    </span>
  );
}

/* The document's segmented tier control: one pill per option, the chosen one
   filled with ink. Radio semantics keep it operable without a pointer. */
function SegmentedRow({
  field,
  label,
  hint,
  options,
  value,
  disabled = false,
  hintHoldsFormattedNumbers = false,
  onChange
}: {
  field: string;
  label: string;
  hint: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  value: string;
  disabled?: boolean;
  /**
   * The hint holds numbers formatted by `Intl.NumberFormat` (the answer-length hint): the server's and the browser's
   * number data can group them differently (fr: U+202F vs U+00A0), so React must not report that text as a hydration
   * mismatch. No visible change.
   */
  hintHoldsFormattedNumbers?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="ndRow">
      <div className="ndRowText">
        <div className="ndLabel" id={`${field}-label`}>{label}</div>
        <div className="ndHint" id={`${field}-hint`} suppressHydrationWarning={hintHoldsFormattedNumbers}>{hint}</div>
      </div>
      <div className="ndSeg" role="radiogroup" aria-labelledby={`${field}-label`} aria-describedby={`${field}-hint`}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            id={`${field}-${option.value}`}
            data-field={field}
            data-value={option.value}
            aria-checked={value === option.value}
            aria-describedby={`${field}-hint`}
            className="ndSegItem"
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SelectRow({
  id,
  label,
  hint,
  value,
  disabled = false,
  onChange,
  options
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string; disabled?: boolean }>;
}) {
  return (
    <div className="ndRow">
      <div className="ndRowText">
        <label className="ndLabel" htmlFor={id}>{label}</label>
        <div className="ndHint" id={`${id}-hint`}>{hint}</div>
      </div>
      <span className="ndSelect">
        <span aria-hidden>{options.find((option) => option.value === value)?.label ?? value}</span>
        <span className="ndSelectCaret" aria-hidden>▼</span>
        <select
          id={id}
          value={value}
          disabled={disabled}
          aria-describedby={`${id}-hint`}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled === true}>{option.label}</option>
          ))}
        </select>
      </span>
    </div>
  );
}

function SliderRow({
  id,
  label,
  hint,
  min,
  max: rangeMax,
  limit,
  step = 1,
  value,
  disabled = false,
  onChange
}: {
  id: string;
  label: string;
  hint: string;
  min: number;
  max: number;
  /** A deployment's narrower ceiling inside [min, max] (the preview's depth). */
  limit?: number;
  step?: number;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const max = limit === undefined ? rangeMax : Math.min(rangeMax, limit);
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className="ndRow ndRowSlider">
      <div className="ndRowText">
        <label className="ndLabel" htmlFor={id}>{label}</label>
        <div className="ndHint" id={`${id}-hint`}>{hint}</div>
      </div>
      <span className="ndSliderWrap">
        <input
          id={id}
          className="ndSlider"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-describedby={`${id}-hint`}
          onChange={(event) => onChange(Number(event.target.value))}
          aria-label={label}
          style={{ "--nd-pct": `${pct}%` } as CSSProperties}
        />
      </span>
      <span className="ndValue">{value}</span>
    </div>
  );
}
