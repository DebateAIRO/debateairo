# T1 Rework9 full-gate custody recovery — Grok review packet

Review only. Do not execute the recovery, supervisor, worker, viewer, Vitest,
PostgreSQL, launchctl, or any heavy command. Product/test bytes and the held ae9
incident are frozen. Return raw status 0 only if the bounded future supervisor
fixes and one-time recovery are safe; otherwise return raw status 1 with exact
blocking findings.

Prior accepted verdict:

- visible log SHA-256: `048277aada9c3daa52590f89e3a677bdf1f33acc8981c2fb62753b948347fc24`
- visible status SHA-256: `9a271f2a916b0b6ee6cecb2426f0b3206ef074578be55d9bc94f6f3fe3ab86aa`
- marker: `GROK REWORK9 FULL GATE ACCEPTED WITH CUSTODY RECOVERY REQUIRED`

Review the future-run fix:

- `T1-rework9-gate-launcher.mjs` — `38378f4e9a28146197f55e00bcc83b0aa5931c69613f3098a145c26bfee96c7a`
- `T1-rework9-gate-controller.mjs` — `dfefc008b8c8c44bf076df283710e7a15344de9f26a9eb31e601cf0d4a957449`
- `T1-rework9-gate-worker.mjs` — `01311020a6d294ef4adf493044de38cfc1d17234005556d262f492767adcf6e4`
- `T1-rework9-supervisor-parsers.mjs` — `ea00acb85d0723f87dc3f156814e143fc0167e1520984587026c58b7134c29f5`
- `T1-rework9-full-gate-static-fixture.mjs` — `8e040dff398f791f68e3ad5aff288ca71c92303639dfec1be174c037cb8c0544`

The required properties are: strict parsing even when PID starts at column zero;
exact controller/launcher/worker/test argv identity plus PID ancestry; exact
controller, viewer, and receipt-tail display exemptions; no global UUID/tmp-path
ownership; fail-closed malformed snapshots; ANSI stripping before count regex;
and preserved raw stream hashes/status.

Review the one-time ae9 recovery:

- `T1-rework9-full-gate-recovery.mjs` — `320cb699663c6424d25519a4622b0e498ba1b2af566c2d3ff9fbfb5c78090ad5`
- `T1-rework9-full-gate-recovery-authority.json` — `250635998523c47c3ab57977d7a562cef2d0dc42b23c4948e330c09ee3092615`
- `T1-rework9-full-gate-failure-evidence.json` — `f2600cd89776a356fa222b2a6b24c9420905ff0b959b9ae65194edd4939b6079`
- `T1-rework9-full-gate-recovery-static-fixture.mjs` — `4e372cf3dc752badb3919478dda2bc69f334f36d212c368b080183be218f50c9`
- unchanged recovery core — `82b02bce30f19342c6bc863db76c807a172357fb8fea4ad11ce06127604a1a2d`

Verify exact binding to run `ae9f57fb-bff0-49da-b031-bfd4ff2fbe14`, packet
`0e34e9d7cb01a3b02f987bd0476e3608504fc8aa7a1d2d0021be92692c07f14c`,
lock/claim inodes `47087786/47087814`, raw-zero historical worker terminal,
sealed streams, stdout `0274f03d85a684ab7486b1107e0f6ceb4316f96bd1d88f0e8d4225c743c8894f`,
ANSI-stripped 1/1 and 56/56 counts, the exact two false-positive lines,
label/process/HEAD/index/governed checks, and strict intent → supplement →
revalidation → atomic archive → marker order. It must not create terminal or
release, rewrite worker-terminal, delete the lock, change receipt/private bytes,
or authorize execution/new run. The second invocation must fail closed.

Static evidence:

- RED raw1 log — `48be0f98785d68f440da82b4b9a1daab7911fa7b587181789a89cb3f4102ea66`
- GREEN raw0 log — `8f2fa818ebbdef5346c5ae38c941aa79a7e5c2f6d0420578837ad176a9ffff5b`
- final static raw0 — `b1d06f44242b5f6b84f7bc7dfd96e2f9bc254f1507b98023d4ff67c331470ee3`
- final custody raw0 — `c61f7fcc8589d3b20b880df469f9a6c5a02c26db9dc0120a7560d20112742f27`
- contract — `415e747f887bf4a34555b3213cd2dd5af246b92efeb9300db3f1fc0a5fc5a3f6`
- manifest — `0ef6ffbde540d055fe30042c6d216f80ee05a1a58ac0cba5b8d130c1cfc3df15`
- self-report — `148c9155c0966646b61540380bef45ae31f6ab3cd735dec62a9158fe014996ef`

Frozen custody at author handoff: HEAD
`7918f4f8bff33909792afc01dc38d402972b4ccd`, empty staged index, 12/12
governed tuples exact, live lock `16777233/47087786`, claim inode `47087814`,
receipt-tree SHA `e88564b645e626c6844b11530665f0c7d425b522b466d7eeec2b6738388545b9`,
private-tree SHA `a220d9932e1e9b4a073722a42aa64d70ca6d640cb4096fac956d7797621ea07f`.
Recovery outputs remain absent.

If accepted, use the exact terminal marker:

`GROK REWORK9 FULL GATE RECOVERY APPROVED`
