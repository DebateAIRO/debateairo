import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Answer } from "@debateai/contract";
import { AnswerHonestyDrawer } from "../../apps/ui/components/AnswerHonestyDrawer.js";
import { createLiveRunState } from "../../apps/ui/lib/v3/liveEvents.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";

const MESSAGES = resolve(process.cwd(), "apps/ui/messages");
const catalog = (locale: string, namespace: string): Record<string, string> =>
  JSON.parse(readFileSync(resolve(MESSAGES, locale, `${namespace}.json`), "utf8")) as Record<string, string>;
const noop = () => {};

function answerWith(comparison: Answer["judges_comparison"]): Answer {
  const base = buildFairShapedAnswer();
  const position = base.nodes.find((node) => node.node_id === "node:position")!;
  const second = { ...position, node_id: "node:position-b", claim: "The second position.", final_strength: { ...position.final_strength!, value: 0.3 } };
  return { ...base, nodes: [...base.nodes, second], ...(comparison === undefined ? {} : { judges_comparison: comparison }) };
}

function drawer(answer: Answer, locale: "en" | "ro" = "en"): string {
  return renderToStaticMarkup(
    <AnswerHonestyDrawer
      answer={answer} live={createLiveRunState()} ledgerDigest={null} ledgerError={null} inspection={null}
      inspectionError={null} onShowInspection={noop} onUnlinkMemory={noop} actionState={null} investigationInput={{}}
      onInvestigationInput={noop} onRecordInvestigation={noop}
      answerExport={{ available: false, reason: "LEDGER_DIGEST_PENDING", message: "Test-layer export pending." }}
      token={null} onClose={noop} catalog={catalog(locale, "misc")} debateChromeCatalog={catalog(locale, "debateChrome")}
    />
  );
}
const visible = (html: string): string => html.replace(/<[^>]*>/gu, " ").replace(/&#x27;/gu, "'").replace(/&quot;/gu, '"').replace(/&amp;/gu, "&");
const fill = (text: string, values: Record<string, number>) => text.replace(/\{([A-Za-z]+)\}/gu, (_m, name: string) => String(values[name]));

// No `as const` (pre-flight PF-R2b4.10): Answer["judges_comparison"] takes mutable arrays.
const COMPARISON: NonNullable<Answer["judges_comparison"]> = { judges_seated: 3, judges_counted: 2, answers: [
  { root_node_id: "node:position-b", honest_score: 0.3, judges_chose: 2 },
  { root_node_id: "node:position", honest_score: 0.41, judges_chose: 0 }
] };

describe("R2 honesty panel: how the answers compared", () => {
  it("names each answer by its statement, draws its case as a bar, and says how many counted choices picked it", () => {
    const en = catalog("en", "misc");
    const html = drawer(answerWith(COMPARISON));
    const text = visible(html);
    expect(text).toContain(en["misc.answerHonesty.comparison.title"]);
    expect(text).toContain(en["misc.answerHonesty.comparison.intro"]);
    expect(text).toContain(fill(en["misc.answerHonesty.comparison.counted"]!, { counted: 2, seated: 3 }));
    expect(text).toContain(en["misc.answerHonesty.comparison.notCounted"]);
    expect(text).not.toContain(en["misc.answerHonesty.comparison.noneCounted"]);
    expect(text.indexOf("The second position.")).toBeLessThan(text.indexOf("The position claim under test."));
    expect(text).toContain(fill(en["misc.answerHonesty.comparison.chosen"]!, { chose: 2, counted: 2 }));
    expect(text).toContain(fill(en["misc.answerHonesty.comparison.chosen"]!, { chose: 0, counted: 2 }));
    // The score is a bar, never a printed number.
    expect(html.match(/<meter class="drawerComparisonMeter"/gu)).toHaveLength(2);
    expect(html).toContain(`aria-label="${en["misc.answerHonesty.comparison.strength"]}"`);
    // Screen readers hear the word, never the number (ruling PF-R2b4.7 (b); the owner may choose otherwise at O1).
    expect(html.split(`aria-valuetext="${en["misc.answerHonesty.comparison.strength"]}"`)).toHaveLength(3);
    expect(html).not.toContain("aria-valuenow");
    expect(text).not.toMatch(/0\.41|0\.3\b|41\s?%/u);
  });

  it("says no choice counted when none did, and draws no bar for an answer without a strength", () => {
    const en = catalog("en", "misc");
    const html = drawer(answerWith({ judges_seated: 2, judges_counted: 0, answers: [
      { root_node_id: "node:position", honest_score: null, judges_chose: 0 }
    ] }));
    expect(visible(html)).toContain(en["misc.answerHonesty.comparison.noneCounted"]);
    expect(visible(html)).not.toContain(en["misc.answerHonesty.comparison.notCounted"]);
    expect(html).not.toContain("<meter");
  });

  it("speaks the page's language", () => {
    const ro = catalog("ro", "misc");
    expect(visible(drawer(answerWith(COMPARISON), "ro"))).toContain(ro["misc.answerHonesty.comparison.title"]);
  });

  it("shows nothing new on an answer without the comparison (engine 1)", () => {
    const en = catalog("en", "misc");
    const html = drawer(answerWith(undefined));
    expect(visible(html)).not.toContain(en["misc.answerHonesty.comparison.title"]);
    expect(html).not.toContain("drawerComparisonMeter");
  });
});
