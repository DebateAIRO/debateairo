# Preview account mail v4 — source preparation only

This new artifact retains the current installed purpose-specific recipient cohorts. It is not installed, and tests use a local file sink or stub process; no real email was sent. Frozen v2 and v3 remain byte-exact. The source template is copied byte-for-byte from the current production producer; the wrapper requires canonical full MIME reserialization and matching Node/ICU/tz/CLDR/Unicode runtime metadata before submission.

The observed current wrapper SHA-256 is `bc201edd5875f1aae9984acebc6fa52b484772b06058b00f2cdef1aefcb70edf`; recovery policy SHA-256 is `b6ce9c849b3baceead6938db5b97c53bbff46f4bbd3e1fe8856d8c75f129772b`. Their redacted full public code is included with an explicit `.redacted.txt` suffix. Those derivative bytes have their own hashes; they are not represented as byte-identical originals. Original public-code mirrors and exact aliases remain in restricted ignored evidence. The executable artifact names the four aliases only; the recipient allow-list is installation data on the server and is never tracked in Git, neither as addresses nor as digests.

| Canonical purpose | Permitted installed cohort |
|---|---|
| verification-v1 | Legacy verification three inputs; the two existing forwarding inputs go to the one fixed installed forward target, the installed direct input goes to itself |
| recovery-v1 | Installed recovery PROOF input only |
| email-change-confirm-v1 | PROOF only |
| email-change-notice-v1 | PROOF only; this notice carries a cancellation bearer |
| consumer-recovery-v1 | PROOF only |
| security-scheduled-v1 | Installed NOTICE two inputs, each to itself |
| security-cancelled-v1 | NOTICE only |
| security-completion-v1 | NOTICE only |
| security-method-changed-v1 | NOTICE only |
| security-codes-regenerated-v1 | NOTICE only |
| security-recovery-proved-v1 | NOTICE only |
| security-recovery-completed-v1 | NOTICE only |
| email-change-unavailable-v1 | NOTICE only |

Only the primary verification purpose inherits the three-input route. Current installed wrapper lines 29–37 restrict that legacy grammar to the verification subject and `/verify-email#token`. The separate recovery policy lines 11–15 admit its two current aliases, then further restrict PROOF to one. New purposes use the controller's conservative source-preparation ruling; this is not evidence that these canonical purposes are already installed. All eight NOTICE templates were inspected: their canonical content has no operative bearer URL. The wrapper rejects URLs in these templates. Unknown purposes and mismatched recipients fail closed before spawning a process.

`test-source-producer.mjs` generated the 13 purposes through the actual Source mail sender into a private local sink for all four distinct installed aliases: 52 cells, 23 allowed and 29 intentional refusals. Restricted originals retain the actual installed recipients and establish unchanged-body transport parity. Review derivatives replace those recipients in every flat header and in decoded text/plain and text/html alternatives, then re-encode valid MIME; they are not unchanged original body bytes. The manifest records original and derivative hashes plus the redactor hash. The independent52-capture privacy check decodes every alternative and rejects matches to installed-recipient digests. All tokens, message IDs, dates and display-only addresses are synthetic; the original recipient addresses were not. The initial To-only derivatives leaked recipients in12 encoded captures and have been replaced; unsafe prior commit/review material remains private and is excluded from publishable ancestry. These captures establish parser/routing parity, not inbox delivery or email-client rendering.

Run the public wrapper boundaries with `node --test deploy/preview-mail/v4-20261005/test-policy.mjs deploy/preview-mail/v4-20261005/test-mail.mjs deploy/preview-mail/v4-20261005/test-review-capture.mjs`. The Source matrix additionally needs the checksum-verified private alias file and a fresh, nonexistent scratch capture directory, passed as the two positional arguments after the script with the pinned tsx loader. The script never invokes the real MTA.

Do not replace the current GLM/recovery103 launcher with an older single-recipient or v2 launcher. A separately reviewed installed launcher must select this exact artifact hash and actual runtime, keep the current account/environment/origin separation and API outbound restrictions, and retain the current overlay semantics. No new recipient, provider activation, main-domain cutover or installation is authorized here.

`review-capture.mjs` supports only the source producer’s two UTF-8/base64 alternatives and flat ASCII headers. Encoded/folded headers, malformed base64, extra alternatives and other transfer encodings are refused. It is a review-artifact redactor, never the production forwarding path. An independent release-evidence checker (kept with the private release evidence, outside this public repository since 2026-10-09) decodes all52 tracked derivatives with the standard MIME parser; no private values are printed.


## Final recipient-custody correction (2026-10-06)

The earlier tracked wrapper, five-file supplement/test family and one unit test contained installed-address literals. All nine known-digest literals are now synthetic fixtures or explicit withheld markers. Historical source-producer receipts describe their original restricted run; they do not claim that corrected source bytes ran against an installed relay.

The executable now reads only `/etc/debateai/preview-mail-recipient-installation.json`, a separately reviewed installation input, using a bounded no-follow read. It must be a root-owned regular file with no group/other permissions, one link and at most 1024 bytes. It has exactly two fields, `recipientSha256` and `verificationForwardTarget`. The first is an object with exactly the four alias names above, each mapped to the lowercase hex SHA-256 of that alias's installed address; the SHA-256 of the second must equal the `verification-forward-secondary` entry. A missing, unreadable, mis-owned, group/other-readable, linked or malformed file refuses every message before any process starts (fail closed). This preserves the fixed purpose/cohort policy. There is no environment, command-line, message or caller-provided destination override. Source contains no real recipient value or recipient digest (2026-10-09: the digests formerly tracked in `recipient-bindings.json` were withdrawn from the public tree; the operator moves them into the server file). Config installation and installed-mail verification remain unperformed release gates.

`synthetic-recipient-fixture.mjs` supplies four isolated test cohorts. Run the source producer with `--synthetic` and a new restricted capture directory to exercise all 52 template/cohort combinations without reading installation aliases. These synthetic results cannot certify an actual recipient, provider or inbox. The supplied installed-source text remains a non-executable review derivative; added withholding markers mean its corrected derivative hash differs from the retained original installation fingerprint. See the additive privacyCorrection object in source-producer-sha256.json; older receipt/fingerprint fields remain historical.
