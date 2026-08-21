"use client";

import { useEffect, useState } from "react";
import { getSettingsView } from "@/lib/api";
import { AuthGate } from "@/components/AuthGate";
import { modelMeta } from "@/lib/models";
import type { SettingsView } from "@/lib/v3/adapter";
import { V3_MISSING_CAPABILITIES } from "@/lib/v3/missingCapabilities";
import { EvaluatorDevMenu } from "@/components/EvaluatorDevMenu";

const EVALUATOR_DEV_MENU_ENABLED = process.env.NODE_ENV !== "production"
  && process.env.NEXT_PUBLIC_EVALUATOR_DEV_MENU_ENABLED === "true";

/**
 * UI-01 (DR-145): V2's settings screen, kept whole, reading V3's deployment
 * projection instead of V2's settings resource.
 *
 * Three honest differences from V2, all forced by what V3 actually owns:
 *  - Roles come from the deployment MODEL LEDGER (task_class -> model), which
 *    is V3's routing record; they render through V2's own role chips.
 *  - V3 keeps no monthly spend or cap accounting, so both money columns carry
 *    typed absence (DR-115) — never $0.00, never an invented ceiling.
 *  - Deployment configuration is register-governed, so this screen is
 *    READ-ONLY: the controls stay visible and disabled with the reason on
 *    screen rather than offering a write V3 will refuse.
 */

const READ_ONLY_REASON =
  "Deployment configuration is register-governed in V3: models, routing, and versions come from the ruled register rows, " +
  "so this screen reports them and writes nothing.";

const MONEY_ABSENCE_REASON = "V3 records no monthly spend or cap accounting for this model.";

export default function SettingsPage() {
  return <AuthGate>{(token) => <SettingsScreen token={token} />}</AuthGate>;
}

function SettingsScreen({ token }: { token: string }) {
  const [view, setView] = useState<SettingsView | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getSettingsView(token)
      .then((loaded) => {
        if (active) {
          setView(loaded);
          setError(null);
        }
      })
      .catch((exc) => {
        if (active) setError(exc instanceof Error ? exc.message : "Unable to load deployment");
      });
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div className="screen scroll">
      <div className="screenInner medium">
        <h1 className="display sm">Settings</h1>
        <p className="lede" style={{ marginTop: 6 }}>
          Every model this deployment routes, the roles it fills, and the register version they were read at. Model
          diversity is the point — keep at least one on each side.
        </p>

        {error ? (
          <div className="error" style={{ marginTop: 24 }}>
            {error}
          </div>
        ) : null}

        <div className="pill pillGen" style={{ marginTop: 24 }}>
          <span className="dot" />
          Read-only
        </div>
        <span className="optionHint" style={{ display: "block", marginTop: 8 }}>
          {READ_ONLY_REASON}
        </span>

        <div className="settingsLabel">Models &amp; roles</div>
        <div className="modelTable">
          {view === null && error === null ? (
            <div className="modelRow">
              <span className="muted">Loading deployment…</span>
            </div>
          ) : null}
          {view !== null && view.models.length === 0 ? (
            <div className="modelRow">
              <span className="muted">This deployment routes no models.</span>
            </div>
          ) : null}
          {(view?.models ?? []).map((row) => {
            const meta = modelMeta(row.model_id);
            return (
              <div key={`${row.model_id} ${row.model_version} ${row.provider}`} className="modelRow">
                <span className="modelDot" style={{ ["--dot" as string]: meta.dot }} />
                <div className="modelName">
                  {row.model_id}
                  <div style={{ fontSize: 11, fontWeight: 400, color: "var(--muted)" }}>
                    {row.provider} · {row.model_version}
                  </div>
                </div>
                <div className="roleChips">
                  {row.task_classes.map((taskClass) => (
                    <span key={taskClass} className="roleChip">
                      {taskClass}
                    </span>
                  ))}
                </div>
                <span className="modelSpend" style={{ width: 90 }} title={MONEY_ABSENCE_REASON}>
                  no cap recorded
                </span>
                <span className="modelSpend" title={MONEY_ABSENCE_REASON}>
                  —
                </span>
                <button
                  type="button"
                  className="switch"
                  role="switch"
                  aria-checked
                  aria-disabled
                  disabled
                  aria-label={`${row.model_id} is routed by the deployment register`}
                  title="Routed by the deployment register; V3 has no per-model enable switch."
                >
                  <span className="knob" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="cardRow">
          <div className="miniCard">
            <h3>Spend cap</h3>
            <span className="optionHint">Highest monthly ceiling across models</span>
            <div className="big" title={MONEY_ABSENCE_REASON}>
              — <small>not recorded</small>
            </div>
          </div>
          <div className="miniCard">
            <h3>Register version</h3>
            <span className="optionHint">The ruled register these values were read at</span>
            <div className="big">
              {view === null ? "—" : `v${view.register_version}`} <small>register</small>
            </div>
          </div>
          <div className="miniCard">
            <h3>Role routing</h3>
            <span className="optionHint">Which model fills each task class</span>
            <button
              type="button"
              className="btn"
              style={{ marginTop: 4 }}
              onClick={() => setAdvancedOpen((value) => !value)}
            >
              {advancedOpen ? "Hide routing JSON" : "Show routing JSON"}
            </button>
          </div>
        </div>

        {advancedOpen ? (
          <div className="fieldGroup">
            <label htmlFor="routing">Role routing (deployment model ledger)</label>
            <textarea
              id="routing"
              value={view === null ? "" : JSON.stringify(view.routing, null, 2)}
              readOnly
              spellCheck={false}
              style={{ minHeight: 200 }}
            />
          </div>
        ) : null}

        {EVALUATOR_DEV_MENU_ENABLED ? <EvaluatorDevMenu token={token} /> : null}

        <div className="formActions">
          <button
            type="button"
            className="startBtn"
            disabled
            aria-disabled="true"
            title={V3_MISSING_CAPABILITIES.settingsWrite}
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
