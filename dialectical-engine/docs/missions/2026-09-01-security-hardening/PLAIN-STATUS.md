# Security work — where we stand, in plain words

*Written 2026-09-18 for the owner. This is the easy-to-read companion to the technical records in this folder. Every item links to the file that holds the detail.*

## The one-paragraph version

On 1–2 September a full security check-up of the new engine (V3) was done: seven parallel reviews found about 84 weak spots (2 serious, 25 medium, the rest small). Fixes for almost all of them were written and tested — but they were parked on a side branch waiting for your answers to 26 questions, and they were **never merged into the main V3 line (`dev`)**. Since then `dev` moved on by 656 commits. So today the main line still has the weak spots, the fixes sit on the side, and the side branch has fallen out of date. Nothing is lost; it needs to be brought up to date, your answers recorded, and then merged.

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

## What is still open

### 1. Bring the side branch up to date (no decision needed — just work)
`dev` gained 656 commits since the security branch split off. A trial merge shows 25 files where both sides changed the same place and a person has to combine them by hand — including the core files of the API and the runner. After combining, every test has to be run again.

### 2. Three small planned fixes that never got built
- Two small hardening items on the website's internal proxy (findings L3-F6 and L3-F7).
- A sorting bug that can order things differently depending on the computer's language setting (task B30).
- A tamper check on database upgrade files (task B28, deliberately postponed until after the merge).

### 3. New code nobody has security-checked yet
The 656 new commits on `dev` (the observation module, the support widget, the algorithm work, eight new database upgrades) arrived *after* the inspection. To be "as secure as possible", the same seven reviews should be re-run on just what changed.

### 4. GitHub's own scanner left four notes on pull request #8
Three are marked "high: missing rate limiting" on login, e-mail verification and the MFA code check. The audit's own table shows all three **are** rate-limited — by the project's built-in limiter, which the scanner cannot recognise. They are false alarms and should be dismissed on GitHub with that reason written down. The fourth is a loose text pattern in a test file — trivial to tidy.

### 5. Your 26 decisions — see the next section

### 6. Then: the move to the new server
The deployment kit exists, but three of your decisions block go-live (marked **blocks go-live** below), and I will need the server's details.

## Your decisions

The technical version with exact values is [V-DECISIONS-PACKET.md](V-DECISIONS-PACKET.md). Here they are in plain words, grouped so you can answer quickly. You can reply "yes to all of group A" and only discuss the ones you want to.

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

1. Bring the security branch up to date with `dev` and re-run all tests (in progress, 2026-09-18).
2. Record your answers; build the items from Group C you approve; finish the three small leftovers.
3. Re-inspect the code that arrived after 1 September.
4. Merge pull request #8 into `dev`; flip the GitHub switches from Group B.
5. Prepare and harden the new server using the deployment kit; rehearse a backup restore; go live.
