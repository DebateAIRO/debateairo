"use client";

import { useEffect,useState,type FormEvent } from "react";
import { useChromeI18n } from "../../lib/i18n/I18nProvider";
import { isLocale } from "../../lib/i18n/locales";
import { t } from "../../lib/i18n/translate";
import { supportPost } from "./http.js";

export function CaseOpened({ token,text }: Readonly<{
  token: string;
  text: string;
}>) {
  const link = `/help?case=${encodeURIComponent(token)}`;
  return <p>{text} <a href={link}>{link}</a></p>;
}

export type SupportCaseViewMessage = Readonly<{
  id: string;
  role: "user" | "assistant" | "V";
  text: string;
}>;

export function CaseView({ state,messages,summary = null,text = null,onReply }: Readonly<{
  token: string;
  state: "NEW" | "WAITING_ON_V" | "WAITING_ON_USER" | "CLOSED" | "NOT_FOUND" | "SHREDDED";
  messages: readonly SupportCaseViewMessage[];
  summary?: string | null;
  text?: string | null;
  onReply?: (text: string) => void;
}>) {
  const { catalog } = useChromeI18n();
  if (state === "NOT_FOUND" || state === "SHREDDED") {
    return text === null ? null : <p>{text}</p>;
  }
  return <section aria-label={t(catalog,"support.case.region")}>
    <p>{t(catalog,"support.case.state")}: {state}</p>
    {summary === null ? null : <aside>
      <p>{summary}</p>
    </aside>}
    {messages.map((message) => <article key={message.id} data-role={message.role}>
      <strong>{message.role.toUpperCase()}</strong>
      <p>{message.text}</p>
    </article>)}
    {text === null ? null : <p>{text}</p>}
    <form onSubmit={(event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const field = event.currentTarget.elements.namedItem("reply");
      if (field instanceof HTMLTextAreaElement && field.value.trim() !== "") {
        onReply?.(field.value);
      }
    }}><label>{t(catalog,"support.case.reply")}<textarea name="reply" /></label>
      <button type="submit">{t(catalog,"support.send")}</button>
    </form>
  </section>;
}

export const supportCaseClient = Object.freeze({
  async reply(token: string,text: string): Promise<Response> {
    return await supportPost(
      `/api/v1/support/cases/${encodeURIComponent(token)}/messages`,{ text }
    );
  }
});

export function CaseLookup() {
  const [record,setRecord] = useState<Readonly<{
    token: string;state: Parameters<typeof CaseView>[0]["state"];
    messages: readonly SupportCaseViewMessage[];summary: string | null;text: string | null;
  }> | null>(null);
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("case");
    if (token === null) return;
    void fetch(`/api/v1/support/cases/${encodeURIComponent(token)}`)
      .then(async (response) => response.json() as Promise<Record<string,unknown>>)
      .then((body) => {
        if (body.case === undefined || typeof body.case !== "object" || body.case === null) {
          setRecord({
            token,state: "NOT_FOUND",messages: [],summary: null,
            text: typeof body.text === "string" ? body.text : null
          });
          return;
        }
        const opened = body.case as Record<string,unknown>;
        if (!isLocale(opened.language)) return;
        setRecord({
          token,
          state: body.kind === "SHREDDED"
            ? "SHREDDED" : String(opened.state) as Parameters<typeof CaseView>[0]["state"],
          messages: body.kind === "SHREDDED" ? [] : body.messages as readonly SupportCaseViewMessage[],
          summary: body.kind === "SHREDDED" || typeof opened.summary !== "string"
            ? null : opened.summary,
          text: typeof body.text === "string" ? body.text : null
        });
      }).catch(() => {});
  },[]);
  if (record === null) return null;
  return <CaseView {...record} onReply={(text) => {
    void supportCaseClient.reply(record.token,text).then(() => window.location.reload());
  }} />;
}

export function OwnCaseList({ signedIn,cases }: Readonly<{
  signedIn: boolean;
  cases: readonly Readonly<{ caseId: string;state: string;createdAt: string }>[];
}>) {
  const { catalog } = useChromeI18n();
  if (!signedIn) return null;
  return <section aria-label={t(catalog,"support.case.yours")}>
    <ul>{cases.map((item) => <li key={item.caseId}>
      {item.caseId} {item.state} {item.createdAt}
    </li>)}</ul>
  </section>;
}

export function OwnCaseLookup() {
  const [cases,setCases] = useState<readonly Readonly<{
    caseId: string;state: string;createdAt: string;
  }>[] | null>(null);
  useEffect(() => {
    void fetch("/api/v1/support/cases")
      .then(async (response) => response.ok ? response.json() as Promise<Record<string,unknown>> : null)
      .then((body) => {
        if (body === null || !Array.isArray(body.cases)) return;
        setCases(body.cases.flatMap((entry) => {
          if (typeof entry !== "object" || entry === null) return [];
          const row = entry as Readonly<Record<string,unknown>>;
          return typeof row.case_id === "string"
            && typeof row.state === "string"
            && typeof row.created_at === "string"
            ? [{ caseId: row.case_id,state: row.state,createdAt: row.created_at }] : [];
        }));
      });
  },[]);
  return <OwnCaseList signedIn={cases !== null} cases={cases ?? []} />;
}
