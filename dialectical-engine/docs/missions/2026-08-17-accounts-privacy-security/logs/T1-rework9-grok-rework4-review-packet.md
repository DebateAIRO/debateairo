# T1 Rework9 Rework4 — same Grok 4.6 finder re-review

Resume session `01a02a3f-abeb-7030-a8df-4d3a0319dfde`. You are the sole
reviewer; Claude is excluded. Remain read-only. Review only the correction to
your single blocking Rework3 finding plus custody. Do not run the real runtime
probe, launchctl, recovery, supervisor, worker, Vitest, or PostgreSQL; do not
edit, commit, push, or touch Kanban.

Read completely:

- your prior verdict `T1-rework9-grok-rework3-review-visible.log`
- `T1-rework9-rework4-self-report.json`
- `T1-rework9-rework4-manifest.json`
- `T1-rework9-rework4-progress.log`
- corrected `T1-rework9-rework3-runtime-probe.mjs`
- corrected `T1-rework9-rework3-static-fixture.mjs`
- corrected `T1-rework9-gate-contract.md`
- Rework4 RED/GREEN/static/final-custody logs and status receipts

Expected changed hashes:

- probe `2eb8789b2784f57efb0b39e321eaeb5af4ea40e4c46dbd398edad848af84a999`
- fixture `1445fc95c6c16e18ff71641fbf5310f791e20d48afe9fc2e55d9cb6445bae567`
- contract `64a4b67de0db8bc091828942c3f03e5acade21bb48472947da5501513f54e257`
- manifest `3ac9ca82c20460ad3d0d49a23c3788d17c7af19f809a19e1b9f4e7841373217d`
- self-report `8d815fbc52fb242410ed92e7d2a196024d7b9ab6eb29346e7e3947c97da6c492`

Recovery authority/tool/core must be unchanged. HEAD must remain
`7918f4f8bff33909792afc01dc38d402972b4ccd`, staged paths 0, and all 12
governed sha/size/mtime tuples exact. The real lock must remain dev/inode
`16777233/46312766`; claim inode `46312780`; claim SHA-256
`fba7e6e38c05e5e88548fa85faeae4eaf571f46221cdf249674d98cba7a32b88`.

Confirm specifically that the probe compares its real path to the exact leaf
under `realpathSync(dirname(probeDirectory))`, thereby accepting macOS's
`/var` to `/private/var` canonicalization without accepting a different leaf,
owner, group, mode, symlink, or pre-existing directory. Confirm the fixture is
RED on the old literal comparison and GREEN on the corrected comparison. Do
not reopen non-blocking residuals from your prior verdict unless the fix
regressed them.

Finish with exactly one marker:

- `GROK REWORK9 REWORK4 APPROVED`
- `GROK REWORK9 REWORK4 CHANGES REQUESTED`

Report final HEAD/index/12-path custody and whether the real lock was untouched.
