"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getEvaluatorDevMenu,
  selectEvaluatorConsumerModel,
  type EvaluatorDevMenuView
} from "@/lib/api";
import type { LocaleCode } from "@/lib/i18n/locales";
import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import settingsEnglish from "@/messages/en/settings.json";

const UNBOUND_STATE = "UNBOUND";
const HARVEST_MODE = "HARVEST";
const VLLM_NAME = "vLLM";

export type SettingsI18nProps = Readonly<{
  catalog?: MessageCatalog;
  locale?: LocaleCode;
}>;

export function EvaluatorDevMenu({
  token,
  catalog = settingsEnglish,
  locale = "en"
}: Readonly<{ token: string }> & SettingsI18nProps) {
  const [view, setView] = useState<EvaluatorDevMenuView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setView(await getEvaluatorDevMenu(token));
      setError(null);
    } catch (failure) {
      setError(failure instanceof Error
        ? failure.message
        : t(catalog, "settings.evaluator.loadFailed"));
    }
  }, [catalog, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function chooseModel(modelId: string) {
    setSaving(true);
    try {
      await selectEvaluatorConsumerModel(token, modelId);
      await load();
    } catch (failure) {
      setError(failure instanceof Error
        ? failure.message
        : t(catalog, "settings.evaluator.selectFailed"));
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
        {t(catalog, "settings.evaluator.developerSurface")}
      </div>
      <h2 id="evaluator-dev-menu" className="display sm" style={{ marginTop: 12 }}>
        {t(catalog, "settings.evaluator.title")}
      </h2>
      <p className="optionHint">
        {t(catalog, "settings.evaluator.collectOnly")} · {UNBOUND_STATE}
      </p>

      {error ? <div className="error" style={{ marginTop: 16 }}>{error}</div> : null}
      {view === null && error === null
        ? <p className="muted">{t(catalog, "settings.evaluator.loading")}</p>
        : null}

      {view ? (
        <>
          <div className="settingsLabel">{t(catalog, "settings.evaluator.consumerModel")}</div>
          {view.catalog.state === "UNAVAILABLE" ? (
            <div className="miniCard">
              <h3>{t(catalog, "settings.evaluator.containerUnavailable")}</h3>
              <span className="optionHint">
                {view.catalog.failureCode ?? t(catalog, "settings.evaluator.noCatalogProbe")}
              </span>
            </div>
          ) : view.catalog.models.length === 0 ? (
            <p className="muted">{t(catalog, "settings.evaluator.noModels")}</p>
          ) : (
            <div className="modelTable">
              {view.catalog.models.map((model) => {
                const selected = view.selectedConsumer?.modelId === model.modelId;
                return (
                  <div className="modelRow" key={model.modelId}>
                    <div className="modelName">{model.modelId}</div>
                    <span className="optionHint">
                      {selected
                        ? t(catalog, "settings.evaluator.selectedConsumer")
                        : t(catalog, "settings.evaluator.enumeratedByVllm", { engine: VLLM_NAME })}
                    </span>
                    <button
                      type="button"
                      className="btn"
                      disabled={saving || selected}
                      onClick={() => void chooseModel(model.modelId)}
                    >
                      {selected
                        ? t(catalog, "settings.evaluator.selected")
                        : t(catalog, "settings.evaluator.select")}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="cardRow">
            <div className="miniCard">
              <h3>{t(catalog, "settings.evaluator.rowsHarvested")}</h3>
              <div className="big">{view.harvestedRows}</div>
            </div>
            <div className="miniCard">
              <h3>{t(catalog, "settings.evaluator.domains")}</h3>
              <div className="big">{view.domains.length}</div>
              <span className="optionHint">
                {t(catalog, "settings.evaluator.domainCounts", {
                  starters: starters.length,
                  grown: grown.length
                })}
              </span>
            </div>
            <div className="miniCard">
              <h3>{t(catalog, "settings.evaluator.darkLaunchStatus")}</h3>
              <div className="big">{view.dispatchBinding.state}</div>
              <span className="optionHint">{t(catalog, "settings.evaluator.readOnlyProjection")}</span>
            </div>
          </div>

          <div className="settingsLabel">{t(catalog, "settings.evaluator.profilePeek")}</div>
          <div className="modelTable">
            {view.profiles.length === 0 ? (
              <div className="modelRow">
                <span className="muted">{t(catalog, "settings.evaluator.noProfiles")}</span>
              </div>
            ) : null}
            {view.profiles.map((profile) => {
              const value = profile.value === null
                ? t(catalog, "settings.evaluator.noValue")
                : profile.value.toFixed(3);
              const rank = profile.rank === null
                ? ""
                : t(catalog, "settings.evaluator.rank", { rank: profile.rank });
              return (
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
                  <span className="roleChip">
                    {profile.domainName ?? t(catalog, "settings.evaluator.allDomains")}
                  </span>
                  <span className="roleChip">{profile.step}</span>
                  <span className="optionHint">
                    {t(catalog, "settings.evaluator.profileStats", {
                      metric: profile.metric,
                      value,
                      count: profile.n,
                      rank,
                      version: profile.derivationVersion
                    })}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="settingsLabel">
            {t(catalog, "settings.evaluator.parkedRuns", { mode: HARVEST_MODE })}
          </div>
          {view.parkedRuns.length === 0
            ? <p className="muted">{t(catalog, "settings.evaluator.noParkedRuns")}</p>
            : null}
          {view.parkedRuns.map((run) => (
            <details className="miniCard" key={run.runId} style={{ marginBottom: 10 }}>
              <summary>
                {tPlural(
                  catalog,
                  "settings.evaluator.consecutiveFailures",
                  run.consecutiveFailures,
                  locale,
                  { runId: run.runId }
                )}
              </summary>
              <h3 style={{ marginTop: 12 }}>{t(catalog, "settings.evaluator.failureReceipts")}</h3>
              <ul>
                {run.receipts.map((receipt) => (
                  <li key={receipt.attemptId}>
                    <code>#{receipt.atSequence}</code> {receipt.reason} · <code>{receipt.attemptId}</code>
                  </li>
                ))}
              </ul>
            </details>
          ))}

          <div className="settingsLabel">{t(catalog, "settings.evaluator.starterList")}</div>
          <div className="miniCard">
            <ul style={{ columns: 2, margin: 0 }}>
              {starters.map((domain) => <li key={domain.domainId}>{domain.canonicalName}</li>)}
            </ul>
          </div>

          <div className="settingsLabel">{t(catalog, "settings.evaluator.grownDomains")}</div>
          <div className="miniCard">
            {grown.length === 0 ? (
              <span className="muted">{t(catalog, "settings.evaluator.noGrownDomains")}</span>
            ) : (
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
