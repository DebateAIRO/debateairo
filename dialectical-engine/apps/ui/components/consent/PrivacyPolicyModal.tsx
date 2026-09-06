"use client";

import * as React from "react";

import { POLICY_JUMP, POLICY_SECTIONS } from "../../lib/privacyPolicy";
import { backdropCloseHandler, prefersReducedMotion, useModalSurface } from "./modalSemantics";

/**
 * The privacy policy modal (design 10c). Standalone and prop-driven: it owns no consent state,
 * reads and writes no storage, and holds no policy prose of its own — every string it shows
 * comes from `apps/ui/lib/privacyPolicy.ts`. Its modal semantics come from the ONE shared
 * helper `./modalSemantics`.
 *
 * The prop type is a cross-slice contract: `slices/S02/SPEC.md` R14 and `slices/S01/SPEC.md`
 * R20 state it byte-identically and neither slice may change it alone.
 */
export type PrivacyPolicyModalProps = {
  open: boolean;
  mode: "read" | "consent";
  onClose: () => void;
  onAcknowledge?: () => void;
};

/**
 * S02-S33's four-member closure, pinned WHERE A TYPECHECKER CAN SEE IT. Measured 2026-09-07:
 * `tsc --noEmit --listFiles` counts this file 1 in the `apps/ui` project and 0 in the root one,
 * and counts `tests/render/consent-policy-modal-render.test.tsx` **0 in BOTH** — so the two
 * type-level pins the plan places in that test file are inert, and the plan's sentence "a wrong
 * prop set produces a 9th diagnostic" cannot come true (`.hermes/TOOLING-TRAPS.md:1485-1499` is
 * the standing measurement of the same gap). Reported as a finding; pinned here as well so the
 * property has a gate that actually runs — `cd apps/ui && npx tsc --noEmit -p tsconfig.json`
 * fails on a renamed member, a removed one, a fifth one (optional or not), and on
 * `onAcknowledge` made required.
 */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Expect<T extends true> = T;
type _PropShapeIsExact = Expect<
  Exact<
    PrivacyPolicyModalProps,
    { open: boolean; mode: "read" | "consent"; onClose: () => void; onAcknowledge?: () => void }
  >
>;
type _PropKeysAreExact = Expect<
  Exact<keyof PrivacyPolicyModalProps, "open" | "mode" | "onClose" | "onAcknowledge">
>;

/**
 * Fixed, not generated. Only one policy modal is ever open (the Esc stack in `modalSemantics`
 * is what makes that observable), and a fixed id is queryable with `querySelector` — a
 * `React.useId()` value contains `:` characters, which are legal in `getElementById` and not in
 * a CSS id selector.
 */
const TITLE_ID = "policy-modal-title";
const GATE_HINT_ID = "policy-modal-gate-hint";

/**
 * The per-section accent reaches the DOM as a TOKEN REFERENCE, never as a colour: the number and
 * the bullet dots read `var(--accent)` from CSS, and `--accent` is set here to `var(--ok-dot)`,
 * `var(--gold)`, … So the accent follows the mode toggle with nothing wired, and no colour
 * literal enters this file (COMMON §7's design-system law).
 */
const ACCENT_PROPERTY = "--accent";

/**
 * The header copy, `slices/S02/SPEC.md` §Copy, transcribed as DECODED characters (U+00B7 MIDDLE
 * DOT twice in the eyebrow, U+2014 EM DASH once in the lede). Written as string expressions
 * rather than as JSX text so no whitespace folding can alter a `textContent` comparison.
 * `privacyPolicy.ts` holds the pills and the sections; the header, the end marker and the
 * footer contact line are the modal's own chrome and live here.
 */
const EYEBROW = "PRIVACY POLICY · v2.1 · EFFECTIVE 12 AUG 2026";
const TITLE = "What we store, and why";
const LEDE =
  "Your rights and our obligations under the GDPR (EU) 2016/679, in plain language. Eleven sections — scroll to the end.";
const END_MARKER = "END OF POLICY · GDPR (EU) 2016/679 · v2.1";
const GATE_HINT = "Scroll to the end of the policy to continue.";

/**
 * The scroll-to-end criterion's slack, in pixels (`SPEC.md` R15). DERIVED, not conventional: the
 * body text is 11.5px at `line-height: 1.65` ≈ 19px per line, so 8px is under half a line — the
 * end marker cannot count as reached while a line of policy is still hidden — while still
 * absorbing the sub-pixel and browser-zoom rounding that exact equality does not.
 */
const SCROLL_SLACK = 8;

export function PrivacyPolicyModal({
  open,
  mode,
  onClose,
  onAcknowledge
}: PrivacyPolicyModalProps): React.ReactElement | null {
  const scrimRef = React.useRef<HTMLDivElement | null>(null);
  const dialogRef = React.useRef<HTMLElement | null>(null);
  const closeRef = React.useRef<HTMLElement | null>(null);
  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const [reachedEnd, setReachedEnd] = React.useState(false);

  // Focus trap, initial focus on the close control, focus return on close, backdrop close and
  // the Esc STACK — all of it from the ONE shared helper. This component installs no keydown
  // listener of its own, which is what the listener-count arm of S02-S46 pins.
  useModalSurface(open, { containerRef: dialogRef, initialFocusRef: closeRef, onClose });

  React.useEffect(() => {
    // `mode="read"` applies no scroll-to-end gate at all (R14), so the listeners are not even
    // attached there.
    if (!open || mode !== "consent") return undefined;
    const region = bodyRef.current;
    if (region === null) return undefined;
    const evaluate = (): void => {
      // The latch lives in the updater: once true it is never recomputed to false, so scrolling
      // back up to re-read a section cannot take the button away again.
      setReachedEnd(
        (latched) =>
          latched || region.scrollTop + region.clientHeight >= region.scrollHeight - SCROLL_SLACK
      );
    };
    evaluate();
    region.addEventListener("scroll", evaluate);
    // On `resize` too, and on `window`: a taller viewport can show the end of the policy without
    // the reader scrolling at all, and a criterion bound only to `scroll` would leave the button
    // disabled with the end marker in plain sight.
    window.addEventListener("resize", evaluate);
    return () => {
      region.removeEventListener("scroll", evaluate);
      window.removeEventListener("resize", evaluate);
    };
  }, [open, mode]);

  if (!open) return null;

  const gateOpen = reachedEnd;

  const acknowledge = (): void => {
    // The ONLY route that ticks the box, and it exists only in `mode="consent"`. `×`, Esc and
    // the backdrop reach `onClose` and nothing else, so no dismissal can consent on the
    // reader's behalf. Acknowledge first, then close, so the consumer sees the acknowledgement
    // before the surface goes away.
    onAcknowledge?.();
    onClose();
  };

  const jumpTo = (target: string): void => {
    const section = dialogRef.current?.querySelector<HTMLElement>(`[id="${target}"]`) ?? null;
    // Guarded on both hops: jsdom 30.0.1 has no `Element.prototype.scrollIntoView` at all, so an
    // unguarded call throws a TypeError naming a DOM API and the failure reads as an environment
    // bug rather than as this component's. A reader who asked for no animation gets none.
    section?.scrollIntoView?.({
      block: "start",
      behavior: prefersReducedMotion() ? "auto" : "smooth"
    });
  };

  return (
    <div
      className="policyScrim"
      ref={scrimRef}
      // Resolved at CLICK time, never at render time: `scrimRef.current` is still null during
      // the first render, and a handler built then would close on nothing.
      onClick={(event) => backdropCloseHandler(scrimRef.current, onClose)(event)}
    >
      <div
        className="policyBezel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        ref={(node) => {
          dialogRef.current = node;
        }}
      >
        <div className="policyCore">
          <span className="policyTab" aria-hidden="true" />
          <div className="policyHead">
            <div className="policyHeadText">
              <div className="policyEyebrow">{EYEBROW}</div>
              <div id={TITLE_ID} className="policyTitle">
                {TITLE}
              </div>
              <div className="policyLede">{LEDE}</div>
            </div>
            <button
              type="button"
              className="policyClose"
              aria-label="Close"
              onClick={onClose}
              ref={(node) => {
                closeRef.current = node;
              }}
            >
              {"×"}
            </button>
          </div>
          {/* `tabindex="0"` plus a name of its own: paging this region is the ONLY way a
              keyboard-only reader can satisfy the scroll gate, and the name says what is inside
              it rather than repeating the dialog's title. */}
          <div className="policyBody" tabIndex={0} aria-label="Privacy Policy text" ref={bodyRef}>
            <div className="policyJumps">
              {POLICY_JUMP.map((jump) => (
                <button
                  key={jump.target}
                  type="button"
                  className="policyPill"
                  data-jump={jump.target}
                  onClick={() => jumpTo(jump.target)}
                >
                  {jump.label}
                </button>
              ))}
            </div>
            {POLICY_SECTIONS.map((section) => (
              <div key={section.no} id={`policy-section-${section.no}`} className="policySection">
                <div className="policySectionHead">
                  <span
                    className="policyNo"
                    data-accent={section.accent}
                    style={{ [ACCENT_PROPERTY]: `var(${section.accent})` } as React.CSSProperties}
                  >
                    {section.no}
                  </span>
                  <span className="policySectionTitle">{section.title}</span>
                </div>
                <p className="policyText">{section.body}</p>
                {section.items.length > 0 ? (
                  <div className="policyItems">
                    {section.items.map((item) => (
                      <div key={item} className="policyItem">
                        <span
                          className="policyDot"
                          aria-hidden="true"
                          style={
                            { [ACCENT_PROPERTY]: `var(${section.accent})` } as React.CSSProperties
                          }
                        />
                        <span className="policyItemText">{item}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            <div className="policyEnd">{END_MARKER}</div>
          </div>
          <div className="policyFoot">
            <span className="policyContact">
              {"Questions: "}
              <span className="policyMail">{"privacy@dezbatere.ro"}</span>
            </span>
            <span className="policyFootSpacer" />
            {mode === "consent" ? (
              <>
                {/* The reason the button is disabled, as an accessible DESCRIPTION and not as a
                    `title` — the SPEC forbids a tooltip, which is invisible to a keyboard user
                    and to a screen reader alike. `.policyGateHint` is the class C8 styles with
                    the repo's visually-hidden treatment. */}
                {!gateOpen ? (
                  <span id={GATE_HINT_ID} className="policyGateHint">
                    {GATE_HINT}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="policyPrimary"
                  disabled={!gateOpen}
                  aria-disabled={!gateOpen ? "true" : undefined}
                  aria-describedby={!gateOpen ? GATE_HINT_ID : undefined}
                  onClick={acknowledge}
                >
                  {"I have read it"}
                </button>
              </>
            ) : (
              <button type="button" className="policyPrimary" onClick={onClose}>
                {"Close"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
