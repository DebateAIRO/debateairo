"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createDebate, getRunCostEnvelope } from "@/lib/api";
import type { RunCostEnvelopeView } from "@/lib/v3/adapter";
import { selectRunCostEnvelopeMember, selectRunCostEnvelopeMembers } from "@/lib/runCostEnvelopeSelection";
import { SCRUTINY_DEPTH_OPTIONS, ScrutinyDepth } from "@/lib/scrutinyDepth";
import { AuthGate } from "@/components/AuthGate";

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
  const [depth, setDepth] = useState<number | null>(null);
  const [runCostEnvelope, setRunCostEnvelope] = useState<RunCostEnvelopeView | null>(null);
  const [envelopeError, setEnvelopeError] = useState<string | null>(null);
  const [branching, setBranching] = useState(2);
  const [concurrency, setConcurrency] = useState(3);
  const [maxTokens, setMaxTokens] = useState(800);
  const [roleOverrides, setRoleOverrides] = useState("");
  // UI-01: the V3 run contract requires these explicitly from the asker
  // (S14 precedent) — the UI supplies no hidden defaults for any of them.
  const [riskTier, setRiskTier] = useState("");
  const [budgetTier, setBudgetTier] = useState("");
  const [agentCount, setAgentCount] = useState("");
  const [decisionOwner, setDecisionOwner] = useState("");
  const [actionOwner, setActionOwner] = useState("");
  const [decisionScope, setDecisionScope] = useState("");
  const [asOf, setAsOf] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void getRunCostEnvelope(token).then((envelope) => {
      if (!active) return;
      setRunCostEnvelope(envelope);
      setEnvelopeError(null);
    }).catch((failure: unknown) => {
      if (!active) return;
      setRunCostEnvelope(null);
      setEnvelopeError(failure instanceof Error ? failure.message : "RUN_COST_ENVELOPE_UNAVAILABLE");
    });
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    const members = runCostEnvelope === null
      ? []
      : selectRunCostEnvelopeMembers(runCostEnvelope.members, riskTier, runCostEnvelope.deploymentRiskTier);
    setDepth((current) => members.some((member) => member.depth === current) ? current : members[0]?.depth ?? null);
  }, [riskTier, runCostEnvelope]);

  const askAgentCount = Number(agentCount);
  const askAsOf = new Date(asOf);
  const allowedEnvelopeMembers = runCostEnvelope === null
    ? []
    : selectRunCostEnvelopeMembers(runCostEnvelope.members, riskTier, runCostEnvelope.deploymentRiskTier);
  const selectedEnvelopeMember = selectRunCostEnvelopeMember(allowedEnvelopeMembers, depth);
  // The Start button may only look ready when the ask this form will build is
  // actually complete: the V3 contract requires every one of these explicitly,
  // and the UI supplies no hidden default for any of them (AC-76).
  const ready =
    topic.trim().length > 6 &&
    selectedEnvelopeMember !== null &&
    riskTier.length > 0 &&
    budgetTier.length > 0 &&
    agentCount.trim().length > 0 &&
    Number.isInteger(askAgentCount) &&
    askAgentCount >= 1 &&
    decisionOwner.trim().length > 0 &&
    actionOwner.trim().length > 0 &&
    decisionScope.trim().length > 0 &&
    asOf.trim().length > 0 &&
    !Number.isNaN(askAsOf.valueOf());

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setSubmitting(true);
    setError(null);
    try {
      const config: Record<string, unknown> = {
        // V3 run contract (all explicit user input — no invented values):
        risk_tier: riskTier,
        composition_budget_tier: budgetTier,
        depth: selectedEnvelopeMember!.depth,
        agent_count: askAgentCount,
        decision_owner: decisionOwner.trim(),
        action_owner: actionOwner.trim(),
        decision_scope: decisionScope.trim(),
        as_of: askAsOf.toISOString()
      };
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

          {/*
            UI-01: the V3 run contract requires these seven from the asker. They
            sit outside the collapsed Options panel because the run cannot be
            asked without them — the UI fills none of them in.
          */}
          <div className="optionsPanel" style={{ marginTop: 18 }}>
            <div className="optionHint" style={{ marginBottom: 4 }}>
              The run contract — every value below is yours to state; nothing here is filled in for you.
            </div>
            <div className="optionRow">
              <div>
                <label className="optionLabel" htmlFor="riskTier">
                  Risk tier
                </label>
                <div className="optionHint">How much is riding on the answer</div>
              </div>
              <div className="optionControl">
                <select
                  id="riskTier"
                  value={riskTier}
                  onChange={(event) => setRiskTier(event.target.value)}
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
              </div>
              <div className="optionControl">
                <select
                  id="budgetTier"
                  value={budgetTier}
                  onChange={(event) => setBudgetTier(event.target.value)}
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
                <label className="optionLabel" htmlFor="agentCount">
                  Agent count
                </label>
                <div className="optionHint">How many agents the run may enlist</div>
              </div>
              <div className="optionControl">
                <input
                  id="agentCount"
                  type="number"
                  min={1}
                  step={1}
                  value={agentCount}
                  onChange={(event) => setAgentCount(event.target.value)}
                  aria-label="Agent count"
                />
              </div>
            </div>
            <div className="optionRow">
              <div>
                <label className="optionLabel" htmlFor="asOf">
                  As of
                </label>
                <div className="optionHint">The moment the answer should be true as of</div>
              </div>
              <div className="optionControl">
                <input
                  id="asOf"
                  type="datetime-local"
                  value={asOf}
                  onChange={(event) => setAsOf(event.target.value)}
                  aria-label="As of"
                />
              </div>
            </div>
            <div className="fieldGroup">
              <label htmlFor="decisionOwner">Decision owner</label>
              <input
                id="decisionOwner"
                value={decisionOwner}
                onChange={(event) => setDecisionOwner(event.target.value)}
                placeholder="Who owns the decision this answer feeds"
              />
            </div>
            <div className="fieldGroup">
              <label htmlFor="actionOwner">Action owner</label>
              <input
                id="actionOwner"
                value={actionOwner}
                onChange={(event) => setActionOwner(event.target.value)}
                placeholder="Who will act on it"
              />
            </div>
            <div className="fieldGroup">
              <label htmlFor="decisionScope">Decision scope</label>
              <input
                id="decisionScope"
                value={decisionScope}
                onChange={(event) => setDecisionScope(event.target.value)}
                placeholder="What the decision covers"
              />
            </div>
          </div>

          <button type="button" className="optionsToggle" onClick={() => setOptionsOpen((value) => !value)}>
            Options <span style={{ fontSize: 9 }}>{optionsOpen ? "▲" : "▼"}</span>
          </button>

          {optionsOpen ? (
            <div className="optionsPanel">
              {/*
                DR-115 honesty: of the V2 knobs below, only Tree depth reaches
                V3's ask (depth_params.depth). The rest are named as not
                carried rather than quietly posted into a config the ask
                builder drops.
              */}
              <div className="optionHint" style={{ marginBottom: 4 }}>
                Tree depth is carried into the V3 ask. Depth mode, depth of scrutiny, branching width, concurrency, max
                tokens, and role overrides are V2 controls the V3 run contract has no slot for — they are not sent.
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
              <div className="optionRow">
                <div>
                  <label className="optionLabel" htmlFor="treeDepth">Tree depth</label>
                  <div className="optionHint">Allowed by the deployment run-cost envelope for the chosen risk tier</div>
                </div>
                <div className="optionControl">
                  <select
                    id="treeDepth"
                    value={depth ?? ""}
                    onChange={(event) => setDepth(Number(event.target.value))}
                    aria-label="Tree depth"
                    disabled={allowedEnvelopeMembers.length === 0}
                  >
                    <option value="">Choose a ruled depth…</option>
                    {allowedEnvelopeMembers.map((member) => (
                      <option key={`${member.riskTier}:${member.depth}`} value={member.depth}>
                        {member.depth} — up to {member.maxModelAttempts} model attempts
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

          {envelopeError ? (
            <div className="error" style={{ marginTop: 14 }}>{envelopeError}</div>
          ) : selectedEnvelopeMember ? (
            <div className="optionHint" style={{ marginTop: 14 }}>
              At depth {selectedEnvelopeMember.depth}, this run may spend up to {selectedEnvelopeMember.maxModelAttempts}{" "}
              model attempts against the configured CLI subscriptions (register v{runCostEnvelope?.registerVersion}).
            </div>
          ) : (
            <div className="optionHint" style={{ marginTop: 14 }}>
              Choose a risk tier with a ruled run-cost envelope before starting.
            </div>
          )}

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
