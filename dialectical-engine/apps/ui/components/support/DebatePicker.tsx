"use client";

import { useEffect,useState } from "react";

type BrowserDebate = Readonly<{
  runId: string;
  question: string;
  createdAtSequence: number;
}>;

function readBrowserDebates(value: unknown): readonly BrowserDebate[] {
  if (typeof value !== "object" || value === null) return [];
  const record = value as Readonly<Record<string,unknown>>;
  const members = [
    ...(Array.isArray(record.items) ? record.items : []),
    ...(Array.isArray(record.open_runs) ? record.open_runs : [])
  ];
  return Object.freeze(members.flatMap((member) => {
    if (typeof member !== "object" || member === null) return [];
    const row = member as Readonly<Record<string,unknown>>;
    if (typeof row.run_ref !== "string" || typeof row.question_line !== "string") return [];
    return [Object.freeze({
      runId: row.run_ref,
      question: row.question_line,
      createdAtSequence: typeof row.created_at_sequence === "number"
        ? row.created_at_sequence : 0
    })];
  }).sort((left,right) => right.createdAtSequence-left.createdAtSequence));
}

export function DebatePicker({ signedIn,language,onSelect,onLatest }: Readonly<{
  signedIn: boolean;
  language: "en" | "ro";
  onSelect: (runId: string) => void;
  onLatest: () => void;
}>) {
  const [debates,setDebates] = useState<readonly BrowserDebate[]>([]);
  useEffect(() => {
    if (!signedIn) {
      setDebates([]);
      return;
    }
    let active = true;
    void fetch("/api/v1/answers?limit=100&offset=0",{
      method: "GET",cache: "no-store",credentials: "same-origin"
    }).then(async (response) => response.ok ? response.json() : null)
      .then((body) => { if (active) setDebates(readBrowserDebates(body)); })
      .catch(() => { if (active) setDebates([]); });
    return () => { active = false; };
  },[signedIn]);
  if (!signedIn) return null;

  return (
    <section aria-label={language === "en" ? "Choose one of my debates" : "Alege una dintre dezbaterile mele"}>
      <button type="button" onClick={() => onLatest()}>
        {language === "en" ? "My latest debate" : "Cea mai recentă dezbatere a mea"}
      </button>
      <ul>
        {debates.map((debate) => <li key={debate.runId}>
          <button type="button" onClick={() => onSelect(debate.runId)}>
            {debate.question}
          </button>
        </li>)}
      </ul>
    </section>
  );
}
