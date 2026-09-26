# REV(S02) pass 1 of 3 — lens security/data-safety — verdict PASS

- seat: REV-PES-S02-p1-security-data-safety · ticket t_757b953b · blind Claude Opus subagent a21437c61cb7e53b5 (V-17 roster ruling) · 2026-09-25 16:25–16:40 EEST
- worktree: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s02-rev-sd/dialectical-engine`, detached at `dfef0de94` (the slice head); dirty 0 at start and at end; the `--ignored` path set is identical at start and end
- base `origin/dev` @ `776359c3` · package `.hermes/reports/provider-env-selection/review-packages/S02-p1/`
- probes, all under `.hermes/reports/provider-env-selection/probes/REV-PES-S02-p1-security-data-safety/` (P below). Every script takes the worktree as argv, so it runs from any lane. Logs and evidence sit beside the scripts; run output sits in `P/scratch/`.

## VERDICT

**VERDICT PASS (security/data-safety lens, pass 1) / CONFIDENCE high / STRONGEST COUNTER:** the admission case works only because the hosted loopback refusal checks the host as written and never resolves it (N3). The acceptance proves this property, not a weakness it introduced. A reader could still argue that a security lens should hold the slice until V rules on whether hosted mode should resolve names. It is not held: the behaviour is on base, R2.6 of the frozen SPEC names it as the design, and no hosted deployment reaches a plaintext loopback relay, because `https:` is required first (`packages/providers/src/index.ts:646-647`).

There are no blocking findings. Five non-blocking findings follow (N1–N5), each for a ticket through the orchestrator.

## What I verified, how, and the output

### Charge 3 — every PLAN §3 cluster command, re-run from `P/run-clusters.sh`

`P/run-clusters-run1.out` (logs `P/C1-run1.log`, `P/C2-run1.log`, `P/C3-run1.log`), 2026-09-25 16:26:47 EEST, HEAD dfef0de94 dirty 0:

```
tests/unit/v9-deployment-mode.test.ts rc=0 passed=203 failed=0 (expect 203/0)
tests/integration/dev-api-environment.test.ts rc=1 passed=11 failed=1 (expect 11/1)
tests/integration/dev-api-process.test.ts rc=1 passed=6 failed=5 (expect 6/5)
tests/unit/dev-runner-process.test.ts rc=0 passed=8 failed=0 (expect 8/0)
tests/unit/dev-api-environment-cli.test.ts rc=0 passed=7 failed=0 (expect 7/0)
tests/architecture/dev-custody-root.test.ts rc=0 passed=16 failed=0 (expect 16/0)
tests/architecture/dev-real-provider-only.test.ts rc=0 passed=3 failed=0 (expect 3/0)
tests/architecture/register-support-publication.test.ts rc=1 passed=14 failed=1 (expect 14/1)
CLUSTER_GREEN
acceptance/pes-s02-fake-vendor.test.ts rc=0 passed=6 failed=0 (expect 6/0)
CLUSTER_GREEN
acceptance/pes-s02-hosted.test.ts rc=0 passed=8 failed=0 (expect 8/0)
CLUSTER_GREEN
```

As passed/total: v9 203/203 · dev-api-environment 11/12 · dev-api-process 6/11 · dev-runner-process 8/8 · dev-api-environment-cli 7/7 · dev-custody-root 16/16 · dev-real-provider-only 3/3 · register-support-publication 14/15 · fake-vendor 6/6 · hosted 8/8. The seven failures are the ones dated pre-existing at base: DEV-09 (1), the five DEV-10B default-profile cases, and register-support-publication `:475`. None is mine and none is new. This output is identical to `frames/C1-gate.out`, `frames/C2-gate.out`, `frames/C3-gate.out` and to the three handoffs' three-run tables. There is no disagreement.

`pnpm typecheck` (`P/typecheck.log`) has rc=1 and exactly one diagnostic, `apps/ui/lib/v3/answerExport.ts(2,38) TS2835`, the base diagnostic. The per-file delta is 0.

### Charge 4 — secrets and paths in `diff.patch` (1230 lines) and every added fixture

- `sk-`, `xai-`, `AIza` shapes: 0 hits. The runs of 40 or more `[A-Za-z0-9+/=_-]` characters are all identifiers or file paths; none is a key.
- `Bearer`: 11 lines. The literals are `Bearer pes-s02-fake-vendor-token`, the PLAN's R2.5e literal at `acceptance/pes-s02-fake-vendor.ts:8`; `Bearer not-the-fixture-literal` (PLAN.md:559); `Bearer pes-s02-not-the-vendor-literal` (PLAN.md:718); `Bearer inline-not-provisioned` (SPEC R2.7 table); and `Bearer support-test` at `tests/support/devApiEnvironmentAssembly.ts:22`. The last one is a byte copy of the base DEV-09 fixture (`776359c3:tests/integration/dev-api-environment.test.ts:39`), and PLAN S02-S01 (PLAN.md:290) orders that copy. The same holds for the fake DSN `postgresql://…:dev-password-${index}-abcdefghijklmnopqrstuvwxyz@127.0.0.1:55432/debateai` at `devApiEnvironmentAssembly.ts:54` (base `:68`): the suite writes that DSN to a temp file and never dials it (see charge 5 below). No real credential appears anywhere.
- Hosts in the diff: `api.localtest.me`, `127.0.0.1`, `localhost`. No real vendor host appears.
- Credential file paths: the only credential path is `<scratch>/custody.d/vendor.header`, together with the `/SCRATCH/custody.d/{vendor,absent}.header` templates, which R2.7 and R2.8 allow. The `.bin`/`.env` paths in `devApiEnvironmentAssembly.ts` sit under a `mkdtemp` root. There is no absolute path to a real credential file, and no `/Users/`, `~` or `/etc/` path.
- PLAN V5 (a) prints exactly 1 line, `acceptance/pes-s02-fake-vendor.ts:8`. (b) and (c) print no output. (d) prints exactly 2 lines (`:77` createServer, `:103` listen). (f) prints no output, and the control shows the pathspec does match: `git ls-files` finds all 7 files. (g) lists 13 paths. (h) prints 2. (e) is covered under charge 8(b) below. All of this is in `P/rev-sd-v5.sh` → `P/v5.out`.

### Charge 5 — hosted-mode truth

- **Every refusal code relied on exists at a shipped throw site in the lane:** `PROVIDER_TARGET_LOOPBACK_REFUSED` `packages/providers/src/index.ts:652` · `PROVIDER_INLINE_CREDENTIAL_REFUSED` `:655` · `PROVIDER_DISCOVERY_AUTHORIZATION_CONFLICT` `:307` · `PROVIDER_AUTHORIZATION_FILE_ABSENT` `:784` · `PROVIDER_TARGET_PRICE_REQUIRED` `:687` · `PROVIDER_AUTHORIZATION_FILE_UNUSABLE` `:787`, `:794` · `DEV_API_PROCESS_ENVIRONMENT_INVALID` `apps/runner/src/dev-api-process.ts:129-143` · `DEV_API_ENVIRONMENT_DRIFT` `apps/runner/src/dev-api-environment.ts:287` · `DEPLOYMENT_MODE_UNRESOLVED` / `_INVALID` `packages/register/src/runtime-environment.ts:66-79`. The slice adds none of these codes; it only relies on them.
- **Hosted mode never reaches a loopback relay or a CLI.** Hosted mode refuses any non-`https:` target (`index.ts:646-647`), and the CLI relays speak plaintext `http:`. The one loopback listener that hosted mode does reach is the fixture, through the DNS name, over TLS pinned to the fixture's own CA. That is R2.6's design; see N3.
- **The fake vendor refuses a missing and a wrong `Authorization`.** `P/rev-sd-vendor-auth.ts` → `P/vendor-auth.out` sent 15 raw HTTP/1.1 requests over the fixture's own TLS, going past the author's 3 cases. A missing header, a wrong token, the token without its scheme, a lowercase scheme, `Basic` with the same token, the literal plus a suffix, a prefix of the literal, an empty value, and duplicates [wrong, right] each got **401** with the body `{"error":"unauthorized"}`. That body names no credential, and each request moved rejected by +1. The right literal on GET, with a query string, or on `/v1/models` got **404**. The right literal got **200** with the probe-accepted body. **Duplicates [right, wrong] also got 200** → N2. The listener is bound to `127.0.0.1:4460` only, never to the wildcard, and it was released at close.
- **The slice touches no database.** `P/rev-sd-netrun.sh` preloads `P/rev-sd-netlog.mjs`, a wrapper on `net.Socket#connect` and `net.Server#listen` that runs in every vitest process and worker (12 preloads). It ran all 10 cluster suites at once. Vitest printed `Tests  7 failed | 282 passed (289)`, the seven being the base failures. Every connect went to `api.localtest.me:4460` (12) or `127.0.0.1:4460` (4). Every listen went to `127.0.0.1:4460` (8). The log mentions `55432` 0 times (`P/netrun1.out`). So no connection went to :55432, no embedded Postgres started, and nothing listened except the fixture.

### Charge 6 — processes and ports

- NO-TOUCH listeners at my start (16:25:30) and at my end (16:33:43) are identical to `listeners.txt`: `:4310 node/95068`, `:55432 com.docke/19920`, and every other NO-TOUCH port empty.
- Ports 4460–4499 were free (lsof rc=1) before and after every run I made, including each of the 7 real-pnpm runs.
- I ran no `pnpm install`. I started no process that outlived its command: the fixture and the vendor probe each close their own server, so nothing needed a PID kill. There are 0 leftover `pes-s02-*` or `rev-sd-*` directories in `os.tmpdir()`. The worktree is at dfef0de94 with `git status --porcelain` empty.

### Charge 8 — slice-specific checks

**(a) F10, async-exit-hook.** I preloaded `P/rev-sd-loadlog.mjs`, a `node:module` `registerHooks` resolve recorder that covers both ESM and CJS and writes an exit record, into the real `pnpm pes:accept-hosted` (`P/rev-sd-cli-exit.sh`). Across the PASS run and the 5 mutant runs, the resolved-module log holds **0 URLs** matching `embedded-postgres|async-exit-hook|standing-db|pg`. Every one of the 3 processes (pnpm, the tsx parent, the node child) exits with `beforeExitListeners=0`, and `exitCode` equals the code. The 30 lane-local modules the acceptance loads contain no `import(` or `require(` (checked with grep), so the PASS path's graph is the graph of every path. **Ruling: gate V5(e) must name them,** as a static tripwire. A grep over `acceptance/pes-s02-*` cannot see transitive imports, though, so the load recorder is the behavioural proof (promoted in P).

**(b) Gate V5(e), final text** (PLAN.md:176, read through DECISIONS.md:140-142). As written, the gate prints `acceptance/pes-s02-fake-vendor.ts:12:  3000, 3001, 8790, 4310, 8791, 8792, 8793, 8795, 8796, 55432, 4455` against a correct head, where it demands "no output". That line is R2.5a's excluded-port datum (SPEC-v4 R2.5a names `:55432`), not a connection. Ruled text, measured at dfef0de94 in `P/v5.out`:
```
(e)  git grep -n -E 'from "pg"|createPool|startTestDatabase|embedded-postgres|standing-db|testDatabase|postgres(ql)?://' -- 'acceptance/pes-s02-*'   # no output (R2.11, F10)
(e2) git grep -c '55432' -- 'acceptance/pes-s02-*'   # exactly one line: acceptance/pes-s02-fake-vendor.ts:1 — the R2.5a excluded-port datum
(e3) zsh …/probes/REV-PES-S02-p1-security-data-safety/rev-sd-cli-exit.sh <lane> <label>   # "F10 modules: 0 hits" and every EXIT line beforeExitListeners=0
```
(e2) counts per file instead of pinning a line number (TRAPS "Variant 6"). → N1.

**(c) The exit rule (V-12/V-13 ruling), through real pnpm 11.20.0, `env -u FORCE_COLOR -u NO_COLOR`.**

| run | exit | the acceptance's own last line | pnpm trailer after it |
|---|---|---|---|
| PASS (head as committed) | `exit=0` | `PES-S02-ACCEPT: PASS` | none |
| FAIL (mutant: the vendor is handed `Bearer pes-s02-rev-sd-wrong-token`) | `exit=1` | `PES-S02-ACCEPT: FAIL admitted` | `[ELIFECYCLE] Command failed with exit code 1.` |
| UNVERIFIED (mutant: `/nonexistent/openssl`) | `exit=1` | `PES-S02-ACCEPT: UNVERIFIED tls-material openssl-unavailable` | same |
| thrown (mutant: throws `rev-sd pes-s02-fake-vendor-token /x/custody.d`) | `exit=1` | `PES-S02-ACCEPT: FAIL internal` | same |
| leak attempt: a REFUSED line carrying `credentialPath` | `exit=1` | `PES-S02-ACCEPT: FAIL stdout-law` (the leaking line never printed) | same |
| leak attempt: the ADMITTED line carrying the credential header | `exit=1` | `PES-S02-ACCEPT: FAIL stdout-law` (never printed) | same |

The mutants are the temporary edits in `P/rev-sd-mutants.sh`. Each is restored from the bytes captured at start, and every restore printed `restored: cmp identical` and `porcelain: []` (`P/mutants.out`). In every run the token grep printed 0, the `<scratch>/custody.d` grep printed 0, the `Bearer \S` grep printed 0, and `test -e <scratch>` printed 1. The wrong token `rev-sd-wrong-token` appears in its log 0 times. That means the shipped probe prints nothing on the 401 path. The thrown message, which carried the token, appears in its log 0 times. The PASS run matches SPEC-v4 §5 steps 4–9 exactly, with 13 `PES-S02` lines (`P/cli-exit-pass1.out`).

**(d) V-16's default holds.** `resolveAll` (`acceptance/pes-s02-hosted.ts`, the function body at the `function resolveAll` definition) calls the callback `lookup` once, with no `setTimeout`, `AbortSignal`, `dns.promises` or `timeout`. A grep over `pes-s02-hosted.ts` and `pes-s02-hosted-cli.ts` exits rc=1 (no match).

**(e) The fake vendor and hosts.** The vendor refuses both a missing and a wrong credential (charge 5 above). No real key or real vendor host appears in the diff (charge 4). One more check: the Bearer literal only travels to a peer holding the fixture's key. `createTrustingFetch` builds `new https.Agent({ ca: [caPem] })` (`acceptance/pes-s02-fake-vendor.ts:124`), and Node's `ca` option *replaces* the default roots. A DNS answer that changed between the `resolveAll` check and the connect would therefore fail TLS before any header is sent. `NODE_TLS_REJECT_UNAUTHORIZED` and `NODE_EXTRA_CA_CERTS` are absent (V5 (b)).

### Charge 2 — the package and the BUILD packets

The package matches the lane: `commits.txt` lists 3 commits, `diff-stat.txt` 13 files, and `listeners.txt` equals my start measurement. The handoffs' three-run tables equal my re-run. The C1/C2/C3 SKILLS LOADED lines meet the worker floor. C3 does not name `systematic-debugging`, which the floor conditions on "any bug", and C3 reports none. The packet defects I found are in N5.

## Findings

**N1 — PLAN.md:176, gate V5(e) condemns the correct head.** Input: `git grep -n -E 'from "pg"|createPool|startTestDatabase|55432' -- 'acceptance/pes-s02-*'` at dfef0de94. Wrong outcome: it prints 1 line (`acceptance/pes-s02-fake-vendor.ts:12`, the R2.5a excluded-port datum) where the gate says "no output". It also does not forbid `embedded-postgres` or `standing-db`, the F10 carriers (t_758b03f9). The class is a static gate that matches a literal regardless of its role (data versus connection). The only other members in this slice's gates are (a) and (d), and they already count exact lines. Remedy: replace (e) with the three lines ruled in 8(b). The owner is the PLAN text, which the orchestrator folds; the code does not change. **Ticket: yes (orchestrator).**

**N2 — `acceptance/pes-s02-fake-vendor.ts:80`: the vendor admits a request that carries two `Authorization` headers when the first one is the literal.** Input: raw `POST /v1/chat/completions` with `authorization: Bearer pes-s02-fake-vendor-token` and then `authorization: Bearer wrong`. Wrong outcome: `200`, matched +1 (`P/vendor-auth.out` row 10). Node keeps the first `authorization` and drops the rest, and the fixture reads `request.headers.authorization`. Impact: none today, because the shipped probe sends one header (`packages/providers/src/provider-probe.ts:71-72`). But the fixture would hide a probe regression that sends a stale second credential, and SPEC R2.5d asks for 401 whenever the header is "not equal to the expected literal". Remedy: admit only when `request.headersDistinct.authorization` has length 1 and that value equals the literal, and add the [right, wrong] duplicate to case 3. **Ticket: yes (FIX, non-blocking).**

**N3 — pre-existing, outside the diff: the hosted loopback refusal checks the host as written, so an `https:` name that resolves to loopback or a private address is admitted in hosted mode.** `isRefusedHostedProviderHost` (`packages/providers/src/index.ts:584-592`) does no name resolution. The slice's own acceptance proves it end to end: `PES-S02 DNS api.localtest.me 127.0.0.1,::1` then `PES-S02 ADMITTED vendor:a`. The same holds for any name an operator or DNS maps to `10/8`, `169.254/16`, or this box. Blast radius is limited: targets are operator-written configuration, `https:` is mandatory, and a credential only travels over a TLS session the peer completes. The class is every hosted refusal that decides on the written host rather than on the resolved address; the only member is `isRefusedHostedProviderHost` and its two call sites (`assertHostedProviderTargets` `:646-658`, and support-model reuse per `apps/api/src/support/model.ts:277`). Remedy (default): S03's README §11 table row for `PROVIDER_TARGET_LOOPBACK_REFUSED` (`deploy/vps/README.md:775`) should say "checks the host as written; names are not resolved". The V-ROW below asks whether to go further. **Ticket: yes (S03 docs), plus the V-ROW.**

**N4 — lane dependency store, outside the diff, against the lane setup (`.hermes/reports/provider-env-selection/logs/setup-lane.zsh:10-20`).** `node_modules/.pnpm` in `pes-base`, `pes-s02` and this review worktree is a symlink to `/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/i18n-turn12/dialectical-engine/node_modules/.pnpm`, another mission's lane (`ls -la`). The acceptance ran tsx, esbuild and zod from that path (`P/scratch/loads-pass1.log`). That lane's `pnpm-lock.yaml` differs from dev's by 39 diff lines (it adds `model-config`, `obs-capture`, `tools/obs-listener`), and `setup-pes-s02.log` shows `setup-lane.zsh:19: L: parameter not set` → `pnpm install --offline rc=1` and `--prefer-offline rc=1`. So the slice lane's frozen-lockfile reconcile never ran. COMMON §6 says the lane has "node_modules from dev's lockfile"; that is true of the resolved versions (this worktree's own `pnpm install --offline --frozen-lockfile` printed "Already up to date"), but the code it executes lives in a store another session can install into or prune. That could change what a later review pass executes, or break every pes lane at once. Remedy: `cp -Rc` must dereference `.pnpm` (or the lane runs its own frozen install into its own store), `L` must be set before `:19`, and the lane must be re-verified. **Ticket: yes (orchestrator).**

**N5 — packet defects (REV-S02-p1-security-data-safety.md).**
- (a) Charge 1 prescribes `comments read through: 1`, but at dispatch the ticket carried 2 comments (DISPATCHED + the NOTE naming the agent id). My CLAIM says 2.
- (b) Charge 4's rule, "no `Bearer <token>` that is not the PLAN's documented fake literal", read literally condemns `Bearer support-test` (`tests/support/devApiEnvironmentAssembly.ts:22`), a base fixture that PLAN S02-S01 orders copied. The rule should read "a PLAN-, SPEC- or base-fixture literal".
- (c) Section 3 numbers two charges "8.", and charge 8's (a)–(e) collide with charge 1's list.
- (d) The freeze pair `0e931c00a..a7ab744ec` spans 23 commits and 498 files across S01/S02/S03, so it is not a useful "what changed for this pass" range. The S02-p1 package itself was committed in `9dac71b11` (15:00), inside the range.

**Ticket: yes (orchestrator, packet generator).**

## Predictions about the other lens (correctness/tests), written blind

The correctness lens will reproduce the three `CLUSTER_GREEN`s and the 13-line PASS. I expect it to spend its effort on the R2.4 PROGRESS record (12+11 rows) and on V5(e), where it may reach the same "exclusion datum" reading without adding the F10 names. Two things it may miss or rate differently:
1. The port-selection race. `acceptance/pes-s02-fake-vendor.test.ts` and `acceptance/pes-s02-hosted.test.ts` both pick the lowest free port from 4460 with `lsof` and then bind, a TOCTOU. Vitest runs files in parallel workers, and a second seat or V's own `pnpm pes:accept-hosted` running at the same time would make one side fail with `PES_S02_PORT_BIND_RACED` → `UNVERIFIED port bind-raced`. It fails closed, so it is not a security defect, but it can flake the C2/C3 pairs. I would check this first, by running both suites plus the CLI at once.
2. Whether the `lines` expectation in hosted test case 1 depends on the DNS order of the stubbed lookup, when V's real resolver answers `127.0.0.1,::1`. My real run printed that exact order, but the order is resolver-dependent.

## V-ROW

```
V-ROW: NEW · S02 (touches S03 README §11) · REV-S02-p1-security-data-safety N3 ·
Recommended default: leave hosted mode's loopback/private-range refusal as a check on the host AS WRITTEN (no DNS resolution at boot) and have S03's README §11 row for PROVIDER_TARGET_LOOPBACK_REFUSED say so in one sentence.
Smallest yes/no for V: "Should a hosted deployment also resolve each provider's host name at start-up and refuse it when the answer is loopback or private (so a name like api.localtest.me → 127.0.0.1 is refused like 127.0.0.1 is)?"
VERDICT keep-literal-and-document / CONFIDENCE medium / STRONGEST COUNTER: the refusal exists to stop a hosted box from sending prompts and credentials to itself or its private network; a DNS name defeats it, and DNS can change after boot. But a boot-time resolve does not stop rebinding later either, and a yes breaks S02's own acceptance: its admission case is exactly such a name (R2.6), so a yes also costs S02 a SPEC change.
```

## UNVERIFIED

- **The dev stack's upgrade on V's real custody file.** `isExactEnvironmentWithoutDeclaredDeploymentMode` (`apps/runner/src/dev-api-environment.ts:451-464`) rewrites V's real `.local/dev-auth/api.env` the first time `dev:auth:up` runs after merge, and `dev-api-process.ts:214` refuses to start without the mode. I did not read or run against V's real file, because it holds real database and Hatchet credentials. The two fixtures' exact-prior and drift cases pass (C1). This is a step for V's test point: run `dev:auth:up` once on the real stack and confirm the API starts.
- **The acceptance under a DNS answer that changes between check and connect** (a rebinding window). I argued it from `ca` replacing the roots (charge 8(e)) and did not execute it.
- **Parallel-run port collisions** (prediction 1 above). Not measured, to avoid disturbing the other lens's concurrent runs on 4460–4499.
- **PLAN §4 V2** (the 39-suite regression list) and **V3** (the PROGRESS record). Both are outside this lens's charges and I did not run them.
