import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadHelpCorpus } from "../../packages/support-kb/src/index.js";
import { SUPPORT_LOCALES } from "../../packages/support-kb/src/locale.js";
import { SUPPORT_ACTION_IDS, SUPPORT_CAPABILITIES } from "../../packages/support-kb/src/catalog.js";
import { buildSupportKnowledgeContext } from "../../packages/support-kb/src/context.js";
import { resolveSupportActions } from "../../packages/support-kb/src/navigation.js";
import { SUPPORT_TOPIC_PROMPTS } from "../../packages/support-kb/src/ui-labels.js";
import { createSupportModelReferenceFactory } from "../../apps/api/src/support/model-references.js";

// cookie-compliance S05 (SPEC-v5 R10, R13): routing for the 33 locales without their own help texts is pinned to what it
// was at S05's base. S05 changes which NAMES a 33-locale visitor and the model read; it must never change which article
// or action answers. Queries are fixed: the 6 localized topic prompts plus a question built from 20 screen labels read
// from apps/ui/messages (which S05 never edits). The golden was written at the base, before any S05 product edit, with
// S05_WRITE_ROUTING_GOLDEN=1, and is never regenerated on the branch.
// REV-S05-p1 ct N4: with S05_WRITE_ROUTING_GOLDEN=1 the test writes today's routing to the OS temp directory (never to
// the committed golden) and FAILS, so a run with the variable set can never pass or rewrite the pin. Regenerating at the
// base (SV's content check) means: check out the base tree, run with the variable, diff the temp file with the golden.
// D-ORCH-S05-2 (N2): the same 26 queries in ENGLISH are routed for every one of the 33 locales too (keys `…|en<n>`):
// a 33-locale visitor who types English is scored against the en catalogue names, which a localized name must not move.
// Paid plans (P24, merge with #62): the nine paid-plan pages add 18 English capability queries (`…|en66` to `…|en83`) to
// every locale and sign-in state. The golden was re-measured with them on the merged catalogue: every one of S05's 6,072
// rows is byte-identical, and the 1,188 new rows are the routes the nine pages' own names and search words reach.
const GOLDEN = resolve(process.cwd(), "tests/support/fixtures/support-routing-33.json");
const QUERY_KEYS = [
  "chrome:chrome.aiTransparency", "chrome:chrome.legal.notice", "chrome:chrome.legal.terms", "chrome:chrome.legal.versions",
  "chrome:chrome.legal.privacy", "chrome:chrome.legal.health", "chrome:chrome.legal.cookies", "chrome:chrome.legal.providers",
  "home:home.createAccount", "chrome:chrome.settings", "home:home.logIn", "chrome:chrome.footer.home", "chrome:chrome.method",
  "chrome:chrome.help", "support:support.serviceStatus", "settings:settings.sessions.title", "consent:consent.settings.title",
  "home:home.yourDebates", "home:home.publicDebates", "home:home.startDebateLabel"
] as const;
const msg = (loc: string, ref: string): string => {
  const [ns, key] = ref.split(":") as [string, string];
  return (JSON.parse(readFileSync(resolve(process.cwd(), `apps/ui/messages/${loc}/${ns}.json`), "utf8")) as Record<string,string>)[key]!;
};
const corpus = loadHelpCorpus(resolve(process.cwd(), "packages/support-kb/content"), {
  reviewManifest: JSON.parse(readFileSync(resolve(process.cwd(), "packages/support-kb/reviews/manifest.json"), "utf8")) as unknown,
  recoveryComponents: readFileSync(resolve(process.cwd(), "packages/support-kb/recovery/components.json")),
  requireReviewedRecovery: true
});
const queriesIn = (loc: (typeof SUPPORT_LOCALES)[number]): string[] =>
  [...SUPPORT_TOPIC_PROMPTS[loc].map(({ prompt }) => prompt), ...QUERY_KEYS.map((ref) => `${msg(loc, ref)}?`)];
// the en catalogue's own words for each of the 29 product areas (name; name + search terms), typed by a 33-locale visitor
const CAPABILITY_QUERIES = SUPPORT_CAPABILITIES.flatMap(({ labels, searchTerms }) =>
  [`${labels.en}?`, `${labels.en} ${searchTerms.en.join(" ")}?`]);

function routing(): Record<string, string> {
  const out: Record<string, string> = {};
  const english = [...queriesIn("en"), ...CAPABILITY_QUERIES];
  for (const language of SUPPORT_LOCALES.filter((l) => l !== "en" && l !== "ro")) {
    const queries = [
      ...queriesIn(language).map((query, index) => [`${index}`, query] as const),
      ...english.map((query, index) => [`en${index}`, query] as const)
    ];
    for (const signedIn of [false, true]) {
      const availableActionIds = resolveSupportActions(SUPPORT_ACTION_IDS, { signedIn, language }).map(({ id }) => id);
      for (const [index, query] of queries) {
        const context = buildSupportKnowledgeContext({
          entries: corpus.entries, capabilities: SUPPORT_CAPABILITIES, availableActionIds, language, query,
          historyText: "", maxCodePoints: 24_000,
          referenceFor: createSupportModelReferenceFactory("10000000-0000-4000-8000-000000000001").referenceFor
        });
        out[`${language}|${signedIn ? "in" : "out"}|${index}`] =
          `${context.sourceIds.join(",")}|${context.requestedActionIds.join(",")}|${context.recoverySourceIds.join(",")}|${context.sourcePolicy?.id ?? "-"}`;
      }
    }
  }
  return out;
}

describe("S05 33-locale routing pin (SPEC-v5 R10, R13)", () => {
  it("routes every fixed 33-locale query exactly as at S05's base", () => {
    const now = routing();
    if (process.env.S05_WRITE_ROUTING_GOLDEN === "1") {
      const written = join(tmpdir(), "support-routing-33.golden.json");
      writeFileSync(written, `${JSON.stringify(now, null, 2)}\n`);
      throw new Error(`S05_WRITE_ROUTING_GOLDEN=1 wrote ${written}; the committed golden is never regenerated here (D-ORCH-S05-3)`);
    }
    const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<string, string>;
    expect(Object.keys(golden)).toHaveLength(33 * 2 * (2 * (6 + QUERY_KEYS.length) + 2 * 29));
    expect(now).toEqual(golden);
  });
});
