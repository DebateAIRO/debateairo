import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";

import { canonicalProposalHash } from "../obsctl/proposal-control.js";
import { FixProposalSchema, type FixProposal } from "../worker-diagnosis/schema.js";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const HASH = /^[0-9a-f]{64}$/u;
const LEASE_FILE = "mutation-lease.json";

export interface ApprovedMutationProposal {
  readonly proposalId: string;
  readonly incidentId: string;
  readonly repositoryId: string;
  readonly fingerprint: string;
  readonly storedHash: string;
  readonly approvedHash: string;
  readonly proposal: unknown;
  readonly rootVerdict: "CODE_ROOT" | "EXTERNAL_ROOT";
}

export interface MutationLease {
  readonly schema: "fixagent-mutation-lease/v1";
  readonly leaseId: string;
  readonly proposalId: string;
  readonly repositoryId: string;
  readonly fingerprint: string;
  readonly pid: number;
  readonly acquiredAtMs: number;
  readonly expiresAtMs: number;
}

export type BeginMutationResult =
  | Readonly<{ ok: true; lease: MutationLease }>
  | Readonly<{
      ok: false;
      code:
        | "MUTATION_OFF"
        | "PROPOSAL_TAMPERED"
        | "NOT_A_FIX_TARGET"
        | "MUTATION_ALREADY_ACTIVE"
        | "WORKER_START_FAILED";
    }>;

function validateCandidate(candidate: ApprovedMutationProposal): FixProposal | "PROPOSAL_TAMPERED" | "NOT_A_FIX_TARGET" {
  if (candidate.rootVerdict !== "CODE_ROOT") return "NOT_A_FIX_TARGET";
  const parsed = FixProposalSchema.safeParse(candidate.proposal);
  if (!parsed.success || !HASH.test(candidate.storedHash) || !HASH.test(candidate.approvedHash)) {
    return "PROPOSAL_TAMPERED";
  }
  const computed = canonicalProposalHash(parsed.data);
  if (candidate.storedHash !== computed || candidate.approvedHash !== computed) return "PROPOSAL_TAMPERED";
  return parsed.data;
}

function validateLeaseInput(input: Readonly<{
  candidate: ApprovedMutationProposal;
  pid: number;
  nowMs: number;
  expiresAtMs: number;
}>): void {
  if (!SAFE_ID.test(input.candidate.proposalId) || !SAFE_ID.test(input.candidate.repositoryId) ||
      !HASH.test(input.candidate.fingerprint)) throw new TypeError("FIX13_LEASE_IDENTITY");
  if (!Number.isSafeInteger(input.pid) || input.pid <= 0 || !Number.isSafeInteger(input.nowMs) || input.nowMs <= 0 ||
      !Number.isSafeInteger(input.expiresAtMs) || input.expiresAtMs <= input.nowMs) {
    throw new TypeError("FIX13_LEASE_TIME");
  }
}

function leaseBytes(lease: MutationLease): string {
  return `${JSON.stringify(lease)}\n`;
}

export async function beginApprovedMutation(input: Readonly<{
  mutationState: "OFF" | "ON";
  stateDirectory: string;
  candidate: ApprovedMutationProposal;
  pid: number;
  nowMs: number;
  expiresAtMs: number;
  spawn(candidate: ApprovedMutationProposal): Promise<void>;
}>): Promise<BeginMutationResult> {
  if (input.mutationState !== "ON") {
    return Object.freeze({ ok: false, code: "MUTATION_OFF" });
  }
  const validated = validateCandidate(input.candidate);
  if (validated === "PROPOSAL_TAMPERED" || validated === "NOT_A_FIX_TARGET") {
    return Object.freeze({ ok: false, code: validated });
  }
  validateLeaseInput(input);
  await mkdir(input.stateDirectory, { recursive: true, mode: 0o700 });
  const lease = Object.freeze({
    schema: "fixagent-mutation-lease/v1" as const,
    leaseId: randomUUID(),
    proposalId: input.candidate.proposalId,
    repositoryId: input.candidate.repositoryId,
    fingerprint: input.candidate.fingerprint,
    pid: input.pid,
    acquiredAtMs: input.nowMs,
    expiresAtMs: input.expiresAtMs,
  });
  const path = join(input.stateDirectory, LEASE_FILE);
  let descriptor;
  try {
    descriptor = await open(path, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return Object.freeze({ ok: false, code: "MUTATION_ALREADY_ACTIVE" });
    }
    throw error;
  }
  try {
    await descriptor.writeFile(leaseBytes(lease), { encoding: "utf8" });
    await descriptor.sync();
  } finally {
    await descriptor.close();
  }
  try {
    await input.spawn(Object.freeze({ ...input.candidate, proposal: validated }));
  } catch (_error) {
    await releaseMutationLease(input.stateDirectory, lease.leaseId);
    return Object.freeze({ ok: false, code: "WORKER_START_FAILED" });
  }
  return Object.freeze({ ok: true, lease });
}

export async function readMutationLease(stateDirectory: string): Promise<MutationLease | null> {
  let bytes: string;
  try {
    bytes = await readFile(join(stateDirectory, LEASE_FILE), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  let value: unknown;
  try { value = JSON.parse(bytes); } catch (_error) { throw new TypeError("FIX13_LEASE_INVALID"); }
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("FIX13_LEASE_INVALID");
  const row = value as Record<string, unknown>;
  if (row.schema !== "fixagent-mutation-lease/v1" || typeof row.leaseId !== "string" ||
      !SAFE_ID.test(row.leaseId) || typeof row.proposalId !== "string" || !SAFE_ID.test(row.proposalId) ||
      typeof row.repositoryId !== "string" || !SAFE_ID.test(row.repositoryId) ||
      typeof row.fingerprint !== "string" || !HASH.test(row.fingerprint) ||
      typeof row.pid !== "number" || !Number.isSafeInteger(row.pid) || row.pid <= 0 ||
      typeof row.acquiredAtMs !== "number" || typeof row.expiresAtMs !== "number") {
    throw new TypeError("FIX13_LEASE_INVALID");
  }
  return Object.freeze(row as unknown as MutationLease);
}

export async function releaseMutationLease(stateDirectory: string, leaseId: string): Promise<void> {
  const lease = await readMutationLease(stateDirectory);
  if (lease === null) return;
  if (lease.leaseId !== leaseId) throw new TypeError("FIX13_LEASE_MISMATCH");
  await unlink(join(stateDirectory, LEASE_FILE));
}

export async function revokeActiveMutation(input: Readonly<{
  stateDirectory: string;
  killProcessGroup(pid: number): Promise<void>;
  cleanupProof(): Promise<void>;
  comment(value: string): Promise<void>;
  appendAction(value: Readonly<{ kind: "LEASE_REVOKED"; proposalId: string; leaseId: string }>): Promise<void>;
}>): Promise<Readonly<{ revoked: false } | { revoked: true; proposalId: string }>> {
  const lease = await readMutationLease(input.stateDirectory);
  if (lease === null) return Object.freeze({ revoked: false });
  await input.killProcessGroup(lease.pid);
  await input.cleanupProof();
  await releaseMutationLease(input.stateDirectory, lease.leaseId);
  await input.appendAction(Object.freeze({ kind: "LEASE_REVOKED", proposalId: lease.proposalId, leaseId: lease.leaseId }));
  await input.comment(`LEASE_REVOKED ${lease.proposalId}`);
  return Object.freeze({ revoked: true, proposalId: lease.proposalId });
}
