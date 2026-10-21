"use client";
import { useEffect, useMemo, useState } from "react";
import { createThreatReportsClient, type ThreatReportsClient } from "../lib/threatReportsApi.js";
import { t, type MessageCatalog } from "../lib/i18n/translate.js";
import staffEnglish from "../messages/en/staff.json";

export function ThreatReportsLink({ client, catalog = staffEnglish }: { client?: ThreatReportsClient; catalog?: MessageCatalog }) {
  const api = useMemo(() => client ?? createThreatReportsClient(), [client]);
  const [unread, setUnread] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    void api.summary().then(value => { if (active) setUnread(value.unread); }, () => { if (active) setUnread(null); });
    return () => { active = false; api.cancel(); };
  }, [api]);
  if (unread === null) return null;
  return <div className="threatReportsLinkRow"><a className="setBtn threatReportsLink" href="/admin/threat-reports">{t(catalog, "staff.threatReports.link")}<span className="threatReportsCount" data-part="unread-count">{t(catalog, "staff.threatReports.unread", { count: unread })}</span></a></div>;
}
