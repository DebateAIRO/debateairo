# PLAN — slice S03 · SCAFFOLD ONLY

**Written by REQ-S03 as a scaffold. `ARCH(S03)` (ticket `t_6b7afd11`) fills it and owns every word
below the headers.** REQ owns nothing here but the trace skeleton and the laws restated at the top.
There is **no line cap on this file** (V, 2026-08-28): a slice gets as many steps as it has.

Binding SPEC: **`docs/missions/debate-tiers/slices/S03/SPEC-v3.md`**, frozen at REQ-FIX-S03's READY
marker (pass 3 of 3, under the verdict `reviews/REQ-REV-S03-p2.md`). `SPEC-v2.md` and `SPEC.md` beside
it are byte-identical to their freezes and kept as the historical record — read v3, and never a memory
of v1 or v2.
`ui: no` — this slice passes through no MOCK gate and no `DONE.md`; its done oracle is SPEC-v3's
`## 2. Acceptance`, run by V.

## The quantifiability law — every step below obeys it

A step is finite, categoric and mechanically checkable: a stranger can mark it done without asking
its author what it meant. WRONG: "improve error handling". RIGHT: "requests with a missing id return
400 with a message, and the test asserting this passes". Banned in any step or criterion: improve,
better, robust, handle, appropriate. Every pinned number carries its derivation in the same sentence.
Line citations are re-measured in the LANE (`.worktrees/tiers-s03/dialectical-engine` @ **`9a000c37`**
— corrected from `7188b167` at pass 2, finding N1) at the moment they are written; the main tree's
`apps/api/src/index.ts` is 13 lines ahead (SPEC-v3 §0, DECISIONS 2026-09-13).

## 1. Steps

*(ARCH fills. One numbered step per unit of work, each naming the file it touches and the assertion
that closes it.)*

## 2. Clusters — BUILD units, one verification command each

Clusters are the smallest step-groups verifiable independently. Each is a BUILD node with ONE
command, run three times, worst run wins. **The review unit is the whole slice** (`REV(S03)`), never
a cluster: no cluster waits on a review.

| Cluster | Steps | Files it may touch | Verification command (one) | Depends on |
|---|---|---|---|---|
| `S03-C1` | | | | |
| `S03-C2` | | | | |

*(ARCH fills, adds rows as the cut requires, and names for each cluster the RED test that must fail
before its code exists.)*

## 3. SPEC ↔ PLAN trace — every requirement is covered by at least one step

*(ARCH fills the two right-hand columns. A requirement with no step is a plan defect; a step tracing
to no requirement is scope.)*

| SPEC | What it requires (one clause) | Step(s) | Cluster |
|---|---|---|---|
| R1 | `config/models.yaml` exists, is committed, is not rewritten by the reader | | |
| R2 | exactly two top-level keys, each a list | | |
| R3 | CLI entry = `cli` + `model`, full model id | | |
| R4 | API entry = `api` + `model` + `base_url` + `key` | | |
| R5 | `key:` is a variable NAME; no secret in the file | | |
| R6 | ≥ 2 entries, ≥ 2 makers, ≤ 1 entry per maker, per tier | | |
| R7 | the exact content at merge (Z.ai = the subscription endpoint), V's comments carried over | | |
| R8 | the file is the ONLY declaration — **quoted-exact oracle, no allow-list** — plus the positive limb, carried by **ONE** suite (`tiers-s02-rosters`, 5th case) | | |
| R30 | a key-based entry's `model` is an id its endpoint ECHOES exactly (F13) | | |
| R9 | a `cli:` entry is served by its local relay, unchanged | | |
| R10 | an `api:` entry is called directly over HTTPS with a bearer from the key file | | |
| R11 | a remote HTTPS base URL is admitted; **six** refusals still refuse | | |
| R12 | key-file custody (0600, owner, no symlink, nlink 1); never read, never printed by a seat | | |
| R13 | HEALTHY probe record whose `modelId` is the entry's id exactly (mechanism measured: F14) | | |
| R14 | the slot set = the file's entries **on every machine, keyed or not** · refs stable and a key arriving publishes NO version · **order: Premium's `cli:` first** | | |
| R15 | admission unchanged from S02 R3–R10 with the new lists | | |
| R16 | `/new` shows the lists after edit + restart, no UI rebuild | | |
| R17 | every id renders with a non-empty name and a visible dot | | |
| R18 | CLI pins are full ids from the file; alias derivation removed | | |
| R19 | `pnpm dev:auth:up` checks the file before it changes anything | | |
| R20 | **six SHAPE classes — refuse, always**; one FILE fixture each (class 6 = R11's first five only) | | |
| R21 | on a SHAPE refusal nothing is rewritten and nothing is stopped | | |
| R22 | the refusal names tier + model + class, and no key value | | |
| R31 | **availability (missing key · no answer) → the stack STARTS, the slot stays CONFIGURED (sentinel model, no credential) and leaves the HEALTHY panel only; the reason is named** | | |
| R32 | the post-merge start on a machine with NO keys: five slots configured, Premium healthy, Free refused by name | | |
| R33 | **no request leaves the machine for a slot with no credential** (zero calls to api.openai.com / api.z.ai) | | |
| R23 | **the five surfaces named separately** — configured set · api.env targets · discovery targets (all three: every entry) · HEALTHY panel (minus the absent slot) · `/new` (never minus) | | |
| R24 | an ENTRY-SET change publishes a NEW register version; a key arriving does not | | |
| R25 | api.env follows a real removal and still refuses a reconstruction | | |
| R26 | the support seam (ref, port 8794, credential) is untouched — no file of it edited | | |
| R27 | the twelve baseline suites keep `passed/total` or the delta is named (`dev-api-environment` = **10/10**; `tiers-s02-rosters` 4 kept + 1 new **= 5/5**, `PLAN_TIER_ROSTERS` surviving fed from the file) | | |
| R28 | a RED test per listed behaviour, shown failing first — incl. **6 file fixtures + 1 panel-build case** for R20/R11, and R23's five surfaces asserted separately | | |
| R29 | `pnpm typecheck` gains no diagnostic outside BASELINE.md's pins | | |

## 4. Boundaries, DDD impact and ADRs

*(ARCH fills: which package owns the file reader, where the check lives relative to
`apps/runner/src/dev-auth-stack.ts:246-256`'s start order, how `PLAN_TIER_ROSTERS` is fed from the file at load time
while `apps/ui` stops importing it (R8, R16, R27), the ADR for how a legitimate slot removal is told
apart from a stale api.env reconstruction — C14, SPEC R25 — and the mechanism for R33's no-call rule
on an uncredentialed slot.)*

## 5. Verification list for the slice

*(ARCH fills: the commands `REV(S03)` runs, the suites of SPEC-v3 R27 with their baseline rows, and
the three-run table shape. At lane HEAD `9a000c37`, `tests/integration/dev-api-environment.test.ts` is
**10/10** — v1's 9/10 row was measured at `7188b167` against a swept foreign hunk and is corrected at
`setup-tiers-s03.log:28`; a seat reporting 9/10 as "pre-existing" is reporting a regression. Only
`tests/architecture/register-support-publication.test.ts` is RED at base, 12/14 in both trees.)*
