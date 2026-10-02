import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  SUPPORT_CONTROL_NAME_PROTECTED_PHRASES, localizeSupportControlNames,
  supportRecoveryFallback, supportSourceLabel, supportSourceProjection
} from "../../packages/support-kb/src/control-names.js";
import { SUPPORT_CONTROL_NAMES } from "../../packages/support-kb/src/ui-labels.js";
import { SUPPORT_LOCALES } from "../../packages/support-kb/src/locale.js";
import { buildSupportKnowledgeContext, supportCapabilityActionLabel, supportCorpusLanguage } from "../../packages/support-kb/src/context.js";
import { SUPPORT_ACTION_IDS, SUPPORT_CAPABILITIES } from "../../packages/support-kb/src/catalog.js";
import { resolveSupportActions } from "../../packages/support-kb/src/navigation.js";
import { createHelpCorpusSnapshotLookup, type HelpCorpusEntry, type LoadedHelpCorpus } from "../../packages/support-kb/src/index.js";
import { createSupportAnswerService } from "../../apps/api/src/support/answer.js";
import { createSupportModelReferenceFactory } from "../../apps/api/src/support/model-references.js";
import type { SupportMessageCipherPort } from "../../apps/api/src/support/session.js";

const msg = (loc: string, ns: string, key: string): string =>
  (JSON.parse(readFileSync(resolve(process.cwd(), `apps/ui/messages/${loc}/${ns}.json`), "utf8")) as Record<string,string>)[key]!
    .replace(/\s*[↗→]\s*$/u, "").trim();
const OTHER = SUPPORT_LOCALES.filter((l) => l !== "en" && l !== "ro");
const entry = (over: Partial<HelpCorpusEntry>): HelpCorpusEntry => Object.freeze({
  id: "support-cases", lang: "en", title: "Talk to a human", status: "shipped", sources: Object.freeze(["fixture"]),
  verifiedAgainst: "fixture", ratifiedBy: "V", ratifiedOn: "2026-10-01", body: "Choose Talk to a human.",
  modelProjection: "Choose Talk to a human, then Settings.", fallback: "Choose Talk to a human.", ...over
});

describe("S05 control names for the 33 locales without their own help texts (SPEC-v4 R02-R04)", () => {
  it("leaves en text unchanged", () => {
    expect(localizeSupportControlNames("Choose Settings, then Active sessions.", "en")).toBe("Choose Settings, then Active sessions.");
  });
  it("leaves ro text unchanged", () => {
    expect(localizeSupportControlNames("Choose Settings, then Active sessions.", "ro")).toBe("Choose Settings, then Active sessions.");
  });
  it("names each control by its de screen label inside an English sentence", () => {
    expect(localizeSupportControlNames("Choose Settings, then Active sessions.", "de"))
      .toBe(`Choose ${msg("de","chrome","chrome.settings")}, then ${msg("de","settings","settings.sessions.title")}.`);
  });
  it("replaces the longest label first (High stakes before High)", () => {
    expect(localizeSupportControlNames("Pick High stakes or High.", "de"))
      .toBe(`Pick ${msg("de","newDebate","newDebate.highStakes")} or ${msg("de","newDebate","newDebate.high")}.`);
  });
  it("never replaces inside a longer word (either side) or a lower-case word", () => {
    expect(localizeSupportControlNames("Highlights, ReHigh, help and Helpdesk stay.", "de")).toBe("Highlights, ReHigh, help and Helpdesk stay.");
  });
  it("leaves every protected exclusion sentence verbatim in all 33 locales", () => {
    // REV-S05-p1 ct N1: the expectation comes from the source of record, never from the list under test — the context
    // strings of S05's frozen checks/parity-exclusions.json (D-ORCH-S05-3), each still present in the en text it protects.
    const PROTECTED: readonly (readonly [string, string])[] = [
      ["Export a debate as JSON", "packages/support-kb/content/export-json.en.md"],
      ["The Privacy policy, Terms of service, Cookies and Legal notice pages", "packages/support-kb/recovery/components.json"]
    ];
    expect([...SUPPORT_CONTROL_NAME_PROTECTED_PHRASES].sort()).toEqual(PROTECTED.map(([phrase]) => phrase).sort());
    for (const [phrase, file] of PROTECTED) {
      expect(readFileSync(resolve(process.cwd(), file), "utf8"), file).toContain(phrase);
      for (const loc of OTHER) expect(localizeSupportControlNames(`See ${phrase}.`, loc)).toBe(`See ${phrase}.`);
    }
  });
  it("uses the named exception for start-debate (fr home.startDebateLabel, not the composer button)", () => {
    expect(localizeSupportControlNames("Choose Start a debate.", "fr")).toBe(`Choose ${msg("fr","home","home.startDebateLabel")}.`);
    expect(localizeSupportControlNames("Choose Start a debate.", "fr")).not.toContain(msg("fr","home","home.startDebate"));
  });
  it("writes the ja one-character label as its own token", () => {
    expect(localizeSupportControlNames("Choose High.", "ja")).toBe(`Choose ${msg("ja","newDebate","newDebate.high")}.`);
  });
  it("maps every generated pair of every one of the 33 locales to its screen label", () => {
    for (const loc of OTHER) for (const [en, local] of SUPPORT_CONTROL_NAMES[loc]) expect(localizeSupportControlNames(en, loc)).toBe(local);
    expect(SUPPORT_CONTROL_NAMES.en).toEqual([]); expect(SUPPORT_CONTROL_NAMES.ro).toEqual([]);
  });
  it("localizes title, projection and fallback through the delivery functions", () => {
    const e = entry({});
    const human = msg("de","support","support.talkToHuman");
    expect(supportSourceLabel(e, "de")).toBe(human);
    expect(supportSourceProjection(e, "de")).toBe(`Choose ${human}, then ${msg("de","chrome","chrome.settings")}.`);
    expect(supportRecoveryFallback(e, "de")).toBe(`Choose ${human}.`);
    expect(supportRecoveryFallback({}, "de")).toBeUndefined();   // exactOptionalPropertyTypes: omit, never `undefined` (B1)
  });
  it("gives the model the localized SOURCE text and the capability-line labels of supportCapabilityActionLabel", () => {
    const e = entry({ id: "settings-help-menus", modelProjection: "Settings contains Active sessions." });
    const availableActionIds = resolveSupportActions(SUPPORT_ACTION_IDS, { signedIn: true, language: "de" }).map(({ id }) => id);
    const context = buildSupportKnowledgeContext({
      entries: [e], capabilities: SUPPORT_CAPABILITIES, availableActionIds, language: "de",
      query: `${msg("de","chrome","chrome.settings")}?`, historyText: "", maxCodePoints: 24_000,
      referenceFor: createSupportModelReferenceFactory("10000000-0000-4000-8000-000000000001").referenceFor
    });
    expect(context.text).not.toContain("Settings contains Active sessions.");
    if (context.sourceIds.length > 0) expect(context.text).toContain(supportSourceProjection(e, "de"));
    expect(context.text).toContain(`actions=${supportCapabilityActionLabel("settings", "de")}`);
  });
  it("recovers a de visitor's rejected draft with the localized fallback and source label", async () => {
    const e = entry({ modelProjection: "Escalation creates a human Support case; email is separate." });
    const snapshot = Object.freeze({ entries: Object.freeze([e]), kbVersion: "s05-de-recovery" }) as LoadedHelpCorpus;
    const messages = Object.freeze({
      write: vi.fn(async (input) => Object.freeze({ ...input, redacted: false })),
      writeAndTransit: vi.fn(async (input, transit) => { await transit(input.text); return Object.freeze({ ...input, redacted: false }); }),
      read: vi.fn(async () => null), listSession: vi.fn(async () => [])
    }) as unknown as SupportMessageCipherPort;
    const complete = vi.fn(async () => Object.freeze({ text: "not a JSON draft" }));   // unparseable: rejected in every locale
    const service = createSupportAnswerService({
      entries: snapshot.entries, snapshots: createHelpCorpusSnapshotLookup(snapshot), messages,
      modelReferenceFactory: () => createSupportModelReferenceFactory("10000000-0000-4000-8000-000000000001"),
      modelFor: () => Object.freeze({ complete }) as never,
      clock: (() => { let at = Date.parse("2026-10-01T10:00:00.000Z"); return () => new Date(++at); })()
    });
    const result = await service.respond({
      sessionId: "10000000-0000-4000-8000-000000000001", text: "How do I create a human case and what does support email do?",
      language: "de", detectedLanguage: "en", overrideLanguage: null, modelRef: "support-fixture",
      kbVersion: snapshot.kbVersion, snapshot, signedIn: false, receivedAt: new Date("2026-10-01T10:00:00.000Z")
    });
    expect(result.text).toBe(supportRecoveryFallback(e, "de"));
    expect(result.text).not.toBe(e.fallback);
    expect(result.sources?.[0]?.label).toBe(supportSourceLabel(e, "de"));
    // REV-S05-p1 ct N5, REV-S05-p2 ct N2 (SPEC-v4 R02, "no second rendering path"): respond(), the knowledge context and
    // the R02 dump pick the corpus a locale is served from through supportCorpusLanguage. Pinned by BEHAVIOUR, never by
    // source text: the shared function's result for all 35 locales, respond() above (a de visitor recovered from the en
    // entry, the only one in its snapshot), and the context below (a de visitor is given the en source, a ro visitor the
    // ro one). The dump's use is judged by names-gate's MISSING rule (required ids come from the base's en corpus).
    expect(SUPPORT_LOCALES.map((loc) => supportCorpusLanguage(loc))).toEqual(SUPPORT_LOCALES.map((loc) => loc === "ro" ? "ro" : "en"));
    const pair = [entry({ id: "support-cases", lang: "en" }), entry({ id: "support-cases", lang: "ro", title: "Vorbiți cu o persoană",
      modelProjection: "Alegeți Vorbiți cu o persoană.", fallback: "Alegeți Vorbiți cu o persoană." })];
    for (const [language, lang] of [["de", "en"], ["ro", "ro"], ["ja", "en"]] as const) {
      const routed = buildSupportKnowledgeContext({
        entries: pair, capabilities: SUPPORT_CAPABILITIES, language, query: "How do I talk to a human support case?",
        historyText: "", maxCodePoints: 24_000,
        availableActionIds: resolveSupportActions(SUPPORT_ACTION_IDS, { signedIn: false, language }).map(({ id }) => id),
        referenceFor: createSupportModelReferenceFactory("10000000-0000-4000-8000-000000000001").referenceFor
      });
      const projection = supportSourceProjection(pair.find((candidate) => candidate.lang === lang)!, language);
      expect(routed.text, `${language} is served the ${lang} corpus`).toContain(`\n${projection}`);
    }
  });
});
