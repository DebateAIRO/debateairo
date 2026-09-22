# FIX_P1 author evidence

Status: author handoff only; no self-review, CP1 PASS, checkpoint acceptance, or user-verification claim  
Ticket/session: `t_ad0185b6` / `/root/requirements`  
Product base: `6e5ab5fc41acebbff4264efc7d481df3db8dce44`  
Product commit: `e0dcfe77f49655bea774bdfacf988b911be4ff06` (`codex/support-conversation-cp1`)  
Actual committed scope: 16 packet-allowed product/test paths, 604 insertions and 94 deletions; worktree clean after commit.

## Implemented F1–F6 mapping

| Finding | Implemented boundary | Primary evidence |
|---|---|---|
| F1 | A fresh random request namespace produces opaque source/action aliases. Model context contains human labels, availability facts, whole selected sections, and only request aliases. The frozen server map rejects duplicate, unknown, stale, and cross-request references, translates accepted aliases to canonical IDs, then applies canonical membership and the trusted action resolver. Canonical IDs and all current-request aliases are forbidden in narrative prose. | `apps/api/src/support/model-references.ts`; `packages/support-kb/src/context.ts`; `apps/api/src/support/answer.ts`; request-binding mutant and final suite |
| F2 | Shared credential analysis captures matching quoted values and up to six unquoted words/160 code units, stops at punctuation or declared coordinators, and preserves original source spans for canonical redaction at every existing consumer. | `packages/kernel/src/support-credentials.ts`; multiword mutant; cases/routes fixture sinks |
| F3 | EN/RO causal and modified coordinators create bounded operation scopes; bounded pronoun references connect later positive operations without carrying an earlier negation across the boundary. Benign limitations and negative operation lists remain accepted. | `packages/kernel/src/support-credentials.ts`; negation mutant and policy controls |
| F4 | One bounded canonical-view helper feeds link/path, credential, secret, code, redaction-echo, and narrative-ID screens. Compatibility/control and encoded credential nouns reach the semantic policy. | `packages/kernel/src/support-text-views.ts`; `apps/api/src/support/response-policy.ts`; encoded-credential mutant |
| F5 | Canonicalization performs at most four decode passes; any valid encoded octet remaining at exhaustion and malformed structural escapes fail closed. Benign `50%`/`100%` text remains accepted. | canonical-exhaustion mutant; deep-credential RED/GREEN; final 381-test suite |
| F6 | The narrative screen covers every exact hyphenated action, capability, and article machine ID, including the four former exceptions; normal spaced/localized labels and structured navigation remain valid. | exact-ID mutant; catalog enumeration and controls in `support-response-policy.test.ts` |

The public completion envelope remains exactly `kind`, `text`, `sourceIds`, and `actionIds`; successful public arrays remain canonical server-owned source/action projections. One model attempt, existing model/relay selection, usage accounting, consent, snapshot, availability, encryption/shred, degraded, reservations, and human handoff paths were not replaced.

## RED and investigation frames

All commands used the repository `run-capture.sh` and unique absolute logs.

- Initial class/transformation RED: 7 files, 6 failed/1 passed; 26 failed/160 passed. It reproduced request alias/projection, multiword EN/RO value, coordinator/pronoun, encoded credential/link, and former exact-ID failures. Log SHA-256 `77b7180e33ed59a46e39776c160da55e1a1acf20c51fd199350090374413f8b4`.
- First implementation frame: 7 files, 3 failed/4 passed; 42 failed/154 passed. It exposed an implementation construction typo and three semantic gaps. SHA-256 `85fc9d494b1a8ef989064cdf4a4435cdf46adb69526374b9fa62e7a527f802ec`.
- Second unit frame: 7 files, 2 failed/5 passed; 2 failed/194 passed. It exposed the alias overhead needed by the cap fixture and the missing Romanian plural reference. SHA-256 `ca1a5ffd6777f91a5d3c1927297d63f8ddbd50e6161be4d6e8376da3a88581b2`.
- The sandbox integration frame was environmental: 10 files, 2 failed/8 passed; 206 passed/129 skipped because the isolated embedded database could not open its local listener. SHA-256 `d09f484b64168cdeef628749f7469bd27d0034a6133c1c120ee126d3cd1216c0`. The identical host-permitted command then passed 335/335, SHA-256 `18a01b5ee6291c7126a9826ad77374d97dad54d6fd8e00666f79f83df75320bc`.
- A late bounded-state review added the missing fifth-layer credential-noun case before the exhaustion guard was generalized: 1 file failed, 1 failed/10 passed, SHA-256 `5320b2959a20addc30b9180d88435515a932c23c939d594a56d13d5f4ac22a5c`. The two directly affected suites then passed 148/148, SHA-256 `dc6a0b575ece29cf2e58ac1a3fe753a7bbdd340f3a39909d2ec6ec8290e3846f`.

## Restored mutation matrix

Each useful mutant was applied to the working implementation, captured RED, and restored before final verification.

| Property removed | RED result | Log SHA-256 |
|---|---:|---|
| Per-request namespace replaced with a fixed namespace | 2 files failed; 6 failed/5 passed | `81094651ada0bb4eb491d1e9ccd05c4bc524cc14e03068dbdb50cb3b822ea21d` |
| Unquoted supplied value reduced to one token | 2 files failed; 3 failed/50 passed | `8d9621f6fa8f208b3265353ba96cb1769151720d7f207732c87bd7163767b1de` |
| Modified EN/RO coordinator boundaries removed | 2 files failed; 7 failed/156 passed | `b4524da888aff609efc0a6f10794a27d3aec6665981a281f387a8a655439a67d` |
| Additional decode passes and fail-closed exhaustion both removed | 2 files failed; 7 failed/140 passed | `2ba84166c708d67ab9b10411f4672f9bfcbddbbf7ad02c4f5c789b2b4168234e` |
| Four exact machine-ID exceptions restored | 1 file failed; 8 failed/129 passed | `b39eef63567ba4fe174798f4c9a6d5b7e167946a9d5bb8afb8abe2e42e0403c5` |
| Credential semantic screen restricted to the raw view | 1 file failed; 5 failed/132 passed | `5e2d9a563d23001351af614a66b04130c87f11c7d9bfaf7430539569bcec79eb` |

The max-pass-count-only probe passed 147/147 because the independent exhaustion guard still preserved the property. Its SHA-256 is `e7b12d6d17c5569f5f267e42a77d84c9ee367d15ddc95e0f9f13d20ff600036b`; it is retained as a non-discriminating dead end and is not claimed as mutation proof.

## GREEN and sink evidence

| Frame | Result | Scope/meaning | Log SHA-256 |
|---|---:|---|---|
| unit-green3 | 7 files/196 tests passed | First repaired unit boundary | `edd78907eca3eb92af042c74cd4543c86078c1669d5e9b4cdda873d0c41cd05d` |
| expanded-unit-green | 7 files/243 tests passed | Expanded alias, EN/RO, encoding, exact-ID and benign controls | `9b808b17855fe76dc9a9835e27e2b567c7b815f33d1f69d7dbe0c060ca7c7746` |
| sinks-green | 2 files/129 tests passed | Inert embedded-DB/loopback case and route fixtures; canonical sealing, persistence, transit, legacy, E3, case reply, and model-context sinks | `394bb6a33a20dce17c312e74b0004cbc692a6bcd467d27979dd8a52ae2d6eb93` |
| final-focused | 10 files/380 tests passed | Restored post-mutation affected union before the late exhaustion generalization | `a3b41f66c22f355e9e3193299f6882936b4739fbaceec78518d4d90a34f7f269` |
| final-focused2 | **10 files/381 tests passed** | Final committed current-byte affected union after exhaustion generalization | `cc3588a9272f877b982b265526de7e6ed2d276b04e276da7c4f3732773fb421e` |

Final command:

`pnpm exec vitest run tests/integration/support-cases.test.ts tests/integration/support-degraded.test.ts tests/integration/support-routes.test.ts tests/unit/support-answer-context.test.ts tests/unit/support-context.test.ts tests/unit/support-credentials.test.ts tests/unit/support-model-references.test.ts tests/unit/support-redaction.test.ts tests/unit/support-response-policy.test.ts tests/unit/support-text-views.test.ts`

This final run used only inert fixture data and its own loopback/embedded database. It is not evidence from the active preview, real Support HTTP, the provider, or a model completion.

## Typecheck, static checks, and receipts

- Final `pnpm run typecheck`: rc1, byte-identical to the already-attributed 76-diagnostic `UI-root-typecheck.log`; both SHA-256 `06e6f0b6b88e174dd01601d511b0b193128933cb40a583315dc672347c61a6f0`. No new output or owned-path diagnostic was introduced. Current-byte log: `FIX_P1-typecheck-final2.log`. The earlier identical `FIX_P1-typecheck-final.log` is retained.
- `git diff --check` and staged `git diff --cached --check`: rc0.
- Exact product manifest: `FIX_P1-manifest.json`, SHA-256 `e449c6371b348c455f1ae0be64284106d9c3c0b4d977e176e9c9efbf806c5540`; every recorded product hash was mechanically verified after commit.
- Design: `docs/missions/support-conversation-20260914/reviews/FIX_P1-IMPLEMENTATION.md`, SHA-256 `5ba43ff1d1c4a39a668be3a354eac2828c89bc5a99ed4a8a891ef61823a8d477`.
- Self-report: `.hermes/reports/support-conversation-20260914/agent-reports/FIX_P1.md`, SHA-256 `d6df292e89f9d4b7e41b9753cd5852ac0ddc2f803f1e2bd58f589695cb9a5cee`.
- Commit scope is exactly the 16 paths and hashes in the manifest; clean worktree after `e0dcfe77f49655bea774bdfacf988b911be4ff06`.

## Limits and downstream work

- No active preview reload, browser action, real Support HTTP, relay/provider/model request, original-service action, account/reset action, source-tree edit, package install, or external connector was performed.
- LIVE_P1 must reload the supported preview to the committed bytes, prove the strict seven-request diagnostic consumer, run the exact integrated union including all new members, and issue the same seven real prompts once without retries.
- Separate final pass-two security/correctness/product review remains required.
- The owner-confirmed Forgot-password entry still has no verified destination. That remains UNVERIFIED and blocks checkpoint acceptance.
- Actual token/cost usage is unavailable.
