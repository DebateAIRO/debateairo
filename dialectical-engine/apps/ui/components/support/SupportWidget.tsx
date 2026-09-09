"use client";

import { useEffect,useRef,useState } from "react";
import {
  Assistant,type SupportAssistantLanguage
} from "./Assistant.js";

const WORDS = Object.freeze({
  en: Object.freeze({ button: "Help",full: "Open full page" }),
  ro: Object.freeze({ button: "Ajutor",full: "Deschide pagina completă" })
});

export type SupportWidgetProps = Readonly<{
  context?: Readonly<{ runId: string }>;
}>;

export function SupportWidget({ context }: SupportWidgetProps) {
  const [expanded,setExpanded] = useState(false);
  const [language,setLanguage] = useState<SupportAssistantLanguage>("en");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expanded) return;
    root.current?.querySelector<HTMLElement>('[name="support-message"]')?.focus();
  },[expanded]);

  const label = WORDS[language].button;
  return (
    <div ref={root} className="supportWidget" data-widget-state={expanded ? "expanded" : "collapsed"}>
      <button
        type="button"
        className="supportWidgetToggle"
        data-support-widget-toggle
        aria-label={label}
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setExpanded((current) => !current);
          }
        }}
      >{label}</button>
      {expanded ? (
        <section className="supportWidgetPanel scroll" data-support-widget-panel>
          <Assistant
            {...(context === undefined ? {} : { initialContext: context })}
            onLanguageChange={setLanguage}
          />
          <a className="supportWidgetFullPage" href="/help">{WORDS[language].full}</a>
        </section>
      ) : null}
    </div>
  );
}
