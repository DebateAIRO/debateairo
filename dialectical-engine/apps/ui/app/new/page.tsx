"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createDebate, contractClient } from "@/lib/api";
import { SCRUTINY_DEPTH_OPTIONS, ScrutinyDepth } from "@/lib/scrutinyDepth";
import { AuthGate } from "@/components/AuthGate";
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
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [depthMode, setDepthMode] = useState<AdaptiveDepthMode>("fixed");
  const [scrutiny, setScrutiny] = useState<ScrutinyDepth>("standard");
  const [depth, setDepth] = useState(1);
  const [branching, setBranching] = useState(2);
  const [concurrency, setConcurrency] = useState(3);
  const [maxTokens, setMaxTokens] = useState(800);
  const [roleOverrides, setRoleOverrides] = useState("");
  const [riskTier, setRiskTier] = useState("");
  const [riskTierWasEdited, setRiskTierWasEdited] = useState(false);
  const [budgetTier, setBudgetTier] = useState<CompositionBudgetTier>(PROVISIONAL_COMPOSITION_BUDGET_DEFAULT);
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

  const askAsOf = new Date(asOf);
  // The button becomes ready only for the complete ask that will be submitted.
  // UX-01 makes machine-derived values visible and editable rather than hidden.
  const ready =
    topic.trim().length > 6 &&
    depth >= 1 && depth <= 5 &&
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
        riskTier: riskTier as RiskTier,
        budgetTier: budgetTier as CompositionBudgetTier,
        decisionScope,
        asOf,
        depth,
        asOfWasEdited: false,
        riskTierWasEdited
      }, submitTime);
      const debate = await createDebate(topic.trim(), config, token);
      router.push(`/debate/${encodeURIComponent(debate.id)}`);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Unable to create debate");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="screen scroll">
      <div className="screenInner narrow">
        <h1 className="display md">What should we debate?</h1>
        <form onSubmit={submit} style={{ marginTop: 22 }}>
          {error ? (
            <div className="error" style={{ marginBottom: 16 }}>
              {error}
            </div>
          ) : null}
          <label className="srOnly" htmlFor="topic">
            Topic
          </label>
          <textarea
            id="topic"
            className="textareaSerif"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="Type a debatable claim or question…"
            autoFocus
            required
          />

          <div className="optionsPanel" style={{ marginTop: 18 }}>
            <div className="optionHint" style={{ marginBottom: 4 }}>
              Choose your risk tier, composition budget tier, and depth, then click Start.
            </div>
            <div className="optionRow">
              <div>
                <label className="optionLabel" htmlFor="riskTier">
                  Risk tier
                </label>
                <div className="optionHint">How much is riding on the answer</div>
                <div className="optionHint">Explicit asker selection</div>
              </div>
              <div className="optionControl">
                <select
                  id="riskTier"
                  value={riskTier}
                  onChange={(event) => {
                    setRiskTier(event.target.value);
                    setRiskTierWasEdited(true);
                  }}
                  aria-label="Risk tier"
                >
                  <option value="">Choose…</option>
                  <option value="casual">casual</option>
                  <option value="standard">standard</option>
                  <option value="high-stakes">high-stakes</option>
                </select>
              </div>
            </div>
            <div className="optionRow">
              <div>
                <label className="optionLabel" htmlFor="budgetTier">
                  Composition budget tier
                </label>
                <div className="optionHint">How much work the composition may spend</div>
                <div className="optionHint">Provisional default pending V ruling; editable user-owned value</div>
              </div>
              <div className="optionControl">
                <select
                  id="budgetTier"
                  value={budgetTier}
                  onChange={(event) => setBudgetTier(event.target.value as CompositionBudgetTier)}
                  aria-label="Composition budget tier"
                >
                  <option value="">Choose…</option>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </div>
            </div>
            <div className="optionRow">
              <div>
                <label className="optionLabel" htmlFor="treeDepth">Tree depth</label>
                <div className="optionHint">How far the debate expands when cross-maker review is available</div>
              </div>
              <div className="optionControl">
                <select
                  id="treeDepth"
                  value={depth ?? ""}
                  onChange={(event) => setDepth(Number(event.target.value))}
                  aria-label="Tree depth"
                >
                  {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
            </div>
          </div>

          {sessionDefaultsError ? <div className="error" style={{ marginTop: 14 }}>{sessionDefaultsError}</div> : null}

          <button
            type="button"
            className="optionsToggle"
            aria-expanded={optionsOpen}
            aria-controls={optionsOpen ? "additionalRunOptions" : undefined}
            onClick={() => setOptionsOpen((value) => !value)}
          >
            Options <span style={{ fontSize: 9 }}>{optionsOpen ? "▲" : "▼"}</span>
          </button>

              {optionsOpen ? (
            <div id="additionalRunOptions" className="optionsPanel">
              {/*
                DR-115 honesty: the ruled Tree depth control is on the default
                surface. The legacy V2 knobs below are named as not carried
                rather than quietly posted into a config the ask builder drops.
              */}
              <div className="optionHint" style={{ marginBottom: 4 }}>
                Depth mode, depth of scrutiny, branching width, concurrency, max tokens, and role overrides are V2
                controls the V3 run contract has no slot for — they are not sent.
              </div>
              <div className="optionRow">
                <div>
                  <label className="optionLabel" htmlFor="depthMode">
                    Depth mode
                  </label>
                  <div className="optionHint">Selection strategy</div>
                </div>
                <div className="optionControl">
                  <select
                    id="depthMode"
                    value={depthMode}
                    onChange={(event) => setDepthMode(event.target.value as AdaptiveDepthMode)}
                    aria-label="Depth mode"
                  >
                    {depthModeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="optionRow">
                <div>
                  <label className="optionLabel" htmlFor="scrutinyDepth">
                    Depth of scrutiny
                  </label>
                  <div className="optionHint">
                    {SCRUTINY_DEPTH_OPTIONS.find((option) => option.value === scrutiny)?.hint}
                  </div>
                </div>
                <div className="optionControl">
                  <select
                    id="scrutinyDepth"
                    value={scrutiny}
                    onChange={(event) => setScrutiny(event.target.value as ScrutinyDepth)}
                    aria-label="Depth of scrutiny"
                  >
                    {SCRUTINY_DEPTH_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <SliderRow
                label="Branching width"
                hint="Pro + con children per claim"
                min={1}
                max={4}
                value={branching}
                onChange={setBranching}
              />
              <SliderRow
                label="Concurrency"
                hint="Models running in parallel"
                min={1}
                max={6}
                value={concurrency}
                onChange={setConcurrency}
              />
              <SliderRow
                label="Max tokens"
                hint="Per generated argument"
                min={128}
                max={4000}
                step={128}
                value={maxTokens}
                onChange={setMaxTokens}
              />
              <div className="fieldGroup">
                <label htmlFor="roleOverrides">Role overrides JSON</label>
                <textarea
                  id="roleOverrides"
                  value={roleOverrides}
                  onChange={(event) => setRoleOverrides(event.target.value)}
                  spellCheck={false}
                  placeholder='{ "proposer": "gpt-5" }'
                />
              </div>
              <div className="optionHint">
                Model role assignment lives in{" "}
                <button
                  type="button"
                  className="linkBtn"
                  style={{ padding: 0 }}
                  onClick={() => router.push("/settings")}
                >
                  Settings →
                </button>
              </div>
            </div>
          ) : null}

          <div className="formActions">
            <button type="submit" className={`startBtn${ready ? " ready" : ""}`} disabled={!ready || submitting}>
              {submitting ? "Starting" : "Start debate"} <span aria-hidden>→</span>
            </button>
            <button type="button" className="btnGhost" onClick={() => router.push("/")}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SliderRow({
  label,
  hint,
  min,
  max,
  step = 1,
  value,
  onChange
}: {
  label: string;
  hint: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="optionRow">
      <div>
        <div className="optionLabel">{label}</div>
        <div className="optionHint">{hint}</div>
      </div>
      <div className="optionControl">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          aria-label={label}
        />
        <span className="optionValue" style={{ width: step === 1 ? 18 : 44 }}>
          {value}
        </span>
      </div>
    </div>
  );
}
