"use client";
import { useEffect, useMemo, useState } from "react";
import { createThreatReportsClient, type ThreatReportsClient } from "../lib/threatReportsApi.js";
import { t, tPlural, type MessageCatalog } from "../lib/i18n/translate.js";
import staffEnglish from "../messages/en/staff.json";

function hasThreatAuthorityInThisTab(): boolean {
  try {
    const stored = sessionStorage.getItem("debateai:staff-authority");
    if (stored === null) return false;
    const authority: unknown = JSON.parse(stored);
    if (authority === null || typeof authority !== "object") return false;
    const { expires_at, capabilities } = authority as { expires_at?: unknown; capabilities?: unknown };
    return typeof expires_at === "string" && Date.parse(expires_at) > Date.now()
      && Array.isArray(capabilities) && capabilities.includes("THREAT_REPORT");
  } catch { return false; }
}

export function ThreatReportsLink({ client, catalog = staffEnglish, locale }: { client?: ThreatReportsClient; catalog?: MessageCatalog; locale?: string }) {
  const api = useMemo(() => client ?? createThreatReportsClient(), [client]);
  const [unread, setUnread] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    let revision = 0;
    const refresh = () => {
      const current = ++revision;
      void api.summary().then(value => { if (active && current === revision) setUnread(value.unread); }, () => { if (active && current === revision) setUnread(null); });
    };
    const authorityChanged = (event: Event) => {
      const capabilities = (event as CustomEvent<{ capabilities: string[] }>).detail.capabilities;
      if (capabilities.includes("THREAT_REPORT")) refresh();
      else { revision++; setUnread(null); }
    };
    window.addEventListener("debateai:staff-authority-changed", authorityChanged);
    if (client !== undefined || hasThreatAuthorityInThisTab()) refresh();
    return () => { active = false; revision++; window.removeEventListener("debateai:staff-authority-changed", authorityChanged); api.cancel(); };
  }, [api, client]);
  if (unread === null) return null;
  const language = locale ?? document.documentElement.lang ?? "en";
  const countLabel = language.startsWith("ro")
    ? t(catalog, `staff.threatReports.unread.${new Intl.PluralRules("ro").select(unread)}`, { count: unread })
    : tPlural(catalog, "staff.threatReports.unread", unread, { count: unread });
  return <div className="threatReportsLinkRow"><a className="setBtn threatReportsLink" href="/admin/threat-reports">{t(catalog, "staff.threatReports.link")}<span className="threatReportsCount" data-part="unread-count">{countLabel}</span></a></div>;
}
