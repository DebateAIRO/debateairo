# DebateAI — Privacy Policy

<!-- legal-chrome
summaryTitle: In short
eyebrow: PRIVACY POLICY · v3.0 · EFFECTIVE [DATE]
title: What we store, and why
lede: Your rights and our obligations under the GDPR (EU) 2016/679, in plain language. Fourteen sections and Annex B — scroll to the end.
endMarker: END OF POLICY · GDPR (EU) 2016/679 · v3.0
bodyLabel: Privacy Policy text
annexTitle: Annex B — Regional privacy terms
jumps:
01 CONTROLLER
02 WHAT WE COLLECT
04 LAWFUL BASIS
05 MODELS & TRANSFERS
06 PUBLISHING
07 RETENTION
10 YOUR GDPR RIGHTS
13 COOKIES
-->

2026-09-21 · @Someone

**Draft v3.0 for counsel review — replaces the shipped v2.1 (`apps/ui/lib/privacyPolicy.ts`). Not legal advice.** This version is written to what the code actually does, and it corrects the five statements in v2.1 that the code contradicted: session data, retention periods, analytics, export, and what happens to published debates on deletion. Square brackets mark what only you can fill in; \[pending\] marks a feature the policy describes that is not yet built, which must exist before the policy is published.

**Version 3.0 · Effective \[date\] · Previous versions at dezbatere.ro/privacy/versions · Controller: DebateAIRO S.R.L., Bucharest**

**In short.** We collect what an account needs and what you choose to type. Your questions go to AI providers listed in our Register; they are not used to train models. Debates are private unless you publish them. Deleting your account destroys the keys to your data and takes your published debates down. You can reach us at privacy@dezbatere.ro, and people named in a debate can ask for removal without an account.

## 1. Who is responsible for your data

The controller of your personal data is **DebateAIRO S.R.L.**, \[address\], Bucharest, Romania, Trade Register \[J40/…\], CUI \[…\]. Write to **privacy@dezbatere.ro** for anything in this policy; we answer within one month. We have not appointed a data protection officer because the law does not require us to; this address is monitored by \[role\]. Where we have appointed a representative or a privacy officer for a particular country, Annex B names them.

## 2. What we collect and where it comes from

We collect only what an account needs to function, what you choose to give us, and what the law requires us to keep.

| Category | What, exactly | Source |
| --- | --- | --- |
| **Account** | Email address and recovery email address (stored encrypted, with a keyed index so we can find the account without reading the address); password (stored as a hash, never in clear); your two-factor authentication secret (encrypted); ten recovery codes (stored as hashes); your pseudonym; the time you confirmed you are 18 or over | You, at registration |
| **Sessions and security** | A hashed session token; a keyed hash of your browser's user-agent string, used to notice when a session moves to a different browser; timestamps of creation, last use and expiry. We do **not** store your IP address, device name or browser details with a session, and the session list you see in Settings shows only timestamps | Your browser |
| **Security audit trail** | An append-only log of security-relevant events — registration, verification, login attempts, recovery, publication, deletion. The IP address and user-agent of each event are stored only as one-way keyed digests (Argon2id), so they cannot be read back but can be matched within a period. Login and recovery risk signals are stored encrypted for 90 days | Your browser, at the time of each event |
| **Debate content** | The question you type; the steering annotations you set; the claims, critiques, evidence references, scores and verdicts the engine generates; a verbatim record of what each AI provider returned; retrieval queries and source references. All of this is stored encrypted under a key specific to your account | You, and the AI models working on your question |
| **Support** | Messages you exchange with the support assistant or a person, stored encrypted; the language used; whether you allowed the assistant to see the status (never the content) of your debates; ratings you give. If a message triggers abuse controls we keep a hash of the message and a hash of the IP address it came from | You |
| **Acceptance and consent records** | The version and content hash of the Terms you accepted and the policy you were shown; the time; the screen and mechanism used; your language; your IP address and user-agent at that moment; each consent you gave or withdrew and when | Your browser, at sign-up and whenever you change a choice |
| **Payments** \[pending — once a paid plan exists\] | Plan, price, billing period, transaction references, tax location evidence. Card details are held by our payment provider, never by us | You, and the payment provider |
| **People who are not our users** | Personal data about other people that you include in a question or that the engine generates in answering it. We ask you not to do this; section 11 explains what we do when it happens anyway | You, indirectly |

We do **not** collect analytics or telemetry about how you use the product, and we set no cookies for that purpose. If that changes, this policy and the Cookie Policy change first, and you will be asked.

## 3. Sensitive information

A debate engine invites questions about politics, religion, health, sexuality and belief. Those are special categories of data under Article 9 GDPR, and they can arrive in your questions whether or not we intend to collect them.

**About you.** When you register you give explicit consent, as a separate sentence, to our processing sensitive information you choose to include in your own questions, for the purpose of running your debates. You can withdraw it at any time by not including such information, or by deleting a debate. What you publish about yourself is data you have chosen to make public.

**About other people.** No legal condition allows us to process sensitive data about a third party you name in a question, and none of our AI providers has one either. That is why the Terms prohibit it, why we minimise what we send, and why we remove such content quickly on request — section 11.

**Health information.** Some countries treat health-related data, including inferences, under specific laws. If you live in \[the State of Washington\], a separate \[Consumer Health Data Privacy Notice\] applies.

## 4. Why we use your data, and on what basis

Each purpose has one legal basis under Article 6(1) GDPR, and we do not reuse data collected for one purpose for another.

| Purpose | Data | Basis |
| --- | --- | --- |
| Creating and running your account, authenticating you, running and storing your debates so you can reopen and replay them | Account, sessions, debate content | **Contract** — Art. 6(1)(b) |
| Sending your question and the engine's statements to AI providers to generate a debate | Debate content | **Contract** — Art. 6(1)(b) |
| Keeping the service secure, detecting abuse, letting you spot a login you did not make, keeping an audit trail | Sessions, security audit trail, support abuse hashes | **Legitimate interests** — Art. 6(1)(f): ours and yours in a secure service. You may object; section 10 |
| Proving that you accepted the Terms and gave or withdrew a consent | Acceptance and consent records | **Legal obligation** — Art. 6(1)(c), our duty to demonstrate consent under Art. 7(1) — and legitimate interests in evidencing the contract |
| Answering support requests | Support | **Contract** — Art. 6(1)(b) |
| Processing sensitive information you include about yourself | Debate content | **Explicit consent** — Art. 9(2)(a), given separately at sign-up |
| Publishing a debate you choose to publish | Debate content, pseudonym | **Contract** — Art. 6(1)(b), on your instruction; for sensitive data about you, Art. 9(2)(e) — data you have manifestly made public |
| Sending you product news | Email address | **Consent** — Art. 6(1)(a), an unticked box; withdraw any time from any email or from Settings |
| Meeting tax, accounting and legal obligations \[pending paid plans\] | Payments, acceptance records | **Legal obligation** — Art. 6(1)(c) |
| Handling legal requests, reports of illegal content, and our obligations as a hosting service | Whatever is relevant to the request | **Legal obligation** — Art. 6(1)(c) — and legitimate interests |

We do not profile you, we do not use your data for advertising, and we do not sell it. We do not use your content to train models, and we do not permit our providers to — section 5.

## 5. AI providers and international transfers

**What is sent.** To run a debate we send text to one or more external AI providers: your question, the steering annotations you set, and statements the engine composes as the debate develops. A provider therefore sees text derived from and built around what you typed. It never receives your email address, your account or session identifiers, your IP address or your payment details.

**Which providers.** They are listed in our **AI Provider Register** at \[dezbatere.ro/providers\], which is part of this policy. For each provider the Register states its legal entity and country of establishment; what it receives and for what purpose; the countries or regions where it processes; its retention terms, and whether zero-data-retention is active for the endpoint and features we use; whether it may use inputs for training under our contract; the transfer mechanism we rely on; and the date we last verified each entry. Providers may change; the Register is versioned and the change is noted there.

**Training and retention are different things.** Our contracts with providers exclude the use of your content to train or improve their models. \[Publish only once verified per route.\] Some providers keep prompts and responses for a limited period for security, abuse prevention or their own legal obligations; the Register says how long and why. Where zero-data-retention is active, the Register says so and for which features. We will not describe content as unretained when it is not.

**Transfers outside the EEA.** Providers established in the United States receive data under one of the mechanisms in Chapter V GDPR: the EU–US Data Privacy Framework where the specific contracting entity is certified for this data, or the European Commission's standard contractual clauses (Module Two, controller to processor) supported by a transfer risk assessment and supplementary measures. The Register names the mechanism for each provider. You can obtain a copy of the clauses we rely on by writing to privacy@dezbatere.ro. If a mechanism we rely on is invalidated, we switch to another before continuing transfers, and we tell you.

**Other recipients.** Our hosting provider \[Hetzner, Germany — region …\]; our content-delivery and transport provider \[Cloudflare\]; our email relay \[…\]; \[our payment provider, once a paid plan exists\]. Each acts on our documented instructions under a data-processing agreement with the safeguards Article 28 requires, and each is in the Register with its location and transfer mechanism. We do not permit any processor to use your data for its own purposes. Where a provider would do so, it is a controller in its own right, and we do not send it your data.

**Public authorities.** We disclose personal data to courts, regulators or law-enforcement authorities where the law requires it, and we tell you unless the law prevents us.

## 6. Publishing and visibility

Debates are private until you publish them. Publishing is a deliberate, separately confirmed action. A published debate shows your **pseudonym**, your question as you wrote it, the argument tree, the scores, the verdict and the confidence band, and carries a visible label that the content is AI-generated. It never shows your email address, your session records or your account history. \[Published debates are / are not\] indexed by search engines \[unless you choose\].

Unpublishing removes the debate from DebateAI and destroys the key to our public copy. Copies already made by readers, search engines or archives are outside our control, and we cannot recall them.

When you delete your account, we remove every debate you published from public access without undue delay and within 30 days at most, unless the law requires us to keep a specific item. \[Option B — a product change; see the Terms, section 9.\]

## 7. How long we keep things

| Data | How long | Then |
| --- | --- | --- |
| Account | While the account exists, plus a 7-day grace period after you ask to close it | Keys destroyed; record deleted |
| Session records | 14 days after last use, or 90 days after creation, whichever is first | Deleted |
| Email verification links | 24 hours | Deleted |
| Login and recovery risk signals | 90 days, enforced by the database | Purged |
| Security audit trail | For the life of the service | Append-only; IP and user-agent are one-way digests and cannot be read back |
| Debate content (private) | While the account exists | Keys destroyed on closure, making the content unreadable |
| Debate content (published) | While published and while the account exists | Removed from public access on unpublishing or closure; keys destroyed |
| Provider return records and retrieval references | Same as the debate they belong to | Same |
| Support conversations and cases | \[Until closed plus 12 months\] | Keys destroyed |
| Acceptance and consent records | Life of the account plus 6 years — the longest limitation period that applies to us | Deleted |
| Payment records \[pending\] | 10 years, as Romanian accounting law requires | Deleted |
| Backups \[pending\] | \[… days\] after the live copy is deleted | Overwritten |

**What deletion actually does.** Your debates and account data are encrypted under keys specific to your account and to each debate. Deleting your account destroys those keys, after which the encrypted records cannot be read by us or anyone else, and we delete your account record. We describe this as deletion because that is its effect, and we hold a documented assessment behind it; if you want to know more, ask. Three things to know: the security audit trail is append-only and is not deleted, but contains no readable identifiers of you; a small number of older debates predate our current encryption scheme, and if that applies to your account we tell you what closure achieves for them; and copies of data already sent to an AI provider are governed by that provider's retention terms in the Register, not by our deletion.

&#91;The support retention period and the backup line describe policies to implement; the system currently keeps support records indefinitely and has no backup-expiry mechanism. Do not publish figures that are not enforced.\]

## 8. Automated decisions and profiling

The scores, condition marks and verdicts in a debate are automated evaluations of **arguments, not of people**. They do not produce legal effects on you and do not similarly significantly affect you. We make no decision about you that is based solely on automated processing and has legal or similarly significant effects, and we do not profile you.

If we ever automate a decision about your account — suspending it, refusing to publish a debate — a person will review any such decision before it takes effect or on your request, you will be able to give your view, and you will be able to contest it. The Terms describe how.

## 9. Security, and what happens if something goes wrong

Passwords are hashed with Argon2id. Two-factor authentication is mandatory. Your email address, your debates, your support conversations and your authentication secrets are encrypted at rest under keys specific to your account, and the keys for published debates are held separately from the keys for private ones. Access to production data is logged. IP addresses and browser details in our security log are stored only as one-way digests.

If a personal data breach occurs, we notify the Romanian supervisory authority within 72 hours where the law requires it, and we tell you directly, without undue delay, where the breach is likely to put your rights and freedoms at high risk. Annex B lists the notification rules that apply in other regions we serve.

## 10. Your rights, and how to use them

You can exercise any of these free of charge by writing to **privacy@dezbatere.ro**, or from **Settings → Privacy** where a control exists. We answer within one month; if a request is complex we may take up to two further months and will tell you why. We may ask you to confirm your identity through your account.

| Right | What it means here |
| --- | --- |
| **Access** (Art. 15) | A copy of the personal data we hold about you, and this information. \[Pending: a JSON export from Settings. Until it exists, we compile the copy manually within the month.\] |
| **Rectification** (Art. 16) | Correct your email or recovery email from Settings. Your pseudonym cannot be changed, for the reasons in the Terms; you can close the account and open a new one |
| **Erasure** (Art. 17) | Delete a private debate at any time from the debate page. Close your account from Settings; section 7 explains exactly what that does. Ask us to remove a published debate that contains your data whether or not you are the author |
| **Restriction** (Art. 18) | Ask us to stop processing particular data while a dispute about it is resolved |
| **Objection** (Art. 21) | Object to processing based on legitimate interests — the security and audit processing in section 4 — and we stop unless we can show compelling grounds. Object to marketing at any time, and we stop |
| **Portability** (Art. 20) | Your debates and account data in a commonly used, machine-readable format. \[Pending: same export as Access.\] Non-personal content you created, such as your questions, is returned to you on request when the contract ends |
| **Withdraw consent** (Art. 7(3)) | Withdraw marketing consent from any email or from Settings; withdraw the sensitive-data consent by not including such data, or by deleting a debate. Withdrawal does not affect processing that already happened |
| **Complain** | To the Romanian supervisory authority, **ANSPDCP**, B-dul G-ral Gheorghe Magheru 28–30, Bucharest, <anspdcp@dataprotection.ro>, or to the authority in the country where you live. We would rather hear from you first |

We never charge for a request and never treat you less favourably for making one.

## 11. People named in debates who are not our users

If someone asks DebateAI a question that names you, we may hold personal data about you although you have never used the service. The Terms prohibit users from doing this, and we minimise what we send to AI providers, but it happens.

This section is the notice we owe you under Article 14 GDPR. The data is whatever the user typed and whatever the engine generated in answer; the source is that user; the purposes and legal basis are those in section 4; the recipients are the AI providers in the Register; retention follows section 7. You have every right in section 10, and in particular you can ask us to remove a published debate or a private one that contains your data, and to tell you what we hold. You do not need an account to do so. Write to **privacy@dezbatere.ro** or use the **Report** control on any published debate, and we act on substantiated requests without undue delay. We cannot notify you individually when this happens, because we do not know who you are or how to reach you; this public notice, and the removal route, are the measures we take instead.

The same applies to sensitive information about you — politics, health, religion — that appears in someone else's question. No legal condition allows us to keep processing it once you object, and we will not.

## 12. Children

DebateAI is for adults. You confirm that you are 18 or over when you register, and we do not knowingly process the data of anyone under 18. If we learn that an account belongs to someone under 18, we close it and delete the data as section 7 describes. Some countries treat a confirmation as insufficient or require more; Annex B says what applies where, and the Terms explain what we do about it.

## 13. Cookies

We set two cookies, both strictly necessary: one that keeps you signed in, and one that protects forms against forgery. We set no analytics, advertising or tracking cookies. The **Cookie Policy** at \[dezbatere.ro/cookies\] lists them with their durations, explains how your choice is stored, and will change before any other cookie is added. Where the law of your region treats some cookies differently — for example the United Kingdom's opt-out rule for analytics — the Cookie Policy says so.

## 14. Changes to this policy

When we change this policy we post the new version with a summary of what changed and a new effective date, and keep the previous versions at \[dezbatere.ro/privacy/versions\]. For a change that adds a new purpose or a new recipient we tell you before the new processing starts, by email and in the product, and give you time to object. Where a new purpose depends on your consent — for example if we ever wanted to use content to improve models — we ask for that consent separately and specifically; we never treat acceptance of updated Terms as consent to new processing. For clarifications that change nothing about what we do, we simply post the new version.

This policy was last updated on \[date\]. Version 3.0 replaced version 2.1, which described session data, retention periods, analytics, export and the effect of deletion on published debates in ways that no longer reflected the service.

## Annex B — Regional privacy terms

Each entry applies only if its region is listed in section 2 of the Terms, and states only what differs from the body of this policy.

### B.1 European Union and European Economic Area

The body of this policy is written for you. The supervisory authority for us is the Romanian **ANSPDCP**; you may also complain to the authority in the country where you live. Romanian users: this policy is available in Romanian at \[URL\].

### B.2 United Kingdom *(only if listed)*

Our representative in the UK under Article 27 UK GDPR is **\[name, address, email\]**; you may contact them about anything in this policy. The supervisory authority is the **Information Commissioner's Office**, [ico.org.uk](https://ico.org.uk). You can complain to us using the form at \[URL\] and we acknowledge within 30 days. Transfers of your data from the UK to AI providers in the United States rest on \[the UK Extension to the EU–US Data Privacy Framework, where the provider is certified / the UK International Data Transfer Addendum to the EU standard contractual clauses\], supported by a transfer risk assessment. Analytics cookies, if we ever set them, would be subject to an opt-out rather than consent in the UK; today we set none. If you are under 18 and reach the service despite our age rule, the standards of the ICO's Children's Code apply to how we treat your data.

### B.3 United States *(only if listed)*

**Notice at collection.** The table in section 2 lists each category of personal information we collect, its purpose, and how long we keep it (section 7). We collect these categories of *sensitive* personal information only where you include them in your own questions: \[health, religious or philosophical beliefs, sexual orientation, union membership, political views\], and we use them only to run your debates. **We do not sell or share personal information, and have not done so in the preceding twelve months.** We do not use sensitive personal information for any purpose beyond providing the service you request. **Opt-out preference signals:** we honour Global Privacy Control signals as a request to opt out of sale or sharing, which we do not do in any event. **Your rights:** to know, to delete, to correct, to opt out, to limit use of sensitive personal information, and not to be discriminated against for exercising them; make a request at privacy@dezbatere.ro or \[toll-free number / form\]. **Financial incentives:** we offer none; the free and paid plans do not differ in how we treat your data. **Retention** is in section 7. This notice is updated at least every twelve months; last updated \[date\].

*Washington:* our **Consumer Health Data Privacy Notice** at \[URL\] is a separate document that applies to any health-related information, including inferences. *Texas and Nebraska:* we do not sell sensitive personal data; if that ever changed, we would obtain your consent first \[statutory language\]. *Colorado, Connecticut, Virginia and other states with comprehensive privacy laws:* the rights above apply to you where the law applies to us; appeal a refused request by writing to \[appeals@dezbatere.ro\].

### B.4 Canada and Quebec *(only if listed)*

Our privacy officer is **\[name, email\]**. We remain accountable for personal information we transfer to AI providers outside Canada, and use contracts to require comparable protection; those providers may be subject to the laws of the countries where they operate, including lawful access by authorities. Marketing email is sent only with your express consent under CASL. **Quebec:** before communicating personal information outside Quebec we conduct a privacy impact assessment; the settings that keep your debates private are on by default; you may ask us to de-index or cease disseminating personal information about you; you may request your data in a structured, commonly used format; section 8 describes our automated processing.

### B.5 Australia and New Zealand *(only if listed)*

**Australia.** Overseas recipients of your personal information are the AI providers and processors listed in the Register, located in \[the United States and the European Union\]; we take reasonable steps to ensure they handle it in accordance with the Australian Privacy Principles. **Automated decisions:** from 10 December 2026 this policy identifies the kinds of decisions made by computer programs that significantly affect your rights or interests — there are none; scores and verdicts concern arguments, not you — and the personal information used in them. Complaints may be made to the **Office of the Australian Information Commissioner**. **New Zealand.** Our privacy officer is \[name\]. Where we collect personal information about you indirectly — because another user included it in a question — this policy and section 11 are the notice we give. We disclose to the AI providers in the Register as our agents, under contracts requiring comparable safeguards. Complaints may be made to the **Office of the Privacy Commissioner**.

### B.6 Latin America *(Spanish-language annex; only if listed)*

&#91;Published in Spanish.\] Consent is the basis for processing where no contract necessity exists. ARCO rights — access, rectification, cancellation, opposition — may be exercised at privacy@dezbatere.ro with responses within \[per country\]. *Mexico:* the full *aviso de privacidad* with its mandatory elements is at \[URL\]. *Argentina:* \[AAIP mandatory legend\]; the data is registered with \[…\]. *Colombia:* our *política de tratamiento de datos* is at \[URL\]; the authority is the SIC. *Chile* (from 1 December 2026): the Agency's contact is \[…\]; section 8 explains our automated processing.

### B.7 Gulf — UAE and Saudi Arabia *(only if listed)*

Where we process your data for purposes other than providing the service, we rely on your consent, which you may withdraw. Your data leaves the \[UAE / Kingdom of Saudi Arabia\] and is processed in the European Union and the United States under \[SDAIA standard contractual clauses / the mechanism in the Register\]. Marketing is sent only with your consent. Do not include sensitive personal data in your questions.

### B.8 Asia-Pacific *(only the lines for regions listed)*

*Singapore:* our Data Protection Officer is **\[name, email\]**; transfers rest on contractual obligations giving comparable protection to the PDPA; we notify the PDPC of notifiable breaches within 3 days. *Japan:* we use your personal information for the purposes in section 4 and no others; your content is transferred to providers in \[named countries — e.g. the United States\], whose privacy regimes and safeguards are described in the Register, and you consent to this at sign-up. *South Korea:* our Privacy Officer is **\[name\]**; the items, destination, timing, recipient, purpose and retention of overseas transfers are in the Register; political opinions in your questions are sensitive information and we process them only to run your debates; consents to optional processing are collected separately. *India* (once the DPDP rules apply): the standalone consent notice at \[URL\] applies; requests are answered within 90 days; users under 18 require verifiable parental consent. *Philippines:* our DPO is \[name\]; complaints may be lodged with the National Privacy Commission; section 8 describes automated processing. *Thailand:* our representative is \[name\] \[if appointed\].

### B.9 Reserved

Turkey, Brazil and Indonesia each require a local-language notice, a representative or registration, and filings, and are not drafted here. China, Vietnam and Russia are not served.
