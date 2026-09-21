# FIX-S01-p1-B case file

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how can we make the coding more efficient. How can we turn this into a one prompt machine even better.

## Verdict

The FIX node stopped before reproducing a reviewer probe or editing product code. `FIX-S01-p1-B.md` §1 authorizes the two promoted probe directories and §2 requires every finding to be reproduced with the reviewer's own probe. The same input clause expressly says to read a promoted probe's `README` before running it because the probe may have its own mutant wrapper. The correctness directory contains `README.md`; the assigned security directory contains `run.sh`, four test files, and logs but no `README.md`. A direct `test -f` measurement returned `README_MISSING`.

VERDICT: packet/probe handoff defect; the security reproductions cannot lawfully start in the required order. CONFIDENCE: high. STRONGEST COUNTER: `run.sh` is probably self-describing and could be inspected directly, but doing so would silently replace the packet's explicit prerequisite with worker inference.

## Cause and price

Cause: promotion copied the security executable and fixtures without the invocation contract that the downstream FIX packet assumes every promoted probe carries. Packet-check verified path existence but not the required companion README.

Price: approximately 10 minutes and 5–7k tokens to load the new node's floor, re-measure two locale modes, read the verdict assignments, and locate the promoted artifacts. No RED probe, migration, test edit, or commit was attempted. The lane remains clean at `db4758da`.

## What I nearly got wrong

I nearly opened `run.sh` and reverse-engineered its fixture selection. That is a dead end because the packet warns that a promoted probe may be wrapped by its own mutant runner; without the README, a worker cannot tell whether `run.sh` mutates database functions, expects copied relative paths, or runs unrelated findings. I also avoided treating the already-green C4 cluster as reproduction evidence: it does not reproduce the review findings.

## Ranked upgrades by tokens saved

1. Make probe promotion atomic: require `README.md`, executable/wrapper, fixtures, expected pre-fix frame, and locale requirements before packet-check may dispatch a FIX node. Estimated saving: one full blocked launch and 5–10k tokens.
2. Have packet-check validate every phrase of the form "read its README first" against each named probe directory, not merely validate that the directory exists. Estimated saving: the full orchestration round trip here.
3. Put a one-line command and expected RED pair in every promoted README. This prevents each FIX seat from re-deriving wrapper semantics and makes the later GREEN detector identical. Estimated saving: 2–5k tokens per review finding.

## Exact unblock

Add a security-probe `README.md` that names which command/fixture reproduces S-N1 trigger half, S-N2, and S-N3 at `db4758da`, including expected test counts and whether `run.sh` performs mutations. Alternatively, regenerate the packet with an explicit ruling that authorizes reading `run.sh` first and supplies the same invocation facts. Resume this session at the probe-copy/reproduction step.
