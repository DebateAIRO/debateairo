# Self-report: REQ-FIX-PES-p6 (node REQ-FIX pass 6, ticket t_78d5d748, V's ruling V-15)

Seat: the original REQ-PES subagent a221353758f20db46, resumed by SendMessage for its fourth node.
Model: claude-opus-5-5. Claimed 13:40:54 EEST. Filed before READY.

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## What the node produced

- **SPEC.** `slices/S01/SPEC-v5.md` (new). Against v4 it has 4 hunks (`4c4`, `6,7c6,7`, `217c217`,
  `222c222,237`) and the stat is "1 file changed, 20 insertions(+), 5 deletions(-)". The V-15
  passage is at `:222-237`, and R1.12 runs `:193-242`.
- **INSTRUCTIONS.md.** Re-pointed in 4 hunks (27, 31-32, 63, 66) and still 99 lines long.
- **S01 DECISIONS.md.** Appended 300 → 319 lines. The first 300 lines are byte-identical to the
  pre-state (`cmp`).
- **Probes.** `probes/REQ-FIX-PES-p6/` holds `make_spec_v5.py`, `checks.py`, `mutants.py` and
  `runs.txt`. Checks on v4: FAIL (4/4 failing). Checks on v5: PASS (0/4 failing). Mutants: 13/13
  CAUGHT.

## Case file

### 1. Cause: pass 4 wrote a database write it never ran, and marked it UNVERIFIED

At pass 4, R1.12's role seed was "read, not run". I said so in my p4 self-report §3, and the seed
went out marked UNVERIFIED. ARCH-FIX S01 p2 ran it (d2): the database refuses any publication that
holds one required row but not all 17 (`migrations/0061_algorithm_publication_profiles.sql:17-28`).

That one unrun write cost:

- one ARCH-FIX F9 finding;
- one V row (V-15);
- one V ruling;
- one orchestrator packet;
- this whole node: about 10 minutes of wall-clock plus a full reload of 5 skills.

The UNVERIFIED line was honest. But an UNVERIFIED that a REQ seat could have turned into a
measurement for about 2 minutes of probe time is the most expensive kind. The ARCH seat's d2 is 30
lines of tsx on the repository's own `startTestDatabase()`, which needs no listener on a NO-TOUCH
port and no key.

**Upgrade (largest token saving):** when a SPEC sentence names a concrete database write through
shipped helpers, the REQ seat runs it once in a scratch database before freezing. The failure mode
here was a DB trigger, and reading code rarely finds that; running it does.

### 2. The class is "SPEC wording that pins a seed the schema refuses", and I swept it

I found 4 scratch-register writes in R1.12 and §5:

1. The v4 import: accepted (d1).
2. The `published` publication: accepted (d1).
3. The role seed: refused as v4 worded it, fixed now.
4. The `role-provider-dropped` publish: refuses before any write (d4 (i)).

S02 SPEC-v4 and S03 SPEC-v3 name no role seed (`grep RoleRef`: 0). The sweep is recorded row by
row in DECISIONS.

### 3. Near-misses

- **An unpinned builder input.** V's ruling says "from the shipped `buildAlgorithmRegisterRows`".
  But that function takes `providerFamilies`, and the `providerFamilyMap` row is computed from it.
  An unpinned input would let two seats seed different rows, which is exactly what a blind reviewer
  hunts for. I pinned the input that d4/d1 actually ran. `check_builder_input` compares R1.12's
  literal with the probe's source, not with my own say-so.
- **The builder's own role rows.** Taking all 17 rows from the builder looks like the simplest
  sentence. It silently changes R1.12's two rows, because the builder gives them the source ref
  `…#J8+configured-provider-set-derivation` (`algorithm-policy.ts:286-294`), not
  `provider-env-selection/S01#acceptance-role-rows`. V-15 keeps the two rows byte for byte, so
  R1.12 excludes the builder's role rows by name.
- **My own header draft said "§3 unchanged".** R1.12 is inside §3, so that was false. I caught it
  by listing the section headings before generating. The header now says §3 changes only inside
  R1.12.
- **Checker bugs that the mutants and the first run exposed:**
  - The signature comparator did not strip the lane's trailing ` {`, so its first run on v5 FAILED.
    The SPEC was right and the checker was wrong.
  - The header check accepted any "V-15" anywhere on line 4, so a mutant that removed "on V's
    ruling V-15" was MISSED (11/13). I tightened the check, and all 13 are now caught.
  - One mutant anchor did not match because a backtick sat before `export`. That run reported
    BROKEN, not MISSED.

  Shipping only the green run would have hidden all three.
- **Two wrong line cites.** I cited `algorithm-policy.ts:261` for the `ref` helper in my own
  DECISIONS append; it is `:262`. I fixed it inside my append before READY, and the 300-line prefix
  is unchanged. The frozen-hash comparison first printed a diff that was only line ORDER. I re-ran
  it sorted (runs.txt §5b) and did not paper over it.

### 4. Dead ends (do not re-derive)

- The manifest is 17 keys: 15 from `migrations/0050…:31-46` and 2 from `0064…:30-34`. No migration
  deletes from `register.required_row`. The 0061 DELETE targets `required_row_version`, a different
  table, and a naive grep conflates the two.
- `buildAlgorithmRegisterRows` mints exactly those 17 keys. `checks.py` parses both sides statically
  and prints "manifest 17 keys, builder 17 keys".
- §6 did not need a hunk this time. "None open" stays true after V rules.

### 5. Packet defects (REQ-FIX-p6.md)

- **`:10`.** "R1.12 at :193-227" is correct for v4. Good: the packet named the lines and they held.
- **`:25`, charge 3.** "expected: S01-21..23 only" is right for STEPS. But the PLAN also leans on
  the "V-ROW NEW default" in 9 non-step places (header `:8-13`, `:71-72`, `:88-89`, `:112`, `:145`,
  `:222-224`, `:272`, F9 `:719-727`), and it carries 7 `SPEC-v4.md:<n>` pointers that shift by +15
  in v5. "Steps only" would under-report what ARCH must re-point. I listed all of them.
- **`:24`.** "grep its signature in the lane and quote it": the signature spans 3 lines
  (`:233-235`). The quote in the SPEC flattens it to one line.

## What repeatedly cost tokens

- **Resume plus skill reload per node.** Each node is about 5 skill bodies of about 1.5k lines,
  4 nodes in this session. It is mandatory, and it is correct.
- **Line bookkeeping.** Pointer maps, re-point lists and line-cite checks were about 40% of this
  node's checking work. Each would disappear if SPECs were cited by requirement id and PLANs by
  step id.
- **The pass-4 UNVERIFIED seed (§1).** Its cost was paid 3 times: F9, V-15 and this node.

## One-prompt machine

1. REQ seats run every concrete DB write they specify, once, in a scratch database (§1).
2. SPECs cite V rows, requirements and steps by id, never by line.
3. A spec-amend generator template (asserted replacements plus a byte-identity check plus a mutant
   harness) is now used three times (p4, p5, p6). Promote it into the orchestrator's `scripts/`.

## UNVERIFIED

- The acceptance itself is not run against SPEC-v5. This node reads the ARCH probe outputs d1/d2/d4
  and does not re-execute them; `checks.py` decides the row SET statically.
- The 49-row count and version 6 are the probes' measurements, not mine. R1.12 does not pin them;
  PLAN `:88` does.
