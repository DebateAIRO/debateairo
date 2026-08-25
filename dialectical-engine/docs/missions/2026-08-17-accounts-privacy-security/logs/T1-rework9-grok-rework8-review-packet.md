# T1 Rework9 Rework8 — same Grok 4.6 finder review

Resume session `01a02a3f-abeb-7030-a8df-4d3a0319dfde`. Sole reviewer;
Claude is excluded. Read-only only: do not edit, recover, launch/bootstrap,
run supervisor/viewer/worker/Vitest/PostgreSQL, commit, push, or touch Kanban.

Read completely: Rework8 self-report, manifest, progress section, RED/GREEN/
static/custody logs+statuses, Rework8 fixture, current launcher/controller/
worker, current contract+aggregate checker, exact 302 abort evidence/recovery
authority/tool/custody checker, and current 302 abort receipt, empty lock, and
private two-entry directory.

Incident `302197e8-e713-47f7-9518-9f078eede931` failed inside the launcher
before owner/preflight/controller/viewer/worker/test with only UNKNOWN_HELD
`PINNED_TEST_RUNTIME_OR_ENTRYPOINT_MISMATCH`. Hash/size/mtime were correct;
the logical `node_modules/vitest/vitest.mjs` traverses the pnpm
`node_modules/vitest` symlink, so its realpath cannot equal the logical path.
The launcher had already made the lock, receipt, private dir, secret and
challenge; those are preserved. No stream files or process existed.

Adversarial review:

1. Exact `node_modules/vitest` logical symlink lstat/readlink tuple and its
   canonical package directory are frozen, including path/target/hash,
   device/inode/size/mtime and containment. Symlink replacement, retargeting,
   canonical escape, package/version drift, and target mutation fail closed.
2. Exact canonical regular `vitest.mjs` tuple separately carries the expected
   logical entry path and canonical target. Launcher and worker independently
   re-resolve and rehash link/package/entry/runtime; neither trusts only packet
   strings or PATH/package-manager lookup.
3. Actual execution remains exact pinned Hermes Node + canonical `vitest.mjs`
   + `run` + the one registration test. Controller revalidation/postflight and
   expected 1 file/56 tests are consistent. Product/test authority is unchanged.
4. RED non-vacuously reproduces the real pnpm link and old logical==realpath
   failure. GREEN mutates both link and canonical target and requires the exact
   safe argv; examine actual assertions rather than banners.
5. Exact 302 recovery is claimless-lock/run-bound/archive-only/no execution.
   It verifies abort-only receipt, absent owner/preflight/plists/streams/labels/
   processes/tests/final receipts, exact empty lock, frozen HEAD/index/all12,
   and preserves the exact private 0700 directory with only two 0600 files
   (secret and challenge relationship). It must not delete/private-clean or
   fabricate normal terminal/release evidence.
6. RED raw1; GREEN/static/custody raw0; current lock/receipt/private inodes and
   bytes stayed unchanged; recovery was not executed; no probe is required.

Expected:

- manifest `4e203871f831613a515e9a9f2d34d6f2eae1d32b3a6daee1910e91bafb89c682`
- self-report `f6502dd7421e69f7e73a5df4628fffe2253e4e629ec74558b7e9e70c111b875f`
- launcher `34fd87e1...`, controller `a8c5fbe5...`, worker `8ebc2ed2...`
- fixture `558105d9...`, recovery `9daab3f7...`, authority `2814ef7f...`
- failure evidence `5b634c61...`, contract `006eea87...`
- static checker `317e40db...`, custody checker `95574741...`
- RED/GREEN/static/custody raw 1/0/0/0

HEAD `7918f4f8bff33909792afc01dc38d402972b4ccd`, staged 0, all 12 exact.
Empty lock dev/inode `16777233/46921156`; abort receipt `16777233/46921157`;
private dir `16777233/46921158`; secret SHA `f84b786a...`; challenge SHA
`ba8370bf...`. Recovery artifacts absent.

Finish exactly:

- `GROK REWORK9 REWORK8 APPROVED`
- `GROK REWORK9 REWORK8 CHANGES REQUESTED`

Report final custody and whether lock/receipt/private evidence stayed untouched.
