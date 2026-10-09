"use client";

import { ContractHttpError } from '@debateai/contract';
import { clearPhoneCompletionDraft, phoneCompletionDraftForOwner, consumePhoneDraftUpdate, savePhoneCompletionDraft, type PhoneDraftForm, type SubmittedPhoneDraft } from '@/lib/phoneCompletionDraft';
import { PhoneProfileCard } from '@/components/PhoneProfileCard';
import settingsEnglish from '@/messages/en/settings.json';
import authEnglish from '@/messages/en/auth.json';
import newDebateEnglish from '@/messages/en/newDebate.json';
import { AiNotice } from "@/components/AiNotice";

import { CSSProperties, FormEvent, KeyboardEvent, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { EXPANSION_DEPTH_MAX, EXPANSION_DEPTH_MIN } from "@debateai/contract";
import { createDebate, contractClient } from "@/lib/api";
import { modelDot } from "@/lib/models";
import { SCRUTINY_DEPTHS, ScrutinyDepth } from "@/lib/scrutinyDepth";
import { classifyRequestFailure, requestFailureMessage } from "@/lib/v3/requestFailure";
import { AuthGate } from "@/components/AuthGate";
import { RoomNotice } from "@/components/billing/RoomNotice";
import { UsageBars } from "@/components/billing/UsageBars";
import { readAskRoom, useAskRoom, waitingRoomOf, type AskRoom } from "@/lib/billing/room";
import { SupportWidget } from "@/components/support/SupportWidget";
import { isSensitiveDataConsentRefusal, useSensitiveDataConsent } from "@/components/SensitiveDataConsent";
import { isCrisisSupportRefusal, useCrisisSupport } from "@/components/CrisisSupport";
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
  buildNewDebateAskConfig,
  DECISION_SCOPE_DEFAULT,
  dateTimeLocalValue,
  deriveSessionAskDefaults,
  PROVISIONAL_COMPOSITION_BUDGET_DEFAULT,
  type CompositionBudgetTier,
  type RiskTier
} from "./defaults";
import billingEnglish from "@/messages/en/billing.json";

// NEXT_PUBLIC is intentionally a direct reference so Next inlines this public build flag.
const displayPlanTierRosters = previewPlanRoster(process.env.NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON, PLAN_TIER_ROSTERS);

type AdaptiveDepthMode = "fixed" | "manual" | "recommended" | "adaptive";

const DEPTH_MODE_OPTIONS: Array<{ value: AdaptiveDepthMode; labelKey: string }> = [
  { value: "fixed", labelKey: "newDebate.fixed" },
  { value: "manual", labelKey: "newDebate.manual" },
  { value: "recommended", labelKey: "newDebate.recommended" },
  { value: "adaptive", labelKey: "newDebate.adaptive" }
];

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
  settingsCatalog = settingsEnglish,
  authCatalog = authEnglish,
  crisisCountryHint = null
}: {
  settingsCatalog?: MessageCatalog;
  authCatalog?: MessageCatalog;
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
        <NewDebateForm token={token} settingsCatalog={settingsCatalog} authCatalog={authCatalog} catalog={catalog} homeCatalog={homeCatalog} chromeCatalog={chromeCatalog} locale={locale} billingCatalog={billingCatalog} crisisCountryHint={crisisCountryHint} />
      )}</AuthGate>
    </Suspense>
  );
}

function NewDebateForm({
  settingsCatalog,
  authCatalog,
  token,
  catalog = newDebateEnglish,
  homeCatalog,
  chromeCatalog,
  locale,
  billingCatalog,
  crisisCountryHint
}: {
  settingsCatalog: MessageCatalog;
  authCatalog: MessageCatalog;
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
  const [depthMode, setDepthMode] = useState<AdaptiveDepthMode>("fixed");
  const [scrutiny, setScrutiny] = useState<ScrutinyDepth>("standard");
  const [depth, setDepth] = useState(2);
  const [branching, setBranching] = useState(2);
  const [concurrency, setConcurrency] = useState(3);
  const [maxTokens, setMaxTokens] = useState(800);
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
  type SubmittedDraft = SubmittedPhoneDraft;
  const [phoneCompletion, setPhoneCompletion] = useState<SubmittedDraft | null>(null);
  const submittedDraft = useRef<SubmittedDraft | null>(null);
  const submitFlight = useRef(false);
  const [providerRetry, setProviderRetry] = useState<SubmittedDraft | null>(null);
  const formSnapshot = useRef<PhoneDraftForm>(null!);
  formSnapshot.current = { topic, planTier, optionsOpen, depthMode, scrutiny, depth, branching, concurrency, maxTokens, riskTier, riskTierWasEdited, budgetTier, decisionScope, asOf };
  const consent = useSensitiveDataConsent({ catalog: homeCatalog, locale });
  const crisis = useCrisisSupport({ catalog: homeCatalog, locale, countryHint: crisisCountryHint });
  // Budget spec §2.11: the room for the ask this form would send. It is a
  // word (FITS/CLOSE/FULL/ALREADY_WAITING), never a figure.
  const [room, setRoom] = useAskRoom(contractClient, {
    plan_tier: planTier, composition_budget_tier: budgetTier, depth
  });
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
      const preserved = phoneCompletionDraftForOwner(session.asker_id);
      if (preserved) {
        const v = preserved.form;
        setTopic(v.topic); setPlanTier(v.planTier); followedTier.current = v.planTier;
        setOptionsOpen(v.optionsOpen); setDepthMode(v.depthMode); setScrutiny(v.scrutiny);
        setDepth(v.depth); setBranching(v.branching); setConcurrency(v.concurrency); setMaxTokens(v.maxTokens);
        setRiskTier(v.riskTier); setRiskTierWasEdited(v.riskTierWasEdited); setBudgetTier(v.budgetTier); setDecisionScope(v.decisionScope); setAsOf(v.asOf);
        submittedDraft.current = preserved.submitted;
        if (preserved.phase === 'phone-required') setPhoneCompletion(preserved.submitted);
        else if (preserved.phase === 'updated') setProviderRetry(consumePhoneDraftUpdate(preserved.id, session.asker_id));
        setSessionDefaultsError(null);
        return;
      }
      const defaults = deriveSessionAskDefaults(session, new Date(), catalog);
      setModelScorecard(session.model_scorecard_in_force === true ? "IN_FORCE" : "NOT_IN_FORCE");
      setDecisionScope((current) => current.trim().length > 0 ? current : defaults.decisionScope);
      setAsOf(defaults.asOf);
      setSessionDefaultsError(null);
    }).catch((failure: unknown) => {
      if (!active) return;
      if (failure instanceof ContractHttpError && (failure.status === 401 || failure.status === 403)) clearPhoneCompletionDraft();
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
    setDepthMode("fixed");
    setScrutiny("standard");
    setBranching(2);
    setConcurrency(3);
    setMaxTokens(800);
  }

  const strengthControl = modelStrengthControl({ scorecard: modelScorecard, planTier });
  const askAsOf = new Date(asOf);
  // The button becomes ready only for the complete ask that will be submitted.
  // UX-01 makes machine-derived values visible and editable rather than hidden.
  const ready =
    topic.trim().length > 6 &&
    depth >= EXPANSION_DEPTH_MIN && depth <= EXPANSION_DEPTH_MAX &&
    riskTier.length > 0 &&
    budgetTier.length > 0 &&
    decisionScope.trim().length > 0 &&
    asOf.trim().length > 0 &&
    !Number.isNaN(askAsOf.valueOf());

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitFlight.current || phoneCompletion !== null) return;
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
        asOfWasEdited: false,
        riskTierWasEdited,
        // A21 O4: a locked control sends nothing, so the deployment's own default applies.
        modelStrength: strengthControl.locked ? null : modelStrength
      }, submitTime, catalog);
      submittedDraft.current = { topic: topic.trim(), config, query: { plan_tier: planTier, composition_budget_tier: budgetTier, depth } };
      let debate;
      try {
        debate = await createDebate(topic.trim(), config, token);
      } catch (refusal) {
        if (!isSensitiveDataConsentRefusal(refusal)) throw refusal;
        if (!await consent.ensureConsent({ known: "required" })) return;
        debate = await createDebate(topic.trim(), config, token);
      }
      clearPhoneCompletionDraft();
      router.push(`/debate/${encodeURIComponent(debate.id)}?starting=1`);
    } catch (exc) {
      if (exc instanceof ContractHttpError && exc.serverCode === 'ACCOUNT_PHONE_REQUIRED' && submittedDraft.current) {
        setPhoneCompletion(submittedDraft.current);
        return;
      }
      if (isCrisisSupportRefusal(exc)) {
        crisis.offer();
        return;
      }
      // DL3-F7: see lib/v3/requestFailure.ts. ALREADY_WAITING is answered by
      // the room notice (sentence D, with its start time), not by a banner:
      // from the room re-read, or, when that read fails, from the refusal's
      // own body. The banner is the last fallback, when neither has a time.
      if (classifyRequestFailure("DEBATE_CREATE", exc).kind === "ALREADY_WAITING") {
        const fresh = await readAskRoom(contractClient, {
          plan_tier: planTier, composition_budget_tier: budgetTier, depth
        });
        const shown = fresh === null ? waitingRoomOf(exc) : fresh;
        setRoom(shown);
        if (shown?.room !== "ALREADY_WAITING") setError(requestFailureMessage("DEBATE_CREATE", exc, catalog));
      } else {
        setError(requestFailureMessage("DEBATE_CREATE", exc, catalog));
      }
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

  async function retryCompletedPhone(restored?: SubmittedDraft) {
    const draft = restored ?? phoneCompletion;
    if (!draft || submitFlight.current) return;
    submitFlight.current = true; setSubmitting(true); setError(null); setPhoneCompletion(null);
    try {
      if (crisis.offerIfCrisis(draft.topic)) return;
      if (!await consent.ensureConsent()) return;
      let debate;
      try { debate = await createDebate(draft.topic, draft.config, token); }
      catch (refusal) {
        if (!isSensitiveDataConsentRefusal(refusal)) throw refusal;
        if (!await consent.ensureConsent({ known: "required" })) return;
        debate = await createDebate(draft.topic, draft.config, token);
      }
      clearPhoneCompletionDraft();
      router.push(`/debate/${encodeURIComponent(debate.id)}?starting=1`);
    } catch (failure) {
      if (failure instanceof ContractHttpError && failure.serverCode === 'ACCOUNT_PHONE_REQUIRED') setPhoneCompletion(draft);
      else if (isCrisisSupportRefusal(failure)) crisis.offer();
      else if (classifyRequestFailure('DEBATE_CREATE', failure).kind === 'ALREADY_WAITING') {
        const fresh = await readAskRoom(contractClient, draft.query);
        const shown = fresh === null ? waitingRoomOf(failure) : fresh; setRoom(shown);
        if (shown?.room !== 'ALREADY_WAITING') setError(requestFailureMessage('DEBATE_CREATE', failure, catalog));
      } else setError(requestFailureMessage('DEBATE_CREATE', failure, catalog));
    } finally { submitFlight.current = false; setSubmitting(false); }
  }

  useEffect(() => {
    if (!providerRetry) return;
    setProviderRetry(null);
    void retryCompletedPhone(providerRetry);
  }, [providerRetry]);

  return (
    <div className="screen scroll ndScreen">
      <div className="ndInner">
        <p className="ndEyebrow">{t(catalog, "newDebate.eyebrow")}</p>
        <h1 className="ndTitle">{t(catalog, "newDebate.title")}</h1>
        <div className="ndAiDisclosure"><AiNotice catalog={noticeCatalog} body={t(catalog, "newDebate.aiNotice")} /></div>
        <UsageBars catalog={billingCatalog} locale={locale} onPlan={rememberPlan} onFunding={rememberFunding} />
        {phoneCompletion ? <PhoneProfileCard completion catalog={settingsCatalog} authCatalog={authCatalog} onUpdated={retryCompletedPhone} onBeforeProviderRedirect={async ({isCurrent}) => { return phoneCompletion ? await savePhoneCompletionDraft(contractClient, () => formSnapshot.current, phoneCompletion, isCurrent) : false; }} onCancel={() => { clearPhoneCompletionDraft(); setPhoneCompletion(null); }}/> : null}
      <form onSubmit={submit} onKeyDown={onKeyDown}>
          {error ? <div className="error" style={{ marginTop: 16 }}>{error}</div> : null}
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
                ref={grow}
                rows={1}
                value={topic}
                onChange={(event) => {
                  setTopic(event.target.value);
                  grow(event.currentTarget);
                }}
                placeholder={t(catalog, "newDebate.topicPlaceholder")}
                autoFocus
                required
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

          {sessionDefaultsError ? <div className="error" style={{ marginTop: 14 }}>{sessionDefaultsError}</div> : null}

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
              {/*
                DR-115 honesty: the ruled Tree depth control is on the default
                surface. The legacy V2 knobs below are named as not carried
                rather than quietly posted into a config the ask builder drops.
              */}
              <p className="ndLegacyNotice">
                {t(catalog, "newDebate.legacyNotice")}
              </p>
              <SelectRow
                id="depthMode"
                label={t(catalog, "newDebate.depthMode")}
                hint={t(catalog, "newDebate.selectionStrategy")}
                value={depthMode}
                disabled={planTier === "free"}
                onChange={(value) => setDepthMode(value as AdaptiveDepthMode)}
                options={DEPTH_MODE_OPTIONS.map((option) => ({ value: option.value, label: t(catalog, option.labelKey) }))}
              />
              <SelectRow
                id="scrutinyDepth"
                label={t(catalog, "newDebate.scrutinyDepth")}
                hint={t(catalog, `newDebate.scrutiny${scrutiny === "standard" ? "Standard" : scrutiny === "deep" ? "Deep" : "Exhaustive"}Hint`)}
                value={scrutiny}
                disabled={planTier === "free"}
                onChange={(value) => setScrutiny(value as ScrutinyDepth)}
                options={SCRUTINY_DEPTHS.map((depth) => ({
                  value: depth,
                  label: t(catalog, `newDebate.scrutiny${depth === "standard" ? "Standard" : depth === "deep" ? "Deep" : "Exhaustive"}`)
                }))}
              />
              <SliderRow
                id="branchingWidth"
                label={t(catalog, "newDebate.branchingWidth")}
                hint={t(catalog, "newDebate.branchingHint")}
                min={1}
                max={4}
                value={branching}
                disabled={planTier === "free"}
                onChange={setBranching}
              />
              <SliderRow
                id="concurrency"
                label={t(catalog, "newDebate.concurrency")}
                hint={t(catalog, "newDebate.concurrencyHint")}
                min={1}
                max={6}
                value={concurrency}
                disabled={planTier === "free"}
                onChange={setConcurrency}
              />
              <SliderRow
                id="maxTokens"
                label={t(catalog, "newDebate.maxTokens")}
                hint={t(catalog, "newDebate.maxTokensHint")}
                min={128}
                max={4000}
                step={32}
                value={maxTokens}
                disabled={planTier === "free"}
                onChange={setMaxTokens}
              />
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
            <button data-support-primary-control type="submit" className="ndStart" disabled={!(ready || crisis.flags(topic)) || submitting || phoneCompletion !== null || (room?.room === "ALREADY_WAITING" && !crisis.flags(topic))}>
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
  onChange
}: {
  field: string;
  label: string;
  hint: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="ndRow">
      <div className="ndRowText">
        <div className="ndLabel" id={`${field}-label`}>{label}</div>
        <div className="ndHint" id={`${field}-hint`}>{hint}</div>
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
  options: ReadonlyArray<{ value: string; label: string }>;
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
            <option key={option.value} value={option.value}>{option.label}</option>
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
  max,
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
  step?: number;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
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
