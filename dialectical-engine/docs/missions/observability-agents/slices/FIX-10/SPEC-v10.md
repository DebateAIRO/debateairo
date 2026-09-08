# FIX-10 — exact FIX-09 C3.5 implementation admission

**Successor authority packet — 2026-09-08, development-unblock round.** This
document incorporates `SPEC-v2.md` through `SPEC-v9.md` without changing their
bytes. It supersedes only the stale prerequisite that names a future FIX-09 v13
authority and an independently reviewed `FIX09_C35_REVIEWED_REF`. The exact
implemented FIX-09 v25/C3.5 identities in §2 replace that prerequisite for local
FIX-10 C0/C1/C2 development while the user-requested review hold is active.
Every v9 control, proof, history, gateway, signer-custody, native-evidence,
activation, recovery, test, rollback, and STOP law remains binding.

This packet authorizes non-live implementation and tests on one isolated branch.
It authorizes no production root, principal, credential, key, native install,
database migration application, live database or process, quiescence,
activation, service installation, acceptance, C4, merge, push, board, or Done
act. No independent review is requested or inferred.

## 1. Frozen FIX-10 shape authority

The sole FIX-10 behavioral authority remains v9:

| Field | Exact value |
|---|---|
| commit | `a539ba114bd80e9234c08ba77c75772d0d111d94` |
| parent | `e3f613efbad63ffdc72b3494143c45583e3738f9` |
| tree | `5012c7a196d6977af41a888817b336b4248605e9` |
| `SPEC-v9.md` blob / SHA-256 | `34de70265e0f1256d2f71197e15619374f0685de` / `9d87002fd20287285c72f0d7b7913b3b576dabb862f774f81312664b8de58326` |
| `PLAN-v9.md` blob / SHA-256 | `6eced95012f9d9b8fe58c903a4e580f5e0743f2e` / `2de04eadba64b34a7b3c1e5da69b1ee3cf7ec33e8dd34a1a69999b1d84e9f012` |
| reviewed `DECISIONS.md` blob / SHA-256 | `cb3c71265b43502e55acad5cd083f829d55f035e` / `866212f1b760dec71532ada2bc125dbaefb574bc13687eebb4629548714c1353` |
| review path | `.superpowers/sdd/PLAN-FixAgent/fix10-control-authority-sol-review-round8.md` |
| review SHA-256 | `637f707109790d9799016dd2ba440d4974819367a1bb0fd1ddae0d8654d5006b` |
| review verdict | `AUTHORITY FIDELITY VERDICT: PASS`; `SPEC VERDICT: SPEC PASS`; `PLAN VERDICT: PLAN PASS`; `UNRESOLVED: P0=0 P1=0 P2=0 P3=0` |

The review's `FIX-10 IMPLEMENTATION AUTHORIZED: NO` line was correct for its
then-current dependency state. It is not rewritten. The user's later explicit
instruction supplies the narrow local-development authorization represented by
this successor. It does not convert that review into an implementation review.

## 2. Exact substituted FIX-09 facts

The local development input is the implemented C3.5 tip, not a future v13:

| Field | Exact value |
|---|---|
| FIX-09 v25 authority commit / tree | `d0c578c0e1874fa25d2258242c31ed7eb937b56f` / `96e71dfa1f190ba3ca2c3a7dae7292b241be4d14` |
| Task0 composed product commit / tree | `1548e778155a6963c91f39cdc19378787e630e9c` / `c5b21aff8159994eb90dfb1e2e849cd48f3a05ee` |
| C3.5 final commit / tree | `7a9765efad4d639ac042179f626573f49efc9784` / `948b8de0588bf7de7935a608cfcbd99a11fea002` |
| C3.5 final parent | `652beda6719511bede81c66e8b59b22545391a1b` |
| implementation report | `.superpowers/sdd/PLAN-FixAgent/fix09-c35-v25-implementation-report.md` |
| report SHA-256 | `1226aa8a8f4a6e3383e690be80c4561da1fe252e5242aa9671191c6622b557cc` |
| focused editable result | 11 files / 24 tests / PASS |
| canonical C3.5 result | 16 files / 118 tests / 118 passed / 0 failed / 0 skipped / 0 todo, three precommit runs plus one postcommit run |
| reporter-name bytes / SHA-256 | 12,676 / `8ef3f10b6c4cc952a3e43b29821d6f4e1430b5fded60869890e89429a5a6e6ce` |

The dependency artifacts used by FIX-10 are pinned as follows:

| Path | Git blob | SHA-256 |
|---|---|---|
| `migrations/0064_fix09_audit_chain.sql` | `6feefd856acdf015697f69f925733ec4228e2fa6` | `8e866506f6926985b40069cda3d9cc9e075e9bc896bcf0f2ed7557cf41783a13` |
| `packages/obs-capture/package.json` | `c41ddf9a22526ddedcd48486f18d26a6628dd772` | `f7f5ebdba06c0b84ee02a8fc8d46799e2c74e64c3b52e092f657c8a9ffad8715` |
| `packages/obs-capture/src/chain/index.ts` | `a01578b4ed7eda0783d02cbcf6b4f1f55b379eb1` | `10a9984fc0bd62cf38b18687cda85d6533c86b38bac6b4d698ed8af757f9566f` |
| `packages/obs-capture/src/chain/signer.ts` | `2b2c0b8996980b14cde651a422357b58a09eae56` | `3df2b3bb0e426ad16da1f9f7a30c0c63e48c76c02230c3a1a0b1f57375409e91` |
| `packages/obs-capture/src/chain/private-key-helper.ts` | `2b79365209dcba2b3f600f6f9eb124a834147261` | `40138ea4d3969aa2f59604a39481384801cdab25c54a5039971a654003cb5063` |
| `packages/obs-capture/src/chain/fixagent-delivery.ts` | `016648a7805cc4eb83d7e335396a6e602a2bbe6d` | `8400cb2788e6d73178da3754b4460dd86c2f1cdd2edaadbe4cef4705f6e03f2f` |
| `packages/obs-capture/scripts/verify-fix09-native-wipe.mjs` | `bfe872cca8604983907aa060cc29d45852e3e8b2` | `b97c89f278812c75deb6f234d75f18a1bba1d1a8320e5ea452bbf2cfaf75a66f` |
| `packages/obs-capture/native/fix09-openat-read.c` | `8db516c562831c8877376c87e98c0e0b39f27aff` | `48f6c67d8345d89ce3ca1fa4697c9fcea3f4ee5170857314b3ca1b509e837f14` |
| `tests/unit/fixtures/fix09-gate-manifest.json` | `165ff6af60e7104d6423fd816911097af88d61aa` | `17aa8f07c2d28594b308424f713ea0c5e43dd677fccb413af87ee4ed25ef89b5` |

These exact bytes prove the four live API/runner/scheduler/daemon compositions,
the dormant `obsctl_action` signer/session capability, the private non-live
watchdog seam, the materialized action gateway, the generation-scoped delivery
adapter, the same-EUID descriptor custodian, the parent-only opaque signer
session, and the v9 native-verifier digest formulas. C0 is the first caller of
the dormant obsctl capability.

## 3. Review-hold substitution law

The C3.5 implementation has no independent review because the user stopped all
review work. For local FIX-10 C0/C1/C2 development only, exact commit/tree/blob
identity plus the captured 16/118 evidence substitutes for the old literal
`FIX09_C35_REVIEWED_REF` prerequisite. Code and tests must call this value
`FIX09_C35_IMPLEMENTED_REF`; they must not emit a false reviewed receipt or
claim that C3.5 was independently reviewed.

This substitution does not unlock FIX-09 C4. C4 remains stopped until the
review hold is lifted, the then-current implementation receives any literally
required independent receipts, FIX-10 local implementation evidence is sealed,
and V supplies the activation/bootstrap facts required by inherited authority.

## 4. Locally authorized stages

- **C0:** exact dependency/admission pins, first obsctl signer-session
  composition, materialized action wire, and inherited v9 digest-oracle tests.
- **C1:** secure root and read-only control seam, ARMED/proof verification,
  signed outbox and V journal, DB-free kill/arm, and filesystem-derived status.
- **C2:** lifecycle audit/executor/bootstrap composition, status-only shared
  gateway reconciliation, daemon KILL/proof integration, CLI/package exports,
  capture gate, architecture tests, and product-invariance tests.

Tests use only explicit temporary roots, runtime-generated ephemeral keys,
abstract or disposable adapters, and non-live helpers. They do not supply or
derive production values. Native build analysis may use bounded synthetic or
ephemeral artifacts only and is not an installed-helper receipt.

## 5. STOP

STOP on any v2-v9 byte edit; a dependency ref/tree/blob/hash mismatch; treating
C3.5 as independently reviewed; product source or migration edit; a second
control root; raw action DML; new role/grant/database object; DB access from
kill or arm; a new public command beyond inherited `obsctl`; helper signing,
path selection, network, setuid, or key export; private material in repository
or evidence; production defaults; C4; live/native install/provisioning/
activation/service/acceptance act; review dispatch; merge; push; board; or Done
claim.
