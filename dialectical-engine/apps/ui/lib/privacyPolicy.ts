/**
 * The privacy policy as DATA. `PrivacyPolicyModal` renders from these two constants and holds
 * no policy prose of its own.
 *
 * Every string here is transcribed from the design of record —
 * `docs/missions/consent-ui/design/design-data.js:51` (the pills) and `:57-84` (the sections) —
 * and is byte-exact against `slices/S02/SPEC.md` §Copy measured on the DECODED characters.
 * The design extract stores `\uXXXX` escapes; this is a TypeScript module, so the decoded
 * characters are written directly (em dash U+2014, right single quote U+2019, arrow U+2192).
 *
 * `accent` holds the CSS custom-property NAME without `var()`, so the component composes
 * `var(${accent})` and this file stays free of markup.
 */

export type PolicyJump = Readonly<{ label: string; target: string }>;
export type PolicySection = Readonly<{
  no: string; title: string; accent: string; body: string; items: readonly string[];
}>;

export const POLICY_JUMP: readonly PolicyJump[] = [
  { label: "CONTROLLER", target: "policy-section-05" },
  { label: "WHAT WE COLLECT", target: "policy-section-01" },
  { label: "LAWFUL BASIS", target: "policy-section-06" },
  { label: "PUBLISHING", target: "policy-section-03" },
  { label: "MODELS & TRANSFERS", target: "policy-section-04" },
  { label: "RETENTION", target: "policy-section-07" },
  { label: "YOUR GDPR RIGHTS", target: "policy-section-08" },
  { label: "COMPLAINTS", target: "policy-section-11" }
];

export const POLICY_SECTIONS: readonly PolicySection[] = [
  {
    no: "01",
    title: "What we collect",
    accent: "--ok-dot",
    body: "Only what an account needs to function, plus what you choose to give us.",
    items: [
      "Account: email, recovery email, password hash, MFA secret, recovery codes.",
      "Security: device name, browser, IP and timestamp for each session.",
      "Content: the claims you post, your challenges, and the model output they produce."
    ]
  },
  {
    no: "02",
    title: "Why we hold it",
    accent: "--gold",
    body: "Each category has one purpose and is not reused for another. Session and device records exist so you can recognise and revoke a login you did not make. Debate content exists so a debate can be reopened, replayed and audited against the scores it was given.",
    items: []
  },
  {
    no: "03",
    title: "Publishing and visibility",
    accent: "--reasoning",
    body: "Debates are private until you publish them. Publishing shows the claim, the tree, the scores and your display name — never your email, device records or session history. Unpublishing removes it from public listings; copies already made by readers are outside our control.",
    items: []
  },
  {
    no: "04",
    title: "Model providers and international transfers",
    accent: "--con",
    body: "Claims and arguments are sent to the model providers you select in order to generate the debate. We send debate text only — never your email, device record or session data — and we do not permit providers to train on it. Providers outside the EEA receive data under Standard Contractual Clauses (Art. 46 GDPR); a list of current sub-processors and their locations is maintained at dezbatere.ro/subprocessors.",
    items: []
  },
  {
    no: "05",
    title: "Controller and contact",
    accent: "--ink",
    body: "The controller of your personal data is DebateAIRO SRL, Bucharest, Romania. Our data protection contact is privacy@dezbatere.ro. We have no obligation to appoint a DPO but this address is monitored and answers within 30 days.",
    items: []
  },
  {
    no: "06",
    title: "Lawful basis for each purpose",
    accent: "--ok-dot",
    body: "We rely on a single, stated basis per purpose under Art. 6(1) GDPR:",
    items: [
      "Contract, Art. 6(1)(b) — account, authentication, running and storing your debates.",
      "Legitimate interests, Art. 6(1)(f) — security, abuse prevention, and the session and device records that let you spot a login you did not make.",
      "Consent, Art. 6(1)(a) — optional analytics and model-quality telemetry, and publishing a debate. Withdrawable at any time, without affecting your account.",
      "Legal obligation, Art. 6(1)(c) — retaining records we are required by law to keep."
    ]
  },
  {
    no: "07",
    title: "Retention",
    accent: "--gold",
    body: "Session and device records are kept 30 days; optional analytics and telemetry 90 days; account data for as long as the account exists. Deleting your account erases account data and unpublished debates within 30 days, and removes published debates from public listings. Backups age out within a further 90 days.",
    items: []
  },
  {
    no: "08",
    title: "Your rights under the GDPR",
    accent: "--reasoning",
    body: "You may exercise any of these free of charge from Settings → Privacy, or by writing to privacy@dezbatere.ro. We answer within one month (Art. 12(3)).",
    items: [
      "Access (Art. 15) — a copy of your data, exportable as JSON from Settings.",
      "Rectification (Art. 16) and erasure (Art. 17) — correct or delete your data.",
      "Restriction (Art. 18) and objection (Art. 21) — including objecting to processing based on legitimate interests.",
      "Portability (Art. 20) — your debates and account data in a machine-readable form.",
      "Withdraw consent (Art. 7(3)) — for analytics, telemetry, or a published debate."
    ]
  },
  {
    no: "09",
    title: "Automated decisions and profiling",
    accent: "--muted",
    body: "Model scores, condition marks and verdicts are automated evaluations of arguments, not of people. No decision with legal or similarly significant effect on you is made automatically (Art. 22), and we do not profile you for advertising.",
    items: []
  },
  {
    no: "10",
    title: "Security and breach notification",
    accent: "--con",
    body: "Passwords are hashed, MFA is mandatory, and access to production data is logged. In the event of a personal data breach we notify the Romanian supervisory authority within 72 hours (Art. 33) and inform you directly where the risk to your rights is high (Art. 34).",
    items: []
  },
  {
    no: "11",
    title: "Children, complaints and changes",
    accent: "--ink",
    body: "The service is for adults; accounts require an 18-or-over affirmation and we do not knowingly process children’s data. You may lodge a complaint with the Romanian supervisory authority (ANSPDCP, Bucharest) or the authority where you live. Material changes to this policy are announced in-app at least 14 days before they take effect, and prior versions remain available.",
    items: []
  }
];
