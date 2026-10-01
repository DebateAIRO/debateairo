"use client";

import { useEffect, useState } from "react";
import type { ContractClient } from "@debateai/contract";
import { exhaustive } from "@debateai/kernel";
import { contractClient } from "@/lib/api";
import { readBillingUsage, type BillingUsage } from "@/lib/billing/usage";
import { formatNumber, t, type MessageCatalog } from "@/lib/i18n/translate";
import { RESET_TIME_MARK, ResetSentence } from "./ResetSentence";

type PersonScope = "PERSON_DAY" | "PERSON_WEEK" | "PERSON_MONTH";
type UsageWindow = Readonly<{ scope: PersonScope; percent: number; resets_at: string }>;

const SCOPES: readonly PersonScope[] = Object.freeze(["PERSON_DAY", "PERSON_WEEK", "PERSON_MONTH"]);

function labelKey(scope: PersonScope): string {
  switch (scope) {
    case "PERSON_DAY": return "billing.usage.day";
    case "PERSON_WEEK": return "billing.usage.week";
    case "PERSON_MONTH": return "billing.usage.month";
    default: return exhaustive(scope);
  }
}

function windowsOf(usage: BillingUsage | null): readonly UsageWindow[] {
  if (usage === null) return [];
  return SCOPES.flatMap((scope) => {
    const found = usage.windows.find((window) => window.scope === scope);
    return found === undefined ? [] : [Object.freeze({ scope, percent: found.percent, resets_at: found.resets_at })];
  });
}

/**
 * Paid-plans spec §1.2 and §2.10: the person's day, week and month as a percent
 * with the reset time under each. No dollar amount of credit is shown anywhere.
 * 110% is a running debate's finish leeway; the bar is then full.
 */
export function UsageBars({
  catalog,
  locale,
  client = contractClient,
  onPlan
}: {
  catalog: MessageCatalog;
  locale: string;
  client?: Pick<ContractClient, "getBillingUsage">;
  /**
   * Paid plans (spec §2.3.4; ruling Q-8): the plan this read names, for a page
   * that shows it in place of its plan chooser (/new's `rememberPlan`, B10a).
   * Pass a stable callback.
   */
  onPlan?: (planId: BillingUsage["plan_id"]) => void;
}) {
  const [usage, setUsage] = useState<BillingUsage | null>(null);
  useEffect(() => {
    let active = true;
    void readBillingUsage(client).then((value) => {
      if (!active) return;
      setUsage(value);
      if (value !== null) onPlan?.(value.plan_id);
    });
    return () => { active = false; };
  }, [client, onPlan]);
  const windows = windowsOf(usage);
  const month = windows.find((window) => window.scope === "PERSON_MONTH");
  if (month === undefined) return null;
  const day = windows.find((window) => window.scope === "PERSON_DAY");
  const week = windows.find((window) => window.scope === "PERSON_WEEK");
  const pct = (window: UsageWindow): string => formatNumber(locale, window.percent);
  const line = day !== undefined && week !== undefined
    ? t(catalog, "billing.usage.line", { dayPct: pct(day), weekPct: pct(week), monthPct: pct(month) })
    : t(catalog, "billing.usage.lineFree", { monthPct: pct(month) });
  return (
    <section className="usageBars" aria-label={t(catalog, "billing.usage.title")}>
      <p className="usageLine">{line}</p>
      {windows.map((window) => (
        <div className="usageBar" key={window.scope}>
          <div
            className="usageTrack"
            role="meter"
            aria-label={t(catalog, labelKey(window.scope))}
            aria-valuemin={0}
            aria-valuemax={110}
            aria-valuenow={window.percent}
          >
            <span className="usageFill" style={{ width: `${Math.min(window.percent, 100)}%` }} />
          </div>
          <ResetSentence
            className="usageReset"
            text={t(catalog, "billing.usage.resets", { time: RESET_TIME_MARK })}
            at={window.resets_at}
            locale={locale}
          />
        </div>
      ))}
    </section>
  );
}
