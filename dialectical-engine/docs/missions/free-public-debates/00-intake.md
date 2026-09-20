# INTAKE — mission `free-public-debates` (heartbeat v4.0.0, graph mode)

- **Date:** 2026-09-20 · **Orchestrator:** Claude Code, Fable 5.1 (Claude-Router seat) · **Spine:** v4.0.0 · **Board:** `free-public-debates` (`~/.hermes/kanban/boards/free-public-debates/kanban.db`)
- **Mission home (where the mission tree is written and committed):** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine`, branch `integration/all` @ `5b6cc9b1`, 0 dirty at intake (`git status --short | wc -l`).
- **Lane:** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/fpd-s01/dialectical-engine`, branch `slice/free-public-debates-s01`, from `5b6cc9b1`; setup + baseline log `.hermes/reports/free-public-debates/logs/setup-fpd-s01.log`.
- Tags: `MEASURED` = a command was run and is quoted · `READ` = a file was read, cited `path:line` · `INFERRED` = reasoning, not observed.

## V's goal (verbatim, `/goal`, 2026-09-20)

> use /heartbeat family if necessary. start a mission and make it in such a way that free debates can only be public. it's only a backend change.

## V's rulings at intake (asked 2026-09-20, answered the same turn — verbatim option text)

| # | Question | V's answer |
|---|---|---|
| I-1 | What "free debates can only be public" means on the server | **"Auto-publish + no unpublish"** — when a Free run's answer is served, the server publishes it itself (no step-up grant for that system path), and unpublish is refused for Free runs. Premium stays as it is today. |
| I-2 | Free debates that already exist and are private today | **"Leave them alone"** — the rule binds only Free runs started after this ships; nothing already private is exposed retroactively. |
| I-3 | May the owner still delete a Free debate | **V, free text: "delete stays, but only the creator can delete a debate"** |
| I-4 | Scope | **V: "it's only a backend change."** No `apps/ui` file is written by this mission. |

## Classification (set once)

```yaml
risk_tier:
  S01: high   # publishes user content without the owner's step-up grant (a new system path through a SECURITY DEFINER
              # function = a migration), and changes the erasure path of a published run
ui: no        # V: backend only — no MOCK, no DONE gate; the oracle is the SPEC acceptance
slices: 1     # REQ may argue for a split in DECISIONS.md; the default is one vertical slice V can exercise alone
```

Lenses at REV(S01) for `high`: correctness/tests · security/data-safety · product-truth.

## R7 election — run as four explicit per-loop questions (V answered 2026-09-20)

```yaml
loop_ownership:
  orchestrator:  claude-fable-5.1        # this session — schedules, dispatches, consumes; no verdicts, no code
  requirements:  [claude-opus-5]         # V: "Claude Opus 5" (a stray "Something else" carried no text; V then ruled "Opus 5 only")
  architecture:  [grok]                  # V: "Grok" — CLI model id `grok-4.6` (see Transports)
  programming:   [codex@gpt-5.6-sol]     # V: "Codex gpt-5.6-sol"
  qa:            [claude-opus-5]         # V: "Claude Opus 5" — one blind Opus 5 session per lens
  veto:          [V]                     # Done on the slice = V's veto after personally testing
```

`Ruling:` the blind planning reviews (REQ-REV, ARCH-REV) are filled from the roster's `review_agents` for decorrelation — REQ (Opus 5) is reviewed by **Grok**, ARCH (Grok) is reviewed by **Opus 5** — why: no seat shares a base model with the work it reviews; cost if wrong: one re-dispatch of a one-pass review.
**Decorrelation (recorded):** REQ and the three REV lenses share Opus 5 — decorrelated by fresh session, prompt and probe-not-read only; V chose both knowingly in the election. Coding (Codex) vs review (Opus 5) is cross-house.

## Transports (probed 2026-09-20; no-terminal law — every seat is a background process or subagent)

- **Opus 5:** Agent tool, background, `model: opus`, fresh session per node; SendMessage is offered as a deferred tool in this harness build (resume path for rework).
- **Codex:** `/Users/vladmihaimiron/.local/bin/codex` (codex-cli 0.146.0) · `codex exec -c model='"gpt-5.6-sol"' --skip-git-repo-check "<pointer>" </dev/null` → `ALIVE gpt-5.6-sol`, session `01a0bfc2-e0ca-7572-a5d2-6616c417a964` (`logs/probe-codex.log`); resume `codex exec resume <id>`. Coding seats run `-c sandbox_mode='"danger-full-access"'` inside the lane cwd (standing ruling from `debate-tiers`: `workspace-write` cannot reach the board and blocks loopback fixtures — TRAPS headings "Codex workspace-write cannot reach ~/.hermes…", "codex workspace-write blocks real loopback HTTP fixtures").
- **Grok:** `~/.grok/bin/grok` 1.0.30 · `MEASURED`: `-m grok-4.6-build` is REFUSED (`unknown model id`); `grok models` lists `grok-4.6` (default) and `grok-4.5`; `grok -p "<pointer>" -m grok-4.6 --permission-mode bypassPermissions --cwd <dir>` → `ALIVE grok` rc 0 (`logs/probe-grok.log`); resume `grok --resume <id>`; sessions under `~/.grok/sessions/<encoded-cwd>/<id>/`.

## Measured state (2026-09-20, base `5b6cc9b1`; every `path:line` below was grepped at that commit)

**Why the base is `integration/all`, not `dev`** — `MEASURED`: `git grep -c plan_tier dev -- apps/api/src/index.ts` = 0 hits; `integration/all` = 3. `dev` (`f19c706f`) is an ancestor of `integration/debate-tiers` (71 commits behind), which is an ancestor of `integration/all` (396 further commits). The Free/Premium tier exists only on this line. `Ruling:` lane base and MERGE(S01) target = `integration/all` — why: the feature is undefined where `plan_tier` does not exist; cost if wrong: one rebase. The main checkout (`integration/debate-tiers` @ `18374fa8`, 194 dirty entries, other missions') is never touched.

**No-touch listeners** (`lsof -nP -iTCP -sTCP:LISTEN`, 2026-09-20): `:3100` `:3101` `:8890`–`:8896` (node — a served stack), `:55433` `:7177` `:8988` (Docker), `:9797`, `:11434`. Also no-touch: `.local/**` (provider config with authorization headers — never printed), any live database.

### The tier on a run — `READ`
- `packages/contract/src/plan-tiers.ts:5 — export const PlanTierSchema = z.enum(["free", "premium"]);`
- `packages/contract/src/index.ts:118 — plan_tier: PlanTierSchema,` (the ask; `.strict()`)
- `apps/api/src/index.ts:1397 — planTier: ask.plan_tier,` (handed to `startRun`)
- `packages/db/src/schema.ts:121 — planTier: text("plan_tier"),` · `migrations/0061_plan_tier_on_run.sql:1 — ALTER TABLE core.run ADD COLUMN IF NOT EXISTS plan_tier text;` with `CHECK (plan_tier IS NULL OR plan_tier IN ('free','premium'))` (:5). **`plan_tier` is NULLABLE** — runs older than migration 0061 and legacy-principal runs carry NULL. `INFERRED`: NULL is not `free`; I-2 ("leave them alone") already covers every existing row.

### Publication today — owner-driven, step-up-gated, encrypted snapshot — `READ`
- Routes: `apps/api/src/index.ts:164` publish · `:165` unpublish · `:161` visibility (all `auth: "user"`, `resource: "run-owner"`); handlers at `:1105` and `:1150`.
- `apps/api/src/publications.ts:194 — async publish(input: Readonly<{` takes `authenticated` + `grantToken`; it calls `preflightGrant` (:150), reads the author pseudonym, `prepareKeyProvision`, builds `PublicDebateSchema`, encrypts with a per-publication corpus key, then `repository.publish`. `:301 — async unpublish(input: Readonly<{` is the mirror.
- The grant is enforced IN THE DATABASE, not only in the API: `packages/db/src/publication.ts:10` names `core.transition_run_publication(uuid,…)`; its newest definition is `migrations/0040_account_erasure.sql:3946` (`SECURITY DEFINER`), and `:4014-4020` selects a live `identity.step_up_grant` row bound to `token_hash`, `session_id`, `user_id`, `action`, `target_run_id`. **There is no system path: a publish without a user session and a grant cannot succeed today.** A new path is a migration.
- Publishing happens in the API process with the `Answer` in hand (`apps/api/src/index.ts:1128-1142`: `withContentLease` → `readRunAnswer` → `publications.publish`). `publish()` returns null for `answer.terminal === "BLOCKED"` (`publications.ts:201`).
- The back-compat trap of `docs/missions/public-debate-access/INTAKE.md` ("The load-bearing finding") still binds: a REQUIRED key added to `PublicDebateSchema` makes every older snapshot a 404.

### Deletion today — `READ`
- `apps/api/src/index.ts:132 — { route: "DELETE /v1/debates/{id}", auth: "user", resource: "run-owner", action: "erase-private" },` · handler `:771` → `accountErasure.deletePrivateDebate` (`apps/api/src/account-erasure.ts:95`), step-up-gated.
- `apps/api/src/index.ts:788 — return reply.status(409).send({ error:"DEBATE_MUST_BE_PRIVATE" });` — **a PUBLISHED debate cannot be deleted today; the owner must unpublish first.**

### Baseline at `5b6cc9b1` in the lane — `MEASURED` (`logs/setup-fpd-s01.log`; failing names in `logs/base-red-*.log`)

| suite | passed/total | failing at base (pre-existing, 2026-09-20, none of this mission's) |
|---|---|---|
| `tests/unit/s8-publication.test.ts` | 26/26 | — |
| `tests/unit/s8-publication-http.test.ts` | 4/4 | — |
| `tests/integration/s8-publication-database.test.ts` | 25/26 | "preserves a committed corpus key when the publish result is transport-ambiguous" |
| `tests/architecture/s8-publication-contract.test.ts` | 4/5 | "ships the deliberate controls and public-only reader in the UI composition" |
| `tests/unit/s7-authorization.test.ts` | 30/31 | "keeps one complete, duplicate-free policy row per contract route" (expects 50 routes, finds 52) |
| `tests/unit/s10-erasure-http.test.ts` | 8/8 | — |
| `tests/unit/pda-s04-node-carrier-audit.test.ts` | 2/2 | — |
| `tests/unit/tiers-s02-admission.test.ts` | 15/15 | — |
| `tests/integration/tiers-s02-run-plan-tier.test.ts` | 6/6 | — |
| `tests/integration/plan-tiers-route-privileges.test.ts` | 1/1 | — |
| `tests/architecture/register-support-publication.test.ts` | 12/14 | "recognizes hostile static SQL concatenation…" · "classifies every register relation access…" (`TypeError … reading 'TS'` — TRAPS heading "The root `typescript@7.0.2` package ships NO JavaScript compiler API") |
| `tests/unit/api.test.ts` | 31/31 | — |
| `pnpm exec tsc --noEmit` | 70 diagnostics at base (`logs/typecheck-base.log`) — assert the DELTA, never zero | |

`s7-authorization` counts policy rows per contract route: a slice that adds a route moves an already-RED count — the SPEC must say how that suite is asserted (delta on the named test, not suite green).

## Contradiction check — resolved or routed NOW, at one seat's cost

| # | Conflict | Disposition |
|---|---|---|
| C1 | "free debates can only be public" vs publication requires the owner's live step-up grant, enforced inside `core.transition_run_publication` | **RESOLVED — V, I-1.** A server-side system publish path for Free runs, with no grant; the owner-driven path and Premium are unchanged. |
| C2 | "only public" vs Free runs that are private today | **RESOLVED — V, I-2.** No backfill; the rule binds Free runs started after it ships. REQ states the mechanical boundary (what "after it ships" is measured by). |
| C3 | V, I-3 "delete stays" vs `DEBATE_MUST_BE_PRIVATE` (a published debate cannot be deleted) + I-1 (a Free debate cannot be made private) — together a Free debate could never be deleted | **RESOLVED in outcome by V, I-3:** the creator can delete a Free debate while it is public, and the public copy goes with it. HOW is ARCH's. "Only the creator" is already the route's policy (`resource: "run-owner"`); REQ makes it a numbered, checkable requirement (another signed-in user and an anonymous caller are refused without learning the run exists). |
| C4 | "when a Free run's answer is served" vs `publish()` refusing `terminal === "BLOCKED"` answers | **ROUTED — row V-1.** Default: a BLOCKED Free answer is NOT auto-published (there is no debate to show; today's rule for every publish); it stays owner-only. |
| C5 | Auto-publish can FAIL (cipher/key store down, `publications === undefined` → today's 503) while the run itself succeeded | **ROUTED — row V-2.** Default: the run is never failed by a publish failure; the publish is retried by a reconciler until it lands, and until then the debate is visible to its owner only — it is never served as "private by choice". |
| C6 | "it's only a backend change" vs the UI's Unpublish control on a Free debate, which will now be refused | **ROUTED — row V-3.** Default: honour V's scope — no UI file changes; the API refuses with a typed error and the existing UI shows whatever it shows for a refusal. A follow-up UI ticket is filed as residue at TEST(S01). |
| C7 | Auto-publish names an author: publishing shows `author_pseudonym` (`apps/api/src/publications.ts:215` — `readAuthorPseudonym`) | **ROUTED — row V-4.** Default: the same pseudonym the owner-driven path uses; a run with no pseudonym available is treated as C5 (retried, never published under a real identity). |

## What the REQ node decides (and must not)

REQ writes the compass and ONE frozen SPEC (`slices/S01/SPEC.md`, `ui: no`) from this record: the exact trigger ("answer served") as an observable, the refusal contract of unpublish on a Free run (status + typed error), the delete-while-public contract of I-3, the I-2 boundary, the C4/C5/C7 defaults as requirements, the audit trail a system publish leaves (who/what is recorded as actor when no user session exists), and V's acceptance as numbered steps V can run once (`ui: no`) — V tests against the API and the existing public page, with no new UI. REQ does not design the migration, the reconciler or the function signature (ARCH's), and touches no product file.
