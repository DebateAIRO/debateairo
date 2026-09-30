import { describe, expect, it } from "vitest";
import type { SynthesisDigest } from "@debateai/serve";
import {
  classifyComposedContent,
  classifyEvaluatorContent,
  parseComposerOutput,
  parseEvaluatorOutput
} from "../../apps/runner/src/index.js";

/**
 * FIX-HS1-eval-fence (hate-speech TEST rehearsal, 2026-09-30). Live runs
 * a26ff627 and d10d34d4 FAILED `EVALUATOR_CONTRACT_ERROR`: the claude-cli
 * evaluator answered a schema-valid verdict inside a ```json fence and the
 * runner read it with a strict `JSON.parse`, so every attempt was recorded
 * `PARSE_FAILED`. The judge and panel paths already read replies with
 * `parseStructuredArtifact` (raw, then one fence, then the first balanced
 * object). The CLASS: every place the runner turns a model reply into a
 * structured value — the evaluator's parser and classifier, the composer's
 * parser and classifier (and the classifier's own re-read of the draft) —
 * reads a reply the way the judge path does, and a call's classifier and
 * parser accept exactly the same replies.
 */

const VERDICT = {
  satisfied: true,
  objection: null,
  criteria: {
    fairness_to_losers: true,
    statement_label_agreement: true,
    no_overstatement: true,
    restatement: true,
    citation_tracing: true
  }
};

const NODE = "3f2a9c1e-7b4d-4e8f-9a01-5c6d7e8f9a0b";
const LEAKED_NODE = "11111111-2222-4333-8444-555555555555";

/** A digest the runner's citation check can read: refs are the node ids themselves (rungs 0-5). */
const citation = {
  digest: {
    nodes: [{ nodeId: NODE }],
    emphasis: {},
    compressionLevel: 0,
    summaryCharacterCap: null,
    byteSize: 0
  } as unknown as SynthesisDigest,
  servedNodes: [{ nodeId: NODE }],
  exemptTokens: new Set<string>()
};

const composition = (text: string) => JSON.stringify({
  segments: [{ segment_id: "segment:verdict", text, node_refs: ["primary", NODE], served_number_refs: [] }]
});

/** The shape the live evaluator produced (run a26ff627's stored error names "```json {"). */
const fenced = (body: string, tag = "json") => `\`\`\`${tag}\n${body}\n\`\`\``;

function strictParseMessage(content: string): string {
  try {
    JSON.parse(content);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("fixture is valid JSON");
}

function refusalCodeOf(read: () => unknown): string | null {
  try {
    read();
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? `untyped:${String(error)}`;
  }
}

describe("FIX-HS1-eval-fence — the evaluator reads a fenced verdict the way the judge path does", () => {
  it("accepts the live shape: one ```json fence around a schema-valid verdict", () => {
    const reply = fenced(JSON.stringify(VERDICT, null, 2));
    expect(classifyEvaluatorContent(reply)).toEqual({ parseStatus: "PARSED", parseError: null });
    expect(parseEvaluatorOutput(reply)).toEqual(VERDICT);
  });

  it("accepts an untagged fence, an upper-case tag and blanks around the fence", () => {
    for (const reply of [
      fenced(JSON.stringify(VERDICT), ""),
      fenced(JSON.stringify(VERDICT), "JSON"),
      `\n  ${fenced(JSON.stringify(VERDICT))}  \n`
    ]) {
      expect(classifyEvaluatorContent(reply), reply).toEqual({ parseStatus: "PARSED", parseError: null });
      expect(parseEvaluatorOutput(reply), reply).toEqual(VERDICT);
    }
  });

  it("accepts a verdict with prose around it, as the judge path's balanced-object reading does", () => {
    const reply = `Here is my verdict:\n${JSON.stringify(VERDICT)}\nThat is all.`;
    expect(classifyEvaluatorContent(reply)).toEqual({ parseStatus: "PARSED", parseError: null });
    expect(parseEvaluatorOutput(reply)).toEqual(VERDICT);
  });

  it("still refuses a fenced verdict the schema refuses, with the same code", () => {
    const reply = fenced(JSON.stringify({ ...VERDICT, objection: "a satisfied verdict with an objection" }));
    expect(classifyEvaluatorContent(reply).parseStatus).toBe("SCHEMA_FAILED");
    expect(refusalCodeOf(() => parseEvaluatorOutput(reply))).toBe("EVALUATOR_CONTRACT_ERROR");
  });

  it("still refuses a reply that is no JSON at all, with the same status, code and message as before", () => {
    const reply = "I think the candidate is fair.";
    expect(classifyEvaluatorContent(reply)).toEqual({ parseStatus: "PARSE_FAILED", parseError: strictParseMessage(reply) });
    expect(refusalCodeOf(() => parseEvaluatorOutput(reply))).toBe("EVALUATOR_CONTRACT_ERROR");
  });

  it("keeps a raw verdict exactly as it was", () => {
    expect(classifyEvaluatorContent(JSON.stringify(VERDICT))).toEqual({ parseStatus: "PARSED", parseError: null });
    expect(parseEvaluatorOutput(JSON.stringify(VERDICT))).toEqual(VERDICT);
  });
});

describe("FIX-HS1-eval-fence — the composer reads a fenced draft the way the judge path does", () => {
  it("parses a fenced composition", () => {
    const reply = fenced(composition("The answer holds."));
    expect(parseComposerOutput(reply).segments[0]?.text).toBe("The answer holds.");
  });

  it("classifies a fenced clean draft PARSED (the classifier's own re-read of the draft included)", () => {
    expect(classifyComposedContent(fenced(composition("The answer holds.")), citation))
      .toEqual({ parseStatus: "PARSED", parseError: null });
  });

  it("still runs the citation check on a fenced draft: a node id in the prose is re-asked, not thrown", () => {
    const classified = classifyComposedContent(fenced(composition(`The answer rests on ${LEAKED_NODE}.`)), citation);
    expect(classified.parseStatus).toBe("SCHEMA_FAILED");
    expect(JSON.parse(classified.parseError ?? "null")).toEqual([
      { path: ["segments", 0, "text"], message: "COMPOSED_TEXT_NAMES_A_NODE" }
    ]);
  });

  it("still refuses a fenced composition the schema refuses, with the same code", () => {
    const reply = fenced(JSON.stringify({ segments: [] }));
    expect(classifyComposedContent(reply, citation).parseStatus).toBe("SCHEMA_FAILED");
    expect(refusalCodeOf(() => parseComposerOutput(reply))).toBe("COMPOSITION_CONTRACT_ERROR");
  });

  it("still refuses a reply that is no JSON at all, with the same status, code and message as before", () => {
    const reply = "{not json";
    expect(classifyComposedContent(reply, citation)).toEqual({ parseStatus: "PARSE_FAILED", parseError: strictParseMessage(reply) });
    expect(refusalCodeOf(() => parseComposerOutput(reply))).toBe("COMPOSITION_CONTRACT_ERROR");
  });
});

describe("FIX-HS1-eval-fence — one call's classifier and parser accept exactly the same replies", () => {
  const corpus = (body: string): readonly string[] => [
    body,
    fenced(body),
    fenced(body, ""),
    `Here is the verdict:\n${body}\nDone.`,
    `${fenced(body)}\n${fenced(body)}`,
    fenced(`${body} trailing`),
    "",
    "[]",
    "null",
    "```json\n```"
  ];

  it("the evaluator: PARSED exactly when the parser returns", () => {
    for (const body of [JSON.stringify(VERDICT), JSON.stringify({ ...VERDICT, satisfied: "yes" })]) {
      for (const reply of corpus(body)) {
        const classified = classifyEvaluatorContent(reply).parseStatus === "PARSED";
        const parsed = refusalCodeOf(() => parseEvaluatorOutput(reply)) === null;
        expect(parsed, JSON.stringify(reply)).toBe(classified);
      }
    }
  });

  it("the composer: whatever the classifier accepts the parser accepts, and whatever the parser refuses the classifier refuses", () => {
    for (const body of [composition("The answer holds."), JSON.stringify({ segments: [] })]) {
      for (const reply of corpus(body)) {
        const classified = classifyComposedContent(reply, citation).parseStatus === "PARSED";
        const parsed = refusalCodeOf(() => parseComposerOutput(reply)) === null;
        if (classified) expect(parsed, JSON.stringify(reply)).toBe(true);
        if (!parsed) expect(classified, JSON.stringify(reply)).toBe(false);
      }
    }
  });
});
