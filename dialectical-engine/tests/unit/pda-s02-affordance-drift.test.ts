import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ownerPage = readFileSync(
  resolve(process.cwd(), "apps/ui/app/debate/[id]/DebatePageClient.tsx"),
  "utf8"
);
const ownerHonesty = readFileSync(
  resolve(process.cwd(), "apps/ui/components/AnswerHonestyDrawer.tsx"),
  "utf8"
);
const chromeEnglish = JSON.parse(
  readFileSync(resolve(process.cwd(), "apps/ui/messages/en/chrome.json"), "utf8")
) as Readonly<Record<string, string>>;
const miscEnglish = JSON.parse(
  readFileSync(resolve(process.cwd(), "apps/ui/messages/en/misc.json"), "utf8")
) as Readonly<Record<string, string>>;

function between(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex, `missing start anchor ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `missing end anchor ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

function occurrences(source: string, token: string): number {
  return source.split(token).length - 1;
}

function expectLocalizedAriaLabel(
  source: string,
  key: string,
  english: string,
  count: number
): void {
  expect(chromeEnglish[key], `${key} English catalogue value`).toBe(english);
  expect(occurrences(source, `aria-label={t(chromeCatalog, "${key}")}`)).toBe(count);
}

describe("S02 owner/public affordance drift pins", () => {
  it("pins and classifies the owner top-bar affordance inventory", () => {
    const topBar = between(ownerPage, "{/* ---- top bar ---- */}", "{/* ---- verdict-first banner");

    // READ + PUBLIC-ONLY ADDITION — four reading-mode controls are shared with
    // the public page (Thread, Split, Tree, Map). V's ruling of 2026-09-20
    // added a FIFTH, Overview, which the public surface has and the owner does
    // not: a shared link opens on the published summary with the argument tree
    // one click away, and the owner has no published summary to open.
    //
    // This is the first affordance in this inventory that runs PUBLIC-only —
    // every other divergence pinned below is owner-only — so the bare count can
    // no longer state the relationship, and "5" on its own would not say who
    // gets the fifth. The gate is therefore pinned beside the count: drop the
    // `publicMode &&` and the owner gets an Overview tab with no publicOverview
    // behind it, which falls through every view branch and renders blank. That
    // is exactly the kind of silent divergence this file exists to catch.
    expect(chromeEnglish["chrome.view"], "chrome.view English catalogue value").toBe("View");
    expect(occurrences(topBar, 'role="group" aria-label={t(chromeCatalog, "chrome.view")}')).toBe(1);
    expect(occurrences(topBar, "aria-pressed={view ===")).toBe(5);
    expect(occurrences(topBar, 'aria-pressed={view === "overview"}')).toBe(1);
    expect(occurrences(topBar, "{publicMode && publicOverview ? (")).toBe(1);
    // READ — public page reuses the same typed-absence scoring diagnostics drawer.
    expectLocalizedAriaLabel(topBar, "chrome.openScoringDiagnostics", "Open scoring diagnostics", 1);
    // READ — library navigation remains available on the public page.
    expectLocalizedAriaLabel(topBar, "chrome.library", "Library", 2);
    // MUTATION — replay-generation stays owner-only.
    expectLocalizedAriaLabel(topBar, "chrome.replay", "Replay", 2);
    // MUTATION-CAPABLE OWNER SURFACE — workspace stays off the public envelope route.
    expectLocalizedAriaLabel(topBar, "chrome.workspace", "Workspace", 2);
    // READ — public page supplies its public-envelope honesty counterpart.
    expectLocalizedAriaLabel(topBar, "chrome.honesty", "Honesty", 2);
    // READ — public page supplies its public-envelope export counterpart.
    expectLocalizedAriaLabel(topBar, "chrome.export", "Export", 2);
    // READ — explanatory copy is covered by the public disclosure/honesty surfaces.
    expectLocalizedAriaLabel(topBar, "chrome.howItWorks", "How it works", 2);
    // MUTATION-CAPABLE OWNER ACCOUNT SURFACE — settings stays owner-only.
    expectLocalizedAriaLabel(topBar, "chrome.settings", "Settings", 2);
    // READ/STRUCTURAL — owner overflow itself contains the duplicated responsive actions.
    expectLocalizedAriaLabel(topBar, "chrome.moreDebateActions", "More debate actions", 1);
    // MUTATION — challenge callbacks stay owner-only. The owner and public routes
    // are now one component, so the split is no longer "which page renders the
    // prop" but "does publicMode withhold it". Both handler surfaces are pinned:
    // the three tree call sites share one spread that is empty in publicMode, and
    // the node drawer's onChallenge is spread conditionally. Withholding — not a
    // no-op handler — is what removes the trigger, because every consumer gates
    // its affordance on the callback being present (behaviourally pinned in
    // tests/render/pda-s02-public-tree.test.tsx).
    expect(occurrences(ownerPage, "{...challengeProps}")).toBe(3);
    expect(occurrences(ownerPage, "const challengeProps = publicMode\n    ? {}\n    : { onChallengeNode:")).toBe(1);
    expect(occurrences(ownerPage, "{...(publicMode\n            ? {}\n            : { onChallenge:")).toBe(1);
    // MUTATION — publication, unpublish and private-delete controls stay owner-only.
    expect(occurrences(ownerPage, "<PublicationControl")).toBe(1);

    // 20 before V's ruling of 2026-09-20; the public-only Overview control
    // above is the twenty-first. This total is the backstop for the named pins:
    // it catches an interactive element ADDED to the top bar that none of the
    // aria-label counts above happens to name.
    const interactiveElementCount = (topBar.match(/<(?:button|a|Link|summary)\b/g) ?? []).length;
    expect(interactiveElementCount).toBe(21);
  });

  it("pins and classifies every owner honesty section", () => {
    const sections = [...ownerHonesty.matchAll(
      /<section className="wsSection" aria-label=\{t\(catalog, "([^"]+)"\)\}/g
    )]
      .map((match) => match[1]);
    const expectedSections = [
      // PUBLIC DRAWER — rendered from the public answer state.
      ["misc.answerHonesty.answerState", "Answer state"],
      // PUBLIC DRAWER — rendered from verdict/confidence fields.
      ["misc.answerHonesty.verdict", "Verdict"],
      // NODE DRAWER — public contract nodes retain condition marks.
      ["misc.answerHonesty.conditionMarks", "Condition marks"],
      // NODE DRAWER — public contract nodes retain redacted abstention records.
      ["misc.answerHonesty.abstention", "Abstention"],
      // NODE DRAWER — public contract nodes retain relevant-as-of state.
      ["misc.answerHonesty.perItemFreshness", "Per-item freshness"],
      // TYPED ABSENCE — named explicitly as not included in the public snapshot.
      ["misc.answerHonesty.costEnvelope", "Cost envelope"],
      // TREE SURFACE — public edges are projected into the shared reading views.
      ["misc.answerHonesty.graphEdges", "Graph edges"],
      // NODE DRAWER — public nodes retain labeled numbers with owner pointers redacted.
      ["misc.answerHonesty.numbersAndReplay", "Numbers and replay"],
      // PUBLIC DRAWER — rendered when present.
      ["misc.answerHonesty.badges", "Badges"],
      // PUBLIC DRAWER — rendered when present.
      ["misc.answerHonesty.residualObjections", "Residual objections"],
      // PUBLIC DRAWER — rendered directly.
      ["misc.answerHonesty.whatWouldReverseThis", "What would reverse this"],
      // N/A — value hinges are not in the public envelope.
      ["misc.answerHonesty.valueHinges", "Value hinges"],
      // N/A — shadow suppressions are not in the public envelope.
      ["misc.answerHonesty.shadowSuppressions", "Shadow suppressions"],
      // N/A — answer lineage is not in the public envelope.
      ["misc.answerHonesty.buildsOnPreviousAnswer", "Builds on a previous answer"],
      // TYPED ABSENCE — owner-only and named explicitly.
      ["misc.answerHonesty.authorizedInspection", "Authorized inspection"],
      // TYPED ABSENCE — named explicitly as not included.
      ["misc.answerHonesty.executionLedgerDigest", "Execution ledger digest"],
      // N/A — live cycle refusal records are not publication fields.
      ["misc.answerHonesty.cycleRefusals", "Cycle refusals"],
      // N/A — investigation recording is a mutation and stays owner-only.
      ["misc.answerHonesty.investigateDeeper", "Investigate deeper"],
      // N/A — immutable public snapshots have no live event stream.
      ["misc.answerHonesty.liveHonestyEvents", "Live honesty events"],
      // PUBLIC PAGE — represented by the public-envelope export affordance.
      ["misc.answerHonesty.export", "Export"]
    ] as const;

    expect(sections).toEqual(expectedSections.map(([key]) => key));
    for (const [key, english] of expectedSections) {
      expect(miscEnglish[key], `${key} English catalogue value`).toBe(english);
    }
    expect(sections).toHaveLength(20);
  });
});
