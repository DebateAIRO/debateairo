"use client";

import { AiNotice } from "@/components/AiNotice";

import { CSSProperties, FormEvent, KeyboardEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { EXPANSION_DEPTH_MAX, EXPANSION_DEPTH_MIN } from "@debateai/contract";
import { createDebate, contractClient } from "@/lib/api";
import { modelMeta } from "@/lib/models";
import { SCRUTINY_DEPTH_OPTIONS, ScrutinyDepth } from "@/lib/scrutinyDepth";
import { AuthGate } from "@/components/AuthGate";
import { SupportWidget } from "@/components/support/SupportWidget";
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
type PlanTierRosters = Readonly<Record<PlanTier, readonly string[]>>;

const EMPTY_PLAN_TIER_ROSTERS: PlanTierRosters = Object.freeze({
  free: [],
  premium: []
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
  homeCatalog
}: {
  catalog: MessageCatalog;
  homeCatalog: MessageCatalog;
}) {
  return (
    <Suspense fallback={null}>
      <AuthGate catalog={catalog}>{(token) => (
        <NewDebateForm token={token} catalog={catalog} homeCatalog={homeCatalog} />
      )}</AuthGate>
    </Suspense>
  );
}

function NewDebateForm({
  token,
  catalog,
  homeCatalog
}: {
  token: string;
  catalog: MessageCatalog;
  homeCatalog: MessageCatalog;
}) {
  const noticeCatalog = { ...homeCatalog, ...catalog };
  const router = useRouter();
  const searchParams = useSearchParams();
  const [topic, setTopic] = useState(searchParams.get("topic") ?? "");
  const [planTier, setPlanTier] = useState<PlanTier>("free");
  const [planTierRosters, setPlanTierRosters] = useState<PlanTierRosters>(EMPTY_PLAN_TIER_ROSTERS);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [depthMode, setDepthMode] = useState<AdaptiveDepthMode>("fixed");
  const [scrutiny, setScrutiny] = useState<ScrutinyDepth>("standard");
  const [depth, setDepth] = useState(2);
  const [branching, setBranching] = useState(2);
  const [concurrency, setConcurrency] = useState(3);
  const [maxTokens, setMaxTokens] = useState(800);
  const [riskTier, setRiskTier] = useState("standard");
  const [riskTierWasEdited, setRiskTierWasEdited] = useState(false);
  const [budgetTier, setBudgetTier] = useState<CompositionBudgetTier>(PROVISIONAL_COMPOSITION_BUDGET_DEFAULT);
  const [steeringPresets, setSteeringPresets] = useState("");
  const [steeringAnnotations, setSteeringAnnotations] = useState("");
  const [decisionScope, setDecisionScope] = useState<string>(DECISION_SCOPE_DEFAULT);
  const [asOf, setAsOf] = useState(() => dateTimeLocalValue(new Date()));
  const [sessionDefaultsError, setSessionDefaultsError] = useState<string | null>(null);
  const [planTierRostersError, setPlanTierRostersError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void contractClient.readSession().then((session) => {
      if (!active) return;
      const defaults = deriveSessionAskDefaults(session, new Date(), catalog);
      setDecisionScope((current) => current.trim().length > 0 ? current : defaults.decisionScope);
      setAsOf(defaults.asOf);
      setSessionDefaultsError(null);
    }).catch((failure: unknown) => {
      if (!active) return;
      setSessionDefaultsError(`ASK_SESSION_DEFAULTS_UNAVAILABLE: ${failure instanceof Error ? failure.message : t(catalog, "newDebate.sessionReadFailed")}`);
    });
    void contractClient.readPlanTiers().then((rosters) => {
      if (!active) return;
      setPlanTierRosters({ free: rosters.free, premium: rosters.premium });
      setPlanTierRostersError(null);
    }).catch((failure: unknown) => {
      if (!active) return;
      setPlanTierRosters(EMPTY_PLAN_TIER_ROSTERS);
      setPlanTierRostersError(
        `ASK_PLAN_TIER_ROSTERS_UNAVAILABLE: ${
          failure instanceof Error ? failure.message : t(catalog, "newDebate.planRosterFailed")
        }`
      );
    });
    return () => { active = false; };
  }, [catalog, token]);

  function choosePlanTier(value: PlanTier): void {
    setPlanTier(value);
    if (value !== "free") return;
    setRiskTier("standard");
    setRiskTierWasEdited(false);
    setBudgetTier(PROVISIONAL_COMPOSITION_BUDGET_DEFAULT);
    setDepth(2);
    setSteeringPresets("");
    setSteeringAnnotations("");
    setDepthMode("fixed");
    setScrutiny("standard");
    setBranching(2);
    setConcurrency(3);
    setMaxTokens(800);
  }

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
    if (!ready) return;
    setSubmitting(true);
    setError(null);
    try {
      const submitTime = new Date();
      setAsOf(dateTimeLocalValue(submitTime));
      const config = buildNewDebateAskConfig({
        planTier,
        riskTier: riskTier as RiskTier,
        budgetTier: budgetTier as CompositionBudgetTier,
        decisionScope,
        asOf,
        depth,
        steeringPresets,
        steeringAnnotations,
        asOfWasEdited: false,
        riskTierWasEdited
      }, submitTime, catalog);
      const debate = await createDebate(topic.trim(), config, token);
      router.push(`/debate/${encodeURIComponent(debate.id)}?starting=1`);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : t(catalog, "newDebate.unableToCreate"));
    } finally {
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
        <form onSubmit={submit} onKeyDown={onKeyDown}>
          {error ? <div className="error" style={{ marginTop: 16 }}>{error}</div> : null}

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
                <span className="ndTierModels">
                  {planTierRosters[option.value].map((modelId) => (
                    <span key={modelId} className="ndTierModel">
                      <span
                        className="modelDot"
                        style={{ "--dot": modelMeta(modelId).dot } as CSSProperties}
                        aria-hidden
                      />
                      {modelId}
                    </span>
                  ))}
                </span>
              </button>
            ))}
          </div>

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
            <div className="ndRow ndRowSteering">
                <div className="ndSteerField">
                  <label className="ndLabel" htmlFor="steeringPresets">{t(catalog, "newDebate.steeringSelections")}</label>
                  <div className="ndHint" id="steeringPresets-hint">{t(catalog, "newDebate.onePerLine")}</div>
                  <textarea
                    id="steeringPresets"
                    className="ndSteerInput"
                    ref={grow}
                    rows={2}
                    value={steeringPresets}
                    disabled={planTier === "free"}
                    aria-describedby="steeringPresets-hint"
                    onChange={(event) => {
                      setSteeringPresets(event.target.value);
                      grow(event.currentTarget);
                    }}
                    placeholder={t(catalog, "newDebate.steeringPlaceholder")}
                  />
                </div>
                <div className="ndSteerField">
                  <label className="ndLabel" htmlFor="steeringAnnotations">{t(catalog, "newDebate.steeringAnnotations")}</label>
                  <div className="ndHint" id="steeringAnnotations-hint">{t(catalog, "newDebate.annotationsHint")}</div>
                  <textarea
                    id="steeringAnnotations"
                    className="ndSteerInput"
                    data-italic="true"
                    ref={grow}
                    rows={2}
                    value={steeringAnnotations}
                    disabled={planTier === "free"}
                    aria-describedby="steeringAnnotations-hint"
                    onChange={(event) => {
                      setSteeringAnnotations(event.target.value);
                      grow(event.currentTarget);
                    }}
                    placeholder={t(catalog, "newDebate.annotationsPlaceholder")}
                  />
                </div>
            </div>
            <p className="ndProvenance">
              {t(catalog, "newDebate.provenance")}
            </p>
          </div>

          {sessionDefaultsError ? <div className="error" style={{ marginTop: 14 }}>{sessionDefaultsError}</div> : null}
          {planTierRostersError ? <div className="error" style={{ marginTop: 14 }}>{planTierRostersError}</div> : null}

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
                options={SCRUTINY_DEPTH_OPTIONS.map((option) => ({
                  value: option.value,
                  label: t(catalog, `newDebate.scrutiny${option.value === "standard" ? "Standard" : option.value === "deep" ? "Deep" : "Exhaustive"}`)
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

          <div className="ndActions">
            <button data-support-primary-control type="submit" className="ndStart" disabled={!ready || submitting}>
              {t(catalog, submitting ? "newDebate.starting" : "newDebate.startRun")} <span aria-hidden>→</span>
            </button>
            <button type="button" className="ndCancel" onClick={() => router.push("/")}>
              {t(catalog, "newDebate.cancel")}
            </button>
            <span className="ndActionsSpacer" aria-hidden />
            <span className="ndKeyHint">{t(catalog, "newDebate.keyHint")}</span>
          </div>
        </form>
      </div>
      <SupportWidget />
    </div>
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
