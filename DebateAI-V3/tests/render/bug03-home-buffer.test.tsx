import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AnswerIndex } from "@debateai/contract";
import { DebatesBuffer } from "../../apps/v2-ui/components/DebatesBuffer.js";
import { debateSummariesFromIndex } from "../../apps/v2-ui/lib/v3/adapter.js";

const mixedIndex: AnswerIndex = {
  items: [{
    answer_id: "answer:served",
    run_ref: "run:served",
    answer_version: 1,
    question_line: "The served debate",
    verdict_state: "CONTESTED",
    abstention: null,
    serve_state: "COMPOSED",
    staleness_state: "FRESH",
    builds_on_previous: false,
    created_at_sequence: 20
  }],
  open_runs: [
    {
      run_ref: "run:generating",
      question_line: "The generating debate",
      state: "RUNNING",
      terminal_reason: null,
      created_at_sequence: 30
    },
    {
      run_ref: "run:failed",
      question_line: "The failed debate",
      state: "FAILED",
      terminal_reason: "TOTAL_REVIEW_COVERAGE_UNSATISFIED",
      created_at_sequence: 25
    },
    {
      run_ref: "run:served",
      question_line: "The served debate",
      state: "SETTLED",
      terminal_reason: null,
      created_at_sequence: 20
    }
  ],
  limit: 50,
  offset: 0,
  total: 3
};

describe("BUG-03 home debates buffer", () => {
  it("renders generating and failed runs as honest linked entries without duplicating a served run", () => {
    const debates = debateSummariesFromIndex(mixedIndex);
    const html = renderToStaticMarkup(<DebatesBuffer debates={debates} />);

    expect(debates.map((debate) => debate.id)).toEqual([
      "run:generating",
      "run:failed",
      "answer:served"
    ]);
    expect(html).toContain('href="/debate/run:generating"');
    expect(html).toContain("The generating debate");
    expect(html).toContain("Generating");
    expect(html).toContain('href="/debate/run:failed"');
    expect(html).toContain("Debate generation failed: TOTAL_REVIEW_COVERAGE_UNSATISFIED");
    expect(html.match(/The served debate/g)).toHaveLength(1);
    // MUT-BUG03-RENDER-GENERATING-AS-DONE: the status assertion turns RED.
    // MUT-BUG03-OMIT-GENERATING: the link/topic assertions turn RED.
    // MUT-BUG03-RENDER-FAILED-AS-GENERATING: the terminal-reason assertion turns RED.
    // MUT-BUG03-UI-SERVED-DUPLICATE: the single occurrence assertion turns RED.
  });
});
