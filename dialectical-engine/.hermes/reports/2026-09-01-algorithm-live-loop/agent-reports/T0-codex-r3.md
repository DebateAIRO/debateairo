CODEX REVIEW T0 r3 — CHANGES · comments read through: t00-r3-2026-09-01

# T0 final rework verification

## Verdict

**REWORK** (handoff marker: **CHANGES**) — **0 blocking, 2 non-blocking findings**.
The r2 report cure is substantively verified: the prescribed heading is exact, the live
scan is clean, its failure-direction reinjection catches one match, and reversing all four
documented cure edits reproduces the exact r4 hash. The 23-row classification authority,
both baseline pins, record-grade run-2 identifiers, and testimony-grade run-1 boundary are
unchanged.

Both remaining findings are record-quality defects. Non-blocking findings are mandatory;
this is round **3 of 3**, so there is **no r4**. The residue is enumerated below as a
V DECISIONS PACKET row.

This review was STATIC. I ran no test, build, typecheck, provider call, ceremony, database,
or git mutation, and I did not read the 1,959-line spine.

## Findings

### N1 — The r3 packet's quoted rework round disagrees with the canonical board

**Ticket:** `F-T0-CODEX-R3-N1` · owner: orchestrator packet · non-blocking but mandatory.

**File/line:** `packets/t00-codex-r3.md:4-5`; contradicted by
`board/T00-baseline.md:7,23,28`.

**Failure scenario:** input = the exact ticket-state block dispatched for final r3 review.
The packet declares `(rework_round 2)`, but its named canonical board still serializes
`rework_round: 1`, `status: changes_requested`, and the original packet read-through marker.
A consumer validating the packet constant against its authority cannot determine from those
two records whether r2 was ever transitioned; accepting the packet silently makes its
ticket-state assertion unaudited.

Verbatim static output:

```text
PACKET_REWORK_ROUND=2
BOARD_REWORK_ROUND=1
BOARD_STATUS=changes_requested
```

The user's direct final-round instruction made the effective route unambiguous, so this did
not block review. **V disposition:** reconcile the canonical ticket history with the r2/r3
dispatch record, or explicitly rule which record is authoritative; do not open r4.

### N2 — § D.0's exact withdrawal-line audit cites stale line numbers

**Ticket:** `F-T0-CODEX-R3-N2` · owner: T0 report record · non-blocking but mandatory.

**File/line:** `agent-reports/t00-baseline.md:169-170`; actual withdrawal quotation at
`agent-reports/t00-baseline.md:113-115`.

**Failure scenario:** input = an auditor following § D.0's claim that the five blockquote
matches occur exactly at `16, 17, 109, 110, 111`. Lines 109-111 contain a blank, the solo-log
reference, and another blank; the last three matching quotations moved to 113-115 after r5
inserted four lines near the front. The count and exclusion class remain correct, but the
published exact locations do not.

Verbatim raw-token enumeration:

```text
RAW_TOKEN_LINES=16,17,113,114,115,162,163,173
```

Lines 162, 163, and 173 are fenced transcript commands and the five blockquote matches are
16, 17, 113, 114, 115. **V disposition:** correct or annotate the stale three locations in
the final evidence record; no product, pin, count, or classification change is required.

## r2 convergence

- **B1 — VERIFIED FIXED.** Line 184 is exactly
  `### D.1 — Stable-red in all three runs (23)`. No banned causal token survives in live
  prose.
- **N1 — VERIFIED FIXED AS ORIGINALLY FILED.** Every board/report path in the r3 packet is
  absolute and resolves. New N1 concerns the packet's quoted state, not its paths.

## Independent scan and refutation

I implemented the report's published rule directly as a stream filter: toggle at a fenced
delimiter, ignore fenced lines, ignore blockquotes, and scan every remaining line with the
published token pattern. I then injected `23 genuine` at live line 5. As an exclusion-class
control, I injected the same string as a blockquote beside the withdrawal quotation.

Verbatim output:

```text
LIVE_MATCHES=0
BLOCKQUOTE_MATCHES=5
LIVE_MUTANT_MATCHES=1
WITHDRAWAL_NEIGHBOR_MATCHES=0
RAW_TOKEN_LINES=16,17,113,114,115,162,163,173
```

The failure-direction mutant proves the scan is not vacuously green. The neighbouring
blockquote control stays excluded, while the raw enumeration shows that every real
blockquote token is in the explicit withdrawal block. The remaining raw matches are the
fenced scan commands themselves. The two exclusion classes are therefore principled for
the report as filed.

## Byte stability and authority evidence

The report marker and self-hash re-derived exactly:

```text
REPORT_MARKER=REWORK READY FOR REVIEW — T0 r5 · comments read through: t00-codex-r2-2026-09-01
STATED_SHA=86dc0736feea279a66b2399de4bfe929d16daa18464456251b4fb249032d6245
REDERIVED_SHA=86dc0736feea279a66b2399de4bfe929d16daa18464456251b4fb249032d6245
SELF_SHA_MATCH=YES
D1_HEADING=### D.1 — Stable-red in all three runs (23)
D1_ROWS=23
```

For the r4 comparison I removed the r5 summary and D.0 insertion, restored the former D.1
heading, and restored the three other token-bearing sentences that D.0 explicitly says it
rewrote. The reconstructed body is byte-identical to the r4 body recorded in r2:

```text
PRIOR_R4_SHA=debc8ae4d9958a7a4e4ed3c47c69459278978e5a17649025b24d72afc61c28c9
RECONSTRUCTED_R4_SHA=debc8ae4d9958a7a4e4ed3c47c69459278978e5a17649025b24d72afc61c28c9
R4_BYTE_STABILITY=MATCH
```

The normalized D.1 table remains equal to the three-log intersection:

```text
REPORT_D1
      23
434e33fe94126393209cbd9e544aaa986f7e9d425b83f23643e50f244183f2b1  -
LOG_INTERSECTION
      23
434e33fe94126393209cbd9e544aaa986f7e9d425b83f23643e50f244183f2b1  -
SET_EQUALITY_DIFF_EXIT=0
```

The unchanged pins remain typecheck exit 0 in both runs and Vitest exits 1 with
`26/1750`, `26/1750`, and `23/1753`. The record-grade identifiers remain run
`29b2d42d-9fc0-41cb-aca2-94599b6dc076` and answer
`4c7c5d38-351e-4fa9-b3fa-6b9144530469`. Run 1's ids and non-gate facts remain explicitly
testimony-grade; the report does not promote them to primary evidence.

## Not verified

- No dynamic command was authorized or run. Current pin values were checked by static
  artifact comparison and the exact reconstructed hash, not by rerunning the suites.
- Run 1's uncaptured recovery remains intrinsically non-reconstructable; only its logged
  gate refusal is independently backed. The report preserves that limitation correctly.
- No other review lens was contacted.

## V DECISIONS PACKET ROW

| id | class | evidence | decision required | product impact |
|---|---|---|---|---|
| `V-T0-r3-record` | Final-record integrity; two non-blocking findings | Packet says round 2 while board line 23 says 1 (`F-T0-CODEX-R3-N1`); § D.0 cites 109-111 while matches are 113-115 (`F-T0-CODEX-R3-N2`) | Reconcile/annotate the canonical round history and correct/annotate the stale three line references; accept the verified r5 classification and pins without r4 | None |

## Predictions

I predict a content-focused lens will approve because the heading, zero-match scan, mutant,
23-row authority set, pins, and full inverse hash all converge. It may miss that the packet
itself quotes a round the board never recorded and that the scan paragraph's count is right
while three of its exact locations are stale. First check the packet constant against board
line 23, then compare the paragraph's five claimed locations with the raw-token enumeration.
