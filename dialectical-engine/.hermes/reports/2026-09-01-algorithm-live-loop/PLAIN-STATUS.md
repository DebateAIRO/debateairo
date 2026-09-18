# Where things stand, in plain language

*Written 2026-09-17 and updated 2026-09-18 for the project owner. This page explains the state of the V3 debate engine work without the code names the other files in this folder use. Every claim links to the file that holds the details. When the detailed records change, this page is updated in the same commit.*

## 2026-09-18, early morning: you decided the open questions, three changes followed, and the mission is signed off

**What you decided.** I put ten questions to you, each with a recommendation and the alternatives. Your answers:

| Question | Your answer | What it means |
|---|---|---|
| When should a debate stop going deeper? (the "stop threshold") | Lower it from 0.02 to 0.01 | After each round the engine checks whether any position's score still moved. Below the threshold it stops. In the real run the winner led by about 0.011, so the old 0.02 would have called a debate "settled" while scores were still moving by more than the lead. |
| When should one argument stop getting replies? (the "freeze threshold") | Lower it from 0.01 to 0.005 | An argument that cannot move any position's score by at least this much gets no further replies. The old value would have frozen four of the six main arguments of the real run, two of them close enough to matter. |
| Your secret key was visible in the Mac's process list during a run | Fix it before pushing | Done, see below. |
| 1. The verdict label comes from code, the verdict text from an AI, and a second AI checks they agree | Yes | This is how the real run worked. |
| 2. If the checking AI still objects after three rewrites, serve the answer with a visible warning | Yes | The reader gets the answer and sees the disagreement. |
| 3. Should that objection also force the label down to "contested"? | No | The label comes from the numbers only. |
| 4. The website's words for the three labels | Rename now | Done, see below. |
| 5. If some of the AI judges fail, carry on with the rest and mark it visibly | Yes | Never a silent self-grade. |
| 6. A single AI on its own can never print "supported" | Yes | |
| 7. "One debate, one frame" | Park it | Revisit with live data. |

You also said you do not need the single-model run ("I trust that it will work"). The sign-off says so openly: that one item of the finish-line checklist was never demonstrated by a run, by your decision.

**What was built from your answers.** Three small changes, each written by one AI worker and then checked by a second AI that had never seen it (the "second doctor's opinion"):

1. **The two thresholds.** The new numbers are in. One thing surfaced that matters: the real-run setup keeps a sealed copy of these numbers, and a sealed copy can never be edited. So the new numbers were added as a new sealed version next to the old one. Your run of September 17 and its data stay untouched, and nothing has to be reset before the next run. One honest limit: with the debate set to two levels deep, the stop threshold cannot trigger at all (there is no earlier round to compare with until the last one), so it only starts to matter for deeper debates.
2. **Your key is off the command line.** The program now reads the key only from the environment variable you already export, and refuses it if it is typed on the command line. The reviewer found two ways the key could still have ended up in the saved run log (writing the flag with an `=` sign, and the run tool copying its own command line into the log before the program could refuse). Both are closed. The guide's copy-paste commands were also cleaned: no command block contains a `<` or `>` any more, because that is exactly the character that emptied your three tools on the 17th when a line was pasted into the terminal.
3. **The website's words.** The three labels now use the engine's own words: supported, contested, unsupported. A sentence that was false went away: for "unsupported" the banner used to say that no evidence was available, which is not what the label means. Two new sentences, which you can change or veto:
   - contested: "The run did not settle this either way: the positions were too close, the judges disagreed, the leading position was not strong enough, or part of the comparison was missing."
   - unsupported: "Even the leading position here came out weak once the arguments were weighed against each other — a weak case, not a disproved one."
   One honest limit: **none of this is visible on the site today.** The label reaches a reader only as a raw word in a side drawer, and nothing feeds the banner yet. That is a separate item for your UI work, with its own ticket.

**The tests.** Every test file the three changes touched was run three times at the final commit: all green except the same two known failures as before (one safeguard test from before this work, and five cases of one website test that fail only on this Mac's Node version). Then the full automated pass ran at the final commit: **140 failing tests out of 5363** — exactly the same known failures as before tonight, name for name, nothing new. All the tests added or changed tonight pass.

**The sign-off.** The reviewer role has now written the final verdict on the whole mission: **the goal is met**, with two things said openly. First, the single-model run was skipped at your word, so that checklist item was never demonstrated. Second, every test number here comes from this Mac's newer Node version, and one run on the project's pinned version is still owed. The verdict is in [agent-reports/w12-whole-goal-verdict-2026-09-18.md](agent-reports/w12-whole-goal-verdict-2026-09-18.md); it also lists what it does not claim.

**What is left, none of it blocking.** One test run on the pinned Node version (item 2 below). Seven small to-do cards written during the night, in the [board](board/) folder; the two worth your attention are that the verdict label is not yet visible on the site (`F-UI-VERDICT-LABEL-DRAWER-ONLY`), and that the sealed numbers can be re-tuned only one more time before the sealing mechanism needs a design decision (`F-REGISTER-HISTORICAL-IMPORT-CAP`). Everything you decided, with the measurements behind the two thresholds, is entry D77 at the end of [DECISIONS.md](DECISIONS.md).

## The big news of 2026-09-17, late evening: the real run happened, and it passed

At 22:28 you started the full real debate with all three AI services, and at 23:47 it finished cleanly. Three positions, 27 arguments, 15 independent attacks between them, 114 model calls of a 396 ceiling, and every one of the nine facts on the finish-line checklist is in the log: every argument scored by a panel that never included its own author, every link carrying a measured weight, all three top-level scores moved by the counter-arguments, the final statement accepted by its evaluator on the second attempt after a first rejection, a code-derived verdict of CONTESTED, and a confidence band capped because all five cited arguments rest on reasoning alone (no looked-up evidence, which is honest for a four-day-workweek question). The judge's finding: the flagship item of the checklist is witnessed in full. The log is kept in the project under `closing-runs/`. What still separates this from "mission complete" is in item 4 below; the biggest blocker is gone.

## The picture in one paragraph

DebateAI has two generations. **V2** is the older Python system that runs the live site (dezbatere.ro) from the `main` branch. **V3** is the rewrite on the `dev` branch: several AI models argue a question against each other, a panel of AI judges scores every argument, the scores are propagated through the argument tree, and a final written answer comes out with a label (supported / contested / unsupported) and a confidence band. The work of the last weeks was about proving that this V3 machinery really works end to end with real AI services, and about fixing what that proof turned up. As of this evening, **all of that work is on `dev` on GitHub**, and the one thing that still has to happen is a **full real run**, which only you can start because it needs your paid API credential.

## What happened today (2026-09-17)

1. **Everything was pushed to `dev`.** Your local copy of `dev` on this Mac was still pointing at the old V2 line; it now points at the V3 line, and GitHub's `dev` carries all the work. The two `claude/…` branches you asked about are old V2 work and were left alone. The three temporary working folders from earlier tasks were deleted, after checking that nothing in them was unsaved.
2. **The run's report was fixed.** The full run of September 8 finished, but its printed report skipped six of the nine facts the project's finish-line checklist demands. The code now prints all of them (details in the next section). This was built by one AI worker, checked by a second AI that had never seen it, corrected once, and re-checked; the tests pass.
3. **A wrong default in the run instructions was corrected.** The checklist requires the debate to go at least two levels deep (argument → counter-argument → reply to the counter-argument). The instructions for the next run did not say so, and the program's default is one level. The instructions now set two.

## What is still needed, and why

### 1. The full real run — the only thing that proves the machine works (you)

**What it is.** A complete debate, start to finish, using the real AI services (OpenAI's Codex, Anthropic's Claude, and xAI's Grok if it can start), with everything recorded in one log file. Think of it as a test flight before an airline accepts a plane: the plane can pass every ground check, but the acceptance is the flight.

**Why you.** It needs your API credential, the secret that lets the program spend money with the AI providers. By the rules of this project no AI agent ever reads, stores or prints that secret; you type it into your own terminal, run one command, and the program uses it for about 25 minutes.

**What you do.** Follow [packets/readiness-ask-2026-09-16.md](packets/readiness-ask-2026-09-16.md). It lists the exact command, the ports it uses, where the log lands, and what to check first. The short form is one line that runs [tools/closing-run.sh](tools/closing-run.sh) with the depth-2 setting. Since the evening of 2026-09-17 the tool first runs a **pre-flight**: it finds the three AI command-line tools, checks that each one is a real, complete program (not an empty file, not a text file), and refuses to start unless at least two of them work. You can run only that check, with no cost, by putting `PREFLIGHT_ONLY=1` in front of the command. Since the first real attempt on 2026-09-17 at 22:22, which died in ten seconds because the Claude command line's sign-in had expired, the check also confirms that Claude and Codex are signed in, and tells you the sign-in command if not (`claude auth login`, `codex login`). Grok has no such check; the run's own first contact with it decides. All three tools were complete programs again by 22:19 that evening.

**What you get.** A log with the nine facts the checklist wants. Two of them can only be proven by a real run, never by the automated tests: whether the argument links carry measured weights, and whether propagation actually moved at least one top-level score. The seven new report lines and what each one means are described in the code's own guide, [acceptance/README.md](../../../acceptance/README.md), under "The definition-of-done report".

### 2. Run the automated tests on the right Node version (you, or an agent with your go)

The V3 code runs on Node.js, the runtime the code is built for, like an app built for one phone OS version. The project is pinned to Node 22.23.1; this Mac has Node 26. About 100 of the 140 currently failing tests fail only because of that mismatch (a browser-storage feature Node 26 changed). Running the suite once under Node 22.23.1 should clear those 100 and is expected to uncover roughly four real failures that were hidden behind them. Details: decision D73, item (e)(7) in [DECISIONS.md](DECISIONS.md).

### 3. Look at the small choices made on your behalf (you, five minutes)

While building, I sometimes had to choose between two reasonable options without you. Each choice is written down as a default that stands unless you say no. The newest ones are in the "2026-09-17" section at the bottom of [V-DECISIONS-PACKET.md](V-DECISIONS-PACKET.md); each row says what was chosen and what saying "no" would mean. Example: the run's log now never contains the text of any argument, only ids and numbers, because the same texts are encrypted in the database and a log file is not a safe place for them. If you want the texts in the log anyway, that is a one-line veto.

### 4. After the run: the last steps to declare the mission finished — DONE on 2026-09-18

The steps this section listed on 2026-09-17 are done, except the single-model run, which you chose to skip: the two tuning numbers were fitted from the real run and you ruled on them, the seven questions were put to you and answered, and the reviewer role has written the final verdict. The section at the top of this page has the details. A full automated test pass ran after the real run (00:34: 140 failing tests out of 5,341, the same 140 known ones as before, nothing new) and again after tonight's three changes (see the top section).

### 5. Two loose ends that are not part of this mission (for your awareness)

- One automated test has been failing since before this work: a safeguard that makes the code lock database rows in a fixed order (so two processes cannot deadlock) is no longer present where the test looks for it ([tests/architecture/s7-authorization-contract.test.ts](../../../tests/architecture/s7-authorization-contract.test.ts), line 98). Nothing here caused it; someone should look at it separately.
- GitHub reported 12 vulnerable dependencies on the `main` branch, which is the V2 production site. Nothing in this mission touches `main`.

## The incident of 2026-09-17 evening, in plain language

Around 20:15 the Mac froze for everyone: your terminal, my commands, even the Claude updater. The cause was one file. The launcher of the Codex command-line tool (`/opt/homebrew/bin/codex`, which points to a file inside the npm package) had been overwritten with four lines of plain text instead of a program. When a shell is asked to run a file that isn't a program, it falls back to reading it as a script, and the first line of that text was the launcher's own path, so it started itself again, and again, about once a second. Within four minutes there were about 2,400 copies, the Mac's limit of 2,666 processes per user was reached, and nothing new could start. Think of a photocopier told to copy its own output tray.

**How it was resolved.** My safety layer does not let me kill processes or write files outside the project, so you did it: one line in your terminal replaced the broken file with a two-line program that simply exits, which let every copy in the chain finish by itself, and then `npm install -g @openai/codex@0.154.0` put the real launcher back. Nothing else on the machine was harmed.

**The cause, finally (third and last correction, 22:15).** It was my own instructions file. The run instructions showed the measured tool locations in a code box, as lines like "command -v claude", an arrow, the launcher path, an arrow, the target. Those lines were never meant to be run, but they look like commands, and you pasted them into your terminal, three times over the evening. To a shell, an arrow made of a dash and a greater-than sign means "write the output into the following file". So each paste opened the Claude launcher for writing, which empties the real program behind it, then failed on the shortened path and stopped. Same for Grok; and for Codex the command's own output landed in the launcher file, which is exactly the four lines of text we found. Earlier tonight I blamed an unknown actor, then the Claude updater. Both were wrong. The Claude updater is innocent. The old engine did play one role: its watchdog and its Codex worker call `codex` every minute or two, so once that launcher was broken, they kept starting new chains. Nothing there was changed; it is noted for the old engine's own to-do list. The instructions now show those measurements as a table with a warning, and the rule for every file written for you from now on is simple: a code box contains a real command you can paste, or it is not a code box.

**What changed so it cannot repeat here.** The run tool now checks every launcher before running it: non-empty, executable, and starting with a real program header. A text file is refused by name and never executed. The same check is now built into the relays the debate uses (finished and reviewed the same evening), together with your rule that no path specific to one computer may be written into code: each tool is found by its name on the machine's search path, or through a setting you provide, never from a baked-in path, and the file that was checked is exactly the file that gets started. A broken launcher that comes first on the search path is reported by name, never silently skipped for another copy. Details for the curious: the section "Which CLI a maker relay runs" in [acceptance/README.md](../../../acceptance/README.md).

## The words you will meet in the other files

| Word in the records | What it means |
|---|---|
| **V** | You. The one who decides and vetoes. |
| **Mission** | This whole effort: prove the V3 algorithm works end to end. Everything about it lives in this folder. |
| **Ceremony / closing run / acceptance run / re-run** | The full real debate described in item 1 above. |
| **Definition of done (DoD)** | The finish-line checklist for the mission. The nine-item bullet is quoted in [slices/S12-closure/SPEC.md](slices/S12-closure/SPEC.md), lines 37–41. |
| **The six absent facts / the DOD lines** | Six of the nine checklist items the September 8 report did not print. The program now prints seven lines named `DOD-1` … `DOD-8` (no 4 and 9, which were already printed). |
| **Depth** | How many rounds of argument and counter-argument the debate goes. The checklist needs two. |
| **Panel, τ (tau)** | The AI judges that score an argument, and the score they agree on (a number from 0 to 1). "Non-self-graded" means an argument's score never comes only from the model that wrote it. |
| **Final strength** | An argument's score after the counter-arguments against it have been taken into account. The checklist wants proof that this differs from the raw score for at least one top-level argument, i.e. that the debate changed something. |
| **Label and band** | The final answer's verdict (supported / contested / unsupported) and its confidence level, computed by code from the numbers, not written by an AI. |
| **D-number (D74, D73 …), addendum** | Numbered entries in the decision logbook, [DECISIONS.md](DECISIONS.md). An addendum is a dated follow-up note under an entry; letters (a), (b) … are its paragraphs. |
| **Ticket, board** | A to-do card with a status, in the [board](board/) folder. |
| **Packet** | Written instructions handed to an AI worker before it starts a task; in the [packets](packets/) folder. |
| **Seat** | An AI worker: an implementer, a reviewer, or a records writer. |
| **Blind review** | A second AI that did not write the code reads it fresh and tries to break it, like a second doctor's opinion. |
| **Mutant** | A deliberately broken copy of the code, used to check that a test really notices the breakage, like testing a smoke detector with actual smoke. |
| **Gate** | Running the automated tests and type checks at a given commit and recording the counts. "140 / 0 / 0 / 1" means 140 failing tests, 0 test files that failed to load, 0 skipped, 1 unhandled error; every one of those is known and explained. |
| **Credential** | Your secret API key. No AI agent here ever sees it. |
| **Stop threshold, freeze threshold (δ, ε)** | The two tuning numbers you set on 2026-09-18. Stop: how much a position's score must still move between rounds for the debate to keep going deeper (now 0.01). Freeze: the least an argument must be able to move a score to earn further replies (now 0.005). |
| **Sealed register, register version** | The engine reads its policy numbers from a database table whose rows, once written, are never edited ("sealed"). Changing a number means writing a new numbered version next to the old one. The real-run setup is now on version 3. |
| **Confirm-items** | The seven questions the mission's goal asked you to confirm at the end. Answered on 2026-09-18. |
| **Verdict, sign-off** | The reviewer role's written judgement of whether the mission met its goal, item by item, saying what it does not claim. |
| **`dev`, `main`, V2, V3** | `main` is the V2 production site, never touched by this mission; `dev` is V3 and is where all of this lives. |

## Where to look for details

- **What to do next, for the next AI session:** the newest entry at the bottom of [RESUME.md](RESUME.md).
- **What happened, day by day:** [PROGRESS.md](PROGRESS.md), newest section at the bottom.
- **Every decision and why:** [DECISIONS.md](DECISIONS.md); the entries of 2026-09-17 are D74–D76, and everything you decided on 2026-09-18 is D77 with its first addendum, at the end.
- **The final verdict on the whole mission:** [agent-reports/w12-whole-goal-verdict-2026-09-18.md](agent-reports/w12-whole-goal-verdict-2026-09-18.md).
- **Tonight's three changes, plainly:** the plan [docs/superpowers/plans/2026-09-18-owner-rulings-d77.md](../../../docs/superpowers/plans/2026-09-18-owner-rulings-d77.md); the workers' and reviewers' reports are the six files named `d77-…-2026-09-18.md` in [agent-reports](agent-reports/).
- **Every worker's and reviewer's report:** the [agent-reports](agent-reports/) folder; today's are `dod-facts-seat-2026-09-17.md` (the worker) and `dod-facts-review-2026-09-17.md` (the reviewer).
- **The plan for today's fix, in ordinary sentences:** [docs/superpowers/plans/2026-09-17-ceremony-report-six-facts.md](../../../docs/superpowers/plans/2026-09-17-ceremony-report-six-facts.md).
- **The code that prints the new report lines:** [acceptance/dod-facts.ts](../../../acceptance/dod-facts.ts), called from [acceptance/run-acceptance.ts](../../../acceptance/run-acceptance.ts).
