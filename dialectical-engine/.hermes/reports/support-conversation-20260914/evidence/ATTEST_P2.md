# ATTEST_P2 evidence

## Bound review and product revisions

ATTEST_P2 mechanically bound the separate editorial `PASS` for the exact 36 recovery records at product base `dfeb7eef93de31e19367760d87c09ca1ef76544e`. The selecting review identity is `SOL`, model `gpt-5.6-sol`, reviewer agent `/root/baseline`, native reviewer session `01a09ef7-e096-7c31-9b35-806840028cf0`, reviewed on `2026-09-15`, with evidence `EDITORIAL-RECOVERY-p2.md` SHA-256 `68e85a06a84fd3dc161d8f6d654fdc892f6f0325988ce106f92d785ec7e38cf6`. The exact component file remains SHA-256 `5ee8d592c3f1b3550c1f2af74c030fbbc12e80e258dc71b57aa28de045f99e8a`.

The schema-v2 manifest, production-corpus test, and two amended transition assertions are commit `c7e50817d6d2ee744e7acdc7c7ff007f1c842c3f`. The separate one-line fixture nullability correction is final commit `606b2eabea1dc9212159e53c193cf69655424e77`. The four-path diff from the original base contains only:

- `packages/support-kb/reviews/manifest.json`
- `tests/unit/support-kb.test.ts`
- `tests/unit/support-recovery-attestation.test.ts`
- `tests/unit/support-recovery-components.test.ts`

The manifest preserves the previous catalog object and all 24 article review records semantically exactly. It adds 36 exact recovery review rows. Every recovery owner-ratification field remains blank.

## RED, GREEN, and final checks

- Strict production-corpus RED: `ATTEST_P2-strict-corpus-red.log`, SHA-256 `8ec79c86af438d041dfd9f11f645957fef71c71f6746ee6c6be2c0fd8b2d6601`; 1/1 failed at `SUPPORT_KB_RECOVERY_REVIEW_REQUIRED` against manifest v1.
- Strict production-corpus GREEN: `ATTEST_P2-strict-corpus-green.log`, SHA-256 `a414254fbde65eb055f0c8a3674edb04a4783a2f4cbf3e89b51ed30ed3fd7196`; 1/1 passed after exact manifest binding.
- Preserved transition failure: `ATTEST_P2-affected-final.log`, SHA-256 `7416a0a9b922982ce48e4e30f02e3411e02f9c2acae4dc5717bb7329fc37b77f`; 447 passed and two stale pre-attestation assertions failed across 12 files.
- Transition correction: `ATTEST_P2-transition-green.log`, SHA-256 `e2d12aa1f74e35cfffd3a322edd2c08c49a65dd0500d6b1fac52fa4b94622a69`; both corrected assertions passed, 33 unrelated tests skipped.
- Exact affected frame at attestation commit: `ATTEST_P2-affected-final2.log`, SHA-256 `2d4c2d82733972cfd4e958caf40768ee489a2efd95e7db3106e17538190d7ccd`; 12 files and 449/449 tests passed.
- Typecheck RED: `ATTEST_P2-typecheck-final.log`, SHA-256 `1a5be748d82132c33b239ccfbb3fc728159002a2dbb4f6ef97084a73e2bc6dea`; 77 diagnostics, the known 76 plus `tests/unit/support-recovery-components.test.ts(122,5): TS2532` introduced earlier in FIX_P2.
- Final test-only delta: `ATTEST_P2-recovery-components-green.log`, SHA-256 `57d14d6342df8c507fe65cc64514d63bb5b330ec30bba164f4173681f2e86740`; 3/3 tests passed at final commit.
- Final typecheck: `ATTEST_P2-typecheck-final2.log`, SHA-256 `06e6f0b6b88e174dd01601d511b0b193128933cb40a583315dc672347c61a6f0`; exit 1 with the known 76 diagnostics and byte-identical to `UI-root-typecheck.log`. This establishes the attributed inherited baseline, not a passing project typecheck.

The exact 25-file final union remains unchanged and is owned by LIVE_P2. It was not run here. No live model, provider, preview, browser, or HTTP traffic occurred.

## Admitted snapshot

`ATTEST_P2-snapshot-receipt.json`, SHA-256 `cfdaf33e1fc4e5e303d00764be509829e6631e36a60aece79813b6fb42163de2`, was generated through the production loader from the exact final content, component, review, and catalog bytes. Its `kbVersion` is `d674533e89d145bf9203248e2e324b451e57a2f1d3f257614d31678b7ac379df`.

The admitted snapshot contains 18 shipped pairs and zero ignored pairs. Article provenance counts are 12 separately Sol-reviewed pairs and six historically owner-ratified pairs. Recovery provenance counts are 18 separately Sol-reviewed pairs and zero owner-ratified pairs. All 36 logical records bind the exact article, decoded projection, and decoded fallback SHA-256 values plus the actual selecting reviewer facts.

The receipt separately records the canonical catalog digest and the `catalog.ts` source-file digest. It also records the strict loader, immutable lookup, deterministic ranking, and production initialization entrypoints. LIVE must load and match this `kbVersion`, rank against that immutable snapshot, and capture `context.sourceIds[0]` before its request. Returned response source IDs cannot establish the pin.

## Receipts and limits

- Product manifest: `ATTEST_P2-product-manifest.json`, SHA-256 `38a9b3f2f5a71c2137a4fe878d2704b55abeecf67777ea69afdd967c1e777fee`.
- Snapshot build log: `ATTEST_P2-snapshot-build.log`, SHA-256 `95ab676fe43f06bf497758fc3e028c1c71b629c061e8c0a7fe6d62c441180e6c`.
- Snapshot builder: `ATTEST_P2/build-snapshot-receipt.ts`, SHA-256 `066e4bb168965bebfa8302052b3bdae3050636a9c585c1d1b18c406889a3e208`.
- Self-report: `agent-reports/ATTEST_P2.md`, SHA-256 `5dfa3a8bff9eda8d6b1e3442dacc5003568903ee16336105d4874398c11457b5`.

The Forgot password destination remains unresolved. The 36 recovery records are peer reviewed and not owner ratified. LIVE_P2, final pass3 review, owner verification, and owner acceptance remain outstanding. ATTEST_P2 makes no CP1 readiness or acceptance claim.
