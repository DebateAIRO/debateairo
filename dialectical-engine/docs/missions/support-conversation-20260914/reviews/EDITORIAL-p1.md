# CP1 exact-byte editorial review — pass 1

**Verdict: REWORK.** The bilingual knowledge set and catalog are structurally sound, but the human-case article contradicts a response-time promise in the exact reviewed product. No `EDITORIAL-attestation.json` was emitted for these bytes.

Reviewer: `/root/plan_review` (`gpt-5.6-sol`), separate from author `/root/requirements`. Ticket `t_48916645`, authority epoch 1, four visible comments read; the latest canonical cursor carried by the ticket is 93. Reviewed product commit: `fb47b34eac5d72b324def7499828de15cf44b9ba`. Review date: 2026-09-14.

## Findings

### B1 — the human-case article denies a shorter promise that the Support page makes

`packages/support-kb/content/support-cases.en.md:14` says the current server receipt has a 48-hour target and “Support does not ... promise a shorter response time.” The Romanian byte at `packages/support-kb/content/support-cases.ro.md:14` makes the same claim. The server does set `slaHours: 48` at `apps/api/src/support/index.ts:165`, but the full-page Support rail simultaneously says “Weekdays, replies within one working day” at `apps/ui/components/support/Assistant.tsx:722`.

**Consequence:** a visitor can receive incompatible service expectations from the same shipped Support experience, while the knowledge answer incorrectly denies that the shorter promise exists.

**Required correction:** revise both language bytes so they do not deny the visible one-working-day promise. The safest truthful wording is to disclose that the case receipt says 48 hours while another Support panel currently gives a one-working-day weekday target, and to direct the visitor to rely on the case receipt until the product copy is aligned. Any byte change requires a new exact-byte review.

### N1 — use the product’s “required second step” wording for MFA recovery

`packages/support-kb/content/account-access.en.md:17` and `.ro.md:17` first call the post-password requirement an “authenticator step,” then explain that a saved recovery code can be used instead. The live form calls it a required second step and presents either an authenticator code or recovery code at `apps/ui/components/LoginFlow.tsx:223-295`.

**Correction:** say that sign-in requires a second verification step, completed with an authenticator code or a saved unused recovery code. This preserves the security prerequisite and removes the brief implication that an authenticator app is the only valid method.

## Verified scope

- Read all 24 changed/new article bytes named by `KB-manifest.json`, in both languages, and inspected the six unchanged EN/RO pairs mapped by the catalog for contradictory claims. No contradiction was found in the unchanged pairs.
- Confirmed 36 article files form 18 complete EN/RO pairs. The 24 draft article hashes and nine cluster-file hashes match the receipt: 33/33.
- Independently evaluated `SUPPORT_CATALOG_CANONICAL`: 6,655 UTF-8 bytes, SHA-256 `24784328a4bb8d4e5205b3036dd369268180df792243db1c296a0a7ed2a0f9fe`, matching the receipt.
- Traced catalog actions to the current composition: `/`, `/new` or `/login?next=%2Fnew`, `/login`, `/sign-up`, `/help`, `/help#service-status`, `/#method`, `/#transcripts`, `/settings`, `/settings#consent-privacy-heading`, `/?tab=public`, `/?tab=yours`, and trusted owner/public debate routes. The Forgot password action remains unresolved with no href and is filtered from resolved actions.
- Confirmed the catalog filters signed-out, signed-in, owner and public-reference actions and validates the trusted dynamic identifiers. Excluded account-flow and operator routes are not emitted as actions.
- Confirmed owner/public export bounds, publish/unpublish/delete prerequisites, local-only Challenge behavior, generation-history failure ambiguity and the absence of a working scoring-feedback resource. Optional scoring DTO/UI structures were not treated as proof of a shipped `evaluatorRankings` capability.
- Scanned visitor-visible article bodies independently of front matter. Internal source paths, reviewer identities and evidence-locator leakage: zero matches.
- EN/RO meaning is aligned for the reviewed facts except for the shared defects above. Owner-ratification fields remain blank on all 24 draft bytes.

## Exact byte integrity

The complete article hash map was measured before claim tracing and again after review; every before/after pair matched. The catalog canonical digest also remained unchanged.

| Article byte | SHA-256 before and after |
|---|---|
| `account-access.en.md` | `21d6620fccb24e988af8ea341181367d50606bb72f70d558456dbd3f055c9fe6` |
| `account-access.ro.md` | `e6205651dce1732ebf9d025da5629be3d602d441d2a4f3859ce6ef1389f7403f` |
| `account-settings.en.md` | `2cab95047c1c34109794f3fc1ad620784bbb97b9267160d471551454d296f628` |
| `account-settings.ro.md` | `e2b2834ff96da50a0511b2647ae490f6f99af80e317a74caddb16ee8262bc5d9` |
| `browse-public-debates.en.md` | `8059a2e46af231765a80f61854752aa5a9ec49e60c95dc715eb3e82a39618fad` |
| `browse-public-debates.ro.md` | `0fb2aa501c0980af4afb52520c10e51ca0814266bd2258b1f727fa52d16e0241` |
| `budget-tier-choice.en.md` | `a49d563ef7bfec75ed179a70adb54c25947aa9cbe4db557698eacc84d1d3c683` |
| `budget-tier-choice.ro.md` | `e648150ae607bb98c55059eaea6162ffc2cd09df437721b75c8c7b226ef4984d` |
| `debate-topic-and-description.en.md` | `695b7b405e599260acd7c5a51f897f46b52b238f2860a20168cd14cfdc176bad` |
| `debate-topic-and-description.ro.md` | `90f1fff60a4245eeda7b5131b671772b425e8ab682f967c4c31c2ad42c7207a2` |
| `delete-a-private-debate.en.md` | `7c37881f26d875f87a0177bc35593d9f52a1739b25a848df98ad2d478c7bdb26` |
| `delete-a-private-debate.ro.md` | `afc631bec586e463df1b217d79fc9ea694f873f5690b028c7b79aa65d83cfaa9` |
| `export-json.en.md` | `c31c5bd3a2eb80e1352f27431e459f8272ae37605a9988210cff2aa82d6b7ea5` |
| `export-json.ro.md` | `5016b1370fbbd83ed2e647cfdeb8a2c10b4052ef8861807abed2ee4b0ae8f02b` |
| `getting-started-debate.en.md` | `a438b7c7a91342dee7c5edb2efe48e586be2cc33d9a2eafabaadad2882f6f9e8` |
| `getting-started-debate.ro.md` | `f2a848dbaa9131d3165f50ce2004f1fba874032a48d7bdf1ba90f96c8aa205af` |
| `guide-how-it-works.en.md` | `05316f05e559cd866948ab7f464a681d6875fe8aad5143e956eeb20077bc46c5` |
| `guide-how-it-works.ro.md` | `94acc4db2ccecb9a0d4f5b82350e91d26643b76c6caff879019edc107a3e3000` |
| `privacy-consent.en.md` | `54cca7dbfb790c9d6aac077b00775e5ac6d5bc277be38733e92047bc63c262d5` |
| `privacy-consent.ro.md` | `e9b04331a2aa76d3ed9bd45c2199263dc476ae62d15c33db30ed537fedeb5c5d` |
| `public-answer-disclosure.en.md` | `e67c271558e6bb5b4100fa735059e781e453c268808d555c6e85af36e3e678ea` |
| `public-answer-disclosure.ro.md` | `6e845c95414ae5b9190cf5917136776d7af931eaf626b2da4a0540b3bf7925f1` |
| `publish-a-debate.en.md` | `9385f0dd00f8014e3445d1ee4c8c5230dc12d0379766d35c9c7845814f288e29` |
| `publish-a-debate.ro.md` | `41858b13ebb6bcec19430b6a63cae6f5854b25ad02e8ac74617d83b087355c3c` |
| `risk-tier-choice.en.md` | `3ca67a93a3b159c0b284b2bd75093fd9bc70e20d03c357f4ac1fdcb3df522715` |
| `risk-tier-choice.ro.md` | `f40e8583d9ec012f6510c4f6ae6a6527680bc279f393388dc8cd2a31762f4d96` |
| `support-cases.en.md` | `9505919e08ef35a16040e061d1b38a05ce072b93d24afc6fb91ef91663ea1f8b` |
| `support-cases.ro.md` | `1f8fcd67294588ec7df7ad6a222ea363d4951dd3f8f711118e0d6a33108f3092` |
| `support-status-limits.en.md` | `7f111d034af0d6ba0765c9bf008d6d8981f8a589e1731695e9bbf7d5f213f15f` |
| `support-status-limits.ro.md` | `884956c2b04303c8412a4859746a526d5577e9392e2066843aa977500857511f` |
| `unpublish-a-debate.en.md` | `70e53322f323778974e50ca4f4342a4e8cba5c41d5139d51452530a40c7563a2` |
| `unpublish-a-debate.ro.md` | `a741f94571245aadbb6f25d6da5c3c5b87bdf5bf72fa4c5aaf8e03980abce9d0` |
| `unsupported-capabilities.en.md` | `6e7f19d6d7c00fe4d10660e4dff7ad52e16ae8ff3d85cea13717780af586ec6f` |
| `unsupported-capabilities.ro.md` | `c07bb1a6a85f14a034a134a08250f22721f772ce54bd77d18ff63f7df93d350b` |
| `view-public-debate.en.md` | `995068c814cec3ba1dd0f0ecf320bea04fc8c66acc9703b8cd70cec72cfca053` |
| `view-public-debate.ro.md` | `9faf157365acb8b560208eb822cda7cd42c83e845d2a551853ea5c97ccf9c260` |

## Skills loaded

- `superpowers:using-superpowers`
- `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-protocol/SKILL.md`
- `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-reviewer/SKILL.md`
- `superpowers:verification-before-completion`

## Limitations and custody

- This was a content, catalog and targeted claim-composition review. No broad code audit, heavy suite, build, service, provider, database or preview run was performed.
- Runtime behavior, owner ratification and the exact owner-confirmed Forgot password destination remain **UNVERIFIED**.
- The source checkout and review lane are distinct worktrees. An interim message incorrectly inferred checkout movement after a command used the source cwd; explicit worktree inspection showed no mutation. All reviewed KB bytes came from the exact `fb47b34e` lane/tree.
- PREVIEW/server changes in the lane are outside this review and were not attributed or assessed.
- Actual model-token usage is **UNAVAILABLE** from this harness.
- Self-report: `.hermes/reports/support-conversation-20260914/agent-reports/EDITORIAL.md`.
