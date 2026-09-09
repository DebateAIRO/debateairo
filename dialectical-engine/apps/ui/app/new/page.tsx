"use client";

import { CSSProperties, FormEvent, KeyboardEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createDebate, contractClient } from "@/lib/api";
import { SCRUTINY_DEPTH_OPTIONS, ScrutinyDepth } from "@/lib/scrutinyDepth";
import { AuthGate } from "@/components/AuthGate";
import { modelColor } from "@/components/ModelPresentation";
import { SupportWidget } from "@/components/support/SupportWidget";
import { PLAN_TIER_ROSTERS } from "@debateai/contract";
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

const depthModeOptions: Array<{ value: AdaptiveDepthMode; label: string }> = [
  { value: "fixed", label: "Fixed" },
  { value: "manual", label: "Manual" },
  { value: "recommended", label: "Recommended" },
  { value: "adaptive", label: "Adaptive" }
];

const RISK_TIER_OPTIONS: ReadonlyArray<{ value: RiskTier; label: string }> = [
  { value: "casual", label: "Casual" },
  { value: "standard", label: "Standard" },
  { value: "high-stakes", label: "High stakes" }
];

const BUDGET_TIER_OPTIONS: ReadonlyArray<{ value: CompositionBudgetTier; label: string }> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" }
];

const PLAN_TIER_OPTIONS = [
  { value: "free", name: "Free", promise: "Every gauge fixed. The question is yours." },
  { value: "premium", name: "Premium", promise: "Every gauge yours to set." }
] as const;

type PlanTier = (typeof PLAN_TIER_OPTIONS)[number]["value"];

const DEPTH_MIN = 1;
const DEPTH_MAX = 5;

/* The document draws every text field at its resting height — one line for the
   question, two for each steering box — so the fields grow with their content
   instead of scrolling inside a fixed frame. A ref callback rather than a hook,
   because it also has to run for a topic arriving in the query string. */
function grow(field: HTMLTextAreaElement | null): void {
  if (field === null) return;
  field.style.height = "auto";
  // scrollHeight covers content and padding; these fields are border-box, so
  // the border has to be added back or each one settles a border short.
  const border = field.offsetHeight - field.clientHeight;
  field.style.height = `${field.scrollHeight + border}px`;
}

function modelIdentity(modelId: string): string {
  if (modelId.startsWith("gpt-")) return "openai";
  if (modelId.startsWith("claude-")) return "anthropic";
  if (modelId.startsWith("grok-")) return "xai";
  return modelId;
}

export default function NewDebatePage() {
  return (
    <Suspense fallback={null}>
      <AuthGate>{(token) => <NewDebateForm token={token} />}</AuthGate>
    </Suspense>
  );
}

function NewDebateForm({ token }: { token: string }) {
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
  const [budgetTier, setBudgetTier] = useState<CompositionBudgetTier>(PROVISIONAL_COMPOSITION_BUDGET_DEFAULT);
  const [steeringPresets, setSteeringPresets] = useState("");
  const [steeringAnnotations, setSteeringAnnotations] = useState("");
  const [decisionScope, setDecisionScope] = useState<string>(DECISION_SCOPE_DEFAULT);
  const [asOf, setAsOf] = useState(() => dateTimeLocalValue(new Date()));
  const [sessionDefaultsError, setSessionDefaultsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void contractClient.readSession().then((session) => {
      if (!active) return;
      const defaults = deriveSessionAskDefaults(session);
      setDecisionScope((current) => current.trim().length > 0 ? current : defaults.decisionScope);
      setAsOf(defaults.asOf);
      setSessionDefaultsError(null);
    }).catch((failure: unknown) => {
      if (!active) return;
      setSessionDefaultsError(`ASK_SESSION_DEFAULTS_UNAVAILABLE: ${failure instanceof Error ? failure.message : "Session read failed"}`);
    });
    return () => { active = false; };
  }, [token]);

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
    depth >= DEPTH_MIN && depth <= DEPTH_MAX &&
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
      }, submitTime);
      const debate = await createDebate(topic.trim(), config, token);
      router.push(`/debate/${encodeURIComponent(debate.id)}?starting=1`);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Unable to create debate");
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
        <p className="ndEyebrow">NEW QUESTION</p>
        <h1 className="ndTitle">What should we debate?</h1>
        <form onSubmit={submit} onKeyDown={onKeyDown}>
          {error ? <div className="error" style={{ marginTop: 16 }}>{error}</div> : null}

          <div className="ndTier" role="radiogroup" aria-label="Plan tier">
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
                <span className="ndTierName">{option.name}</span>
                <span className="ndTierPromise">{option.promise}</span>
                <span className="ndTierModels">
                  {PLAN_TIER_ROSTERS[option.value].map((modelId) => (
                    <span key={modelId} className="ndTierModel">
                      <span
                        className="modelDot"
                        style={{ "--dot": modelColor(modelIdentity(modelId)) } as CSSProperties}
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
            Topic
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
                placeholder="Type a debatable claim or question…"
                autoFocus
                required
              />
            </div>
          </div>

          <div className="ndCard">
            <p className="ndIntro">
              {planTier === "free"
                ? "Free runs every debate at fixed settings. Type your question and click Start, or choose Premium to set the gauges yourself."
                : "Choose your risk tier, composition budget tier, and depth, then click Start."}
            </p>
            <SegmentedRow
              field="riskTier"
              label="Risk tier"
              hint={planTier === "free"
                ? "How much is riding on the answer · fixed by the Free plan"
                : "How much is riding on the answer · explicit asker selection"}
              options={RISK_TIER_OPTIONS}
              value={riskTier}
              disabled={planTier === "free"}
              onChange={(value) => {
                setRiskTier(value);
                setRiskTierWasEdited(true);
              }}
            />
            <SegmentedRow
              field="budgetTier"
              label="Composition budget tier"
              hint={planTier === "free"
                ? "How much work the composition may spend · fixed by the Free plan"
                : "How much work the composition may spend · provisional default, editable"}
              options={BUDGET_TIER_OPTIONS}
              value={budgetTier}
              disabled={planTier === "free"}
              onChange={(value) => setBudgetTier(value as CompositionBudgetTier)}
            />
            <SliderRow
              id="treeDepth"
              label="Tree depth"
              hint="How far the debate expands when cross-maker review is available"
              min={DEPTH_MIN}
              max={DEPTH_MAX}
              value={depth}
              disabled={planTier === "free"}
              onChange={setDepth}
            />
            <div className="ndRow ndRowSteering">
              <div className="ndSteerField">
                <label className="ndLabel" htmlFor="steeringPresets">Steering menu selections</label>
                <div className="ndHint">One per line</div>
                <textarea
                  id="steeringPresets"
                  className="ndSteerInput"
                  ref={grow}
                  rows={2}
                  value={steeringPresets}
                  disabled={planTier === "free"}
                  onChange={(event) => {
                    setSteeringPresets(event.target.value);
                    grow(event.currentTarget);
                  }}
                  placeholder={"Prefer primary sources\nSurface the strongest counter-case early"}
                />
              </div>
              <div className="ndSteerField">
                <label className="ndLabel" htmlFor="steeringAnnotations">Steering annotations</label>
                <div className="ndHint">Free text · logged verbatim, one per line</div>
                <textarea
                  id="steeringAnnotations"
                  className="ndSteerInput"
                  data-italic="true"
                  ref={grow}
                  rows={2}
                  value={steeringAnnotations}
                  disabled={planTier === "free"}
                  onChange={(event) => {
                    setSteeringAnnotations(event.target.value);
                    grow(event.currentTarget);
                  }}
                  placeholder="Add a note the run will carry…"
                />
              </div>
            </div>
            <p className="ndProvenance">
              Tier source, provenance, and machine as-of are recorded automatically with the run contract.
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
            ⚙ OPTIONS <span className="ndOptionsCaret" aria-hidden>{optionsOpen ? "▲" : "▼"}</span>
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
                Depth mode, depth of scrutiny, branching width, concurrency, and max tokens are V2
                controls the V3 run contract has no slot for — they are not sent.
              </p>
              <SelectRow
                id="depthMode"
                label="Depth mode"
                hint="Selection strategy"
                value={depthMode}
                disabled={planTier === "free"}
                onChange={(value) => setDepthMode(value as AdaptiveDepthMode)}
                options={depthModeOptions}
              />
              <SelectRow
                id="scrutinyDepth"
                label="Depth of scrutiny"
                hint={SCRUTINY_DEPTH_OPTIONS.find((option) => option.value === scrutiny)?.hint ?? ""}
                value={scrutiny}
                disabled={planTier === "free"}
                onChange={(value) => setScrutiny(value as ScrutinyDepth)}
                options={SCRUTINY_DEPTH_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              />
              <SliderRow
                id="branchingWidth"
                label="Branching width"
                hint="Pro + con children per claim"
                min={1}
                max={4}
                value={branching}
                disabled={planTier === "free"}
                onChange={setBranching}
              />
              <SliderRow
                id="concurrency"
                label="Concurrency"
                hint="Models running in parallel"
                min={1}
                max={6}
                value={concurrency}
                disabled={planTier === "free"}
                onChange={setConcurrency}
              />
              <SliderRow
                id="maxTokens"
                label="Max tokens"
                hint="Per generated argument"
                min={128}
                max={4000}
                step={128}
                value={maxTokens}
                disabled={planTier === "free"}
                onChange={setMaxTokens}
              />
              <p className="ndProvenance">
                Role overrides are not user-editable — model role assignment lives in{" "}
                <button type="button" className="ndSettingsLink" onClick={() => router.push("/settings")}>
                  Settings →
                </button>
              </p>
            </div>
          ) : null}

          <div className="ndActions">
            <button data-support-primary-control type="submit" className="ndStart" disabled={!ready || submitting}>
              {submitting ? "Starting" : "Start run"} <span aria-hidden>→</span>
            </button>
            <button type="button" className="ndCancel" onClick={() => router.push("/")}>
              Cancel
            </button>
            <span className="ndActionsSpacer" aria-hidden />
            <span className="ndKeyHint">⌃↵ to start</span>
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
        <div className="ndHint">{hint}</div>
      </div>
      <div className="ndSeg" role="radiogroup" aria-labelledby={`${field}-label`}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            id={`${field}-${option.value}`}
            data-field={field}
            data-value={option.value}
            aria-checked={value === option.value}
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
        <div className="ndHint">{hint}</div>
      </div>
      <span className="ndSelect">
        <span aria-hidden>{options.find((option) => option.value === value)?.label ?? value}</span>
        <span className="ndSelectCaret" aria-hidden>▼</span>
        <select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} aria-label={label}>
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
        <div className="ndHint">{hint}</div>
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
          onChange={(event) => onChange(Number(event.target.value))}
          aria-label={label}
          style={{ "--nd-pct": `${pct}%` } as CSSProperties}
        />
      </span>
      <span className="ndValue">{value}</span>
    </div>
  );
}
