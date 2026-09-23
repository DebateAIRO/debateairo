/**
 * The shape of a legal document as the sign-up modals render it (design 10c). Both documents —
 * the Privacy Policy and the Terms of Service — are DATA in this shape, generated from the
 * drafts under `apps/ui/legal/` by `apps/ui/scripts/generate-legal-data.mjs`, so the modals hold
 * no legal prose of their own and the two surfaces cannot drift apart.
 */

/** One jump pill: its label and the DOM id of the section it scrolls to. */
export type LegalJump = Readonly<{ label: string; target: string }>;

/**
 * One block of a section, in document order: a paragraph, or a bulleted list. A markdown table
 * arrives as a list whose items are the row cells joined with an em dash.
 */
export type LegalBlock =
  | Readonly<{ kind: "p"; text: string }>
  | Readonly<{ kind: "list"; items: readonly string[] }>;

/**
 * One numbered section. `no` is what the reader sees in the margin (`01`, `A.3`); `accent` is a
 * CSS custom-property NAME without `var()`, so the component composes `var(${accent})` and no
 * colour literal lives in data.
 */
export type LegalSection = Readonly<{
  no: string;
  title: string;
  accent: string;
  blocks: readonly LegalBlock[];
}>;

export type LegalDocumentKey = "privacy" | "terms";

export type LegalDocument = Readonly<{
  key: LegalDocumentKey;
  /** The mono eyebrow, e.g. `PRIVACY POLICY · v3.0 · EFFECTIVE [DATE]`. */
  eyebrow: string;
  title: string;
  lede: string;
  /** The centred marker after the last section — reaching it is what the consent gate measures. */
  endMarker: string;
  /** The address shown in the footer after `Questions:`. */
  contact: string;
  /** The accessible name of the scrollable body region. */
  bodyLabel: string;
  /** Section DOM ids are `${sectionIdPrefix}${no}`; the jump targets use the same form. */
  sectionIdPrefix: string;
  titleId: string;
  gateHintId: string;
  jumps: readonly LegalJump[];
  sections: readonly LegalSection[];
}>;
