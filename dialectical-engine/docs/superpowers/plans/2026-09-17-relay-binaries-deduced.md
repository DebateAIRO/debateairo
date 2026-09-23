# Relay binaries deduced, never hard-coded — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No maker relay carries a path that exists on one computer only. When the operator sets no `ACCEPTANCE_*_BINARY` key, the relay finds its CLI by name on PATH the way `command -v` does; whatever it resolves must be a real, non-empty, executable file, or the relay refuses with a typed code that names the path and the reason.

**Architecture:** `acceptance/relay-core.ts` already funnels every relay's binary through one resolver, `resolveConfiguredBinary(defaultBinary, environmentKey, unresolvedCode, source)` (`:145-155`), whose first argument is today a compiled-in absolute path. The resolver keeps its env-key contract (a present-but-blank key refuses loudly) and gains PATH discovery by NAME in place of the default path, plus an existence/emptiness/executability check on the resolved path. The four call sites hand over a binary NAME instead of a path.

**Tech Stack:** TypeScript (ESM, strict), Node `fs`/`path`, vitest; the fake CLIs under `acceptance/test-fixtures/`.

## Global Constraints

- Repository: worktree `/Users/stefannour/DebateAIRO/debateairo/.claude/worktrees/algo-loop-2026-09-16`, engine root `dialectical-engine/` (run every command from there). Base commit `9c439935`, branch `mission/2026-09-16-algorithm-live-loop-continuation`. Never `cd` to the main checkout; never touch another worktree; plain, separate git commands.
- Allowed writes: `acceptance/**` (code, tests, README). Forbidden: everything else. A change outside the allowed set is BLOCKED — report it, do not make it.
- **V's rule (2026-09-17), verbatim:** "we should never put named paths in the code, only relative paths, since this code is run on multiple computers, so if we have something particular to a computer, it would break on the others. If it needs to be set to something local, it needs to be deduced first, never set in stones."
- Never run a real `claude`/`codex`/`grok`/`hermes` binary; never Docker; never the full test suite; never push. Tests use fake executables you create in a temporary directory placed on a PATH you construct for the test.
- Three-run law: every suite you cite is run three times at the final tip, passed/total per run. RED before GREEN, frames quoted. Both typechecks: `pnpm run typecheck` (blind to `acceptance/`) AND `pnpm exec tsc -p acceptance/tsconfig.json --noEmit`.
- Commit messages: conventional prefix; sign as the model you are.

---

### Task 1: Discovery by name, and a resolved path that must run

**Files:**
- Modify: `acceptance/relay-core.ts:128-155` (the resolver and its doc comment)
- Modify: `acceptance/claude-relay.ts:29-42` (`CLAUDE_BINARY = "/Users/vladmihaimiron/.local/bin/claude"`, `resolveClaudeBinary`), `acceptance/grok-relay.ts:13-22` (`GROK_BINARY = "/Users/vladmihaimiron/.grok/bin/grok"`, `resolveGrokBinary`), `acceptance/model-shim.ts:16-27` (`CODEX_BINARY = "/Applications/ChatGPT.app/Contents/Resources/codex"`, `resolveCodexBinary`), `acceptance/hermes-relay.ts:22,140` (`HERMES_BINARY = join(homedir(),".local","bin","hermes")`)
- Modify: `acceptance/README.md` — wherever it describes how a maker binary is found (grep `ACCEPTANCE_CLAUDE_BINARY`, `compiled-in`)
- Test: `acceptance/relay-core.test.ts`, `acceptance/claude-relay.test.ts:365-435` (today: "keeps the compiled-in default when ACCEPTANCE_CLAUDE_BINARY is absent", "resolves this host's binary from …", "fails loudly with a typed code when … present but blank"), `acceptance/grok-relay.test.ts`, `acceptance/model-shim.test.ts`, `acceptance/hermes-relay.test.ts` — re-measure the exact cases before you touch them

**Interfaces:**
- Consumes: `resolveConfiguredBinary` (`acceptance/relay-core.ts:145` — `export function resolveConfiguredBinary(defaultBinary: string, environmentKey: string, unresolvedCode: string, source: NodeJS.ProcessEnv = process.env): string`); the env keys `ACCEPTANCE_CLAUDE_BINARY` (`claude-relay.ts:34`), `ACCEPTANCE_GROK_BINARY` (`grok-relay.ts:18`), `ACCEPTANCE_CODEX_BINARY` (`model-shim.ts:23`); the unresolved codes `CLAUDE_CLI_BINARY_UNRESOLVED`, `GROK_CLI_BINARY_UNRESOLVED`, `CODEX_CLI_BINARY_UNRESOLVED` (`:35`, `:19`, `:24`); the `CommandSpec` each relay builds at `claude-relay.ts:231`, `grok-relay.ts:239`, `model-shim.ts:193`, `hermes-relay.ts:140`.
- Produces: the same four `resolve*Binary()` names with the same return type (a path string) and the same throw style (a plain `Error` whose message begins with the maker's unresolved code — `run-acceptance.ts` records that message verbatim as the provider probe's `failureCode`, and `acceptance/absent-makers.ts` prints it; keep those readers working, and check `acceptance/absent-makers.ts` + `run-acceptance.test.ts:66-170` for any pin on the exact message).

**Outcomes:**

- O1. Order of resolution, for every maker: (1) the env key, when present and non-blank, names the binary (a path, or a bare name to look up); (2) a present-but-blank key refuses loudly, as today; (3) an absent key means discovery by the maker's NAME (`claude`, `codex`, `grok`, `hermes`) across the directories of `PATH` (the env `source`'s `PATH`, split on the platform delimiter), first match wins — the rule `command -v` applies. No compiled-in path remains: `grep -rn '/Users/\|/Applications/\|homedir()' acceptance --include='*.ts' | grep -v test-fixtures | grep -v '\.test\.'` returns nothing.
- O2. Whatever (1) or (3) resolved must, with symlinks followed, be an existing regular file that is non-empty, executable by the current user, AND a program by its first bytes — a `#!` shebang, or a Mach-O magic number (`cf fa ed fe` / `ce fa ed fe` and their byte-swapped forms) or a universal-binary magic (`ca fe ba be`); otherwise a typed refusal `<UNRESOLVED_CODE>:<REASON>:<path>` where REASON ∈ {`NOT_ON_PATH`, `NOT_FOUND`, `EMPTY`, `NOT_EXECUTABLE`, `NOT_A_PROGRAM`} — the exact vocabulary is yours, but each reason is distinct and the path is in the message. Two real cases from 2026-09-17 must be caught: `~/.local/bin/claude` → a 0-byte `…/versions/2.1.274` left by an interrupted update (EMPTY); and `/opt/homebrew/bin/codex` → a `codex.js` whose content had been overwritten with four lines of plain text (NOT_A_PROGRAM) — a shell that cannot execute a file runs it as a script, so that one re-ran itself forever and filled the Mac's process table. The relays spawn without a shell (`spawn(command.binary, …)` at `relay-core.ts:167`), which is right; keep it that way, and never route a candidate through `sh -c`, `exec`, or a shell wrapper anywhere in `acceptance/`.
- O3. Tests, RED first, over a temporary directory you put on a constructed `PATH` (never the real one): discovery finds a fake executable by name; PATH order is respected; absent everywhere → `NOT_ON_PATH`; a dangling symlink → `NOT_FOUND`; an empty file → `EMPTY`; a non-executable file → `NOT_EXECUTABLE`; the env key still wins over PATH; a blank key still refuses; the four relays' `resolve*Binary` all go through the one resolver (a source-level or behavioural pin, your choice). Per-assertion refutation mutants, red at the site, restored.
- O4. `acceptance/README.md` describes the rule and the order (key → PATH by name → refusal), in plain words, and no longer mentions a compiled-in default.
- O5. Gate at the final tip, three runs each: `acceptance/relay-core.test.ts`, `acceptance/claude-relay.test.ts`, `acceptance/grok-relay.test.ts`, `acceptance/model-shim.test.ts`, `acceptance/hermes-relay.test.ts`, `acceptance/boot-relays.test.ts`, `acceptance/run-acceptance.test.ts`, `acceptance/fake-cli-environment.test.ts`, `tests/architecture/s7-authorization-contract.test.ts` (5/6 expected — the `:98` red is pre-existing), `tests/unit/t15-eval-harness.test.ts`; both typechecks. A command that may exceed ten minutes is detached to a log.

- [ ] **Step 1: Read** the resolver and its doc comment, the four call sites, the existing tests at the lines named, `absent-makers.ts` and `run-acceptance.test.ts:66-170` (the message readers).
- [ ] **Step 2: RED** — the O3 tests against the behaviour you have not written; quote the failing frames.
- [ ] **Step 3: GREEN** — the resolver, the four call sites, the README.
- [ ] **Step 4: Mutants** — one per new assertion, red at the site, restored; the matrix in your report.
- [ ] **Step 5: Gate** — O5, both typechecks, the `/Users/` grep empty.
- [ ] **Step 6: Commit** in small conventional commits; report status, commits, a one-line test summary and concerns; the full account in the report file the dispatch names.
