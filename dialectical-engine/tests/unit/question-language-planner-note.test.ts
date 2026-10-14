import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONDITION_MARKS, DEBATE_SHAPE_MARKS } from "@debateai/kernel";
import { MAP_MARKS, MAP_NOTES } from "@debateai/map";
import { mapConditionRecords } from "../../apps/runner/src/map-stage.js";

const RECORD = "LANGUAGE_PLANNER_DISAGREES" as const;
const LOCALES = readdirSync(new URL("../../apps/ui/messages/", import.meta.url), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);

describe("the planner-disagreement record is operator-only (question-language spec 2026-10-13, L7; ruling CR-3)", () => {
  it("is a map note, never a condition mark, a shape mark or a map mark; the kernel's list keeps P2b's 46", () => {
    expect(MAP_NOTES).toContain(RECORD);
    expect(CONDITION_MARKS as readonly string[]).not.toContain(RECORD);
    expect(DEBATE_SHAPE_MARKS as readonly string[]).not.toContain(RECORD);
    expect(MAP_MARKS as readonly string[]).not.toContain(RECORD);
    expect(CONDITION_MARKS).toHaveLength(46);
  });

  it("never becomes a condition record on the answer", () => {
    const records = mapConditionRecords({ marks: [], notes: [{ note: RECORD, step: "ANGLES", detail: "ro:fr" }] } as never, "run-1", "node-0");
    expect(records).toEqual([]);
  });

  it("has no label and no text in any locale (nothing to show)", () => {
    expect(LOCALES.length).toBeGreaterThan(0);
    for (const locale of LOCALES) {
      const text = readFileSync(new URL(`../../apps/ui/messages/${locale}/debateChrome.json`, import.meta.url), "utf8");
      expect(text, locale).not.toMatch(/languagePlannerDisagrees|LANGUAGE_PLANNER_DISAGREES/u);
    }
  });
});
