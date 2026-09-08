import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { ProofCommandResult } from "./prove.js";
import type { PreparedProofWorktree } from "./worktree.js";

const run = promisify(execFile);
const HASH = /^[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const CODE = /^[A-Z][A-Z0-9_]{0,127}$/u;
const PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\/\/)[A-Za-z0-9@+._-]+(?:\/[A-Za-z0-9@+._-]+)*$/u;

async function git(cwd: string, args: readonly string[]): Promise<string> {
  return (await run("git", [...args], { cwd, encoding: "utf8" })).stdout;
}

function checkedInput(input: Readonly<{
  incidentHash: string;
  incidentId: string;
  fingerprint: string;
  root: string;
  evidenceIds: readonly string[];
  causalPath: readonly string[];
  touchedPaths: readonly string[];
  notChanged: readonly string[];
  spendUnits: number;
  blastRadius: number;
}>): void {
  if (!HASH.test(input.incidentHash) || !HASH.test(input.fingerprint) || !UUID.test(input.incidentId) ||
      !input.root.includes(":") || /[\0\r\n]/u.test(input.root) || input.evidenceIds.length === 0 ||
      !input.evidenceIds.every((id) => UUID.test(id)) || input.causalPath.length === 0 ||
      !input.causalPath.every((code) => CODE.test(code)) || input.touchedPaths.length === 0 ||
      !input.touchedPaths.every((path) => PATH.test(path)) || !input.notChanged.every((code) => CODE.test(code)) ||
      !Number.isSafeInteger(input.spendUnits) || input.spendUnits < 0 ||
      !Number.isSafeInteger(input.blastRadius) || input.blastRadius < 0) throw new TypeError("FIX13_PRESENT_INPUT");
}

function proofSummary(result: ProofCommandResult): string {
  return `${result.outcome} exit=${result.exitCode}`;
}

function renderTemplate(input: Readonly<{
  branch: string;
  commit: string;
  incidentId: string;
  fingerprint: string;
  rootVerdict: "CODE_ROOT";
  root: string;
  evidenceIds: readonly string[];
  causalPath: readonly string[];
  redCommand: string;
  red: ProofCommandResult;
  green: ProofCommandResult;
  gates: readonly ProofCommandResult[];
  touchedPaths: readonly string[];
  blastRadius: number;
  sizeLabel: "QUICK" | "PR_FIX";
  notChanged: readonly string[];
  spendUnits: number;
}>): string {
  return [
    "PR_PRESENTED",
    `incident: ${input.incidentId}`,
    `fingerprint: ${input.fingerprint}`,
    `root: ${input.rootVerdict} ${input.root}`,
    `evidence_ids: ${input.evidenceIds.join(",")}`,
    `causal_path: ${input.causalPath.join(">")}`,
    `RED on base: ${input.redCommand} => ${proofSummary(input.red)}`,
    `diff_scope: ${input.touchedPaths.join(",")}`,
    `GREEN: catalog=${proofSummary(input.green)} gates=${input.gates.map(proofSummary).join(",") || "NONE"}`,
    "privacy_attestation: NO_RAW_ERROR_TEXT",
    "forbidden_surface_attestation: CLEAR",
    `blast_radius: reachable_modules=${input.blastRadius}`,
    `size_label: ${input.sizeLabel}`,
    `not_changed: ${input.notChanged.join(",") || "NONE"}`,
    `spend: ${input.spendUnits}`,
    `branch: ${input.branch}`,
    `revert: git revert ${input.commit}`,
    "",
  ].join("\n");
}

export async function presentFix(input: Readonly<{
  prepared: PreparedProofWorktree;
  incidentHash: string;
  incidentId: string;
  fingerprint: string;
  root: string;
  rootVerdict: "CODE_ROOT";
  evidenceIds: readonly string[];
  causalPath: readonly string[];
  redCommand: string;
  red: ProofCommandResult;
  green: ProofCommandResult;
  gates: readonly ProofCommandResult[];
  touchedPaths: readonly string[];
  blastRadius: number;
  sizeLabel: "QUICK" | "PR_FIX";
  notChanged: readonly string[];
  spendUnits: number;
  ticketId: string;
  ticket: Readonly<{ comment(ticketId: string, value: string): Promise<void> }>;
  actions: Readonly<{ append(value: Readonly<Record<string, unknown>>): Promise<void> }>;
  incidents: Readonly<{ setState(incidentId: string, state: "PR_PRESENTED"): Promise<void> }>;
}>): Promise<Readonly<{ branch: string; commit: string; comment: string }>> {
  checkedInput(input);
  if (input.red.outcome !== "TEST_FAILURE" || input.green.outcome !== "PASS" ||
      input.gates.some((gate) => gate.outcome !== "PASS")) throw new TypeError("FIX13_PRESENT_PROOF");
  const dirty = (await git(input.prepared.path, ["status", "--porcelain=v1", "--untracked-files=all"]))
    .trimEnd().split("\n").filter(Boolean).map((line) => line.slice(3));
  if (dirty.join("\n") !== [...input.touchedPaths].sort().join("\n")) throw new TypeError("FIX13_PRESENT_SCOPE");
  const branch = `fixagent/${input.incidentHash}`;
  try {
    await git(input.prepared.path, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
    throw new TypeError("FIX13_BRANCH_EXISTS");
  } catch (error) {
    if (error instanceof TypeError) throw error;
    const exit = error as Error & { code?: number };
    if (exit.code !== 1) throw error;
  }
  await git(input.prepared.path, ["switch", "-c", branch]);
  await git(input.prepared.path, ["add", "--", ...input.touchedPaths]);
  await git(input.prepared.path, ["-c", "user.name=FixAgent", "-c", "user.email=fixagent@example.invalid",
    "commit", "-m", `fix: present incident ${input.incidentHash.slice(0, 12)}`]);
  const commit = (await git(input.prepared.path, ["rev-parse", "HEAD"])).trim();
  const count = (await git(input.prepared.path, ["rev-list", "--count", `${input.prepared.baseSha}..HEAD`])).trim();
  const remaining = await git(input.prepared.path, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (count !== "1" || remaining.length !== 0) throw new TypeError("FIX13_PRESENT_COMMIT_SHAPE");
  const comment = renderTemplate({ ...input, branch, commit });
  await input.actions.append(Object.freeze({
    kind: "PR_PRESENTED",
    incidentId: input.incidentId,
    actionRef: commit,
    branch,
    proof: Object.freeze({ red: input.red, green: input.green, gates: input.gates }),
  }));
  await input.ticket.comment(input.ticketId, comment);
  await input.incidents.setState(input.incidentId, "PR_PRESENTED");
  return Object.freeze({ branch, commit, comment });
}

export async function detectPresentedMerge(input: Readonly<{
  repository: string;
  branch: string;
  targetBranch: "dev";
  incidentId: string;
  incidents: Readonly<{ setState(incidentId: string, state: "FIXED_UNVALIDATED"): Promise<void> }>;
}>): Promise<Readonly<{ merged: boolean; state?: "FIXED_UNVALIDATED" }>> {
  let merged = false;
  try {
    await git(input.repository, ["merge-base", "--is-ancestor", input.branch, input.targetBranch]);
    merged = true;
  } catch (error) {
    const failure = error as Error & { code?: number };
    if (failure.code !== 1) throw error;
  }
  if (!merged) return Object.freeze({ merged: false });
  await input.incidents.setState(input.incidentId, "FIXED_UNVALIDATED");
  return Object.freeze({ merged: true, state: "FIXED_UNVALIDATED" });
}
