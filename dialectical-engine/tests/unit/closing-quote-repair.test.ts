// tests/unit/closing-quote-repair.test.ts
// Task 91j E1 (owner, 9 Nov, after the paid test): a DeepSeek judge in a Romanian debate ended one text with the
// typographic closing quote ” (U+201D) where the plain " belongs, and the reply was lost; swapping that one character made
// it parse. The decode's syntax pass now reads such a ” as the text's closing quote, and only there: right at a line end
// next to the `}` / `]` / `,` that follows the text, and only when the straight-quoted text cannot end where it would
// otherwise end. A ” inside a text that parses is never touched. Made-up texts only.
import { describe, expect, it } from "vitest";
import { decodeModelJson, decodedRepairsOf } from "@debateai/providers";

const STOP = { finishReason: "stop" } as const;
function decodedOk(text: string) {
  const decoded = decodeModelJson(text, STOP);
  if (!decoded.ok) throw new Error(`expected a decode: ${decoded.error}`);
  return decoded;
}

describe("E1: a typographic ” closing a straight-quoted text", () => {
  it("the last member's text, closed by ” before a line end and the object's }", () => {
    const reply = "{\n  \"verdict\": \"PASS\",\n  \"reason\": \"Autorul spune „da”, apoi tace”\n}";
    expect(() => JSON.parse(reply)).toThrow();
    const decoded = decodedOk(reply);
    expect(decoded.value).toEqual({ verdict: "PASS", reason: "Autorul spune „da”, apoi tace" });
    expect(decodedRepairsOf(decoded)).toEqual(["CLOSING_QUOTE_STRAIGHTENED"]);
  });

  it("a middle member's text, closed by ” right before its comma at a line end", () => {
    const reply = "{\n  \"summary\": \"Textul citează „raportul” din 2024”,\n  \"score\": 0.7,\n  \"flags\": [\"a\", \"b”\n  ]\n}";
    const decoded = decodedOk(reply);
    expect(decoded.value).toEqual({ summary: "Textul citează „raportul” din 2024", score: 0.7, flags: ["a", "b"] });
    expect(decodedRepairsOf(decoded)).toEqual(["CLOSING_QUOTE_STRAIGHTENED"]);
  });

  it("never touches a ” inside a text that parses, even when the pass repairs something else", () => {
    // Strict JSON: read as it is.
    expect(decodedOk("{\"a\": \"spune „da”\", \"b\": 1}")).toEqual({ ok: true, value: { a: "spune „da”", b: 1 }, repair: null });
    // The text holds ” at a line end before a comma, but it ends at its own straight quote: only the trailing comma is fixed.
    const decoded = decodedOk("{\"a\": \"primul „x”\n, apoi al doilea\", \"b\": 2,}");
    expect(decoded.value).toEqual({ a: "primul „x”\n, apoi al doilea", b: 2 });
    expect(decodedRepairsOf(decoded)).toEqual(["TRAILING_COMMA", "RAW_LINE_BREAK"]);
  });

  it("a ” that is not at a line end, a key, and a reply cut off at its limit are never repaired", () => {
    expect(decodeModelJson("{\"a\": [\"x”], \"b\": 1}", STOP).ok).toBe(false);
    expect(decodeModelJson("{\"a\": \"text”, \"b\": 1}", STOP).ok).toBe(false);
    // The reply's own end counts as a line end.
    expect(decodedOk("{\"a\": \"text”}").value).toEqual({ a: "text" });
    expect(decodeModelJson("{\"a”\n: \"x\"}", STOP).ok).toBe(false);
    expect(decodeModelJson("{\n  \"reason\": \"text”\n}", { finishReason: "length" }).ok).toBe(false);
  });
});
