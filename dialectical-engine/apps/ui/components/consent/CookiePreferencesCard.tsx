"use client";

import { useId, useRef, useState, type RefObject } from "react";
import {
  COOKIE_CATEGORIES,
  type ConsentToggles,
  type CookieCategory
} from "../../lib/consent";
import { backdropCloseHandler, useModalSurface } from "./modalSemantics";

/**
 * 10b — the per-category preferences card.
 *
 * Presentational and prop-driven (S01-S20): it holds only the two operable
 * toggle booleans in local state and reaches no storage, so `CookieConsent`
 * (the ONE state machine, cluster C5) stays the only reader and writer of
 * `debateai.consent`. It is opened from the bar and from Settings, and it
 * behaves identically from both: **the discriminator is the stored decision,
 * never the entry point** (S01-R14/R17, REQ-REV-01 B1), which is why the
 * caller hands it `initial` rather than the card asking where it came from.
 *
 * Every string it shows for a category comes from `COOKIE_CATEGORIES`
 * (S01-R28), so V's ruling on the five cookie names (contested row Q7-01) is a
 * one-line data edit rather than a component change.
 *
 * **It writes no modal semantics of its own.** Focus trap, initial focus, focus
 * return, backdrop close, reduced motion and the Esc stack all come from the
 * ONE shared helper `modalSemantics.ts`, which S02 owns and S01 consumes
 * UNCHANGED (S01-R18/R20, SPEC §Out of scope, `COMMON.md` §10.7). Cluster C6
 * wires it in: `onDismiss` is what the helper's Esc arm and backdrop arm call,
 * and the two refs below are the only thing this component contributes — a
 * container to trap inside and a first target to open on.
 */
export type ConsentChoice = {
  /** Always true — the locked category is not a choice (S01-R04). */
  essential: true;
  quality: boolean;
  analytics: boolean;
};

export type CookiePreferencesCardProps = {
  /**
   * The two operable toggles as the card opens: a valid stored decision's
   * booleans, or R17's defaults when nothing valid is stored. Which of the two
   * is a question about STORAGE, and the caller has already answered it.
   *
   * **read once, by the mount; the caller mounts the card fresh for each open —
   * a re-render with a new `initial` is ignored.** It feeds a `useState`
   * initialiser, which runs at mount and never again, so a caller that keeps the
   * card mounted and hands it new booleans after a save shows the visitor the
   * OLD toggles and can write a decision nobody picked. Measured by
   * `probes/code-rev-s01-c3c4-r1-stale-initial.test.tsx`
   * (CODE-REV-S01-C3C4 r1 **N6**); `CookieConsent` mounts a fresh card per open.
   */
  initial: ConsentToggles;
  /** R04 row 4 — the current toggles. */
  onSave: (choice: ConsentChoice) => void;
  /** R04 row 3 — byte-identical to the bar's own `Essential only`. */
  onEssentialOnly: () => void;
  /** Closing without deciding. Driven by the shared helper in cluster C6. */
  onDismiss: () => void;
  /** Opens the S02 policy modal in read-only mode, over the card (S01-R20). */
  onRequestPolicy: () => void;
  /**
   * Handed straight to the shared helper, which uses it when the opener it captured is not
   * a usable element AT CLOSE — because the commit that opened this card removed it, or
   * because it left the page while the card was open (S01-R18, V-22). The trigger is the
   * opener's state when the card closes, never which commit put it in that state
   * (CODE-REV-CROSS-01 r1 N3; the earlier wording named only the opening commit and so
   * described a strictly narrower rule than the helper ships). The caller owns it because
   * the control it names — the bar's `Choose what to store` — is unmounted while this card
   * is open and comes back as a fresh node; nothing this component could capture would
   * still be on the page at close.
   *
   * "The page" here IS the page-wide object, spelled around on purpose: this file's own
   * source-text guards ban that word, the dismiss key's name and the focus call outright,
   * comments included, because a grep cannot tell a comment from code (`COMMON.md` §8;
   * CODE-S01-C5 F1 measured a JSDoc mention counting as a hit). Both guards are live —
   * `tests/render/consent-card.test.tsx` scans this file alone,
   * `tests/render/consent-policy-link.test.tsx` scans it beside `CookieConsent.tsx`, and
   * `tests/render/consent-guards.test.tsx` (S01-S45) scans the whole directory bar the
   * helper. Rewriting this paragraph with the plain word turns the first of them RED.
   */
  returnFocusRef?: RefObject<HTMLElement | null>;
};

export function CookiePreferencesCard({
  initial,
  onSave,
  onEssentialOnly,
  onDismiss,
  onRequestPolicy,
  returnFocusRef
}: CookiePreferencesCardProps) {
  const titleId = useId();
  const [toggles, setToggles] = useState<ConsentToggles>({
    quality: initial.quality,
    analytics: initial.analytics
  });

  const scrimRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  const firstOperableRef = useRef<HTMLElement | null>(null);

  /**
   * Initial focus goes to the first OPERABLE toggle (S01-R18). Derived from the
   * records rather than named: Essential is `locked: true` and is not a choice,
   * so it is not a place to put a visitor's focus — and a later ruling that
   * unlocks a category or reorders the three (contested row Q7-01) moves this
   * target without touching this file (S01-R28).
   */
  const firstOperableId = COOKIE_CATEGORIES.find((category) => !category.locked)?.id;

  /**
   * The card is mounted only while it is open — `CookieConsent` renders it in the
   * `card` surface and nowhere else, with a fresh `key` per open — so `open` is
   * the constant `true` and the helper's mount/unmount IS the open/close.
   */
  useModalSurface(true, {
    containerRef: cardRef,
    initialFocusRef: firstOperableRef,
    onClose: onDismiss,
    returnFocusRef
  });

  /** The locked category is not in `ConsentToggles`: its state is the constant `true`. */
  const stateOf = (id: CookieCategory["id"]): boolean =>
    id === "essential" ? true : toggles[id];

  const flip = (category: CookieCategory): void => {
    // The id is read into a `const` BEFORE the guard: TypeScript keeps a const
    // local's narrowing inside the updater closure, and does not keep a
    // parameter property's — measured, `TS7053` at the `setToggles` call, seen
    // only by the apps/ui project typecheck (COMMON §10.30), never by vitest.
    const id = category.id;
    if (category.locked || id === "essential") return;
    setToggles((current) => ({ ...current, [id]: !current[id] }));
  };

  return (
    <div
      className="consentScrim"
      ref={scrimRef}
      // Resolved at CLICK time, never at render time: `scrimRef.current` is
      // still null during the first render, and a handler built then would close
      // on nothing. The helper's own rule is that only a click landing ON the
      // scrim closes — a click on any descendant is a click inside the card.
      onClick={(event) => backdropCloseHandler(scrimRef.current, onDismiss)(event)}
    >
      <div
        className="consentCard"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={(node) => {
          cardRef.current = node;
        }}
      >
        <div className="consentCardCore">
          <span className="consentTab" aria-hidden="true" />
          <div className="consentEyebrow">CHOOSE WHAT TO STORE</div>
          <div className="consentCardTitle" id={titleId}>
            Cookie preferences
          </div>
          <div className="consentLede">Asked once. Revisit any time from Settings → Privacy.</div>
          <div className="consentCatList">
            {COOKIE_CATEGORIES.map((category) => {
              const on = stateOf(category.id);
              return (
                <div className="consentCatRow" key={category.id}>
                  <div className="consentCatMain">
                    <div className="consentCatHead">
                      <span className="consentCatName">{category.name}</span>
                      <span className={`consentTag consentTag-${category.id}`}>{category.tag}</span>
                    </div>
                    <div className="consentCatDesc">{category.description}</div>
                    <div className="consentCatDetail">{category.detail}</div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-disabled={category.locked || undefined}
                    aria-label={category.name}
                    className="consentSwitch"
                    ref={
                      category.id === firstOperableId
                        ? (node) => {
                            firstOperableRef.current = node;
                          }
                        : undefined
                    }
                    onClick={() => flip(category)}
                    // Space and Enter, per S01-R17. `preventDefault` is what
                    // keeps this ONE activation: a real browser fires a native
                    // click as the default action of Enter's keydown and of
                    // Space's keyup, and cancelling the keydown cancels both,
                    // so the toggle flips once rather than twice. jsdom fires
                    // neither, so this handler is the only path there — the
                    // pin is on the HANDLER, never on the browser
                    // (TOOLING-TRAPS, ARCH-S02-REWORK-R1).
                    onKeyDown={(event) => {
                      if (event.key !== " " && event.key !== "Enter") return;
                      event.preventDefault();
                      flip(category);
                    }}
                  >
                    <span className="consentKnob" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="consentCardFooter">
            <button type="button" className="consentLink" onClick={onRequestPolicy}>
              Privacy notice
            </button>
            <span className="consentFooterGap" />
            <button type="button" className="consentGhost" onClick={onEssentialOnly}>
              Essential only
            </button>
            <button
              type="button"
              className="consentPrimary"
              onClick={() =>
                onSave({ essential: true, quality: toggles.quality, analytics: toggles.analytics })
              }
            >
              Save choices
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
