"use client";

import { useEffect,useState,type FormEvent } from "react";
import type { SupportAssistantLanguage } from "./Assistant";
import { supportPost } from "./http.js";

const COPY = Object.freeze({
  en: Object.freeze({
    opened: "I've opened case {token} for a person. Expected reply: within {sla} hours. Check replies at {link}. I can't promise an outcome.",
    human: "Support (a person)",
    missing: "No case with that code.",
    closed: "This case is closed. You can still reply to reopen it.",
    reply: "Reply to this case",
    summary: "Model-written summary — advisory",
    shredded: "This conversation was erased at the owner's request."
  }),
  ro: Object.freeze({
    opened: "Am deschis cazul {token} pentru o persoană. Răspuns estimat: în {sla} ore. Vezi răspunsurile la {link}. Nu pot promite un rezultat.",
    human: "Suport (o persoană)",
    missing: "Nu există niciun caz cu acest cod.",
    closed: "Acest caz este închis. Poți răspunde pentru a-l redeschide.",
    reply: "Răspunde la acest caz",
    summary: "Rezumat scris de model — orientativ",
    shredded: "Această conversație a fost ștearsă la cererea proprietarului."
  })
});

export function CaseOpened({ token,slaHours,language }: Readonly<{
  token: string;
  slaHours: number;
  language: SupportAssistantLanguage;
}>) {
  const link = `/help?case=${encodeURIComponent(token)}`;
  const text = COPY[language].opened
    .replace("{token}",token)
    .replace("{sla}",String(slaHours))
    .replace("{link}",link);
  return <p>{text} <a href={link}>{link}</a></p>;
}

export type SupportCaseViewMessage = Readonly<{
  id: string;
  role: "user" | "assistant" | "V";
  text: string;
}>;

export function CaseView({ language,state,messages,summary = null,onReply }: Readonly<{
  token: string;
  language: SupportAssistantLanguage;
  state: "NEW" | "WAITING_ON_V" | "WAITING_ON_USER" | "CLOSED" | "NOT_FOUND" | "SHREDDED";
  messages: readonly SupportCaseViewMessage[];
  summary?: string | null;
  onReply?: (text: string) => void;
}>) {
  if (state === "NOT_FOUND") return <p>{COPY[language].missing}</p>;
  if (state === "SHREDDED") return <p>{COPY[language].shredded}</p>;
  return <section aria-label="Support case">
    <p>State: {state}</p>
    {summary === null ? null : <aside aria-label={COPY[language].summary}>
      <strong>{COPY[language].summary}</strong>
      <p>{summary}</p>
    </aside>}
    {messages.map((message) => <article key={message.id} data-role={message.role}>
      <strong>{message.role === "V" ? COPY[language].human : message.role.toUpperCase()}</strong>
      <p>{message.text}</p>
    </article>)}
    {state === "CLOSED" ? <p>{COPY[language].closed}</p> : null}
    <form onSubmit={(event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const field = event.currentTarget.elements.namedItem("reply");
      if (field instanceof HTMLTextAreaElement && field.value.trim() !== "") {
        onReply?.(field.value);
      }
    }}><label>{COPY[language].reply}<textarea name="reply" /></label><button type="submit">Send</button></form>
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
    token: string;language: SupportAssistantLanguage;state: Parameters<typeof CaseView>[0]["state"];
    messages: readonly SupportCaseViewMessage[];summary: string | null;
  }> | null>(null);
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("case");
    if (token === null) return;
    void fetch(`/api/v1/support/cases/${encodeURIComponent(token)}`)
      .then(async (response) => response.ok ? response.json() as Promise<Record<string,unknown>> : null)
      .then((body) => {
        if (body === null) {
          setRecord({ token,language: "en",state: "NOT_FOUND",messages: [],summary: null });
          return;
        }
        const opened = body.case as Record<string,unknown>;
        setRecord({
          token,language: opened.language === "ro" ? "ro" : "en",
          state: body.kind === "SHREDDED"
            ? "SHREDDED" : String(opened.state) as Parameters<typeof CaseView>[0]["state"],
          messages: body.kind === "SHREDDED" ? [] : body.messages as readonly SupportCaseViewMessage[],
          summary: body.kind === "SHREDDED" || typeof opened.summary !== "string"
            ? null : opened.summary
        });
      });
  },[]);
  if (record === null) return null;
  return <CaseView {...record} onReply={(text) => {
    void supportCaseClient.reply(record.token,text).then(() => window.location.reload());
  }} />;
}

export function OwnCaseList({ signedIn,cases,language }: Readonly<{
  signedIn: boolean;
  cases: readonly Readonly<{ caseId: string;state: string;createdAt: string }>[];
  language: SupportAssistantLanguage;
}>) {
  if (!signedIn) return null;
  return <section aria-label={language === "en" ? "Your support cases" : "Cazurile tale de suport"}>
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
  return <OwnCaseList signedIn={cases !== null} cases={cases ?? []} language="en" />;
}
