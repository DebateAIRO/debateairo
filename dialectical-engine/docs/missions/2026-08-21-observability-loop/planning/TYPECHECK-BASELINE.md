# TYPECHECK BASELINE — mission 2026-08-21-observability-loop

## CURRENT PIN (re-pinned 2026-08-22 by Claude-Router — MANDATORY downward re-pin)

```
base commit : dev HEAD 80362d0 (43 commits past the original pin)
count       : 0
sha256      : 01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b
recipe      : pnpm typecheck 2>&1 | grep -E 'error TS[0-9]+:' | LC_ALL=C sort
```

**The baseline is now EMPTY.** Router-measured at dev HEAD before re-pinning.

### Why this matters, and what it changes

The previous pin (9 errors at `29f370e`) existed because an argon2 refactor was
split across the commit boundary: the ROW-GIT commit added the contract test
while the call-site updates stayed uncommitted in the accounts mission's working
tree. **The accounts mission has since landed that work** — 43 commits — and the
split is closed.

Consequence for TBP: with an EMPTY pin, `T-3`'s multiset-subset test reduces to
"observed must be empty", i.e. **absolute cleanliness is now both achievable and
non-vacuous**. That is the strictest form, and it is now the operative one. The
earlier reasoning still stands and must not be forgotten: absolute cleanliness
was the *vacuous* option only while the baseline was non-empty. It is the strict
option again now.

Re-pinning downward was **mandatory, not optional** — a stale pin larger than
reality re-authorizes errors that no longer exist. Upward re-pinning still
requires V and must name the commit and owner of each addition.

### Superseded pin (kept for the record)

```
base commit : 29f370e
count       : 9
sha256      : 98c8eb42e833fff9b2db89c1dc1752210bd447fafc2481115d95d96db7a422c2
tsconfig    : 905570a58575ed7b7b74f922ef3b5629395a05da266eb02c841ac1fb22a1868d
```

The nine were: `apps/api/src/main.ts(51)`, `packages/db/src/identity.ts(103,104)`,
`tests/architecture/t1-argon2-worker-contract.test.ts(405)`, and five in
`tests/integration/registration-database.test.ts`. Owner: accounts mission.
Split point: `9801f85`. **Resolved by that mission's own commits.**

### Note for lanes branched before the re-pin

Lane worktrees created from the old base still inherit the 9 until they rebase.
A lane measuring against the OLD pin is measuring its own inherited reality
honestly; a lane rebased onto current `dev` must measure against the EMPTY pin.
State which base you measured from.

---

## ⛔ THE OPERATIVE PIN IS VOID (Router, 2026-08-26) — READ BEFORE USING ANY NUMBER HERE

The pin recorded below as `base commit: dev HEAD 80362d0 · count: 0`, described as
"Router-measured at dev HEAD before re-pinning", **is VOID.** That checkout carried
**43 tracked modifications** at measurement time, including
`packages/contract/src/client.ts`, `packages/contract/src/index.ts` and
`packages/db/src/index.ts` — files directly in the typecheck program. It therefore
measured uncommitted in-flight work from another mission, not commit `80362d0`.

By this mission's own standing rule — *a pin whose expected value cannot be computed
by a party that has never seen the implementation is not a pin* — **the empty pin is
not a pin.** Found by an independent architecture seat against Router's own artifact;
Router verified and accepts it.

**Not blocking today:** the L2 addendum and every open lane measure at their own lane
base (`7a3ff39`), never at `80362d0`. **Router re-measures `80362d0` in a CLEAN
checkout before any lane is measured against dev again. Until then, do not cite the
empty pin.**

### TBP-GUARD — T-5, standing amendment binding EVERY lane (L4..L18 included)

T-1..T-4 are unchanged. **T-5 is new, mandatory and FAIL-CLOSED**, and it is a guard
rather than a step to remember:

A fresh worktree lacking the git-ignored `packages/contract/generated/client.ts`
**silently** typechecks against the PARENT dev checkout — `@debateai/contract` fails
to resolve inside the worktree, TypeScript walks up and out, and the lane measures
itself against a mutable tree it does not control. This produced the 42-vs-9
discrepancy on S06 and is **not merely wrong, it is non-deterministic**: two honest
measurements of the same commit at different times disagree, because the referent is
another mission's uncommitted work.

1. Run `pnpm generate:contract` **before** any measurement, and state that you did.
2. **Positively assert that ZERO module resolutions escaped the worktree root** —
   `tsc --noEmit --traceResolution` filtered for resolved paths outside the worktree
   root must yield an empty set. **Escape is silent and cannot be inferred from the
   diagnostic count; a matching count is NOT evidence of containment.**
3. If either check cannot be performed, the measurement **fails closed** and the lane
   posts a blocker. It does not report a number it cannot defend.
4. Every pin record states: commit · `git status --porcelain` **empty at measurement
   time** · `pnpm install` + `pnpm generate:contract` completed · `tsconfig.json`
   sha256 · T-5 containment asserted. **A pin taken in a dirty tree is void and must
   be re-taken.**

---

## Correction to the superseded pin (Router, 2026-08-22)

The superseded pin recorded **9** errors at `29f370e`. Router re-measured the
lane worktree, which sits at exactly that commit, and the true inherited count
there is **42**, not 9.

> **CAUSAL EXPLANATION CORRECTED (Router, 2026-08-26). The paragraph that stood
> here was WRONG, and wrong in a way that would have misdirected every later
> lane — read the correction before acting on the 42.**
>
> ~~Cause: the original 9 was measured before TP-10 was applied; TP-10 changed
> hoisting and module resolution and surfaced `apps/ui/**`.~~ **FALSE.**
>
> TP-10 is not the cause and a rebase is not the remedy. The real cause is a
> **module-resolution escape out of the lane worktree**, proven by controlled
> experiment at ONE commit (7a3ff39) with a byte-identical `tsconfig.json`
> (`905570a5…`) and TP-10 present in BOTH arms — the sole variable being the
> git-ignored `packages/contract/generated/client.ts`:
>
> | worktree | `packages/contract/generated/client.ts` | count | sha256 |
> |---|---|---|---|
> | `.worktrees/obs-lane-3` | PRESENT | **9**  | `98c8eb42…a422c2` |
> | `.worktrees/obs-lane-2` | ABSENT  | **42** | `f5a3e070…50d897` |
>
> `@debateai/contract` declares `"exports": "./generated/client.ts"`. When that
> generated file is absent, the specifier fails to resolve inside the worktree
> and TypeScript **walks up and out of `.worktrees/` into the PARENT dev
> checkout**, so the lane silently typechecks itself against **dev's** contract
> types. `tsc --traceResolution` names the parent path explicitly. The 33 extra
> diagnostics are contract drift, confined to files no lane opened.
>
> **Why this is worse than a wrong number: it is not reproducible.** The referent
> is the parent checkout's generated client, derived from another mission's
> UNCOMMITTED sources. Two honest measurements of the same commit at different
> times disagree — 15:43 gave `42 / 0d056e68…`, a later run gave `42 /
> f5a3e070…`. A hash over a mutable out-of-tree referent pins nothing.
>
> **Remedy is `pnpm generate:contract` in the lane worktree before measuring, not
> a rebase.** Independently confirmed by two blind Opus reviewers and one
> architecture seat, and re-verified by Router (TP-10 present in both arms, so it
> cannot be the differentiator). The enabling condition is that `.worktrees/`
> lives INSIDE the parent checkout; `@debateai/contract` is currently the only
> workspace package whose `exports` targets a git-ignored file.
>
> A binding TBP-GUARD procedure is under architecture ruling and will be
> appended here once ratified. Until then: any lane measuring in a fresh
> worktree MUST run `pnpm generate:contract` first and MUST state that it did.

The pin was therefore measured under conditions that no longer obtained by the
time any lane was measured against it. **Recorded rather than quietly restated:
a baseline captured before a resolution-affecting change is not the baseline the
lanes actually inherit.** Generalizes the standing rule — a pin must name not
just the commit but the workspace state it was taken in.

### What this does and does not change

- **It does not change any verdict.** TBP's load-bearing clause is **T-2: zero
  diagnostics in the lane's OWN touched paths**, absolute and baseline-independent.
  S02 and S03b both satisfy it — Router-verified **0** diagnostics across
  `obs-capture/**` and `obs-l2-*` tests.
- **It does not require a rebase.** Current `dev` is clean (0), so the 42 are an
  artifact of the lane's stale base and disappear when the lane merges into a
  clean target. Rebasing mid-lane would churn the branch for no gain.
- **The operative pin remains EMPTY at dev HEAD** for anything measured against
  current `dev`. Lanes still on the old base measure against their own inherited
  reality and must say so — which the S03b seat did correctly, unprompted.
