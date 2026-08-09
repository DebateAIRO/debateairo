import { describe, expect, it } from "vitest";
import {
  LEDGER_ACTION_KINDS,
  TERMINAL_ROUTES,
  classifyLedgerActionKind,
  createLabeledNumber,
  exhaustive,
  type TerminalRoute
} from "@debateai/kernel";
import { ORGAN_STAGE_MAP } from "@debateai/kernel";

describe("FX-LG-04 — terminal-route partition law", () => {
  it("FX-LED-03 files an unknown executed action as UNCLASSIFIED_ACTION", () => {
    expect(LEDGER_ACTION_KINDS).toContain("JUDGEMENT_SCHEDULED");
    expect(classifyLedgerActionKind("provider-specific-check")).toBe("UNCLASSIFIED_ACTION");
  });

  it("transcribes the five ruled routes once, with membership and count", () => {
    expect(TERMINAL_ROUTES).toEqual([
      "INERT_STOP",
      "FALSE_PRESUPPOSITION_NON_ANSWER",
      "VALUE_TO_HUMAN",
      "NOT_EMPIRICALLY_DECIDABLE",
      "DEPTH_ZERO_NO_JUSTIFICATION_NO_SPLIT"
    ] satisfies readonly TerminalRoute[]);
    expect(TERMINAL_ROUTES).toHaveLength(5);
  });

  it("requires every wire number to carry its label, source, producer, provenance and replay handle", () => {
    const number = createLabeledNumber({
      value: 0.73,
      kind: "NODE_STRENGTH",
      source: "judge-artifact:test-only",
      producer: "propagation",
      provenanceRef: "propagation-run:test-only",
      replayHandle: "replay:test-only"
    });
    expect(number).toMatchObject({ kind: "NODE_STRENGTH", producer: "propagation" });
    expect(() => createLabeledNumber({
      value: Number.NaN,
      kind: "NODE_STRENGTH",
      source: "judge-artifact:test-only",
      producer: "propagation",
      provenanceRef: "propagation-run:test-only",
      replayHandle: "replay:test-only"
    })).toThrow("finite");
  });

  it("keeps an explicit exhaustive fall-through", () => {
    const render = (route: TerminalRoute): string => {
      switch (route) {
        case "INERT_STOP": return "inert";
        case "FALSE_PRESUPPOSITION_NON_ANSWER": return "false-presupposition";
        case "VALUE_TO_HUMAN": return "human";
        case "NOT_EMPIRICALLY_DECIDABLE": return "not-empirical";
        case "DEPTH_ZERO_NO_JUSTIFICATION_NO_SPLIT": return "depth-zero";
        default: return exhaustive(route);
      }
    };
    const rendered = render("INERT_STOP");
    expect(rendered).toBe("inert");
  });
});

describe("AC-17 — final organ-to-stage table", () => {
  it("keeps all six organ placements in the shared vocabulary", () => {
    expect(ORGAN_STAGE_MAP).toEqual({
      SCORER: ["WEIGH", "COMPOSE"],
      JUDGE_CONTRACT: ["WEIGH"],
      GRAPH_SHAPES: ["SPLIT_OBJECT", "SPLIT_SUBSTRATE"],
      SPAWN_PLUMBING: ["SPLIT_MECHANICS"],
      LEDGER: ["ALL_STAGES", "SERVE_READS"],
      SERVE: ["SERVE"]
    });
  });
});
