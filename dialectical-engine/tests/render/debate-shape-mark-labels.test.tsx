// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Answer } from "@debateai/contract";
import { DEBATE_SHAPE_MARKS } from "@debateai/kernel";
import { AnswerHonestyDrawer } from "../../apps/ui/components/AnswerHonestyDrawer.js";
import { NodeDetailDrawer } from "../../apps/ui/components/NodeDetailDrawer.js";
import { debateDetailFromAnswer } from "../../apps/ui/lib/v3/adapter.js";
import { createLiveRunState } from "../../apps/ui/lib/v3/liveEvents.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";

/**
 * Debate shape P2c (rulings C-DRAWER and C-TONE; pre-flight PF-C21, PF-C22): the twelve shape marks are
 * information for the reader. The honesty drawer shows only their words: never the run id or node id a
 * record names, its reason code, or the raw mark in a tooltip. The node drawer shows them in the neutral
 * tone, not as a dispute. Every other mark keeps today's tooltip and tone.
 */

const MESSAGES = resolve(process.cwd(), "apps/ui/messages");
const catalog = (namespace: string): Record<string, string> =>
  JSON.parse(readFileSync(resolve(MESSAGES, "en", `${namespace}.json`), "utf8")) as Record<string, string>;
const miscEn = catalog("misc");
const chromeEn = catalog("debateChrome");
function words(key: string): string {
  const value = chromeEn[key];
  if (value === undefined) throw new Error(`catalogue lacks ${key}`);
  return value;
}
const noop = () => {};

/** Ids only the shape records carry, as the runner writes them, so their absence proves the drawer leaked none. */
const RUN_ID = "7f3c2a10-5b8e-4c1d-9a2f-0e6b4d8c1a37";
const SCRUTINISED_NODE = "node:shape-scrutinised-7f3c";
const MERGE_REASON = "MAP_MERGE_FALLBACK:MERGE";
const SCRUTINY_REASON = "SCRUTINY_EXTENDED:3";
const SHAPE: readonly string[] = DEBATE_SHAPE_MARKS;

type MarkRecord = Answer["condition_mark_records"][number];
function shapeRecord(mark: MarkRecord["mark"], scope: MarkRecord["scope"], subjectRef: string, reason: string): MarkRecord {
  return {
    mark, scope, subject_ref: subjectRef, reason, lift_path: null, served_root_rule: null,
    call_site_key: null, planned_leg_count: null, terminal_transport_outcome: null, review_outcome: null,
    hidden_strength: null, hidden_score_threshold: null, hidden_score_threshold_source_ref: null,
    excluded_from_served_number: null, judged_basis_count: null, affected_node_ids: [SCRUTINISED_NODE]
  };
}

const BASE = buildFairShapedAnswer();
/** The fixture's own two marks, all twelve shape marks, and a map record and a scrutiny record as the runner writes them. */
const SHAPED = buildFairShapedAnswer({
  condition_marks: [...BASE.condition_marks, ...DEBATE_SHAPE_MARKS],
  condition_mark_records: [
    ...BASE.condition_mark_records,
    shapeRecord("MAP_MERGE_FALLBACK", "answer", RUN_ID, MERGE_REASON),
    shapeRecord("SCRUTINY-EXTENDED", "node", SCRUTINISED_NODE, SCRUTINY_REASON)
  ]
});

function parsed(markup: string): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = markup;
  return container;
}

function honestyDrawer(answer: Answer): HTMLElement {
  return parsed(renderToStaticMarkup(
    <AnswerHonestyDrawer
      answer={answer}
      live={createLiveRunState()}
      ledgerDigest={null}
      ledgerError={null}
      inspection={null}
      inspectionError={null}
      onShowInspection={noop}
      onUnlinkMemory={noop}
      actionState={null}
      investigationInput={{}}
      onInvestigationInput={noop}
      onRecordInvestigation={noop}
      answerExport={{ available: false, reason: "LEDGER_DIGEST_PENDING", message: "Test-layer export pending." }}
      token={null}
      onClose={noop}
      catalog={miscEn}
      debateChromeCatalog={chromeEn}
      floorShown={false}
    />
  ));
}

function expectNoInternals(text: string): void {
  for (const internal of [RUN_ID, SCRUTINISED_NODE, MERGE_REASON, SCRUTINY_REASON, ...SHAPE]) {
    expect(text, internal).not.toContain(internal);
  }
}

describe("debate shape P2c — the shape marks in the drawers", () => {
  it("the honesty drawer shows only the words of the twelve shape marks", () => {
    const drawer = honestyDrawer(SHAPED);
    const merge = words("debateChrome.condition.mapMergeFallback");
    const scrutiny = words("debateChrome.condition.scrutinyExtended");
    const chips = [...drawer.querySelectorAll<HTMLElement>(".roleChip")].map((chip) => chip.textContent);
    expect(chips).toContain(merge);
    expect(chips).toContain(scrutiny);
    expect(chips).toContain(words("debateChrome.condition.answersFilled"));
    // Each shape record's line is its label and nothing else: no scope, subject, reason or lift path.
    const items = [...drawer.querySelectorAll<HTMLElement>("li.drawerFindingItem")];
    for (const label of [merge, scrutiny]) {
      const item = items.find((candidate) => (candidate.textContent ?? "").includes(label));
      expect(item?.textContent?.trim(), label).toBe(label);
    }
    expectNoInternals(drawer.textContent ?? "");
    // No tooltip carries a shape mark; every other mark keeps today's code tooltip.
    for (const element of drawer.querySelectorAll("[title]")) {
      expect(SHAPE).not.toContain(element.getAttribute("title"));
    }
    expect(drawer.querySelector('[title="OWED-CHECK-UNEXECUTED"]')).not.toBeNull();
  });

  // Ruling C-ONCE: the runner writes one SCRUTINY-EXTENDED record per scrutinised node and one map record per mark
  // occurrence. A label repeated once per record would be a count by another name, so each shows once.
  it("the honesty drawer shows each shape mark's label once, however many records carry it", () => {
    const scrutinised = ["node:shape-a", "node:shape-b", "node:shape-c", "node:shape-d", "node:shape-e"];
    const many = buildFairShapedAnswer({
      condition_marks: [...BASE.condition_marks, "SCRUTINY-EXTENDED", "MAP_MERGE_FALLBACK"],
      condition_mark_records: [
        ...BASE.condition_mark_records,
        ...scrutinised.map((node, index) => shapeRecord("SCRUTINY-EXTENDED", "node", node, `SCRUTINY_EXTENDED:${String(index)}`)),
        shapeRecord("MAP_MERGE_FALLBACK", "answer", `${RUN_ID}:1`, MERGE_REASON),
        shapeRecord("MAP_MERGE_FALLBACK", "answer", `${RUN_ID}:2`, MERGE_REASON)
      ]
    });
    const list = honestyDrawer(many).querySelector(`ul[aria-label="${miscEn["misc.answerHonesty.namedConditionMarks"]!}"]`);
    expect(list).not.toBeNull();
    const items = [...list!.querySelectorAll<HTMLElement>("li.drawerFindingItem")].map((item) => item.textContent?.trim() ?? "");
    const scrutiny = words("debateChrome.condition.scrutinyExtended");
    const merge = words("debateChrome.condition.mapMergeFallback");
    expect(items.filter((text) => text === scrutiny)).toHaveLength(1);
    expect(items.filter((text) => text === merge)).toHaveLength(1);
    // Every other record keeps its own line, as today.
    expect(items).toHaveLength(BASE.condition_mark_records.length + 2);
  });

  it("the node drawer shows the shape marks in the neutral tone, without a code tooltip", () => {
    const v3 = { ...SHAPED.nodes[0]!, condition_marks: [...DEBATE_SHAPE_MARKS, "SINGLE-LINEAGE" as const] };
    const drawer = parsed(renderToStaticMarkup(
      <NodeDetailDrawer
        node={debateDetailFromAnswer(SHAPED).tree!.children[0]!}
        v3={v3}
        token={null}
        onClose={noop}
        onFocusRecommendationNode={() => false}
        canFocusRecommendationNode={() => false}
        onQueued={noop}
        onError={noop}
        onAuthRejected={noop}
        debateChromeCatalog={chromeEn}
        conditionRecords={SHAPED.condition_mark_records}
      />
    ));
    const pills = [...drawer.querySelectorAll<HTMLElement>("[data-condition-pill]")];
    expect(pills).toHaveLength(DEBATE_SHAPE_MARKS.length + 1);
    for (const pill of pills.slice(0, DEBATE_SHAPE_MARKS.length)) {
      expect(pill.getAttribute("data-mark")).toBe("neutral");
      expect(pill.classList.contains("neutral")).toBe(true);
      expect(pill.hasAttribute("title")).toBe(false);
    }
    expect(pills.map((pill) => pill.textContent)).toContain(words("debateChrome.condition.scrutinyExtended"));
    // Every other mark keeps today's tone and tooltip.
    const lineage = pills[DEBATE_SHAPE_MARKS.length]!;
    expect(lineage.getAttribute("data-mark")).toBe("dispute");
    expect(lineage.getAttribute("title")).toBe("SINGLE-LINEAGE");
    expectNoInternals(drawer.textContent ?? "");
  });

  it("words a merge fallback as combining only points that said the same thing (pre-flight PF-C33)", () => {
    expect(words("debateChrome.condition.mapMergeFallback")).toBe("Only points that said exactly the same thing were combined");
  });
});
