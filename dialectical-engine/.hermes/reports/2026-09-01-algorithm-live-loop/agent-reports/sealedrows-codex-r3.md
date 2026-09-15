CODEX REVIEW SEALEDROWS r3 — CHANGES · comments read through: sealedrows-rework2-2026-09-04

Finding counts: **2 blocking findings · 0 non-blocking findings · 0 new packet defects**. The current evaluator dataflow is correct, F-SEALEDROWS-D is closed, and the filed r3/r4 campaign outcomes are independently supported; the blockers are the replacement guard and the shared mission tool's broadened `NOT-RUN` classification.

## Findings

### B1 · The replacement “class guard” is a token blacklist, and it drops a parser/prompt invariant that still has a job

**File/line ·** `tests/unit/f-sealedrows-a-conformance-extractor.test.ts:39-44,76-108`; `apps/runner/src/index.ts:175-188`; `acceptance/seed-register.ts:115-134`; `apps/runner/src/dev-deployment-register.ts:194-213`.

**Input → wrong outcome ·** Reintroduce a source locator as `digest(requireMatch(runner, /EVALUATOR_CONTRACT_TEXT\s*=\s*"([^"]+)"/, "conformance"))` while leaving the now-unused import in place. It searches the runner source and can again be redirected by a commented declaration, but all seven focused tests remain green: the current source yields the same bytes, and the purported class guard only bans four spellings (`criteria: z.object`, `balancedObjectBody`, `evaluatorVerdictSchema`, and one escaped literal prefix). Independently, add a required boolean criterion to `evaluatorVerdictSchema` without editing `EVALUATOR_CONTRACT_TEXT`. The focused suite still stays green, while providers following the sent prompt omit a member the parser now requires and exhaust the content-repair path. The old parser/prompt-drift refusal was therefore not made moot by deleting the locator; its coverage was deleted. The per-copy zero/duplicate/anchor refusals really are moot because there is no extractor or twin, but the schema/prompt agreement is not.

**Required fix ·** Replace the blacklist with a positive structural/dataflow assertion—preferably a TypeScript-AST check—that both conformance hash initializers digest the imported identifier and that the evaluator system-message initializer uses the same identifier. Retain an executable schema/prompt agreement check derived from the declared criterion keys. Do not restore the duplicated locators or their locator-only refusal cases.

### E1 · `NOT-RUN` now turns any pre-apply `ABORT:` into a clean transcript

**File/line ·** `.hermes/reports/2026-09-01-algorithm-live-loop/tools/mutant-index.py:88-112`; `.hermes/reports/2026-09-01-algorithm-live-loop/tools/mutate.sh:14,27-32`.

**Input → wrong outcome ·** Run `mutate.sh` from a dirty tree. Line 14 writes only `ABORT: tree dirty before mutation (D24 ADDENDUM-2)`—no commit/tree stamp, pre gate, applied gate, restore gate, or test exit. In v3, any `ABORT:` with no parsed `GATE applied` takes the early branch at line 100; with a manifest entry of `NOT-RUN`, the tool increments `not_run`, skips every custody and missing-exit check, prints `invalid=0` and `CLEAN`, and exits 0. An apply failure at line 30 has the same shape. v2 rejected those records as malformed, so the change weakens an existing classification rather than merely adding the intended non-crediting class.

**Required fix ·** Admit `NOT-RUN` only for the proved pre-gate collision shape: a normal stamp, a positive `GATE pre`, no applied gate, and the specific “NEW token already present” refusal. Keep dirty-tree, apply-failure, truncated, unstamped, or otherwise gate-less aborts `INVALID`. Add fixtures for the valid collision and each invalid pre-apply abort before using v3 mission-wide.

The defect does not falsify this lane's filed tallies: the one r3 NOT-RUN transcript has a stamp, `GATE pre = 2`, the exact token-collision refusal, and no applied gate; all eight r4 transcripts applied. Both retained indexes reproduce byte-for-byte from v3 and their manifests with exit 0. The shared tool still cannot be accepted as a correct replacement while it blesses other D24 failures.

## Review answers

1. **The current “thing hashed is the thing sent” dataflow is closed.** `EVALUATOR_CONTRACT_TEXT` is the sole definition at `apps/runner/src/index.ts:175`; acceptance hashes it at `acceptance/seed-register.ts:129`, development hashes it at `apps/runner/src/dev-deployment-register.ts:208`, and the only evaluator provider call uses it as the sole system message at `apps/runner/src/index.ts:4144`. `buildSchemaRepairPacket` at lines 1281-1287 appends a user message to the original packet; it neither replaces nor adds a system message. The gateway forwards `attemptPacket.messages` unchanged. No second evaluator system literal or call site exists. The retained value is 339 bytes with sha256 `2364b1b548c0e5a4f758ef325ed0234764aec9f88bc340a1f8c958bd3cc69b73`; both seeder artifacts report hashes equal to it and different from the composer hash. No re-seed is needed for this move.

2. **The class guard is decorative, not enforceable.** It pattern-matches a short deny-list and can be bypassed by the source-search form in B1. Deleting the duplicated extractor refusals was correct, but deleting parser/prompt agreement was not.

3. **F-SEALEDROWS-E is not an architecture violation on the evidence filed, and routing through `packages/register` is not warranted.** `auditArchitecture` reads the workspace dependencies from the 28 listed `package.json` files (`tools/orphan-audit/src/index.ts:9-63`); `acceptance/` is not a row and source-level relative imports are not inspected. The gate therefore could not adjudicate this edge even if it were green. On the merits, acceptance already imports `@debateai/runner` in `acceptance/main.ts` and `acceptance/dual-maker-proof.ts`, and the seeder already read the runner source to fingerprint its contracts. The new import adds no package-level edge or cycle. The evaluator system prompt is runner-owned behavior; moving it into `packages/register` would invert that ownership merely to hide a sound dependency. Using the `@debateai/runner` package export instead of the relative path would be tidier, but is non-blocking and does not change the edge.

4. **Suite arithmetic is exact, but one test job was lost.** Each r4 cluster artifact is `1528/1541` with 13 failures; base is `1505/1518`; all four name sets and all three r4 repeats hash to md5 `9c28c8f4a3d1c891b78141b73e0aad76`. The conformance file has 11 tests at r2 and 7 at r3, while `f-t9b-3` rises from 15 to 16: `-4 + 1 = -3`. The locator-only success/zero/duplicate/anchor cases no longer have behavior to exercise. The parser/prompt-drift case still does, and B1 describes the missing replacement.

5. **AMENDMENT 3's control of the runner file was adequate.** The cumulative contract covers every changed path. In the repository's largest file, the r2..r3 diff is confined to a comment plus the two-line constant declaration and the one call-site substitution—three added non-comment lines, with no unrelated edit. The instruction named the exact allowed concerns and declared everything else out of scope. The new import direction was not expressly ruled, but the recommended mechanism necessarily exposed it and the edge is sound for the reasons above. I found no fourth-amendment packet defect.

F-SEALEDROWS-D is closed: `emptyBasisFloor` is required on the sole `BandCeilingRegisterRow` at `packages/serve/src/index.ts:296`; both strict deployment schemas require it; the three fixtures carry truthful floor entries; and `SealedBandCeilingRegisterRow` is absent rather than renamed. The retained typecheck artifact exits 0.

## Verification performed

- Committed tips resolve exactly: base `7dda3cc0d3305c96e62dadb77f1eb941165d633a`, r2 `4f4ee276`, r3/HEAD `4d93767629b36d764a00f8f9696cd0afb504f9bc`; porcelain is clean. Base..r3 is 14 files, +628/-62; r2..r3 is 12 files, +200/-366; both `git diff --check` ranges are clean.
- Traced the evaluator packet through the runner and provider retry path; searched every evaluator role call, system-message occurrence, contract constant use, locator export, alias name, and optional floor declaration.
- Re-derived the test-count delta from declarations: conformance 11→7, floor 15→16. Parsed the completed base, r2, and three r4 cluster artifacts; every r4 result is `13 failed | 1528 passed (1541)`, and the sorted failure-name md5 is `9c28c8f4a3d1c891b78141b73e0aad76` for base, r2, and all three r4 runs.
- Read the v2→v3 mission-tool diff and all r3/r4 manifests and derived indexes. Fresh read-only generator executions reproduced both filed indexes exactly with exit 0: r3 `9 · 7 killed · 1 survived · 1 not-run`; r4 `8 · 7 killed · 1 survived`. The retained v2 file exists separately.
- Counted the expected 22 r4 records: 12 stamp committed r3, 8 stamp the pre-commit r2 tip, and 2 generator artifacts are intentionally unstamped. Every one of the 12 paths in `r4-PRECOMMIT-MANIFEST.txt` matches the corresponding committed r3 blob.

## Packet audit

AMENDMENT 3 accurately admitted the r2 verdict, widened authority to every required outcome, and constrained `apps/runner/src/index.ts` narrowly enough to audit. Its recommended named-export route closed the current product defect. The worker also disclosed the import edge and tool edit rather than hiding them. The architecture-gate premise attached to F-SEALEDROWS-E is imprecise—the 28-row audit never scans `acceptance/` imports—but the r3 packet asks for that premise to be judged rather than asserting the edge is forbidden. No new packet defect is filed. B1 is an implementation/test-coverage blocker; E1 is a shared-tool blocker.

## Not verified

- A fresh suite run. Per the packet's static-review instruction, I verified completed artifacts and did not create a new passed/total. No interrupted run is reported.
- The database-backed seed→preflight→serve chain, a production empty-basis event, comparison with an older sealed register, the integration suite, or full `pnpm test`.
- Any deployed register value. The no-reseed conclusion is based on the byte-identical current constant, its retained digest, the two seeder artifacts, and the committed-blob manifest.
- Round 2's historical m3 survive-then-kill claim; the current m3 kill is independently supported, but the earlier history remains testimony.

## PREDICTIONS

1. Another lens will see that no extractor exists and accept the source-search guard without trying a locator whose spelling is absent from its deny-list.
2. Another lens will count all locator refusals as obsolete and miss that adding a schema criterion without changing the sent prompt still leaves the focused suite green.
3. Another lens will reproduce both clean mutation indexes and miss that the early `continue` also blesses dirty-tree and apply-failure aborts that v2 rejected.
4. Another lens will treat the already-red 28-row audit as evidence about the acceptance import, although that audit reads package manifests and has no acceptance row.
