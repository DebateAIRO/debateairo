READY FOR PEER REVIEW · seat `cont-t1-web-retirement` · node BUILD(CONT-T1) · pass 1/3 · session `45ab9500-0991-4dbd-89ec-f04cc3082e67` · commit=4fdf48bad257bed61821aceed72a4534eb28f852 · comments read through: n/a (no Hermes board in this continuation)

# Self-report — the `web/` retirement, treated as a murder case

> treat it like a murder case. I want to get a nice report on what can be done
> better. What we must upgrade. what repeatedly costed us tokens. how we can make
> the coding more efficient. How can we turn this into a one prompt machine even
> better.

## 1. The body, and the actual cause of death

The visible corpse was five red gate rows and one suite that would not load. The
cause of death was **not** the merge. `web/` was ruled retired on 2026-09-02
(D23 ADDENDUM-2, `DECISIONS.md:810`; `PROGRESS.md:32`). The ruling deleted the
surface and named nothing that read it. Its readers — one tool row, one tool
function, two architecture tests, one unit suite — kept pointing at a tree that
no longer existed for two weeks, and the first thing they did was crash the
architecture audit before it could report anything at all.

So the cause is not "a merge dropped a tree" (that is already trap #1292). It is
that **a retirement ruling in this repo carries no reader list.** The whole of
today's task is one command plus five decisions:

    git grep -n 'web/' -- tests tools apps packages scripts acceptance

Eight hits, six of them mine. Had that command been run inside the ruling on
2026-09-02 and pasted into it, there would be no packet, no brief, no session.

## 2. The second body nobody had found

`pnpm run audit:architecture` had been dying on `ENOENT … web/package.json` for
the entire merge window. Three independent records — the gate report's fixer
note (§10 item 1), the continuation plan, and this task's brief — all predicted
that removing the `web` row would expose *"the three F31 obs-capture edge
violations"*.

It exposed **five**:

    "apps/api -> obs-capture is not a declared edge",
    "apps/api -> support-kb is not a declared edge",          <- never counted
    "apps/runner -> obs-capture is not a declared edge",
    "apps/runner -> support-kb is not a declared edge",       <- never counted
    "apps/scheduler -> obs-capture is not a declared edge"

`@debateai/support-kb` is a real workspace package that `apps/api` and
`apps/runner` really depend on and the audit table really does not declare. Two
genuine architecture violations sat invisible behind a crash, and three records
had independently written down a number that no run had ever produced.

**The upgrade this demands is one line of discipline: a crashed gate does not
report zero, it reports NOTHING.** Every count downstream of a throw must be
written `UNKNOWN`, never inherited from an older green or an adjacent ticket.
Appended to `.hermes/TOOLING-TRAPS.md` at this commit.

This is the same generating condition as the already-recorded `pnpm lint`
short-circuit (`TOOLING-TRAPS.md:1832`): a command that never ran, recorded as a
command that ran and passed. It has now produced a wrong constant twice.

## 3. What repeatedly cost tokens

| cost | what happened | the fix |
|---|---|---|
| **263 KB persisted dump, one wasted round trip** | `git grep -n 'auditS14TypeGraph'` with no pathspec. `docs/missions/**` in this repo holds raw agent transcripts as JSONL, so an unscoped grep returns megabytes of someone else's tool output. | Every `git grep` here carries `-- tests tools apps packages scripts acceptance migrations`. This belongs in the traps file as a standing rule, not as a lesson each seat re-learns. |
| **~900 lines read for ~60 lines of decision** | The packet's "read in FULL: every file in `allowed`" put `tools/orphan-audit/src/index.ts` (896 lines) and `tests/unit/s1-1-depth-contract.test.ts` (2 166 lines) on the floor. The second file the packet itself expects NOT to be touched. | `allowed` should carry a *write* surface and a *read* surface separately. A conditional write target ("only if its J10 arm still fails") is a read-the-arm target, not a read-the-file target. I read its J10 arm (2142–2166), its `describe`/`it` index and the `web/` comment at `:227`; disclosed in the handoff. |
| **six full cluster runs (~4 min)** | Three runs pre-commit, three at the tip, because "take the gates at that tip" and the three-run law compose multiplicatively. | Cheap and correct — keep it. But the gate script should stamp the commit itself so pre-commit runs are reusable when `git status` is clean and the tree is unchanged. |
| **zero** | The three-run law caught nothing: all six runs were byte-identical. | Keep it anyway. It is the only reason the verdict needs no hedge. |

## 4. What I nearly got wrong

1. **I nearly re-pointed the FX-ORPH-04 consumer walk at `apps/ui` by analogy.**
   `auditS14TypeGraph` derived the UI's consumed field set by regexing
   `const { … } = answer;` out of `web/lib/v3Presentation.ts`.
   `apps/ui/lib/debatePresentation.ts` *looks* like the successor. The one
   command that stopped it:

       grep -rln '=\s*answer;' apps/ui/lib apps/ui/components   # rc=1, zero files

   Without that measurement the audit would have gone on asserting `[] == []`
   under the same fixture id while checking a *different* property. A green
   fixture that silently changed subject is worse than a red one.

2. **I nearly left `expect(report.edgeRowsChecked).toBe(28)` alone.** The arm
   fails anyway on its next line (`violations`), so changing the literal looks
   cosmetic. It is not: with `28` the arm fails at *my* assertion and the residue
   gets attributed to me; with `27` it fails at F31's assertion and the
   attribution is correct. Assertion ORDER is part of who owns a red row.

3. **I nearly added the obvious class fix** — guard the manifest read so a
   declared row with no `package.json` becomes a *violation* instead of a throw.
   It is the right fix and I did not ship it, because the only test of
   `auditArchitecture` is `scaffold.test.ts`, whose write surface in this packet
   is one literal. Shipping production behaviour with no failing test first would
   have traded one contract breach for another. Ticketed instead (§6).

## 5. Dead ends — do not re-derive these

- **There is no `apps/ui` equivalent of `web/lib/v3Presentation.ts`.** Not by
  name (`git ls-files | grep -i v3Presentation` → nothing) and not by shape (no
  `= answer;` destructuring anywhere under `apps/ui`). Stop looking.
- **`web` is not a pnpm workspace member.** `pnpm-workspace.yaml` lists
  `apps/* packages/* packages/battery/* tools/*`. The `web` edge row was auditing
  a directory the package manager had never heard of.
- **Re-adding `["web","web",["contract"]]` as a mutant does not produce a RED**,
  it produces a BROKEN run (the audit throws again). The usable mutant is a bogus
  row pointing at an existing manifest — `["bogus-mutant","packages/kernel",[]]`
  — which moves the count without moving the violations.
- **`tests/unit/s1-1-depth-contract.test.ts` did not need touching**, exactly as
  the packet predicted. Its `web/` mention at `:227` is a comment recording an
  arm that a previous round already retired.

## 6. Findings this session opened, with file:line

Named, not fixed — all outside this packet's write surface.

1. `tools/orphan-audit/src/index.ts:50-56` — the manifest read is still
   unguarded. The next declared row whose directory lacks a `package.json`
   crashes the whole audit again, exactly as `web` did. Class fix: push
   `"<row> has no manifest at <dir>"` as a violation instead of throwing. Needs a
   test home in `scaffold.test.ts`, which this packet restricts.
2. `apps/api/package.json:1` and `apps/runner/package.json:28` declare
   `@debateai/support-kb`; the audit rows at `tools/orphan-audit/src/index.ts:31`
   and `:32` do not list it → two architecture violations no ticket names. Needs
   a ruling (declare the edge, or remove the dependency), not a patch.
3. `packages/serve/src/index.ts` — `projectServeEdge` and
   `projectNodeMakerLineage` had exactly one test, the deleted
   `tests/unit/s14-ui.test.ts`, and now have none. That coverage was already
   dead (the suite failed to load on every parent), so nothing *running* was
   lost — but the orphan is now visible and should be ticketed.
4. `tests/architecture/auth-front-door-parity.test.ts:1` — the file name and
   `describe("auth front-door parity")` overstate: one Next build survives, so
   there is no parity pair left. Renaming the file is outside `allowed`.
5. `apps/ui/components/VerdictBanner.source-test.mjs.disabled:122` — test title
   still names `web/lib/types.ts`.
6. `packages/evaluator/BIND-READINESS-seat-share.md:55,72` — still list `web/**`
   as a live workspace source root.
7. `web/next.config.mjs` — the last tracked file of the retired surface. Gate
   report §10 item 1 recommends deleting it; the Scope law reserves `web/`, so it
   is untouched and byte-identical (sha256
   `f5328333a4b38e993194b2ec419a333d0a6e8f388ff77ef3731136d6cba6afe3`).
8. `tools/orphan-audit/src/index.ts:107-113` — the UI-01 exemption comment
   justifies the `apps/ui` carve-out by analogy to "the root-level `web/` app".
   Historically accurate, now confusing. Left as-is deliberately.

## 7. Where the packet and its brief were wrong about reality

Reported, not absorbed (`heartbeat-protocol` §3.7).

| # | where | packet/brief said | reality |
|---|---|---|---|
| D1 | brief Step 1 | `git cat-file -e …; echo $?` → **1** | **128**, with `fatal: path … does not exist`. `1` is a missing *object*; a missing *path* is 128. Substance confirmed, constant wrong. Trap appended. |
| D2 | brief Step 4 / gate §10 item 1 | the violation list is "the 3 obs-capture rows of F31" | **5** rows; the two `support-kb` rows had never been counted (§2 above). |
| D3 | brief Step 4 | "the ENOENT rows pass" | **4 of 5** pass. Row 14 (`scaffold.test.ts` › edge rows) has its ENOENT cured but stays red on `expect(violations).toEqual([])`, which is F31's and outside my write surface. The packet's own verification clause anticipates this ("rows other tasks own may stay red"); the brief's Step 4 sentence does not. |
| D4 | gate report §10 item 1 | "2 of the 43 typecheck errors" | **8** of 43. The packet and brief say 8 and are right; the measurement of record is the wrong document. |
| D5 | packet §3 vs §1 | §3: sign `Co-Authored-By: Claude Fable 5.1`; §1: `model: claude-opus-5` | The seat is Opus 5. Signed as Opus 5 — signing as another model is a fabrication under §3.6. |
| D6 | packet §2 | "read in FULL: every file in `allowed`" | Includes a 2 166-line file the packet expects not to be touched. Read its J10 arm and index instead; disclosed. |
| D7 | packet §2 allowed | `scaffold.test.ts` — "ONLY the literal that pins the audit's edge-row count" | The count appears **twice** in that one `it` block: the `toBe(28)` and the test title *"matches all 28 dependency-edge rows"*. I treated both as the same pin and changed both; a title claiming 28 over an assertion of 27 is the drift this repo's trap file is made of. Judgement call, disclosed. |

None of D1–D7 blocked the work. D2 is the only one that would have produced a
false report if I had confirmed the expectation instead of pasting the verdict.

## 8. How to make this a one-prompt machine

Ranked by what each would have removed from today.

1. **A retirement primitive.** When a ruling retires a path prefix, the same
   commit runs `git grep -n '<prefix>' -- <code pathspec>` and pastes the hit
   list into the ruling. That list *is* the brief. This removes ~100% of this
   task: the packet, the brief, the investigation and the session.
2. **Gates that cannot lie about not running.** Wrap `audit:*` so a non-zero exit
   carrying a stack trace writes `verdict=UNKNOWN` into the gate record instead
   of an empty or inherited list, and change `lint` from `a && b` to running both
   halves unconditionally. This kills the family that produced D2, the
   `pnpm lint` trap at `TOOLING-TRAPS.md:1832`, and the "crashed = clean"
   reading in one edit.
3. **Derive packet constants; never hand-copy them.** D2, D4 and D5 are all
   hand-copied values that a dispatch-time command could have produced: the
   violation list, the diagnostic count, the model name. Write expectations as
   *measurements to take*, never as values to confirm — "paste the violation
   list" rather than "expect three".
4. **Split `allowed` into write-surface and read-surface.** The reading floor
   (§3.8) and the `allowed` list are fighting each other today: `allowed` is a
   write contract and the packet reuses it as a read order. One conditional write
   target cost 2 166 lines of floor.
5. **Pin the grep pathspec repo-wide.** `docs/missions/**` holds raw JSONL
   transcripts. An unscoped `git grep` in this repo is a guaranteed multi-hundred
   -KB dump, and every seat pays it once.
6. **Keep the refutation duty exactly as written.** The bogus-row mutant took
   four minutes and is the only thing separating "the pin is 27" from "the pin
   reads a number". Its value showed up immediately: the mutant changed *which*
   assertion in the arm failed, which is precisely the signal that proves the
   count is pinned rather than incidentally satisfied.
