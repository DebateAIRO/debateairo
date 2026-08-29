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

describe("S02 owner/public affordance drift pins", () => {
  it("pins and classifies the owner top-bar affordance inventory", () => {
    const topBar = between(ownerPage, "{/* ---- top bar ---- */}", "{/* ---- verdict-first banner");

    // READ — public page has the same four reading-mode controls.
    expect(occurrences(topBar, 'role="group" aria-label="View"')).toBe(1);
    expect(occurrences(topBar, "aria-pressed={view ===")).toBe(4);
    // READ — public page reuses the same typed-absence scoring diagnostics drawer.
    expect(occurrences(topBar, 'aria-label="Open scoring diagnostics"')).toBe(1);
    // READ — library navigation remains available on the public page.
    expect(occurrences(topBar, 'aria-label="Library"')).toBe(2);
    // MUTATION — replay-generation stays owner-only.
    expect(occurrences(topBar, 'aria-label="Replay"')).toBe(2);
    // MUTATION-CAPABLE OWNER SURFACE — workspace stays off the public envelope route.
    expect(occurrences(topBar, 'aria-label="Workspace"')).toBe(2);
    // READ — public page supplies its public-envelope honesty counterpart.
    expect(occurrences(topBar, 'aria-label="Honesty"')).toBe(2);
    // READ — public page supplies its public-envelope export counterpart.
    expect(occurrences(topBar, 'aria-label="Export"')).toBe(2);
    // READ — explanatory copy is covered by the public disclosure/honesty surfaces.
    expect(occurrences(topBar, 'aria-label="How it works"')).toBe(2);
    // MUTATION-CAPABLE OWNER ACCOUNT SURFACE — settings stays owner-only.
    expect(occurrences(topBar, 'aria-label="Settings"')).toBe(2);
    // READ/STRUCTURAL — owner overflow itself contains the duplicated responsive actions.
    expect(occurrences(topBar, 'aria-label="More debate actions"')).toBe(1);
    // MUTATION — challenge callbacks stay owner-only and are omitted by the public parent.
    expect(occurrences(ownerPage, "onChallengeNode={(node, anchor)")).toBe(3);
    expect(occurrences(ownerPage, "onChallenge={(anchor, text)")).toBe(1);
    // MUTATION — publication, unpublish and private-delete controls stay owner-only.
    expect(occurrences(ownerPage, "<PublicationControl")).toBe(1);

    const interactiveElementCount = (topBar.match(/<(?:button|a|Link|summary)\b/g) ?? []).length;
    expect(interactiveElementCount).toBe(20);
  });

  it("pins and classifies every owner honesty section", () => {
    const sections = [...ownerHonesty.matchAll(/<section className="wsSection" aria-label="([^"]+)"/g)]
      .map((match) => match[1]);
    const expectedSections = [
      // PUBLIC DRAWER — rendered from the public answer state.
      "Answer state",
      // PUBLIC DRAWER — rendered from verdict/confidence fields.
      "Verdict",
      // NODE DRAWER — public contract nodes retain condition marks.
      "Condition marks",
      // NODE DRAWER — public contract nodes retain redacted abstention records.
      "Abstention",
      // NODE DRAWER — public contract nodes retain relevant-as-of state.
      "Per-item freshness",
      // TYPED ABSENCE — named explicitly as not included in the public snapshot.
      "Cost envelope",
      // TREE SURFACE — public edges are projected into the shared reading views.
      "Graph edges",
      // NODE DRAWER — public nodes retain labeled numbers with owner pointers redacted.
      "Numbers and replay",
      // PUBLIC DRAWER — rendered when present.
      "Badges",
      // PUBLIC DRAWER — rendered when present.
      "Residual objections",
      // PUBLIC DRAWER — rendered directly.
      "What would reverse this",
      // N/A — value hinges are not in the public envelope.
      "Value hinges",
      // N/A — shadow suppressions are not in the public envelope.
      "Shadow suppressions",
      // N/A — answer lineage is not in the public envelope.
      "Builds on a previous answer",
      // TYPED ABSENCE — owner-only and named explicitly.
      "Authorized inspection",
      // TYPED ABSENCE — named explicitly as not included.
      "Execution ledger digest",
      // N/A — live cycle refusal records are not publication fields.
      "Cycle refusals",
      // N/A — investigation recording is a mutation and stays owner-only.
      "Investigate deeper",
      // N/A — immutable public snapshots have no live event stream.
      "Live honesty events",
      // PUBLIC PAGE — represented by the public-envelope export affordance.
      "Export"
    ];

    expect(sections).toEqual(expectedSections);
    expect(sections).toHaveLength(20);
  });
});
