# T1 Rework9 Rework7 — same Grok 4.6 finder review

Resume session `01a02a3f-abeb-7030-a8df-4d3a0319dfde`. Sole reviewer;
Claude is excluded. Read-only only: do not edit, recover, launch/bootstrap,
run supervisor/viewer/worker/Vitest/PostgreSQL, commit, push, or touch Kanban.

Read completely: Rework7 self-report, manifest, progress section, RED/GREEN/
static/custody logs+raw statuses, Rework7 fixture, current launcher/controller/
worker/stream helper, current contract+aggregate checker, exact 7821 failure
evidence/recovery authority/tool/custody checker, and the current 7821 receipt
owner/preflight/worker-terminal/launchd-streams/events/epochs/lock+claim.

Incident `7821bdb5-0559-43f4-804e-6996bb9f18a4` crossed controller, visible
TTY, worker and private-stream custody. Worker exited raw 127 before Vitest
loaded because the packet invoked `node_modules/.bin/vitest`, whose shell shim
could not resolve `node` under launchd's default PATH. Controller sealed the
streams, then raw `fs.closeSync(1/2)` caused SIGABRT before terminal/release;
launchd restarted it to five epochs. Router removed exact labels and viewer;
no matching process remains. Lock is deliberately still held.

Adversarial review:

1. Launcher and worker independently require and rehash the exact pinned Node
   tuple `/Users/vladmihaimiron/.hermes/node/bin/node` and exact
   `node_modules/vitest/vitest.mjs` tuple; execution argv is exactly Node,
   Vitest entrypoint, `run`, and the single integration file. No shell shim,
   PATH, env, package-manager, or packet-only trust remains.
2. Packet/preflight/owner/worker-terminal/postflight bind those tuples and the
   expected 1 file/56 tests without widening product/test authority.
3. Controller never raw-closes fd1/fd2. It fsyncs them, begins a no-later-write
   region, seals all four private streams, and revalidates exact private and
   durable tuples after seal, before terminal, and before release. Determine
   whether any code path can write/warn after the seal or release and invalidate
   durable evidence without detection.
4. Real isolated child evidence non-vacuously reproduces the old close-then-
   spawn SIGABRT and proves the selected stable-open path exits 0; its parent
   verifies all four source/durable bytes and hashes after child exit and the
   seal→terminal→release order. Check assertions, subprocess statuses, and
   intended mechanism rather than accepting banners.
5. Exact 7821 recovery is run-bound/archive-only/no execution: verify raw127,
   exact 119-byte stderr, null parsed counts, zero stdout, sealed streams,
   epochs/events, absent terminal/release, labels/processes absent, frozen
   lock/claim/private secret/governed tuples, immutable intent/marker ordering,
   and no delete/bootstrap/bootout/test authority.
6. RED kills both real incident mechanisms; GREEN/static/custody gates bind the
   corrected runtime and lifecycle. Product/test bytes/all 12 tuples stay exact.
7. Confirm no harmless probe is needed and no authoring command launched the
   real gate/recovery/Vitest/PostgreSQL.

Expected:

- manifest `c55ce0c5cfd89f22e315d5ea6c4538a57105e33c0c72fc919ee6fe74b2a2a014`
- self-report `f3774a08bf653753ba4aec1cafaaefbcec9b72ea480d921992910b184f56af65`
- launcher `8ef015bd...`, controller `dee5d0fe...`, worker `50587780...`
- stream helper `e9440e38...`, fixture `556380cb...`
- recovery `f3e04e66...`, authority `368db60d...`, failure `db47e96b...`
- contract `a3ac0299...`, static checker `983ee45f...`, custody `d844d138...`
- RED raw 1; GREEN/static/custody raw 0
- pinned Node SHA `2e3f1286...`; Vitest entry SHA `39db22f5...`

HEAD `7918f4f8bff33909792afc01dc38d402972b4ccd`, staged 0, all 12 exact.
Live lock dev/inode `16777233/46782057`; claim inode `46782073`, SHA
`bac88b8943d2f8ce0ec080cf2bb916ae431221dea175599d02066d0e8efd6545`;
owner SHA `953f0998fedb9b048069604270745855b80e179df0bcaff0a907261d76c12017`.

Finish exactly:

- `GROK REWORK9 REWORK7 APPROVED`
- `GROK REWORK9 REWORK7 CHANGES REQUESTED`

Report final custody and whether the lock/claim stayed untouched.
