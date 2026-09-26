# Self-report: REV-PES-S02-p1-security-data-safety (REV(S02) pass 1, security/data-safety lens, ticket t_757b953b)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Verdict: PASS, no B findings, N1–N5. Wall clock about 15 minutes, 16:25 to 16:40 EEST. Roughly 40 tool calls. There was no rework.

## The case file

### 1. The lane runs another mission's dependency store, and nobody's packet said so
- **Cause.** `setup-lane.zsh` clones `node_modules` with `cp -Rc` from the nearest lane. `node_modules/.pnpm` is a symlink, so the symlink is what gets copied. As a result every pes lane, this review worktree included, executes tsx, esbuild and zod out of `.worktrees/i18n-turn12`, a different mission whose lockfile differs from dev's.
- **Second cause.** The S02 lane's reconcile install never ran: `setup-pes-s02.log` shows `L: parameter not set`, and the install came back rc=1 twice. That went unnoticed because the script prints the rc and carries on.
- **How I found it.** Only because my F10 module-load recorder printed absolute paths. No gate reads module URLs.
- **Price.** Nothing this pass. The latent price is a whole-mission outage the day the i18n seat runs `pnpm prune` or installs a different version.
- **Upgrade.** `setup-lane.zsh` should (a) fail loudly when `rc != 0`, (b) dereference `.pnpm`, or give the lane its own store, and (c) assert `readlink node_modules/.pnpm` resolves inside the lane.

### 2. Gate V5(e) was written before anyone ran it against a correct head
- **What happened.** The PLAN demands "no output" from a grep that must match the excluded-port datum the same PLAN requires (PLAN.md:176 against :503).
- **Price.** It cost a BUILD-C2 finding, a C3 note, an orchestrator fold (DECISIONS:142) and a REV charge. That is four seats reading the same contradiction, about 15–25k tokens altogether.
- **Cause.** A static gate went into the PLAN without the author running it against the planned code. The ARCH seat could have run it against the S02-S14 text it wrote.
- **Upgrade.** `packet-check.sh` or ARCH-REV should require every V5-style gate to carry a "measured at <sha> → <output>" cell, just as the §3 cluster table already does.

### 3. Static greps cannot see transitive imports, so F10 needed a behavioural probe
- **The finding.** The F10 question ("does anything in the acceptance's import graph load embedded-postgres?") cannot be answered by `git grep` over `acceptance/pes-s02-*`: `apps/api/src/provider-discovery.ts` could import it three hops down.
- **The probe.** `P/rev-sd-loadlog.mjs` is a 20-line `registerHooks` resolve recorder preloaded through `NODE_OPTIONS`. It answered in one run and also measured `beforeExitListeners`, which is the mechanism F10 fears.
- **Upgrade.** Promote it as a standard probe for every "CLI sets `process.exitCode`" acceptance. It costs about 2 seconds a run.

### 4. The connect/listen recorder answered R2.11 in one run
- **The probe.** `P/rev-sd-netlog.mjs` wraps `net.Socket#connect` and `net.Server#listen` in every vitest worker. It proved that no suite in the slice dials :55432 and that only `127.0.0.1:4460` listens. That took one run of about 60 seconds.
- **Alternative.** Before it, the only method on offer was sampling `lsof` during the run, which is racy and non-conclusive.
- **Upgrade.** Make this the R2.11-class gate in PLANs ("no step connects to X"). It is cheaper and stronger than a grep.

## What I nearly got wrong
- **A false "no throw site".** My first `git grep` for the refusal codes used the pathspecs `'packages/*/src' 'apps/*/src'`, and it returned EMPTY for all ten codes. A wildcard pathspec is matched against the whole path, so `packages/*/src` matches only the directory, never the files inside it. I almost wrote "codes not found at any throw site", which would have been a false B finding. Re-running with the plain pathspecs `packages apps` found every one of them. **This belongs in TOOLING-TRAPS next to the git-root pathspec trap:** "a wildcard pathspec must end in `/*` or use `:(glob)packages/*/src/**`".
- **My first vendor probe got 400 for all 15 cases, the correct literal included.** I had passed a flat raw-header array to `https.request`'s `headers`, and it produced malformed requests. A 400 on every case, correct literal and all, was the tell. Rewriting the probe as raw HTTP over `tls.connect` fixed it. Had I trusted the first output, I would have reported "the fixture refuses everything".
- **Mutant self-check.** I nearly counted the FAIL mutant's `step7 grep token: 0` as proof that nothing leaked. That grep looks for the *fixture* token, not the mutant's wrong token. The separate grep for `rev-sd-wrong-token` was needed, and I ran it (0).

## Dead ends (do not re-derive)
- **Proving the exit codes by occupying 4460–4499** to force `UNVERIFIED port none-free` without a mutant. I rejected it because it would break the other lens's concurrent fixture runs. Temporary mutants in my own worktree, restored from captured bytes, do the same job safely.
- **Reading V's real `.local/dev-auth/api.env`** to exercise the upgrade path. I did not do it, because the file holds real credentials. It is a V test-point step.

## Where this packet was unclear
- **Charge 1 is off by one.** It prescribes `comments read through: 1`, but 2 comments existed at dispatch.
- **Charge 4's rule is too literal.** The "PLAN's documented fake literal" rule is contradicted by PLAN S02-S01's own ordered copy of base fixtures (`Bearer support-test`).
- **Two sections are numbered "8."**
- **The freeze pair is too wide to read.** It spans 498 files. For a slice REV it should be the pair around the S02 package commit only, or the charge should say what to look for in it. I spent one call on it and gained nothing for this lens.
- **The instruction "re-run EVERY cluster command… a disagreement… is a finding" was clear and cheap.** Keep it.

## Upgrades ranked by tokens saved
1. **Measured-gate cells for every static gate in the PLAN.** This kills the V5(e) class. Saves about 20k tokens across 4 seats per occurrence.
2. **`setup-lane.zsh` fails on a non-zero install and owns its store.** This prevents a whole-mission outage. The cost of not doing it is unbounded.
3. **A TRAPS entry for wildcard pathspecs.** Saves one false B finding and one REV rework pass, each worth a full seat cycle.
4. **Ship the load recorder and net recorder as shared probes.** Any lens can answer F10- and R2.11-class questions in one run instead of by argument. Saves about 5–10k tokens per slice.
5. **Packet generator fixes:** the comment count taken from the ticket at dispatch time, unique charge numbers, and a narrow freeze pair.
