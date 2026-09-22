# F-T1-ORACLE-LOGINFP — WORKER PACKET (codex W5 r2 F1 CONFIRMED the false positive, 2026-09-05)

```
mission dir   : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop
lane worktree : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-loginfp   (branch lane/t1-oracle-loginfp, cut from the dev-reconciled tip 2af816f1 — contains the oracle AND dev's LoginFlow; D66)
ticket        : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/F-T1-ORACLE-LOGINFP.md
filed by      : lane/devsync round 3 (/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/w5-dev-reconciliation.md — search LoginFlow)
confirmation  : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/w5-codex-r2.md — question 3
rework rounds : max 3
```

## The shape, exactly (read from the reconciled tree 2af816f1 and from W5's report line 431)

`apps/ui/components/LoginFlow.tsx:252` — `{[0, 1, 2, 3, 4, 5].map((slot) => (` — six auth-code boxes. The
oracle's **DOMAIN_ENUMERATION** arm reads a six-element integer array as a duplicate definition of the depth
domain. It is an index array over UI slots, not a depth domain: nothing in that file touches depth, and the
values are 0-based slots, not 1..6 depths.

## OUTCOME (D58)

T1's depth oracle (`tests/unit/s1-1-depth-contract.test.ts`) no longer reads dev's six-slot login array at
`LoginFlow.tsx:252` as an exclusive-six depth bound, AND it still catches every real depth site it caught
before (the planted controls die; the whole-tree assertions still name `apps/ui/app/new/page.tsx`). The fix
is a sensitivity change in the DOMAIN_ENUMERATION arm, justified in a comment by the shape it now excludes
(a 0-based index array with no depth token in reach) and the shape it must keep (the ruled domain's literal
values near a depth token) — not an allow-list of file names. RED first: the oracle red on this tree naming LoginFlow.tsx:252.
Mutants: (m1) re-loosen the lexer → LoginFlow returns as a site; (m2) plant a real exclusive-six depth bound
in a shipped file → still caught. Both via `tools/mutate.sh` v2 (slashes allowed now).

## Contract (D61)

allowed  : tests/unit/s1-1-depth-contract.test.ts · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-loginfp.md · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-loginfp-self.md · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-loginfp/* · .hermes/TOOLING-TRAPS.md (append-only)
readonly : apps/ui (dev's LoginFlow.tsx) · apps/ui/app/new/page.tsx · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/w3.md (the lexer's history, rounds 1–4) · /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/w3-codex-r4.md
forbidden: all_others · never push · never merge · never edit the board or the DECISIONS file · no credential values (D18)

## Records
Report, self-report (the router §3 question verbatim), markers with `comments read through: w5-codex-r2-2026-09-05`, `READY FOR PEER REVIEW` or `BLOCKED`.

## Provisioning and gates (D9 ADDENDUM; D66 accounting)
`pnpm install --frozen-lockfile` exit 0 · `pnpm run generate:contract` exit 0 (this tree's hash is 842c6c4e…; report it) ·
typecheck as a DIFFERENTIAL against W5's 8 inherited `s14-ui` errors · the oracle file's own suite verbatim `passed/total`
before and after · then ONE `pnpm test` on your tip with the four-count accounting (test failures / suite-load / skips /
unhandled), every failing name attributed to dev b5a6b6eb, integration 1485b9e2, or W5's round-3 accounting
(/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/w5-dev-reconciliation.md), NO unexplained name — T0's closed list does not describe this tree.
Skills: if the Skill tool cannot load `heartbeat-worker`, read `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-loginfp/dialectical-engine/.claude/skills/heartbeat-worker/SKILL.md`
and say so in SKILLS LOADED. TOOLING-TRAPS means the LANE's copy, append-only. `tools/mutate.sh` v2 accepts `/`.
rework rounds: max 3. Markers with `comments read through: w5-codex-r2-2026-09-05`.

# ---- AMENDMENT 1 (19:08 2026-09-05) — ROUND 2 OF MAX 3 · after codex r1 CHANGES (B1, B2) · original preserved above ----

codex verdict (final, snapshot): /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-loginfp/codex-r1-verdict.final-snapshot.md  (also /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-loginfp-codex-r1.md)
lane: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-loginfp @ f079a206 (your tip) · base 2af816f1

## Corrections to the original packet (N3, N4, N5 — orchestrator defects, charged)
- The original's "kept shape … near a depth token" was a MECHANISM, and one codex W5 r2 F1 had forbidden. You were right to
  refuse it. The OUTCOME, restated without mechanism: **the oracle reports a DOMAIN_ENUMERATION site for every ordinary
  single-declaration spelling that DERIVES the ruled option domain 1..5, and reports none for an unrelated index run such
  as LoginFlow's six 0-based slots — in every layout the scanner can see.** Forbidden mechanisms: a filename exemption; a
  depth-token requirement on the domain arm; deleting or weakening the three bare option-domain controls.
- The original's expected owner site was STALE: the whole-tree assertions do not name `apps/ui/app/new/page.tsx` on this
  tree (W5 already uses the imported constants there). The expected real sites are whatever the oracle named at 2af816f1
  minus the LoginFlow false positive — measure them, do not inherit my sentence.
- The failure kind is **DOMAIN_ENUMERATION**, not "exclusive-six" (my label was wrong).
- `tools/mutate.sh` means `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/tools/mutate.sh` (v2, accepts `/`).
- **Named temporary mutant target (N5, D61):** for mutants that must plant a shape into a shipped file, you are granted
  `apps/ui/components/LoginFlow.tsx` as a TEMPORARY MUTANT TARGET ONLY — applied and restored inside one `mutate.sh`
  transcript with HASHES MATCH and empty porcelain; no permanent edit to that file is in scope, and any other shipped
  file you plant into must be named in your report the same way.

## B1 — an extended literal can still DERIVE exactly the ruled domain (blocking)
Codex's counterexamples, each a legitimate way to define a depth selector's options without naming depth, all reported by
the OLD oracle and missed by yours: `const choices = [0, 1, 2, 3, 4, 5].slice(1);` · `const choices = [1, 2, 3, 4, 5, 6].slice(0, -1);`
· `const [unused, ...choices] = [0, 1, 2, 3, 4, 5];`. Distinguish an unrelated index run from a declaration that derives the
ruled option domain; keep these prefix, suffix and sentinel cases as POSITIVE controls while the actual login expression
stays NEGATIVE; retain the three existing bare option-domain controls. Revise the claim that any extended literal is
necessarily a different domain (your report §3 and the comment at WHOLE_DOMAIN:238).

## B2 — wrapping the excluded array restores the false positive (blocking)
`const slots = [0,\n  1, 2, 3, 4, 5];` reports a line-2 DOMAIN_ENUMERATION; `const pages = [1, 2, 3, 4, 5,\n  6];` reports
line 1 — the raw-line scan (:484) records a site before the declaration scan can exclude it, and results accumulate rather
than cancel; the same wrapping applied to LoginFlow's JSX array brings the false positive back. Make the exclusion use
sufficient context in EVERY window that can report a site; add prefix- and suffix-boundary wrapping controls, including
the real JSX expression; require equivalent layouts to agree, while preserving the line scan's other intended coverage.
Codex's method, reusable: extract the scanner block from the test blob, strip types in memory, apply before/after
scanners to source strings — no Vitest, no git mutation.

## Records (N2, Q3 — non-blocking, do them in this round since you hold the files)
- N2: append actual per-mutant selectors and counts; retract "m4 kills exactly them and nothing else" (its command selected
  ONE name; 2 failed | 48 skipped); distinguish recorded custody from later observations; note b14 lacks an after-porcelain
  stamp and the cluster logs lack per-run stamps — do not rewrite any historical log; future captures carry the full
  selected set and pre/post stamps.
- Q3: the remaining 1/50 is J10 (`web/package.json` missing from the architecture audit) — inherited at 2af816f1, b5a6b6eb
  and your tip; say so. The sendmail name stays in **79/1/0/1** — append the accurate fixture, timeout, sample trees and a
  PROVISIONAL classification; do not claim "no possible suite influence"; W5's model-shim also uses a local fake CLI.

## Gates
RED for B1 (the three derivations reported as no site) and B2 (the wrapped forms) BEFORE your change; GREEN after; the
oracle's own suite verbatim before/after; mutants through `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/tools/mutate.sh` v2 with the named target above; typecheck
differential (W5's 8); then ONE `pnpm test` with the four-count accounting against the parent
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/w5/31-fourcount-run2.log` / `27-suite-run2.log` and your own round-1 b14 — every failing name attributed, none
unexplained. Round 2 of max 3. Markers with `comments read through: t1-oracle-loginfp-codex-r1-2026-09-05`.

<!-- NOTE appended 19:09: the two `tools/mutate.sh` mentions in the round-1 text above (lines 28, 46) mean /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/tools/mutate.sh. Sent text is preserved; this note is the correction (codex N4). -->

# ---- AMENDMENT 2 (22:32 2026-09-05) — ROUND 3 OF 3, THE LAST · after codex r2 CHANGES (B1, B2; N1 records) · everything above preserved ----

codex r2 (final snapshot): /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-loginfp/codex-r2-verdict.final-snapshot.md — read B1 and B2 WHOLE, including the tables, before touching the file.
lane: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-loginfp @ fbc421de (your tip) · base 2af816f1 · one round remains; after it, anything open goes to V.

## B1 — the consumption classifier is unsound in BOTH directions (blocking)
The class, in the reviewer's words: **accepting partial expression evidence as proof of whole-declaration consumption.** Misses (all define exactly
the ruled domain, all reported at base, all [] at your tip): `[0,1,2,3,4,5,].slice(1)` (trailing comma → `after` starts with a comma);
`[0..5].map(n => n).slice(1)` and the block-callback form (matching the first `.map` ignores the later `.slice`);
`new Set([0..5].map(n => n || 1))` (length-preserving map inside a domain-collapsing wrapper); `[0..5]["slice"](1)` (computed access, `after`
starts with `[`); `([0..5] as const).slice(1)` (type assertion, starts with `as`). All take the permissive `!after.startsWith(".")` branch.
Length preservation is not domain preservation; a member operation need not start with a dot; a listed first operation can conceal later narrowing.
False positives (should stay NEGATIVE): `[0..5].reverse()`, `[0..5].slice()`, `[0..5].slice(0,4)`, and the bare six-page `const pages = [1,2,3,4,5,6];`
— round 2's "[1..6] reports in every layout" made the verdict consistent, not correct: a bare six-page list is not a duplicate definition of 1..5;
that `.slice(0,-1)` changes its domain justifies distinguishing the DERIVATION from the bare list, not making both positive.
**Required:** retain the three positive bare-domain controls and the corrected round-1 derivations; distinguish COMPLETE declaration use from an
array's length or first suffix; add paired controls for the syntactic wrappers and composition classes above (a length-preserving map inside a
collapsing wrapper, a later narrowing, a trailing comma); keep unrelated whole or differently narrowed index runs negative, the bare six-page
example included; correct the contradictory overview at :210–211 and the stale "narrowed the shared WHOLE_DOMAIN" explanation at :379–383.
No filename exemption, no depth-token requirement.

## B2 — runs reclassified in incompatible representations, so layouts still disagree (blocking)
`const slots = [0, /* first slot */ 1, 2, 3, 4, 5];` reports line 1; the same declaration wrapped over lines reports nothing — and the same
holds in the real LoginFlow source edited in memory. Root cause (reviewer): `ruledDomainRuns(source)` sees the comment interrupting the run and
classifies the remaining 1..5 as reportable; `ruledDomainRuns(unit.text)` runs again after the lexer strips comments and sees 0..5 and withholds;
one line-set assembled from two representations does not give one verdict per occurrence. **Required:** every DOMAIN-producing window uses the
SAME occurrence decision with source correspondence across comments and normalisation; the second representation must not invent a different run
verdict merely to obtain a declaration's start line; add the paired commented layouts and full-JSX variants; preserve the existing literal-five and
exclusive-six coverage (the reviewer confirmed the other arms are intact — keep it that way).

## N1 — custody wording (records, this round)
Replace the blanket "porcelain [] before and after every run" with PER-ARTIFACT custody: the cluster runs 1–3 were stamped runs of a MODIFIED
working tree (porcelain shows the test file M, working-file hash 588dc181…), valid evidence when described so; logs 20/24 carry no custody header;
21/22 identify intentional working changes. Round-2 b14 (empty pre/post porcelain at fd6eb212) is the clean one — do not dilute it.
Sendmail PROVISIONAL and J10 inheritance: CLEARED by the reviewer; leave them.

## Gates
RED for every counterexample class above (misses AND false positives) before the change; GREEN after; the oracle suite verbatim; the reviewer's
source-only method on the wrapped/commented forms and on the real JSX; mutants via `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/tools/mutate.sh` v2 with the named temporary target
(LoginFlow.tsx, restored, hashes match); typecheck differential; one full `pnpm test` with four-count accounting vs the parent
(`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/w5/31-fourcount-run2.log`, `27-suite-run2.log`) and your round-2 b14 (78/1/0/1). Round 3 of 3.
Markers: `comments read through: t1-oracle-loginfp-codex-r2-2026-09-05`; end with `REWORK READY FOR REVIEW` or `BLOCKED <reason>`.
Contract: unchanged from the original + AMENDMENT 1 — `tests/unit/s1-1-depth-contract.test.ts` is your file; `packages/contract/src/index.ts` (the shipped site contract:112) and `apps/ui/components/LoginFlow.tsx` (temporary mutant target only) are read-only context; the round-2 logs 31/32/33 are yours to cite.
