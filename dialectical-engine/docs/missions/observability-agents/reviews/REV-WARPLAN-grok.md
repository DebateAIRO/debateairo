SKILLS LOADED: COMMON.md, heartbeat-protocol/SKILL.md, heartbeat-reviewer/SKILL.md, using-superpowers/SKILL.md, verification-before-completion/SKILL.md, REV-WARPLAN.md, WAR-PLAN-2026-09-02.md, heartbeat-orchestrator/SKILL.md, TOOLING-TRAPS.md
# VERDICT: REWORK   (round 1 of 3)

## Packet review (C1)

**Authority.** `hermes kanban --board observability-agents show t_d9a33421` (captured `{SCRATCH}/ticket-show.txt`): ticket exists, status `ready`, assignee `grok-4.6`. Comment 1 is `HERMES AUTHORIZED NEXT: REV-WARPLAN round 1 of 3`. Marker present → review proceeded.

**War-plan hash.** `shasum -a 256 docs/missions/observability-agents/WAR-PLAN-2026-09-02.md` → `0164fe0b4d0366cc2524f57ee2d718fa7b644503b4c96caf92ce3c38c42db27d`. Prefix matches packet `0164fe0b4d0366cc`. `wc -l` = 325, matches packet.

**§0 paths.** All six `test -r` OK (`{SCRATCH}/c1-paths.txt`).

**§5 `allowed` vs §6 deliverables.** Verdict path `docs/missions/observability-agents/reviews/REV-WARPLAN-grok.md` is on the allowed list. Self-report `.hermes/reports/observability-agents/agent-reports/REV-WARPLAN.md` is on the allowed list (COMMON §5). Board comments on `t_d9a33421` allowed. Scratch `/private/tmp/rev-warplan/` allowed. No mandatory deliverable sits outside `allowed`.

**Packet defects (orchestrator, not the plan's coder):**

1. COMMON.md vs this packet disagree on tree state (COMMON: dirty `dev @ 8d38185c`, 111 entries; packet §2: clean `dev @ 2b670d30`), stopping bound (COMMON §6 3h/2.5h vs packet §8 2h/1.5h), and handoff marker (`READY FOR PEER REVIEW` vs `READY FOR HERMES REVIEW`). Seat packet wins for this run. Measured HEAD is `2b670d30` on `dev` (packet correct); working tree is **not** clean — 4 entries: `M .hermes/TOOLING-TRAPS.md`, `??` packet, war plan, and `logs/run-REV-WARPLAN.sh`. Packet's "clean" is false; COMMON's 111/8d38185c is stale.
2. Packet C7 and plan §13 cite `slices/FIX-01/SPEC.md` and `requirements/fixagent-state-audit.md`. From cwd `dialectical-engine` those paths do not exist. Real paths: `docs/missions/observability-agents/slices/FIX-01/SPEC.md` and `docs/missions/observability-agents/requirements/fixagent-state-audit.md`.
3. The war-plan artifact has no `SKILLS LOADED` line. Reviewer contract §5 requires checking the author's floor; it cannot be checked from this artifact.

These are N-findings (N6). They do not strip authority.

## Probes run (C2, C3, C5f) — command · output verbatim (trimmed) · agrees / disagrees with the plan

All §13 commands re-run from `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`. Full captures under `{SCRATCH}/s13/`.

| # | Command | Output (trimmed) | vs plan |
|---|---|---|---|
| 1 | `git rev-list --left-right --count dev...origin/dev` | `0\t0` (repr `b'0\\t0\\n'`) | **agrees** (`0 0` at `2b670d30`) |
| 2 | `git worktree list \| wc -l` | `63` | **agrees** |
| 3 | `git branch --no-merged dev \| wc -l` | `13` | **agrees** (all `codex/accounts-*` / `codex/auth-*`) |
| 4 | `git rev-list --left-right --count main...dev` | `0\t290` | **agrees** |
| 5 | `gh pr view 8 --json mergeable,additions,deletions,changedFiles` | `{"additions":13367,"changedFiles":184,"deletions":2404,"mergeable":"CONFLICTING"}` | **agrees** |
| 6 | `git merge-tree --write-tree --name-only dev origin/security/2026-09-01-hardening` | tree `0815f274…`; name `apps/ui/scripts/node-test-manifest.json`; stderr `CONFLICT (content)` on that file; exit 1 | **agrees** (one conflict file) |
| 7 | `gh api repos/DebateAIRO/debateairo/branches/dev/protection` | HTTP 404 `Branch not protected` | **agrees** |
| 8 | `gh api repos/DebateAIRO/debateairo/rulesets` | `[]` | **agrees** |
| 9 | `hermes kanban --board observability-agents stats` | todo 10 · ready **14** · running 0 · done 0 | **disagrees now** (plan: ready 13 / 23 tickets). +1 is this review ticket `t_d9a33421`, minted after the plan. Authorship-time figure not refuted. |
| 10 | `hermes kanban --board ui-overhaul stats` | done 105 · ready 36 · running 4 · todo 1 | **agrees** |
| 11 | `docker ps --format '{{.Names}} {{.Image}} {{.Ports}}'` | `debateai-v3-postgres-1 postgres:18 127.0.0.1:55432->5432/tcp` plus `debateai-v3-hatchet-lite-1` | **agrees** (postgres line); hatchet present as T6 said |
| 12 | `ls migrations/*.sql \| wc -l` | `51` | **agrees**; two `0025_` files: `0025_dr184_derived_standing.sql`, `0025_evaluator_domain_refusal_receipts.sql` |
| 13 | `grep -c 'SECURITY DEFINER' migrations/*.sql \| awk …` | `143` | **agrees with the command**. Live `pg_proc.prosecdef` = **109** (SELECT-only). String-count ≠ object-count. |
| 14 | `grep -rl 'startTestDatabase' tests acceptance \| wc -l` | `35` | **disagrees** (plan comment: 34). 34 `tests/integration/*.test.ts` + `tests/support/testDatabase.ts` (definition). "34 tests boot" still holds if the definition is excluded; the command as written returns 35. |
| 15 | `sed -n '8p' .gitignore` | `.test-postgres/` | **agrees** |
| 16 | `~/.grok/bin/grok models` | default `grok-4.6`; available `grok-4.6`, `grok-4.5` | **agrees** |

**C3 theatre facts (≥8 across ≥4 theatres):**

- **T1 ui-overhaul.** `hermes kanban --board ui-overhaul list | grep running` → exactly the four ids the plan names: `t_2b19a84b`, `t_84db10ff`, `t_1d7f74a9`, `t_0b95c2d9`. **agrees.**
- **T2 observability-agents.** stats as above; `reviews/` was empty before this verdict; `packages/obs-capture/src/runtime`, `tools/obs-listener`, `apps/observation-agent` all absent. **agrees** (zero agent code).
- **T3 landed obs.** `find packages/obs-capture -name '*.ts' | xargs wc -l` → `2928`. `find docs/missions/observability-agents/slices -type f | wc -l` → `100`. Live `SELECT count(*) FROM obs.occurrence` → `0`. 14 `obs.*` tables. Audit names 6 reds in 2 files (S06 ×4, S04 ×2). TYPECHECK-BASELINE.md: 8 diagnostics in `tests/unit/s14-ui.test.ts`. **agrees on LOC/slices/zero rows/6 reds/8 typecheck.** Baseline pin is `3503dcf8`, not the plan's `2b670d30` (2 commits apart; pin is an ancestor).
- **T4 PR #8.** `gh pr view 8 --json createdAt` → `2026-09-02T11:40:57Z`, author `nokitel`. `git rev-list --count origin/dev..origin/security/2026-09-01-hardening` → `130` ahead; `…hardening..origin/dev` → `5` behind. `gh pr checks 8`: `verify` pass, `secrets` pass, `codeql` pass, GitHub `CodeQL` **fail 4s**, `Workers Builds: dezbatere` **fail**. **agrees.** (`gh pr view --json commits` length is 100 — GitHub truncates the commits array; git count is the plan's 130.)
- **T5 hygiene.** 13 unmerged local branches listed; remote non-default: `claude/nifty-mendeleev-a82361`, `obs-lane-2-capture`, `obs-lane-3-runner-cause`, `security/2026-09-01-hardening` (4). **agrees.**
- **T6 substrate.** `startTestDatabase()` (`tests/support/testDatabase.ts:134-137`) calls `startWithEmbedded`; `selectPrototypeDatabaseMechanism()` (`:31-38`) always returns `{mechanism:"embedded-postgres", testcontainersStatus:"DEFERRED BY DR-121"}`. `acceptance/standing-db.ts:46-55`: if `SELECT 1` succeeds on the given port, it `migrate(existingPool)` and returns `reused: true` — **adopts and migrates any reachable server**. `find node_modules/.pnpm -maxdepth 1 -name '@embedded-postgres+darwin-arm64*'` → `@embedded-postgres+darwin-arm64@18.4.0-beta.17`; `native/bin` = `initdb pg_ctl postgres` (no `psql`). `grep -c CREATE … FUNCTION` migrations → **171**. `CREATE TRIGGER` lines → **77** (plan: ~30). **function count agrees; trigger count disagrees.**
- **T7.** Not independently re-derived (provider cap times). `UNVERIFIED` as a theatre; does not affect C2.

**C5f** (throwaway `/private/tmp/rev-warplan/foundry-probe.mts`, three process invocations; empty template of one table, **not** 51 migrations):

| run | initialise | start | CREATE DATABASE template | clone TEMPLATE | wall |
|---|---|---|---|---|---|
| 1 | 944.2 ms | 38.4 ms | 60.2 ms | **57.4 ms** | 1.77 s |
| 2 | 553.1 ms | 36.2 ms | 58.8 ms | **51.2 ms** | 1.34 s |
| 3 | 588.5 ms | 36.6 ms | 59.4 ms | **60.1 ms** | 1.38 s |

`ALTER DATABASE … is_template true ALLOW_CONNECTIONS false` then `CREATE DATABASE … TEMPLATE debateai_template` succeeded all three runs. Connect to the template after deny: `REFUSED:database "debateai_template" is not currently accepting connections`. Clone copied the row. `CREATE ROLE` inside the template DB was visible on `postgres` (cluster-global) all three runs.

## Findings

### B1 — Op 1 claims B1/B2/N4 sit on FIX-01's frozen file surface; they do not

- **Plan §/line:** §5 Op 1, `sed -n '108p'` — "plus the three known reds **inside its file surface**: B1 (S06 half-merge — restore the `index.ts` binding hunks or remove the dangling installer import …), B2 (`obs-l2-s04-zone.test.ts:33` …), N4 (D12 stage-16 …)". Also `sed -n '109p'`: "Parallel sub-tickets on FIX-01 §7's single-writer surfaces … plus one for B1+B2+N4."
- **What I ran:** `sed -n '56,60p' docs/missions/observability-agents/slices/FIX-01/SPEC.md`; read audit `docs/missions/observability-agents/requirements/fixagent-state-audit.md` §B / B1 / B2 / N4.
- **Concrete failure:** a VS-1 coder following Op 1 edits `apps/runner/src/index.ts` / `apps/runner/src/main.ts` / `tests/integration/obs-l3-s06-runner-binding.test.ts` (B1), `tests/unit/obs-l2-s04-zone.test.ts` (B2), and `docs/missions/2026-08-21-observability-loop/demo/observability-demo.sh` (N4). FIX-01 SPEC §7 **Allowed** is only `packages/obs-capture/src/runtime/**`, `apps/scheduler/src/cli.ts`, `tests/{integration,unit}/fix01-*.test.ts`. `packages/obs-capture/src/index.ts` is **Forbidden**. `apps/runner/**` is FIX-03's surface, not FIX-01. COMMON §4: "SPEC.md is FROZEN at creation." Scope change requires a new SPEC version ratified by V. No §12 row asks V to expand FIX-01.
- **Evidence:** audit B1: merge `1c9578a2` discarded binding hunks of `apps/runner/src/index.ts` while keeping `apps/runner/src/main.ts:1` installer import; 4 red tests in `obs-l3-s06-runner-binding.test.ts`. B2 is S04 zone test, not scheduler. Folding them into VS-1 either violates the frozen file surface or silently opens FIX-03/S04/D12 work under a FIX-01 ticket.
- **Fix:** drop B1/B2/N4 from Op 1, **or** add a V row "amend FIX-01 SPEC v2 to absorb named reds with an explicit extra file list", **or** mint a separate hygiene slice. Do not tell a coder they are "inside FIX-01 §7".

### N1 — §13 command for `startTestDatabase` returns 35, not 34

- **Plan §/line:** §13 `sed -n '304p'` `# 34 call sites`; T6 `sed -n '38p'` "34 tests boot".
- **What I ran:** the plan's exact `grep -rl` → 35 files (list in `{SCRATCH}/c3/startTestDatabase-files.txt`).
- **Failure:** a later seat treating the comment as the command's output will "correct" a 35 down to 34, or will size Foundry timing tables off by the definition file. Conclusion "34 test files boot embedded PG" survives if `tests/support/testDatabase.ts` is excluded; the **command as written does not**.
- **Fix:** change the comment to `35 files (34 callers + definition)` or drop the definition from the grep.

### N2 — trigger count `~30` is 77 `CREATE TRIGGER` lines

- **Plan §/line:** T6 `sed -n '38p'`.
- **What I ran:** `grep -h -E 'CREATE (CONSTRAINT )?TRIGGER|CREATE TRIGGER' migrations/*.sql | wc -l` → 77 (2 constraint + 75).
- **Failure:** Option 0 (SQLite) is argued from this inventory. Under-count does **not** rescue SQLite (it makes the case stronger), but it is the same measurement class as N1: a number in T6 that a later seat will copy.
- **Fix:** replace `~30` with the measured 77, or define the subset.

### N3 — `validateApiEnvironment` does not demand "≥6 DISTINCT database URLs"

- **Plan §/line:** T6 `sed -n '38p'`; §7.2 "provision the nine development principals … so the **≥6 distinct role URLs** `validateApiEnvironment` demands exist".
- **What I ran:** read `packages/register/src/runtime-environment.ts:107-161`. Required URL fields always: `DATABASE_URL`, `AUTHORIZATION_DATABASE_URL` (function-enforced), `ERASURE_DATABASE_URL`, `CONTENT_PROVISION_DATABASE_URL` = **4** pairwise-`===` separations. `PUBLICATION_CLEANUP_DATABASE_URL` only if `PUBLICATION_ENABLED`; `EVALUATOR_DEV_MENU_DATABASE_URL` only if that menu is on. There is no `urls.size >= 6` check. `DATABASE_URL_PRINCIPALS_DISTINCT` is a **boot attestation name** in `tests/architecture/dev-local-auth-topology-spec.test.ts:196`, not this function.
- **Failure:** Foundry "nine principals so that ≥6 URLs exist" over-builds against a rule that is pairwise string inequality. Distinct **roles** on one cluster **do** satisfy `===` (userinfo differs). The mechanism works; the count is invented.
- **Fix:** quote the actual pairwise throws; say "distinct connection strings (role in the URL is enough)"; drop "≥6".

### N4 — Foundry `template.ready` hashes the sorted **file list**, not file contents

- **Plan §/line:** §7.2 `sed -n '187p'`; risk 7 line 256.
- **What I ran:** `packages/db/src/index.ts:717-719` — `migrate()` applies `(await readdir(directory)).filter(/^\d+.*\.sql$/).sort()` then reads each file body. Two `0025_` files exist; order is lexicographic (`0025_dr184_…` then `0025_evaluator_…`).
- **Failure:** V (or PR #8) hotfixes `0034_obs_foundation.sql` **in place** (same name, new body). File-list sha256 unchanged → template not rebuilt → FixAgent GREEN on stale schema, live DB RED after merge. Adding a file is covered; editing a file is not. C5f did not migrate 51 files; this is a design hole, not a timing hole.
- **Fix:** hash `(name, sha256(bytes))` per migration file plus register version.

### N5 — FIX-13-R09 is the forge fixture, not porcelain

- **Plan §/line:** §8 `sed -n '209p'` "`git status --porcelain` stays honest (FIX-12-R09 / FIX-13-R09 preserved)".
- **What I ran:** FIX-13-R09 (`slices/FIX-13/SPEC.md:21`) is the IC-3 forge fixture. Porcelain is FIX-12-R09 (`FIX-12/SPEC.md:21`) and FIX-13 **acceptance §5 step 5** (`FIX-13/SPEC.md:36`).
- **Failure:** a FIX-13 v2 author "preserving R09" by gitignoring `.fixagent/` can drop the forge fixture and still think R09 is green. Alert gitignore **does** keep FIX-12-R09 / FIX-13 step 5 honest **after** the ignore line is on the checkout the daemon writes into.
- **Fix:** cite FIX-12-R09 and FIX-13 §5 step 5; keep R09 as forge.

### N6 — packet/plan constants vs the tree; COMMON vs packet (orchestrator)

- **Plan §/line:** header `sed -n '4p'` "working tree clean"; packet §2 same; plan §13 sources `sed -n '309p'` (`slices/FIX-…`, `requirements/fixagent-state-audit.md`).
- **What I ran:** `git status --porcelain` from git root → 4 dirty entries (listed in C1). `test -r slices/FIX-01/SPEC.md` fails; real path under `docs/missions/observability-agents/`.
- **Failure:** the next seat copies "clean @ 2b670d30" and treats dirt as its own, or fails to open SPECs from the cited relative path.
- **Fix:** re-pin dirty list at packet-write; cite paths that resolve from the seat cwd. COMMON vs packet mismatches belong in the packet's "supersedes COMMON" sentence, not as silent drift.

### N7 — three child worktrees inside VS-3 vs vertical-slice law item 4, no V row

- **Plan §/line:** §5 Op 3 `sed -n '122p'` (plan cites "law's own preference for isolation … §6 point 3").
- **What I ran:** `~/.claude/skills/heartbeat-orchestrator/SKILL.md` §6 items 3–4 (skill lines 104–109); spine `docs/agent-protocols/debateai-heartbeat-protocol.md` v3.4.0 items 3–4 (lines 1764–1769): "**One worktree (local branch) per vertical slice.** The slice's whole fleet works **inside that worktree**." Item 3's isolation preference is about **slices**, not multiplying worktrees inside one slice.
- **Failure:** Op 3 creates `slice/oa-vs3` plus `slice/oa-vs3--daemon` etc. — four worktrees for one slice — without a V row. Fast-forward integration is extra janitor surface (63 worktrees already).
- **Fix:** keep three coders in **one** slice worktree on disjoint `tools/obs-listener/src/{daemon,obsctl,…}` paths (FIX-13 §7 already splits worker-fix vs landing), **or** add a V row for child worktrees.

### N8 — V-10 and V-11 are not self-contained on the risks that change the recommendation

- **Plan §/line:** §12 `sed -n '272,274p'`.
- **What I ran:** `gh pr checks 8` (two fails); FIX-12 waits for `obsctl approve`; rulesets `[]`; no spend numbers in the V-11 row.
- **Failure:** a V who reads only §12 (a) may merge PR #8 while GitHub `CodeQL` and Cloudflare Workers are red, because recommendation (a) does not say what to do with those checks; (b) may pick V-11(a) code-first without being told that a live bot token plus empty rulesets means the first coding bug is a push, that draft PRs fill the inbox before V has scoped the change, and that `git push` is not abortable by `obsctl kill` once the pack is on the wire (orphaned `origin/fixagent/*`). Caps are named in §6, not in the row.
- **Fix:** each row: one example, then options, then recommendation that names the residual. V-10: "merge even with CodeQL/Cloudflare red, or park until they pass, or merge CI/deploy only". V-11: name spend-before-eyes, orphaned remote ref, ruleset-must-exist-first (already Op 0.4 — say it in the row).

### N9 — "a code slice with review ≈ 1 day" is not in the ledger; TYPECHECK pin is not the claimed HEAD

- **Plan §/line:** §5 Timeline `sed -n '143p'`; T3 typecheck baseline.
- **What I ran:** `.hermes/reports/observability-agents/LEDGER.md` has AUDIT-STATE 29 min and killed requirements seats ~32 min. **No coding slice has exited.** `TYPECHECK-BASELINE.md` pin = `3503dcf8`; `git merge-base --is-ancestor 3503dcf8 2b670d30` yes; `git log --oneline 3503dcf8..2b670d30` = 2 commits (`12be79eb` docs pin + `2b670d30` checkpoint) whose diff includes `apps/ui/**` and tests — the pin was not re-measured on the HEAD the plan claims.
- **Failure:** Wave-1/2 day estimates will be treated as measured. A coding seat asserting "delta vs pin" on `2b670d30` may inherit UI diagnostics that are not in the `3503dcf8` pin.
- **Fix:** label estimates as unmeasured; re-pin TYPECHECK-BASELINE on `2b670d30` in a clean worktree (Op 0.2 already says this — do it before VS-1, and stop quoting the old pin as today's).

## Law check (C4)

Sources: `heartbeat-orchestrator/SKILL.md:90-118` (vertical-slice law), spine `debateai-heartbeat-protocol.md:1572-1576` (universal: "push without explicit V approval") and `:1748-1778` (v3.4.0 items; **item 6 is merge discipline**, last sentence "Pushes remain V-gated as always" — FIX-13 header calling this "push law" is a shorthand, not a separate item). Zone: COMMON §3 + plan §3.5; FIX-01-R14.

- **Vertical-slice law vs §5.** Done = V veto: W1–W7 and Op gates say this. **Holds.** Parallel slices: Op 1 ‖ Op 2 is lawful; Op 3 after both vetoes is a real dependency (rows + Foundry), not width-before-depth. Board-shape "nothing else until a slice opens" is already broken by 23 paper tickets; Op 0.6 / §10 is cleanup, not a new break. **B1 (Op 1 file surface)** is a frozen-SPEC break without a V row. **N7 (child worktrees)** is item-4 tension without a V row.
- **Push law vs §6 / App. A.** Remote `fixagent/*` push is **not** done without a V row — V-9 exists. Op 0.4 before any push code exists. Appendix A R06′ is gated on V-9. **Holds**, provided V-9(a) and rulesets exist before VS-3 (plan says so).
- **Zone.** Op 1–3 file lists do not name zone prefixes, `packages/crypto/**`, or migrations 0030–0033/0038–0049. B2's test pins an accounts-owned region; folding B2 into VS-1 (B1) would put a zone-adjacent test on the first coding ticket. Foundry synthetic corpus "contract-shaped users" must not copy live identity rows (plan §7.2 says never copy the dev DB — **holds as written**; the seed generator is still a zone-adjacent risk for FIX-17's SPEC).
- **V rows asking non-V things / taking V's things.** V-9..V-15 are all V's (push exception, merge PR #8, approve-vs-code-first, Foundry mechanism, F-1/D1, alert location, first fault). Standing V-1..V-8 left open. No row asks V to pick a TypeScript API. Missing V row: FIX-01 SPEC expansion (B1) and optionally child worktrees (N7).

## Foundry attack (C5) · Loop attack (C6) · Order of battle (C7) · V rows (C8) · Omissions (C9)

**C5a.** `tests/unit/test-database-policy.test.ts` only calls `selectPrototypeDatabaseMechanism()` — env-blind, stays green regardless of `DEBATEAI_WORKTREE_DB`. `tests/integration/database.test.ts:1033-1039` asserts `database.mechanism === "embedded-postgres"` and DR-121 status from `startTestDatabase()`. The env var **does not exist today**. Design: if the seam is only inside `startTestDatabase()` and still sets `mechanism: "embedded-postgres"`, both stay green. If someone routes the flag through `selectPrototypeDatabaseMechanism`, the unit test goes red. **Cannot empirically refute; design holds on the plan's stated seam.**

**C5b.** See N3. Distinct roles on one cluster satisfy pairwise `===`. The "≥6" count is false; the role-URL mechanism is fine.

**C5c.** C5f: `ALLOW_CONNECTIONS false` does **not** block `CREATE DATABASE … TEMPLATE` (three runs). Connect to template refused. Roles created in the template DB are cluster-global (visible on `postgres`). Hole the plan names ("fine: one cluster per worktree") holds. Residual: two Foundries must not share a cluster (pid-named clones do not protect roles). **Did not refute the design.**

**C5d.** `migrate()` order = lexicographic filenames (covers two `0025_` files). File-**list** hash does **not** cover in-place body edits (N4).

**C5e.** Counter-argument: a TypeScript-only RED test does not need Postgres, so SQLite/pg-mem could still be "the agent's bench" for some faults. Settlement: W2/W4 demand `DEBATEAI_WORKTREE_DB=1 pnpm test:s00`, which **is** the 34 embedded-PG files; those assert PL/pgSQL (171 functions), pgcrypto, SECURITY DEFINER (grep 143 / live 109), advisory locks (`migrate` itself). Option 0 as **the** Foundry is non-viable. Option 0 as an extra unit-test backend is irrelevant to W2. **Plan's Option 0 verdict stands.**

**C5f.** Three runs, timings above. Clone of an **empty** template is 51–60 ms, not initdb (553–944 ms). "Milliseconds" is true for this fixture. **Not measured:** clone of a 51-migration template (disk copy scales with data dir). Disclose that limit.

**C6.** Base/rebase (App. A R03′): one rebase of an unpublished lease is coherent; a **pushed** branch that then needs rebase implies force-push, which the plan does not authorize — it only rebases **before** publish. After publish, a moving `origin/dev` makes a conflicting draft PR; V merges or not. Acceptable if stated. Rulesets: API `[]`; **UNVERIFIED** that GitHub can confine a bot to `refs/heads/fixagent/*` while forbidding `dev`/`main` — I did not create a ruleset (write). GitHub's ruleset model supports ref-name patterns + actor bypass; Op 0.4 is still load-bearing and currently **absent**. Draft PR: `--draft --base dev` is the right shape for V-1 (nothing lands). Gitignore: see N5; works **after** the ignore line is on the daemon's target checkout (V's main tree, 63 worktrees — "which checkout?" is C9). Kill mid-push: `git push` is not a process-group the daemon fully owns once the remote has the pack; R08′ "aborts any in-progress push" can leave `origin/fixagent/<hash>` without a PR. Plan does not name orphan cleanup. V-11 code-first risks not in the row: spend before V sees a proposal; live bot token on empty rulesets; draft-PR inbox; orphaned remote ref; flapping fingerprint burns `callsPerDay` while V is away. Caps exist in §6, not in §12.

**C7.** Thin-loop-first: FIX-09 `Depends-on for dispatch: none`; `Depends-on for acceptance: FIX-01 merged`. FIX-13 depends on FIX-12, not on FIX-02..08. Inverting G1 width is **SPEC-legal** for one scheduler surface. Op 1 ‖ Op 2 file-disjoint **if** Op 1 obeys FIX-01 §7 (runtime + scheduler cli + fix01 tests) and Op 2 stays on `tests/support/worktreeDatabase.ts`, `tools/foundry/**`, `package.json` `mock:*`, `fix17-*.test.ts`. The `DEBATEAI_WORKTREE_DB` seam edits `tests/support/testDatabase.ts`, which FIX-01 lists **read-only** — Op 1 must not touch it; merge conflict risk is low. **B1 destroys this disjointness** by pulling runner/zone/demo files into VS-1. Child worktrees: N7. Timeline: N9.

**C8.** V's style (example → options → recommendation) is only partly followed. V-9 states the order and options; no example of a `fixagent/*` push. V-10 has no example of the one conflict file and no failing-check branch (N8). V-11 has the 09-01 vs 09-02 quote (good) but undersells spend (N8). V-12 is the clearest; Option 0 is argued in §7 not in the row — a V who reads only §12 will not see the SQLite kill-shot. V-13 is self-contained enough; rec (c) now / (b) at Op 5 matches G12. V-14 rec (a) gitignore + PR body is right **if** N5's citations are fixed; writing into "V's main checkout" needs a path. V-15 rec (a) matches FIX-01's one-command surface — **right on the evidence.** No recommendation is contradicted by a probe except V-10(a) being incomplete given two red checks.

**C9 — omissions (three+ classified):**

1. **Who runs the FixAgent daemon, which OS user, which launchd plist, which directory is "V's main checkout" among 63 worktrees.** Plan §8 says "on this Mac outside any worktree" and FIX-09 absorbs S25 launchd, but Op 3 never names the plist or the write path for `.fixagent/`. **Real gap** — W5 is a file-in-the-app; without a path it is not operable.
2. **Hatchet.** Container is up next to Postgres. FIX-01 W1 is the scheduler **CLI**, not a Hatchet workflow. Loop table never mentions Hatchet. **Correctly out of scope for W1–W7**; should be one deferred sentence so a later seat does not "helpfully" wire `hatchet_ingest`.
3. **13 unmerged `codex/accounts-*` / `auth-*` vs PR #8.** Op 0.5 already presents them for keep/delete. **Correctly in Op 0, not the campaign body.**
4. **`accounts-program-closure` board** (measured: running 1, blocked 16, todo 42, ready 10, done 33). **Correctly out of scope** as a program; the 13 local branches are its leftovers and are already on the janitor list.
5. **`translation` mission.** Halted (tree has `docs/missions/translation/HALTED-RESTART-HERE.md`); board ready 18 / running 0. **Correctly out of scope.**
6. **model-evaluator** board done=10. **Correctly out of scope.**
7. **CI has no DB service.** Plan T4 and §7.4 state this. **Covered.**
8. **Daemon vs 63 worktrees / two sessions on one `dev`.** Risk 15 names the 2026-09-01 trap; does not say the alert-writing daemon must refuse to start if it cannot identify a single main checkout. Fold into gap 1.

## What I did NOT verify, and why

- Did not run `pnpm typecheck` or `pnpm test:s00` (packet forbids `pnpm test`; typecheck allowed but the 8-diagnostic claim is already pinned in TYPECHECK-BASELINE.md and I did not re-pin in a clean worktree).
- Did not re-run the 6 red obs tests (would be `vitest` on two files — allowed as one-file, skipped to stay inside time; audit three-run logs exist).
- Did not create a GitHub ruleset (write) — C6 ruleset **capability** is UNVERIFIED; presence is `[]`.
- Did not migrate 51 files in C5f — clone timings are empty-template only.
- Did not `docker exec` DDL/DML; SELECT-only `obs.occurrence` count and `pg_proc.prosecdef`.
- Did not enter `.worktrees/` or `../DebateAIRO-worktrees/`.
- Did not read other lenses' verdicts (none exist; `reviews/` was empty).
- Provider cap clock (T7) not re-derived.
- Did not verify `gh api` repo ruleset **schema** against GitHub docs beyond the empty list.
- Author's `SKILLS LOADED` for the war-plan session: not on the artifact; not hunted across other tickets (out of contract: comments on `t_d9a33421` only).

## Predictions (C10)

The author will treat Op 1's "B1/B2/N4 inside FIX-01's file surface" as a janitor convenience and expect the reviewer to wave it as non-blocking hygiene. It is the one place the plan **breaks frozen SPEC law without a V row**, and it is the finding I would want a second reviewer to open first: `sed -n '108p'` against FIX-01 SPEC §7 and the audit's `apps/runner/src/index.ts` path. Second: `template.ready` hashing names not bytes — easy to miss because the sentence sounds like a rebuild rule. Third: V-11 as a row that a V can answer without §6 — I expect the author thinks "nothing LANDS" is a complete answer to "in charge of everything"; a second reviewer should ask what happens on the first flapping fingerprint with a live bot token and `rulesets: []`. I may have over-weighted child worktrees (N7) — a second reader could lawfully read item 3 as permitting isolation inside a slice; I would not die on N7 if B1 and N4 are fixed. I expect no other lens exists (packet: this seat is the only independent reviewer); these predictions are for the author's rework pass and for V.

## Spend: wall-clock, turns, tokens if the CLI reports them

- Wall-clock: ~1.3 h from CLAIM (ticket comment 2026-09-02 19:27 local launch; C5f completed 16:40 UTC / 19:40 EEST).
- Turns: this session, single seat, no sub-delegation (not granted).
- Tokens: CLI did not report a total; not invented.
- C5f: 3 successful process runs after 3 failed runs (module resolution); ~5 s of PG time once resolved.
- Board comments before this verdict: CLAIM posted; HEARTBEAT to follow; READY is the last write.
