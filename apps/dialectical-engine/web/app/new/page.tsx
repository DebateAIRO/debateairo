"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createDebate } from "@/lib/api";
import {
  SCRUTINY_DEPTH_OPTIONS,
  ScrutinyDepth,
  adaptiveExpansionBudgetsFor
} from "@/lib/scrutinyDepth";
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
  const [depth, setDepth] = useState(3);
  const [branching, setBranching] = useState(2);
  const [concurrency, setConcurrency] = useState(3);
  const [maxTokens, setMaxTokens] = useState(800);
  const [roleOverrides, setRoleOverrides] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const ready = topic.trim().length > 6;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setSubmitting(true);
    setError(null);
    try {
      const config: Record<string, unknown> = {
        max_depth: depth,
        branching,
        concurrency,
        max_tokens: maxTokens
      };
      const scrutinyBudgets = adaptiveExpansionBudgetsFor(scrutiny);
      if (scrutinyBudgets) {
        config.adaptive_expansion = scrutinyBudgets;
      }
      const cleaned = roleOverrides.trim();
      if (cleaned) {
        const parsed = JSON.parse(cleaned) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Role overrides must be a JSON object.");
        }
        config.role_overrides = parsed;
      }
      const debate = await createDebate(topic.trim(), config, token);
      router.push(`/debate/${debate.id}`);
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

          <button type="button" className="optionsToggle" onClick={() => setOptionsOpen((value) => !value)}>
            Options <span style={{ fontSize: 9 }}>{optionsOpen ? "▲" : "▼"}</span>
          </button>

          {optionsOpen ? (
            <div className="optionsPanel">
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
                label="Tree depth"
                hint="How many levels of rebuttal"
                min={1}
                max={5}
                value={depth}
                onChange={setDepth}
              />
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
