# Security work — where we stand, in plain words

*Written 2026-09-18 for the owner. **Last updated: 21 September 2026, late evening.** This is the easy-to-read companion to the technical records in this folder. Every item links to the file that holds the detail. The newest news is in the first section; the dated sections below it are the history.*

## Right now — 21 September, late evening

**A new AI session took over today**, starting from the handoff note ([HANDOFF-PROMPT.md](HANDOFF-PROMPT.md)). Before doing anything it checked that the state matches the note:

| Checked | Result |
|---|---|
| The work branch | `security/dev-sync-2026-09-18`, clean, **nothing pushed anywhere** |
| This Mac's Node version (Node is the program that runs the code) | 26.8.2 — exactly what `dev` now requires |
| `dev`, the main V3 line | has moved on by 36 commits since this branch last absorbed it |

### Your decisions — progress

We are going through them together, one at a time. Each answer is written into [V-DECISIONS-PACKET.md](V-DECISIONS-PACKET.md) the moment you give it, so an interruption loses nothing. The plain-language explanation of every decision is [DECISIONS-EXPLAINED.md](DECISIONS-EXPLAINED.md).

| Group | What is in it | Answered |
|---|---|---|
| Ruled on 18 Sept | V-15 (the server starts with an empty database) and V-23 (we look at the Cloudflare integration together, at the end) | 2 of 2 |
| A — routine | thirteen small ones | **13 of 13 — all "yes", 21 Sept** |
| B — switches on your GitHub account | Nine short questions: which branch GitHub watches (**answered**); a private channel for reporting holes; automatic fix pull requests; blocking pushes that contain secrets; the code scanner's four notes; pinned automation scripts; two-factor login for everyone; branch rules; the 527 MB of recordings in the repository | 1 of 9 |
| C — real choices that add work | changing the master key; two server accounts sharing one key folder; the GPU settings; **how the server reaches the AI models**; and three more | 0 of 7 |
| D — new, from the re-check | support chat on account deletion; a money ceiling per debate; the monitoring agent's permissions; how the support chat reaches the model | 0 of 4 |

(The numbering has no "V-27" — it was skipped. The thirty are V-1 to V-30 without 27, plus one called V-6b.)

**The bigger picture you confirmed on 21 September — how V3 reaches `main`.** `main` is where the site is going. V3, including all the security work, is proven on `dev` first. Then it reaches `main` as **one deliberate release-day step that you approve**, with a permanent bookmark placed on the old engine's last state first, so the demo can always be brought back. It is never a routine merge and never something an AI does on its own — because `dev` is not "`main` plus new work": the old engine's files are deleted on `dev`, and a trial merge showed 38 conflicts. Until that day, GitHub's "default branch" label (which only decides where GitHub's security features look — it moves no code) sits on `dev`; on release day it moves back to `main`. That is your ruling on V-5.

**One recommendation changed before you ruled on it — V-25, the memory test.** One test measures how much memory the login limiter uses during a flood and compares it with a number measured once, on one laptop, under Node 22. The old advice was "install Node 22 on this Mac". That stopped making sense when the project itself moved to Node 26. What you approved instead: measure again under Node 26 — once on this Mac, once on GitHub's Linux machines — and record each number as a *new version* of the setting. The old Node 22 number stays as history; a sealed value is never edited, only superseded.

### What is owed before anything can be merged: a second bringing-up-to-date with `dev`

The other workstream finished on 21 September. It moved the whole project to a newer Node and a newer test tool, and it deliberately did not take this security branch in. So three settings now disagree, and they need judgement rather than a mechanical merge:

| Setting | This branch | `dev` now | What I will do |
|---|---|---|---|
| Node | 22.23.1 | 26.8.2 or newer | take `dev`'s — it was their deliberate decision |
| vitest (the test tool) | 4.1.11 | 5.0.1 | take `dev`'s, then re-check that the old vitest advisory is really gone |
| fastify (the web-server library) | 5.12.1 — the security fix | 5.11.2 — the version with known advisories | **keep this branch's**, or the known holes come back |

### Order of work from here

1. Finish your decisions (in progress).
2. The second bringing-up-to-date with `dev`, then re-run every check.
3. The remaining fix packages, plus whatever you approve in Groups C and D.
4. Update pull request #8 — only when you say "push".
5. The GitHub switches — only when you say "go" for each one.
6. The new server.

## The one-paragraph version

On 1–2 September a full security check-up of the new engine (V3) was done: seven parallel reviews found about 84 weak spots (2 serious, 25 medium, the rest small). Fixes for almost all of them were written and tested — but they were parked on a side branch waiting for your answers to 26 questions, and they were **never merged into the main V3 line (`dev`)**. Since then `dev` moved on by 656 commits. So today the main line still has the weak spots, the fixes sit on the side, and the side branch has fallen out of date. Nothing is lost; it needs to be brought up to date, your answers recorded, and then merged. **Update, 18 September:** the bringing-up-to-date is done, locally and unpushed — see "What was done on 18 September" below.

## The two branches

| Branch | Last change | Size | Status |
|---|---|---|---|
| `security/2026-09-01-hardening` | 2 Sept, 15:34 | 130 commits, 184 files | **The newer one. This is where the work is.** Open as pull request #8 on GitHub, never merged. Holds the 26 questions. |
| `security/handoff-b21-serve-answer` | 2 Sept, 07:45 | 1 commit | **Finished.** A single fix that was handed to the other workstream because it touched their files. It is already inside `dev`. Nothing left to do here. |

Both are now on this Mac. The big one is checked out in its own folder so the live-site checkout is never touched.

## What was already fixed (on the side branch)

Think of it as a house inspection followed by repairs. The repairs done, by room:

- **Front door (the website edge):** stricter browser rules so injected scripts cannot run; a size limit on uploads; connections that hang are now closed; the server no longer advertises what software it runs.
- **Reception desk (the API):** a cap on how many debates one account can start per hour — before this, one account could run up an unlimited AI bill (this was one of the two serious findings); limits on anonymous page reads and on "forgot password" requests; error messages no longer reveal internal details.
- **The safe (encryption and keys):** key files are checked much more strictly before use; keys are wiped from memory on shutdown; different secrets can no longer be accidentally shared between purposes. The verdict text of private debates is now encrypted too (the second serious finding — this is the fix already in `dev`).
- **The database:** 78 history tables can no longer be wiped with a single command; 32 sensitive database functions are no longer callable by everyone.
- **Supplies (third-party packages):** all known-vulnerable packages updated; new packages must be at least 7 days old before they can be installed (protects against freshly poisoned releases).
- **The alarm system (automatic checks on GitHub):** every change is now type-checked, tested, scanned for leaked secrets and for vulnerable packages. This did not exist at all before.
- **The new server (deployment kit):** ready-made, hardened configuration for the future server — web server with HTTPS, locked-down services, hardened database, encrypted backups with a restore rehearsal, and a step-by-step runbook. See [deploy/vps/README.md](../../../deploy/vps/README.md).

Full list of findings and what happened to each: [findings/CONSOLIDATED.md](findings/CONSOLIDATED.md). Test evidence: [VERIFICATION.md](VERIFICATION.md).

## What was done on 18 September

**The security branch is now up to date with `dev`, on this Mac, and nothing has been pushed.** All of it sits on a local work branch called `security/dev-sync-2026-09-18`, so the published branch and pull request #8 are exactly as they were until you say "push".

| Step | In plain words | Proof |
|---|---|---|
| The merge | The 656 newer commits from `dev` were combined with the 130 security commits. 25 files needed combining by hand (38 spots). The rule I followed: keep what *both* sides meant; a security protection never gives way to a tidy-up — it gets re-fitted inside the tidied code. | The whole codebase compiles with zero errors. Of 3,700+ fast tests, every test that fails on the merged code *also fails on untouched `dev`* — none is caused by the merge. |
| A hidden mistake found and fixed | The old security work had itself broken one of the project's own building rules (a small checking tool is supposed to stay independent of everything else; the security fix made it depend on a big module). Nobody saw it because that test was parked on the "known failures" list. Fixed properly, and the test is off the list. | Failing test first, then the fix. |
| One of the three "never built" fixes | The sorting bug (items could appear in a different order on computers with different language settings). | Proven both ways: fails without the fix, passes with it. |
| A gap in `dev`'s newer code | The new monitoring agent would have accepted an unencrypted connection to a remote database in production. Every other part of the system refuses that; now this one does too. | Failing test first, then the fix. |
| The "known failures" list | Cleaned: 9 of its 12 old entries are gone because those tests pass now. 9 failures inherited from `dev` (mostly visual-design checks owned by the UI work) were added, each with a written source. The list may only shrink from here. | The automatic check reports zero stale entries. |
| Server kit | The database access list for the future server now includes the three new logins `dev` introduced (support chat ×2, monitoring agent). | The kit's test passes. |

Eight local commits of work, from `6fb99707` (the merge) to `979e009f`, plus the update of these two documents. The technical record of every decision is [DEV-SYNC-2026-09-18.md](DEV-SYNC-2026-09-18.md).

**Two honest notes.** (1) I made one slip along the way — a test I added in the wrong place broke the compile check; I caught it on the next check and repaired it in the following commit. (2) This Mac runs Node 26, while the project pins Node 22.23.1. One measurement test times out here because of that (it does the same on untouched `dev`). Installing Node 22.23.1 on this Mac — already on your owed list — would make local results match GitHub's. *(Superseded on 21 September: the project itself has since moved to Node 26, and this Mac now runs exactly that. Nothing to install. See "Right now" at the top.)*

## What was done on 19 September — the re-check, and what it found

**The 656 newer commits have now been security-checked.** Seven reviewers, one per area, went through everything that changed since the September inspection.

**The headline: no critical or high-severity holes.** 58 findings — 0 critical, 0 high, 19 medium, 30 low, 9 informational. Nothing lets an anonymous visitor reach your identity data, your keys, another person's private debates, or unlimited spending.

The medium findings fall into three groups: the support chat (it can be starved or made to reveal internal settings), the monitoring agent (it trusted its own configuration too far), and protections that were written as fixed lists and had quietly fallen behind the newer code.

### The three most interesting things they found

1. **Two of the security fixes tripped over each other.** Every page drawn on the server told the system it was coming *from* the server, so the "120 page reads per visitor" limit collapsed into one bucket shared by everyone. About 120 anonymous page loads would have made every public debate page fail for all visitors at once. Fixed.
2. **The "delete my support conversation" command could never have worked.** It asks the database for a kind of lock its own login isn't permitted to take, so the database refuses it. It has been broken since it was written, and it is the *only* erasure path for support conversations. The lock is fixed; whether account deletion should also trigger it is your decision (V-26).
3. **Twelve newer tools ignored the movable key folder.** The September work made the key folder movable so keys need never sit in a cloud-synced directory. Everything written afterwards went back to assuming the old location — including a command that *writes* the monitoring agent's database password and token there. All twelve now ask properly, and the guard that should have caught them no longer walks a hand-written list of eight files: it now discovers every source file in the project, so this cannot happen quietly again.

### Fixed since yesterday

Each one with a failing test written first, then the fix, then the test passing:

| What | Why it mattered |
|---|---|
| The shared-bucket bug | Public pages could be knocked out for everyone |
| Model text escaping into the job system | Fragments of private debates reached a store outside the encryption boundary, and the server log, on every routine parsing failure |
| The spending ceiling now checked before every retry | The hook existed since September and was never connected |
| Support chat: six fixes | Junk web addresses no longer look like server crashes; a clock adjustment no longer freezes support for everyone until a restart; the public status page no longer publishes your AI model's identity, every rate limit and your daily spend; oversized messages are refused before any work; support links now expire and are tied to their owner |
| Monitoring agent: three fixes | It would send your job-system token to any address its configuration named; its alert emails were broken by the merge and put the recipient back on the command line; its launcher now proves what it is about to run is a real program — the exact lesson from the 17 September incident |
| Database: guards for 20 new tables | Newer tables could be emptied by one command, including the one that records erasures |
| Dependency alarms: 14 → 0 | The automatic security check would have failed as-is |
| The secret scanner sees three whole directories again | It was blind to exactly where AI agents paste command output |
| A sorting bug in the server-setup check | The first database login containing a digit would have made the production check fail — on a correct database — right when you provision the server |

### Two honest notes

- **One correction to a reviewer's own advice.** It recommended a package version published two days earlier, which would have broken your own "packages must be a week old" rule. I used the 31-day-old version that fixes the same problems with no exception needed.
- **I can't run the secret scanner here.** It isn't installed, and I won't download and run an unverified program on this Mac — that is the rule we set after the September incident. My own sweep of all 5,362 files in those directories found three known test fixtures and nothing live; the real proof is the scanner's own run on the pull request.

## Where the work stands at the end of 19 September

**Every repair that did not need a decision from you is done.** Fifty commits, all on this Mac, nothing sent anywhere.

| Check | Result |
|---|---|
| The whole codebase compiles | 0 errors |
| The automatic test gate | 1 failure — a memory measurement that only works on the Node version the project pins; it fails the same way on untouched `dev`, and GitHub skips it |
| Known-vulnerable packages | none (was 14) |
| The website builds for production | yes |
| The website's security smoke test | passes |
| The website's own test suite | 130 of 130 |
| A real browser, with the strict rules on | no violations on the landing page, cookie banner, consent panel or support widget |

### One thing I checked by hand rather than trusting a test

The support chat used to keep its access token in the browser's session storage, where it survived logout — on a shared computer the next person inherited the previous person's support conversation. After the fix I opened the site in a browser and read what is actually stored: four fields, **not one token-shaped string in it**. The token now lives only in memory.

### A change you will notice

Because the token is no longer stored, **closing the small support window ends that conversation's session**. The text you can see stays on screen; sending a new message starts a fresh session. That is the deliberate trade for not leaving a key lying around in a shared browser — worth knowing before someone reports it as a bug.

### A failing test that is wrong about the product

One test claims the support button doesn't open with the Enter key. The product is fine: a real browser presses a button with Enter automatically, and the test's simulated key press doesn't reproduce that in its fake browser. The file the test covers was not touched by any of this work. I've recorded it so nobody "fixes" working code to satisfy a broken test.

## What is still open

### 1. Finish the quiet clean-up after the merge (no decision needed)
- **13 spots in `dev`'s newer tools still assume the old location of the key folder.** The security work made that folder movable, precisely so keys never end up in a cloud-synced directory. The support command-line tools and the monitoring agent were written later and ignore that; with the safety setting on, they would look in the wrong place — or write a secret into the synced folder. Mechanical to fix.
- **Two small proxy hardening items** from the original plan (findings L3-F6, L3-F7) and the **tamper check on database upgrade files** (task B28).
- **Tables created after the inspection have no wipe-protection.** The security work protected 78 history tables against being emptied by a single command, from a fixed list. Tables added since are not on it. Needs one more database step, and a test that *discovers* such tables instead of listing them.
- **The slower test suites** (those needing a real database and a browser) still have to be run on the merged code, and the website needs a browser pass to confirm the strict browser rules do not block the new cookie banner and support widget. (A first reading of their code found nothing that would be blocked.)

### 2. New code nobody has security-checked yet — now with a clear first target
The 656 new commits arrived after the inspection. The biggest piece by far is the **support chat**: about 5,400 lines, ten web addresses that *anyone on the internet* can call without logging in, which pass visitors' text to an AI model and store the conversation encrypted under its own master key. It was built carefully (its key handling already meets the strict standard), but it has never had a security review, and "anonymous visitor → paid AI model" is exactly the kind of door the first inspection flagged as serious elsewhere. Then: the monitoring agent, the algorithm changes, eight database upgrades.

### 3. GitHub's own scanner left four notes on pull request #8
Three are marked "high: missing rate limiting" on login, e-mail verification and the MFA code check. The audit's own table shows all three **are** rate-limited — by the project's built-in limiter, which the scanner cannot recognise. They are false alarms and should be dismissed on GitHub with that reason written down (that changes something on GitHub, so it waits for your OK). The fourth is a loose text pattern in a test file — trivial to tidy.

### 4. Your 30 decisions (26 from the first check, 4 from the re-check) — see "Your decisions" below, and the progress table at the top

### 5. Then: the move to the new server
The deployment kit exists but was written before the support chat and the monitoring agent. It needs a refresh: their settings, a fifth master key in the backup-and-escrow list (without it, backed-up support conversations could never be decrypted), a service definition for the monitoring agent, and the step that publishes the settings register on the server (without the "usage caps" setting the API deliberately refuses to start). Three of your decisions block go-live (marked **blocks go-live** below), and I will need the server's details.

## Your decisions

**Each decision is explained in full — what it is about, my answer, the alternatives, the cost — in [DECISIONS-EXPLAINED.md](DECISIONS-EXPLAINED.md).** The technical version with exact values is [V-DECISIONS-PACKET.md](V-DECISIONS-PACKET.md). Below, the short form, by group. Two were ruled on 18 September (V-15: the server starts empty, no sweep; V-23: Cloudflare together, at the end). Progress is tracked in the table at the top of this file.

### Group A — routine — **all thirteen answered "yes" on 21 September**

| ID | In plain words | Recommended |
|---|---|---|
| V-1 | Usage caps: 20 new debates per hour per account; 120 public page reads per 15 minutes per visitor. Beyond that the visitor is told "too many requests, try later". Protects your AI bill. | Accept the numbers (easy to change later) |
| V-12 | Same idea for "forgot my password": 3 requests per hour per e-mail address, 15 per internet address. | Accept |
| V-14 | Make "a password can be at most 1,024 characters" an official policy line instead of an unwritten limit. | Yes |
| V-13 | A database helper tool nobody used was removed because it pulled in a vulnerable package. | Accept |
| V-4 | About 12 tests were already failing before the security work began. The new automatic check fails only when a *new* test breaks; the list of old failures is written down and may only shrink. Otherwise every change would be blocked forever. | Adopt — plus: a listed test that passes three runs in a row makes the check fail until its entry is deleted, so a stale entry cannot hide a real problem |
| V-24 | The secret scanner flagged 13 old items in the history. All 13 were looked at: none is a real secret (fingerprints, throw-away development keys, sample text). Each is recorded with its reason. | Accept |
| V-8 | A never-activated folder of "pre-push checks" that would block every push if someone turned it on. | Delete it |
| V-18 | 37 temporary exceptions to the "packages must be 7 days old" rule, each with an expiry date. Both dates (2 and 7 Sept) have now passed. Checked 21 Sept: all 37 are still in the file, plus 3 newer ones with no expiry note. | Remove the 37 now; remove each of the 3 newer ones once it is confirmed to be over 7 days old |
| V-16 | A fine point of how answer versions are digitally sealed. Good enough today; note it for the next rewrite of that part. | Accept for now |
| V-17 | One internal description of the database was not updated with two new columns. Checked 21 Sept: still missing. | Update it, with a test that compares it against the real database so it cannot drift again |
| V-10 | Grading only: do other user accounts on your own Mac count as a threat? | No on your Mac; yes on the server |
| V-21 | Three leftovers that only affect the development setup, not the real site. | Tidy in a follow-up |
| V-25 | One memory-use test only makes sense on the Mac *and the Node version* it was measured on; on GitHub's Linux machines it is skipped (loudly). | **Changed on 21 Sept, then approved:** measure again under Node 26, once per platform, each as a new version of the setting. No Node 22 install. See "Right now" at the top |

### Group B — switches on your GitHub and Cloudflare accounts (only you can authorise; all reversible)

| ID | In plain words | Recommended |
|---|---|---|
| V-2 and V-6b | Turn on GitHub's protections: a private channel for reporting vulnerabilities; blocking of pushes that contain secrets; alerts and automatic fixes for vulnerable packages; code scanning; two-factor login required for everyone in the organisation; and branch rules (no force-push, no deleting `main` or `dev`, changes arrive by pull request with the security check passing). **Note:** the branch rule changes the habit of pushing straight to `dev` — you would either push through pull requests or keep an owner bypass. | Enable all, with an owner bypass at first |
| V-5 | GitHub treats `main` as the default branch, so its scanners look mostly at the old engine. Make `dev` the default so they look at the new engine. **Correction to the packet:** it suggests later "fast-forwarding `main`" to `dev` — do **not** do that. `main` is the old engine that serves the live site today, and `dev` deleted that code; merging them would delete the live site's engine. | **Ruled 21 Sept:** move the label to `dev` as a temporary step (after pull request #8 merges), and back to `main` on release day. V3 reaches `main` as one deliberate release-day step you approve, with the old engine bookmarked first — see "Right now" at the top |
| V-23 | A Cloudflare integration called "dezbatere" tries to build the site on every push and fails every time. Nobody checked what it builds or which secrets it holds. Someone has to look at it in the Cloudflare dashboard. | Look at it together; remove it if it is a leftover from the old web app |
| V-7 | The public repository carries about 527 MB of test recordings and AI chat transcripts. | Stop tracking those file types going forward (old history keeps them; you already ruled that the history is not sensitive) |

### Group C — real choices that add work

| ID | In plain words | Recommended | Cost |
|---|---|---|---|
| V-3 | **Changing the master key.** Today, if the master encryption key ever leaked, there is no way to replace it — like a building whose lock can never be changed. | Build the ability now, before real users | about half a day |
| V-19 — **blocks go-live** | On the server, the website's API and the debate runner should run as two separate system accounts, so breaking into one does not hand over the other. But both must read one shared key folder, and the code insists the keys belong to exactly one account. Option 1: teach the code a "shared group" mode. Option 2: run both as one account (simpler, but one break-in exposes everything). | Option 1 | about half a day |
| V-20 — **blocks go-live** | The runner refuses to start unless settings for a local GPU model server are present — the new server will not have one. | Make those settings optional | small |
| V-9 — **blocks go-live** | The shape of production: (a) the database installed directly on the server rather than inside Docker — the deployment kit already assumes this; (b) no admin dashboard for the job system exposed in production; (c) **the big one: how will the server reach the AI models?** In development the engine talks to them through command-line tools logged in with personal subscriptions — that is development-only code. A server needs a proper path (for example paid API keys), and that choice decides where those keys live and how spending is capped. | (a) yes, (b) yes, (c) needs a conversation | (c) depends on the answer |
| V-11 | Seven findings in the part that talks to the AI models. The main one: a model's answer is pasted as-is into the next model's instructions, so an answer containing "ignore your instructions and…" could steer the next model. They were meant to be handed to the other workstream because it was rewriting those files; its records show no sign they were picked up. That workstream is finished now, so the files are stable. | Do them here, as the next work package after the merge | 1–2 days |
| V-6 | After the verdict text was encrypted, four more tables still hold pieces of debate text in readable form (progress events, per-segment results and two others). | Encrypt them too, same method | about a day |
| V-15 — **ruled 18 Sept** | Rows written *before* the encryption fix still hold readable verdict text. You ruled: existing debates are development data and do not move; the new server starts with an empty database. | Nothing to do. If data is ever moved later, the clean-up script runs first | none |
| V-22 | A person who could already write to the database could plant a password record that makes the server use four times the normal memory per login check. | Tighten the accepted range | small |

### Group D — four new decisions from the 19 September re-check

| ID | In plain words | Recommended | Cost |
|---|---|---|---|
| V-26 | When someone deletes their account, their support-chat conversation stays behind. (The only command that could erase it had never worked; that part is now fixed.) | Make account deletion erase the support conversation too — one deletion, everything gone | small |
| V-28 | Your cap limits *how many* debates start, not what one debate can *cost*. Worst case measured: up to 2,748 AI calls for one deep debate. Like a phone plan that limits the number of calls but not their length. | Before any paid AI key is configured, set a per-debate ceiling in tokens or in money | half a day, plus your choice of the number |
| V-29 | The monitoring agent's database login can read the text of every query on the server, though it only ever runs one narrow query of its own. | Give it exactly the permissions that one query needs | small |
| V-30 | The support chat reaches the AI model through the development command-line tools, which expose the visitor's message to other accounts on the same machine. Harmless on your single-user Macs; a real leak on a shared server. | Rule that those tools are development-only and never run on the server (ties into V-9) | none in development |

## One thing this mission did not cover

**Ruled on 18 September:** the old engine gets no separate check-up, because V3 on the new server replaces it. The paragraph below is kept as the record of what was asked.

All of the above is about the **new engine (V3)**. The site that is live today at dezbatere.ro runs the **old engine (V2)** from this Mac through a Cloudflare tunnel, and it was not part of this inspection. If the plan is for V3 on the new server to replace it soon, that is fine. If V2 stays live for a while, it deserves its own, smaller check-up.

## Suggested order of work

1. ~~Bring the security branch up to date with `dev`~~ — done locally on 2026-09-18; the slower test suites and the clean-up items above remain.
2. Record your answers; build the items from Group C you approve; finish the three small leftovers.
3. Re-inspect the code that arrived after 1 September.
4. Merge pull request #8 into `dev`; flip the GitHub switches from Group B.
5. Prepare and harden the new server using the deployment kit; rehearse a backup restore; go live.
