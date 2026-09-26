"use client";

import * as React from "react";

import type { LegalDocument } from "../../lib/legalDocument";
import { backdropCloseHandler, prefersReducedMotion, useModalSurface } from "./modalSemantics";
import { t } from "@/lib/i18n/translate";
import { useConsentCatalog } from "./useConsentCatalog";

/**
 * The ONE legal-document modal (design 10c), shared by the Privacy Policy and the Terms of
 * Service. Standalone and prop-driven: it owns no consent state, reads and writes no storage,
 * and holds no legal prose of its own — every string it shows comes from the `document` it is
 * given, which `apps/ui/scripts/generate-legal-data.mjs` produces from the drafts under
 * `apps/ui/legal/`, and its chrome copy (close, questions, gate hint, acknowledge) from the
 * `consent` catalogue of the interface locale. Its modal semantics come from the ONE shared
 * helper `./modalSemantics`.
 *
 * `PrivacyPolicyModal` and `TermsOfServiceModal` are thin twins over this component: same
 * chrome, same scroll-to-end gate, same classes, different data and different DOM ids.
 */
export type LegalModalProps = {
  open: boolean;
  mode: "read" | "consent";
  onClose: () => void;
  onAcknowledge?: () => void;
};

export type LegalDocumentModalProps = LegalModalProps & { document: LegalDocument };

/**
 * The per-section accent reaches the DOM as a TOKEN REFERENCE, never as a colour: the number and
 * the bullet dots read `var(--accent)` from CSS, and `--accent` is set here to `var(--ok-dot)`,
 * `var(--gold)`, … So the accent follows the mode toggle with nothing wired, and no colour
 * literal enters this file (COMMON §7's design-system law).
 */
const ACCENT_PROPERTY = "--accent";

/**
 * The scroll-to-end criterion's slack, in pixels (`SPEC.md` R15). DERIVED, not conventional: the
 * body text is 11.5px at `line-height: 1.65` ≈ 19px per line, so 8px is under half a line — the
 * end marker cannot count as reached while a line of text is still hidden — while still
 * absorbing the sub-pixel and browser-zoom rounding that exact equality does not.
 */
const SCROLL_SLACK = 8;

export function LegalDocumentModal({
  document,
  open,
  mode,
  onClose,
  onAcknowledge
}: LegalDocumentModalProps): React.ReactElement | null {
  const scrimRef = React.useRef<HTMLDivElement | null>(null);
  const dialogRef = React.useRef<HTMLElement | null>(null);
  const closeRef = React.useRef<HTMLElement | null>(null);
  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const [reachedEnd, setReachedEnd] = React.useState(false);
  const catalog = useConsentCatalog();

  // The trap, initial placement on the close control, return on close, backdrop close and the
  // Esc STACK — all of it from the ONE shared helper. This component installs no keydown
  // listener of its own.
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
    // On `resize` too, and on `window`: a taller viewport can show the end of the document
    // without the reader scrolling at all, and a criterion bound only to `scroll` would leave
    // the button disabled with the end marker in plain sight.
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
        aria-labelledby={document.titleId}
        ref={(node) => {
          dialogRef.current = node;
        }}
      >
        <div className="policyCore">
          <span className="policyTab" aria-hidden="true" />
          <div className="policyHead">
            <div className="policyHeadText">
              <div className="policyEyebrow">{document.eyebrow}</div>
              <div id={document.titleId} className="policyTitle">
                {document.title}
              </div>
              <div className="policyLede">{document.lede}</div>
            </div>
            <button
              type="button"
              className="policyClose"
              aria-label={t(catalog, "consent.policy.close")}
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
          <div className="policyBody" tabIndex={0} aria-label={document.bodyLabel} ref={bodyRef}>
            <div className="policyJumps">
              {document.jumps.map((jump) => (
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
            {document.sections.map((section) => (
              <div
                key={section.no}
                id={`${document.sectionIdPrefix}${section.no}`}
                className="policySection"
              >
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
                {section.blocks.map((block, blockIndex) =>
                  block.kind === "p" ? (
                    <p key={blockIndex} className="policyText">
                      {block.text}
                    </p>
                  ) : (
                    <div key={blockIndex} className="policyItems">
                      {block.items.map((item, itemIndex) => (
                        <div key={itemIndex} className="policyItem">
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
                  )
                )}
              </div>
            ))}
            <div className="policyEnd">{document.endMarker}</div>
          </div>
          <div className="policyFoot">
            <span className="policyContact">
              {t(catalog, "consent.policy.questions")}
              {" "}
              <span className="policyMail">{document.contact}</span>
            </span>
            <span className="policyFootSpacer" />
            {mode === "consent" ? (
              <>
                {/* The reason the button is disabled, as an accessible DESCRIPTION and not as a
                    `title` — the SPEC forbids a tooltip, which is invisible to a keyboard user
                    and to a screen reader alike. `.policyGateHint` is the class C8 styles with
                    the repo's visually-hidden treatment. */}
                {!gateOpen ? (
                  <span id={document.gateHintId} className="policyGateHint">
                    {t(catalog, "consent.policy.gateHint")}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="policyPrimary"
                  disabled={!gateOpen}
                  aria-disabled={!gateOpen ? "true" : undefined}
                  aria-describedby={!gateOpen ? document.gateHintId : undefined}
                  onClick={acknowledge}
                >
                  {t(catalog, "consent.policy.acknowledge")}
                </button>
              </>
            ) : (
              <button type="button" className="policyPrimary" onClick={onClose}>
                {t(catalog, "consent.policy.close")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
