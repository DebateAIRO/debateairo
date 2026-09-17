# FIX-05 — PLAN (SCAFFOLD — the architecture seat fills steps, clusters and verification commands)

**Slice:** FIX-05 — Provider call surface: one exhausted provider call becomes exactly one row, carrying the run and the attempt
**Gate:** G1 capture · **SPEC:** `slices/FIX-05/SPEC.md` (FROZEN 2026-09-01) · **Requirements:** 7 (`FIX-05-R01` … ) · **File surface / parallel safety:** SPEC §7 (binding; the PLAN may narrow it, never widen it).
Absorbs predecessor ticket: **S11 `t_7efcd635`** (provider binding — whole-file contract per H5-02) plus the S03c Tier-B `attempt` seam (L2-ADDENDUM-2 §2.1 row 4: hoist `lastAttemptId` so it survives the loop) and the Tier-A `ledger_entry` seam (row 5). Custodian dependency: **RP-0 `t_4deda7ab`** — `PROVIDER_CALL_FAILED` / `PROVIDER_CONTENT_UNACCEPTED` are `declared_gap` members; until V rati

## Quantifiability law (binding on every step the architecture seat writes)
A stranger can mark every step done or not-done with no judgement call. WRONG: "improve error handling". RIGHT: "requests with a missing id return 400 with a message, and the test asserting this passes". Banned words in any step or acceptance criterion: **improve, better, robust, handle, appropriate**. Each step names its cluster, its acceptance test, and its file surface. Every SPEC requirement is covered by ≥ 1 step; every step traces to ≥ 1 requirement. Executable commands live in labelled fenced blocks, never in table cells (TOOLING-TRAPS: the escaped-pipe family, variants 1–9); acceptance commands use the capture-first idiom (`out=$(…); rc=$?` then an anchored summary match) and are RUN by their author at authoring time against a hostile configuration (missing file, vacuous filter) before they are written down.

## SPEC → PLAN trace — one row per requirement (7 rows; the architecture seat fills the empty cells)

| Requirement | SPEC sentence (abridged — the SPEC text is authoritative) | PLAN step(s) | Cluster | Acceptance test |
|---|---|---|---|---|
| FIX-05-R01 | Exactly one occurrence per exhausted call, emitted at the post-loop exhaustion throws; a call that succeeds on… |  |  |  |
| FIX-05-R02 | The occurrence declares kind `ledger_entry` from `lastLedgerEntryRef` (or the content-rejection's ledger ref) … |  |  |  |
| FIX-05-R03 | `taxonomy_class = 'PROVIDER_EXHAUSTED'`; `code` is `PROVIDER_CALL_FAILED` or `PROVIDER_CONTENT_UNACCEPTED` onc… |  |  |  |
| FIX-05-R04 | No raw request, response, prompt, provider payload, or parse text reaches any `obs.*` column or the spool: a d… |  |  |  |
| FIX-05-R05 | Per-attempt outcomes are referenced (attempt count in `template_parameters`, the ledger ref as `ledger_ref`), … |  |  |  |
| FIX-05-R06 | The gateway's return values, thrown error classes, retry count and timing are unchanged with capture off; the … |  |  |  |
| FIX-05-R07 | A green suite is a milestone; Done is V's veto after §5.… |  |  |  |

## Clusters — the unit of verification (three runs; the WORST run is the verdict; green-green-red is RED)

| Cluster | PLAN steps | Verification command (see fenced block) | File surface |
|---|---|---|---|
| FIX-05-C1 |  | `(architecture seat fills)` |  |
| FIX-05-C2 |  | `(architecture seat fills)` |  |
| FIX-05-C3 |  | `(architecture seat fills)` |  |

(Add cluster rows as needed; the three rows above are template rows, not a cap.)

### Verification commands (one labelled fenced block per cluster — never in a table cell)

```text
FIX-05-C1: (architecture seat fills — capture-first idiom, anchored summary, nonzero pass count, run three times)
FIX-05-C2: (architecture seat fills)
FIX-05-C3: (architecture seat fills)
```

## Standing tests that READ this slice's write surface
(architecture seat lists them with full paths and counts — TOOLING-TRAPS "Disjoint WRITE surfaces do not imply independent EFFECTS"; check EVERY target a loop iterates.)

## V acceptance
SPEC §5, verbatim, run by V personally. Never restated here. A green cluster is a worker milestone; Done is V's veto.
