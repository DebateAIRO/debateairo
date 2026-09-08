import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createMutationArm,
} from "../../tools/obs-listener/src/obsctl/arm.js";
import {
  beginApprovedMutation,
  releaseMutationLease,
  type ApprovedMutationProposal,
} from "../../tools/obs-listener/src/landing/lease.js";
import { canonicalProposalHash } from "../../tools/obs-listener/src/obsctl/proposal-control.js";
import type { FixProposal } from "../../tools/obs-listener/src/worker-diagnosis/schema.js";

const proposal: FixProposal = Object.freeze({
  incidentId: "10000000-0000-4000-8000-000000000013",
  root: "apps/scheduler/src/index.ts:runLivenessSweep",
  diagnosis: Object.freeze({ defectClass: "BOUNDARY_CONTRACT", params: Object.freeze({ code: "OBS_SCHEDULER_JOB_FAILED" }) }),
  changeScope: Object.freeze(["apps/scheduler/src/index.ts"]),
  sizeLabel: "QUICK",
  redTestPlan: Object.freeze({ invariantRef: "INV-SCHEDULER-RETURN" }),
  blastRadius: Object.freeze({ reachableModules: 1, modules: Object.freeze(["apps/scheduler/src/index.ts"]) }),
  spendUnits: 5,
});

function approved(overrides: Partial<ApprovedMutationProposal> = {}): ApprovedMutationProposal {
  const hash = canonicalProposalHash(proposal);
  return Object.freeze({
    proposalId: "proposal-13",
    incidentId: proposal.incidentId,
    repositoryId: "dialectical-engine",
    fingerprint: "a".repeat(64),
    storedHash: hash,
    approvedHash: hash,
    proposal,
    rootVerdict: "CODE_ROOT",
    ...overrides,
  });
}

describe("FIX-13 mutation authority and lease", () => {
  it("defaults OFF after construction, requires the custodian, and never changes quick_arm", () => {
    const first = createMutationArm({ custodianToken: "custodian-token-13", quickArm: "OFF" });
    expect(first.state()).toEqual({ mutation: "OFF", quickArm: "OFF" });
    expect(first.arm("wrong-token")).toEqual({ ok: false, code: "MUTATION_AUTH_REJECTED" });
    expect(first.state()).toEqual({ mutation: "OFF", quickArm: "OFF" });
    expect(first.arm("custodian-token-13")).toEqual({ ok: true, mutation: "ON" });
    expect(first.state()).toEqual({ mutation: "ON", quickArm: "OFF" });

    const restarted = createMutationArm({ custodianToken: "custodian-token-13", quickArm: "OFF" });
    expect(restarted.state()).toEqual({ mutation: "OFF", quickArm: "OFF" });
  });

  it("rechecks the approved hash and refuses external roots without spawning", async () => {
    const stateDirectory = await mkdtemp(join(tmpdir(), "fix13-arm-"));
    const spawned: string[] = [];

    await expect(beginApprovedMutation({
      stateDirectory,
      mutationState: "ON",
      candidate: approved({ approvedHash: "0".repeat(64) }),
      pid: process.pid,
      nowMs: 1_000,
      expiresAtMs: 2_000,
      spawn: async (value) => { spawned.push(value.proposalId); },
    })).resolves.toEqual({ ok: false, code: "PROPOSAL_TAMPERED" });

    await expect(beginApprovedMutation({
      stateDirectory,
      mutationState: "ON",
      candidate: approved({ rootVerdict: "EXTERNAL_ROOT" }),
      pid: process.pid,
      nowMs: 1_000,
      expiresAtMs: 2_000,
      spawn: async (value) => { spawned.push(value.proposalId); },
    })).resolves.toEqual({ ok: false, code: "NOT_A_FIX_TARGET" });
    expect(spawned).toEqual([]);

    await expect(beginApprovedMutation({
      stateDirectory,
      mutationState: "OFF",
      candidate: approved(),
      pid: process.pid,
      nowMs: 1_000,
      expiresAtMs: 2_000,
      spawn: async (value) => { spawned.push(value.proposalId); },
    })).resolves.toEqual({ ok: false, code: "MUTATION_OFF" });
    expect(spawned).toEqual([]);
  });

  it("permits one active mutation per repository and fingerprint", async () => {
    const stateDirectory = await mkdtemp(join(tmpdir(), "fix13-lease-"));
    const spawned: string[] = [];
    const first = await beginApprovedMutation({
      stateDirectory,
      mutationState: "ON",
      candidate: approved(),
      pid: process.pid,
      nowMs: 1_000,
      expiresAtMs: 2_000,
      spawn: async (value) => { spawned.push(value.proposalId); },
    });
    expect(first).toMatchObject({ ok: true, lease: { repositoryId: "dialectical-engine", fingerprint: "a".repeat(64) } });

    await expect(beginApprovedMutation({
      stateDirectory,
      mutationState: "ON",
      candidate: approved({ proposalId: "proposal-14", fingerprint: "b".repeat(64) }),
      pid: process.pid,
      nowMs: 1_100,
      expiresAtMs: 2_100,
      spawn: async (value) => { spawned.push(value.proposalId); },
    })).resolves.toEqual({ ok: false, code: "MUTATION_ALREADY_ACTIVE" });
    expect(spawned).toEqual(["proposal-13"]);

    if (!first.ok) throw new Error("expected lease");
    await releaseMutationLease(stateDirectory, first.lease.leaseId);
  });
});
