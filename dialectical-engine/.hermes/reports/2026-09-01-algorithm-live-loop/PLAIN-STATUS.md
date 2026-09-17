# Where things stand, in plain language

*Written 2026-09-17 for the project owner. This page explains the state of the V3 debate engine work without the code names the other files in this folder use. Every claim links to the file that holds the details. When the detailed records change, this page is updated in the same commit.*

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

### 4. After the run: the last steps to declare the mission finished (mostly agents, with your go)

Once the real run's log exists: a second run with a single AI model (to prove the machine still works when only one provider is available), fitting two tuning numbers from the measured spend (how much the system may spend before it stops), presenting seven remaining questions to you, and then the final sign-off, where the reviewer role declares the mission complete against the checklist. The list, in order, is section 6 of [agent-reports/w12-closure-audit-2026-09-16.md](agent-reports/w12-closure-audit-2026-09-16.md); its addendum at the bottom says what today's fix changed.

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
| **`dev`, `main`, V2, V3** | `main` is the V2 production site, never touched by this mission; `dev` is V3 and is where all of this lives. |

## Where to look for details

- **What to do next, for the next AI session:** the newest entry at the bottom of [RESUME.md](RESUME.md).
- **What happened, day by day:** [PROGRESS.md](PROGRESS.md), newest section at the bottom.
- **Every decision and why:** [DECISIONS.md](DECISIONS.md); today's are D74 and its first addendum, at the end.
- **Every worker's and reviewer's report:** the [agent-reports](agent-reports/) folder; today's are `dod-facts-seat-2026-09-17.md` (the worker) and `dod-facts-review-2026-09-17.md` (the reviewer).
- **The plan for today's fix, in ordinary sentences:** [docs/superpowers/plans/2026-09-17-ceremony-report-six-facts.md](../../../docs/superpowers/plans/2026-09-17-ceremony-report-six-facts.md).
- **The code that prints the new report lines:** [acceptance/dod-facts.ts](../../../acceptance/dod-facts.ts), called from [acceptance/run-acceptance.ts](../../../acceptance/run-acceptance.ts).
