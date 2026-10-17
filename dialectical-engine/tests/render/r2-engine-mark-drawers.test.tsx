// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Answer } from "@debateai/contract";
import { ENGINE_MARKS } from "@debateai/kernel";
import { AnswerHonestyDrawer } from "../../apps/ui/components/AnswerHonestyDrawer.js";
import { NodeDetailDrawer } from "../../apps/ui/components/NodeDetailDrawer.js";
import { debateDetailFromAnswer } from "../../apps/ui/lib/v3/adapter.js";
import { createLiveRunState } from "../../apps/ui/lib/v3/liveEvents.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";

/**
 * R2a final wave, Ruling W1 (and Ruling (A7 Minors) 1): engine 2's four marks are label-only in both drawers,
 * exactly as the debate shape's marks are (ruling C-DRAWER). The runner writes an UNASSESSED-AT-REDUCED-WEIGHT
 * record whose reason is `UNASSESSED_AT_REDUCED_WEIGHT:0.66` and whose subject is the point's node id; the reader
 * sees only the mark's words: no reason code, no weight, no scope, no node id, no raw mark as a tooltip. Every
 * older mark keeps today's line, tooltip and tone.
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

/** The point's node id as the runner writes it (subject and affected node), with digits so a leak shows. */
const POINT_NODE = "4b7e91c2-0d3a-4f58-8e16-2c9a7b5d3e10";
const OTHER_POINT_NODE = "9a1f0e37-6c2b-4d84-b5e9-71d3c8a40f62";
const REASON = "UNASSESSED_AT_REDUCED_WEIGHT:0.66";
const ENGINE: readonly string[] = ENGINE_MARKS;

type MarkRecord = Answer["condition_mark_records"][number];
function unassessedRecord(node: string): MarkRecord {
  return {
    mark: "UNASSESSED-AT-REDUCED-WEIGHT", scope: "node", subject_ref: node, reason: REASON, lift_path: null,
    served_root_rule: null, call_site_key: null, planned_leg_count: null, terminal_transport_outcome: null,
    review_outcome: "cannot-assess", hidden_strength: null, hidden_score_threshold: null,
    hidden_score_threshold_source_ref: null, excluded_from_served_number: null, judged_basis_count: null,
    affected_node_ids: [node]
  };
}

const BASE = buildFairShapedAnswer();
const ENGINE_ANSWER = buildFairShapedAnswer({
  condition_marks: [...BASE.condition_marks, "UNASSESSED-AT-REDUCED-WEIGHT"],
  condition_mark_records: [...BASE.condition_mark_records, unassessedRecord(POINT_NODE), unassessedRecord(OTHER_POINT_NODE)]
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

function nodeDrawer(answer: Answer, marks: readonly string[]): HTMLElement {
  const v3 = { ...answer.nodes[0]!, condition_marks: marks as Answer["nodes"][number]["condition_marks"] };
  return parsed(renderToStaticMarkup(
    <NodeDetailDrawer
      node={debateDetailFromAnswer(answer).tree!.children[0]!}
      v3={v3}
      token={null}
      onClose={noop}
      onFocusRecommendationNode={() => false}
      canFocusRecommendationNode={() => false}
      onQueued={noop}
      onError={noop}
      onAuthRejected={noop}
      debateChromeCatalog={chromeEn}
      conditionRecords={answer.condition_mark_records}
    />
  ));
}

/** Every attribute value and the text of an element, so a code hidden in a title or data attribute is seen too. */
function textAndAttributes(element: Element): string {
  const parts: string[] = [element.textContent ?? ""];
  for (const each of [element, ...element.querySelectorAll("*")]) {
    for (const attribute of [...each.attributes]) parts.push(attribute.value);
  }
  return parts.join("\n");
}

/** The internals the record carries: the code, the weight, the node ids, the scope word, every raw engine mark. */
function expectNoInternals(text: string, where: string): void {
  for (const internal of [REASON, "UNASSESSED_AT_REDUCED_WEIGHT", "0.66", POINT_NODE, OTHER_POINT_NODE, ...ENGINE]) {
    expect(text, `${where}: ${internal}`).not.toContain(internal);
  }
}

describe("R2a W1 — engine 2's marks are label-only in both drawers", () => {
  it("the honesty drawer shows the reduced-weight mark's words once, and nothing of its record", () => {
    const label = words("debateChrome.condition.unassessedAtReducedWeight");
    expect(label).not.toMatch(/\d/);
    const drawer = honestyDrawer(ENGINE_ANSWER);
    const chip = [...drawer.querySelectorAll<HTMLElement>(".roleChip")].find((each) => each.textContent === label);
    expect(chip, "the mark's chip").toBeDefined();
    expect(chip!.hasAttribute("title")).toBe(false);
    const list = drawer.querySelector(`ul[aria-label="${miscEn["misc.answerHonesty.namedConditionMarks"]!}"]`);
    expect(list).not.toBeNull();
    const lines = [...list!.querySelectorAll<HTMLElement>("li.drawerFindingItem")];
    const engineLines = lines.filter((line) => (line.textContent ?? "").includes(label));
    // Two records, one line: the label alone (C-ONCE), with no digit anywhere in it.
    expect(engineLines).toHaveLength(1);
    expect(engineLines[0]!.textContent?.trim()).toBe(label);
    expect(textAndAttributes(engineLines[0]!)).not.toMatch(/\d/);
    expect(textAndAttributes(chip!)).not.toMatch(/\d/);
    expectNoInternals(textAndAttributes(drawer), "honesty drawer");
    // Every older record keeps its own line, and an older mark keeps its code tooltip.
    expect(lines).toHaveLength(BASE.condition_mark_records.length + 1);
    expect(drawer.querySelector('[title="OWED-CHECK-UNEXECUTED"]')).not.toBeNull();
  });

  it("the honesty drawer renders an older mark's records exactly as before", () => {
    const before = honestyDrawer(BASE);
    const after = honestyDrawer(ENGINE_ANSWER);
    const listOf = (drawer: HTMLElement) =>
      drawer.querySelector(`ul[aria-label="${miscEn["misc.answerHonesty.namedConditionMarks"]!}"]`)!;
    const oldLines = [...listOf(before).querySelectorAll("li.drawerFindingItem")].map((line) => line.outerHTML);
    const keptLines = [...listOf(after).querySelectorAll("li.drawerFindingItem")].map((line) => line.outerHTML);
    expect(keptLines.slice(0, oldLines.length)).toEqual(oldLines);
  });

  it.each(ENGINE.map((mark) => [mark]))("the node drawer shows %s without a code tooltip", (mark) => {
    const drawer = nodeDrawer(ENGINE_ANSWER, [mark, "SINGLE-LINEAGE"]);
    const pills = [...drawer.querySelectorAll<HTMLElement>("[data-condition-pill]")];
    expect(pills).toHaveLength(2);
    expect(pills[0]!.hasAttribute("title")).toBe(false);
    expectNoInternals(textAndAttributes(pills[0]!), `node drawer ${mark}`);
    // An older mark keeps today's tone and tooltip.
    expect(pills[1]!.getAttribute("data-mark")).toBe("dispute");
    expect(pills[1]!.getAttribute("title")).toBe("SINGLE-LINEAGE");
  });

  it("the node drawer shows the reduced-weight mark's words in the gold tone, no digit and no record internals", () => {
    const drawer = nodeDrawer(ENGINE_ANSWER, ["UNASSESSED-AT-REDUCED-WEIGHT"]);
    const pill = drawer.querySelector<HTMLElement>("[data-condition-pill]")!;
    expect(pill.textContent).toBe(words("debateChrome.condition.unassessedAtReducedWeight"));
    expect(pill.getAttribute("data-mark")).toBe("gold");
    expect(textAndAttributes(pill)).not.toMatch(/\d/);
    expectNoInternals(textAndAttributes(drawer), "node drawer");
  });
});
