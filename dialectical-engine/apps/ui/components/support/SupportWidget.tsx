"use client";

import { useEffect,useRef,useState } from "react";
import { useChromeI18n } from "../../lib/i18n/I18nProvider";
import { t } from "../../lib/i18n/translate";
import { Assistant } from "./Assistant.js";

// The panel folds back into the dock corner on the way out, and those frames need
// it mounted, so the widget holds a "closing" state for exactly that long. Reduced
// motion skips the phase rather than sitting through frames nobody is shown.
const CLOSE_FRAMES_MS = 180;

function motionWanted(): boolean {
  return typeof matchMedia === "function"
    && !matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const FULL_PAGE_ARROW = <svg
  className="supportWidgetFullPageArrow"
  width="11"
  height="11"
  viewBox="0 0 16 16"
  fill="none"
  stroke="currentColor"
  strokeWidth="1.6"
  strokeLinecap="round"
  strokeLinejoin="round"
  aria-hidden="true"
><path d="M5 11l6-6" /><path d="M6 5h5v5" /></svg>;

export function SupportWidget() {
  const { catalog } = useChromeI18n();
  const [expanded,setExpanded] = useState(false);
  const [closing,setClosing] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (!expanded) return;
    opened.current = true;
    root.current?.querySelector<HTMLElement>('[name="support-message"]')?.focus();
  },[expanded]);

  // The toggle is the only thing left to carry focus once the panel is dismissed,
  // and it is where the keyboard has to land to reopen it.
  useEffect(() => {
    if (expanded || !opened.current) return;
    toggle.current?.focus();
  },[expanded]);

  useEffect(() => {
    if (!closing) return;
    const frames = setTimeout(() => setClosing(false),CLOSE_FRAMES_MS);
    return () => clearTimeout(frames);
  },[closing]);

  function open(): void {
    setClosing(false);
    setExpanded(true);
  }

  function close(): void {
    if (!expanded) return;
    setExpanded(false);
    if (motionWanted()) setClosing(true);
  }

  const label = t(catalog,"chrome.help");
  const state = expanded ? "expanded" : closing ? "closing" : "collapsed";
  return (
    <div
      ref={root}
      className="supportWidget"
      data-widget-state={state}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !expanded) return;
        event.preventDefault();
        close();
      }}
    >
      <button
        ref={toggle}
        type="button"
        className="supportWidgetToggle"
        data-support-widget-toggle
        aria-label={label}
        aria-expanded={expanded}
        onClick={() => expanded ? close() : open()}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          if (expanded) close(); else open();
        }}
      >{label}</button>
      {expanded || closing ? (
        <section className="supportWidgetPanel scroll" data-support-widget-panel>
          <Assistant
            onClose={close}
          />
          <a className="supportWidgetFullPage" href="/help">
            <span>{t(catalog,"support.fullPage")}</span>
            {FULL_PAGE_ARROW}
          </a>
        </section>
      ) : null}
    </div>
  );
}
