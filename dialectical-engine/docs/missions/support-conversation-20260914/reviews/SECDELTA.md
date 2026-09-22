# SECDELTA — changed credential policy and sink assessment

Status: **ASSESSMENT COMPLETE; FOUR FINDINGS; NO CHECKPOINT VERDICT**

Reviewer seat: Sol session `/root/forgot_destination`  
Ticket: `t_29866275`  
Frozen product revision: `43cf9386ea3c9e7c79523ec38debe63271d19292`  
Baseline: `b7ca2c413bf3242ce18e29a397dc9a3aa9228893`  
Date: 2026-09-14

This is the bounded security delta requested after FIX1/FIX2/FIX3. It reuses the SECPREP source-to-sink work, validates only the changed boundaries with inert direct-import probes, and supplies no final whole-bundle verdict. No real credential, user data, relay, database, browser, preview, reset, account or external service was used.

## Evidence identity

The worktree was clean at the start and end of the assessment. `git rev-parse HEAD` returned `43cf9386ea3c9e7c79523ec38debe63271d19292`; `git merge-base --is-ancestor b7ca2c413bf3242ce18e29a397dc9a3aa9228893 HEAD` returned 0. The classifier is byte-unchanged from the SECPREP revision, so its already-executed ordinary-password `REFUSE_ZONE` → repeated-refusal E3 disposition remains applicable. Current probes imported production modules from the frozen clean tree and used in-memory ports only.

Named-input SHA256 values:

| Input | SHA256 |
|---|---|
| `INSTRUCTIONS.md` | `4582bc82bdcdef28ac4e06b4a4eb1a413fee84e8e07bc4374049a9c0ca451bf9` |
| `CP1/SPEC-v2.md` | `a692cc55515a2a581330aaaf8a5549e844f64e848c1d620234aff2d5c362d029` |
| `CP1-REVIEW-SCOPE.md` | `764ddf20a85f1ee898d5cc357862997035f8d6da6e8dc63d4cbdc9b406662903` |
| `CP1-SUMMARY-CONTRACT.md` | `581f5382621be644f6bec845a21d7245416b2024e8a1f17de93ef2dc10bd3c74` |
| `GATE-pre-LIVE3-inventory.json` | `4d0b92219766d0106cfcfca65ff882b0fc8d0523bdfa20d1fb2245a4e7709e40` |
| `FIX1.md` | `6917288401bcbd33242fa709511274e488df5f7a5301088568a678ab2a44c655` |
| `FIX2.md` | `5825a75ccbc11e3c0562219642709d075a73df7dec36455f199dc16fc5b0b9c4` |
| `FIX3.md` | `de39311cf0e53b9a91a3f2c00c9d43d90f4a77720572a759d795c7a05359f6df` |
| `FIX3-manifest.json` | `98355d3ffaab10b4a2eab15c4728c7567c5d5c9458ed6726a24c8afed4643057` |
| `LIVE2.md` | `c042b40a39e7dd1d298a92403cf6520b59979942fcf1cc656119d85e0f727da6` |
| `LIVE3.md` | `3ee68aa6fcfdaf99c3ae6259fcacde6df97d5fb4adcf67dfa3b91a72ed43c2b9` |
| `LIVE3-manifest.json` | `86442c6e87fb7746548758ed76cac4b3d22726747901111bae34a5b500870b5e` |
| `LIVE3-actual-relay-receipt.json` | `928c5fa840f64fb5125479e0cebbe28322e5a96edef516dcb989a3b40262bc88` |
| `LIVE3-consumption.json` | `c63f0b7a430a5beb0632d13939b034adbbb4d1c234c1d465912616aa6cf4c8b8` |
| `REV2-prep.md` | `7ac23fbc1e6d8ed6a9d837dd5e35eaba4ac5de93b7145585fa0a27fd8741005b` |

## Findings

### B1 — the expanded input redactor still persists and relays members of the supplied-credential class

**Location and cause.** `packages/kernel/src/index.ts:290-302` has one generic secret-shape expression plus an EN/RO labelled expression limited to `password` and `parola mea`. It does not normalize away format controls before matching and does not cover the mission’s other credential nouns. `apps/api/src/support/session.ts:224-303` uses this result as the canonical plaintext passed to sealing, persistence and model transit. Case preparation re-reads with the same redactor and copies that canonical text into a snapshot and the advisory-summary input at `apps/api/src/support/session.ts:448-489`.

**Actual result.** The direct redactor matrix preserved these invented values with `redacted:false`: Romanian `Passwordul meu este inert-stejar-7`, EN `My passcode is inert-maple-7`, `OTP is INERTABC`, `Reset token is inert-reset-7`, and EN/RO password labels split by U+200B. The source-to-sink probe then passed the U+200B password and short OTP through the actual message cipher and case service. The invented values reached the fake seal/persistence port, `writeAndTransit`, the E3 case snapshot, and advisory-summary transit unchanged. The ordinary `My password is inert-orchid-7` control was replaced at every boundary.

**Effect.** Encryption at rest does not satisfy the redaction-before-persistence and no-credential-relay boundary: the application supplies the retained value to encryption and later decrypts it for case/model transit. This probe used identity fake crypto so the plaintext at that boundary is inspectable; it makes no claim that a real database stores plaintext. The class includes labelled password/passcode/OTP/TOTP/MFA/authenticator/recovery/verification/security/reset-token values, inflections in both supported languages, and control/format obfuscation. The finite corpus does not prove that these are the only members.

### B2 — the shared answer/summary policy accepts forbidden credential solicitation

**Location and cause.** `apps/api/src/support/response-policy.ts:66` recognizes several credential nouns only in singular form. Lines 85-98 also treat any negation before an operation in the same punctuation-delimited clause as negating every later operation. Conjunctions are not boundaries.

**Actual result.** The imported parser accepted all of:

- `Send your passwords to Support.`
- `Trimite parolele către Asistență.`
- `Send your security codes to Support.`
- `Support does not receive passwords and you should send your password here.`
- `Asistența nu primește parole și trebuie să trimiți parola aici.`

The adversative control with `but` was rejected, as were singular direct solicitation, validation, transformation, and reset-success claims. The actual `createSupportAnswerService` accepted the EN negation/conjunction member as `ANSWER_GROUNDED`, wrote it as the assistant’s canonical record, and returned the same value. `apps/api/src/support/index.ts:785-792` projects `result.text` directly into the HTTP reply, so the confirmed service result is the route value when composed. The actual advisory-summary producer sealed/persisted the analogous text, and the actual legacy case projection returned it unchanged.

**Effect.** This is a server-side forbidden-text acceptance across two model-output channels. It can tell a visitor to send a credential. The probe did not create a clickable link, call an auth/reset capability, validate a credential, or prove that a particular relay model will emit the string. It establishes acceptance, canonical persistence, and return/projection when such output is produced.

### B3 — whole-answer noun scope rejects benign EN/RO limitations in a separate sentence

**Location and cause.** `apps/api/src/support/response-policy.ts:85-98` first checks for a credential term anywhere in the whole candidate, then checks security operations inside each clause without requiring the term to occur in the same clause. An unrelated operation can therefore combine with a later limitation.

**Actual result.** Both of these safe controls returned `TEXT_CREDENTIAL_OR_SECURITY_ACTION` and failed parsing:

- `You can change your account name in Settings. Support cannot receive your password.`
- `Poți schimba numele contului în Setări. Asistența nu poate primi parola.`

The same controls with plural `passwords`/`parole` were accepted only because the noun expression misses those plurals; that is B2, not evidence of correct clause scoping. The already-added known limitation controls were accepted.

**Effect.** Safe settings guidance can be replaced with `REFUSE_SAFETY`, repeating the product-level false-refusal class after FIX3. LIVE3 observed two credential/security diagnostic categories, but it did not correlate diagnostics to requests, so this report does **not** attribute those live events to this exact sentence shape.

### N1 — internal action identifiers remain valid answer and summary prose

**Location and cause.** The structured instruction in `apps/api/src/support/answer.ts:130-139` forbids source/action/capability IDs, routes and paths in `text`, but `apps/api/src/support/response-policy.ts:101-117` has no internal-identifier screen. Membership validation applies to the arrays only.

**Actual result.** `Select start-debate to continue.` was accepted by the parser, then persisted and returned by the actual answer service as `ANSWER_GROUNDED`. The advisory summary parser also accepted `The visitor should use start-debate to continue.`

**Effect.** This is a concrete text-contract and presentation failure consistent with the raw `start-debate` text seen in LIVE3. It is not a clickable-link exploit and does not execute the action. The general class needs a deterministic server-side rule derived from the closed source/action/capability catalogs rather than prompt text alone.

## Current disposition of prior P1/P2/P3

- **P1 short labelled-secret persistence:** **partially fixed, class still open as B1.** Ordinary EN `My password is …` and RO `Parola mea este …` are now redacted. Session reads, case snapshot construction and case replies reapply that redactor. Other credential nouns, Romanian inflections, and control-obfuscated labels still cross persistence and advisory transit in actual-module probes.
- **P2 advisory-summary output:** **partially fixed, shared-policy defects remain B2/N1.** The producer now requires the exact four-key `case_summary` envelope with empty source/action arrays, screens text, substitutes a deterministic non-authoritative replacement before persistence, and screens legacy summaries on access. Actual probes confirmed replacement for a double-encoded link and reset-success claim in both producer and legacy projection. The negation/conjunction solicitation is accepted, sealed, persisted and projected; internal IDs are also accepted.
- **P3 encoded/protocol-relative links:** **fixed for the tested class.** The actual parser rejected raw protocol-relative, percent-encoded HTTPS, and double-encoded path instructions as `TEXT_LINK_OR_MARKUP`. The summary producer/access probe replaced the double-encoded link. This finite set does not prove an absolute absence of every link encoding.

## Preserved boundaries and safe controls

- The answer sink’s singular direct-solicitation negative control produced `REFUSE_SAFETY`; canonical assistant storage and returned text both contained only the server-authored refusal. Its diagnostic exposed code, booleans and counts only, with no rejected completion bytes or identifiers.
- Singular EN/RO direct solicitation, validation, transformation, reset-success claim, raw protocol-relative link, percent-encoded link, double-encoded path, and an adversative negation boundary were rejected by the actual policy module.
- Known EN/RO limitations from the FIX3 unit suite were accepted. B3 uses a different safe two-sentence construction and does not weaken the owner’s credential prohibition.
- Source and action arrays remain exact-schema, provenance/membership checked, deduplicated, and filtered through server-resolved available actions before context. N1 is a separate prose channel omission.

## Verification and receipts

All successful executions used the packet-mandated `run-capture.sh` and `node --import tsx`; each returned `rc=0`:

| Receipt | Main measured result | SHA256 |
|---|---|---|
| `SECDELTA-redaction-probe-node-import.log` | 11 redaction cases | `a556099d6fdce1079cb82cd79dd86a5c0ee035152ba7250e0efb8a0967c40a2a` |
| `SECDELTA-policy-probe-v2.log` | 21 answer + 4 summary policy cases | `cea1150a1fa307a0bf102e1133178bc32bbe90f508e833dea4f6fae2c0f28c48` |
| `SECDELTA-redaction-transit-probe.log` | 3 message/persistence/case/summary-transit cases | `ae861e9d75cfb4dd58c44ebcb10bb2b4403a58004e5c1e9635c7ff43e6a6d46d` |
| `SECDELTA-answer-sink-probe-node-import.log` | 3 canonical answer sink cases | `e8834c79db012c8a6cbc27679c6d8cfb996d551e4b7e4abb134beb11a24bcfb4` |
| `SECDELTA-summary-sink-probe-node-import.log` | 4 producer + 4 legacy projection cases | `da6472b8e329c74704c0c0bd4a9f347fc2cbcc98dbab9688eaf0bd753a116a85` |

The earlier `SECDELTA-policy-probe-node-import.log` is a successful 16-answer predecessor matrix, superseded by v2. Four first-launch logs named without `-node-import` returned `rc=1` before importing product code: the `tsx` CLI tried to create an IPC socket and the sandbox returned `listen EPERM`. They are retained as environment evidence, not product failures. The successful equivalent bypassed only the CLI IPC helper by invoking Node’s installed loader.

Probe-source SHA256 values:

| Probe | SHA256 |
|---|---|
| `redaction-probe.ts` | `6b4faf1e5e9be17d84d93e43a189c28366109d01601d2d06c71a29f291c2739e` |
| `policy-probe.ts` | `4c50fd7f86e8ab56e642f000b1bbf50b4c4773d17b49477d8c26d6f1e67f904e` |
| `redaction-transit-probe.ts` | `95c17d59961bcd5cc1a3f425d2569a9c4e9136a28e2e3fd8ac9717d230373b70` |
| `answer-sink-probe.ts` | `188244624d4bddb938aae457afc785db161195d3d3cd8536fe321c248ad4e4d0` |
| `summary-sink-probe.ts` | `e3138249b085bfb23355775821fb12856927a667c6f944889c6b2654fc91fd0f` |

## Limitations and handoff

Real PostgreSQL encryption/readback, real route transport, relay behavior, browser rendering/clickability, operational logs, full test-suite state, and actual live-request/diagnostic correlation are **UNVERIFIED** by this bounded delta. Existing author receipts are named inputs, not independent re-executions. The exact owner-confirmed Forgot-password destination remains **UNVERIFIED** and is outside this assessment; no substitute path was guessed. This seat assigns no final checkpoint verdict and directs no speculative patch. The next correction should treat B1, B2, B3 and N1 as explicit mechanical classes, then use these preserved probes as regression seeds.
