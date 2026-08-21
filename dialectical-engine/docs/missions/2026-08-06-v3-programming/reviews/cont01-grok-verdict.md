GREENLIGHT

Independent Grok lens for CONT-01 / ticket t_0b9a22a0 / packet `CONT-01-review-packet.md`. Standard applied: V's law (verbatim security ruling 2026-08-17) — spawn every relay CLI in an empty scratch directory; no local-file searches inside the project. Judged from the working-tree sources and `git` status/diff, not from the author handoff. The orchestrator's "live gate already passed" sentence is **not** treated as proof: `cont01-live-gate.mts` was not found in the implementer scratch, mission logs, or mission reviews. Peer-lens verdicts were not read.

## 1. Every relay CLI spawn, including boot handshakes, flows through isolated `invokeCli`

**Claim holds.**

The only `child_process.spawn` of a vendor CLI is `invokeCli` in `acceptance/relay-core.ts:89-96`, and that spawn now always sets `cwd: scratchDirectory`. HTTP completions call the same function (`acceptance/relay-core.ts:175`). Every boot handshake and discovery probe also calls `invokeCli`:

- Codex handshake: `acceptance/model-shim.ts:171`
- Claude handshake: `acceptance/claude-relay.ts:134`
- Grok handshake: `acceptance/grok-relay.ts:110`
- Discovery probe: `acceptance/discovery.ts:88`

Repo-wide `spawn` / `execFile` / `execSync` search found no other vendor-binary path. Remaining hits are non-relay tools (`tools/check-text-control-bytes.ts` git ls-files; `web/app/api/[...path]/route.test.mjs` tsc; `apps/v2-ui/scripts/run-node-tests.mjs`; test harnesses). No `spawn`/`exec` of `codex` / `claude` / `grok` bypasses `invokeCli`.

## 2. Scratch dir is fresh per process, empty at spawn, outside the repo, not reread

**Claim holds.**

`acceptance/relay-core.ts:86-92`:

```ts
const makerSlug = adapter.maker.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cli";
const scratchDirectory = await mkdtemp(join(tmpdir(), `relay-${makerSlug}-`));
// ...
cwd: scratchDirectory,
```

- Fresh per process: `mkdtemp` runs on every `invokeCli` call (handshake and each completion).
- Naming: `OpenAI` → `relay-openai-*`, `Anthropic` → `relay-anthropic-*`, `xAI` → `relay-xai-*`.
- Location: `os.tmpdir()`, not a path under the repo.
- Empty at spawn: `mkdtemp` creates a new empty directory; the three cwd-probe tests assert `entries === []` after `readdirSync(process.cwd())`.
- Not reread: `scratchDirectory` is used only as `spawn` `cwd`. `invokeCli` never `readdir`/`readFile`s it after spawn. Codex lineage still reads `~/.codex/sessions` via `parseCodexCompletion` (`acceptance/model-shim.ts:130-138`) — that is the pre-existing session tree, not the scratch dir.

Residual (does **not** fail the claim): Node `spawn({ cwd })` isolates POSIX cwd but inherits `env.PWD`. A one-off probe showed child `process.cwd()` = scratch while `process.env.PWD` still named `.../DebateAI-V3`. V's specified mechanism is the empty scratch cwd; no evidence the vendor CLIs search the project via inherited `PWD`. Not used as a block.

## 3. Codex flags exist in the real installed binary and do not break envelope / DR-115 lineage

**Claim holds** for flag presence and parser/lineage source. Live vendor handshake was **not** re-run (script absent) and is not cited as proof.

Binary `/Applications/ChatGPT.app/Contents/Resources/codex` exists (Mach-O arm64, 218437552 bytes, 2026-08-11). `codex exec --help` (exit 0) documents every flag the shim now passes (`acceptance/model-shim.ts:146-154`):

| Flag in shim | Present in real `exec --help` |
|---|---|
| `--skip-git-repo-check` | yes (help line 81: "Allow running Codex outside a Git repository") |
| `--sandbox` `read-only` | yes (`-s, --sandbox`; possible values include `read-only`, help lines 59-62) |
| `--ignore-rules` | yes (help line 90: "Do not load user or project execpolicy `.rules` files") |
| `--ignore-user-config` | yes (help line 87: "Do not load `$CODEX_HOME/config.toml`; auth still uses `CODEX_HOME`") |

`git diff` on `acceptance/model-shim.ts` changes **only** `buildArguments` (adds those four flags). `parseCodexStdout` / `parseCodexCompletion` / `parseCodexRolloutModel` are byte-unchanged. Lineage is still the CLI-reported thread id resolved against the persisted rollout (`acceptance/model-shim.ts:84-108, 130-138`); the existing test still expects verbatim `gpt-5.6-sol` from the fixture (`acceptance/model-shim.test.ts:69`). `--ephemeral` was **not** added, so session files still persist for that lookup.

`cont01-live-gate.mts` was not found; the packet's "orchestrator live gate already passed" sentence is discarded as proof.

## 4. Tests would catch a cwd regression (F1)

**Claim holds.** The three new probes drive the real `startModelShim` / `startClaudeRelay` / `startGrokRelay` entry points with an inline `node -e` script that prints **its own** `process.cwd()` and `readdirSync(process.cwd())` — not a hardcoded scratch-looking string.

Assertions that pin the law (`acceptance/model-shim.test.ts:53-55`, `acceptance/claude-relay.test.ts:59-61`, `acceptance/grok-relay.test.ts:53-55`):

1. cwd basename matches `/relay-<maker>-[^/\\]+$/`
2. cwd is not the project and not inside the project: `relative(process.cwd(), probe.cwd)` is neither `""` nor a non-`..` relative path
3. `entries` is `[]` (empty at spawn)

F1 false-pass cases from the packet:

- Probe that would print a scratch dir even if cwd were unset: **these probes would not**. They call `process.cwd()`. Unset `cwd` inherits the vitest project dir → regex fails, inside-repo check fails (`fromProject === ""`), `entries` is not empty.
- Assertions that do not pin "not inside the repo": **they do** (the `relative`/`isAbsolute` check).
- Assertions that do not pin empty-at-spawn: **they do** (`entries` `toEqual([])`).

A probe cwd of `project/subdir` fails the inside-repo check. A non-empty temp dir fails `entries`. A differently named outside dir fails the `relay-<maker>-` regex.

Residual (does **not** fail the claim): the probes assert the **completion** spawn, not a second independent handshake observation. Handshake and completion share the single `invokeCli` spawn site; removing `cwd` there fails the POST assertion. A future handshake-only bypass would need a new spawn site, which claim 1's static search would still catch.

## 5. Scope audit

**Claim holds.** No product package, register, or migration edits.

`git status --porcelain` (parent repo `DebateAIRO`, workspace `DebateAI-V3`):

```
 M .claude/launch.json
 M DebateAI-V3/acceptance/claude-relay.test.ts
 M DebateAI-V3/acceptance/grok-relay.test.ts
 M DebateAI-V3/acceptance/model-shim.test.ts
 M DebateAI-V3/acceptance/model-shim.ts
 M DebateAI-V3/acceptance/relay-core.ts
?? DebateAI-V3/docs/missions/2026-08-06-v3-programming/logs/CONT-01-packet.md
?? DebateAI-V3/docs/missions/2026-08-06-v3-programming/logs/run-cont01-grok.sh
?? DebateAI-V3/docs/missions/2026-08-06-v3-programming/reviews/CONT-01-review-packet.md
```

Authorized author files match the packet. `git diff --name-only` on `packages`, `apps`, `web`, `src`, `register`, `migrations` is empty. Mandated progress log exists at `docs/missions/2026-08-06-v3-programming/logs/CONT-01-progress.log` (author log; not a product edit).

Known-context dirt **not** used as a block: `../.claude/launch.json`; untracked `CONT-01-packet.md`; untracked `CONT-01-review-packet.md` (this packet); untracked `run-cont01-grok.sh` (orchestrator review-seat wrapper, not product).

## 6. Claude/Grok envelope parsers byte-unchanged; targeted tests green

**Claim holds.**

`git diff -- acceptance/claude-relay.ts acceptance/grok-relay.ts` is empty. `parseClaudeEnvelope` (`acceptance/claude-relay.ts:56-90`) and `parseGrokEnvelope` (`acceptance/grok-relay.ts:29-73`) were not touched. Claude/Grok `buildArguments` were not touched.

Command actually run from the DebateAI-V3 root (not the orchestrator's remembered result):

```
./node_modules/.bin/vitest run --config acceptance/vitest.config.ts model-shim.test claude-relay.test grok-relay.test
```

Result: **25 passed / 25** (3 files). Captured in implementer scratch `cont01-vitest.log`. Existing lineage/envelope/failure tests in those files stayed green, including Codex `gpt-5.6-sol` fixture lineage and the Grok captured-envelope replay (`grok-4.6-build`).

Pre-existing full-acceptance 48/50 (ceremony `NODE_REVIEW_UNAVAILABLE`; runtime-policy 74 vs 88) is known context and is not a CONT-01 block.

## DELTA VERDICT

GREENLIGHT

Independent Grok delta re-review of CONT-01 / ticket t_0b9a22a0 F-6 / F-7 / F-8 rework. Judged from the current working tree and the authorized-set `git diff` only. First-pass body above is left intact; only the named claim-2 PWD residual is re-opened. Peer-lens verdict and author/orchestrator “already passed” sentences were not treated as proof. Product/acceptance sources were not edited in this seat.

### (1) Claim-2 PWD residual is closed

**Holds.** Every vendor CLI spawn goes through `invokeCli` (`acceptance/relay-core.ts:80-129`). The spawn now passes an explicit env that overwrites both inherited directory names to the scratch directory:

```ts
// acceptance/relay-core.ts:89-96
const child = spawn(command.binary, [...command.prefixArguments, ...adapter.buildArguments(prompt)], {
  cwd: scratchDirectory,
  env: { ...process.env, PWD: scratchDirectory, OLDPWD: scratchDirectory },
  stdio: ["ignore", "pipe", "pipe"]
});
```

`scratchDirectory` is `mkdtemp(join(await realpath(tmpdir()), \`relay-${makerSlug}-\`))` (`acceptance/relay-core.ts:86-87`), so the values written into `PWD`/`OLDPWD` match the resolved POSIX cwd the child will observe.

The three cwd-probes now print the child’s own `process.env.PWD` / `process.env.OLDPWD` (not a hardcoded scratch-looking string) and assert both equal the probe `cwd`:

- Codex: `acceptance/model-shim.test.ts:30,59-60` — `expect(probe.pwd).toBe(probe.cwd)` and `expect(probe.oldpwd).toBe(probe.cwd)`; cwd still `/relay-openai-[^/\\]+$/`, outside the repo, `entries === []`.
- Claude: `acceptance/claude-relay.test.ts:41,63-64` — same `pwd`/`oldpwd` pin on `/relay-anthropic-*`.
- Grok: `acceptance/grok-relay.test.ts:35,57-58` — same pin on `/relay-xai-*`.

First-pass residual (child `process.cwd()` = scratch while `process.env.PWD` still named `.../DebateAI-V3`) is closed on this tree.

### (2) Env spread does not strip vendor auth (DR-179)

**Holds.** The env object is a full `{ ...process.env, … }` spread with **only** `PWD` and `OLDPWD` overwritten (`acceptance/relay-core.ts:93`). There is no allowlist, denylist, or filter that would drop `HOME`, `CODEX_HOME`, or other vendor auth-store variables. Auth-bearing keys remain enumerable properties of `process.env` and are copied through. DR-179 is preserved by construction.

### (3) Cleanup cannot fail or delay a completion

**Holds**, judged from the close-handler control flow — **not** from the “dir eventually disappears” poll.

```ts
// acceptance/relay-core.ts:110-128
child.once("close", (code) => {
  clearTimeout(timer);
  void rm(scratchDirectory, { recursive: true, force: true }).catch(() => undefined);
  if (timedOut) {
    reject(new CliRelayFailure("TIMEOUT", adapter.timeoutCode));
    return;
  }
  if (code !== 0) {
    reject(new CliRelayFailure("FAILED", adapter.failureCode));
    return;
  }
  try {
    resolve(adapter.parseCompletion(Buffer.concat(stdout).toString("utf8"), prompt));
  } catch (error) {
    reject(error);
  }
});
```

Evidence that a failed or slow `rm` cannot change a completion:

- `void rm(...)` is not `await`ed; the Promise is scheduled and discarded.
- `.catch(() => undefined)` swallows rejection; cleanup errors cannot become the settlement value.
- `resolve` / `reject` run synchronously after scheduling `rm`, on the TIMEOUT, FAILED, and success paths alike. A hanging `rm` cannot delay HTTP settlement.
- Cleanup is not on the `parseCompletion` success path and is not composed into the returned Promise.

`acceptance/model-shim.test.ts:62` (`await expect.poll(() => existsSync(probe.cwd)).toBe(false)`) only proves the directory is eventually reaped. That poll is **not** used as proof that cleanup cannot delay completion; the source `void`/`catch`/immediate settle is.

Residual (does **not** fail the item): spawn `error` (`acceptance/relay-core.ts:106-109`) still rejects without scheduling `rm`. F-8 required cleanup on the existing close/exit path; a spawn-error leak cannot delay or fail a completion.

### (4) Argv pin matches the flags verified in the real binary

**Holds.** The Codex pin is an exact-order full-argv equality, not `arrayContaining`:

```ts
// acceptance/model-shim.test.ts:106-114
expect(relayed.arguments).toEqual([
  "exec",
  "--skip-git-repo-check",
  "--sandbox", "read-only",
  "--ignore-rules",
  "--ignore-user-config",
  "--json",
  relayed.prompt
]);
```

That list is the shipped `buildArguments` (`acceptance/model-shim.ts:146-154`): `exec`, `--skip-git-repo-check`, `--sandbox` `read-only`, `--ignore-rules`, `--ignore-user-config`, `--json`, then the prompt.

Real binary `/Applications/ChatGPT.app/Contents/Resources/codex exec --help` exited 0. Captured at implementer scratch `codex-exec-help.txt`. Every pinned flag is present:

| Flag in shim / pin | Present in captured `exec --help` |
|---|---|
| `--skip-git-repo-check` | yes (line 74: “Allow running Codex outside a Git repository”) |
| `--sandbox` `read-only` | yes (`-s, --sandbox`; possible values include `read-only`, lines 52-55) |
| `--ignore-rules` | yes (line 83: “Do not load user or project execpolicy `.rules` files”) |
| `--ignore-user-config` | yes (line 80: “Do not load `$CODEX_HOME/config.toml`; auth still uses `CODEX_HOME`”) |
| `--json` | yes (line 95: “Print events to stdout as JSONL”) |

No new flags were added beyond the first-pass set.

### (5) No scope creep

**Holds.** Authorized-set review only.

`git status --porcelain` (parent repo `DebateAIRO`, workspace `DebateAI-V3`), captured at `{SCRATCH}/cont01-delta-status.txt`:

```
 M .claude/launch.json
 M DebateAI-V3/acceptance/claude-relay.test.ts
 M DebateAI-V3/acceptance/grok-relay.test.ts
 M DebateAI-V3/acceptance/model-shim.test.ts
 M DebateAI-V3/acceptance/model-shim.ts
 M DebateAI-V3/acceptance/relay-core.ts
?? DebateAI-V3/docs/missions/2026-08-06-v3-programming/logs/CONT-01-packet.md
?? DebateAI-V3/docs/missions/2026-08-06-v3-programming/logs/CONT-01-rework-packet.md
?? DebateAI-V3/docs/missions/2026-08-06-v3-programming/logs/run-cont01-grok-delta.sh
?? DebateAI-V3/docs/missions/2026-08-06-v3-programming/logs/run-cont01-grok.sh
?? DebateAI-V3/docs/missions/2026-08-06-v3-programming/logs/run-cont01-rework-codex.sh
?? DebateAI-V3/docs/missions/2026-08-06-v3-programming/reviews/CONT-01-review-packet.md
?? DebateAI-V3/docs/missions/2026-08-06-v3-programming/reviews/cont01-grok-verdict.md
?? DebateAI-V3/docs/missions/2026-08-06-v3-programming/reviews/cont01-opus-verdict.md
```

`git diff --name-only` on `packages`, `apps`, `web`, `src`, `register`, `migrations` is empty. `git diff -- acceptance/claude-relay.ts acceptance/grok-relay.ts` is empty (envelope parsers still byte-unchanged). Mandated progress log exists at `docs/missions/2026-08-06-v3-programming/logs/CONT-01-progress.log` and is not dirty in git.

Known-context dirt **not** used as a block: `../.claude/launch.json`; untracked CONT-01 packet / rework-packet / review-packet / wrapper scripts; this verdict file; peer-lens `cont01-opus-verdict.md` (unread).

Rework increment inside the authorized files is F-7 env rewrite + probe `pwd`/`oldpwd` pins, F-6 exact `toEqual` argv, and F-8 `void rm(...).catch(...)`. `realpath(tmpdir())` is the F-7 companion so assigned `PWD` equals the resolved child cwd on macOS temp-dir symlinks. No product, register, or migration edits; no extra flags.

### Focused suite

Command run twice from the DebateAI-V3 root:

```
./node_modules/.bin/vitest run --config acceptance/vitest.config.ts model-shim.test claude-relay.test grok-relay.test
```

- Run 1: exit 0, **25 passed / 25** (3 files). `{SCRATCH}/cont01-delta-vitest.log`
- Run 2: exit 0, **25 passed / 25** (3 files). `{SCRATCH}/cont01-delta-vitest-2.log`

Existing lineage / envelope / failure cases in those files stayed green, including Codex `gpt-5.6-sol` fixture lineage, the Grok captured-envelope replay, and the FAILED / TIMEOUT loud-error paths.
