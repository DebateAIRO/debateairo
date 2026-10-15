import { describe, expect, it } from "vitest";
import {
  MODEL_JSON_STRUCTURE_REPAIRS, REPLY_FAILURE_CLASSES, contentRepairsOf, decodeModelJson, decodedRepairsOf, parsedWithRepairs,
  rememberingAcceptedReply, type ContentClassification, type ModelJsonRepair
} from "@debateai/providers";

const STOP = { finishReason: "stop" } as const;

describe("LG-A: repairs travel as a list (INTERFACE §2.1, §2.2)", () => {
  it("lists the structure repairs and the failure classes in their fixed order", () => {
    expect(MODEL_JSON_STRUCTURE_REPAIRS).toEqual(["INNER_UNASKED_KEYS", "MEMBER_UNNESTED", "MEMBER_WRAPPED",
      "TEXT_FORM_CONVERTED", "PARAGRAPHS_JOINED", "ONLY_VALUE_FILLED"]);
    expect(REPLY_FAILURE_CLASSES).toEqual(["STRUCTURE", "CONTENT", "CUT_OFF", "EMPTY"]);
    // The widened union admits every new kind (a compile-time check that also runs).
    const kinds: readonly ModelJsonRepair[] = ["TRAILING_COMMA", "RAW_LINE_BREAK", "MODEL_TOKEN_DROPPED", "KEY_COLON_MOVED",
      "BRACKET_INSERTED", "INNER_UNASKED_KEYS", "MEMBER_UNNESTED", "MAP_IDS_NORMALISED", "MAP_TEXT_TRIMMED", "UNASKED_KEYS"];
    expect(kinds).toHaveLength(10);
  });

  it("a PARSED classification carries no repair with none, jsonRepair alone with one, and the list with two or more", () => {
    expect(parsedWithRepairs([])).toEqual({ parseStatus: "PARSED", parseError: null });
    expect(parsedWithRepairs(["CODE_FENCE"])).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "CODE_FENCE" });
    expect(parsedWithRepairs(["CODE_FENCE", "INNER_UNASKED_KEYS", "CODE_FENCE"])).toEqual({ parseStatus: "PARSED", parseError: null,
      jsonRepair: "CODE_FENCE", jsonRepairs: ["CODE_FENCE", "INNER_UNASKED_KEYS"] });
    // The map names its first salvage repair, as today.
    expect(parsedWithRepairs(["CODE_FENCE", "MAP_LEANS_DEFAULTED"], "MAP_LEANS_DEFAULTED")).toEqual({ parseStatus: "PARSED",
      parseError: null, jsonRepair: "MAP_LEANS_DEFAULTED", jsonRepairs: ["CODE_FENCE", "MAP_LEANS_DEFAULTED"] });
  });

  it("contentRepairsOf reads all three forms, and a refusal as none", () => {
    expect(contentRepairsOf({ parseStatus: "PARSED", parseError: null })).toEqual([]);
    expect(contentRepairsOf({ parseStatus: "PARSED", parseError: null, jsonRepair: "INNER_QUOTE" })).toEqual(["INNER_QUOTE"]);
    expect(contentRepairsOf(parsedWithRepairs(["INNER_QUOTE", "MEMBER_WRAPPED"]))).toEqual(["INNER_QUOTE", "MEMBER_WRAPPED"]);
    const refused: ContentClassification = { parseStatus: "SCHEMA_FAILED", parseError: "x", failureClass: "STRUCTURE" };
    expect(contentRepairsOf(refused)).toEqual([]);
  });

  it("decodedRepairsOf: a strict reply needs none, a fenced one needs one", () => {
    const strict = decodeModelJson("{\"a\":1}", STOP);
    const fenced = decodeModelJson("```json\n{\"a\":1}\n```", STOP);
    if (!strict.ok || !fenced.ok) throw new Error("both decode");
    expect(decodedRepairsOf(strict)).toEqual([]);
    expect(decodedRepairsOf(fenced)).toEqual(["CODE_FENCE"]);
    expect(fenced).toEqual({ ok: true, value: { a: 1 }, repair: "CODE_FENCE" });
  });

  it("rememberingAcceptedReply hands back every repair of the accepted reply", () => {
    const reading = rememberingAcceptedReply(() => parsedWithRepairs(["CODE_FENCE", "INNER_UNASKED_KEYS"]));
    reading.classifyContent("x", STOP);
    expect(reading.acceptedAs("x")).toEqual({ reply: STOP, repair: "CODE_FENCE", repairs: ["CODE_FENCE", "INNER_UNASKED_KEYS"] });
    expect(reading.acceptedAs("other")).toEqual({ reply: undefined, repair: null, repairs: [] });
  });
});
