# Phase report — ARCHITECTURE loop, mission `consent-ui` (2026-09-06 19:50 → 22:22 EEST)

**Gate:** both slice PLANs PASSED blind review at round 3 (S01 22:14, S02 22:22). The coding fleet is released: CODE-S01-C1C2 (lane `consent-s01`) and CODE-S02-C1C2 (lane `consent-s02`) dispatched 22:17 / 22:25.

## Rounds and cost
| Slice | Author (Opus 5) | r1 verdict | R1 rework | r2 verdict | R2 rework | r3 verdict |
|---|---|---|---|---|---|---|
| S01 | ARCH-S01 29 min / 315k | REWORK 6B/8N/4P (20 min / 270k) | 31 min / 345k | REWORK 1B (N3 carried)/2N/1P (21 min / 299k) | 22 min / 228k | **PASS** 0B/3N/4P (18 min / 225k) |
| S02 | ARCH-S02 ~35 min | REWORK 2B/8N/4P (20 min / 302k) | 36 min / 399k | REWORK 1B (new B3)/2N/1P (24 min / 292k) | 23 min / 286k | **PASS** 0B/5N/3P (20 min / 288k) |

Ten seats, ~3.2M subagent tokens, ~2h30 wall-clock. Every seat filed its self-report before its handoff; every declared skill was verified against the transcript BODY (0 fabrication findings in this loop; five honest floor shortfalls declared, four ruled correct by the re-reviewer, one — N9/S02 — ruled mis-justified and repaired the next round).

## What the loop found that the plans' authors could not
- **S01 B1 (machinery):** guard terms matched vitest's `✓` glyph with a bare `.` — 0 forever under BSD grep in the C locale, i.e. in every `.sh`, CI run and the three-run loop. Found only by running the command from a FILE. → COMMON §10.16 (satisfiability proof: `.sh` + inline, known-good synthetic input, per-term mutant).
- **S01 B2:** the colour-literal delta counted the pinned line, not the hit list; a second literal was invisible. → §10.18.
- **S02 B1 (mechanism):** the row's click rule and R17's onChange mirror desynchronise under jsdom's pre-click activation (DOM false / mirror true → `Create account` enabled with the box empty; two clicks ticked it with no acknowledgement). The reviewer's remedy wording was itself wrong (the onChange fires AFTER the row's onClick and overwrites the write); the author measured six mechanisms × 8 routes and pinned `setPrivacyMirror(e.currentTarget.checked && !e.nativeEvent.defaultPrevented)`. → §10.22 (remedies advisory, class binding).
- **S02 B3 (second-order):** fixing B1 correctly exposed that the frozen SPEC's R17 cases 4/5 expect a bare click to tick the privacy box — the defect had been propping them up. Cases moved to C7 and reach "both checked" via the modal acknowledgement; SPEC contradiction routed to **V-18**.
- **S02 r3 N12 (load-bearing for coding):** the click rule's predicate must read the MIRROR, never `input.checked` (already flipped in-flight when onClick runs) — carried into the CODE-S02-C7 packet as a binding constant (`t_b7de5321`).

## Orchestrator defects this loop (all priced in the ledger, all class-fixed in COMMON §10.16–10.27)
Quoted-but-unmeasured counts (ADR "37 + 14"), an ADR number collision with the halted translation mission (→ 0021/0022), a one-line-short cited range copied into an artifact, "read that range only", a packet that read as waiving a role floor, no pre-edit snapshots (now `snapshots/`), review seats' `allowed` lists lacking the probes directory (three reviewers left their probe kits in scratch), and a rework packet asserting a ripple axis that did not exist.

## V rows opened this loop
V-16 (Space on the empty privacy box opens the modal), V-17 (toggle OFF border 1.7:1 under WCAG 1.4.11; design fidelity default), V-18 (R17 cases 4/5 vs R05; folds into V-15's SPEC-v4 authorization). Defaults are binding until V rules; none blocks coding.

## Open residue (ticketed, docs-only, running beside the fleet)
S01 hygiene `t_df9fc4e2` (N11 range, N12 self-description) — seat running. S02 hygiene `t_3f776526` (N11/N13/N14/N15) — to dispatch after wave 1's first review lands. `t_7d1f35ca` packet fixes — closed by §10.16–10.27.
