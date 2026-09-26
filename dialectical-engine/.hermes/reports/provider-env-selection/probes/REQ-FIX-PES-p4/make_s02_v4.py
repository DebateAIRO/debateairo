S = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/provider-env-selection/slices/S02/"
t = open(S + "SPEC-v3.md", encoding="utf-8").read()
lines = t.split("\n")
assert lines[3].startswith("SUPERSEDES `SPEC-v2.md`")
lines[3] = ("SUPERSEDES `SPEC-v3.md` (and through it `SPEC-v2.md` and `SPEC.md`; all three frozen and byte-identical) — written by REQ-FIX-PES-p4 at node REQ-FIX pass 4 on V's ruling `docs/missions/provider-env-selection/V-DECISIONS-PACKET.md:24` (V-12/V-13: \"Exit 1 on FAIL\"), not on a review verdict. "
 "Requirements CHANGED from v3: none — R2.1, R2.2, R2.2b, R2.3, R2.4, R2.5, R2.6, R2.7, R2.8, R2.9, R2.10 and R2.11 are byte for byte v3's. "
 "Acceptance §5 changed at step 4 (the run writes its log to a file and prints its own exit code) and step 8 (the ONE exit rule S01 shares: exit 0 on PASS, 1 on FAIL and on UNVERIFIED; the verdict is the acceptance's OWN last line, with pnpm's `$ tsx …` echo before its output and pnpm's `[ELIFECYCLE]` notice after it allowed; V-12's exit-0 default is overruled). §6 records V-12 as ruled. "
 "This file is the SPEC of record; every later packet names it by this file name.")
t = "\n".join(lines)
def rep(old, new):
    global t
    n = t.count(old); assert n == 1, (n, old[:80]); t = t.replace(old, new)
rep("""FROZEN at REQ-FIX-PES's READY marker on t_690beb44 (2026-09-24). Pass 3 is the last rework pass; a
change after that marker is a V row, never an in-place edit.""",
"""FROZEN at REQ-FIX-PES-p4's READY marker on t_aad48581 (2026-09-25). This pass applies V's rulings;
a change after that marker is a V row, never an in-place edit.""")
rep("""4. Run the hosted acceptance:
   `pnpm pes:accept-hosted 2>&1 | tee /tmp/pes-s02-accept.log`.""",
"""4. Run the hosted acceptance:
   `pnpm pes:accept-hosted > /tmp/pes-s02-accept.log 2>&1; echo "exit=$?"`, which prints the
   acceptance's exit code; then read the whole log with `cat /tmp/pes-s02-accept.log`. The log may
   begin with pnpm's own echo line, `$ tsx …`, and, after a non-zero exit, end with pnpm's own
   notice, a line beginning `[ELIFECYCLE]`; neither line is the acceptance's output.""")
rep("""8. The run's LAST stdout line is exactly `PES-S02-ACCEPT: PASS`. A failing run's last line begins
   `PES-S02-ACCEPT: FAIL ` and names the first case that did not hold.""",
"""8. The verdict is the LAST line of the acceptance's OWN output: the log's last line, or the line
   before it when the log's last line begins `[ELIFECYCLE]`. A passing run's verdict is exactly
   `PES-S02-ACCEPT: PASS` and step 4 printed `exit=0`. A failing run's verdict begins
   `PES-S02-ACCEPT: FAIL ` and names the first case that did not hold, and step 4 printed `exit=1`.
   A run that stops UNVERIFIED — because it could not build the trusting `fetch` (R2.5b) or could not
   resolve `api.localtest.me` (R2.6) — has the verdict `PES-S02-ACCEPT: UNVERIFIED ` followed by the
   step that could not run and its own error, and step 4 printed `exit=1`.""")
rep("""None raised by this slice at this pass. The mission's `V-ROW: NEW` blocks are in
`../S01/DECISIONS.md`.""",
"""None open. The ARCH seat's `V-ROW: NEW` on the acceptance's exit code (`DECISIONS.md` of this
slice) was transcribed as V-12, and V ruled "Exit 1 on FAIL" for both acceptances
(`docs/missions/provider-env-selection/V-DECISIONS-PACKET.md:24`); §5 steps 4 and 8 are that
ruling. The mission's other `V-ROW: NEW` blocks are in `../S01/DECISIONS.md` and
`../S03/DECISIONS.md`.""")
open(S + "SPEC-v4.md", "w", encoding="utf-8").write(t)
print("written", len(t.split("\n")))
