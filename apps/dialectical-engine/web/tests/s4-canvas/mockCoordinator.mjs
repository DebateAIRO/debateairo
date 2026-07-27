import { createServer } from "node:http";

const port = Number(process.env.S4_MOCK_PORT ?? 8104);
const debateId = "s4-fixture";

function claimNode(id, nodeType, depth, claim, children = []) {
  return {
    id,
    debate_id: debateId,
    parent_id: depth === 0 ? null : `node-${depth - 1}`,
    node_type: nodeType,
    depth,
    position: 0,
    claim,
    status: "complete",
    materialized_path: `root.${Array.from({ length: depth }, () => "0").join(".")}`,
    active_generation_id: null,
    active_generation: null,
    children,
    score: null
  };
}

const deeperEvidence = claimNode(
  "node-4",
  "PRO",
  4,
  "A deeper supporting claim keeps whole-tree Fit inside the overview readability band."
);
const evidence = claimNode(
  "node-3",
  "EVIDENCE",
  3,
  "A concrete evidence claim at the deepest visible level.",
  [deeperEvidence]
);
const counter = claimNode(
  "node-2",
  "CON",
  2,
  "A counterargument that makes the tree wide enough to require a viewport.",
  [evidence]
);
const support = claimNode(
  "node-1",
  "PRO",
  1,
  "A supporting argument that can be tapped, dragged, and opened.",
  [counter]
);
const alternative = {
  ...claimNode(
    "node-alt",
    "PRACTICAL_POV",
    1,
    "A sibling branch makes vertical packing and connector geometry observable."
  ),
  parent_id: "node-0",
  position: 1,
  materialized_path: "root.1"
};
const tree = claimNode(
  "node-0",
  "ROOT_CLAIM",
  0,
  "Responsive canvas gestures must preserve readable access to the whole debate tree.",
  [support, alternative]
);

const debate = {
  id: debateId,
  topic: "S4 responsive viewport fixture",
  status: "complete",
  config: {},
  direct_answer: null,
  root_node_id: "node-0",
  synthesis_id: null,
  created_at: "2026-07-26T00:00:00Z",
  completed_at: "2026-07-26T00:01:00Z",
  tree,
  synthesis: null,
  active_synthesis: null,
  branch_lineage: [],
  analyzer_runs: [],
  selected_skills: [],
  selected_agents: [],
  agent_outputs: [],
  agent_runs: [],
  skills_used: [],
  provenance_records: [],
  workers: [],
  models: [],
  node_count: 6
};

function json(response, status, payload) {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Type": "application/json"
  });
  response.end(JSON.stringify(payload));
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  const path = url.pathname;

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Origin": "*"
    });
    response.end();
    return;
  }

  if (path === "/health") {
    json(response, 200, { ok: true });
    return;
  }

  if (path === `/api/debates/${debateId}/events`) {
    response.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream"
    });
    response.write(": S4 test stream ready\n\n");
    return;
  }

  if (path === `/api/debates/${debateId}/scoring`) {
    json(response, 200, {
      debate_id: debateId,
      status: "unavailable",
      node_ids: [],
      items: [],
      errors: [],
      pending: [],
      reason: "Scoring is intentionally outside this test-only viewport fixture."
    });
    return;
  }

  if (path === `/api/debates/${debateId}/scoring/adaptive-depth/dry-run`) {
    json(response, 200, {
      debate_id: debateId,
      status: "unavailable",
      reason: "Adaptive depth is intentionally outside this test-only viewport fixture.",
      plan: {
        policy: { mode: "fixed" },
        candidate_count: 0,
        expansion_count: 0,
        items: []
      }
    });
    return;
  }

  if (path === `/api/debates/${debateId}`) {
    json(response, 200, debate);
    return;
  }

  json(response, 404, { detail: `Unknown S4 test endpoint: ${path}` });
});

server.listen(port, "127.0.0.1");

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
