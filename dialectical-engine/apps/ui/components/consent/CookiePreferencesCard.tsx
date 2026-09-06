"use client";

import { useId, useState } from "react";
import {
  COOKIE_CATEGORIES,
  type ConsentToggles,
  type CookieCategory
} from "../../lib/consent";

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
 * ONE shared helper `modalSemantics.ts`, which S02 owns and cluster C6 wires in
 * (S01-R18/R20, SPEC §Out of scope). `onDismiss` is the callback that helper
 * will drive; this cluster accepts it and wires nothing to it, because a
 * temporary second implementation is still a second implementation.
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
};

export function CookiePreferencesCard({
  initial,
  onSave,
  onEssentialOnly,
  onDismiss,
  onRequestPolicy
}: CookiePreferencesCardProps) {
  const titleId = useId();
  const [toggles, setToggles] = useState<ConsentToggles>({
    quality: initial.quality,
    analytics: initial.analytics
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
    <div className="consentScrim">
      <div className="consentCard" role="dialog" aria-modal="true" aria-labelledby={titleId}>
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
