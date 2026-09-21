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

## Final verdict after the ruling

The orchestrator ruled that `run.sh:1-12` is the security probe's entry document. Commit `b93b103e` addresses all four assigned findings inside the original surface.

- C-B3: `0069_fix_bound_erasure_and_trigger.sql:126,206,298` records live system-publication contention, consumes the authorized delete grant, creates the ordinary private-erasure cleanup record, removes public membership, deletes the attestation secret, and only then returns `CONTENDED`. HTTP 202 is therefore backed by work the existing `PrivateRunErasureCoordinator.reconcile()` already claims, rather than asking the creator to retry.
- S-N1 trigger half: `0069:14` requires the f1 event's run to satisfy the Free/public rule. The prepare-function half remains assigned to FIX-A.
- S-N2: `0069:19` requires the PREPARED system intent lease to still be live.
- S-N3: `0069:30-33` joins the cleanup ref to a publication snapshot owned by `NEW.run_id`.

The class sweep found four `CONTENDED` sources in the erasure function. This node fixed the assigned system-intent member. The pre-existing owner-provision member is already ticketed by the review; unrelated-snapshot and NOWAIT lock contention remain pre-existing retry states and were not widened without a ruling.

## Evidence and probe corrections

The product RED frame was 13/17 in both ambient and forced UTF-8 modes; the four failures were exactly the assigned findings. GREEN was 17/17 in both modes. Four isolated mutants each produced 16/17 in both modes, proving each new assertion killed its target while the sixteen neighbouring cases stayed green. The copied correctness detector was re-derived because the reviewer's original C-B3 case asserted the defective state; its final frame is 1/1, and the queue-removal mutant is 0/1. The copied security detector is 5/5, 10/10, 5/5, and 4/4; removing all three trigger guards makes A5 and A6 fail.

The security review's original A5 fixture reached foreign-key SQLSTATE 23503 after the permissive trigger, so its log characterized the missing trigger rejection but did not isolate it. The shipped product tests use existing snapshots and invoke a test-only SECURITY DEFINER inserter through `debateai_runtime` or `debateai_erasure_runtime`; they therefore distinguish old admission from the required 55000 refusal under product roles.

I nearly accepted a focused Vitest run that reported five skipped cases. Charge 4 makes any skip BROKEN, so I replaced it with a detector that registers only the assigned case; its final run has no skips. Another dead end was changing the HTTP mapping: V-9 freezes 202 and requires durable work, so the fix belongs at queue creation, not the response envelope.

Final gate: three consecutive cluster runs each returned C4 HTTP 8/8, C4 PostgreSQL 17/17, and inherited s10 HTTP 8/8 with `CLUSTER_GREEN`; the middle run forced `LANG=LC_ALL=en_US.UTF-8`. Typecheck remains rc=1 with exactly 70 inherited diagnostics and no allowed-path diagnostic. No live database, listener, push, merge, or out-of-contract product path was touched.
