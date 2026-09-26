#!/usr/bin/env python3
"""REQ-FIX-PES-p4 checks — one per V ruling applied at this node (V-DECISIONS-PACKET.md:19-27).

    python3 p4_checks.py old   # S01 SPEC-v3, S02 SPEC-v3, S03 SPEC.md  — MUST FAIL (the rulings are not in them)
    python3 p4_checks.py new   # S01 SPEC-v4, S02 SPEC-v4, S03 SPEC-v2  — MUST PASS

What a check reads from a SPEC is which fixture, rule, command or citation it states; the verdict
comes from executing that command in a shell, reading the cited lines of the read-only lane, or
applying the stated rule to the stated fixture. Exit 0 = every check held.
"""
import json
import os
import re
import subprocess
import sys
import tempfile

REPO = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
LANE = f"{REPO}/.worktrees/pes-base/dialectical-engine"
SLICES = f"{REPO}/docs/missions/provider-env-selection/slices"
FILES = {"old": {"S01": "S01/SPEC-v3.md", "S02": "S02/SPEC-v3.md", "S03": "S03/SPEC.md"},
         "new": {"S01": "S01/SPEC-v4.md", "S02": "S02/SPEC-v4.md", "S03": "S03/SPEC-v2.md"}}


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def spec(version, code):
    return read(f"{SLICES}/{FILES[version][code]}")


def block(text, req):
    m = re.search(rf"^\*\*{re.escape(req)}\b.*?(?=^\*\*R\d|^## )", text, re.S | re.M)
    return m.group(0) if m else ""


def flat(text):
    return " ".join(text.split())


def step(text, number):
    acc = text.split("## 5. Acceptance")[-1].split("\n## ")[0]
    m = re.search(rf"^{number}\. (.*?)(?=^\d+\. |\Z)", acc, re.S | re.M)
    return flat(m.group(1)) if m else ""


# ------------------------------------------------------------------ V-10 (S01)
def role_schema():
    """kind literal and exact key set of each role row, read from the SHIPPED schema."""
    src = read(f"{LANE}/packages/register/src/algorithm-policy.ts")
    out = {}
    for key in ("synthesizerRoleRef", "evaluatorRoleRef"):
        m = re.search(rf"  {key}: z\.object\(\{{(.*?)\}}\)\.strict\(\)", src, re.S)
        body = m.group(1)
        out[key] = {"kind": re.search(r'kind: z\.literal\("([A-Z_]+)"\)', body).group(1),
                    "keys": sorted(re.findall(r"^\s+(\w+):", body, re.M))}
    return out


def check_v10(version):
    text = spec(version, "S01")
    problems = []
    # the requirement: a PES_PUBLISH_ code, both row keys, the absent-row path
    req = next((block(text, r) for r in re.findall(r"^\*\*(R1\.\d+)", text, re.M)
                if "synthesizerRoleRef" in block(text, r) and "PES_PUBLISH_" in block(text, r)
                and "refus" in block(text, r)), "")
    if not req:
        return ["no requirement refuses a set that drops a role row's provider with a PES_PUBLISH_ code"]
    code = re.search(r"`(PES_PUBLISH_[A-Z_]+:)`", req).group(1)
    rule_id = re.match(r"\*\*(R1\.\d+)", req).group(1)
    f = flat(req)
    if "evaluatorRoleRef" not in f:
        problems.append(f"{rule_id} names no evaluatorRoleRef row")
    if not re.search(r"absent is not checked|holds neither row passes", f):
        problems.append(f"{rule_id} does not say what a base with no role rows does")
    # its place in R1.3's order: after the self-check, before the publication
    order = flat(block(text, "R1.3"))
    items = dict((int(n), body) for n, body in re.findall(r"\((\d)\) (.*?)(?=; \(\d\)|\. The |$)", order))
    role_at = next((n for n, b in items.items() if rule_id in b), None)
    pub_at = next((n for n, b in items.items() if "publication" in b), None)
    if role_at is None or pub_at is None or not role_at < pub_at:
        problems.append(f"R1.3's order does not place {rule_id} before the publication: {items}")
    # the §5 case: apply the stated rule to the stated seed and roster, compare with the table
    seed = dict(re.findall(r"`(synthesizerRoleRef|evaluatorRoleRef)` with the value `(\{[^`]*\})`", flat(block(text, "R1.12"))))
    fenced = re.search(r"ROSTER ELEMENT E[^\n]*\n+```json\n(.+?)\n```", text, re.S)
    e = json.loads(fenced.group(1))
    row = re.search(r"^\| `(role-[a-z-]+)` \| `E` \| — \| [^|]+ \| `([A-Za-z_:]+)` \|$", text, re.M)
    if not seed or not row:
        return problems + ["§5 has no case with seeded role rows and an expected line"]
    schema = role_schema()
    printed = "PASSES"
    for key in ("synthesizerRoleRef", "evaluatorRoleRef"):  # the order the requirement states
        if key not in seed:
            continue
        value = json.loads(seed[key])
        if value.get("kind") != schema[key]["kind"] or sorted(value) != schema[key]["keys"]:
            problems.append(f"seeded {key} {value} is not the shape the shipped schema admits {schema[key]}")
        if not (isinstance(value, dict) and value.get("providerRef") == e["provider_ref"]):
            printed = f"{code}{key}"
            break
    if printed != row.group(2):
        problems.append(f"case {row.group(1)}: the table says `{row.group(2)}`, {rule_id} applied to its seed prints `{printed}`")
    if printed == f"{code}synthesizerRoleRef":
        problems.append("the case cannot tell the rule from 'refuse whenever a role row exists'")
    return problems


# ------------------------------------------------------------------ V-12 / V-13 (S01 + S02)
STUBS = {
    "PASS": ["$ tsx acceptance/x.ts", "OWN line", "{p}-ACCEPT: PASS"], "PASS_rc": 0,
    "FAIL": ["$ tsx acceptance/x.ts", "OWN line", "{p}-ACCEPT: FAIL case-x", "[ELIFECYCLE] Command failed with exit code 1."], "FAIL_rc": 1,
    "UNVERIFIED": ["$ tsx acceptance/x.ts", "{p}-ACCEPT: UNVERIFIED step-x err", "[ELIFECYCLE] Command failed with exit code 1."], "UNVERIFIED_rc": 1,
}


def run_command(command, pnpm_script, outcome, prefix):
    """Run the SPEC's own command line in zsh with `pnpm <script>` replaced by a stub that prints
    what pnpm prints around an acceptance with this outcome and exits with the ruled code."""
    lines = [l.format(p=prefix) for l in STUBS[outcome]]
    rc = STUBS[f"{outcome}_rc"]
    with tempfile.TemporaryDirectory(prefix="pes-p4-") as tmp:
        stub = os.path.join(tmp, "stub.sh")
        with open(stub, "w") as h:
            h.write("#!/bin/sh\n" + "".join(f"printf '%s\\n' '{l}'\n" for l in lines) + f"exit {rc}\n")
        os.chmod(stub, 0o755)
        log = re.search(r"(/tmp/pes-s0\d-accept\.log)", command).group(1)
        cmd = command.replace(f"pnpm {pnpm_script}", stub).replace(log, os.path.join(tmp, "a.log"))
        out = subprocess.run(["zsh", "-c", cmd], capture_output=True, text=True).stdout
        logtext = read(os.path.join(tmp, "a.log")) if os.path.exists(os.path.join(tmp, "a.log")) else ""
    return out, logtext


def verdict_by_rule(rule, logtext):
    """Apply the step's verdict rule as worded: 'LAST stdout line' (v3) or 'last line of the
    acceptance's OWN output … the line before it when the log's last line begins [ELIFECYCLE]'."""
    lines = [l for l in logtext.splitlines() if l]
    if "line before it when the log's last line begins `[ELIFECYCLE]`" in rule:
        return lines[-2] if lines[-1].startswith("[ELIFECYCLE]") else lines[-1]
    return lines[-1]


def check_exit_rule(version):
    problems = []
    rules = {}
    for code, script, run_step, verdict_step in (("S01", "pes:accept-publish-set", 2, 6),
                                                  ("S02", "pes:accept-hosted", 4, 8)):
        text = spec(version, code)
        prefix = f"PES-{code}"
        command = re.search(r"`(pnpm " + re.escape(script) + r"[^`]*)`", step(text, run_step)).group(1)
        rule = step(text, verdict_step)
        rules[code] = rule
        for outcome in ("PASS", "FAIL", "UNVERIFIED"):
            out, logtext = run_command(command, script, outcome, prefix)
            verdict = verdict_by_rule(rule, logtext)
            want_exit = f"exit={STUBS[outcome + '_rc']}"
            if not verdict.startswith(f"{prefix}-ACCEPT: {outcome}"):
                problems.append(f"{code} {outcome}: step {verdict_step}'s rule reads `{verdict}` as the verdict")
            if want_exit not in out:
                problems.append(f"{code} {outcome}: step {run_step}'s command shows no `{want_exit}` (printed {out.strip()!r})")
            # the sentence that states THIS outcome's verdict must state THIS outcome's exit code
            sentence = next((x for x in re.split(r"(?<=\.) (?=A )", rule) if f"-ACCEPT: {outcome}" in x), "")
            if f"`{want_exit}`" not in sentence or re.search(r"`exit=(?!%s)\d`" % want_exit[-1], sentence):
                problems.append(f"{code} {outcome}: step {verdict_step}'s {outcome} sentence does not state `{want_exit}` alone")
            if outcome == "UNVERIFIED" and "UNVERIFIED" not in rule:
                problems.append(f"{code}: step {verdict_step} states no UNVERIFIED verdict")
    # ONE rule: the two steps read the same once the slice names are normalised
    norm = lambda r, c, s: re.sub(r"step \d", "step N", r.replace(c, "S0X"))
    core = lambda r: r.split(" A run ")[0] if " A run " in r else r
    if core(norm(rules["S01"], "S01", 0)) != core(norm(rules["S02"], "S02", 0)):
        problems.append("S01 and S02 state the PASS/FAIL exit rule in different words")
    # S01's first-line step must admit pnpm's echo
    first = step(spec(version, "S01"), 3)
    if "$ tsx" not in first:
        problems.append("S01 step 3 says 'the first line', which is pnpm's `$ tsx …` echo, not SCRATCH-DB")
    return problems


# ------------------------------------------------------------------ V-11 (S03)
def cited_lines(path, span):
    a, _, b = span.partition("-")
    lines = read(f"{LANE}/{path}").splitlines()
    return "\n".join(lines[int(a) - 1:int(b or a)])


def check_v11(version):
    r34 = flat(block(spec(version, "S03"), "R3.4"))
    problems = []
    for live in ("COST_ENVELOPE_POLICY_UNRESOLVED", "COST_ENVELOPE_POLICY_INVALID"):
        if live not in r34:
            problems.append(f"R3.4 does not name `{live}` as what a hosted operator meets")
    if not re.search(r"integrity of the build|build-integrity", r34):
        problems.append("R3.4 does not call `COST_ENVELOPES_NOT_SEALED` a build-integrity check")
    if re.search(r"refuses to start until the cost envelopes are sealed, with the code `COST_ENVELOPES_NOT_SEALED`", r34):
        problems.append("R3.4 still states `COST_ENVELOPES_NOT_SEALED` as the start-up refusal")
    # every citation R3.4 makes must hold the token it is cited for, in the lane
    expect = {"packages/register/src/cost-envelope-policy.ts:163-166": "COST_ENVELOPE_POLICY_UNRESOLVED",
              "packages/register/src/cost-envelope-policy.ts:131-134": "COST_ENVELOPE_POLICY_INVALID",
              "apps/api/src/main.ts:241-242": "readCostEnvelopePolicy",
              "apps/runner/src/main.ts:111": "readCostEnvelopePolicy",
              "packages/register/src/runtime-environment.ts:112-115": "unreachable",
              "packages/register/src/runtime-environment.ts:118-124": "LIVE FAIL-CLOSED GATE"}
    cites = re.findall(r"`((?:packages|apps)/[\w/.\-]+\.ts):(\d+(?:-\d+)?)`", r34)
    base = None
    for path, span in cites:
        base = path
    # expand bare `:NNN-MMM` cites to the path before them
    expanded = []
    last = None
    for m in re.finditer(r"`(?:((?:packages|apps)/[\w/.\-]+\.ts))?:(\d+(?:-\d+)?)`", r34):
        last = m.group(1) or last
        expanded.append(f"{last}:{m.group(2)}")
    for cite, token in expect.items():
        if cite not in expanded:
            if version == "new":
                problems.append(f"R3.4 does not cite {cite}")
            continue
        path, span = cite.split(":")
        if token not in cited_lines(path, span):
            problems.append(f"{cite} does not hold `{token}` in the lane")
    return problems


CHECKS = [("V-10  S01 refuses a set dropping a role row's provider; §5 case agrees with the rule", check_v10),
          ("V-12/13 one exit rule, executed through the SPEC's own command", check_exit_rule),
          ("V-11  S03 R3.4 names the live codes; its citations hold in the lane", check_v11)]


def main():
    version = sys.argv[1] if len(sys.argv) > 1 else "new"
    failed = 0
    print(f"REQ-FIX-PES-p4 checks against {version}: {FILES[version]}")
    for label, check in CHECKS:
        try:
            problems = check(version)
        except Exception as error:
            problems = [f"CHECK CRASHED: {type(error).__name__}: {error}"]
        print(f"  {'FAIL' if problems else 'pass'}  {label}")
        for p in problems:
            print(f"          - {p}")
        failed += bool(problems)
    print(f"{version}: {'FAIL' if failed else 'PASS'} ({failed} failing checks)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
