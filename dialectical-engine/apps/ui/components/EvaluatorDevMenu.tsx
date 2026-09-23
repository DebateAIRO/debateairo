"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getEvaluatorDevMenu,
  getSettingsView,
  selectEvaluatorConsumerModel,
  type EvaluatorDevMenuView
} from "@/lib/api";
import { AuthGate } from "@/components/AuthGate";
import { AccountErasureControls } from "@/components/AccountErasureControls";
import { LegacyRunClaimControls } from "@/components/LegacyRunClaimControls";
import { SessionControls } from "@/components/SessionControls";
import { ConsentSettingsPanel } from "@/components/consent/ConsentSettingsPanel";
import type { LocaleCode } from "@/lib/i18n/locales";
import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import { modelMeta } from "@/lib/models";
import type { SettingsView } from "@/lib/v3/adapter";
import settingsEnglish from "@/messages/en/settings.json";

const EVALUATOR_DEV_MENU_ENABLED = process.env.NODE_ENV !== "production"
  && process.env.NEXT_PUBLIC_EVALUATOR_DEV_MENU_ENABLED === "true";
const UNBOUND_STATE = "UNBOUND";
const HARVEST_MODE = "HARVEST";
const VLLM_NAME = "vLLM";

type SettingsI18nProps = Readonly<{
  catalog?: MessageCatalog;
  locale?: LocaleCode;
}>;

export function SettingsPageClient({
  catalog = settingsEnglish,
  locale = "en"
}: SettingsI18nProps) {
  return (
    <AuthGate>
      {() => <AccountSettingsScreen catalog={catalog} locale={locale} />}
    </AuthGate>
  );
}

function AccountSettingsScreen({ catalog, locale }: Required<SettingsI18nProps>) {
  const identityRows = [
    {
      key: "asker",
      label: t(catalog, "settings.identity.asker"),
      value: t(catalog, "settings.identity.askerUnavailable"),
      absent: true
    },
    {
      key: "scope",
      label: t(catalog, "settings.identity.scope"),
      value: t(catalog, "settings.identity.personal"),
      absent: false
    },
    {
      key: "model",
      label: t(catalog, "settings.identity.model"),
      value: t(catalog, "settings.identity.modelValue"),
      absent: false
    }
  ] as const;

  return (
    <div className="screen scroll setScreen">
      <div className="setBody">
        <div className="setInner">
          <p className="setEyebrow">{t(catalog, "settings.identity.eyebrow")}</p>
          <h1 className="setTitle">{t(catalog, "settings.identity.title")}</h1>
          <p className="setLede">{t(catalog, "settings.identity.lede")}</p>

          <div className="setPanel">
            <div className="setPanelCore">
              {identityRows.map((row) => (
                <div className="setIdentityRow" key={row.key}>
                  <span className="setIdentityKey">{row.label}</span>
                  <span className="setIdentityValue" data-absent={row.absent ? "true" : undefined}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <SessionControls catalog={catalog} locale={locale} />
          <ConsentSettingsPanel />
          <LegacyRunClaimControls catalog={catalog} locale={locale} />
          <AccountErasureControls catalog={catalog} locale={locale} />
        </div>
      </div>
    </div>
  );
}

/** Kept as the read-only operator projection used by an operator-capable host. */
function OperatorSettingsScreen({
  token,
  catalog = settingsEnglish,
  locale = "en"
}: Readonly<{ token: string }> & SettingsI18nProps) {
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
      .catch((failure) => {
        if (active) {
          setError(failure instanceof Error
            ? failure.message
            : t(catalog, "settings.operator.loadFailed"));
        }
      });
    return () => {
      active = false;
    };
  }, [catalog, token]);

  return (
    <div className="screen scroll">
      <div className="screenInner medium">
        <h1 className="display sm">{t(catalog, "settings.operator.title")}</h1>
        <p className="lede" style={{ marginTop: 6 }}>
          {t(catalog, "settings.operator.lede")}
        </p>

        {error ? <div className="error" style={{ marginTop: 24 }}>{error}</div> : null}

        <SessionControls catalog={catalog} locale={locale} />

        <div className="pill pillGen" style={{ marginTop: 24 }}>
          <span className="dot" />
          {t(catalog, "settings.operator.readOnly")}
        </div>
        <span className="optionHint" style={{ display: "block", marginTop: 8 }}>
          {t(catalog, "settings.operator.readOnlyReason")}
        </span>

        <div className="settingsLabel">{t(catalog, "settings.operator.modelsAndRoles")}</div>
        <div className="modelTable">
          {view === null && error === null ? (
            <div className="modelRow">
              <span className="muted">{t(catalog, "settings.operator.loading")}</span>
            </div>
          ) : null}
          {view !== null && view.models.length === 0 ? (
            <div className="modelRow">
              <span className="muted">{t(catalog, "settings.operator.noModels")}</span>
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
                    <span key={taskClass} className="roleChip">{taskClass}</span>
                  ))}
                </div>
                <span
                  className="modelSpend"
                  style={{ width: 90 }}
                  title={t(catalog, "settings.operator.moneyUnavailableReason")}
                >
                  {t(catalog, "settings.operator.noCapRecorded")}
                </span>
                <span
                  className="modelSpend"
                  title={t(catalog, "settings.operator.moneyUnavailableReason")}
                >
                  —
                </span>
                <button
                  type="button"
                  className="switch"
                  role="switch"
                  aria-checked
                  aria-disabled
                  disabled
                  aria-label={t(catalog, "settings.operator.modelRoutedLabel", { model: row.model_id })}
                  title={t(catalog, "settings.operator.modelRoutedHint")}
                >
                  <span className="knob" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="cardRow">
          <div className="miniCard">
            <h3>{t(catalog, "settings.operator.spendCap")}</h3>
            <span className="optionHint">{t(catalog, "settings.operator.spendCapHint")}</span>
            <div className="big" title={t(catalog, "settings.operator.moneyUnavailableReason")}>
              — <small>{t(catalog, "settings.operator.notRecorded")}</small>
            </div>
          </div>
          <div className="miniCard">
            <h3>{t(catalog, "settings.operator.registerVersion")}</h3>
            <span className="optionHint">{t(catalog, "settings.operator.registerVersionHint")}</span>
            <div className="big">
              {view === null ? "—" : `v${view.register_version}`} {" "}
              <small>{t(catalog, "settings.operator.register")}</small>
            </div>
          </div>
          <div className="miniCard">
            <h3>{t(catalog, "settings.operator.roleRouting")}</h3>
            <span className="optionHint">{t(catalog, "settings.operator.roleRoutingHint")}</span>
            <button
              type="button"
              className="btn"
              style={{ marginTop: 4 }}
              onClick={() => setAdvancedOpen((value) => !value)}
            >
              {advancedOpen
                ? t(catalog, "settings.operator.hideRoutingJson")
                : t(catalog, "settings.operator.showRoutingJson")}
            </button>
          </div>
        </div>

        {advancedOpen ? (
          <div className="fieldGroup">
            <label htmlFor="routing">{t(catalog, "settings.operator.routingLabel")}</label>
            <textarea
              id="routing"
              value={view === null ? "" : JSON.stringify(view.routing, null, 2)}
              readOnly
              spellCheck={false}
              style={{ minHeight: 200 }}
            />
          </div>
        ) : null}

        {EVALUATOR_DEV_MENU_ENABLED
          ? <EvaluatorDevMenu token={token} catalog={catalog} locale={locale} />
          : null}

        <div className="formActions">
          <button
            type="button"
            className="startBtn"
            disabled
            aria-disabled="true"
            title={t(catalog, "settings.operator.writeUnavailable")}
          >
            {t(catalog, "settings.operator.saveChanges")}
          </button>
        </div>
      </div>
    </div>
  );
}

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
