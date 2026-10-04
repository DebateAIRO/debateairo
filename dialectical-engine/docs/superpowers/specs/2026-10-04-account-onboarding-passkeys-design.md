# Account onboarding and passkey sign in design

Date: 4 October 2026. Source: V3 worktree `codex/v3-owner-team-access`, baseline `15fccd74b`. Status: written design awaiting user review; product code and deployed services have not been changed.

This design covers the requested registration, login, email and account UI changes. The goal is a human, consistent experience with fewer fields and prompts, while preserving age and country restrictions, legal acceptance evidence, account recovery and protection against account takeover. It incorporates the user's revised choices: the headline below in every language, a mandatory phone field on the first screen with no paid SMS, and passkeys as the preferred authentication method from this release.

## User decisions and proposed defaults

- The signup headline is exactly **Good questions deserve more than one answer.** in English. Appendix A supplies all 35 current locale translations; English US and UK reuse English text.
- Remove repeated email entry and move recovery email to Account → Security as an optional, separately verified address. Email/password registration uses one password field with Show/Hide and password-manager support; remove repeated password entry to reduce typing.
- Require a phone field in the initial registration or social-signup completion screen. Collect a plausible international number and keep it unverified. Do not send SMS, WhatsApp or voice messages, purchase a service, or add phone verification prompts in this release.
- Prefer passkeys now. TOTP remains an alternative for people who cannot or do not want to use a passkey. A passkey user does not also have to enroll TOTP.
- There is no seven-day MFA exemption in this design. Proposed consumer session policy: 14 days idle, 30 days absolute, with fresh authentication on material risk and sensitive actions. These durations are our product defaults, not an industry standard or an AAL2 compliance claim.
- Preserve the stricter staff and Owner hardware-key policy independently of consumer authentication.

## Registration and return to the product

### First screen

Use the chosen headline and supporting copy: “Ask a question and explore the arguments, evidence, and different ways to answer it.” The form contains email, phone, password, date of birth, Privacy Policy acknowledgement and Terms of Service agreement. Use a neutral email placeholder such as `you@example.com`, not an institutional address. Phone supports paste and browser autofill (`autocomplete=tel`, telephone keyboard), permits customary spaces and punctuation, and normalizes a plausible international number. An inline example explains the international prefix if it is missing. Phone changes do not alter the country availability or age decisions.

Continue enforcing the current server age check, lockout, country availability and current legal-document versions. Keep the ADULT, TERMS and PRIVACY_SHOWN evidence transactionally bound to the account. Store the adult decision and applicable rule, not the birth date. Validation, consent and age errors use the same visual language and accessible inline presentation.

Do not request a recovery email or repeat the primary email. Clear passwords after a successful generic registration acknowledgement. Do not persist passwords, birth dates or authentication tokens in local storage.

### Email waiting screen

Replace the form with a dedicated pending view after registration acknowledgement. Say “Check your inbox” and explain that the link continues account setup. Show the entered address, “Use a different email” and “Send another link.” Preserve generic outward behavior across new accounts, existing accounts and ignored resend attempts; remove technical commentary about account enumeration from product copy. A pending screen is not evidence that an account is active or that an email reached the inbox.

The resend button becomes available after 60 seconds. Enforce that interval on the server and retain an independent rolling limit of three attempts per hour per recipient/account, plus existing source abuse controls. Count the initial send in the limit; reserve the send budget atomically before sending to prevent concurrent bypass. Return generic status and a safe retry delay without exposing whether the account exists. Show a concise temporary-service message for a genuine service-wide outage. Existing valid email links remain valid until their own expiry or account activation, as the current ledger specifies.

### Email confirmation and account security

After a valid emailed link, show one focused choice: “Create a passkey” with “Use an authenticator app instead.” Explain that a passkey uses the device's normal face, fingerprint or PIN check. Successful enrollment of a user-verified passkey satisfies the security requirement. TOTP enrollment shows a QR code by default and a disclosure labelled “Use a setup key instead.” Hide the full setup key until requested. Remove implementation details about token handling and duplicate setup instructions.

Activate the account when email verification, legal/age gates and one supported secure authentication method are complete. Remove mandatory recovery-code type-back as an activation condition. Offer “Add a backup method” after setup: another passkey or a small recovery-code download action. Keep recovery codes available through secure regeneration in Account → Security; existing hashed codes cannot be redisplayed later. Recovery remains optional to configure, with a concise explanation that losing every sign-in and backup method can prevent account recovery.

Issue a normal authenticated session on successful activation and return directly to the intended safe product destination, defaulting to the debate-start screen. Do not require a redundant login. Retain validated same-origin return paths and the existing navigation protections.

## Passkey sign in and sessions

Add consumer WebAuthn registration, authentication, management and sensitive-action verification. Use a maintained verifier that supports synced and device-bound passkeys; reuse reviewed bounded browser serialization where suitable. The existing staff verifier's hardware-key constraints and strict counter behavior must not be adopted unchanged for synced consumer passkeys.

Require `userVerification=required` and verify the returned user-verification flag server-side. Bind each cryptographically random, short-lived, single-use challenge to its purpose, account where applicable, exact origin and RP ID. Registration of an additional credential requires fresh proof from an enrolled method. Store credential ID, public key, account binding, transport hints, backup flags, creation/use times and revocation state. Never store biometric data or device PINs. Treat counters according to supported authenticator semantics, including zero counters and synced credentials; retain risk detection without rejecting legitimate synced credentials solely because a counter did not increase.

Prefer discoverable credentials and passkey autofill when supported. Always provide an explicit “Sign in with a passkey” action and a usable fallback when conditional mediation is unavailable or cancelled. Cancellation is not an invalid-password error. Passkey authentication is passwordless; a successful verified assertion opens the session without an additional TOTP prompt. Password login remains available with an enrolled TOTP factor or another secure continuation, never password alone for an MFA-protected account. Existing TOTP accounts continue to work and can add a passkey from Security settings after fresh proof.

Keep sessions in Secure, HttpOnly, host-only cookies with CSRF protection, token rotation, server-side revocation and the existing support/session cleanup on logout. Apply the proposed 14-day idle and 30-day absolute limits through the published consumer session policy. Reopening the application within a valid session does not prompt again. Expiry, a new browser without a valid session, suspected session theft, recovery or sensitive changes require a fresh passkey or configured alternative. A changed IP alone is insufficient: mobile routing and VPN use can change apparent location. Synced passkeys can work on multiple devices; possession of the same credential does not prove the same physical device.

Use the existing five-minute freshness window for a bounded sensitive action, including changing sign-in or recovery methods, linking providers, deleting the account or managing high-impact payment/security settings. Preserve any stronger existing per-operation rule. Offer session review and individual/all-device logout. Do not introduce a separate seven-day trusted-browser cookie.

Do not remove the last working authentication method until a replacement is verified. Notify the verified email when security methods change. A phone profile, a normal active session or a matching email string cannot alone authorize credential replacement. Account recovery must not silently downgrade passkey protection to an unverified phone or password-only access.

## Phone data and free account abuse

The phone input is a required, self-reported profile field in this release. Validate its format and encrypt it under the account's existing data-protection model. Record the normalized value, source (`manual` or an explicitly supported provider assertion), verification status and update time. Existing accounts can continue signing in; collect a missing phone when they next request a new free debate, with an inline account-completion screen. This rollout must not revoke sessions or strand existing users during migration.

Typed phone numbers remain unverified even if correctly formatted. Do not enforce unique-number registration denial, transfer an account, reveal another account, merge identities or recover credentials through this field. Otherwise an attacker could reserve somebody else's number. Duplicate self-reported numbers may contribute to an internal abuse signal together with existing rate/usage controls, but they cannot independently deny account ownership or free eligibility. This field does not reliably establish one human per free account, and UI/help/privacy copy must not claim that it does.

Add a reviewed migration for phone profile storage and optional recovery email, adapting the pending-account creation functions, repository contracts and erasure path together. Preserve the current prohibition on unsupported WhatsApp/delivery channels; storing a profile number must not activate a phone recovery or delivery channel. Where the existing `phone_ciphertext` column is used, explicitly supersede its null-only constraint/trigger through a new migration rather than editing historical migration 0040. Erasure must remove the encrypted number and any per-account indexes. No indefinite phone-based anti-abuse retention is introduced.

A future verified-number allowance policy will require ownership proof, an atomic claim, a shared/recycled-number resolution path and a separately reviewed retention rule. It is deferred until the user selects and funds verification. Passkeys and TOTP do not incur an SMS fee, but neither proves phone ownership or one person per account.

## Social sign in

Provide configuration and integrations for Google, Apple, Facebook and X, enabled only when each provider has valid app credentials, exact callbacks and successful end-to-end tests. No account purchases, paid API activation or developer membership purchase is authorized by this design. Surface available providers cleanly; never show a button that only fails because its configuration is missing.

Use standard authorization-code flows with state, PKCE where supported, nonce and issuer/audience/expiry validation for OIDC tokens. Bind identities by provider issuer/app scope and immutable subject, not by email alone. Never automatically merge with an existing account solely on an email match; linking requires fresh authentication to that existing account. Store only the provider identity and profile fields actually needed. Do not retain broad profile access tokens when no subsequent API access is required.

Prefill editable email/name values when supplied, preserve Apple relay addresses, and keep a public pseudonym independent of the user's real name. Skip local email confirmation only for a trustworthy verified email assertion under the provider's documented semantics. Otherwise verify the entered address. Social signup asks for missing phone, age and legal acknowledgements and converges on the same account-security enrollment. Provider sign in alone does not prove our application's required fresh MFA assurance unless a deliberately supported assertion establishes it.

Ordinary Google OIDC does not provide a phone number. Google's optional People API can request the authenticated user's profile phone through `user.phonenumbers.read`, but introduces extra permission and may return no number. A documented `metadata.verified` flag is a provider assertion, with no guaranteed recent proof of possession; it must be labelled separately from our future OTP verification. Do not request that extra scope by default in this release. Apple, Facebook and X are not depended on to supply a phone. Provider prefill is opportunistic, and manual entry always works. Verify Meta's actual permission/access behavior in its developer setup before enabling Facebook.

## Consistent interface and branding

Set native form `noValidate` and implement explicit inline required/format checks with accessible field associations and focus on the first error. Use consistent field messages and a small form-level message for request failures. On login, hide valid-email ticks and signup password criteria; show malformed email feedback only when appropriate. Incorrect credentials read “Email or password are incorrect. Please try again.” Preserve generic behavior and server-detail suppression.

For TOTP login, use “Open the authenticator app you used when signing up and enter the 6-digit code.” Remove the repeated instruction. Automatically submit a completed or pasted six-digit code with guarded single-flight behavior. A rejected code does not cause an endless resubmission loop; editing or replacing it enables another attempt. Retain an accessible manual submission fallback and the separate recovery-code mode.

Expose Account, Security and Log out in the top-right menu across normal pages, Help and debate-specific headers. Reuse the existing session revocation and support transcript cleanup. Keep Active sessions. Replace “Your asker scope” with “Your account” and remove the synthetic internal account-ID rows and legacy-debate claim UI, links and help references. No legacy data is deleted.

Add English US and English UK preferences mapped to the existing English message/legal/support catalogs, while using the chosen regional locale for language tags, dates, times and date-of-birth order. Preserve acceptance hashes and normalize legal locale to the actual served document. Use a searchable language list without continent categories. Correct Help header/menu stacking and viewport placement. Replace Start Debate whole-button scale/translation with subtle colour, border or shadow feedback and preserve reduced-motion behavior.

Use Dialectical Engine for the product and dezbatere.ro for sender identity and domain references. Replace product mentions of DebateAI/DebateAIRO in UI catalogs, accessibility text, authenticator issuer, emails, help content and exported reports. Use the actual registered company name in required legal company identification; do not invent a new corporate identity or rename internal package identifiers as part of this UI work.

## Verification email and delivery

Use sender display name `dezbatere.ro` with the existing approved noreply address. Subject: “Verify your email for Dialectical Engine.” Deliver multipart plain-text and HTML alternatives with the site's cream, charcoal and gold styling, a Verify email button, a complete fallback link and a concise next-step explanation. Preserve HTTPS fragment-token transport, one-time verification semantics and safe escaping. Do not add tracking pixels or log link tokens.

Keep the existing 24-hour token lifetime. Capture the browser's validated IANA timezone and locale when registration/resend is requested. Format the fixed UTC expiry into an explicit local date/time and named zone, plus the validity duration. Example for the supplied expiry: “This link is valid for 24 hours and expires on 5 October at 10:41, Bucharest time.” An email is static; it does not recalculate if the reader travels. When timezone metadata is absent or invalid, show an explicit UTC date/time instead of guessing a city from language or IP. Expiry enforcement remains based on the server's fixed instant.

The current active preview wrapper accepts only the owned work/Gmail tester addresses, forwards both to Gmail and requires the old exact subject/plain-text MIME. The read-only investigation on 4 October confirmed that its active hash matches the local recipient guard, with a matching SENDMAIL_EXIT_1 at 15:05:42 Bucharest time. Yahoo is rejected before MTA submission. The redesigned email renderer and strict transport validator must be updated and tested together. Keep preview recipient scope explicit; sending to Yahoo or arbitrary recipients requires a separate transport/provider recipient-policy review. Test acceptance at each boundary and distinguish MTA/provider acceptance from inbox delivery.

## Implementation boundaries and verification

Primary surfaces are `apps/ui/components/SignUpFlow.tsx`, `LoginFlow.tsx`, `TopBar.tsx`, `SettingsPageClient.tsx`, `support/Assistant.tsx`, `apps/ui/app/enroll-mfa/page.tsx`, locale/catalog loaders and all `messages/*/auth.json`. Backend changes span API registration/MFA/sessions/mail, generated contracts, identity/session repositories, append-only migrations and register policies. Staff/Owner access and its deployment remain independently protected. Support knowledge and exported user-facing content must follow the revised labels/flows.

Verification must cover actual browser validation (including `requestSubmit`, not only synthetic submit events), absence of repeated-email/repeated-password/recovery signup fields, phone normalization/storage/erasure and non-unique unverified status, preservation of legal/age gates, passkey origin/RP/challenge/UV/account binding failures, replay, synced-credential semantics, factor activation/fallback/recovery, session expiry/revocation/step-up, OAuth state/PKCE/issuer checks and safe linking, generic errors, six-digit auto-submit deduplication, 60-second resend with concurrent/hourly limits, both email MIME parts and wrapper acceptance, timezone/DST formatting, every headline translation, regional English normalization, menu accessibility, Help dropdown layering and stable button text on hover.

Update tests that deliberately require old UI behavior; do not weaken preserved security assertions. Existing source tests forbid resend or mandate confirm-email/recovery type-back, and locale tests pin 35 catalog directories. English variants should share catalogs rather than invent duplicate translations. Run focused API/DB/UI/render suites and required type/build checks after implementation, then perform visual review on narrow and wide viewports. Hardware/biometric approval remains the user's real-device action; an emulator can validate protocol negatives but cannot certify real passkey UX.

Roll out through an isolated reviewed V3 release and compatible database/register ceremony. Preserve old TOTP account access and sessions during schema deployment. No deployment, provider recipient expansion, real email send, paid service activation or server mutation has been performed or authorized merely by saving this design.

## Sources for authentication and provider decisions

The following primary references were checked on 4 October 2026. Session duration is a proposed product choice; it is not presented as a duration required by these references.

- [OWASP passkey security](https://cheatsheetseries.owasp.org/cheatsheets/Passkey_Security_Cheat_Sheet.html): user verification, multiple authenticators and protected recovery.
- [OWASP multifactor authentication](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html): passkeys and risk-based repeat authentication.
- [NIST SP 800 63B 4](https://pages.nist.gov/800-63-4/sp800-63b.html): AAL2 recommends overall reauthentication within 24 hours and one hour inactivity; consumer duration here does not claim this assurance level.
- [GitHub passkeys](https://docs.github.com/en/authentication/authenticating-with-a-passkey/about-passkeys): one passkey ceremony can satisfy password and two-factor requirements.
- [Google People API get](https://developers.google.com/people/api/rest/v1/people/get), [phone field metadata](https://developers.google.com/people/api/rest/v1/people#FieldMetadata) and [scope catalog](https://developers.google.com/identity/protocols/oauth2/scopes): optional phone retrieval, permission and verification-assertion limits.
- [Apple sign in security](https://support.apple.com/guide/security/sign-in-with-apple-security-secda721bdd7/web): name/email and private relay behavior.
- [X user endpoint](https://docs.x.com/x-api/users/get-my-user): available user fields, including optional confirmed email, without a phone field.
- [Browser timezone detection](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/resolvedOptions): read the browser's system timezone for display.
- [EDPB lawful processing guidance](https://www.edpb.europa.eu/sme/be-compliant/process-personal-data-lawfully_en): document the purpose and appropriate lawful basis for mandatory profile data. Preserve the existing distinct legal acceptance records and update disclosures before release.

## Appendix A Signup headline translations

These are proposed idiomatic translations, not a claim of professional native-language review. Include them in the locale copy review; Irish and Maltese especially merit native review. English US and UK share `en` text.

| Locale | Signup headline |
|---|---|
| bg | Добрите въпроси заслужават повече от един отговор. |
| hr | Dobra pitanja zaslužuju više od jednog odgovora. |
| cs | Dobré otázky si zaslouží víc než jednu odpověď. |
| da | Gode spørgsmål fortjener mere end ét svar. |
| nl | Goede vragen verdienen meer dan één antwoord. |
| en | Good questions deserve more than one answer. |
| et | Head küsimused väärivad rohkem kui üht vastust. |
| fi | Hyvät kysymykset ansaitsevat enemmän kuin yhden vastauksen. |
| fr | Les bonnes questions méritent plus d’une réponse. |
| de | Gute Fragen verdienen mehr als eine Antwort. |
| el | Οι καλές ερωτήσεις αξίζουν περισσότερες από μία απαντήσεις. |
| hu | A jó kérdések egynél több választ érdemelnek. |
| ga | Tá níos mó ná freagra amháin tuillte ag ceisteanna maithe. |
| it | Le buone domande meritano più di una risposta. |
| lv | Labi jautājumi ir pelnījuši vairāk nekā vienu atbildi. |
| lt | Geri klausimai verti daugiau nei vieno atsakymo. |
| mt | Mistoqsijiet tajbin jistħoqqilhom aktar minn tweġiba waħda. |
| pl | Dobre pytania zasługują na więcej niż jedną odpowiedź. |
| pt | Boas perguntas merecem mais de uma resposta. |
| ro | Întrebările bune merită mai mult de un răspuns. |
| ru | Хорошие вопросы заслуживают большего, чем один ответ. |
| sk | Dobré otázky si zaslúžia viac než jednu odpoveď. |
| sl | Dobra vprašanja si zaslužijo več kot en odgovor. |
| es | Las buenas preguntas merecen más de una respuesta. |
| sv | Bra frågor förtjänar mer än ett svar. |
| uk | Хороші запитання заслуговують на більше ніж одну відповідь. |
| zh | 好问题，值得不止一个答案。 |
| hi | अच्छे सवाल एक से ज़्यादा जवाब के हक़दार हैं। |
| id | Pertanyaan yang bagus layak mendapat lebih dari satu jawaban. |
| ja | いい問いには、ひとつの答えだけでは足りない。 |
| ko | 좋은 질문에는 여러 답이 어울립니다. |
| vi | Câu hỏi hay xứng đáng có nhiều hơn một câu trả lời. |
| ar | الأسئلة الجيدة تستحق أكثر من إجابة واحدة. |
| he | שאלות טובות ראויות ליותר מתשובה אחת. |
| tr | İyi sorular birden fazla cevabı hak eder. |
