"use client";

import { useEffect, useState } from "react";
import { getSettingsView } from "@/lib/api";
import { AuthGate } from "@/components/AuthGate";
import { AccountErasureControls } from "@/components/AccountErasureControls";
import { EvaluatorDevMenu, type SettingsI18nProps } from "@/components/EvaluatorDevMenu";
import { LegacyRunClaimControls } from "@/components/LegacyRunClaimControls";
import { SessionControls } from "@/components/SessionControls";
import { ConsentSettingsPanel } from "@/components/consent/ConsentSettingsPanel";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { modelDot } from "@/lib/models";
import type { SettingsView } from "@/lib/v3/adapter";
import settingsEnglish from "@/messages/en/settings.json";
import newDebateEnglish from "@/messages/en/newDebate.json";

const EVALUATOR_DEV_MENU_ENABLED = process.env.NODE_ENV !== "production"
  && process.env.NEXT_PUBLIC_EVALUATOR_DEV_MENU_ENABLED === "true";

export function SettingsPageClient({
  catalog = settingsEnglish,
  locale = "en",
  newDebateCatalog = newDebateEnglish
}: SettingsI18nProps & {
  /** The locale's `newDebate` catalogue: the session gate's copy (review F2). */
  newDebateCatalog?: MessageCatalog;
}) {
  return (
    <AuthGate catalog={newDebateCatalog}>
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
            return (
              <div key={`${row.model_id} ${row.model_version} ${row.provider}`} className="modelRow">
                <span className="modelDot" style={{ ["--dot" as string]: modelDot(row.model_id) }} />
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
