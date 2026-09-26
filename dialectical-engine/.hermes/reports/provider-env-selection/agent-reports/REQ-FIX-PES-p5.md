# Self-report — REQ-FIX-PES-p5 (node REQ-FIX pass 5, ticket t_7b7c43d6, V's ruling V-14)

Seat: the original REQ-PES subagent a221353758f20db46, resumed by SendMessage for a third node. Filed
2026-09-25, before READY.

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## What the node produced

- `docs/missions/provider-env-selection/slices/S03/SPEC-v3.md` (new). It adds R3.4b at `:85-113`
  and rewrites the header (`:4`, `:6-7`) and §6 (`:186-194`). Stat against v2: 1 file changed, 36
  insertions(+), 8 deletions(-). The hunks are `4c4`, `6,7c6,7`, `84a85,113` and `162,166c191,194`.
- `INSTRUCTIONS.md` now points at SPEC-v3 and is 99 lines long.
- S03 `DECISIONS.md` gained 22 appended lines (162 → 184). The first 162 lines are unchanged,
  checked with `cmp` against the pre-state.
- `probes/REQ-FIX-PES-p5/` holds `make_spec_v3.py`, `checks.py`, `mutants.py` and `runs.txt`.
  The checks FAIL on v2 (3/4 failing) and PASS on v3 (0/4 failing). The mutants are 10/10 CAUGHT.

## Case file

### 1. Cause of this whole node: pass 4 applied a class half-way and routed the rest to V

V-11 asked for "real codes" in one README sentence. Pass 4 fixed only that sentence (R3.4). It
routed the other two members of the same class, the §11 row and the §10 bullet, to V as a `V-ROW:
NEW`, because the question named only one sentence.

Price: one V ruling, one orchestrator packet, and one extra REQ-FIX node of about 15 minutes of
wall-clock plus a full skill reload. ARCH-FIX S03 p4 also waits on a second SPEC version.

The law §3.2 already says "a finding is a SAMPLE of a class". At pass 4 I swept the class and
FOUND all three members. I then wrote only one member into the SPEC. I judged the other two to be
out of V's literal ruling, and I asked V rather than applying them. V's answer was "Yes, reword all
three", which is the class answer.

Upgrade: when V's ruling names one member of a class, a REQ-FIX seat applies it to every swept
member in the same pass. It records the extension as a DECISIONS row, and routes to V only a member
where the class reading has two defensible outcomes. The keep-or-drop question for the table row
was one such member. The Meaning-cell wording was not.

### 2. Line pointers into a growing file go stale on every append

The V packet gained row V-14 after pass 4. Every `V-DECISIONS-PACKET.md:<n>` pointer written before
that append is now off by one or two lines:

- S03 SPEC-v2/v3 R3.4 cites `:23` for V-11. That line is now the V-12/V-13 ruling; V-11's ruling is
  at `:25`.
- The S01 and S02 SPEC-v4 cite `:22`/`:24`.

All of these files are frozen or not mine. I named them, recorded the move in the S03 DECISIONS
pointer map, and fixed none.

R3.4b cites "rulings table, row V-14". The `:27` it adds is only an at-this-pass hint, and
`checks.py` checks that `:27` lands on V-14 today.

Upgrade: cite V rows by row id, never by bare line number. The orchestrator's ledger could carry a
row-id → line map that is regenerated on every append.

### 3. Near-misses (what I nearly got wrong)

- **The pin line was `:423`, not `:422`.** My first draft cited `:422` from memory of the anchors
  block. The citation check found it, and I fixed it in both the SPEC and the generator. Without a
  check that reads every cited line for its token, it would have frozen wrong.
- **§6 would have contradicted R3.4b.** Carried over unchanged, v2's §6 says the README's other
  mentions stay as written until V rules. With R3.4b present, that sentence is false. Charge 3 says
  "only the header and R3.4b hunks". Following it literally would have frozen a SPEC that contradicts
  itself. I took the §6 hunk and declared it (packet defect D1 below).
- **Keep or drop the table row.** "Reword all three" could be read as removing the code from the
  README except in R3.4's paragraph. Dropping the row breaks R3.5's class: every refusal code the
  cost-envelope surface can emit, and `runtime-environment.ts:143-147` emits this one. With the row
  kept, `vps-deployment-baseline.test.ts:359` also stays true.
  - `check_end_state` derives the post-edit grep count from what the stated edits leave (1 + row +
    bullet). A mutant that drops the row is caught.

### 4. Dead ends (do not re-derive)

- The known-stale list (`README:14-27` at C2's head) holds no envelope bullet. C2-9 already removed
  it. R3.4b says so, and there is nothing to sweep there.
- `grep -rl COST_ENVELOPES_NOT_SEALED deploy/` returns only `deploy/vps/README.md`. No other deploy
  doc is a member.
- The pin union is 12 codes, and no anchor reads `CostEnvelopesNotSealedError`. No pin count moves.
  Any test-count change comes only from the RED cases that ARCH-FIX S03 p4 adds for R3.4b.
- An "identity" check on v2 passes trivially because it compares v2 to itself. It is not evidence of
  anything on v2. The three V-14 checks are the ones that fail there.

### 5. Packet defects (REQ-FIX-p5.md)

- **D1 (`:25`, charge 3).** "Only the header and R3.4b hunks" leaves out the §6 hunk. §6 had to
  change or the SPEC would contradict itself. I took the hunk and declared it here, in DECISIONS
  (last row) and in READY.
- **D2 (`:10`).** "R3.4 at :72-84": in SPEC-v2, R3.4 is `:72-83`, and `:84` is the blank line after
  it. This is harmless, but a mechanical reader slicing `:72-84` picks up a separator.
- **D3 (`:7`).** "pass: 5 … of 3" reads as a cap violation. The parenthesis explains it ("a V-ruled
  amendment beyond the REQ-REV cap of 3 — no REQ-REV follows"). A cleaner header would be "pass 5 —
  V-ruled, outside the REV cap".
- **D4 (`:24`).** The packet quoted the three README lines and their text. That was the right move:
  it let me confirm the sweep in one grep instead of re-deriving it. Keep this pattern.

## What repeatedly cost tokens

- **Resume cost.** This is a third node on the same subagent, and it was compacted once mid-node.
  The skill reload is mandatory and correct. What cost tokens was rebuilding line maps (V packet,
  PLAN, SPEC-v3) after the compaction. A per-node `state.json` in the probes dir, holding measured
  line maps and the hunk list, would make resumption cheap.
- **Line-number bookkeeping in general.** Most of this node's checking work (CITES, the pointer map,
  the stale-pointer findings) exists because requirements cite by line. Named anchors (headings,
  row ids, test names) would remove most of it.

## One-prompt machine

1. A V ruling on a class member applies to the swept class in the same pass (§1 above).
2. V rows are cited by id (§2).
3. Charge text that lists the permitted hunks should say "and any hunk needed to keep the SPEC free
   of contradictions, declared".
4. Give the REQ-FIX seat a generator with asserted replacements plus a byte-identity check. Here
   that is `make_spec_v3.py` plus `check_identity`. A reusable `spec-amend.py` template would save
   every future REQ-FIX pass about half its work.

## UNVERIFIED

The README edits R3.4b describes are not made or run. They belong to ARCH-FIX S03 p4 and then BUILD.
The post-edit "exactly two lines" is derived from the stated edits, not observed.
