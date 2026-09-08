import { describe, expect, it } from "vitest";

import {
  approveProposal,
  denyProposal,
  type ProposalControlAction,
  type ProposalControlStore,
  type StoredProposal,
} from "../../tools/obs-listener/src/obsctl/proposal-control.js";
import { revealDrift } from "../../tools/obs-listener/src/obsctl/reveal-drift.js";
import { parseObsctl, runObsctl } from "../../tools/obs-listener/src/obsctl/cli.js";
import type { FixProposal } from "../../tools/obs-listener/src/worker-diagnosis/schema.js";

const proposal: FixProposal = Object.freeze({
  incidentId: "10000000-0000-4000-8000-000000000012",
  root: "apps/scheduler/src/index.ts:runLivenessSweep",
  diagnosis: Object.freeze({ defectClass: "BOUNDARY_CONTRACT", params: Object.freeze({ code: "OBS_SCHEDULER_JOB_FAILED" }) }),
  changeScope: Object.freeze(["apps/scheduler/src/index.ts"]),
  sizeLabel: "QUICK",
  redTestPlan: Object.freeze({ invariantRef: "RT-30" }),
  blastRadius: Object.freeze({ reachableModules: 1, modules: Object.freeze(["apps/scheduler/src/index.ts"]) }),
  spendUnits: 7,
});

function controlStore(storedHash: string): ProposalControlStore & {
  actions: ProposalControlAction[]; states: string[]; discarded: string[];
} {
  const actions: ProposalControlAction[] = [];
  const states: string[] = [];
  const discarded: string[] = [];
  const stored: StoredProposal = Object.freeze({
    proposalId: "proposal-12", incidentId: proposal.incidentId,
    ticketId: "ticket-12", hash: storedHash, proposal,
  });
  return {
    actions, states, discarded,
    loadProposal: async () => stored,
    appendAction: async (action) => { actions.push(action); },
    setIncidentState: async (_incidentId, state) => { states.push(state); },
    discardProposal: async (proposalId) => { discarded.push(proposalId); },
  };
}

describe("FIX-12 proposal approval controls", () => {
  it("approve binds the recomputed stored hash and comments without landing", async () => {
    const { canonicalProposalHash } = await import("../../tools/obs-listener/src/obsctl/proposal-control.js");
    const store = controlStore(canonicalProposalHash(proposal));
    const comments: string[] = [];
    const result = await approveProposal("proposal-12", store, {
      comment: async (_ticketId, value) => { comments.push(value); },
    });

    expect(result).toMatchObject({ exitCode: 0, stdout: expect.stringMatching(/^APPROVED proposal-12 [0-9a-f]{64}\n$/) });
    expect(store.actions).toMatchObject([{ kind: "APPROVED", proposalId: "proposal-12", actionRef: expect.stringMatching(/^[0-9a-f]{64}$/) }]);
    expect(store.states).toEqual(["APPROVED"]);
    expect(comments).toEqual(["APPROVED proposal-12"]);
  });

  it("deny records a closed reason code and parks the incident", async () => {
    const { canonicalProposalHash } = await import("../../tools/obs-listener/src/obsctl/proposal-control.js");
    const store = controlStore(canonicalProposalHash(proposal));
    const comments: string[] = [];
    expect(await denyProposal("proposal-12", "NOT_REPRODUCIBLE", store, {
      comment: async (_ticketId, value) => { comments.push(value); },
    })).toEqual({ exitCode: 0, stdout: "DENIED proposal-12 NOT_REPRODUCIBLE\n", stderr: "" });
    expect(store.actions).toMatchObject([{ kind: "DENIED", reasonCode: "NOT_REPRODUCIBLE" }]);
    expect(store.states).toEqual(["PARKED"]);
    expect(comments).toEqual(["DENIED proposal-12 NOT_REPRODUCIBLE"]);
  });

  it("refuses a mismatched hash, discards the proposal, and returns the incident to TICKETED", async () => {
    const store = controlStore("0".repeat(64));
    const comments: string[] = [];
    const result = await approveProposal("proposal-12", store, {
      comment: async (_ticketId, value) => { comments.push(value); },
    });

    expect(result).toEqual({ exitCode: 1, stdout: "PROPOSAL_TAMPERED proposal-12\n", stderr: "" });
    expect(store.actions).toMatchObject([{ kind: "PROPOSAL_TAMPERED", proposalId: "proposal-12" }]);
    expect(store.discarded).toEqual(["proposal-12"]);
    expect(store.states).toEqual(["TICKETED"]);
    expect(comments).toEqual([]);
  });

  it("reveals manifest drift without reading a zone path", () => {
    expect(revealDrift("a".repeat(64), null)).toEqual({ exitCode: 2, stdout: "SLOT_UNSET RP-1\n", stderr: "" });
    expect(revealDrift("a".repeat(64), "a".repeat(64))).toEqual({
      exitCode: 0, stdout: `MANIFEST_MATCH ${"a".repeat(64)}\n`, stderr: "",
    });
    expect(revealDrift("a".repeat(64), "b".repeat(64))).toEqual({
      exitCode: 1, stdout: `MANIFEST_DRIFT live=${"a".repeat(64)} slot=${"b".repeat(64)}\n`, stderr: "",
    });
  });

  it("reserves obsctl approve, deny, reveal-drift, and arm --dispatch syntax", async () => {
    expect(parseObsctl(["approve", "proposal-12"])).toEqual({ verb: "approve", args: ["proposal-12"] });
    expect(parseObsctl(["deny", "proposal-12", "NOT_REPRODUCIBLE"])).toEqual({
      verb: "deny", args: ["proposal-12", "NOT_REPRODUCIBLE"],
    });
    expect(parseObsctl(["reveal-drift"])).toEqual({ verb: "reveal-drift", args: [] });
    expect(parseObsctl(["arm", "--dispatch"])).toEqual({ verb: "arm-dispatch", args: [] });
    const calls: string[] = [];
    const result = await runObsctl(["approve", "proposal-12"], {
      kill: async () => ({ exitCode: 1, stdout: "", stderr: "" }),
      arm: async () => ({ exitCode: 1, stdout: "", stderr: "" }),
      status: async () => ({ exitCode: 1, stdout: "", stderr: "" }),
      lifecycle: async () => ({ exitCode: 1, stdout: "", stderr: "" }),
      fix12: async (verb, args) => { calls.push(`${verb}:${args.join(":")}`); return { exitCode: 0, stdout: "ok\n", stderr: "" }; },
    });
    expect(result).toEqual({ exitCode: 0, stdout: "ok\n", stderr: "" });
    expect(calls).toEqual(["approve:proposal-12"]);
  });
});
