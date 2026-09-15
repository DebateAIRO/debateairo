CODEX REVIEW S08 r4 — CHANGES · comments read through: s08-r4-2026-09-02

# S08 T12+T13 evidence review — Codex r4

VERDICT: CHANGES — 1 blocking evidence finding requires a V DECISIONS PACKET row; worker rework 3/3 is spent and no further worker round is authorized.

Finding count: 1 blocking, 3 non-blocking. Product findings: 0. Packet defects: 4.

## Scope and method

Static review only, as ordered. I read the packet in full before mission work,
then D42, D43, D44 and D41, the mission instructions, ticket, complete r3
verdict, complete stable worker filing and self-report, the mission tools,
driver, index, pair inputs, location record, and the relevant raw evidence. I
read four r4 transcripts completely (`l1`, `l2`, `l3`, `m3`) and inspected all
21 structurally. I ran no tests, builds, installs, mutation commands, provider
calls, or mutating git commands. The r3 product findings are closed there and I
did not reopen their unchanged code.

Fresh read-only checks produced:

```text
HEAD=e60e0296f3702e26b40d378f3bdf5cfff7f669e7
TREE=28126352baa1c3989a60a03e7e7dbcee5514aade
STATUS_LINES=0
MODE_CHANGES=0
REPORT_HASH_WITH_LINE2_REMOVED=06f0940369b04eec08b1ffaeb046aa3ef1c393f100b195f3cc631cbccd4bd04b
TRANSCRIPTS=21
TOOL_HEADERS=21
EXIT_RED=19
EXIT_GREEN=2
BAD_TRANSCRIPT_SHAPES=0
PAIR_DIRS=21
PAIR_FILES=105
FORBIDDEN_PAIR_CHARACTER_HITS=0
NEW_TOKEN_RECORDS=21 single-line / 21
RAW_VS_INDEX_FAILURE_COUNT_MISMATCHES=0
MISSION_S08_FILES=193
LANE_MISSION_S08_FILES=0
```

The five-file `e040b1ee..HEAD` name/status delta is unchanged from r3 and has
no mode change. The report digest reproduces exactly. The supplied D41 record
says `22 records / 0 failures`; the fresh static inventory independently finds
the 21 transcript records plus the index, all at the filed tip.

## Blocking finding — V DECISIONS PACKET

### S08-r4-B1 → V-S08-CODEX-r4-1 — the index's claimed mechanical derivation is not filed

**File/line:** worker filing `s08-band-downgrade.md:799-802,825-826`;
`logs/s08/mutate-driver-r4.sh:1-21`; `logs/s08/r4-mut-INDEX.md:1-3`;
packet `s08-codex-r4.md:24-32`.

**Input → wrong outcome:** rerun one pair so a raw transcript changes from an
assertion failure to a pre-assertion throw, or let a neighbour turn RED. The
filed driver invokes `tools/mutate.sh`, but it never reads the pair's `meta`,
never parses a transcript, never compares expected with observed, and never
writes or checks `r4-mut-INDEX.md`. `mutate.sh` itself treats the test exit as
recorded data and succeeds when custody/restore is sound. The driver can
therefore exit successfully while the old index and the report's 19/2 claim
remain stale.

D34 requires the quantity and provenance statement to be produced by a command
whose output is filed. The packet specifically asks whether `ASSERTION FAILED`
versus `EXECUTION THREW` is derived mechanically. No generator, generating
command record, or check-only command exists in the mission artifacts; a full
mission search finds only the index header and prose claims that it was
generated. The filing's further claim that the character audit lives in “the
driver's pair generator and its assertions” is directly contradicted by the
21-line driver, which contains neither. Whether an unfiled one-off generator
once existed is **CANNOT-ASSESS**.

The current index content is accurate: an independent static extraction matched
all 21 names and every raw failure split, including `l1=0 assertion/1 throw`,
`l2=0/1`, `l3=1/0`, and `m3=1/3`. That is content agreement, not evidence of
derivation; D44 makes the same distinction between correct content and its
separate location contract.

**Required V decision:** AUTHORIZE one post-cap, evidence-only correction or
HOLD S08 at CHANGES. Recommendation: authorize a retained generator/checker
that reads the 21 raw transcripts plus pair metadata, emits the index, refuses
unclassified failures and expected/observed mismatches, and reproduces 19
catches + 2 neighbours. No product edit and no repeat mutation run is required
if it consumes the already-filed raw records. This is a V DECISIONS PACKET row,
not a fourth worker rework round.

## Non-blocking findings

### S08-r4-N1-REPORT/PACKET — r3's false “~27 s per run” remains in the stable filing

**File/line:** `s08-band-downgrade.md:677-679`;
`logs/s08/r3-persisted-tuple-three-runs.log:224-229,446-451,665-670`;
r3 verdict `S08-codex-r3.md:150-166`; r4 packet checklist
`s08-codex-r4.md:23-49`.

**Input → wrong outcome:** read the three filed Vitest records. They report
14.15 s, 6.60 s, and 6.76 s. The stable filing still reports “~27 s per run,”
so none of the three values supports its duration claim. R3 N2 explicitly
required correction of the stable report and packet/ledger record, but the r4
packet silently omitted that scope item.

**Required ticket:** same-day orchestrator-owned record correction, or fold it
into V's post-cap evidence row. Replace the sentence with the three generated
durations (or omit timing) and regenerate the report digest. This does not alter
the product verdict and does not authorize a worker code round.

### S08-r4-N2-RECORD/PACKET — the self-report's false l1/l2 cause was not corrected in place

**File/line:** `s08-band-downgrade-self.md:310-316,380-384`; packet
`s08-codex-r4.md:33-39`; raw transcripts
`r4-mut-l1-persist-label-drops-downgraded.log:1-285` and
`r4-mut-l2-runner-label-attachment-drops-downgraded.log:1-267`.

**Input → wrong outcome:** a reader stops at the r3 case file. It still says
the pre-existing `result.kind === "COMPLETED"` assertion killed l1/l2. The r4
addendum later retracts that statement and even claims the correction is “in
place,” but the original paragraph remains unchanged. The raw stacks show both
throws leave `executeWorkItem` at test line 4413 before the first `expect`.

The stable worker filing is corrected in place and its narrowed conclusion is
exactly right: the boundary halves must agree, disagreement stops instead of
persisting a label-less answer, and only l3/l4 pin the new persisted rows. The
self-report is not. This leaves r3 N1 partially open and makes the packet's
“seat accepts fully / correction made in place” premise overbroad.

**Required ticket:** same-day record correction owned by the filing/packet
author, or fold it into V's post-cap record action. Correct the r3 paragraph in
place while retaining the r4 admission of how the error happened. No product
change or worker code round is warranted.

### S08-r4-N3-REPORT/PACKET — m3 has four failures, not three

**File/line:** `s08-band-downgrade.md:888-891`; packet
`s08-codex-r4.md:29-32`; `logs/s08/r4-mut-INDEX.md:91-103`; raw transcript
`r4-mut-m3-downgrade-reads-load-bearing.log:19-114`.

**Input → wrong outcome:** count m3's failed test blocks. The raw transcript and
index contain four: the cited-non-load-bearing case throws, the fractional-cut
case throws, the DOWNGRADED case fails its terminal assertion, and the cited-
looked-up case throws. The stable report and packet instead say “two of its
three” threw and the third asserted. They omit the cited-looked-up throw even
though their own generated index lists it.

**Required ticket:** same-day report/packet correction: state `3 execution
throws + 1 assertion failure across 4 failed tests`. This is attribution-count
prose; the raw transcript and index remain correct, so it does not reopen the
mutation result or product verdict.

## Accepted r4 evidence

- **R3 B1's transcript-producer defect is closed.** All 21 raw files begin with
  the `commit=... tree=... mutate.sh` signature and carry literal OLD/NEW,
  `pre=0`, `applied=1`, `restored=0`, equal hashes, exit, restore command, and
  empty porcelain. The driver passes only pair data and the command to the
  mission tool and does not post-process a transcript.
- **D43 content is correct.** The raw/index failure counts agree for every
  mutant. L1 throws `ANSWER_PERSIST_FAILED`; l2 throws
  `VERDICT_LABEL_BASIS_UNRESOLVED`; l3 and l4 each fail exactly their new
  persisted-value assertion. M3 has four failed tests: three pre-assertion
  composition throws and one terminal assertion failure. The packet and stable
  prose undercount it, as N3 records; that count defect does not obscure the
  correct per-test index.
- **The token fits retain the targeted meaning.** F1, f2, f3 and n2 are
  whitespace-only folds; b1 still performs the forbidden double lookup on the
  total sealed/test mappings that discriminate it; f6 assigns the generic
  observation before shadowing the original template and is killed by the
  provenance assertion. All 21 current OLD/NEW pairs avoid `$`, `@`, `\`, and
  `/`; every NEW is one record. The mission tool now uses Python substring
  counts and documents the character restriction.
- **D44 location is closed.** `location-proof-r4.out` names the durable mission
  directory and lists the 21 transcripts, index, pair directory, driver and
  stamp output there. The actual filesystem agrees. The report's other indexed
  evidence is also in that mission directory: 0 named artifacts are missing,
  while the lane's corresponding mission-log directory contains 0 files.
  Nothing else this filing cites as evidence would die with the worktree; the
  product tree itself is committed at `e60e0296`.
- **Packet constants otherwise reconcile.** The packet path resolves from this
  seat; its two mandatory outputs are exactly its two writable paths; tip, tree,
  clean status, mode count, report digest, transcript count, tool-shape count,
  stamp count and zero lane-local r4 transcripts are correct. The ticket records
  rework 3/3 and `escalation_target: v_packet`.

Packet defects counted above are: the uncheckable generated-index/only-authored-
file premise (B1), omission of r3 N2 (N1), and the overbroad in-place-correction
premise (N2), and the m3 failure undercount (N3).

## Not verified

I did not re-execute the mutation campaign, tuple test, unit suite, typecheck,
zone, acceptance fixture, D15 batch, T3C pairing, W12 ceremony, or any provider
path. Runtime outcomes above are inspections of authenticated upstream records.
I cannot assess whether an unfiled ephemeral index generator existed; the filed
artifact set contains none. I did not review or alter another lane's work.

## PREDICTIONS

Another lens will likely accept the exact raw/index match as proof that the
index was generated, missing that the driver never reads `meta`, parses output,
or writes the index. It may also stop at the stable report's correct l1/l2
paragraph and miss the still-false self-report section, or inherit the packet's
“two m3 throws” shorthand without counting the fourth failing test. The first
checks should be the driver's data flow, the unchanged “~27 s” sentence, and the
original r3 self-report paragraph.
