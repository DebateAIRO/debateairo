# FIX-01 SPEC-v7 — staged lock publish addendum

Status: FROZEN — controller-ratified authority for FIX-01 C4 round 9.

SPEC-v7 replaces the lock creation and exact base-tail rules in SPEC-v6. All other FIX-01 rules stay in force. This file does not admit a production directory. It records no V approval for one.

## 1. The stage is not authority

Admission never writes new bytes at `.obs-spool-release-lock-v1`.

It first uses one stage name:

```text
.obs-spool-release-lock-stage-v1-<64 lowercase hex admission reference>
```

The name is fixed except for the fresh admission reference. A stage does not let the gate or runtime trust A1 rows. The manifest does not list it. Runtime does not find or read it.

Admission accepts at most one such name. A malformed name, a second name, a foreign admission reference, a symlink, or an unsafe link count stops the run.

## 2. Stage write and retry

The expected bytes are the exact lock v2 bytes from SPEC-v6.

A new stage is created with exclusive and no-follow flags. Before publish, it must be a regular file with one link.

On retry, the stage byte count may be zero, a strict prefix, or the full expected count. Its bytes must equal the same prefix of the recomputed expected lock. Admission opens it with no-follow flags, appends only the missing tail, and syncs the file. It does not truncate, replace, or rewrite retained bytes.

A byte mismatch, extra byte, identity change, or unsafe type stops the run.

## 3. Publish order

After the complete stage file is synced, admission creates the final lock name with an exclusive hard link. An existing final name is never replaced.

Both names must point to the same regular file with exactly two links and the exact expected bytes. Admission then:

1. syncs the spool directory;
2. checks the two-name pair again;
3. removes only the checked stage name;
4. syncs the spool directory again;
5. reads the final lock as a regular single-link lock;
6. only then appends planned index bytes.

If the first directory sync fails, no planned index byte is written. If the second directory sync fails after stage removal, the final single-link lock is safe for a retry.

## 4. Crash states

These states are retryable:

- a standalone stage with zero bytes;
- a standalone stage with any exact lock prefix;
- a synced full standalone stage;
- a final name and stage name linked to the same full file;
- a final single-link lock after the stage was removed.

For the two-name state, admission repeats the directory sync, checks the pair, removes the stage, and syncs the directory. It never appends index bytes while the stage remains.

## 5. Exact unterminated candidate tail

The locked base index may end with one exact canonical candidate basename and no LF.

If that basename is a current lawful candidate and does not already appear as a framed row, the plan starts with only the missing LF. That byte completes the existing plain row. The plan must not append the same plain basename again. It then adds the missing A1 row.

The final index has exactly one plain row and exactly one matching A1 row for that candidate. Repeated admission keeps the same result.

## 6. Required proof

Tests cover lock prefixes of zero, one, 23, 64, and 200 bytes. They also cover crashes after stage-file sync, after final-name directory sync, and after stage removal. Each safe retry reaches PASS with one plain row and one A1 row.

Tests reject malformed, multiple, symlinked, hardlinked, and foreign stages. A separate test starts with the exact candidate basename and no LF, then proves PASS, gate success, and no duplicate plain row on two runs.

Isolated mutants must fail when the final lock is written directly, a retained stage prefix is not reused, pair cleanup skips a directory sync, or the exact base tail causes a second plain row.
