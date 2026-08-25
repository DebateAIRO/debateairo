# T1 Rework7-A — recovery after interrupted VR-10 mutation

Date: 2026-08-22 14:49 EEST
Owner: Codex-Router
Kanban: `accounts-phase1` / `t_b225b2f2`
Recovery session: `0eda8835-e796-405e-b050-ac2270f723d9`

## 1. Authority and unchanged decisions

Continue the V-approved six-term Rework7-A contract from:

- `logs/T1-claude-rework7-draft-packet.md`
- sha256 `72e6505c632e6e743e15c63459d81cf5125ba050a4e8e64c37b69c050696bfa8`

Also read the prior takeover packet and stream:

- `logs/T1-claude-rework7-takeover1-packet.md`
- sha256 `d63b6abe12ac237aafe9aa652063640ea4b64d5d6df26971d9290af00e1501a1`
- `logs/T1-rework7-takeover1-53a219db-3337-45ad-838d-93fb5c4ea78f-claude.jsonl`

This recovery changes no term, value, allowed source path, or acceptance gate.
Three-worker A/B remains retired and unauthorized. Grok, Hermes model, Fable,
local models, nested agents, staging, commit, push, and Done remain forbidden.

## 2. Exact interruption and mandatory first repair

The prior Opus seat ended while `/tmp/t1r7/vr10.py` was still running in a
background task. The task was then reaped before its report was written. The
driver had no interruption-safe outer restoration, so it left M10 active in
`apps/api/src/registration.ts`:

```diff
-    const activate = await this.reserveMailDispatchPermit({ correlationId });
+    const activate = await this.reserveMailDispatchPermit({ correlationId,
+      waitDeadlineMs: this.dependencies.policy.channel.registrationMailDispatchQueueWaitTimeoutMs });
```

That mutant incorrectly gives resend the registration-only 28-second deadline.
The intended candidate backup exists at `/tmp/t1r7/registration.baseline.ts`
with sha256
`5069ab7acf78c9fec7179b36695ff54a2b9f9b478417ce0598b31bb08365309e`.

Before any test or other edit:

1. Verify the prior wrapper/Claude/mutation processes are absent.
2. Verify the backup SHA exactly.
3. Verify the current file differs from the backup only by the M10 diff above.
4. Preserve an interruption receipt in the mission log, including current
   contaminated SHA
   `492680aa535e02ba99c18730b4efa3ec16574609cd571e762848a93f9349a071`
   and the exact diff.
5. Restore `apps/api/src/registration.ts` byte-for-byte from the backup.
6. Require restored SHA `5069ab7a...65309e` and `cmp` success before continuing.

Stop `CODEX BLOCKED (recovery custody)` if any precondition differs. Do not
attempt to reconstruct the candidate by hand.

## 3. Recovery entry custody after restoration

Required HEAD: `7918f4f8bff33909792afc01dc38d402972b4ccd`

Required index: empty.

Required governed manifest after the mandatory restore:

```text
0172fc7e1dd44de560d467743f3e5ab7f6406bf52a5bbb302dd68685d64d679a  apps/api/src/index.ts
91bf0e695ef847b0864bedd030c2ed94f4431d3864fa5e5a7e540aeec011342b  apps/api/src/main.ts
5069ab7acf78c9fec7179b36695ff54a2b9f9b478417ce0598b31bb08365309e  apps/api/src/registration.ts
66b20d2170a35667e75e4ba15e8adc016d44d252958527e2877b99bf9f6871e6  packages/crypto/src/index.ts
c610b06ee13a87ec8d9a47c88b552edb5398b30cd9b49509d547eda36fdcb11b  packages/crypto/src/argon2-worker.ts
b990c3f866f9697b158e4040ffd9bb832341e31853a40d30e70deb57394c526d  packages/crypto/src/argon2-worker-pool.ts
2d92223b58c6f1af7c6b9bc544df5f2518e8e20404bf982fbabb0a50bc90e17f  packages/db/src/identity.ts
f8e406f1cd35393aa20eac5ef5679ed31dd8f9213ee2c727a5aacd9d706a4216  packages/register/src/auth-policy.ts
956554377863df933955b0bf1b7cb9d5975cc371094fb86dad98b98cc05c45a9  tests/integration/registration-database.test.ts
dba434ff5d23d84e2e194a8a69fb12a012811ec24ced586ba758b1fc6105ad0f  tests/unit/registration.test.ts
93f1a3357ffe5b45fac047f77c16c9ae80322123a3eff97c30a7d7e7d2afb55b  tests/unit/argon2-worker-pool.test.ts
4896587d1fafc0d52c2389c3bd6336a05798ea1a89cadaa42280b6a0039fb18d  tests/architecture/t1-argon2-worker-contract.test.ts
```

Only the six source-packet source/test paths and authorized mission evidence
may change. Preserve unrelated dirty worktree content.

## 4. Evidence already accepted for continuation

Preserve, do not rewrite, and cite in the final handoff:

- RED1b raw `1`, 22 intended failures; RED2 raw `1`; RED3 raw `1`.
- typecheck clean.
- focused GREEN: unit 23/23, architecture 41/41, integration structural-103.
- bounded regression chunks A-G: 24 selected tests green, including the T9
  11-test battery.

Do not rerun these merely to replace evidence. The overwritten first green5a
receipt and the abandoned green4/green5 processes must be disclosed precisely
in `logs/T1-rework7-progress.log`; do not present them as clean evidence.

## 5. Remaining work and process safety

1. Append the recovery/interruption classification to the progress log and
   refresh the Kanban worker claim/comment for this recovery session.
2. Re-run the full VR-10 set from M01. The interrupted run has no decision value.
3. Run each mutant as its own foreground invocation below the 600-second tool
   limit. Every mutant must have a durable mission `.log` and raw `.status`,
   exact pre/mutant/restored hashes, a selected-test count, intended failure
   evidence, and a killed/survived verdict.
4. Every mutation invocation must use an interruption-safe supervisor: create a
   fresh verified backup, install EXIT/INT/TERM/HUP restoration before mutation,
   terminate/reap the test child first, restore unconditionally second, verify
   SHA+size+mtime+cmp, and override status on restoration failure. Never rely on
   a Python `finally` alone for process-group termination.
5. Between mutants, require all three product/policy candidate hashes to match
   the manifest above and require no live Vitest child. Stop on any survivor,
   ambiguous failure, drift, restore failure, or overlapping heavy process.
6. After VR-10, run three consecutive fresh focused 100/103 capacity repeats on
   identical candidate/test bytes. Preserve a separate complete log and raw
   status for each. Require 100/100 and 103/103 success/commit/send, exact typed
   early-busy behavior above 103, empty admission/mail/pool occupancy after
   drain, no unexpected errors, and identical pre/post hashes.
7. Run the source-packet static gates and create a complete durable handoff:
   exact hashes and mtimes, HEAD/index/scope diff, raw statuses, progress log,
   board comment, and no live foreground/background author/test child.
8. The single full `tests/integration/registration-database.test.ts` invocation
   is still required exactly once after the three capacity repeats. If the
   Claude Bash lane cannot keep that >25-minute command alive, do not launch a
   doomed substitute and do not weaken the gate. Hand it explicitly to Router
   as `ROUTER FULL SUITE REQUIRED`; Router will run the exact command in the
   sole controlled visible lane before reviewers.
9. Do not run the repository-wide `pnpm test`; that remains Router final custody
   after two independent Sol xHigh reviews.

End only with `REWORK READY FOR PEER REVIEW`, `ROUTER FULL SUITE REQUIRED`, or
`CODEX BLOCKED`, after candidate restoration and all author/test children exit.

