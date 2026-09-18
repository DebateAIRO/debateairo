# Security work — where we stand, in plain words

*Written 2026-09-18 for the owner, updated the same night after the merge. This is the easy-to-read companion to the technical records in this folder. Every item links to the file that holds the detail.*

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

**Two honest notes.** (1) I made one slip along the way — a test I added in the wrong place broke the compile check; I caught it on the next check and repaired it in the following commit. (2) This Mac runs Node 26, while the project pins Node 22.23.1. One measurement test times out here because of that (it does the same on untouched `dev`). Installing Node 22.23.1 on this Mac — already on your owed list — would make local results match GitHub's.

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

### 4. Your 26 decisions — see the next section

### 5. Then: the move to the new server
The deployment kit exists but was written before the support chat and the monitoring agent. It needs a refresh: their settings, a fifth master key in the backup-and-escrow list (without it, backed-up support conversations could never be decrypted), a service definition for the monitoring agent, and the step that publishes the settings register on the server (without the "usage caps" setting the API deliberately refuses to start). Three of your decisions block go-live (marked **blocks go-live** below), and I will need the server's details.

## Your decisions

**Each decision is explained in full — what it is about, my answer, the alternatives, the cost — in [DECISIONS-EXPLAINED.md](DECISIONS-EXPLAINED.md).** The technical version with exact values is [V-DECISIONS-PACKET.md](V-DECISIONS-PACKET.md). Below, the short form, grouped so you can answer quickly. Two are already ruled (V-15: the server starts empty, no sweep; V-23: Cloudflare together, at the end). You can reply "yes to all of group A" and only discuss the ones you want to.

### Group A — routine; I recommend "yes" to all thirteen

| ID | In plain words | Recommended |
|---|---|---|
| V-1 | Usage caps: 20 new debates per hour per account; 120 public page reads per 15 minutes per visitor. Beyond that the visitor is told "too many requests, try later". Protects your AI bill. | Accept the numbers (easy to change later) |
| V-12 | Same idea for "forgot my password": 3 requests per hour per e-mail address, 15 per internet address. | Accept |
| V-14 | Make "a password can be at most 1,024 characters" an official policy line instead of an unwritten limit. | Yes |
| V-13 | A database helper tool nobody used was removed because it pulled in a vulnerable package. | Accept |
| V-4 | About 12 tests were already failing before the security work began. The new automatic check fails only when a *new* test breaks; the list of old failures is written down and may only shrink. Otherwise every change would be blocked forever. | Adopt |
| V-24 | The secret scanner flagged 13 old items in the history. All 13 were looked at: none is a real secret (fingerprints, throw-away development keys, sample text). Each is recorded with its reason. | Accept |
| V-8 | A never-activated folder of "pre-push checks" that would block every push if someone turned it on. | Delete it |
| V-18 | 37 temporary exceptions to the "packages must be 7 days old" rule, each with an expiry date. Both dates (2 and 7 Sept) have now passed. | Remove them now |
| V-16 | A fine point of how answer versions are digitally sealed. Good enough today; note it for the next rewrite of that part. | Accept for now |
| V-17 | One internal description of the database was not updated with two new columns. May already be done on `dev`. | Fix during the merge |
| V-10 | Grading only: do other user accounts on your own Mac count as a threat? | No on your Mac; yes on the server |
| V-21 | Three leftovers that only affect the development setup, not the real site. | Tidy in a follow-up |
| V-25 | One memory-use test only makes sense on the Mac it was measured on; on GitHub's Linux machines it is skipped (loudly). | Measure once per platform so it runs everywhere |

### Group B — switches on your GitHub and Cloudflare accounts (only you can authorise; all reversible)

| ID | In plain words | Recommended |
|---|---|---|
| V-2 and V-6b | Turn on GitHub's protections: a private channel for reporting vulnerabilities; blocking of pushes that contain secrets; alerts and automatic fixes for vulnerable packages; code scanning; two-factor login required for everyone in the organisation; and branch rules (no force-push, no deleting `main` or `dev`, changes arrive by pull request with the security check passing). **Note:** the branch rule changes the habit of pushing straight to `dev` — you would either push through pull requests or keep an owner bypass. | Enable all, with an owner bypass at first |
| V-5 | GitHub treats `main` as the default branch, so its scanners look mostly at the old engine. Make `dev` the default so they look at the new engine. **Correction to the packet:** it suggests later "fast-forwarding `main`" to `dev` — do **not** do that. `main` is the old engine that serves the live site today, and `dev` deleted that code; merging them would delete the live site's engine. | Make `dev` the default; leave `main` alone |
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
| V-15 | Rows written *before* the encryption fix still hold readable verdict text. **My note:** if the new server starts with an empty database, there are no old rows there and this does not matter. It only matters if you plan to move existing debates across. | Tell me whether old data moves to the server | small script if yes |
| V-22 | A person who could already write to the database could plant a password record that makes the server use four times the normal memory per login check. | Tighten the accepted range | small |

## One thing this mission did not cover

All of the above is about the **new engine (V3)**. The site that is live today at dezbatere.ro runs the **old engine (V2)** from this Mac through a Cloudflare tunnel, and it was not part of this inspection. If the plan is for V3 on the new server to replace it soon, that is fine. If V2 stays live for a while, it deserves its own, smaller check-up.

## Suggested order of work

1. ~~Bring the security branch up to date with `dev`~~ — done locally on 2026-09-18; the slower test suites and the clean-up items above remain.
2. Record your answers; build the items from Group C you approve; finish the three small leftovers.
3. Re-inspect the code that arrived after 1 September.
4. Merge pull request #8 into `dev`; flip the GitHub switches from Group B.
5. Prepare and harden the new server using the deployment kit; rehearse a backup restore; go live.
