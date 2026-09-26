"use client";

import { useCallback,useEffect,useState,type FormEvent } from "react";
import { useChromeI18n } from "../../lib/i18n/I18nProvider";
import { t } from "../../lib/i18n/translate";
import { consumeSupportCaseTokenFromUrl,supportCaseLink } from "./caseLink.js";
import { supportPost } from "./http.js";

export function CaseOpened({ token,text }: Readonly<{
  token: string;
  text: string;
}>) {
  // DL3-F4: the fragment, so the bearer never reaches a server or a proxy log.
  const link = supportCaseLink(token);
  const safeText = text.replace(`/help?case=${token}`,link);
  return <p>{safeText} <a href={link}>{link}</a></p>;
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
  if (state === "NOT_FOUND") return <p>{text ?? t(catalog,"support.case.missing")}</p>;
  if (state === "SHREDDED") return <p>{text ?? t(catalog,"support.case.shredded")}</p>;
  const summaryAdvisory = t(catalog,"support.summaryAdvisory");
  return <section aria-label={t(catalog,"support.case.region")}>
    <p>{t(catalog,"support.case.state")}: {state}</p>
    {summary === null ? null : <aside aria-label={summaryAdvisory}>
      <strong>{summaryAdvisory}</strong>
      <p>{summary}</p>
    </aside>}
    {messages.map((message) => <article key={message.id} data-role={message.role}>
      <strong>{message.role === "V" ? t(catalog,"support.case.human") : message.role.toUpperCase()}</strong>
      <p>{message.text}</p>
    </article>)}
    {text === null ? null : <p>{text}</p>}
    {state === "CLOSED" ? <p>{t(catalog,"support.case.closed")}</p> : null}
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

/**
 * DL1-F5c/DL3-F4: the bearer travels in `x-support-case-token`. It used to be a
 * path segment, which puts the sole capability to read a whole case — and to
 * reply as the reporter — into every access log and proxy log on the way.
 */
export const supportCaseClient = Object.freeze({
  async reply(token: string,text: string): Promise<Response> {
    return await supportPost("/api/v1/support/case/messages",{ text },undefined,token);
  }
});

export function CaseLookup() {
  const [record,setRecord] = useState<Readonly<{
    token: string;state: Parameters<typeof CaseView>[0]["state"];
    messages: readonly SupportCaseViewMessage[];summary: string | null;text: string | null;
  }> | null>(null);

  const load = useCallback(async (token: string): Promise<void> => {
    const response = await fetch("/api/v1/support/case",{
      headers: { "x-support-case-token": token }
    });
    const body = response.ok ? await response.json() as Record<string,unknown> : null;
    if (body === null || body.case === undefined || typeof body.case !== "object" || body.case === null) {
      setRecord({ token,state: "NOT_FOUND",messages: [],summary: null,text: null });
      return;
    }
    const opened = body.case as Record<string,unknown>;
    setRecord({
      token,
      state: body.kind === "SHREDDED"
        ? "SHREDDED" : String(opened.state) as Parameters<typeof CaseView>[0]["state"],
      messages: body.kind === "SHREDDED" ? [] : body.messages as readonly SupportCaseViewMessage[],
      summary: body.kind === "SHREDDED" || typeof opened.summary !== "string"
        ? null : opened.summary,
      text: typeof body.text === "string" ? body.text : null
    });
  },[]);

  // DL3-F4: the bearer is taken out of the address before the first request and
  // held here, in component state, for the life of this page. Nothing re-reads
  // the URL, so nothing needs the bearer to still be in it.
  useEffect(() => {
    const token = consumeSupportCaseTokenFromUrl(window.location,window.history);
    if (token === null) return;
    void load(token);
  },[load]);

  if (record === null) return null;
  return <CaseView {...record} onReply={(text) => {
    // A reload would look for a bearer this page has already cleared, so the
    // reply re-reads the case through the token it is still holding.
    void supportCaseClient.reply(record.token,text).then(() => load(record.token));
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
