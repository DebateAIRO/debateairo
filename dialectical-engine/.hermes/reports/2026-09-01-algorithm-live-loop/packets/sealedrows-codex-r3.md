# CODEX REVIEWER PACKET — lane/sealedrows r3 (rework round 2 of 3)

## Constants — derived from COMMITTED TIPS at packet-write time

```
lane worktree : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-sealedrows
base tip      : 7dda3cc0d3305c96e62dadb77f1eb941165d633a
r2 tip        : 4f4ee276
r3 tip        : 4d937676
base..r3      : 14 files changed, 628 insertions(+), 62 deletions(-)
r2..r3        : 12 files changed, 200 insertions(+), 366 deletions(-)
```

**Rework rounds spent: 2 of 3.** A further CHANGES verdict sends this to a V DECISIONS PACKET row,
not to a fourth worker round. Weigh findings accordingly: say plainly which are blocking and which
are not, because the difference now decides whether V is interrupted.

## What changed — B1a was fixed by DELETION, not by defence

The seat took your second option. `apps/runner/src/index.ts` now exports
`EVALUATOR_CONTRACT_TEXT` and **sends** it at the call site; both seeders import and digest it.
The locator, the anchor and the brace balancer are **gone**. Your own probe can no longer resolve —
`does not provide an export named 'extractEvaluatorContractText'`.

Orchestrator verification, independently run:

```
EVALUATOR_CONTRACT_TEXT: 339 bytes · sha256 2364b1b548c0e5a4…
acceptance seeder: 33 rows · conformance hash == evaluator digest: true
dev seeder       : 13 rows · conformance hash == evaluator digest: true
conformance hash != composer hash: true
```

The digest equals the expected value in the previous round's m5 transcript, so the value is
unchanged and **no deployment needs re-seeding.** Verify that yourself.

**B1b is claimed moot by construction** — there is no twin left to test. The seat replaced the
per-copy refusal tests with a class guard: neither seeder may search the runner source for the
prompt. **Judge whether that guard is real or decorative**, and whether deleting the per-refusal
tests lost coverage that the new design still needs.

**F-SEALEDROWS-D closed.** The member is required on the one remaining type, the
`SealedBandCeilingRegisterRow` alias is deleted, three fixtures carry a truthful floor, `tsc`
exits 0. You judged the alias "not sound versioning" in r2; confirm the alias is genuinely gone
rather than renamed.

**E1 repaired, and the mission tool changed.** `tools/mutant-index.py` **v3** adds a
non-crediting NOT-RUN class and stops the generator globbing its own manifest (v2 excluded
`INDEX` and `.md` but not `.manifest`). v2 retained. Two campaigns are now generator output with
durable manifests at exit 0: r3 regenerated (`9 · 7 killed · 1 survived · 1 not-run · CLEAN`) and
a fresh r4 (`8 · 7 killed · 1 survived · CLEAN`), fresh because m4/m4b/m5 targeted deleted code.
New mutants: **m7** sends a literal instead of the constant, **m8** restores the `?`.

**A mission tool was edited by a worker seat.** Assess that on its merits — the gap was real
(no class for a mutation that never ran, so a correct refusal read as malformed and as a KILL to
any exit-status driver, which is D46/D50's own subject) — but confirm v3 does not weaken any
existing classification, and that v2 is retained.

## Questions this review must answer

1. Is the "thing hashed IS the thing sent" property actually closed? The constant is exported at
   `apps/runner/src/index.ts:175` and used at `:4144`. Can any path still send a prompt that is
   not the digested constant — a literal reintroduced elsewhere, a second system message, a
   repair packet that rewrites it?
2. Is the class guard against re-introducing a source search enforceable, or does it pattern-match
   text and fail the way the four locators did?
3. **F-SEALEDROWS-E, filed by the seat, needs your judgement.** The fix creates a new
   `acceptance → apps/runner` import edge. `auditArchitecture` governs 28 edge rows, and its test
   is entry 5 of the mission's 13 known-red failures — **it was already failing before this edge
   existed**, so the gate cannot say whether the edge is admissible. Is the edge sound on its
   merits? Should it route through `packages/register` instead?
4. Suites: three runs identical by md5 `9c28c8f4a3d1c891b78141b73e0aad76` — the hash you computed
   — at `13 failed | 1528 passed (1541)`, base `1505/1518`. **Total is 3 LOWER than r2's 1544**,
   which the seat attributes to its own rewrite: 11 conformance tests replaced by 7, f-t9b-3 +1.
   Check that arithmetic and confirm no test was lost that still had a job.
5. **Packet audit.** You found zero new defects in r2. Audit AMENDMENT 3 — in particular whether
   granting `apps/runner/src/index.ts` with an instruction to touch only two things was adequate
   control, given it is the repository's largest and most collision-prone file. The seat reports
   the touch is three non-comment lines.

## Method

Static review. No mutating git command. Verify by ARTIFACT. `records compared: N` is read against
the number you expected. An interrupted run has no valid passed/total — say so, as you did in r1.

## Output — write ONLY these two files

```
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/sealedrows-codex-r3.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/sealedrows-codex-r3-self.md
```

Line 1 exactly:
`CODEX REVIEW SEALEDROWS r3 — <APPROVE|CHANGES> · comments read through: sealedrows-rework2-2026-09-04`

Then finding counts; per-finding **File/line · Input → wrong outcome · Required fix**;
`## Packet audit`; `## Not verified`; `## PREDICTIONS`.
