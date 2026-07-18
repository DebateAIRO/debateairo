"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { AuthGate } from "@/components/AuthGate";
import { modelMeta } from "@/lib/models";

type SettingsPayload = {
  routing: unknown;
  configured_models: string[];
  enabled_models: string[];
  grok_monthly_cap_usd: number;
  grok_monthly_spend_usd: number;
  model_monthly_caps_usd?: Record<string, number>;
  model_monthly_spend_usd?: Record<string, number>;
};

const ROLE_LABELS: Record<string, string> = {
  decomposer: "Decomposer",
  proposer: "Proposer",
  opponent: "Opponent",
  synthesizer: "Synthesizer",
  analyzer: "Analyzer"
};

/** Derive the roles a model plays from the routing config (role -> model list). */
function rolesForModel(routing: unknown, model: string): string[] {
  if (!routing || typeof routing !== "object") return [];
  const roles: string[] = [];
  for (const [role, value] of Object.entries(routing as Record<string, unknown>)) {
    const list = Array.isArray(value)
      ? value
      : value && typeof value === "object"
        ? Object.values(value as Record<string, unknown>).flat()
        : [value];
    if (list.some((entry) => typeof entry === "string" && entry === model)) {
      roles.push(ROLE_LABELS[role] ?? role);
    }
  }
  return roles;
}

export default function SettingsPage() {
  return <AuthGate>{(token) => <SettingsForm token={token} />}</AuthGate>;
}

function SettingsForm({ token }: { token: string }) {
  const [routing, setRouting] = useState("");
  const [routingParsed, setRoutingParsed] = useState<unknown>(null);
  const [modelCaps, setModelCaps] = useState<Record<string, string>>({});
  const [modelSpend, setModelSpend] = useState<Record<string, number>>({});
  const [configuredModels, setConfiguredModels] = useState<string[]>([]);
  const [enabledModels, setEnabledModels] = useState<Set<string>>(new Set());
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function syncSettings(payload: SettingsPayload) {
    const models = payload.configured_models.length ? payload.configured_models : payload.enabled_models;
    const caps = payload.model_monthly_caps_usd ?? { "grok-4.5": payload.grok_monthly_cap_usd };
    const spendByModel = payload.model_monthly_spend_usd ?? { "grok-4.5": payload.grok_monthly_spend_usd };
    setRouting(JSON.stringify(payload.routing, null, 2));
    setRoutingParsed(payload.routing);
    setModelCaps(
      Object.fromEntries(
        models.map((model) => {
          const cap = caps[model];
          return [model, Number.isFinite(cap) ? String(cap) : ""];
        })
      )
    );
    setModelSpend(spendByModel);
    setConfiguredModels(models);
    setEnabledModels(new Set(payload.enabled_models.length ? payload.enabled_models : models));
  }

  useEffect(() => {
    apiFetch<SettingsPayload>("/api/settings", {}, token)
      .then(syncSettings)
      .catch((exc) => setError(exc instanceof Error ? exc.message : "Unable to load settings"));
  }, [token]);

  const maxCap = useMemo(() => {
    const caps = Object.values(modelCaps)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);
    return caps.length ? Math.max(...caps) : null;
  }, [modelCaps]);

  function toggleModel(model: string) {
    setEnabledModels((current) => {
      const next = new Set(current);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
  }

  function updateModelCap(model: string, value: string) {
    setModelCaps((current) => ({ ...current, [model]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    let parsedRouting: unknown;
    try {
      parsedRouting = JSON.parse(routing);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Invalid routing JSON");
      return;
    }
    const selectedModels = configuredModels.filter((model) => enabledModels.has(model));
    const monthlyCaps: Record<string, number> = {};
    for (const model of configuredModels) {
      const value = modelCaps[model]?.trim() ?? "";
      if (!value) continue;
      const cap = Number(value);
      if (!Number.isFinite(cap) || cap < 0) {
        setError(`Invalid cap for ${model}`);
        return;
      }
      monthlyCaps[model] = cap;
    }
    const payload: {
      routing: unknown;
      model_monthly_caps_usd: Record<string, number>;
      grok_monthly_cap_usd?: number;
      enabled_models: string[];
    } = {
      routing: parsedRouting,
      model_monthly_caps_usd: monthlyCaps,
      enabled_models: selectedModels.length === configuredModels.length ? [] : selectedModels
    };
    if (monthlyCaps["grok-4.5"] !== undefined) {
      payload.grok_monthly_cap_usd = monthlyCaps["grok-4.5"];
    }
    try {
      const saved = await apiFetch<SettingsPayload>(
        "/api/settings",
        { method: "PUT", body: JSON.stringify(payload) },
        token
      );
      syncSettings(saved);
      setMessage("Saved");
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Unable to save settings");
    }
  }

  return (
    <div className="screen scroll">
      <div className="screenInner medium">
        <h1 className="display sm">Settings</h1>
        <p className="lede" style={{ marginTop: 6 }}>
          Toggle each model, see the roles it plays, and cap spend. Model diversity is the point — keep at least one on
          each side.
        </p>

        <form onSubmit={submit}>
          {error ? (
            <div className="error" style={{ marginTop: 24 }}>
              {error}
            </div>
          ) : null}
          {message ? (
            <div className="pill pillOk" style={{ marginTop: 24 }}>
              <span className="dot" />
              {message}
            </div>
          ) : null}

          <div className="settingsLabel">Models &amp; roles</div>
          <div className="modelTable">
            {configuredModels.map((model) => {
              const meta = modelMeta(model);
              const on = enabledModels.has(model);
              const roles = rolesForModel(routingParsed, model);
              return (
                <div key={model} className={`modelRow${on ? "" : " off"}`}>
                  <span className="modelDot" style={{ ["--dot" as string]: meta.dot }} />
                  <div className="modelName">{model}</div>
                  <div className="roleChips">
                    {roles.length ? (
                      roles.map((role) => (
                        <span key={role} className="roleChip">
                          {role}
                        </span>
                      ))
                    ) : (
                      <span className="roleChip" style={{ opacity: 0.6 }}>
                        unassigned
                      </span>
                    )}
                  </div>
                  <input
                    className="capInput"
                    aria-label={`${model} monthly cap USD`}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="No cap"
                    value={modelCaps[model] ?? ""}
                    onChange={(event) => updateModelCap(model, event.target.value)}
                  />
                  <span className="modelSpend">${(modelSpend[model] ?? 0).toFixed(2)}</span>
                  <button
                    type="button"
                    className="switch"
                    role="switch"
                    aria-checked={on}
                    aria-label={`Toggle ${model}`}
                    onClick={() => toggleModel(model)}
                  >
                    <span className="knob" />
                  </button>
                </div>
              );
            })}
            {configuredModels.length === 0 ? (
              <div className="modelRow">
                <span className="muted">No models configured.</span>
              </div>
            ) : null}
          </div>

          <div className="cardRow">
            <div className="miniCard">
              <h3>Spend cap</h3>
              <span className="optionHint">Highest monthly ceiling across models</span>
              <div className="big">
                {maxCap !== null ? `$${maxCap.toFixed(2)}` : "—"} <small>ceiling</small>
              </div>
            </div>
            <div className="miniCard">
              <h3>Role routing</h3>
              <span className="optionHint">Which model fills each role</span>
              <button
                type="button"
                className="btn"
                style={{ marginTop: 4 }}
                onClick={() => setAdvancedOpen((value) => !value)}
              >
                {advancedOpen ? "Hide routing JSON" : "Edit routing JSON"}
              </button>
            </div>
          </div>

          {advancedOpen ? (
            <div className="fieldGroup">
              <label htmlFor="routing">Role routing JSON</label>
              <textarea
                id="routing"
                value={routing}
                onChange={(event) => setRouting(event.target.value)}
                spellCheck={false}
                style={{ minHeight: 200 }}
              />
            </div>
          ) : null}

          <div className="formActions">
            <button type="submit" className="startBtn ready">
              Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
