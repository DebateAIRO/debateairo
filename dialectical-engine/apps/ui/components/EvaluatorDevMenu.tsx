"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getEvaluatorDevMenu,
  selectEvaluatorConsumerModel,
  type EvaluatorDevMenuView
} from "@/lib/api";

export function EvaluatorDevMenu({ token }: { token: string }) {
  const [view, setView] = useState<EvaluatorDevMenuView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setView(await getEvaluatorDevMenu(token));
      setError(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to load evaluator status");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function chooseModel(modelId: string) {
    setSaving(true);
    try {
      await selectEvaluatorConsumerModel(token, modelId);
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to select the consumer model");
    } finally {
      setSaving(false);
    }
  }

  const starters = view?.domains.filter((domain) => domain.origin === "STARTER") ?? [];
  const grown = view?.domains.filter((domain) => domain.origin === "GROWN") ?? [];

  return (
    <section aria-labelledby="evaluator-dev-menu" style={{ marginTop: 56 }}>
      <div className="pill pillGen">
        <span className="dot" />
        Developer surface
      </div>
      <h2 id="evaluator-dev-menu" className="display sm" style={{ marginTop: 12 }}>
        Evaluator dev menu
      </h2>
      <p className="optionHint">Collect-only · UNBOUND</p>

      {error ? <div className="error" style={{ marginTop: 16 }}>{error}</div> : null}
      {view === null && error === null ? <p className="muted">Loading evaluator status…</p> : null}

      {view ? (
        <>
          <div className="settingsLabel">Consumer model</div>
          {view.catalog.state === "UNAVAILABLE" ? (
            <div className="miniCard">
              <h3>Container unavailable</h3>
              <span className="optionHint">{view.catalog.failureCode ?? "No successful catalog probe"}</span>
            </div>
          ) : view.catalog.models.length === 0 ? (
            <p className="muted">The latest healthy catalog reported no models.</p>
          ) : (
            <div className="modelTable">
              {view.catalog.models.map((model) => {
                const selected = view.selectedConsumer?.modelId === model.modelId;
                return (
                  <div className="modelRow" key={model.modelId}>
                    <div className="modelName">{model.modelId}</div>
                    <span className="optionHint">{selected ? "Selected consumer" : "Enumerated by vLLM"}</span>
                    <button
                      type="button"
                      className="btn"
                      disabled={saving || selected}
                      onClick={() => void chooseModel(model.modelId)}
                    >
                      {selected ? "Selected" : "Select"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="cardRow">
            <div className="miniCard">
              <h3>Rows harvested</h3>
              <div className="big">{view.harvestedRows}</div>
            </div>
            <div className="miniCard">
              <h3>Domains</h3>
              <div className="big">{view.domains.length}</div>
              <span className="optionHint">{starters.length} starter · {grown.length} grown</span>
            </div>
            <div className="miniCard">
              <h3>Dark-launch status</h3>
              <div className="big">{view.dispatchBinding.state}</div>
              <span className="optionHint">Read-only register projection</span>
            </div>
          </div>

          <div className="settingsLabel">Profile peek</div>
          <div className="modelTable">
            {view.profiles.length === 0 ? <div className="modelRow"><span className="muted">No profile cells yet.</span></div> : null}
            {view.profiles.map((profile) => (
              <div className="modelRow" key={[
                profile.provider, profile.modelId, profile.modelVersion, profile.domainId,
                profile.step, profile.metric
              ].join(":")}>
                <div className="modelName">
                  {profile.modelId}
                  <div style={{ fontSize: 11, fontWeight: 400, color: "var(--muted)" }}>
                    {profile.provider} · {profile.modelVersion}
                  </div>
                </div>
                <span className="roleChip">{profile.domainName ?? "All domains"}</span>
                <span className="roleChip">{profile.step}</span>
                <span className="optionHint">
                  {profile.metric}: {profile.value === null ? "no value" : profile.value.toFixed(3)} · n={profile.n}
                  {profile.rank === null ? "" : ` · rank ${profile.rank}`} · v{profile.derivationVersion}
                </span>
              </div>
            ))}
          </div>

          <div className="settingsLabel">Parked HARVEST runs</div>
          {view.parkedRuns.length === 0 ? <p className="muted">No runs are circuit-broken.</p> : null}
          {view.parkedRuns.map((run) => (
            <details className="miniCard" key={run.runId} style={{ marginBottom: 10 }}>
              <summary>{run.runId} · {run.consecutiveFailures} consecutive failures</summary>
              <h3 style={{ marginTop: 12 }}>Failure receipts</h3>
              <ul>
                {run.receipts.map((receipt) => (
                  <li key={receipt.attemptId}>
                    <code>#{receipt.atSequence}</code> {receipt.reason} · <code>{receipt.attemptId}</code>
                  </li>
                ))}
              </ul>
            </details>
          ))}

          <div className="settingsLabel">Starter list</div>
          <div className="miniCard">
            <ul style={{ columns: 2, margin: 0 }}>
              {starters.map((domain) => <li key={domain.domainId}>{domain.canonicalName}</li>)}
            </ul>
          </div>

          <div className="settingsLabel">Grown domains</div>
          <div className="miniCard">
            {grown.length === 0 ? <span className="muted">No grown domains yet.</span> : (
              <ul style={{ margin: 0 }}>
                {grown.map((domain) => (
                  <li key={domain.domainId} title={domain.provenanceRef}>
                    {domain.canonicalName} · <code>{domain.provenanceRef}</code>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
