# CONT-01 goal packet — Relay containment: empty-cwd spawn, no project file access

Board `debateai-v3`, ticket CONT-01. Coding seat: Codex (GPT-5.6-Sol), roster DR-153.
Progress log (append one line per major step):
`docs/missions/2026-08-06-v3-programming/logs/CONT-01-progress.log`

## V's law (verbatim, 2026-08-17 — ruling provenance for this ticket)

> "Spawn every relay CLI in an empty scratch directory. NO LOCAL FILES
> SEARCHES INSIDE MY PROJECT, cause thats a security breach"

This is a SECURITY ruling. Scope it like one: the acceptance relay layer
(the debate-transport CLIs) must not be able to read the project even when
a vendor CLI misbehaves.

## The defect (live evidence, 2026-08-17)

Run `8f1175db-cd79-4d0a-bdbf-1922d2bb72b2` FAILED
(`ACCEPTANCE_EXECUTION_FAILED:NODE_REVIEW_UNAVAILABLE`) because the grok
CLI, invoked by the relay as a review transport, went agentic and searched
the workspace instead of returning the review JSON. Proof artifacts (in
`ledger.raw_artifact`, all three `parse_status=PARSE_FAILED`, parse_error
"No parsing strategy produced a JSON object"):
- `308bddf4-8651-46c9-a402-fde180fcab2d` — "I'll load the heartbeat-protocol
  skill… The workspace has no `apps/dialectical-engine`."
- `9af3f65b-e429-4ce1-8e96-914efbb06988`
- `e0d90ca5-b4db-4999-9602-41a3e27d2b22`

Its statements match the real workspace (a "MoR" search hitting
"polarity"), so this was real file access, not role-play — despite the
grok adapter's containment flags (`--tools ""`, `--no-memory`,
`--no-subagents`, `--disable-web-search`). Root causes:

1. `acceptance/relay-core.ts` `invokeCli()` spawns every relay CLI with
   **no `cwd` option** — children inherit the engine's cwd = the repo.
2. `acceptance/model-shim.ts` invokes `codex exec --json <prompt>` with
   **no containment flags at all** (agentic mode, reads AGENTS.md, sandboxed
   tools) — since FAIR-02.
3. `acceptance/claude-relay.ts` has `--tools ""` +
   `--no-session-persistence` (skills cannot EXECUTE) but `claude -p`
   still loads workspace/user context text by default.
4. Vendor flags can silently change meaning on CLI updates (the grok
   regression above). Flags alone are not containment.

## Contract (what DONE means)

1. **Empty-cwd spawn (the core fix):** every relay CLI process — codex
   shim, claude relay, grok relay, including the boot handshakes — is
   spawned with `cwd` set to a **freshly created empty scratch directory**
   (per relay start, e.g. `mkdtemp` under the OS temp dir, name prefixed
   `relay-<maker>-`). Never the repo, never any ancestor of the repo.
   HOME and env stay untouched (the CLIs need their own auth stores —
   DR-179 CLI-relay law is unchanged).
2. **The scratch dir must stay empty** — the relay writes nothing into it;
   if a CLI litters it, that is the CLI's business; the relay never reads
   from it.
3. **Regression tests (TDD — red first):** using the existing
   `testOnlyCommand`/`resolveTestGuardedCommand` seam, a fake binary that
   prints its own cwd; assert (a) cwd is the scratch dir, (b) it is not
   the repo root nor inside it, (c) the dir is empty at spawn. One test
   per adapter path (shim, claude, grok) or one shared relay-core test if
   all three provably route through the same spawn — prove it if so.
4. **Additional hardening where the vendor supports it** (verify against
   the REAL installed binaries — the F3 law; do not invent flags):
   - codex: add the strictest non-agentic/no-repo flags `codex exec`
     actually supports on this machine (check `codex exec --help`);
     at minimum it must run with the empty cwd.
   - grok/claude: keep existing flags; do not remove any.
5. **No behavior change to envelopes:** the three envelope parsers and
   lineage honesty (DR-115 verbatim model ids) byte-unchanged. Existing
   relay tests stay green.
6. **File contract (touch nothing else):** `acceptance/relay-core.ts`,
   `acceptance/model-shim.ts`, `acceptance/claude-relay.ts`,
   `acceptance/grok-relay.ts`, and their `.test.ts` files. If the fix
   lands entirely in relay-core with adapter-level tests, prefer that
   smaller shape. NO product package changes; NO register changes; NO
   migrations. If you believe the contract must widen, STOP and post
   CODEX BLOCKED on the ticket instead of widening it yourself.
7. **Out of scope:** the fleet coding/review seats (you, the reviewers) —
   they are AUTHORIZED to read the repo; only the acceptance relay layer
   is being contained. Also out of scope: a boot-time bait-file
   containment probe (proposed, unruled — do not build it).

## Gates before READY

- `pnpm vitest run acceptance/model-shim.test.ts acceptance/claude-relay.test.ts acceptance/grok-relay.test.ts` green (plus any relay-core test you add).
- Full unit gate you normally run for acceptance-layer changes.
- Live handshake gates run OUTSIDE your sandbox by the orchestrator (codex
  + grok live; claude is currently logged out — the orchestrator gates it
  as blocked-on-V, not you).

## Return rule (spine §4)

Return control at READY FOR PEER REVIEW (post it as a ticket comment with
the diff summary + test evidence), a genuine blocker (CODEX BLOCKED with
exact reason), or an IMPORTANT OPERATION. Keep the unfinished session
resumable. Silence is normal. Termination requires FULLY DONE (both
diamond lenses greenlight — that happens after your handoff).
