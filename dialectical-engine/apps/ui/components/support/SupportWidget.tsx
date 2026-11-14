"use client";

import { useEffect,useRef,useState } from "react";
import { useChromeI18n } from "../../lib/i18n/I18nProvider";
import { t } from "../../lib/i18n/translate";
import { Assistant } from "./Assistant.js";
import { useSupportOffered } from "./availability.js";

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
  const offered = useSupportOffered();
  const [expanded,setExpanded] = useState(false);
  const [closing,setClosing] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);
  // Whether closing gives focus back to the toggle: not when the panel closes because focus already went elsewhere.
  const refocus = useRef(true);
  // The last thing the person did was a pointer press, not a key: the focus it moves is their own click or tap, and it
  // leaves the panel as it was. Kept until the next key press, not until the pointer lifts: on a touch screen the focus
  // moves only after the finger is up (round 4 review: a tap outside closed the panel and lost the draft).
  const pressed = useRef(false);

  useEffect(() => {
    if (!expanded) return;
    opened.current = true;
    root.current?.querySelector<HTMLElement>('[name="support-message"]')?.focus();
    pressed.current = false;
    const press = (): void => { pressed.current = true; };
    const key = (): void => { pressed.current = false; };
    document.addEventListener("pointerdown",press,true);
    document.addEventListener("keydown",key,true);
    return () => {
      document.removeEventListener("pointerdown",press,true);
      document.removeEventListener("keydown",key,true);
    };
  },[expanded]);

  // The toggle is the only thing left to carry focus once the panel is dismissed,
  // and it is where the keyboard has to land to reopen it.
  useEffect(() => {
    if (expanded || !opened.current) return;
    if (refocus.current) toggle.current?.focus();
    refocus.current = true;
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

  function close(returnFocus = true): void {
    if (!expanded) return;
    refocus.current = returnFocus;
    setExpanded(false);
    if (motionWanted()) setClosing(true);
  }

  const label = t(catalog,"chrome.help");
  const state = expanded ? "expanded" : closing ? "closing" : "collapsed";
  if (offered !== "offered") return null;
  return (
    <div
      ref={root}
      className="supportWidget"
      data-widget-state={state}
      // Keyboard audit round 4 (12 Nov 2026): the open panel sits over the corner of the page, and its toggle is hidden
      // meanwhile, so Tab out of it went to controls under it. Focus that leaves for another control closes the panel
      // and stays there (the widget is not modal: Tab is never held). Focus that falls to nowhere, or moves with a
      // pointer press, leaves the panel as it was.
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (!expanded || next === null || pressed.current || event.currentTarget.contains(next)) return;
        close(false);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !expanded) return;
        // Escape that only cancels an IME candidate belongs to the composer: closing would lose the draft
        // (keyboard audit 2026-11-12).
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
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
            onClose={() => close()}
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
