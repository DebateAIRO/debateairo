# FIX-09 Admission and Witness Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Do not dispatch subagents for this lane. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the already selected FIX-09 Ed25519 design from one closed admission receipt, with exact occurrence-detail replay and witness authorization that remains valid when the row keyring is invalid.

**Architecture:** SPEC-v6 closes only the four round-2 findings. Task 0 uses the literal capture runner and receipt parser below before any C3.5 code. Later C3.5/C4 tasks retain PLAN-v5's order and surfaces while implementing the v6 detail and activation-pinned witness deltas.

**Tech Stack:** Node.js ESM, POSIX filesystem APIs, Git, pnpm/Vitest JSON reporter, TypeScript, PostgreSQL, Ed25519, SHA-256, RFC 8785.

**Spec:** `docs/missions/observability-agents/slices/FIX-09/SPEC-v6.md`

## Global constraints

- SPEC-v4/v5 and PLAN-v4/v5 bytes are immutable; v6 supersedes only its four named gaps.
- Task 0 and C3.5 are STOP until v6 receives independent zero-P0-P3 authority review.
- No live root/key/database/migration/quiesce/activation/service/acceptance/merge/push/Done act.
- Migration remains uniquely `migrations/0064_fix09_audit_chain.sql` and forward-only.
- Every evidence command uses the literal runner; no shell pipeline, `eval`, `tee`, glob-selected test, or assertion before capture is evidence.
- Test private keys are runtime-ephemeral; no private seed/DER/JWK/signature fixture persists.

---

## Literal capture runner

Before Task 0, open a fresh shell at the controller repository and paste this function byte-for-byte. This is the complete Task 0 runner, not pseudocode:

```bash
FIX09_TASK0_EVIDENCE_DIR="$(mktemp -d /private/tmp/fix09-task0.XXXXXXXX)"
FIX09_TASK0_VALIDATION_DIR="$(mktemp -d /private/tmp/fix09-task0-validation.XXXXXXXX)"
chmod 0700 "$FIX09_TASK0_EVIDENCE_DIR"
chmod 0700 "$FIX09_TASK0_VALIDATION_DIR"
readonly FIX09_TASK0_EVIDENCE_DIR
readonly FIX09_TASK0_VALIDATION_DIR

fix09_capture() {
  local evidence_root="$1"
  shift
  node - "$evidence_root" "$@" <<'FIX09_CAPTURE_NODE'
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const child = require("node:child_process");

const raw = process.argv.slice(2);
const separator = raw.indexOf("--");
if (separator !== 6) throw new Error("FIX09_CAPTURE_GRAMMAR");
const [rootInput, id, ordinal, expectedRcText, kind, expected] = raw.slice(0, separator);
const argv = raw.slice(separator + 1);
if (!/^(t0|h0)-[0-9]{3}$/.test(id) || !/^[1-9][0-9]*$/.test(ordinal)) throw new Error("FIX09_CAPTURE_ID");
if (!/^(0|[1-9][0-9]*)$/.test(expectedRcText) || argv.length === 0) throw new Error("FIX09_CAPTURE_ARGV");
if (argv.some((value) => value.includes("\0"))) throw new Error("FIX09_CAPTURE_NUL");

const allowedKinds = new Set([
  "stdout_exact_base64", "stdout_empty", "stdout_nonempty", "stdout_sha40",
  "stdout_sha64", "stdout_lines_exact_json", "streams_exact_base64_json", "status_only",
]);
if (!allowedKinds.has(kind)) throw new Error("FIX09_CAPTURE_ASSERTION_KIND");

const stable = (value) => {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  throw new Error("FIX09_CAPTURE_CANONICAL_TYPE");
};
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const root = fs.realpathSync(rootInput);
const rootStat = fs.lstatSync(root);
if (!rootStat.isDirectory() || (rootStat.mode & 0o777) !== 0o700) throw new Error("FIX09_CAPTURE_ROOT");

const resolveExecutable = (name) => {
  const candidates = name.includes("/") ? [name] : (process.env.PATH || "").split(":").map((dir) => path.join(dir, name));
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return fs.realpathSync(candidate);
    } catch {}
  }
  throw new Error("FIX09_CAPTURE_TOOL");
};

const prefix = `${ordinal.padStart(3, "0")}-${id}`;
const stdoutName = `${prefix}.stdout`;
const stderrName = `${prefix}.stderr`;
const commandName = `${prefix}.command.json`;
const stdoutPath = path.join(root, stdoutName);
const stderrPath = path.join(root, stderrName);
const commandPath = path.join(root, commandName);
const stdoutFd = fs.openSync(stdoutPath, "wx", 0o600);
const stderrFd = fs.openSync(stderrPath, "wx", 0o600);
const toolPath = resolveExecutable(argv[0]);
const environment = {
  PATH: process.env.PATH || "",
  LANG: "C", LC_ALL: "C", TZ: "UTC", GIT_TERMINAL_PROMPT: "0",
};
const versionRun = child.spawnSync(toolPath, ["--version"], { encoding: "utf8", env: environment, shell: false });
if (versionRun.status !== 0 || versionRun.signal !== null || versionRun.error) throw new Error("FIX09_CAPTURE_TOOL_VERSION");
const versionText = `${versionRun.stdout || versionRun.stderr || ""}`.trim();
const toolVersion = versionText.split(/\r?\n/, 1)[0];
if (toolVersion.length === 0) throw new Error("FIX09_CAPTURE_TOOL_VERSION");
const startedAt = new Date().toISOString();
const run = child.spawnSync(toolPath, argv.slice(1), {
  cwd: process.cwd(), env: environment, shell: false, stdio: ["ignore", stdoutFd, stderrFd],
});
const endedAt = new Date().toISOString();
fs.fsyncSync(stdoutFd); fs.fsyncSync(stderrFd);
fs.closeSync(stdoutFd); fs.closeSync(stderrFd);
fs.chmodSync(stdoutPath, 0o400); fs.chmodSync(stderrPath, 0o400);
const stdout = fs.readFileSync(stdoutPath);
const stderr = fs.readFileSync(stderrPath);
const exitCode = run.status === null ? null : String(run.status);
const signal = run.signal === null ? null : String(run.signal);
let observed = "";
let contentPass = false;
if (kind === "status_only") { contentPass = true; }
if (kind === "stdout_empty") { observed = String(stdout.length); contentPass = stdout.length === 0; }
if (kind === "stdout_nonempty") { observed = String(stdout.length); contentPass = stdout.length > 0; }
if (kind === "stdout_exact_base64") { observed = stdout.toString("base64"); contentPass = observed === expected; }
if (kind === "stdout_sha40") { observed = stdout.toString("utf8").trim(); contentPass = /^[0-9a-f]{40}$/.test(observed); }
if (kind === "stdout_sha64") { observed = stdout.toString("utf8").trim(); contentPass = /^[0-9a-f]{64}$/.test(observed); }
if (kind === "stdout_lines_exact_json") {
  observed = stable(stdout.toString("utf8").split("\n").filter((line) => line.length > 0));
  contentPass = observed === expected;
}
if (kind === "streams_exact_base64_json") {
  observed = stable({stderr:stderr.toString("base64"),stdout:stdout.toString("base64")});
  contentPass = observed === expected;
}
const passed = exitCode === expectedRcText && signal === null && contentPass;
const command = {
  schema: "fix09-task0-command/v1", id, ordinal, cwd: fs.realpathSync(process.cwd()), argv,
  argv_sha256: hash(Buffer.from(stable(argv))),
  tool: { path: toolPath, version: toolVersion },
  environment: ["LANG=C", "LC_ALL=C", "TZ=UTC", "GIT_TERMINAL_PROMPT=0"],
  started_at: startedAt, ended_at: endedAt, exit_code: exitCode, signal,
  stdout: { path: stdoutName, bytes: String(stdout.length), sha256: hash(stdout), mode: "0400" },
  stderr: { path: stderrName, bytes: String(stderr.length), sha256: hash(stderr), mode: "0400" },
  assertion: { kind, expected, observed, passed },
};
const bytes = Buffer.from(stable(command));
const temporary = `${commandPath}.tmp-${process.pid}-${crypto.randomBytes(12).toString("hex")}`;
const manifestFd = fs.openSync(temporary, "wx", 0o600);
fs.writeFileSync(manifestFd, bytes); fs.fsyncSync(manifestFd); fs.closeSync(manifestFd);
fs.renameSync(temporary, commandPath); fs.chmodSync(commandPath, 0o400);
const rootFd = fs.openSync(root, fs.constants.O_RDONLY); fs.fsyncSync(rootFd); fs.closeSync(rootFd);
if (!passed) process.exit(1);
FIX09_CAPTURE_NODE
}
```

The function invokes its child as an argv vector with `shell=false`; the only shell expansion is ordinary quoted element substitution at the call site. No command string is evaluated. It writes stdout/stderr and real child status before evaluating `passed`.

The finalizer is also literal:

```bash
fix09_finalize_capture() {
  local evidence_root="$1"
  local ledger_json="$2"
  node - "$evidence_root" "$ledger_json" <<'FIX09_FINALIZE_NODE'
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const [rootInput, ledgerText] = process.argv.slice(2);
const stable = (value) => value === null || typeof value === "boolean" || typeof value === "string"
  ? JSON.stringify(value)
  : Array.isArray(value) ? `[${value.map(stable).join(",")}]`
  : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const root = fs.realpathSync(rootInput);
const ledger = JSON.parse(ledgerText);
if (stable(ledger) !== ledgerText || !Array.isArray(ledger) || ledger.length === 0) throw new Error("FIX09_LEDGER_FORMAT");
const manifests = fs.readdirSync(root).filter((name) => name.endsWith(".command.json")).sort().map((name) => {
  const bytes = fs.readFileSync(path.join(root, name));
  const value = JSON.parse(bytes.toString("utf8"));
  if (stable(value) !== bytes.toString("utf8") || value.assertion.passed !== true) throw new Error("FIX09_COMMAND_INVALID");
  for (const stream of [value.stdout, value.stderr]) {
    const target = path.join(root, stream.path);
    const body = fs.readFileSync(target);
    if (hash(body) !== stream.sha256 || String(body.length) !== stream.bytes ||
        (fs.statSync(target).mode & 0o777) !== 0o400) throw new Error("FIX09_ARTIFACT_INVALID");
  }
  return value;
});
if (manifests.length !== ledger.length) throw new Error("FIX09_COMMAND_COUNT");
for (let index = 0; index < ledger.length; index += 1) {
  const expected = ledger[index]; const actual = manifests[index];
  if (actual.ordinal !== String(index + 1) || actual.id !== expected.id ||
      stable(actual.argv) !== stable(expected.argv) || actual.exit_code !== expected.exit_code ||
      actual.assertion.kind !== expected.assertion_kind || actual.assertion.expected !== expected.assertion_expected) {
    throw new Error("FIX09_LEDGER_MISMATCH");
  }
}
const expectedFiles = manifests.flatMap((value) => [value.stdout.path, value.stderr.path,
  `${value.ordinal.padStart(3, "0")}-${value.id}.command.json`]).sort();
const actualFiles = fs.readdirSync(root).filter((name) => !name.startsWith("manifest.json.tmp-")).sort();
if (stable(actualFiles) !== stable(expectedFiles)) throw new Error("FIX09_EVIDENCE_EXTRA");
const aggregate = { schema: "fix09-task0-evidence-manifest/v1", evidence_root: root,
  command_count: String(manifests.length), commands: manifests };
const output = path.join(root, "manifest.json");
const temporary = `${output}.tmp-${process.pid}-${crypto.randomBytes(12).toString("hex")}`;
const fd = fs.openSync(temporary, "wx", 0o600);
fs.writeFileSync(fd, Buffer.from(stable(aggregate))); fs.fsyncSync(fd); fs.closeSync(fd);
fs.renameSync(temporary, output); fs.chmodSync(output, 0o400);
const rootFd = fs.openSync(root, fs.constants.O_RDONLY); fs.fsyncSync(rootFd); fs.closeSync(rootFd);
fs.chmodSync(root, 0o500);
FIX09_FINALIZE_NODE
}
```

---

### Task 0: Produce and independently review the closed admission receipts

**Files:**

- Create only later, outside product tree: `../.superpowers/sdd/PLAN-FixAgent/fix09-c35-admission-candidate.receipt`
- Reviewer creates: `../.superpowers/sdd/PLAN-FixAgent/fix09-c35-admission-review.md`
- Reviewer creates last: `../.superpowers/sdd/PLAN-FixAgent/fix09-c35-admission-result.receipt`
- Do not modify any product, test, migration, package, or authority file

**Interfaces:**

- Consumes: independently approved v6 authority commit with parent `2ab5f78f00cde444dc33a99e444dd14aeec9881d`.
- Produces: exact SPEC-v6 candidate and result receipts plus the immutable evidence manifest.

- [ ] **Step 1: Use the exact 39-command base ledger**

The ledger has these ids in this order; no id may be inserted, omitted, or renamed:

```json
["t0-001","t0-002","t0-003","t0-004","t0-005","t0-006","t0-007","t0-008","t0-009","t0-010","t0-011","t0-012","t0-013","t0-014","t0-015","t0-016","t0-017","t0-018","t0-019","t0-020","t0-021","t0-022","t0-023","t0-024","t0-025","t0-026","t0-027","t0-028","t0-029","t0-030","t0-031","t0-032","t0-033","t0-034","t0-035","t0-036","t0-037","t0-038","t0-039"]
```

The exact command purposes/argv/assertions are:

| Id | Literal argv law | rc/assertion |
|---|---|---|
| 001 | `git rev-parse HEAD` | 0 / `stdout_sha40` |
| 002 | `git rev-parse HEAD^` | 0 / exact `2ab5f78f00cde444dc33a99e444dd14aeec9881d\n` |
| 003 | `git show -s --format=%s HEAD` | 0 / exact v6 subject plus LF |
| 004 | `git diff-tree --no-commit-id --name-only -r HEAD` | 0 / exact LF lines `docs/missions/observability-agents/slices/FIX-09/DECISIONS.md`, `docs/missions/observability-agents/slices/FIX-09/PLAN-v6.md`, `docs/missions/observability-agents/slices/FIX-09/SPEC-v6.md` |
| 005 | `git rev-parse HEAD:./docs/missions/observability-agents/slices/FIX-09/DECISIONS.md` | 0 / `stdout_sha40` |
| 006 | `git merge-base HEAD e7b9f6812cafc8808cf5e188cd6440f19beda831` | 0 / exact `2b670d3059c60d7262cf655bd5d402c88100dff3\n` |
| 007 | `git merge-base HEAD 8619b9ab4dbc01fdd166337a641193675b24380a` | 0 / exact `2b670d3059c60d7262cf655bd5d402c88100dff3\n` |
| 008 | `git merge-base e7b9f6812cafc8808cf5e188cd6440f19beda831 24d0b3e5de84876b6b46fa84b13a0a42aa2640a4` | 0 / exact `bd0cd92ebdcd633762af7d4a91d0f8972bc1e2b8\n` |
| 009 | `git worktree add -b codex/fix09-c35-admission /Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fix09-c35-admission AUTHORITY_COMMIT` | 0 / `status_only` |
| 010 | `git -C ADMISSION_WORKTREE status --porcelain=v1 --untracked-files=all` | 0 / `stdout_empty` |
| 011 | `git -C ADMISSION_WORKTREE merge --no-ff --no-commit e7b9f6812cafc8808cf5e188cd6440f19beda831` | 1 / `status_only` |
| 012 | `git -C ADMISSION_WORKTREE diff --name-only --diff-filter=U` | 0 / exact FIX-02 conflict array as lines |
| 013 | `git -C ADMISSION_WORKTREE restore --source=e7b9f6812cafc8808cf5e188cd6440f19beda831 --staged --worktree -- docs/missions/observability-agents/slices/FIX-02/DECISIONS.md` | 0 / `status_only` |
| 014 | `git -C ADMISSION_WORKTREE rev-parse :docs/missions/observability-agents/slices/FIX-02/DECISIONS.md` | 0 / exact FIX-02 resolution blob |
| 015 | `git -C ADMISSION_WORKTREE -c user.name=FIX09-Admission -c user.email=fix09-admission@invalid commit -m chore(obs): admit FIX-02 writer line` | 0 / `status_only` |
| 016 | `git -C ADMISSION_WORKTREE cherry-pick 24d0b3e5de84876b6b46fa84b13a0a42aa2640a4` | 0 / `status_only` |
| 017 | `git -C ADMISSION_WORKTREE diff --name-only --diff-filter=U` | 0 / `stdout_empty` |
| 018 | `git -C ADMISSION_WORKTREE rev-parse HEAD:./tests/unit/fix01-runtime-readiness.test.ts` | 0 / exact readiness blob |
| 019 | `git -C ADMISSION_WORKTREE merge --no-ff --no-commit 8619b9ab4dbc01fdd166337a641193675b24380a` | 1 / `status_only` |
| 020 | `git -C ADMISSION_WORKTREE diff --name-only --diff-filter=U` | 0 / exact FIX-09 conflict array as lines |
| 021 | `git -C ADMISSION_WORKTREE restore --source=AUTHORITY_COMMIT --staged --worktree -- docs/missions/observability-agents/slices/FIX-09/DECISIONS.md` | 0 / `status_only` |
| 022 | `git -C ADMISSION_WORKTREE rev-parse :docs/missions/observability-agents/slices/FIX-09/DECISIONS.md` | 0 / exact captured authority decision blob |
| 023 | `git -C ADMISSION_WORKTREE -c user.name=FIX09-Admission -c user.email=fix09-admission@invalid commit -m chore(obs): admit FIX-09 listener line` | 0 / `status_only` |
| 024 | `git -C ADMISSION_WORKTREE status --porcelain=v1 --untracked-files=all` | 0 / `stdout_empty` |
| 025 | `git -C ADMISSION_WORKTREE rev-parse HEAD` | 0 / `stdout_sha40` |
| 026 | `git -C ADMISSION_WORKTREE rev-parse HEAD^{tree}` | 0 / `stdout_sha40` |
| 027 | `git -C ADMISSION_WORKTREE rev-parse --git-common-dir` | 0 / exact canonical common-dir path plus LF |
| 028 | `git -C ADMISSION_WORKTREE ls-tree -r --full-tree HEAD` followed by the exact fifteen SPEC-v5 source paths as separate argv elements | 0 / exact fifteen mode/blob/path lines |
| 029 | `shasum -a 256` followed by the three frozen C1 source paths as separate argv elements | 0 / exact three digest/path lines |
| 030 | `rg -n` with the fixed occurrence/action INSERT AST-source patterns and the exact admitted production roots | 0 / exact four-writer allowlist lines |
| 031 | `rg -n` with fixed role/grant/schema patterns and exact `migrations/0034_obs_foundation.sql packages/db/src/obs-schema.ts` argv | 0 / nonempty, complete-output SHA-256 cross-bound to receipt |
| 032 | `git for-each-ref --format=%(refname)` | 0 / nonempty; exact line count recorded |
| 033 | `git for-each-ref --format=%(refname) refs/heads refs/remotes` | 0 / nonempty; exact line count recorded |
| 034 | `git worktree list --porcelain` | 0 / nonempty; exact worktree stanza count recorded |
| 035 | `git rev-list --objects --all` | 0 / nonempty; exact zero migration-path matches asserted after capture |
| 036 | `git log --all --name-only --pretty=format:` | 0 / nonempty; exact zero migration-path matches asserted after capture |
| 037 | `node -e TASK0_REF_TIP_SCANNER_SOURCE` with no extra argv | 0 / exact canonical collision sub-result |
| 038 | `node -e TASK0_WORKTREE_SCANNER_SOURCE` with no extra argv | 0 / exact canonical collision sub-result |
| 039 | `node -e TASK0_PAPER_SCANNER_SOURCE` with no extra argv | 0 / exact canonical collision sub-result |

`AUTHORITY_COMMIT` is replaced element-wise by t0-001's validated 40-hex stdout; `ADMISSION_WORKTREE` is replaced element-wise by the fixed SPEC-v6 absolute path. These are the only substitutions. They never pass through `eval`, `sh -c`, splitting, or concatenated option text. `TASK0_*_SOURCE` denotes the literal sources in Steps 2-3 below; the manifest stores their complete source argv element and hash. Every base call is `fix09_capture "$FIX09_TASK0_EVIDENCE_DIR" ID ORDINAL RC KIND EXPECTED --` followed by exactly the printed argv elements.

- [ ] **Step 2: Use the literal collision scanner law**

The three Node scanner sources use only `spawnSync("git", argv, {shell:false})`, require each child status zero, and emit one RFC 8785 object plus LF. Ref-tip scanner enumerates t0-032 refs and runs `git ls-tree -r --name-only --full-tree REF`; worktree scanner parses t0-034 canonical paths and runs `git -C PATH ls-files` plus `git -C PATH ls-files --others --exclude-standard`; paper scanner runs `git grep -n -I -E` for allocation terms at every ref plus `rg --hidden` over each registered worktree, excluding only `.git`, `node_modules`, and private-key material. All compare paths to SPEC-v6's exact regex. Outputs have exactly `schema`, `scope`, `counts`, `matches`; `matches=[]` and every hit count zero. Any child failure, private-path read, duplicate ref/worktree, malformed path, or independent paper claim exits 1 after its own stdout/stderr were captured by `fix09_capture`.

- [ ] **Step 3: Write and validate the exact candidate receipt**

Finalize the base manifest first with `fix09_finalize_capture "$FIX09_TASK0_EVIDENCE_DIR" "$FIX09_TASK0_BASE_LEDGER_JSON"`; it contains exactly t0-001 through t0-039 and seals the directory `0500`. Write SPEC-v6's 32 lines from those captured artifacts using exclusive temp creation, file fsync, atomic rename, directory fsync, and mode `0400`. `TASK0_RECEIPT_VALIDATOR_SOURCE` is the literal parser in Appendix A. It reads raw bytes, rejects BOM/CR/missing final LF; compares the exact field-name array; canonical-reparses every structured value; checks every closed nested schema/type/value; dereferences resolution fields; hashes and validates the base capture manifest/artifacts; replays receipt values from evidence; and verifies Git objects/paths/tree/worktree/common-dir. It contains no permissive spread, default, coercion, or unknown-key path.

In the separate validation directory, run t0-040 as exact argv `node -e TASK0_RECEIPT_VALIDATOR_SOURCE candidate-path base-manifest-path --mutant=none`, expected rc 0 and exact `FIX09_RECEIPT_PASS\n`. Then run the same parser through `fix09_capture "$FIX09_TASK0_VALIDATION_DIR" ...` for the eight hostile ids below. Each uses rc 1 plus `streams_exact_base64_json`; stdout is exactly empty and stderr is the shown LF-terminated line (the ledger stores its base64, never a shell escape):

| Id / mutant | Exact stderr |
|---|---|
| `h0-001 stale-authority` | `FIX09_RECEIPT_FAIL code=FIX09_AUTHORITY_EVIDENCE` |
| `h0-002 wrong-order` | `FIX09_RECEIPT_FAIL code=FIX09_RECEIPT_ORDER` |
| `h0-003 duplicate-field` | `FIX09_RECEIPT_FAIL code=FIX09_RECEIPT_FIELD_COUNT` |
| `h0-004 extra-field` | `FIX09_RECEIPT_FAIL code=FIX09_RECEIPT_FIELD_COUNT` |
| `h0-005 missing-field` | `FIX09_RECEIPT_FAIL code=FIX09_RECEIPT_FIELD_COUNT` |
| `h0-006 wrong-conflict` | `FIX09_RECEIPT_FAIL code=FIX09_FIX02_CONFLICT` |
| `h0-007 wrong-tree` | `FIX09_RECEIPT_FAIL code=FIX09_TREE_GIT` |
| `h0-008 noncanonical-json` | `FIX09_RECEIPT_FAIL code=FIX09_RECEIPT_NONCANONICAL` |

The exact receipt-validation ledger is `["t0-040","h0-001","h0-002","h0-003","h0-004","h0-005","h0-006","h0-007","h0-008"]`, with ordinals 1 through 9. Each mutant is generated only in that mode-0700 directory, is mode `0400`, and never replaces the candidate. Finalize it with `fix09_finalize_capture "$FIX09_TASK0_VALIDATION_DIR" "$FIX09_TASK0_VALIDATION_LEDGER_JSON"`; the result is the `receipt_validation_manifest_sha256` input.

- [ ] **Step 4: Finalize and obtain independent review**

The reviewer reads v4/v5/v6, PLAN-v4/v5/v6, the candidate, both closed manifests, all artifacts, graph/conflicts/blobs, collision/source/C1 maps, and hostile controls. The reviewer writes the report first, computes its hash, then alone writes the exact 17-line result receipt, including the validation-manifest hash. A separate readback runs Appendix A against candidate+base-manifest+result and must print only `FIX09_ADMISSION_RESULT_PASS\n`; Task 1 later captures this readback, so the result never hashes its own validation. Task 1 remains STOP until this passes.

---

### Task 1: Check in the capture gate and frozen test manifest

**Files:**

- Create: `tools/fix09-capture-gate.mjs`
- Create: `tests/unit/fix09-capture-gate.test.ts`
- Create: `tests/unit/fixtures/fix09-gate-manifest.json`

**Interfaces:**

- Consumes: sealed Task 0 receipts.
- Produces: the same capture-before-assert mechanics plus Vitest JSON validation and exact Appendix B manifest.

- [ ] **Step 1: Write the one exact RED test**

The only full name is `FIX-09 evidence capture > captures immutable child evidence and rejects every closed hostile control`; it table-tests zero selection, wrong name/count/summary/rc, skipped/todo, truncation, duplicate id, pre-existing path, argv drift, and extra manifest keys. Run once through the Task 0 runner. Expected selected files 1, tests 1, child rc nonzero before the module exists; the captured RED assertion names `MODULE_NOT_FOUND`.

- [ ] **Step 2: Check in the literal implementation**

`tools/fix09-capture-gate.mjs` uses the exact Node capture body above. It adds only: strict parsing of Appendix B's closed manifest; Vitest JSON `testResults[].assertionResults[].ancestorTitles/title/status` collection; exact selected-file and constructed full-name set/order equality; exact positive count; zero failed/skipped/todo; and summary emission after evidence files/manifests are fsynced and validated. It accepts only:

```text
node tools/fix09-capture-gate.mjs --manifest tests/unit/fixtures/fix09-gate-manifest.json --gate GATE --run 1|2|3 -- COMMAND ARGV
```

There is no other option/default/environment override. Success stdout is exactly `FIX09_GATE_PASS gate=GATE run=RUN files=FILES tests=TESTS failed=0 skipped=0 todo=0\n`; success stderr is empty. Failure stdout is empty and stderr is exactly `FIX09_GATE_FAIL code=CODE gate=GATE run=RUN\n`; runner exit is 1. Child nonzero is evidence, never runner success except the one manifest-declared RED gate.

- [ ] **Step 3: Run the exact Task 1 gate three times**

Literal child argv:

```json
["pnpm","exec","vitest","run","--reporter=json","tests/unit/fix09-capture-gate.test.ts"]
```

Run ids 1, 2, 3 use fresh mode-0700 directories. Each must select exactly the one file and one full name above and emit exact summaries ending `files=1 tests=1 failed=0 skipped=0 todo=0`.

---

### Task 2: Apply the exact detail predicate and probe contract

**Files:**

- Modify future C3.5 files authorized by PLAN-v5 Tasks 2 and 4 only
- Test: `tests/integration/fix09-chain-occurrence.test.ts`
- Test: `tests/architecture/fix09-chain-grants.test.ts`

- [ ] **Step 1: Make the exact occurrence test RED**

Use Appendix B's one full occurrence name. Table cases must cover every SPEC-v6 §1 case and assert SQLSTATE/marker/cardinality/rollback. Run the `c35-focused` gate once with manifest expected failure naming the absent v2 detail contract.

- [ ] **Step 2: Implement only the v6 delta**

Normalize `DETAIL_PRESENT` from `cause_chain_codes.length`; construct the v2 tuple and null/v1 detail argument; map the four routine args to exact columns; implement zero/MATCH/CONFLICT and `FIX09_PROBE_CARDINALITY`; preserve owner/search-path/revoke/lock/transaction laws. Do not change action comparator or any generated exclusion.

- [ ] **Step 3: Run exact occurrence and grants gates three times**

Use the Appendix B argv/name/count and anchored summaries. No name/count amendment is allowed without a separately reviewed successor manifest.

---

### Task 3: Separate witness authorization from the row keyring

**Files:**

- Modify future C3.5/C4 chain activation/key/witness/verifier files authorized by PLAN-v5
- Test: `tests/unit/fix09-chain-keys.test.ts`
- Test: `tests/unit/fix09-watchdog-journal.test.ts`
- Test: `tests/integration/fix09-chain-lifecycle.test.ts`
- Test: `tests/integration/fix09-watchdog-verify.test.ts`
- Test: `tests/integration/fix09-watchdog.test.ts`

- [ ] **Step 1: Make exact key/journal/watchdog tests RED**

Use only Appendix B's five corresponding full names. Cases cover activation-pinned SPKI/id, row-keyring independence, invalid/missing row keyring, cold-start three exit-78 codes, post-start activation swap, wrong witness key, transition certificate mutants, planned rotation, recovery, restart, first anchor, new 1,093-byte vector, and public/private separation.

- [ ] **Step 2: Implement activation and transition validation**

Add the three activation fields to the signed body and require row keyring `witness_keys=[]`. Validate root → activation → DB parity → journal certificate chain → private key before row keyring. Add mandatory witness `witness_authorization`; verify V certificate before new-key record signature. Keep v5 recovery checkpoint binding and every six-path permission.

- [ ] **Step 3: Implement exact fail-closed process paths**

Cold start without activation, journal, or key authority emits the exact canonical stderr line/code, zero stdout, no journal/health, exit 78. With last-known-good activation, reject candidate replacement and append signed `VERIFY_UNAVAILABLE/PUBLIC_MATERIAL_UNAVAILABLE`. With valid witness authority and invalid row keyring, append signed exact KEYRING_INVALID. Run the five focused names three times.

---

### Task 4: Run frozen C3.5/C4 manifests and independent review

**Files:**

- Verify only the exact Appendix B files/names
- Create outside product tree: the normal C3.5/C4 review reports required by PLAN-v5

- [ ] **Step 1: Run `c35-focused` three clean times**

Use exactly Appendix B's 16 files and 105 full names. Literal argv is `pnpm exec vitest run --reporter=json` followed by those 16 paths in printed order. Summaries are exactly:

```text
FIX09_GATE_PASS gate=c35-focused run=1 files=16 tests=105 failed=0 skipped=0 todo=0
FIX09_GATE_PASS gate=c35-focused run=2 files=16 tests=105 failed=0 skipped=0 todo=0
FIX09_GATE_PASS gate=c35-focused run=3 files=16 tests=105 failed=0 skipped=0 todo=0
```

- [ ] **Step 2: Run `c4-focused` three clean times**

Use exactly Appendix B's 20 files and 109 full names. Literal argv is `pnpm exec vitest run --reporter=json` followed by those 20 paths in printed order. Summaries are exactly:

```text
FIX09_GATE_PASS gate=c4-focused run=1 files=20 tests=109 failed=0 skipped=0 todo=0
FIX09_GATE_PASS gate=c4-focused run=2 files=20 tests=109 failed=0 skipped=0 todo=0
FIX09_GATE_PASS gate=c4-focused run=3 files=20 tests=109 failed=0 skipped=0 todo=0
```

- [ ] **Step 3: Re-run all hostile controls and non-test gates**

The capture-runner full name executes exact hostile codes `ZERO_TESTS`, `WRONG_NAME`, `WRONG_COUNT`, `WRONG_SUMMARY`, `CHILD_NONZERO`, `SKIPPED`, `TODO`, `TRUNCATED_JSON`, `DUPLICATE_ID`, `PREEXISTING_PATH`, `ARGV_DRIFT`, `EXTRA_KEY`. Typecheck argv is exactly `["pnpm","typecheck"]`, expected rc 0, stdout/stderr captured before the exact runner summary. Frozen-hash, receipt, collision, source-writer, schema/ACL, protocol/vector, permission, private-material, placeholder, diff-scope, and forbidden-act audits each have closed manifest entries with literal argv and expected rc/output hash; unknown entries are invalid.

- [ ] **Step 4: Obtain independent reviews in the binding stage order**

Retain PLAN-v5 order: reviewed C3.5, separately authorized/reviewed FIX-10 C0, C4, reviewed C4, then V-only acts. Review packets include both admission receipts, every evidence manifest, exact name/count arrays, three summaries, worst duration, source/frozen/collision proof, and no-live-act statement. Require explicit SPEC PASS and CODE QUALITY PASS with zero P0-P3.

---

## Appendix A — literal receipt parser/readback

The Task 0 parser uses this exact line parser and canonicalizer; the schema-specific assertions are the literal SPEC-v6 constants, not caller input:

```js
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const child = require("node:child_process");
const candidateFields = [
  "schema","authority_commit","authority_parent","authority_tree","integration_base",
  "fix01_shared_base","fix01_tip","fix02_head","fix09_head","composition_order",
  "merge_fix02_conflict_paths","merge_fix02_resolution_blob","cherry_pick_fix01_conflict_paths",
  "merge_fix09_conflict_paths","merge_fix09_resolution_blob","composition_result_commits",
  "branch_name","worktree_canonical_path","git_common_dir_canonical_path","c35_baseline",
  "c35_tree","clean_porcelain_sha256","source_blob_map","source_blob_extensions","writer_map",
  "writer_map_sha256","c1_pin_map","schema_grant_probe_sha256","migration_collision_counts",
  "migration_collision_scope","migration_collision_evidence_sha256","capture_evidence_manifest_sha256",
];
const resultFields = [
  "schema","candidate_receipt_path","candidate_receipt_sha256","admission_review_report_path",
  "admission_review_report_sha256","receipt_validation_manifest_sha256","reviewer","reviewed_authority_commit","reviewed_c35_baseline",
  "reviewed_c35_tree","spec_verdict","code_quality_verdict","p0_count","p1_count","p2_count",
  "p3_count","result",
];
const jsonFields = new Set([
  "composition_order","merge_fix02_conflict_paths","cherry_pick_fix01_conflict_paths",
  "merge_fix09_conflict_paths","composition_result_commits","source_blob_map","source_blob_extensions",
  "writer_map","c1_pin_map","migration_collision_counts","migration_collision_scope",
]);
const stable = (value) => value === null || typeof value === "boolean" || typeof value === "string"
  ? JSON.stringify(value)
  : Array.isArray(value) ? `[${value.map(stable).join(",")}]`
  : typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`
    : (() => { throw new Error("FIX09_RECEIPT_JSON_TYPE"); })();
const exactKeys = (value, keys) => {
  if (stable(Object.keys(value).sort()) !== stable([...keys].sort())) throw new Error("FIX09_RECEIPT_NESTED_KEYS");
};
const parseBytes = (bytes, fields) => {
  if (bytes.length === 0 || bytes[0] === 0xef || bytes.includes(0x0d) || bytes.at(-1) !== 0x0a) throw new Error("FIX09_RECEIPT_BYTES");
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) throw new Error("FIX09_RECEIPT_UTF8");
  const lines = text.slice(0, -1).split("\n");
  if (lines.length !== fields.length) throw new Error("FIX09_RECEIPT_FIELD_COUNT");
  const value = Object.create(null);
  lines.forEach((line, index) => {
    const separator = line.indexOf("=");
    if (separator < 1 || line.indexOf("=", separator + 1) !== -1) throw new Error("FIX09_RECEIPT_LINE");
    const key = line.slice(0, separator); const raw = line.slice(separator + 1);
    if (key !== fields[index] || Object.hasOwn(value, key) || raw.trim() !== raw) throw new Error("FIX09_RECEIPT_ORDER");
    if (jsonFields.has(key)) {
      const parsed = JSON.parse(raw);
      if (stable(parsed) !== raw) throw new Error("FIX09_RECEIPT_NONCANONICAL");
      value[key] = parsed;
    } else value[key] = raw;
  });
  return { bytes, value };
};
const parse = (file, fields) => parseBytes(fs.readFileSync(file), fields);
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const sha40 = (value) => { if (!/^[0-9a-f]{40}$/.test(value)) throw new Error("FIX09_RECEIPT_SHA40"); };
const sha64 = (value) => { if (!/^[0-9a-f]{64}$/.test(value)) throw new Error("FIX09_RECEIPT_SHA64"); };
const count = (value) => { if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error("FIX09_RECEIPT_COUNT"); };
```

The exact source continues immediately with this block; there is no text or caller-supplied source between the two blocks:

```js
const FIXED = {
  schema: "fix09-c35-admission-candidate/v1",
  authority_parent: "2ab5f78f00cde444dc33a99e444dd14aeec9881d",
  integration_base: "2b670d3059c60d7262cf655bd5d402c88100dff3",
  fix01_shared_base: "bd0cd92ebdcd633762af7d4a91d0f8972bc1e2b8",
  fix01_tip: "24d0b3e5de84876b6b46fa84b13a0a42aa2640a4",
  fix02_head: "e7b9f6812cafc8808cf5e188cd6440f19beda831",
  fix09_head: "8619b9ab4dbc01fdd166337a641193675b24380a",
  merge_fix02_resolution_blob: "0e2ffc4fc4f148520f228a9f69014f2ad7d5416c",
  branch_name: "codex/fix09-c35-admission",
  worktree_canonical_path: "/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fix09-c35-admission",
  git_common_dir_canonical_path: "/Users/vladmihaimiron/Documents/DebateAIRO/.git",
  clean_porcelain_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
};
const SOURCE = {
  "migrations/0034_obs_foundation.sql":"ace8fa889f24a3d23b79cbaa78878a2238d07b76",
  "migrations/0061_obs_job_lifecycle_taxonomy.sql":"380d4aa1922e4774741b97222ad764c0028ec3a0",
  "migrations/0062_fix09_listener_fold.sql":"ac5e3b4d6a87260bc9b6d0764295fe4cbcb1b72b",
  "packages/db/src/obs-schema.ts":"bcd2fac36c2460eb8b3d681a7c3ee914a8ce065e",
  "packages/obs-capture/src/envelope-contract.ts":"4a70449252231e2a4fe4eeb27eb9478309bf386b",
  "packages/obs-capture/src/runtime/config.ts":"5e8c1c0d62f18c1e174c58c98acb06ac60f9360a",
  "packages/obs-capture/src/runtime/drain.ts":"430421090da76a2340f0089853e6efb1ea66813f",
  "packages/obs-capture/src/runtime/index.ts":"73a77fee4d66c9dd66b36b7ee0590c4ee5846bbf",
  "packages/obs-capture/src/runtime/sink.ts":"b8bf01beb38d10e80eceec92af298d0480ae6a37",
  "tests/unit/fix01-runtime-readiness.test.ts":"17b27ac6a47f511a6cd8b01bdcfbe5bacfcb69dd",
  "tools/obs-listener/src/daemon/dispatch-arm.ts":"9e6e22abc18434d2a0636c1f6e997c0d4db0ea0d",
  "tools/obs-listener/src/daemon/fold.ts":"14b75cf518cf906fee4963e4b920b6de819d8edc",
  "tools/obs-listener/src/daemon/main.ts":"8445d4bff83dc731c94b8bd4d4a1e1e793e1435a",
  "tools/obs-listener/src/daemon/poison.ts":"79714373cf602d4358cabc7acb664a26452f2f04",
  "tools/obs-listener/src/daemon/tracer-hook.ts":"c0e8484cb9e63840a1e87b1fe65c1f769b472759",
};
const WRITERS = [
  "occurrence|packages/obs-capture/src/runtime/sink.ts|writeOccurrences",
  "occurrence|packages/obs-capture/src/runtime/sink.ts|ingestSpooledOccurrence",
  "agent_action|tools/obs-listener/src/daemon/poison.ts|appendSkipReceipt",
  "agent_action|tools/obs-listener/src/daemon/poison.ts|appendPoisonReceipt",
  "future_agent_action|FIX-10|ops|obsctl",
];
const C1 = {
  canonical_policy_bundle_sha256:"aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd",
  "tests/unit/fixtures/fix09-interface-contract.ts":"09650971be03d4ada2c1dd017a1d956d70d3275ddcf1e8045016cc45b92fb550",
  "tools/obs-listener/src/daemon/dispatch-arm.ts":"916fa6cbac52b23dd66d0e7507c468684855ba598c9ecee4d75e00002e053f1c",
  "tools/obs-listener/src/daemon/tracer-hook.ts":"c551c24ea5931acbdc4801d274aedc7bcd4d2b476b1f272ec9507e3e38f4c961",
};
const SCOPE = {
  claim:"migrations/0064_fix09_audit_chain.sql",
  excluded:[".git","node_modules","private-key-material"],
  paper:["all-ref-tips","all-registered-worktrees"],
  path_regex:"(^|/)(migrations|packages/db/src/migrations)/0064[^/]*\\.sql$",
  tracked:["all-reachable-objects","all-reachable-history","all-ref-tip-trees","all-registered-worktrees"],
  untracked:["all-registered-worktrees-nonignored"],
};
const OPS = [
  {expected_conflicts:["docs/missions/observability-agents/slices/FIX-02/DECISIONS.md"],input:FIXED.fix02_head,kind:"merge_no_ff_no_commit",resolution_field:"merge_fix02_resolution_blob"},
  {expected_conflicts:[],input:FIXED.fix01_tip,kind:"cherry_pick",resolution_field:null},
  {expected_conflicts:["docs/missions/observability-agents/slices/FIX-09/DECISIONS.md"],input:FIXED.fix09_head,kind:"merge_no_ff_no_commit",resolution_field:"merge_fix09_resolution_blob"},
];
const git = (cwd, argv) => {
  const run = child.spawnSync("git", argv, {cwd,encoding:"utf8",env:{PATH:process.env.PATH || "",LANG:"C",LC_ALL:"C",TZ:"UTC",GIT_TERMINAL_PROMPT:"0"},shell:false});
  if (run.status !== 0 || run.signal !== null) throw new Error("FIX09_RECEIPT_GIT");
  return run.stdout;
};
const same = (actual, expected, code) => { if (stable(actual) !== stable(expected)) throw new Error(code); };
const manifestObjectKeys = ["schema","evidence_root","command_count","commands"];
const commandKeys = ["schema","id","ordinal","cwd","argv","argv_sha256","tool","environment","started_at","ended_at","exit_code","signal","stdout","stderr","assertion"];
const commandAssertionKinds = new Set(["stdout_exact_base64","stdout_empty","stdout_nonempty","stdout_sha40","stdout_sha64","stdout_lines_exact_json","streams_exact_base64_json","status_only"]);
const validateManifest = (file, expectedIds) => {
  const bytes = fs.readFileSync(file); const text = bytes.toString("utf8"); const value = JSON.parse(text);
  if (!Buffer.from(text).equals(bytes) || stable(value) !== text) throw new Error("FIX09_MANIFEST_CANONICAL");
  if (fs.realpathSync(file) !== path.resolve(file) || fs.lstatSync(file).isSymbolicLink() || (fs.statSync(file).mode & 0o777) !== 0o400) throw new Error("FIX09_MANIFEST_FILE");
  exactKeys(value, manifestObjectKeys); same(value.schema,"fix09-task0-evidence-manifest/v1","FIX09_MANIFEST_SCHEMA");
  count(value.command_count); if (!Array.isArray(value.commands) || value.command_count !== String(expectedIds.length) || value.commands.length !== expectedIds.length) throw new Error("FIX09_MANIFEST_COUNT");
  const root = fs.realpathSync(value.evidence_root); if (root !== value.evidence_root || (fs.statSync(root).mode & 0o777) !== 0o500) throw new Error("FIX09_MANIFEST_ROOT");
  value.commands.forEach((command,index) => {
    exactKeys(command,commandKeys); same(command.schema,"fix09-task0-command/v1","FIX09_COMMAND_SCHEMA");
    same(command.id,expectedIds[index],"FIX09_COMMAND_ID"); same(command.ordinal,String(index+1),"FIX09_COMMAND_ORDINAL");
    if (command.cwd !== "/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/fixagent-plan/dialectical-engine" || !Array.isArray(command.argv) || command.argv.length === 0 || command.argv.some((entry) => typeof entry !== "string" || entry.includes("\0"))) throw new Error("FIX09_COMMAND_ARGV");
    sha64(command.argv_sha256); same(command.argv_sha256,sha256(Buffer.from(stable(command.argv))),"FIX09_COMMAND_ARGV_HASH");
    exactKeys(command.tool,["path","version"]); if (typeof command.tool.path !== "string" || !path.isAbsolute(command.tool.path) || fs.realpathSync(command.tool.path) !== command.tool.path || typeof command.tool.version !== "string" || command.tool.version.length === 0 || /[\r\n]/.test(command.tool.version)) throw new Error("FIX09_COMMAND_TOOL");
    same(command.environment,["LANG=C","LC_ALL=C","TZ=UTC","GIT_TERMINAL_PROMPT=0"],"FIX09_COMMAND_ENV");
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(command.started_at) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(command.ended_at) || command.started_at > command.ended_at) throw new Error("FIX09_COMMAND_TIME");
    if (command.exit_code !== null) count(command.exit_code); if (command.signal !== null) throw new Error("FIX09_COMMAND_SIGNAL");
    exactKeys(command.stdout,["path","bytes","sha256","mode"]); exactKeys(command.stderr,["path","bytes","sha256","mode"]);
    for (const stream of [command.stdout,command.stderr]) {
      if (!/^[0-9]{3}-(?:t0|h0)-[0-9]{3}\.(?:stdout|stderr)$/.test(stream.path) || stream.mode !== "0400") throw new Error("FIX09_ARTIFACT_META");
      count(stream.bytes); sha64(stream.sha256); const target = path.join(root,stream.path); const data = fs.readFileSync(target);
      if ((fs.statSync(target).mode & 0o777) !== 0o400 || String(data.length) !== stream.bytes || sha256(data) !== stream.sha256) throw new Error("FIX09_ARTIFACT_HASH");
    }
    exactKeys(command.assertion,["kind","expected","observed","passed"]); if (!commandAssertionKinds.has(command.assertion.kind) || typeof command.assertion.expected !== "string" || typeof command.assertion.observed !== "string" || command.assertion.passed !== true) throw new Error("FIX09_ASSERTION_FAILED");
    const commandFile = path.join(root,`${String(index+1).padStart(3,"0")}-${command.id}.command.json`);
    if ((fs.statSync(commandFile).mode & 0o777) !== 0o400 || fs.readFileSync(commandFile,"utf8") !== stable(command)) throw new Error("FIX09_COMMAND_FILE");
  });
  const expectedFiles = new Set(["manifest.json",...value.commands.flatMap((command,index) => {
    const prefix = `${String(index+1).padStart(3,"0")}-${command.id}`; return [`${prefix}.stdout`,`${prefix}.stderr`,`${prefix}.command.json`];
  })]);
  same(fs.readdirSync(root).sort(),[...expectedFiles].sort(),"FIX09_MANIFEST_EXTRA_FILE");
  return {bytes,value,root};
};
const validateCandidate = (candidate, candidateBytes, base) => {
  for (const [key,value] of Object.entries(FIXED)) same(candidate[key],value,`FIX09_${key.toUpperCase()}`);
  for (const key of ["authority_commit","authority_parent","authority_tree","integration_base","fix01_shared_base","fix01_tip","fix02_head","fix09_head","merge_fix02_resolution_blob","merge_fix09_resolution_blob","c35_baseline","c35_tree"]) sha40(candidate[key]);
  for (const key of ["clean_porcelain_sha256","writer_map_sha256","schema_grant_probe_sha256","migration_collision_evidence_sha256","capture_evidence_manifest_sha256"]) sha64(candidate[key]);
  same(candidate.composition_order,OPS,"FIX09_COMPOSITION_ORDER");
  same(candidate.merge_fix02_conflict_paths,OPS[0].expected_conflicts,"FIX09_FIX02_CONFLICT"); same(candidate.cherry_pick_fix01_conflict_paths,[],"FIX09_FIX01_CONFLICT"); same(candidate.merge_fix09_conflict_paths,OPS[2].expected_conflicts,"FIX09_FIX09_CONFLICT");
  if (candidate.composition_result_commits.length !== 3) throw new Error("FIX09_COMPOSITION_RESULTS");
  candidate.composition_result_commits.forEach((entry,index) => { exactKeys(entry,["commit","input","kind"]); sha40(entry.commit); same(entry.input,OPS[index].input,"FIX09_COMPOSITION_INPUT"); same(entry.kind,index === 1 ? "cherry_pick" : "merge_no_ff","FIX09_COMPOSITION_KIND"); });
  same(candidate.source_blob_map,SOURCE,"FIX09_SOURCE_MAP"); same(candidate.source_blob_extensions,[],"FIX09_SOURCE_EXTENSION");
  same(candidate.writer_map,WRITERS,"FIX09_WRITER_MAP"); same(candidate.writer_map_sha256,sha256(Buffer.from(stable(WRITERS))),"FIX09_WRITER_HASH"); same(candidate.c1_pin_map,C1,"FIX09_C1_MAP");
  exactKeys(candidate.migration_collision_counts,["all_refs","branch_remote_refs","independent_claim_hits","reachable_history_0064_hits","reachable_object_0064_hits","ref_tip_0064_hits","registered_worktrees","worktree_tracked_0064_hits","worktree_untracked_0064_hits"]);
  for (const [key,value] of Object.entries(candidate.migration_collision_counts)) { count(value); if (key.endsWith("_hits") && value !== "0") throw new Error("FIX09_COLLISION_HIT"); }
  for (const key of ["all_refs","branch_remote_refs","registered_worktrees"]) if (candidate.migration_collision_counts[key] === "0") throw new Error("FIX09_COLLISION_VACUOUS");
  same(candidate.migration_collision_scope,SCOPE,"FIX09_COLLISION_SCOPE"); same(candidate.capture_evidence_manifest_sha256,sha256(base.bytes),"FIX09_BASE_MANIFEST_HASH");
  const commands = Object.fromEntries(base.value.commands.map((command) => [command.id,command]));
  const artifact = (id,stream="stdout") => fs.readFileSync(path.join(base.root,commands[id][stream].path));
  same(candidate.authority_commit,artifact("t0-001").toString("utf8").trim(),"FIX09_AUTHORITY_EVIDENCE");
  same(candidate.schema_grant_probe_sha256,sha256(artifact("t0-031")),"FIX09_GRANT_EVIDENCE"); same(candidate.migration_collision_evidence_sha256,sha256(artifact("t0-039")),"FIX09_COLLISION_EVIDENCE");
  same(git(candidate.worktree_canonical_path,["rev-parse","HEAD"]).trim(),candidate.c35_baseline,"FIX09_BASELINE_GIT"); same(git(candidate.worktree_canonical_path,["rev-parse","HEAD^{tree}"]).trim(),candidate.c35_tree,"FIX09_TREE_GIT");
  same(fs.realpathSync(candidate.worktree_canonical_path),candidate.worktree_canonical_path,"FIX09_WORKTREE_PATH"); same(fs.realpathSync(candidate.git_common_dir_canonical_path),candidate.git_common_dir_canonical_path,"FIX09_COMMON_DIR_PATH");
  same(git(candidate.worktree_canonical_path,["status","--porcelain=v1","--untracked-files=all"]),"","FIX09_WORKTREE_DIRTY");
  same(candidate.c35_baseline,candidate.composition_result_commits[2].commit,"FIX09_FINAL_COMMIT");
  if (candidateBytes.length === 0) throw new Error("FIX09_CANDIDATE_EMPTY");
};
const mutate = (bytes,name) => {
  const lines = bytes.toString("utf8").slice(0,-1).split("\n");
  if (name === "stale-authority") lines[1] = `authority_commit=${"0".repeat(40)}`;
  else if (name === "wrong-order") [lines[0],lines[1]] = [lines[1],lines[0]];
  else if (name === "duplicate-field") lines.splice(1,0,lines[0]);
  else if (name === "extra-field") lines.push("extra=forbidden");
  else if (name === "missing-field") lines.splice(9,1);
  else if (name === "wrong-conflict") lines[10] = "merge_fix02_conflict_paths=[]";
  else if (name === "wrong-tree") lines[20] = `c35_tree=${"0".repeat(40)}`;
  else if (name === "noncanonical-json") lines[9] = lines[9].replace("=[{", "=[ {");
  else throw new Error("FIX09_MUTANT_UNKNOWN");
  return Buffer.from(`${lines.join("\n")}\n`);
};
try {
  const argv = process.argv.slice(2); const option = argv.at(-1); if (!/^--mutant=(?:none|stale-authority|wrong-order|duplicate-field|extra-field|missing-field|wrong-conflict|wrong-tree|noncanonical-json)$/.test(option || "")) throw new Error("FIX09_ARGV");
  const mutant = option.slice(9); const positional = argv.slice(0,-1); if (positional.length !== 2 && positional.length !== 4) throw new Error("FIX09_ARGV");
  const rawCandidate = fs.readFileSync(positional[0]); const candidateParsed = parseBytes(mutant === "none" ? rawCandidate : mutate(rawCandidate,mutant),candidateFields);
  const base = validateManifest(positional[1],Array.from({length:39},(_,index) => `t0-${String(index+1).padStart(3,"0")}`)); validateCandidate(candidateParsed.value,candidateParsed.bytes,base);
  if (mutant !== "none") throw new Error("FIX09_MUTANT_ACCEPTED");
  if (positional.length === 4) {
    const resultParsed = parse(positional[2],resultFields); const validation = validateManifest(positional[3],["t0-040","h0-001","h0-002","h0-003","h0-004","h0-005","h0-006","h0-007","h0-008"]); const result = resultParsed.value;
    same(result.schema,"fix09-c35-admission-result/v1","FIX09_RESULT_SCHEMA"); same(result.candidate_receipt_path,"../.superpowers/sdd/PLAN-FixAgent/fix09-c35-admission-candidate.receipt","FIX09_RESULT_CANDIDATE_PATH"); same(result.candidate_receipt_sha256,sha256(rawCandidate),"FIX09_RESULT_CANDIDATE_HASH");
    same(result.admission_review_report_path,"../.superpowers/sdd/PLAN-FixAgent/fix09-c35-admission-review.md","FIX09_RESULT_REPORT_PATH"); const reportBytes = fs.readFileSync(path.resolve(process.cwd(),result.admission_review_report_path)); sha64(result.admission_review_report_sha256); same(result.admission_review_report_sha256,sha256(reportBytes),"FIX09_RESULT_REPORT_HASH");
    const reportLines = reportBytes.toString("utf8").split("\n"); for (const line of ["SPEC VERDICT: SPEC PASS","CODE QUALITY VERDICT: CODE QUALITY PASS","UNRESOLVED: P0=0 P1=0 P2=0 P3=0"]) if (reportLines.filter((entry) => entry === line).length !== 1) throw new Error("FIX09_RESULT_REPORT_VERDICT");
    same(result.receipt_validation_manifest_sha256,sha256(validation.bytes),"FIX09_RESULT_VALIDATION_HASH"); same(result.reviewer,"Sol","FIX09_RESULT_REVIEWER"); same(result.reviewed_authority_commit,candidateParsed.value.authority_commit,"FIX09_RESULT_AUTHORITY"); same(result.reviewed_c35_baseline,candidateParsed.value.c35_baseline,"FIX09_RESULT_BASELINE"); same(result.reviewed_c35_tree,candidateParsed.value.c35_tree,"FIX09_RESULT_TREE");
    same(result.spec_verdict,"SPEC PASS","FIX09_RESULT_SPEC"); same(result.code_quality_verdict,"CODE QUALITY PASS","FIX09_RESULT_QUALITY"); for (const key of ["p0_count","p1_count","p2_count","p3_count"]) same(result[key],"0","FIX09_RESULT_FINDINGS"); same(result.result,"PASS","FIX09_RESULT_PASS");
    process.stdout.write("FIX09_ADMISSION_RESULT_PASS\n");
  } else process.stdout.write("FIX09_RECEIPT_PASS\n");
} catch (error) {
  const code = error && typeof error.message === "string" && /^FIX09_[A-Z0-9_]+$/.test(error.message) ? error.message : "FIX09_RECEIPT_UNEXPECTED";
  process.stderr.write(`FIX09_RECEIPT_FAIL code=${code}\n`); process.exit(1);
}
```

The receipt-validation calls supply `candidate-path base-manifest-path --mutant=NAME`. Final admission readback supplies `candidate-path base-manifest-path result-path validation-manifest-path --mutant=none`. No other arity or option is valid.

## Appendix B — closed post-Task1 test manifest

The fifteen authority-defined files each contain exactly one top-level test with these full names:

```json
{
"tests/unit/fix09-capture-gate.test.ts":["FIX-09 evidence capture > captures immutable child evidence and rejects every closed hostile control"],
"tests/unit/fix09-chain-canonical.test.ts":["FIX-09 chain canonical protocol > proves every public row, genesis, signature, link, JSON boundary, and mutation vector"],
"tests/unit/fix09-chain-keys.test.ts":["FIX-09 chain keys > proves Ed25519 identity, activation witness authority, path custody, rotation, recovery, and private-material absence"],
"tests/unit/fix09-watchdog-journal.test.ts":["FIX-09 watchdog journal > proves the exact gapless activation-anchored wire, V transition certificates, and atomic append"],
"tests/integration/fix09-chain-migration.test.ts":["FIX-09 chain migration on real PostgreSQL > proves the exact forward-only schema, legacy microseconds, probes, constraints, and rollback"],
"tests/integration/fix09-chain-occurrence.test.ts":["FIX-09 chained occurrences on real PostgreSQL > proves exact detail presence, replay, locks, ordering, signing, concurrency, and atomic rollback"],
"tests/integration/fix09-chain-action.test.ts":["FIX-09 chained actions on real PostgreSQL > proves exact replay, locks, ordering, signing, FIX-10 compatibility, and atomic rollback"],
"tests/integration/fix09-chain-lifecycle.test.ts":["FIX-09 chain lifecycle on real PostgreSQL > proves activation, planned rotation, V-signed recovery, forward rollback, and fail-closed loss"],
"tests/integration/fix09-watchdog-verify.test.ts":["FIX-09 watchdog verification on real PostgreSQL > proves read-only legacy, chain, keyring, witness-authorization, recovery, and mutation verdicts"],
"tests/integration/fix09-watchdog.test.ts":["FIX-09 watchdog process > proves authorized invalid-keyring records, cold-start exit 78, last-known-good activation, health, and privacy"],
"tests/architecture/fix09-chain-grants.test.ts":["FIX-09 chain grants > proves exact roles, routine ownership, fixed search paths, bounded returns, ACLs, and denials"],
"tests/architecture/fix09-chain-writers.test.ts":["FIX-09 chain writer architecture > proves all current and future writers use only the shared gateways"],
"tests/architecture/fix09-chain-privacy.test.ts":["FIX-09 chain privacy > proves public-only verification, descriptor trust, safe journals, and absence of private or user material"],
"tests/architecture/fix09-fix10-chain-contract.test.ts":["FIX-09 FIX-10 dependency > proves ops obsctl deterministic replay through the action gateway and DB-free markers"],
"tests/architecture/fix09-launchd.test.ts":["FIX-09 dormant launchd templates > proves placeholder-only configuration, least privilege, and zero service operation"]
}
```

The five immutable adjacent files contribute exactly 94 further names, listed below. Their input is FIX-09 `8619b9ab4dbc01fdd166337a641193675b24380a`; Task 0 refuses any name/count/source-blob drift.

```json
{
"tests/unit/fix09-bundle.test.ts":[
"FIX-09 C1 policy bundle > loads the complete fail-closed phase-one policy",
"FIX-09 C1 policy bundle > reproduces the bundle hash without importing the loader",
"FIX-09 C1 policy bundle > matches the independently recorded taxonomy and registry pins",
"FIX-09 C1 policy bundle > never dispatches inherited Hash update or digest during authority decisions",
"FIX-09 C1 policy bundle > refuses every hostile Array.prototype.push shape before Zod can execute it",
"FIX-09 C1 policy bundle > contains every hostile Array.prototype.push shape before loader initialization",
"FIX-09 C1 policy bundle > validates through the declared Zod schema under the supported tsx runtime",
"FIX-09 C1 policy bundle > resolves private Zod validation independently of process cwd",
"FIX-09 C1 policy bundle > does not consult the live CommonJS resolver for private Zod",
"FIX-09 C1 policy bundle > does not run a live fileURLToPath callback after policy initialization",
"FIX-09 C1 policy bundle > does not dispatch the exported refusal error superclass before custodian authentication",
"FIX-09 C1 policy bundle > does not dispatch the recoverable schema error superclass before custodian authentication",
"FIX-09 C1 policy bundle > does not dispatch the load error superclass outside its typed boundary",
"FIX-09 C1 policy bundle > pins only derived error constructors and preserves lawful error subclass behavior",
"FIX-09 C1 policy bundle > statically rejects unfrozen nested and expression derived constructors",
"FIX-09 C1 policy bundle > retains no uncaptured ambient authority member or constructor",
"FIX-09 C1 policy bundle > does not trust live Atomics results as declared-schema authority",
"FIX-09 C1 policy bundle > does not construct a live Worker for declared-schema authority",
"FIX-09 C1 policy bundle > keeps main-realm regex and push callbacks outside Zod validation",
"FIX-09 C1 policy bundle > isolates self-restoring Zod callbacks from hashing and token authority",
"FIX-09 C1 policy bundle > keeps authority on captured crypto calls after builtin export synchronization",
"FIX-09 C1 policy bundle > keeps proxy rejection on the captured builtin after export synchronization",
"FIX-09 C1 policy bundle > keeps custodian proxy checks on the captured builtin",
"FIX-09 C1 policy bundle > keeps bundle reads on the captured builtin after export synchronization",
"FIX-09 C1 policy bundle > does not overreach to an unreachable Object.prototype.push neighbour",
"FIX-09 C1 policy bundle > hashes semantic JSON independently of object key order and whitespace",
"FIX-09 C1 policy bundle > ignores inherited toJSON getters and returned functions on both prototypes",
"FIX-09 C1 policy bundle > never invokes an inherited toJSON data function",
"FIX-09 C1 policy bundle > contains throwing inherited toJSON getters across hash, load, and repin",
"FIX-09 C1 policy bundle > keeps inherited non-function toJSON data as a lawful neighbor",
"FIX-09 C1 policy bundle > encodes JSON primitives byte-identically without object serialization",
"FIX-09 C1 policy bundle > never dispatches inherited array helpers or iterators across C1 authority",
"FIX-09 C1 policy bundle > denies every enumerated floor sample without swallowing a neighbouring product path",
"FIX-09 C1 policy bundle > fails closed when a candidate path is not repo-relative",
"FIX-09 C1 policy bundle > rejects duplicate JSON members before last-member-wins parsing",
"FIX-09 C1 policy bundle > requires every policy member to be own plain JSON data",
"FIX-09 C1 policy bundle > accepts lawful null-prototype records and returns the same safe shape",
"FIX-09 C1 policy bundle > does not let Object.prototype supply a missing quick_arm",
"FIX-09 C1 policy bundle > returns the frozen own snapshot under non-writable prototype pollution",
"FIX-09 C1 policy bundle > projects every numeric index safely and refuses polluted schema execution",
"FIX-09 C1 policy bundle > refuses every inherited non-writable numeric index without weakening clean validation",
"FIX-09 C1 policy bundle > does not classify non-index numeric spellings as array pollution",
"FIX-09 C1 policy bundle > does not expose numeric-prototype mutation through a live descriptor replacement",
"FIX-09 C1 policy bundle > does not let Object.prototype supply missing nested members",
"FIX-09 C1 policy bundle > runs cross-field checks against the own snapshot",
"FIX-09 C1 policy bundle > returns failure for all missing value fields without invoking a prototype getter",
"FIX-09 C1 policy bundle > returns failure for all missing value fields over non-writable prototype data",
"FIX-09 C1 policy bundle > rejects all accessor-backed value fields without consulting a prototype getter",
"FIX-09 C1 policy bundle > rejects all accessor-backed value fields over matching inherited data",
"FIX-09 C1 policy bundle > rejects all proxy-normalized value descriptors before any trap or getter",
"FIX-09 C1 policy bundle > rejects all proxy-normalized value descriptors over matching inherited data",
"FIX-09 C1 policy bundle > rejects top-level and nested proxies before reflective traps",
"FIX-09 C1 policy bundle > maps revoked policy, request, environment, and nested proxies to bounded refusal",
"FIX-09 C1 policy bundle > bounds cycles and over-cap graphs before recursive reflection",
"FIX-09 C1 policy bundle > rejects accessor-backed hash input without invoking the accessor",
"FIX-09 C1 policy bundle > refuses a repin unless the one recorded custodian token matches",
"FIX-09 C1 policy bundle > refuses an authenticated next_bundle accessor without invoking it",
"FIX-09 C1 policy bundle > does not let descriptor prototypes authenticate a token or select a bundle",
"FIX-09 C1 policy bundle > rejects proxy-normalized token and bundle descriptors before traps",
"FIX-09 C1 policy bundle > refuses inherited or descriptor-trapping next_bundle data",
"FIX-09 C1 policy bundle > rejects a proxy in the request prototype chain before its traps",
"FIX-09 C1 policy bundle > rejects a proxy policy before its first prototype trap",
"FIX-09 C1 policy bundle > maps every missing or malformed token to REPIN_REFUSED",
"FIX-09 C1 policy bundle > lets the custodian populate a deferred hash slot without changing its gate",
"FIX-09 C1 policy bundle > rejects a second custodian instead of widening custody",
"FIX-09 C1 policy bundle > freezes the tracer seam and leaves the dispatch arm memberless"
],
"tests/unit/fix09-fold.test.ts":[
"FIX-09 C2 deterministic intake > accepts scheduler failures and returns the exact skip cases",
"FIX-09 C2 deterministic intake > maps every invalid boundary to one closed poison reason",
"FIX-09 C2 incident projection > uses structured declared-pair or source-event work keys",
"FIX-09 C2 incident projection > recomputes stable aggregates by composite identity, work unit, severity, time, and source",
"FIX-09 C2 incident projection > derives UI-only ineligibility without persisting a parallel state",
"FIX-09 C2 incident projection > accepts exactly the closed incident transition graph"
],
"tests/unit/fix09-tier-gate.test.ts":[
"FIX-09 C3 deterministic tier gate > labels a small first-party code root QUICK but keeps approval-first while quick_arm is OFF",
"FIX-09 C3 deterministic tier gate > lets the immutable floor dominate size and uses only closed denial reasons",
"FIX-09 C3 deterministic tier gate > labels any floor-clear internal shape above a QUICK bound PR_FIX and approval-first",
"FIX-09 C3 deterministic tier gate > uses canonical incident identity and ordering in the input hash",
"FIX-09 C3 deterministic tier gate > fails closed without evaluating hostile accessors or emitting raw/free text",
"FIX-09 C3 deterministic tier gate > evaluates 1,000 fixed-seed inputs twice to byte-identical policy-decision payloads"
],
"tests/architecture/fix09-no-model.test.ts":[
"FIX-09 C3 zero-model daemon > loads main through a real resolve trace with no model, CLI, provider, child-process, or db-package edge",
"FIX-09 C3 zero-model daemon > runs the real daemon, persists its closed policy result, and writes zero budget rows"
],
"tests/integration/fix09-daemon.test.ts":[
"FIX-09 C2 listener migration on real PostgreSQL > uses composite incident identity with exact Drizzle parity",
"FIX-09 C2 listener migration on real PostgreSQL > publishes commit-aware wake hints without changing occurrence triggers or listener grants",
"FIX-09 C2 listener transaction lock on real PostgreSQL > excludes the same occurrence key, releases on rollback, and preserves read-only grants",
"FIX-09 C2 atomic delivery on real PostgreSQL > serializes direct same-occurrence attempts and rechecks ACK after the lock",
"FIX-09 C2 atomic delivery on real PostgreSQL > folds or terminally receipts rows before ACK and advances only a contiguous cursor",
"FIX-09 C2 atomic delivery on real PostgreSQL > rolls operational SQL failure back and succeeds on retry",
"FIX-09 C2 atomic delivery on real PostgreSQL > rolls poison action and health back when ACK insertion fails",
"FIX-09 C2 atomic delivery on real PostgreSQL > isolates delivered aggregates by fingerprint version and keeps replay idempotent",
"FIX-09 C2 atomic delivery on real PostgreSQL > reuses deterministic skip and poison receipts when ACK is absent",
"FIX-09 C2 serialized listener daemon on real PostgreSQL > rejects incomplete configuration and distrusts malformed notification payloads",
"FIX-09 C2 serialized listener daemon on real PostgreSQL > pins the cap-one selector, global lock, and hint-only dependency surface",
"FIX-09 C2 serialized listener daemon on real PostgreSQL > LISTENs before leadership and notification wakes work before a long poll",
"FIX-09 C2 serialized listener daemon on real PostgreSQL > polls missed wakes and drains FATAL-first then occurrence-time/sequence order at cap one",
"FIX-09 C2 serialized listener daemon on real PostgreSQL > keeps one leader, promotes a standby, and reconnects LISTEN-first after loss"
]
}
```

The `task1-runner` manifest is the one-file/one-name first entry of the 15-file object. The `c35-focused` manifest is exactly the first eleven authority-defined files in printed order plus all five adjacent files above in printed order: 16 files and 105 names. The `c4-focused` manifest is all fifteen authority-defined files plus all five adjacent files in those orders: 20 files and 109 names. The checked-in runner constructs each observed name as `assertionResults[].ancestorTitles.join(" > ") + " > " + assertionResults[].title` and compares exact ordered arrays; it does not trust a reporter-computed display string.
