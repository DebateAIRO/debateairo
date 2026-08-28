# S05 REWORK 3 — CODE REVIEW, SHARED BRIEF (read this, then your lens)

You are ONE OF THREE BLIND PARALLEL LENSES. You do not know what the others examine; do not look for their work. **Do not read any Kanban comment on `t_6e99d607` posted after `2026-08-26 23:45`.**

**YOU ARE READ-ONLY.** No edit, create, delete, stage, commit, push, merge, or any git write. No Kanban writes. Tests, typecheck and probes are expected. **All probe artifacts go to a scratch dir OUTSIDE the repo** — a prior lens leaked two files into the worktree and had to report itself. **Scope every search**; do not run repo-wide recursive greps over `apps/` or `packages/`.

## THIS IS THE LAST ROUND
`rework_round: 3 of 3` under the standing convention, and `packages/obs-capture/install/*.ts` is in S05b's `contract.forbidden` — **after this, nobody edits these three files again.** Anything you let through is permanent. Equally: a finding you invent costs a round nobody has. Be exact.

## What you are reviewing
Worktree `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/obs-lane-2/dialectical-engine`, branch `obs-lane-2-capture`, base `7afdbe5`. **UNCOMMITTED.**
`cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/obs-lane-2 && git status --porcelain && git diff HEAD`
Expected set and nothing else: `packages/obs-capture/install/{api,runner,scheduler}.ts` and `tests/architecture/obs-l2-s05-{boot-capture,import-graph}.test.ts`.

**Note: rounds 1, 2 and 3 are all uncommitted and each overwrote the last in place, so `git diff HEAD` is the FUSED delta of all three.** You cannot diff round 3 against round 2. Prior lenses handled this by re-deriving properties from scratch against controlled mutants rather than trusting round-over-round claims. Do the same, and say so where it limits you.

## Authoritative sources
- `planning/L2-ADDENDUM-PLAN.md` **§2**, **§3.5**, **§3.7** (config seed table — the charged item turns on it), **§3.8**, **§6.1**.
- The packet the seat was given: `goal-packets/s05-rework-3.md` — it lists exactly what was ordered.
- Ticket: `hermes kanban --board observability-loop show t_6e99d607` — `--board observability-loop` **before** the verb; never `boards switch`.

## What rounds 1–2 CERTIFIED. Round 3 changed the installers again, so RE-VERIFY rather than assume:
- **Paired-control equality** — with/without installer, 3 runtimes × static/dynamic: equal exit status and **BYTE-IDENTICAL stderr** (`Buffer.compare`, not length).
- **A clean shutdown writes NOTHING** (exit code 0 → zero records); a crash writes **exactly one**, never two.
- **Zero-arity handler** — the caught error is structurally unreachable from the serializer. Six token classes planted across message, a two-level `cause` chain, own properties and **stack-frame text** reached disk nowhere, on either write path.
- **G5-4** — the written record minus `occurred_at`/`source_event_ref` is **deeply equal** to the live `createSharedRedactor` output, 31 keys.
- **`O_EXCL` + `O_NOFOLLOW`** refuse a symlink planted at the exact predicted filename (`EEXIST`), and degradation is silent — no throw, no log, no boot delay.
- **The seam is capability-complete**: S05b can obtain the fd and write through it, swap the sink for one record not two, learn its runtime, and find records under `*.spool`.
- **13 reversion mutants** were caught by the suite.

## What round 3 was ordered to change
**CHARGED C1** — four Tier-0 defaults diverged from §3.7's seeds (`environment`, `build_ref`, `build_dirty`, `writer_identity`) and were undisclosed; they were **invisible to the suite** because the fixture sets all seven `OBS_*` vars, so no probe exercised a fallback. Ordered: align or justify each, **and add a test that exercises the UNSET environment**.
**UNCHARGED A1–A7** — type the seam (it was `any` via a const specifier, permanently unverifiable); set the latch **after** a successful write plus a `typeof` guard on `installExitSink`; validate the handed-out fd by `fstat` dev/ino before writing; make G5-5 part 2 falsifiable (its probe stubbed `setTimeout` and called `process.exit(0)`, so it was a tautology); normalise `OBS_SPOOL_DIR`; tighten a stderr assertion from byte-length to byte-identity; name or derive a bare `75`.

**Round 3 added new module-evaluation filesystem calls** — `lstatSync`, `realpathSync`, `fstatSync`, `closeSync` — on the boot path. That is new surface: new failure modes, new boot cost, and new import-graph footprint.

## Standing law
- **Excluded zone** — never modified, never imported, and **NO filesystem metadata of any kind**: `apps/api/src/registration.ts`, `apps/api/src/mail-channel.ts`, `packages/db/src/identity.ts` and its re-export block, `apps/api/src/mfa.ts`.
- **No user-linked identifiers, no free text** in anything durable; ids are **declared kinds, never shape-inferred**.
- **Typecheck (§6.1):** base `7afdbe5` — count **9**, sha256 `98c8eb42e833fff9b2db89c1dc1752210bd447fafc2481115d95d96db7a422c2`, tsconfig `905570a58575ed7b7b74f922ef3b5629395a05da266eb02c841ac1fb22a1868d`. **The count-0 pin at `80362d0` is VOID.** T-5 fail-closed: `pnpm generate:contract` first, **plus** a positive zero-escape assertion — escape is silent and a matching count is not evidence of containment.
- No push, merge, self-Done, ticket split, worktree/branch operation, database action.

## Method
Reproduce before concluding. Label **CONFIRMED** (executed) vs **PLAUSIBLE** (reasoned). "No defects in this lens" is a legitimate and valuable verdict. A false evidence claim is itself a blocker. **Report any undisclosed tuning constant** — an undisclosed value is what got each of the last two rounds charged.

## Return format
- **VERDICT:** PASS or BLOCK
- **BLOCKERS:** numbered; `file:line`, concrete failing scenario, CONFIRMED/PLAUSIBLE
- **NON-BLOCKING OBSERVATIONS**
- **WHAT I RAN:** exact commands, exact results
- **WHAT I COULD NOT CHECK, and why**
