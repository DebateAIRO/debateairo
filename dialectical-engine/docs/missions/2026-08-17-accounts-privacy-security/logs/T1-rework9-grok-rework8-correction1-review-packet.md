# T1 Rework9 Rework8 correction1 — same Grok 4.6 finder

Resume session `01a02a3f-abeb-7030-a8df-4d3a0319dfde`. Read-only sole
reviewer; Claude excluded. Do not edit, recover, launch, run tests, commit,
push, or touch Kanban.

Review only the prior Rework8 HIGH and its bounded correction. Read the
correction1 manifest/self-report, RED/GREEN/static/custody logs+statuses,
updated abort recovery/authority/fixture/static+custody checker, relevant
progress append, and live 302 lock/abort/private evidence.

Required:

1. Exact source delta maps frozen key `mtime_ms` to Node `Stats.mtimeMs` while
   preserving device→dev, inode→ino, size and the exact frozen tuple.
2. RED executes the old mapping against the actual live pnpm link and fails
   specifically because the value is undefined. GREEN executes the corrected
   mapping against the same live link/authority, matches
   `1786649129059.6936`, and a +1ms authority mutant fails.
3. Recovery remains exact-run, claimless/archive-only/private-preserving and
   otherwise unchanged; no recovery or runtime command ran.
4. HEAD `7918f4f8bff33909792afc01dc38d402972b4ccd`, staged 0, all 12 exact;
   live empty lock `16777233/46921156`, abort receipt `46921157`, private dir
   `46921158` stay unchanged.

Expected hashes:

- recovery `e5928a33e2456e9275a063f55b40da794599b330b56658b6ea997fcf0f853791`
- authority `b7bae38883cc5bfe41e137dcb274381c535befc52b6b95b10ea77b7986762d48`
- fixture `8588f61c982e3a97bc7d01af1b42bd2955afff646534d97fa6e4d41c8145f93e`
- manifest `9ae666b3de9072f7f8ec4cc5d4357d6aef55b93473992a4df009ed9296349783`
- self-report `f23b56baf28f99d927d1cf9944660b2bce8f65db439ac351fbcbb5e305020e6e`
- RED raw1; GREEN/static/custody raw0

Finish exactly:

- `GROK REWORK9 REWORK8 CORRECTION1 APPROVED`
- `GROK REWORK9 REWORK8 CORRECTION1 CHANGES REQUESTED`

Report final live custody.
