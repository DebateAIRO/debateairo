import { describe, expect, it } from "vitest";
import enConsent from "../../apps/ui/messages/en/consent.json" with { type: "json" };
import { t } from "../../apps/ui/lib/i18n/translate.js";
import {
  POLICY_JUMP,
  POLICY_SECTIONS,
  type PolicyMessage
} from "../../apps/ui/lib/privacyPolicy.js";

// Literals below are the DECODED text of `slices/S02/SPEC.md` §Copy — the reader's text.
// The module under test is transcribed from `design/design-data.js`, which stores
// `\uXXXX` escapes; the two sources are independent and this test is where they meet.

const SPEC_BODIES: readonly string[] = [
  "Only what an account needs to function, plus what you choose to give us.",
  "Each category has one purpose and is not reused for another. Session and device records exist so you can recognise and revoke a login you did not make. Debate content exists so a debate can be reopened, replayed and audited against the scores it was given.",
  "Debates are private until you publish them. Publishing shows the claim, the tree, the scores and your display name — never your email, device records or session history. Unpublishing removes it from public listings; copies already made by readers are outside our control.",
  "Claims and arguments are sent to the model providers you select in order to generate the debate. We send debate text only — never your email, device record or session data — and we do not permit providers to train on it. Providers outside the EEA receive data under Standard Contractual Clauses (Art. 46 GDPR); a list of current sub-processors and their locations is maintained at dezbatere.ro/subprocessors.",
  "The controller of your personal data is DebateAIRO SRL, Bucharest, Romania. Our data protection contact is privacy@dezbatere.ro. We have no obligation to appoint a DPO but this address is monitored and answers within 30 days.",
  "We rely on a single, stated basis per purpose under Art. 6(1) GDPR:",
  "Session and device records are kept 30 days; optional analytics and telemetry 90 days; account data for as long as the account exists. Deleting your account erases account data and unpublished debates within 30 days, and removes published debates from public listings. Backups age out within a further 90 days.",
  "You may exercise any of these free of charge from Settings → Privacy, or by writing to privacy@dezbatere.ro. We answer within one month (Art. 12(3)).",
  "Model scores, condition marks and verdicts are automated evaluations of arguments, not of people. No decision with legal or similarly significant effect on you is made automatically (Art. 22), and we do not profile you for advertising.",
  "Passwords are hashed, MFA is mandatory, and access to production data is logged. In the event of a personal data breach we notify the Romanian supervisory authority within 72 hours (Art. 33) and inform you directly where the risk to your rights is high (Art. 34).",
  "The service is for adults; accounts require an 18-or-over affirmation and we do not knowingly process children’s data. You may lodge a complaint with the Romanian supervisory authority (ANSPDCP, Bucharest) or the authority where you live. Material changes to this policy are announced in-app at least 14 days before they take effect, and prior versions remain available."
];

const SPEC_BULLETS: readonly string[] = [
  "Account: email, recovery email, password hash, MFA secret, recovery codes.",
  "Security: device name, browser, IP and timestamp for each session.",
  "Content: the claims you post, your challenges, and the model output they produce.",
  "Contract, Art. 6(1)(b) — account, authentication, running and storing your debates.",
  "Legitimate interests, Art. 6(1)(f) — security, abuse prevention, and the session and device records that let you spot a login you did not make.",
  "Consent, Art. 6(1)(a) — optional analytics and model-quality telemetry, and publishing a debate. Withdrawable at any time, without affecting your account.",
  "Legal obligation, Art. 6(1)(c) — retaining records we are required by law to keep.",
  "Access (Art. 15) — a copy of your data, exportable as JSON from Settings.",
  "Rectification (Art. 16) and erasure (Art. 17) — correct or delete your data.",
  "Restriction (Art. 18) and objection (Art. 21) — including objecting to processing based on legitimate interests.",
  "Portability (Art. 20) — your debates and account data in a machine-readable form.",
  "Withdraw consent (Art. 7(3)) — for analytics, telemetry, or a published debate."
];

const resolvePolicyMessage = ({ key, vars }: PolicyMessage): string => t(enConsent, key, vars);

describe("privacy policy content module", () => {
  it("carries the eight jump pills in the design's own order, not document order", () => {
    expect(POLICY_JUMP.map(({ labelKey, target }) => ({
      label: t(enConsent, labelKey),
      target
    }))).toEqual([
      { label: "CONTROLLER", target: "policy-section-05" },
      { label: "WHAT WE COLLECT", target: "policy-section-01" },
      { label: "LAWFUL BASIS", target: "policy-section-06" },
      { label: "PUBLISHING", target: "policy-section-03" },
      { label: "MODELS & TRANSFERS", target: "policy-section-04" },
      { label: "RETENTION", target: "policy-section-07" },
      { label: "YOUR GDPR RIGHTS", target: "policy-section-08" },
      { label: "COMPLAINTS", target: "policy-section-11" }
    ]);

    const labels = POLICY_JUMP.map((pill) => t(enConsent, pill.labelKey));
    expect(labels).not.toEqual([...labels].sort());
  });

  it("carries eleven sections numbered 01 to 11 with the design's titles in order", () => {
    expect(POLICY_SECTIONS).toHaveLength(11);
    expect(POLICY_SECTIONS.map((section) => section.no)).toEqual([
      "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11"
    ]);
    expect(POLICY_SECTIONS.map((section) => t(enConsent, section.titleKey))).toEqual([
      "What we collect",
      "Why we hold it",
      "Publishing and visibility",
      "Model providers and international transfers",
      "Controller and contact",
      "Lawful basis for each purpose",
      "Retention",
      "Your rights under the GDPR",
      "Automated decisions and profiling",
      "Security and breach notification",
      "Children, complaints and changes"
    ]);
  });

  it("carries bullet lists only on sections 01, 06 and 08, twelve bullets in all", () => {
    const counts = POLICY_SECTIONS.map((section) => section.items.length);
    expect(counts).toEqual([3, 0, 0, 0, 0, 4, 0, 5, 0, 0, 0]);
    expect(counts.reduce((total, count) => total + count, 0)).toBe(12);
  });

  it("resolves every pill target to exactly one section, and to the mapped one", () => {
    const resolved = POLICY_JUMP.map((pill) => {
      const matches = POLICY_SECTIONS.filter(
        (section) => `policy-section-${section.no}` === pill.target
      );
      expect(matches, `pill ${t(enConsent, pill.labelKey)} resolves to ${matches.length} sections`)
        .toHaveLength(1);
      return matches[0]!.no;
    });
    expect(resolved).toEqual(["05", "01", "06", "03", "04", "07", "08", "11"]);
  });

  it("carries R12's accent token name on each section, as a name without var()", () => {
    expect(POLICY_SECTIONS.map((section) => section.accent)).toEqual([
      "--ok-dot",
      "--gold",
      "--reasoning",
      "--con",
      "--ink",
      "--ok-dot",
      "--gold",
      "--reasoning",
      "--muted",
      "--con",
      "--ink"
    ]);
  });

  it("ships decoded characters, with bodies and bullets byte-exact against the SPEC", () => {
    expect(POLICY_SECTIONS.map((section) => resolvePolicyMessage(section.body)))
      .toEqual(SPEC_BODIES);
    expect(POLICY_SECTIONS.flatMap((section) => section.items.map(resolvePolicyMessage)))
      .toEqual(SPEC_BULLETS);

    const everyString = [
      ...POLICY_JUMP.flatMap((pill) => [t(enConsent, pill.labelKey), pill.target]),
      ...POLICY_SECTIONS.flatMap((section) => [
        section.no,
        t(enConsent, section.titleKey),
        section.accent,
        resolvePolicyMessage(section.body),
        ...section.items.map(resolvePolicyMessage)
      ])
    ];
    for (const value of everyString) {
      expect(value, `undecoded escape shipped in ${value}`).not.toMatch(/\\u[0-9A-Fa-f]{4}/);
    }

    const joined = everyString.join("\n");
    expect(joined).toMatch(/\u2014/);
    expect(joined).toContain("children\u2019s");
    expect(joined).toContain("Settings \u2192 Privacy");
  });
});
