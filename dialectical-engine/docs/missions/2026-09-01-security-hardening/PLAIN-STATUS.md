# Security work — where we stand, in plain words

*Written 2026-09-18 for the owner. **Last updated: 22 September 2026.** This is the easy-to-read companion to the technical records in this folder. Every item links to the file that holds the detail. The newest news is in the first section; the dated sections below it are the history.*

## Right now — 22 September

### The support-chat test bench is measuring again (22 September, evening)

The support chat has a test bench: 60 scripted visitor questions, run three times against the real support code with a stand-in AI, checking each answer's outcome, language, cited help entries and that no forbidden action was taken. Since the privacy fix earlier today (a visitor's network address is now stored as a keyed code nobody can reverse, instead of a plain hash) the bench had scored **0 of 60 on every run**. The answers were not wrong: the bench itself handed the database a text label where the database's rule for that column only accepts the 64-character keyed code, so every test conversation was refused before it started. The bench now derives the code exactly the way production does. Committed and merged on 22 September (the same derivation landed through a small helper with its own test, which also reads the database's rule straight out of the migration file, so the bench cannot drift from it again): [tests/support-eval/run.ts](../../../tests/support-eval/run.ts). Nothing pushed.

| | Before the fix | After the fix |
|---|---|---|
| Questions answered correctly, each of 3 runs | 0 of 60 | 60 of 60 |
| Speed targets (four of them) | not measurable | all met |
| Verdict line | FAIL | PENDING |

PENDING is the best result this bench can give on its own, on purpose: it will only say PASS once an independent person has rated the quality of the answers, and until then the command still exits with a failure code. The privacy rule for the column was never touched; the bench had drifted from it.

**A new AI session took over on 21 September**, starting from the handoff note ([HANDOFF-PROMPT.md](HANDOFF-PROMPT.md)). Before doing anything it checked that the state matches the note:

| Checked | Result |
|---|---|
| The work branch | `security/dev-sync-2026-09-18`, clean, **nothing pushed anywhere** |
| GitHub switches | **23 September: secret scanning + push protection are ON** (your "go 1"). That was the one switch that had to precede the first push. The others wait for their own "go" |
| This Mac's Node version (Node is the program that runs the code) | 26.8.2 — exactly what `dev` now requires |
| `dev`, the main V3 line | has moved on by 36 commits since this branch last absorbed it |

### The final review and its fix wave — done (22 September, evening)

Six independent reviewers (Claude Fable 5.1, one per area) read everything this execution added. Five areas passed; **one did not: the master keys.** Then five fix packages were built, reviewed and merged. Everything is verified on the combined branch. Full record: [FINAL-REVIEW-2026-09-22.md](FINAL-REVIEW-2026-09-22.md).

| Area | Verdict | The finding that mattered | Fixed? |
|---|---|---|---|
| Master keys, custody | **not approved** | Changing a master key was built in the key library and the rotation command, but the website and the engine never read the *previous* key — following the runbook would have taken the site down, and the one order that avoided the outage would have lost a user's data | yes — both services read both keys during a changeover; the rotation checks every record twice; the runbook is rewritten in the order that works |
| Prompt-injection containment | approved | The support chat talked to the AI model with no safety frame — the one place the "one frame at every hand-off" rule was not met | yes |
| Deployment modes and money | approved | A normal OpenAI reply carries an extra field the code refused, so nothing was charged and both money ceilings were blind for that vendor. The first fix was itself caught by an independent re-check: one bad reply could have charged 2 million times the admitted amount | yes — a bad receipt can never charge more than what the gate allowed |
| Support chat and website | approved | The support case link was left in the browser's storage, so the next visitor on a shared tab inherited the case | yes |
| Automatic checks, server kit, records | approved | The server kit's rotation section was wrong for the reason above; two required settings were missing from the example | yes, plus a banner marking what package 14 still refreshes |
| The engine room's main file | approved | The code that stops a debate on money was pinned by no test the automatic check runs | yes |

Verified on the combined branch after all merges, in a clean copy: type check 0 errors · automatic check **0 new failures** (5 known, 0 stale) · no known-vulnerable packages · website builds, 136/136 tests, security smoke PASS · engine observation binding 6/6.

**Still nothing pushed.** Three things are yours: the GitHub switches and the word "push"; Docker for the database-backed tests ([the Docker window](DOCKER-WINDOW-2026-09-22.md)); and the go-live lines that came out of the review ([GO-LIVE-CHECKLIST.md](GO-LIVE-CHECKLIST.md)).

### Your decisions — progress

We are going through them together, one at a time. Each answer is written into [V-DECISIONS-PACKET.md](V-DECISIONS-PACKET.md) the moment you give it, so an interruption loses nothing. The plain-language explanation of every decision is [DECISIONS-EXPLAINED.md](DECISIONS-EXPLAINED.md).

| Group | Answered |
|---|---|
| Ruled on 18 Sept — V-15 (the server starts with an empty database) and V-23 (we look at the Cloudflare integration together, at the end) | 2 of 2 |
| A — thirteen routine ones | **13 of 13** — all "yes", 21 Sept |
| B — switches on your GitHub account | **9 of 9** — 22 Sept |
| C — real choices that add work | **7 of 7** — 22 Sept |
| D — new, from the re-check | **4 of 4** — 22 Sept |

**Nothing on your GitHub account has been changed yet.** Each switch still waits for your "go" at its step, in the order written in the [runbook](GITHUB-SETTINGS-RUNBOOK.md).

**Group B — what you ruled** (full wording in the packet; exact commands in the runbook):

- **Which branch GitHub watches:** `dev` until release day, then back to `main`.
- **A private channel for reporting holes:** yes. The public promise to reply changes from 3 working days to one week.
- **The bot that prepares package fixes:** yes to ready-made fix pull requests, and yes to its weekly routine updates — with a 7-day wait added, so the bot obeys your own "packages must be a week old" rule.
- **Blocking pushes that contain secrets:** yes — switched on *before* this branch is first pushed, so the local commits get checked on their way up.
- **The automatic code reviewer's notes:** its three open "high" notes are false alarms (I confirmed that in the code myself before asking you); they get dismissed with written reasons. For future notes I check the code first, fix the real ones, and bring you the false ones — I never dismiss one on my own.
- **The helper scripts your automatic checks use:** yes to both locks — GitHub will refuse any script not referenced by its exact fingerprint, and only GitHub's own scripts plus the one from your package installer may run at all.
- **Two-factor login for everyone:** yes — once your colleague's account has it on (see the note below).
- **Branch rules:** yes, as two bundles. Nobody — not even an administrator — can delete `main` or `dev` or rewrite their history. And changes reach `dev` through a pull request with the checks passing, with administrators exempt at first; that exemption gets tightened, on your separate "go", when real users arrive.
- **The half gigabyte of test recordings and AI transcripts:** those two kinds of file stop being tracked; every written record stays.

**Group C — so far** (asked from smallest to largest):

- **V-22, a planted password record that eats memory:** yes — the server will refuse stored records that ask for more than twice the official cost.
- **V-20, the GPU settings** (*was blocking the server move*): yes — they become optional, and the six unused database logins are created already-expired. While checking I found that the server kit, as written, would have stopped the engine from starting on day one; that gets fixed with it.
- **V-19, two server accounts sharing one key folder** (*was blocking the server move*): option 1, the "team badge" — a key file may be readable by one named group, everything else stays as strict as today, and nothing changes on your Macs.
- **V-6, more places where debate text sits unencrypted:** yes — encrypt them too, and do it *before* the server goes live, so that no readable row ever exists there (the server starts with an empty database).
- **V-3, being able to change the master key:** yes, now — built before go-live, for all the master keys, ending with a full rehearsal on a copy (today the software has no way at all to replace a master key that leaked).
- **V-11, where the engine talks to the AI models:** yes — built in this mission after the second bringing-up-to-date, ending with a real-model confirmation run that you run. The main item is "prompt injection": a model's answer is pasted into the next model's instructions, so a sentence like "ignore your instructions and…" inside an answer can steer the judge. You also asked for *more* safeguards than the original fix, said the prompts may change if needed, and set a standing requirement: **the prompts must be editable by you at any time, for each step, under your rules — including prompts an AI writes for you.** You approved my proposals for both ("yes to both"): **five extra layers of defence built now** — separate compartments at every hand-off, unforgeable fences around model-written text, locked answer forms, a permanent attack test-suite (English and Romanian) that runs on every change, and tripwires that flag a manipulated step — and **three more to decide later, with costs in front of you** (measuring real attack success against real models; judging published debates twice with the positions swapped; a human look before a flagged debate is published). One reassuring fact I verified: the AI models in your setup can only *write*, not *act* — every one is launched with its tools switched off — so the worst an injection can do is bend a verdict, not break into anything.
- **Editable prompts — the foundation now, the feature afterwards.** Today the prompts are fixed text inside the source code. You approved the principle for changing that safely: each step's prompt splits into a *safety frame owned by the code* (nobody, human or AI, can edit it out) and *your instruction text* (edit freely); every edit is a new sealed version with instant rollback; a rules gate — the same for a prompt written by a person or by an AI — runs before a version goes live; only owner accounts can activate one. The security work builds on that split now; the editing feature itself (where you edit, who may, whether a second person approves) gets its own short design conversation after the decisions.
- **V-9, the shape of production** (*was blocking the server move*): the database runs directly on the server (yes); no job-system dashboard on the public internet (yes); and for reaching the AI models you set the direction — **the product must work in two modes.** *Hosted* (the commercial website): paid API keys, a separate key per AI vendor, and many more vendors than today's three. *Local* (anyone who downloads the repository and runs it on their own computer — you included, before launch): local models and personal subscriptions, no API keys needed. So the small command-line relays are not throwaway development code any more; they are the local mode. The one hard rule that follows: **the hosted server must refuse those relays, and the code has to enforce that** — today nothing does.

**Group D — so far:**

- **V-29, what the monitoring agent may see in the database:** yes — it gets a small window showing only what its health check needs, instead of membership in a built-in group that can watch every command go by (including ones that set passwords). A correction I made before asking: that group does *not* expose your users' debates — the application always sends user text separately from the command text.
- **V-26, the support chat on account deletion:** yes — deleting an account also erases that person's support conversations, in the same operation; safe to repeat, and an interruption can never leave things half-deleted. (Chats by visitors who were not logged in aren't linked to any account, so the retention timer stays their only way out.)
- **V-30, how the support chat reaches its AI model:** yes to both parts. *Hosted:* the support chat uses the paid API path only, and the hosted server refuses the relays for support exactly as for debates. While checking I found the support chat is wired to one specific relay and can use nothing else yet — so it needs the same "vendor by configuration" treatment as the engine (about half a day; without it the hosted site would have no support chat that is allowed to run). *Local:* today's behaviour stays for now; the local-mode instructions will say plainly that it is for a computer you don't share (on a shared computer, other accounts could read what is typed while the vendor's tool runs); passing the text the safer way goes on the local-mode hardening list, tool by tool.
- **V-28, a spending ceiling in money:** yes to all three parts — a ceiling *per debate* (the engine adds up what each AI vendor reports as the debate runs, and stops it cleanly before the call that would cross the line); a *daily* ceiling across all debates and vendors (when reached, no new debates start until the next day); and *fail closed* (the hosted site refuses to start with paid keys unless both ceilings are set; local mode is untouched). The numbers are deliberately not set yet, because nobody has ever measured what a debate costs in money: I build the mechanism, you make the first paid run under a low temporary ceiling, and the real numbers are set from that measurement.

**All thirty decisions are now answered.**

(The numbering has no "V-27" — it was skipped. The thirty are V-1 to V-30 without 27, plus one called V-6b.)

**One thing only you can do, found on 22 September — and it should not wait.** Two accounts have full administrator control of the repository: yours (`nokitel`, two-factor login on) and your colleague's (`VanillaMint02`, **two-factor login off**). An administrator account guarded by a password alone is the weakest point on the GitHub side: whoever gets that password can switch off every protection listed here. You are asking your colleague to turn two-factor on (about five minutes with an authenticator app). Once that is done, you flip "require two-factor for everyone" in the organisation's settings — I will first re-check that nobody would be removed by it. You decided his access stays administrator.

**The bigger picture you confirmed on 21 September — how V3 reaches `main`.** `main` is where the site is going. V3, including all the security work, is proven on `dev` first. Then it reaches `main` as **one deliberate release-day step that you approve**, with a permanent bookmark placed on the old engine's last state first, so the demo can always be brought back. It is never a routine merge and never something an AI does on its own — because `dev` is not "`main` plus new work": the old engine's files are deleted on `dev`, and a trial merge showed 38 conflicts. Until that day, GitHub's "default branch" label (which only decides where GitHub's security features look — it moves no code) sits on `dev`; on release day it moves back to `main`. That is your ruling on V-5.

**One recommendation changed before you ruled on it — V-25, the memory test.** One test measures how much memory the login limiter uses during a flood and compares it with a number measured once, on one laptop, under Node 22. The old advice was "install Node 22 on this Mac". That stopped making sense when the project itself moved to Node 26. What you approved instead: measure again under Node 26 — once on this Mac, once on GitHub's Linux machines — and record each number as a *new version* of the setting. The old Node 22 number stays as history; a sealed value is never edited, only superseded.

### What is owed before anything can be merged: a second bringing-up-to-date with `dev`

The other workstream finished on 21 September. It moved the whole project to a newer Node and a newer test tool, and it deliberately did not take this security branch in. So three settings now disagree, and they need judgement rather than a mechanical merge:

| Setting | This branch | `dev` now | What I will do |
|---|---|---|---|
| Node | 22.23.1 | 26.8.2 or newer | take `dev`'s — it was their deliberate decision |
| vitest (the test tool) | 4.1.11 | 5.0.1 | take `dev`'s, then re-check that the old vitest advisory is really gone |
| fastify (the web-server library) | 5.12.1 — the security fix | 5.11.2 — the version with known advisories | **keep this branch's**, or the known holes come back |

### What your "yes" answers have put on my to-do list (nothing here is built yet)

I am collecting rulings first and building afterwards, so the questions keep moving. Each item below will be built test-first: a test that fails for the right reason, then the smallest change that makes it pass.

| From | What gets built | Size |
|---|---|---|
| V-14 | The 1,024-character password limit written into the official policy, as a new version of that setting | small |
| V-17 | The code's internal "map" of the database updated with the two missing columns, plus a test that compares map and real database | small |
| V-18 | The 37 expired exceptions to the "packages must be a week old" rule removed (and 3 newer ones, once each is old enough) | small |
| V-8 | The never-activated "pre-push checks" folder deleted | tiny |
| V-4 | The stricter rule for the list of known-failing tests: a listed test that passes three runs in a row makes the check fail until its entry is deleted | small |
| V-25 | The memory test re-measured under Node 26, per platform, each number recorded as a new version | small, part of the second bringing-up-to-date |
| V-21 | Three development-only leftovers tidied | small, low priority |
| Package bot | A 7-day waiting period added to the bot's configuration | tiny |
| V-7 | The 110 browser-test recordings (466 MB) and 22 AI transcripts (49 MB) stop being tracked; an ignore rule and a guard test keep them from coming back; the records note which commit last holds them | small |
| V-3 | The ability to replace a master key: every stored small key gets a label saying which master key locked it, a `rotate` command re-locks them all under a new one (the private content itself is never touched), old records keep working, and the package ends with a rehearsal on a copy. Built right after the "team badge", because both touch the same code | about a day |
| V-6 | The remaining readable pieces of debate text (per-segment results, progress events, the "who weighs this value" notes, the alias memory, notes on stored model outputs) get encrypted with the same mechanism as the verdicts — before go-live. Ends with a full debate run and a speed measurement of the live progress display | about a day; I tell you before it passes one day |
| V-9 | Two modes enforced by the code: the hosted server accepts only paid, encrypted API connections and refuses the local relays at start-up; local mode keeps the relays and local models. AI-vendor keys move out of a settings variable into the locked key folder (one file per vendor, readable only by the engine room's account). Vendors become configuration: adding one is a settings entry, a key file and one proven test call. Each hosted vendor is checked for how it treats your users' text, and named in the privacy notice | about a day for the foundation, then a little per vendor |
| V-11 | At every hand-off between AI models, model-written text is wrapped as clearly marked *material to evaluate*, never mixed into the instructions; job inputs are validated; the model's reported name is checked; the data formats get version numbers. Every changed prompt becomes a new sealed version. Ends with a real-model confirmation run (you run it). Plus the five extra layers you approved (unforgeable fences, locked answer forms, the permanent attack test-suite, tripwires), all built on the "safety frame + your instruction text" split that makes editable prompts safe later | two to three days, plus the confirmation run |
| V-19 | The "team badge" for key files: readable by one named group when that is switched on, as strict as today in every other respect, with a full table of refusal tests written first; the server kit's setup steps gain the matching group | about half a day |
| V-28 | A spending ceiling per debate and one per day, in money, counted from what the AI vendors report; a debate that reaches its ceiling stops cleanly and keeps what it produced; the hosted site refuses to start with paid keys unless both ceilings are set | about a day |
| V-30 | The support chat gets "vendor by configuration" like the engine, so on the hosted site it uses a paid API vendor and the relays are refused; the local-mode instructions state the don't-share-the-computer assumption | about half a day, on top of V-9's foundation |
| V-26 | Deleting an account also erases that person's support conversations — one deletion, everything gone; tests first for "nothing left", "safe to run twice" and "an interruption finishes cleanly on retry" | small |
| V-29 | The monitoring agent's database login loses its membership in the built-in "monitor" group and gets a narrow window instead; a test proves it can no longer read other sessions' commands, another proves its health check still works | small |
| V-20 | The three "GPU server" settings become optional for the engine room, the server kit stops writing a placeholder that would have stopped it from starting, and the six unused database logins are created already-expired | small |
| V-22 | The server refuses a stored password record that asks for more than twice the official "how hard to work" cost (today it accepts four times: 256 MB per login check instead of 64 MB), with a test proving no real user can be locked out | small |
| Noticed while checking the code reviewer's notes | The e-mail verification route does one cheap database lookup before its limit check; make it check the per-visitor budget first. Not a hole — a small tightening | tiny |

Already done because it was a one-line wording change: the public promise in [SECURITY.md](../../../../SECURITY.md) now says "within one week".

### Work in progress (started 22 September, on your instruction)

You asked for the building to be done by a team: **I (Claude Fable 5.1) coordinate, judge and do the final review; Claude Opus 5 agents do the building, each in its own separate copy of the code, in parallel where the work is independent.** I merge only what passes my review. The agents' exact instructions — and the fifteen rules every one of them works under (your rules, plus the mission's) — are in [EXECUTION-PLAN-2026-09-22.md](EXECUTION-PLAN-2026-09-22.md).

| Package | What | State |
|---|---|---|
| 1 | The second bringing-up-to-date with `dev` | **done and approved** — `dev`'s Node 26 and newer test tool taken, our patched web-server library kept, known-vulnerable packages: none. The merge itself had a hidden trap: two identical copies of a helper in one website file that the type check cannot see (only the website's own tests caught it) — fixed. The known-failing list shrank from 12 to 5. **Combined with all the other packages on 22 September** — the two colliding files were resolved by an agent, reviewed (approved; eight wording corrections to its record in one fix round), and merged. The combining also caught one real hole: a filter in the observation code was silently throwing away the new failure records; fixed with a test that fails without it |
| 2 | Repository hygiene: the dormant pre-push folder, the half gigabyte of recordings, the expired package exceptions, the package bot's 7-day wait, the stricter rule for the list of known-failing tests | **done, reviewed, merged** — built test-first; an independent reviewer found one weak test (it checked an empty list) which was fixed and re-reviewed; the checkout is 515 MB lighter |
| 3 | The memory test re-measured under Node 26 | **done, reviewed, merged** — measured 14 times on the quiet machine (233–255 MB); I ruled one extra step of headroom (fence at 288 MB), because the old rule would have left under 1 MB of margin and a fence that fails on noise gets ignored; the reviewer approved it outright and confirmed no sealed value was touched. The test now runs on this Mac instead of skipping, and the automatic check reports **zero** new failures for the first time |
| 4 | Three small hardenings of the login surface (V-14, V-22, the e-mail-verification order) | **done, reviewed, merged** — approved on every point of your rulings; one safety-net test was fragile and was hardened and re-reviewed |
| 5 | Three database items (V-17, V-29, the tamper check) | instructions written; **needs Docker running on this Mac** — it was not running when I checked |
| 6 | Keys: the "team badge", then changing a master key | **done, reviewed, merged** — the hardest package so far. Three review rounds: the reviewer caught two "green report that lies" holes in the rotation (the support chat's final check would have accepted the *old* key; a key store the command never opened counted as a clean pass) — both fixed and re-checked. Rotation covers all three master keys; the rehearsal runs on a throwaway copy. One test that needs a database has not run yet (Docker) |
| 8 | The support-chat leftovers from the September re-check (eight findings) | **done, reviewed, merged** — the reviewer found the three new usage budgets would have shipped switched off (a wiring line in a file I had fenced off), an IPv6 visitor could sidestep one budget, and the model-call share missed one door; all fixed and re-checked. One design point carried into the spending-ceiling package: on the hosted site, starting without those budgets must be refused, not silently allowed |
| 9 | Prompt-injection containment plus the five extra layers, on the "safety frame + your instruction text" split | **done, reviewed (four rounds), merged** — the core held up from the first review; what took four rounds was the *honesty work*: an exact, complete list of every sentence the models now read differently (22 items, verified twice by independent reviewers), and repairing the database-backed test suites the change had broken — including one that feeds your own confirmation run. A new automatic rule now forbids the shape of mistake that hid those breakages. **One clash surfaced at integration** (a test from package 10 built a raw model request by hand, and package 9's new "door" refuses exactly that — each was green alone): fixed on the integration branch, reviewed, and the automatic rule now covers those tests too. The combined check is clean again |
| 10 | The two deployment modes enforced in code; AI-vendor keys in the locked key folder; vendors as configuration; the GPU settings made optional | **done, reviewed, merged** — two review rounds: the "no local model servers on the hosted site" check first recognised only four spellings of "this machine"; it now refuses every loopback and link-local address form (33 spellings probed). Two small choices for you below |
| 12 | The support chat reaches its AI model by configuration: paid vendor on the hosted site, today's relay in local mode | **done, reviewed, merged** — two review rounds; the reviewer caught that the hosted chat could not have reached vendors like OpenRouter (a rule meant for the relay was applied to paid APIs) — fixed |
| 15 | Three development-only leftovers | **done, reviewed, merged** — the fixed development-database password is gone from tracked files; it is generated once into the local key folder, so a fresh download still runs with no manual step |
| 11 | The spending ceilings (per debate and per day, in money) | **done, reviewed (four rounds), merged** (after the `dev` sync, as planned: one collision in the engine room's main file, resolved by me and pinned by two new tests) — the money arithmetic and the fail-closed start-up were sound from the first review; what took four rounds was one promise: that a debate cut short by the ceiling ends cleanly and keeps what it already produced. A fresh agent traced the whole path in writing first and closed it; an independent reviewer re-traced three scenarios and confirmed. Two rulings I made: a cut-short two-maker debate is served on the maker it could afford and *says so* on the answer; and the daily gate had used a database function that does not exist (every request would have failed) — fixed and pinned. The starting ceilings are deliberately tiny (0.25 USD per debate, 2 USD per day) so that your first paid run stops on purpose and measures the real cost |
| 7, 5 | Data encryption and deletion; three database items | instructions written; **need Docker running on this Mac** |
| 14 | The server kit refreshed for everything decided | instructions written; last |

Still true: nothing is pushed and no switch on your accounts is flipped without your "go" at that moment.

**State of the combined branch at 14:00 on 22 September:** every package except the three Docker-bound ones (5, 7) and the server kit (14) is merged. On the combined code: type check clean; the automatic check reports **zero new failures** (5 known, 0 stale); no known-vulnerable packages at any level; the website builds; the website's own tests pass; the website security smoke test passes. **The final whole-branch review is running now** — six independent reviewers (Claude Fable 5.1, as you asked), one per area: keys and custody; prompt-injection containment; deployment modes and money; the support chat and the website; the automatic checks, the server kit and the records; and the engine room's main file on its own. What they find gets one fix wave, then I judge what is left, then I bring you the push question.

**What has NOT been proven yet (needs Docker on this Mac):** the database-backed tests of packages 4, 6, 8, 9 and 11 — including the daily spending gate's database lock and the support chat's database suites. They are written; they have not run. I will run them all in one Docker window before anything reaches `dev`.

**Two small choices from package 10 (my defaults apply unless you say otherwise):**
- **One or two credential files per AI vendor on the server?** The kit stores two — one for the website's API, one for the debate engine — so neither service can replace the other's; the cost is that rotating a vendor key is two steps. One shared file (readable by both through the "team badge") would also work. Default: two.
- **Adding a vendor needs no code only if its API address ends in `/v1`** (the common shape). A vendor with a different shape still needs a small code change. Nothing to decide now; just so you know.

**One number for you to ratify later (extends your V-1 ruling):** package 8 adds three usage budgets for the support chat — 240 page reads per 15 minutes per visitor network, 10 support sessions per hour per account, and a 40-calls-per-day share of the AI budget per visitor network (8 % of the 500-a-day ceiling). The reviewer judged the magnitudes right. I will put them to you with the final review.

**Notes for you from packages 11 and 12 (no answer needed now; my defaults apply):**
- The daily spending ceiling counts **debate spend only** for now. The support chat's spend is measured but not yet added to the same daily total (the joint exists; it is one insert when we wire it).
- The starting ceilings — 0.25 USD per debate, 2.00 USD per day — are marked *provisional* in the sealed configuration. That label is a label, not a lock: the go-live checklist gets a line that says the real numbers must be sealed before launch.
- A debate that hits the daily ceiling is answered with "try again after midnight UTC" (a 429 with a Retry-After time), and the answer does not reveal the ceiling or the running total; those go to the operator's log only.
- On the hosted site, an AI vendor that reports no usage for a call ends the debate cleanly and keeps the work produced so far (it is the vendor's or the configuration's fault, not the user's) — a diagnostic code records it.
- In **local** mode the support chat may talk to a model server on this machine over plain http (there is no network to cross). In hosted mode only https to a paid vendor is accepted. Say so if you want local mode stricter.
- One container in the development stack still receives its GPU-server key on the command line (visible to anyone who can list processes on that machine). Development only; the server kit does not do this. Package 14 removes it.

### The plan from here (agreed order, 22 September)

Sizes are in "agent-days" — working sessions of an AI agent, not calendar days. Nothing is pushed and no switch on your accounts is flipped without your "go" at that moment.

**Three things only you can do — they can start any time, in parallel:**

1. Ask your colleague to turn on two-factor login; tell me when it is done; I check that nobody would be removed; you flip "require two-factor" in the organisation's settings.
2. Choose the first AI vendors for the hosted site, open a paid API account with each, and set a monthly spending cap on each vendor's dashboard. Keep the keys to yourself — I never see them; you place them on the server yourself, following steps I write.
3. When you are ready: the server (which provider, which operating system, and whether I get access or you run my steps).

| Step | What happens | Size | What I need from you |
|---|---|---|---|
| 1 | **The second bringing-up-to-date with `dev`.** Checked on 22 Sept: `dev` has not moved again (still 36 commits ahead), and a trial run shows 8 files collide — the three version files, the engine room's main file, and four test files both sides had repaired. Rules: take `dev`'s Node 26 and its newer test tool; keep this branch's patched web-server library; then re-check everything and re-measure the memory test | half a day to a day | a "go" to download the packages `dev`'s new list names |
| 2 | **The small approved items, as one package** — everything marked small or tiny in the to-do table above, plus one leftover from the first mission (a tamper check on database upgrade files). *Correction, 22 Sept:* I had also listed "two small proxy hardenings" here — when I checked the code they turned out to be already built and tested on 19 September, so they are off the list | about a day | nothing |
| 3 | **First push, and pull request #8 merged into `dev`.** *This is earlier than in your original order, on my recommendation:* this branch has already needed two bringing-up-to-dates because it sat outside `dev`, and every further week outside means more collisions. Once it is in, `dev` carries the automatic checks, and every later package arrives as a small pull request that is checked automatically. The GitHub switches go on around this step, in the order you ruled (secret blocking *before* the push; the rest at and after the merge) | an hour or two of your attention | "go" for each switch, "push", and the merge itself |
| 4a | **Keys:** the "team badge" (V-19), then the ability to change a master key (V-3), ending with a rehearsal on a copy | about a day and a half | nothing |
| 4b | **Data:** the remaining readable debate text gets encrypted (V-6); deleting an account also erases its support chats (V-26) | one to two days | I tell you before V-6 passes one day |
| 4c | **Leftovers from the September re-check** — mostly the support chat: fair sharing of its AI budget between visitors, an origin check on anonymous requests, a proper salt on stored address fingerprints | about a day | nothing |
| 4d | **Where the engine talks to the AI models:** prompt-injection containment plus the five extra layers, built on the "safety frame + your instruction text" split (V-11) | two to three days | nothing until the confirmation run |
| 4e | **AI vendors:** the two modes enforced by the code, vendor keys in the locked key folder, vendors as configuration, the support chat on the paid path (V-9, V-30), and the spending ceilings (V-28) | two to three days, then a little per vendor | the vendor list |
| 5 | **Your confirmation run** — one paid real-model run that proves the verdicts did not move, proves the paid connections work, and measures for the first time what a debate costs in money; the real ceiling numbers are set from it | about two hours of yours | you run it; you choose the two ceiling numbers |
| 6 | **The server:** refresh the server kit for everything decided here → you provide the server → set it up and harden it → rehearse restoring a backup and changing a master key → you place the vendor keys → test → we look at the Cloudflare integration together (V-23) → go-live checklist → the branch rule gets tightened so even administrators go through pull requests → release day: the old engine is bookmarked, V3 reaches `main`, and GitHub's label moves back to `main` | two to three days plus your part | the server; "go" at each outward-facing step |

Each of 4a–4e is its own small pull request into `dev`, written test-first. Roughly ten to fourteen agent-days in all, plus your parts.

**Alongside, not blocking anything:** the design conversation for prompts you can edit yourselves (you asked for it; the security work lays its foundation in step 4d), and the three extra prompt-injection safeguards that cost money or change the product, which I will bring to you with numbers.

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

**All answered on 21–22 September — the rulings are summarised in the progress table at the top of this file, and written in full in [V-DECISIONS-PACKET.md](V-DECISIONS-PACKET.md) (rows V-2, V-5, V-7) and the [runbook](GITHUB-SETTINGS-RUNBOOK.md).** The table below is the question as it was originally put. Only V-23 (the Cloudflare integration) remains, and you ruled that we look at it together at the end.

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
