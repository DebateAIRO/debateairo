"use client";

import * as React from "react";

import { POLICY_JUMP, POLICY_SECTIONS } from "../../lib/privacyPolicy";

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

export function PrivacyPolicyModal({
  open,
  mode
}: PrivacyPolicyModalProps): React.ReactElement | null {
  if (!open) return null;

  return (
    <div className="policyScrim">
      <div className="policyBezel" role="dialog" aria-modal="true" aria-labelledby={TITLE_ID}>
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
            <button type="button" className="policyClose" aria-label="Close">
              {"×"}
            </button>
          </div>
          <div className="policyBody">
            <div className="policyJumps">
              {POLICY_JUMP.map((jump) => (
                <button
                  key={jump.target}
                  type="button"
                  className="policyPill"
                  data-jump={jump.target}
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
              <button type="button" className="policyPrimary">
                {"I have read it"}
              </button>
            ) : (
              <button type="button" className="policyPrimary">
                {"Close"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
