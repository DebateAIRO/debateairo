# CODEX REVIEWER PACKET — lane/sealedrows r1

You review someone else's work AND the packet that dispatched it. You do not write product code.

## Constants — every one re-read at packet-write time, verify each yourself

```
lane worktree : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-sealedrows
base tip      : 7dda3cc0d3305c96e62dadb77f1eb941165d633a
worker tip    : 7d0d150c
diff          : 9 files, 221 insertions(+), 52 deletions(-)
```

The worker left the work UNCOMMITTED; the orchestrator committed it as `7d0d150c` without
altering a byte, to protect it and to give you a stable tip. Verify that: `git diff` between the
worker's reported file set and the commit must be empty of surprises.

## What landed

**F-SEALEDROWS-A.** Both deployment seeders threw `*_CONTRACT_TEXT_UNRESOLVED:conformance` since
T9 (`c1d8e09d`) rewrote the conformance prompts. The retired locator quoted the prompt's own
wording and demanded exactly two matches; it found zero. The seat replaced it with a locator
whose search key derives from the evaluator's **response parser** rather than the prompt text.

**V RULING 2026-09-04 (product, not mechanism):** the conformance contract hash covers the
EVALUATOR prompt alone. The writer's prompt already carries `composerContractHash`. V declined
the combined hash and declined retiring the slot.

**F-T9B-3.** A new sealed `emptyBasisFloor` entry whose trigger is the empty basis itself, so a
floored band stops borrowing `REASONING_CEILING`, whose reasoning-share trigger cannot fire on an
empty basis. Both seeders, both `.strict()` schemas.

## Read these before mission work

- `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/DECISIONS.md` — especially D56, D58, D59.
- `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/sealedrows-worker.md` INCLUDING `# AMENDMENT 1`.
- `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/sealedrows.md` and `sealedrows-self.md` in full.
- `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/F-SEALEDROWS-A-conformance-extractor.md`, `F-T9B-3-floor-entry-ownership.md`,
  `F-SEALEDROWS-B-retired-protocol-fakes.md`, `F-SEALEDROWS-C-locator-duplication.md`,
  `F-T17-T9-role-rows-unsealed.md`.

## Questions this review must answer

1. **Is the new locator actually more durable, or differently fragile?** It keys off the
   evaluator's response parser. What happens when a criterion is ADDED or RENAMED? Does the
   fingerprint then move for a reason that is not a prompt rewording — and is that right or wrong?
2. **Does it implement V's ruling exactly?** Evaluator prompt alone. Not the writer's, not both.
   The seat claims the combined-hash variant is pinned out by test and killed as mutant m5.
3. **The seat reports m3 SURVIVED on first run** because its assertion was shaped by the mutant it
   had been shown rather than by the property, and the dev row had only a membership check. It
   says it replaced this with one property-derived predicate applied to both deployments. Verify
   the replacement genuinely discriminates — re-run it if you can, and say so if you cannot.
4. **F-T9B-3's band check.** The seat claims it was previously tautological (the entry was FOUND
   BY the equality it then checked — D56) and is now real because the entry is NAMED. Confirm or
   refute, and confirm `BAND_CEILING_FLOOR_UNDESCRIBED` still fires on an undescribed floor.
5. **The `emptyBasisFloor` member is OPTIONAL**, which the seat says is forced by the read-only
   `t17-envelope-ledger` fixture. An optional field on a shared settings object is the exact
   defect class that produced F-S11-6 and F-T17-T9 in this mission. Is optional the right call
   here, or is it the same mistake a third time?
6. **Suites.** Seat reports the cluster three times identical at `13 failed | 1525 passed (1538)`,
   base tip `13 failed | 1505 passed (1518)`, zero new failures, net +20 passing, typecheck exit
   0. Check the arithmetic and the naming of all 13.
7. **Packet audit.** AMENDMENT 1 admitted two orchestrator defects (PD-SEALEDROWS-1's contract gap,
   PD-SEALEDROWS-2's false premise). Audit the amended packet for defects it did NOT admit.

## Method

Static review. Run no mutating git command. If you run tests, say exactly which and report them
`passed/total` with every failure named. Verify by ARTIFACT, never by a claim in the report:
where the seat says a log exists, open it.

`records compared: N` in any `stamp-check.sh` output must be read against the number of records
you expected — it takes a PREFIX, and an expanded glob silently compares one file while printing
`failures: 0`. See `.hermes/TOOLING-TRAPS.md`.

## Output — write ONLY these two files

```
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/sealedrows-codex-r1.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/sealedrows-codex-r1-self.md
```

Line 1 of the verdict file, exactly:
`CODEX REVIEW SEALEDROWS r1 — <APPROVE|CHANGES> · comments read through: sealedrows-r2-2026-09-04`

Then: finding counts; one block per finding with **File/line · Input → wrong outcome · Required
fix**; a `## Packet audit` section; a `## Not verified` section that does not silently promote a
gap to evidence; and a `## PREDICTIONS` section naming what another lens will likely miss.
