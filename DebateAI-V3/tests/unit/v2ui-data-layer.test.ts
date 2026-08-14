import { describe, expect, it, vi } from "vitest";
import { CONDITION_MARKS } from "@debateai/kernel";
import { ContractHttpError, type ContractClient, type Deployment, type Session } from "@debateai/contract";
import {
  buildFairShapedAnswer,
  buildSameModelDifferentMakerAnswer
} from "../support/v2uiFixtures.js";
import { makerIdentityLabel } from "../../apps/v2-ui/lib/makerIdentity.js";
import { classifyTokenUnlockFailure, tokenUnlockFailureMessage } from "../../apps/v2-ui/lib/v3/tokenUnlock.js";
import {
  createBrowserContractClient,
  createSameOriginFetch,
  createDebate,
  getDebateBundle,
  getDebateScoring,
  getDebateAdaptiveDepthDryRun,
  approveDebateAdaptiveDepthExpansion,
  submitScoringFeedback,
  regenerateNode,
  nodeGenerations,
  backendStatus,
  getSettingsView,
  getRunCostEnvelope,
  saveSettings
} from "../../apps/v2-ui/lib/api.js";
import {
  SCORING_ABSENCE_REASON,
  V3_SCORING_STATUS_LABEL,
  contractNodesById,
  debateDetailFromAnswer,
  debateDetailFromRunProjection,
  debateStatusFromTerminal,
  debateSummariesFromIndex,
  modelLedgerIdentityKey,
  scoringUnavailable,
  unrepresentedEdges,
  v3NodeScoreState,
  v3NodeScoreDetails,
  v3ScorePercentage,
  v3ScoreAbsenceCopy,
  v3ScorePresentation,
  v3ScoringStatusLabel,
  wayOfKnowingLabel,
  runCostEnvelopeFromDeployment
} from "../../apps/v2-ui/lib/v3/adapter.js";
import { abstentionKindLabel, conditionMarkLabel, riskTierSourceLabel } from "../../apps/v2-ui/lib/v3/labels.js";
import { getDebateServer } from "../../apps/v2-ui/lib/serverApi.js";
import { statusLabel } from "../../apps/v2-ui/lib/format.js";
import {
  selectRunCostEnvelopeMember,
  selectRunCostEnvelopeMembers
} from "../../apps/v2-ui/lib/runCostEnvelopeSelection.js";

const sessionFixture: Session = {
  asker_id: "asker:test",
  session_id: "session:test",
  caller_scope: "ASKER",
  ownership_provenance: "user_dev_token",
  provisional_identity_model: true
};

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

describe("v2-ui same-origin browser client (rev-3 advisories A1/A4 closed)", () => {
  it("rewrites contract URLs onto the same-origin /api path with the token attached", async () => {
    const calls: Array<{ input: string; init: RequestInit | undefined }> = [];
    const fetchSpy = (async (input: unknown, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      return jsonResponse(sessionFixture);
    }) as typeof fetch;
    const client = createBrowserContractClient(fetchSpy);
    await client.readSession("token:test");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.input).toBe("/api/v1/session");
    expect(new Headers(calls[0]!.init?.headers).get("x-user-dev-token")).toBe("token:test");
  });

  it.each([
    "http://evil.test",
    "https://evil.test/api",
    "//evil.test",
    "/\\evil.test",
    "\\\\evil.test",
    "/api\\evil.test",
    "/api/../escape",
    "",
    "   "
  ])("loudly rejects the cross-origin-capable base %j", (base) => {
    expect(() => createBrowserContractClient(fetch, base)).toThrow(
      /NEXT_PUBLIC_API_BASE_MUST_BE_SAME_ORIGIN_PATH/
    );
  });

  it("refuses Request inputs instead of silently dropping method, headers, and body", async () => {
    const sameOriginFetch = createSameOriginFetch("/api", (async () => jsonResponse({})) as typeof fetch);
    await expect(
      sameOriginFetch(new Request("http://localhost/v1/asks", { method: "POST", body: "{}" }))
    ).rejects.toThrow(/PROXY_FETCH_REQUEST_INPUT_UNSUPPORTED/);
  });
});

describe("v2-ui adapter: V3 answers project onto V2 view models (AC-59, DR-115)", () => {
  it("projects the FAIR-shaped answer into V2's tree with the attack edge as a CON child", () => {
    const answer = buildFairShapedAnswer();
    const detail = debateDetailFromAnswer(answer);

    expect(detail.id).toBe("answer:fair-test");
    expect(detail.topic).toBe("Should the test question stand?");
    expect(detail.status).toBe("complete");
    expect(detail.node_count).toBe(2);

    const root = detail.tree;
    expect(root).not.toBeNull();
    expect(root!.node_type).toBe("ROOT_CLAIM");
    expect(root!.claim).toBe("Should the test question stand?");
    expect(root!.children).toHaveLength(1);

    const position = root!.children[0]!;
    expect(position.id).toBe("node:position");
    expect(position.node_type).toBe("CLAIM");
    expect(position.label).toBe("Reasoning");
    expect(position.claim).toBe("The position claim under test.");
    expect(position.children).toHaveLength(1);

    const defeater = position.children[0]!;
    expect(defeater.id).toBe("node:defeater");
    expect(defeater.node_type).toBe("CON");
    expect(defeater.parent_id).toBe("node:position");
    expect(defeater.claim).toBe("The defeater claim attacking the position.");
  });

  it("projects a real support edge as a PRO child without relabelling the neutral position", () => {
    const base = buildFairShapedAnswer();
    const defender = {
      ...base.nodes[1]!,
      node_id: "node:defender",
      claim: "The defender claim supporting the position.",
      provenance_ref: "prov:node:defender",
      condition_marks: []
    };
    const answer = buildFairShapedAnswer({
      nodes: [...base.nodes, defender],
      edges: [...base.edges, {
        ...base.edges[0]!,
        edge_id: "edge:support:1",
        from_node_ref: defender.node_id,
        relation: "support",
        provenance_ref: "prov:edge:support:1"
      }]
    });

    const position = debateDetailFromAnswer(answer).tree!.children[0]!;
    expect(position.node_type).toBe("CLAIM");
    expect(position.children.map((child) => [child.claim, child.node_type])).toEqual([
      ["The defeater claim attacking the position.", "CON"],
      ["The defender claim supporting the position.", "PRO"]
    ]);
  });

  it("projects only recorded maker model ids and preserves typed absence (DR-115)", () => {
    const detail = debateDetailFromAnswer(buildFairShapedAnswer());
    expect(detail.created_at).toBe("");
    expect(detail.completed_at).toBeNull();
    expect(detail.lean).toBeNull();
    expect(detail.verdict).toBeUndefined();
    expect(detail.models).toEqual([]);
    expect(detail.analyzer_runs).toEqual([]);
    expect(detail.agent_runs).toEqual([]);
    expect(detail.tree!.active_generation).toBeNull();
    const position = detail.tree!.children[0]!;
    const defeater = position.children[0]!;
    expect(position.active_generation).toEqual({ model_id: "gpt-5", maker: "OpenAI" });
    expect(position.maker).toBe("OpenAI");
    expect(position.active_generation_id).toBeNull();
    expect(defeater.active_generation).toBeNull();
    expect(defeater.maker).toBeNull();
  });

  it("keeps two houses visible when they report the same model id (UI-02c B1)", () => {
    const answer = buildSameModelDifferentMakerAnswer();
    const lineages = answer.nodes.map((node) => node.maker_lineage!);
    expect(new Set(lineages.map((lineage) => lineage.model_id))).toEqual(new Set(["test-layer/model"]));

    const labels = lineages.map((lineage) => makerIdentityLabel({
      maker: lineage.maker,
      modelId: lineage.model_id
    }));
    expect(labels[0]!.text).toContain("OpenAI");
    expect(labels[1]!.text).toContain("Anthropic");
    expect(labels[0]!.text).not.toBe(labels[1]!.text);
    expect(labels.every((label) => !label.absence)).toBe(true);
  });

  it("labels a missing recorded house as typed absence", () => {
    expect(makerIdentityLabel({ maker: null, modelId: null })).toEqual({
      text: "House unavailable",
      absence: true
    });
  });

  it("maps every terminal outcome onto an honest V2 status", () => {
    expect(debateStatusFromTerminal("SERVED")).toBe("complete");
    expect(debateStatusFromTerminal("DOWNGRADED")).toBe("complete");
    expect(debateStatusFromTerminal("COMPONENTS_ONLY")).toBe("complete");
    expect(debateStatusFromTerminal("BLOCKED")).toBe("failed");
  });

  it("keeps edges the tree cannot represent visible as unrepresented edges", () => {
    const answer = buildFairShapedAnswer({
      edges: [
        ...buildFairShapedAnswer().edges,
        {
          edge_id: "edge:meta",
          from_node_ref: "node:defeater",
          target_kind: "EDGE",
          target_ref: "edge:attack:1",
          relation: "attack",
          strength: { status: "UNKNOWN", reason: "NO_JUDGEMENT_OR_MAGNITUDE" },
          provenance_ref: "prov:edge:meta",
          placeholder: false
        }
      ]
    });
    const leftover = unrepresentedEdges(answer);
    expect(leftover).toHaveLength(1);
    expect(leftover[0]!.edge_id).toBe("edge:meta");
  });

  it("projects the answer index onto V2 debate summaries", () => {
    const summaries = debateSummariesFromIndex({
      items: [
        {
          answer_id: "answer:fair-test",
          run_ref: "run:fair-test",
          answer_version: 1,
          question_line: "Should the test question stand?",
          verdict_state: "CONTESTED",
          abstention: null,
          serve_state: "COMPOSED",
          staleness_state: "FRESH",
          builds_on_previous: false,
          created_at_sequence: 1
        }
      ],
      open_runs: [],
      limit: 50,
      offset: 0,
      total: 1
    });
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toEqual({
      id: "answer:fair-test",
      topic: "Should the test question stand?",
      status: "complete",
      created_at: "",
      completed_at: null,
      models: [],
      created_at_sequence: 1,
      terminal_reason: null
    });
  });

  it("labels ways of knowing without inventing lens names", () => {
    expect(wayOfKnowingLabel("REASONING")).toBe("Reasoning");
    expect(wayOfKnowingLabel("LOOKED_UP")).toBe("Looked up");
    expect(wayOfKnowingLabel("RAN")).toBe("Ran");
  });
});

describe("UI-02a: V3's per-node numbers reach V2's cards (DR-149(3), DR-115, AC-76)", () => {
  const answer = buildFairShapedAnswer();
  const nodesById = contractNodesById(answer);
  const card = (id: string, nodeType = "CLAIM") => ({ id, node_type: nodeType });

  it("carries both recorded numbers from the contract node onto the card", () => {
    const state = v3NodeScoreState(card("node:position"), nodesById);
    expect(state.status).toBe("PRESENT");
    if (state.status !== "PRESENT") return;
    expect(state.base_score).toEqual(answer.nodes[0]!.base_score);
    expect(state.final_strength).toEqual(answer.nodes[0]!.final_strength);
  });

  it("restates probabilities as percentages without leaking floating-point noise (DR-154(4))", () => {
    const scored = buildFairShapedAnswer({
      nodes: answer.nodes.map((node, index) =>
        index === 0
          ? { ...node, base_score: { ...node.base_score, value: 0.41000000000000003 } }
          : node
      )
    });
    const presentation = v3ScorePresentation(
      v3NodeScoreState(card("node:position"), contractNodesById(scored))
    );
    expect(presentation.status).toBe("PRESENT");
    if (presentation.status !== "PRESENT") return;
    expect(presentation.badges[0]!.pillText).toBe("BASE ≈41%");
    expect(presentation.badges[0]!.pillText).not.toContain("0.41000000000000003");
    expect(presentation.badges[0]!.title).toContain("rounded to the nearest 0.01 percentage point");
    expect(presentation.badges[0]!.title).toContain("recorded probability 0.41000000000000003");
  });

  it("marks rounded percentages as approximate and keeps close distinctions in the detail", () => {
    expect(v3ScorePercentage(0.98)).toEqual({
      text: "98%",
      detail: "98% (exact percentage restatement)"
    });

    const first = v3ScorePercentage(0.410001);
    const second = v3ScorePercentage(0.410002);
    expect(first.text).toBe("≈41%");
    expect(second.text).toBe("≈41%");
    expect(first.detail).toContain("recorded probability 0.410001");
    expect(second.detail).toContain("recorded probability 0.410002");
    expect(first.detail).not.toBe(second.detail);
  });

  it("carries each number's label and provenance with it, never a bare float", () => {
    const presentation = v3ScorePresentation(v3NodeScoreState(card("node:position"), nodesById));
    expect(presentation.status).toBe("PRESENT");
    if (presentation.status !== "PRESENT") return;
    const [base, final] = presentation.badges;
    expect(base!.id).toBe("base_score");
    expect(final!.id).toBe("final_strength");
    expect(base!.pillText).toBe("BASE 62%");
    expect(final!.pillText).toBe("FINAL 41%");
    for (const badge of presentation.badges) {
      const number = badge.id === "base_score" ? answer.nodes[0]!.base_score : answer.nodes[0]!.final_strength;
      expect(number).not.toBeNull();
      if (number === null) throw new Error("test fixture must include final strength");
      expect(badge.title).toContain(number.kind);
      expect(badge.title).toContain(number.producer);
      expect(badge.title).toContain(number.source);
      expect(badge.title).toContain(number.replay_handle);
      expect(badge.title).toContain(v3ScorePercentage(number.value).text);
    }
  });

  it("projects the drawer's visible values through the executable percentage rule", () => {
    const scored = buildFairShapedAnswer({
      nodes: answer.nodes.map((node, index) =>
        index === 0
          ? { ...node, base_score: { ...node.base_score, value: 0.41000000000000003 } }
          : node
      )
    });
    const node = scored.nodes[0]!;
    expect(node.final_strength).not.toBeNull();
    if (node.final_strength === null) throw new Error("test fixture must include final strength");
    expect(v3NodeScoreDetails(node)).toEqual([
      {
        id: "base_score",
        label: `base score (${node.base_score.kind})`,
        percentage: v3ScorePercentage(node.base_score.value),
        producer: node.base_score.producer,
        source: node.base_score.source,
        replay_handle: node.base_score.replay_handle
      },
      {
        id: "final_strength",
        label: `final strength (${node.final_strength.kind})`,
        percentage: v3ScorePercentage(node.final_strength.value),
        producer: node.final_strength.producer,
        source: node.final_strength.source,
        replay_handle: node.final_strength.replay_handle
      }
    ]);
    expect(v3NodeScoreDetails(node)[0]!.percentage.text).toBe("≈41%");
  });

  it("shows typed absence for every card that genuinely has no recorded number", () => {
    // The question card is not a graph node; the served answer synthesises it.
    expect(v3NodeScoreState(card(answer.answer_id, "ROOT_CLAIM"), nodesById)).toEqual({
      status: "ABSENT",
      reason: "QUESTION_CARD_IS_NOT_A_NODE"
    });
    // The live view has no served answer yet.
    expect(v3NodeScoreState(card("node:position"), null)).toEqual({
      status: "ABSENT",
      reason: "NO_SERVED_ANSWER"
    });
    // A card the served graph does not carry.
    expect(v3NodeScoreState(card("node:not-in-answer"), nodesById)).toEqual({
      status: "ABSENT",
      reason: "NODE_ABSENT_FROM_SERVED_ANSWER"
    });
  });

  it("never renders 0, a dash or any placeholder digit for an absent number (DR-115)", () => {
    for (const state of [
      v3NodeScoreState(card(answer.answer_id, "ROOT_CLAIM"), nodesById),
      v3NodeScoreState(card("node:position"), null),
      v3NodeScoreState(card("node:not-in-answer"), nodesById)
    ]) {
      const presentation = v3ScorePresentation(state);
      expect(presentation.status).toBe("ABSENT");
      if (presentation.status !== "ABSENT") continue;
      expect(presentation.badge.pillText).toMatch(/^NO SCORE/);
      expect(presentation.badge.pillText).not.toMatch(/[0-9—-]/);
      expect(presentation.badge.title.trim().length).toBeGreaterThan(0);
      // The three reasons say three different things — an absent number is
      // never collapsed into one anonymous "no data".
      expect(presentation.badge.title).toMatch(/\.$/);
    }
    const titles = new Set(
      (["QUESTION_CARD_IS_NOT_A_NODE", "NO_SERVED_ANSWER", "NODE_ABSENT_FROM_SERVED_ANSWER"] as const).map(
        (reason) => v3ScoreAbsenceCopy(reason).title
      )
    );
    expect(titles.size).toBe(3);
  });
});

describe("v2-ui honesty labels cover the full closed vocabulary", () => {
  it("renders every tier supplier in plain words", () => {
    expect(riskTierSourceLabel("ASKER")).toBe("chosen by the asker");
    expect(riskTierSourceLabel("MACHINE_DEFAULT")).toBe("machine default from the deployment floor");
    expect(riskTierSourceLabel("DEPLOYMENT_POLICY")).toBe("raised by deployment policy");
  });

  it("names all condition marks, including DR-139(4) and DR-141(2)", () => {
    const labels = CONDITION_MARKS.map((mark) => conditionMarkLabel(mark));
    expect(new Set(labels).size).toBe(CONDITION_MARKS.length);
    for (const label of labels) expect(label.trim().length).toBeGreaterThan(0);
    expect(conditionMarkLabel("OWED-CHECK-UNEXECUTED")).toBe("Owed check not executed at completion");
    expect(conditionMarkLabel("UNRESOLVED-TYPE-FALLBACK")).toBe("Question type unresolved; fallback served");
  });

  it("names every abstention kind", () => {
    expect(abstentionKindLabel("not searched")).toBe("Not searched");
    expect(abstentionKindLabel("searched and found nothing")).toBe("Searched and found nothing");
    expect(abstentionKindLabel("measured and inconclusive")).toBe("Measured, but inconclusive");
    expect(abstentionKindLabel("not runnable")).toBe("Not runnable");
    expect(abstentionKindLabel("a value choice")).toBe("A value choice");
  });
});

describe("v2-ui data access over the V3 contract client", () => {
  it("lets an available answer win over a lagging RUNNING projection after a terminal signal", async () => {
    const answer = buildFairShapedAnswer();
    const client = {
      readRun: async () => ({
        run_ref: "run:fair-test",
        question_line: answer.question_line,
        state: "RUNNING" as const,
        terminal_reason: null
      }),
      readRunAnswer: async () => answer
    } as unknown as ContractClient;

    await expect(getDebateBundle("run:fair-test", "token:test", client, { answerExpected: true }))
      .resolves.toMatchObject({ kind: "served", answer: { answer_id: "answer:fair-test" } });
    // MUT-BUG02-RUNNING-ANSWER-200: trust only the lagging projection -> RED.
  });

  it("keeps an already-held answer authoritative over a lagging projection", async () => {
    const answer = buildFairShapedAnswer();
    const readRun = vi.fn().mockResolvedValue({
      run_ref: "run:fair-test",
      question_line: answer.question_line,
      state: "RUNNING",
      terminal_reason: null,
      hold_until: null
    });
    const client = { readRun } as unknown as ContractClient;
    await expect(getDebateBundle("run:fair-test", "token:test", client, { currentAnswer: answer }))
      .resolves.toMatchObject({ kind: "served", answer: { answer_id: "answer:fair-test" } });
    expect(readRun).toHaveBeenCalledTimes(1);
    // MUT-BUG02-SSR-ANSWER-DOWNGRADE: let a loading projection erase the held answer -> RED.
  });

  it("returns a typed client failure instead of an eternal loading bundle", async () => {
    const client = {
      readRun: async () => ({
        run_ref: "run:failed",
        question_line: "A failed run",
        state: "FAILED" as const,
        terminal_reason: "NODE_REVIEW_UNAVAILABLE"
      })
    } as unknown as ContractClient;
    await expect(getDebateBundle("run:failed", "token:test", client)).resolves.toMatchObject({
      kind: "failed",
      run: { terminal_reason: "NODE_REVIEW_UNAVAILABLE" }
    });
    // MUT-BUG02-B4-DELETE-CLIENT-FAILED: delete the FAILED arm -> RED.
  });

  it.each(["CLAIMED", "RUNNING"] as const)("reads an in-flight %s run first without probing either answer endpoint", async (state) => {
    const calls: string[] = [];
    const client = {
      readRun: async () => {
        calls.push("run");
        return {
          run_ref: "run:in-flight",
          question_line: "How does someone efficiently lose weight?",
          state,
          terminal_reason: null
        };
      },
      readAnswer: async () => {
        calls.push("answer");
        throw new ContractHttpError("NOT_FOUND", 404, "ANSWER_NOT_FOUND");
      },
      readRunAnswer: async () => {
        calls.push("run-answer");
        throw new ContractHttpError("NOT_FOUND", 404, "ANSWER_NOT_SERVED");
      }
    } as unknown as ContractClient;

    const bundle = await getDebateBundle("run:in-flight", "token:test", client);
    expect(bundle).toMatchObject({ kind: "loading", answer: null });
    expect(bundle.detail).toMatchObject({ status: "generating", run_state: "RUNNING" });
    expect(calls).toEqual(["run"]); // MUT-BUG02-RUN-FIRST: restore the repeated answer-404 probe pair -> RED.
  });

  it("flips a settled run to its served answer without a manual refresh", async () => {
    const answer = buildFairShapedAnswer();
    const calls: string[] = [];
    const client = {
      readRun: async () => {
        calls.push("run");
        return {
          run_ref: "run:fair-test",
          question_line: "Should the test question stand?",
          state: "SETTLED" as const,
          terminal_reason: null
        };
      },
      readRunAnswer: async () => {
        calls.push("run-answer");
        return answer;
      },
      readAnswer: async () => {
        calls.push("answer");
        throw new ContractHttpError("NOT_FOUND", 404, "ANSWER_NOT_FOUND");
      }
    } as unknown as ContractClient;

    const bundle = await getDebateBundle("run:fair-test", "token:test", client);
    expect(bundle).toMatchObject({ kind: "served", answer: { answer_id: "answer:fair-test" } });
    expect(bundle.detail.status).toBe("complete");
    expect(calls).toEqual(["run", "run-answer"]); // MUT-BUG02-SERVE-FLIP: stop the SETTLED -> answer read -> RED.
  });

  it("keeps an existing in-flight run out of the error path", async () => {
    const client = {
      readRun: async () => ({
        run_ref: "run:quiet",
        question_line: "A quiet in-flight run",
        state: "RUNNING" as const,
        terminal_reason: null
      }),
      readAnswer: async () => { throw new ContractHttpError("NOT_FOUND", 404, "ANSWER_NOT_FOUND"); },
      readRunAnswer: async () => { throw new ContractHttpError("NOT_FOUND", 404, "ANSWER_NOT_SERVED"); }
    } as unknown as ContractClient;
    await expect(getDebateBundle("run:quiet", "token:test", client)).resolves.toMatchObject({
      kind: "loading",
      answer: null
    }); // MUT-BUG02-404-BANNER: throw the by-design answer 404 for an existing run -> RED.
  });

  it("renders V's exact queued run flow from the typed run projection, not a 404", async () => {
    const client = {
      readAnswer: async () => { throw new ContractHttpError("NOT_FOUND", 404, "ANSWER_NOT_FOUND"); },
      readRunAnswer: async () => { throw new ContractHttpError("NOT_FOUND", 404, "ANSWER_NOT_SERVED"); },
      readRun: async () => ({
        run_ref: "run:queued",
        question_line: "Messi or Ronaldo?",
        state: "QUEUED" as const,
        terminal_reason: null
      })
    } as unknown as ContractClient;
    const result = await getDebateServer("run:queued", "token:test", client);
    expect(result).toMatchObject({ ok: false, kind: "loading" });
    if (result.ok || result.kind !== "loading") throw new Error("expected typed loading state");
    expect(result.run.question_line).toBe("Messi or Ronaldo?");
    expect(result.run.state).toBe("QUEUED");
    const loading = debateDetailFromRunProjection(result.run);
    expect(loading.topic).toBe("Messi or Ronaldo?");
    expect(loading.status).toBe("generating");
    expect(loading.tree).toMatchObject({ claim: "Messi or Ronaldo?", status: "generating", children: [] });
  });

  it("surfaces a typed failed run and keeps a truly missing id not-found", async () => {
    const answerMissing = async () => { throw new ContractHttpError("NOT_FOUND", 404, "ANSWER_NOT_FOUND"); };
    const failedClient = {
      readAnswer: answerMissing,
      readRunAnswer: answerMissing,
      readRun: async () => ({
        run_ref: "run:failed",
        question_line: "Messi or Ronaldo?",
        state: "FAILED" as const,
        terminal_reason: "TOTAL_REVIEW_COVERAGE_UNSATISFIED"
      })
    } as unknown as ContractClient;
    const failed = await getDebateServer("run:failed", "token:test", failedClient);
    expect(failed).toMatchObject({ ok: false, kind: "failed", reason: "TOTAL_REVIEW_COVERAGE_UNSATISFIED" });
    if (failed.ok || failed.kind !== "failed") throw new Error("expected typed failed state");
    expect(debateDetailFromRunProjection(failed.run)).toMatchObject({
      topic: "Messi or Ronaldo?",
      status: "failed",
      tree: { claim: "Messi or Ronaldo?", status: "failed" }
    });

    const missingClient = {
      readAnswer: answerMissing,
      readRunAnswer: answerMissing,
      readRun: async () => { throw new ContractHttpError("NOT_FOUND", 404, "RUN_NOT_FOUND"); }
    } as unknown as ContractClient;
    await expect(getDebateServer("run:missing", "token:test", missingClient)).resolves.toMatchObject({
      ok: false,
      kind: "not_found"
    });
  });

  it("falls back from answer id to run ref when reading a debate", async () => {
    const answer = buildFairShapedAnswer();
    const client = {
      readRun: async () => { throw new ContractHttpError("NOT_FOUND", 404, "RUN_NOT_FOUND"); },
      readAnswer: async (answerId: string) => {
        expect(answerId).toBe("answer:fair-test");
        return answer;
      }
    } as unknown as ContractClient;
    const bundle = await getDebateBundle("answer:fair-test", "token:test", client);
    expect(bundle).toMatchObject({ kind: "served", answer: { answer_id: "answer:fair-test" } });
    expect(bundle.detail.tree?.children[0]?.id).toBe("node:position");
  });

  it("labels V3's missing scoring ENDPOINT precisely, never as a failed check or as unscored", () => {
    // Found live (UI-01): V2's copy prefixed every unavailable reason with
    // "Scoring check failed", asserting a check that V3 never runs (DR-115).
    // Found again (UI-02a): the replacement label said "Scoring unavailable",
    // which was equally false — V3 scores every node; only V2's per-node
    // scoring endpoint is missing.
    const absent = scoringUnavailable("debate:1");
    expect(v3ScoringStatusLabel(absent.reason)).toBe(V3_SCORING_STATUS_LABEL);
    expect(V3_SCORING_STATUS_LABEL).not.toMatch(/scoring unavailable/i);
    expect(V3_SCORING_STATUS_LABEL).toMatch(/scored/i);
    expect(V3_SCORING_STATUS_LABEL).toMatch(/endpoint/i);
    // The reason names what IS served and what is genuinely absent.
    expect(absent.reason).toMatch(/base score/i);
    expect(absent.reason).toMatch(/final strength/i);
    expect(absent.reason).toMatch(/V2's separate per-node scoring endpoint/);
    expect(absent.reason).toMatch(/badge tooltip/i);
    expect(absent.reason).toMatch(/claim drawer/i);
    expect(absent.reason).not.toMatch(/Honesty drawer/i);
    // Reasons that are NOT V3's absence fall through to V2's own copy.
    expect(v3ScoringStatusLabel("Model unavailable")).toBeNull();
    expect(v3ScoringStatusLabel(null)).toBeNull();
    expect(v3ScoringStatusLabel(undefined)).toBeNull();
  });

  it("keeps the top-bar label short enough for the strip it renders in", () => {
    // The label sits in the top bar's `topSwitchStatus` slot beside the word
    // "Scoring"; the full sentence lives in the scoring-insights detail.
    expect(V3_SCORING_STATUS_LABEL.length).toBeLessThan(60);
    expect(SCORING_ABSENCE_REASON.length).toBeGreaterThan(V3_SCORING_STATUS_LABEL.length);
  });

  it("serves the V2 scoring surface as typed absence, never a network fabrication", async () => {
    const scoring = await getDebateScoring("answer:fair-test");
    expect(scoring.status).toBe("unavailable");
    expect(scoring.items).toEqual([]);
    expect(scoring.node_ids).toEqual([]);
    expect(scoring.reason).toMatch(/V3/);
    const dryRun = await getDebateAdaptiveDepthDryRun("answer:fair-test");
    expect(dryRun.status).toBe("unavailable");
    expect(dryRun.plan.items).toEqual([]);
    expect(dryRun.plan.candidate_count).toBe(0);
  });

  it("rejects V2-only mutations loudly instead of pretending they exist", async () => {
    await expect(
      approveDebateAdaptiveDepthExpansion("d", { debate_id: "d", selected_node_ids: ["n"] }, "tok")
    ).rejects.toThrow(/V3_HAS_NO_ADAPTIVE_DEPTH_APPROVALS/);
    await expect(submitScoringFeedback("d", "n", "up", "tok")).rejects.toThrow(/V3_HAS_NO_SCORING_FEEDBACK/);
    await expect(regenerateNode("n", "tok")).rejects.toThrow(/V3_HAS_NO_NODE_REGENERATION/);
    await expect(nodeGenerations("n", "tok")).rejects.toThrow(/V3_HAS_NO_GENERATION_HISTORY/);
  });

  it("builds the ask strictly from user-supplied fields and refuses missing ones", async () => {
    const submitted: unknown[] = [];
    const client = {
      submitAsk: async (ask: unknown) => {
        submitted.push(ask);
        return { run_ref: "run:new", status: "QUEUED" as const };
      }
    } as unknown as ContractClient;
    await expect(createDebate("Question?", { risk_tier: "casual" }, "tok", client)).rejects.toThrow(
      /ASK_FIELD_REQUIRED/
    );
    expect(submitted).toHaveLength(0);
    const created = await createDebate(
      "Question?",
      {
        risk_tier: "casual",
        tier_source: "MACHINE_DEFAULT",
        tier_provenance_ref: "machine:deployment-floor",
        composition_budget_tier: "low",
        depth: 1,
        agent_count: 2,
        decision_owner: "owner",
        action_owner: "actor",
        decision_scope: "scope",
        as_of: "2026-08-10T00:00:00.000Z"
      },
      "tok",
      client
    );
    expect(created.id).toBe("run:new");
    expect(submitted[0]).toMatchObject({
      question_line: "Question?",
      risk_tier: "casual",
      tier_source: "MACHINE_DEFAULT",
      tier_provenance_ref: "machine:deployment-floor",
      caller_scope: "ASKER",
      agent_count: 2,
      depth_params: { depth: 1 }
    });
  });

  it("projects changed deployment envelope values into allowed depth and cost disclosure", async () => {
    const deployment: Deployment = {
      register: {
        register_version: 8,
        rows: [
          { row_key: "riskTier", value: "standard", source_ref: "register:test:risk" },
          {
            row_key: "runCostEnvelope",
            value: {
              kind: "RUN_COST_ENVELOPE_POLICY",
              members: [{ depth_params: { depth: 2 }, risk_tier: "standard", max_model_attempts: 12 }]
            },
            source_ref: "register:test:envelope"
          },
        ]
      },
      scorecards: [],
      model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    };
    expect(runCostEnvelopeFromDeployment(deployment)).toEqual({
      registerVersion: 8,
      sourceRef: "register:test:envelope",
      deploymentRiskTier: "standard",
      members: [{ depth: 2, riskTier: "standard", maxModelAttempts: 12 }]
    });
    const client = { readDeployment: async () => deployment } as unknown as ContractClient;
    await expect(getRunCostEnvelope("tok", client)).resolves.toEqual(
      expect.objectContaining({ members: [{ depth: 2, riskTier: "standard", maxModelAttempts: 12 }] })
    );
  });

  it("selects the effective standard envelope for a casual ask escalated by the deployment floor", () => {
    const standardMember = { depth: 1, riskTier: "standard", maxModelAttempts: 9 } as const;

    expect(selectRunCostEnvelopeMembers([standardMember], "casual", "standard")).toEqual([standardMember]);
    expect(selectRunCostEnvelopeMember([standardMember], 1)).toEqual(standardMember);

    const misleadingSubFloorMember = { depth: 1, riskTier: "casual", maxModelAttempts: 3 } as const;
    expect(
      selectRunCostEnvelopeMembers([misleadingSubFloorMember, standardMember], "casual", "standard")
    ).toEqual([standardMember]);
  });

  it("fails loudly instead of inventing a run envelope when deployment policy is absent or malformed", () => {
    const base: Deployment = {
      register: { register_version: 8, rows: [] },
      scorecards: [],
      model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    };
    expect(() => runCostEnvelopeFromDeployment(base)).toThrowError(
      expect.objectContaining({ name: "TypedDomainError", code: "RUN_COST_ENVELOPE_UNAVAILABLE" })
    );
    expect(() => runCostEnvelopeFromDeployment({
      ...base,
      register: {
        ...base.register,
        rows: [{ row_key: "runCostEnvelope", value: { members: [] }, source_ref: "register:test:bad" }]
      }
    })).toThrowError(expect.objectContaining({ name: "TypedDomainError", code: "RUN_COST_ENVELOPE_INVALID" }));
  });

  it("maps the typed fleet onto V2 worker rows and refuses an untyped fleet", async () => {
    const available: Deployment = {
      register: { register_version: 1, rows: [] },
      scorecards: [],
      model_ledger: [],
      fleet: {
        state: "AVAILABLE",
        workers: [{ worker_ref: "worker:relay", status: "ONLINE", source_ref: "source:fleet" }]
      }
    };
    const clientAvailable = { readDeployment: async () => available } as unknown as ContractClient;
    const workers = await backendStatus("tok", clientAvailable);
    expect(workers).toEqual([
      {
        id: "worker:relay",
        name: "worker:relay",
        capabilities: [],
        last_seen: "",
        status: "online",
        current_job_id: null
      }
    ]);
    const unavailable: Deployment = {
      ...available,
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    };
    const clientUnavailable = { readDeployment: async () => unavailable } as unknown as ContractClient;
    await expect(backendStatus("tok", clientUnavailable)).rejects.toThrow(/NO_TYPED_FLEET_SOURCE/);
  });

  it("projects the deployment model ledger onto V2's settings view, with typed absence for money", async () => {
    const deployment: Deployment = {
      register: { register_version: 7, rows: [] },
      scorecards: [],
      model_ledger: [
        {
          task_class: "proposer",
          model_id: "gpt-5",
          model_version: "2026-05",
          provider: "OpenAI",
          routing_decision_ref: "routing:proposer"
        },
        {
          task_class: "opponent",
          model_id: "claude-cli-default",
          model_version: "cli-reported",
          provider: "Anthropic",
          routing_decision_ref: "routing:opponent"
        },
        {
          task_class: "judge",
          model_id: "gpt-5",
          model_version: "2026-05",
          provider: "OpenAI",
          routing_decision_ref: "routing:judge"
        }
      ],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    };
    const client = { readDeployment: async () => deployment } as unknown as ContractClient;
    const view = await getSettingsView("tok", client);

    expect(view.register_version).toBe(7);
    expect(view.routing).toEqual({
      proposer: ["gpt-5"],
      opponent: ["claude-cli-default"],
      judge: ["gpt-5"]
    });
    expect(view.configured_models).toEqual(["gpt-5", "claude-cli-default"]);
    // Honest lineage the V2 settings table can show: the real provider and
    // version behind each routed model, and the routing decision refs.
    expect(view.models).toEqual([
      {
        model_id: "gpt-5",
        model_version: "2026-05",
        provider: "OpenAI",
        task_classes: ["proposer", "judge"],
        routing_decision_refs: ["routing:proposer", "routing:judge"]
      },
      {
        model_id: "claude-cli-default",
        model_version: "cli-reported",
        provider: "Anthropic",
        task_classes: ["opponent"],
        routing_decision_refs: ["routing:opponent"]
      }
    ]);
    // DR-115: V3 keeps no monthly spend or cap accounting. The V2 money
    // columns get typed absence — never $0.00, never an invented ceiling.
    expect(view.model_monthly_spend_usd).toBeNull();
    expect(view.model_monthly_caps_usd).toEqual({});
    await expect(saveSettings()).rejects.toThrow(/V3_HAS_NO_SETTINGS_WRITE/);
  });

  it("keeps a model visible twice when the ledger routes two different versions of it", async () => {
    const deployment: Deployment = {
      register: { register_version: 2, rows: [] },
      scorecards: [],
      model_ledger: [
        {
          task_class: "proposer",
          model_id: "gpt-5",
          model_version: "2026-05",
          provider: "OpenAI",
          routing_decision_ref: "routing:proposer"
        },
        {
          task_class: "judge",
          model_id: "gpt-5",
          model_version: "2026-07",
          provider: "OpenAI",
          routing_decision_ref: "routing:judge"
        }
      ],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    };
    const client = { readDeployment: async () => deployment } as unknown as ContractClient;
    const view = await getSettingsView("tok", client);
    expect(view.models.map((row) => row.model_version)).toEqual(["2026-05", "2026-07"]);
    expect(view.configured_models).toEqual(["gpt-5"]);
  });

  it("keeps the model-ledger identity key byte-identical while using an unambiguous NUL delimiter", () => {
    const key = modelLedgerIdentityKey({ model_id: "a", model_version: "b", provider: "c" });
    expect(Buffer.from(key).toString("hex")).toBe("6100620063");
    expect(key).toBe(`a\u0000b\u0000c`);
    expect(
      modelLedgerIdentityKey({ model_id: "a b", model_version: "c", provider: "d" })
    ).not.toBe(
      modelLedgerIdentityKey({ model_id: "a", model_version: "b c", provider: "d" })
    );
  });
});

describe("BUG-02 projection labels", () => {
  it("labels the SETTLED transport token in plain words", () => {
    expect(statusLabel("SETTLED")).toBe("Settled");
    expect(statusLabel("SETTLED")).not.toBe("SETTLED");
    // MUT-BUG02-B6-RAW-SETTLED-LABEL: remove the SETTLED label arm -> RED.
  });
});

describe("token unlock failures never assert a verdict the coordinator did not give", () => {
  it("calls it a rejection ONLY when the coordinator answered and declined", () => {
    for (const [code, status] of [["SESSION_REQUIRED", 401], ["FORBIDDEN", 403]] as const) {
      const classified = classifyTokenUnlockFailure(new ContractHttpError(code, status, "denied"));
      expect(classified.kind).toBe("REJECTED");
      expect(classified.message).toContain("rejected");
    }
  });

  it("never claims rejection when no answer arrived — the live defect V hit", () => {
    // The exact shape of a down coordinator: fetch throws, the client wraps it.
    const classified = classifyTokenUnlockFailure(
      new ContractHttpError("NETWORK_FAILURE", 0, "fetch failed: ECONNREFUSED 127.0.0.1:8790")
    );
    expect(classified.kind).toBe("UNREACHABLE");
    expect(classified.message).not.toContain("reject");
    expect(classified.message).toContain("never checked");
  });

  it("never claims rejection when the coordinator itself failed", () => {
    const classified = classifyTokenUnlockFailure(new ContractHttpError("SERVER_FAILURE", 500, "boom"));
    expect(classified.kind).toBe("COORDINATOR_FAILED");
    expect(classified.message).not.toContain("rejected the");
    expect(classified.message).toContain("500");
  });

  it("says plainly that it cannot classify a non-contract failure", () => {
    const classified = classifyTokenUnlockFailure(new Error("something else broke"));
    expect(classified.kind).toBe("UNCLASSIFIED");
    expect(classified.message).toContain("something else broke");
    expect(classified.message).toContain("not rejected");
  });

  it("classifies every ContractErrorCode — no code falls through unnamed", () => {
    const codes = [
      "SESSION_REQUIRED", "RATE_LIMITED", "NOT_FOUND", "MALFORMED_REQUEST",
      "UNPROCESSABLE", "FORBIDDEN", "SERVER_FAILURE", "NETWORK_FAILURE", "INVALID_RESPONSE"
    ] as const;
    for (const code of codes) {
      const message = tokenUnlockFailureMessage(new ContractHttpError(code, 500, "x"));
      expect(message.trim().length).toBeGreaterThan(0);
      // Only the two genuine refusals may use the word "rejected".
      expect(message.includes("The coordinator rejected")).toBe(code === "SESSION_REQUIRED" || code === "FORBIDDEN");
    }
  });
});
