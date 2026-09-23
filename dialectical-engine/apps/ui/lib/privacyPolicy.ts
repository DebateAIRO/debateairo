/**
 * The privacy policy as DATA. `PrivacyPolicyModal` renders from these two constants and holds
 * no policy prose of its own.
 *
 * The semantic message keys preserve the design-of-record structure from
 * `docs/missions/consent-ui/design/design-data.js:51` (the pills) and `:57-84`
 * (the sections). English copy now lives in `messages/en/consent.json`.
 *
 * `accent` holds the CSS custom-property NAME without `var()`, so the component composes
 * `var(${accent})` and this file stays free of markup.
 */

import type { TranslationVariables } from "./i18n/translate";

export type PolicyMessage = Readonly<{ key: string; vars?: TranslationVariables }>;
export type PolicyJump = Readonly<{ labelKey: string; target: string }>;
export type PolicySection = Readonly<{
  no: string;
  titleKey: string;
  accent: string;
  body: PolicyMessage;
  items: readonly PolicyMessage[];
}>;

export const PRIVACY_EMAIL = "privacy@dezbatere.ro";

export const POLICY_JUMP: readonly PolicyJump[] = [
  { labelKey: "consent.policy.jump.controller", target: "policy-section-05" },
  { labelKey: "consent.policy.jump.whatWeCollect", target: "policy-section-01" },
  { labelKey: "consent.policy.jump.lawfulBasis", target: "policy-section-06" },
  { labelKey: "consent.policy.jump.publishing", target: "policy-section-03" },
  { labelKey: "consent.policy.jump.modelsTransfers", target: "policy-section-04" },
  { labelKey: "consent.policy.jump.retention", target: "policy-section-07" },
  { labelKey: "consent.policy.jump.gdprRights", target: "policy-section-08" },
  { labelKey: "consent.policy.jump.complaints", target: "policy-section-11" }
];

export const POLICY_SECTIONS: readonly PolicySection[] = [
  {
    no: "01",
    titleKey: "consent.policy.section01.title",
    accent: "--ok-dot",
    body: { key: "consent.policy.section01.body" },
    items: [
      { key: "consent.policy.section01.account" },
      { key: "consent.policy.section01.security" },
      { key: "consent.policy.section01.content" }
    ]
  },
  {
    no: "02",
    titleKey: "consent.policy.section02.title",
    accent: "--gold",
    body: { key: "consent.policy.section02.body" },
    items: []
  },
  {
    no: "03",
    titleKey: "consent.policy.section03.title",
    accent: "--reasoning",
    body: { key: "consent.policy.section03.body" },
    items: []
  },
  {
    no: "04",
    titleKey: "consent.policy.section04.title",
    accent: "--con",
    body: {
      key: "consent.policy.section04.body",
      vars: { article: "Art. 46 GDPR", subprocessorsUrl: "dezbatere.ro/subprocessors" }
    },
    items: []
  },
  {
    no: "05",
    titleKey: "consent.policy.section05.title",
    accent: "--ink",
    body: {
      key: "consent.policy.section05.body",
      vars: { controller: "DebateAIRO SRL", email: PRIVACY_EMAIL, dpo: "DPO" }
    },
    items: []
  },
  {
    no: "06",
    titleKey: "consent.policy.section06.title",
    accent: "--ok-dot",
    body: { key: "consent.policy.section06.body", vars: { article: "Art. 6(1) GDPR" } },
    items: [
      { key: "consent.policy.section06.contract", vars: { article: "Art. 6(1)(b)" } },
      { key: "consent.policy.section06.legitimate", vars: { article: "Art. 6(1)(f)" } },
      { key: "consent.policy.section06.consent", vars: { article: "Art. 6(1)(a)" } },
      { key: "consent.policy.section06.legal", vars: { article: "Art. 6(1)(c)" } }
    ]
  },
  {
    no: "07",
    titleKey: "consent.policy.section07.title",
    accent: "--gold",
    body: { key: "consent.policy.section07.body" },
    items: []
  },
  {
    no: "08",
    titleKey: "consent.policy.section08.title",
    accent: "--reasoning",
    body: {
      key: "consent.policy.section08.body",
      vars: { email: PRIVACY_EMAIL, article: "Art. 12(3)" }
    },
    items: [
      { key: "consent.policy.section08.access", vars: { article: "Art. 15" } },
      {
        key: "consent.policy.section08.rectification",
        vars: { rectificationArticle: "Art. 16", erasureArticle: "Art. 17" }
      },
      {
        key: "consent.policy.section08.restriction",
        vars: { restrictionArticle: "Art. 18", objectionArticle: "Art. 21" }
      },
      { key: "consent.policy.section08.portability", vars: { article: "Art. 20" } },
      { key: "consent.policy.section08.withdraw", vars: { article: "Art. 7(3)" } }
    ]
  },
  {
    no: "09",
    titleKey: "consent.policy.section09.title",
    accent: "--muted",
    body: { key: "consent.policy.section09.body", vars: { article: "Art. 22" } },
    items: []
  },
  {
    no: "10",
    titleKey: "consent.policy.section10.title",
    accent: "--con",
    body: {
      key: "consent.policy.section10.body",
      vars: { notificationArticle: "Art. 33", informationArticle: "Art. 34" }
    },
    items: []
  },
  {
    no: "11",
    titleKey: "consent.policy.section11.title",
    accent: "--ink",
    body: { key: "consent.policy.section11.body", vars: { authority: "ANSPDCP" } },
    items: []
  }
];
