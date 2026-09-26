#!/usr/bin/env python3
"""REQ-FIX-PES pass-2 detectors — one per finding assigned to this node.

Run it twice:
    python3 detectors.py v1     # the pre-rework documents — MUST report FAIL
    python3 detectors.py v2     # the rework           — MUST report PASS

A detector that has only ever passed is a decoration. Each check below is run
against the v1 documents FIRST, is watched failing there, and only then is its
v2 PASS quoted. v1 is not a synthetic mutant: it is the exact text the blind
REQ-REV pass reviewed, still on disk (SPEC.md) or in git (INSTRUCTIONS.md at
84106e07).

Exit code 0 = every check held, 1 = at least one did not.
"""
import re
import subprocess
import sys

REPO = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine"
MISSION = f"{REPO}/docs/missions/provider-env-selection"
V1_COMMIT = "84106e07"


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def git_show(commit, repo_relative):
    out = subprocess.run(
        ["git", "-C", REPO, "show", f"{commit}:{repo_relative}"],
        capture_output=True, text=True, check=True)
    return out.stdout


def documents(version):
    """The four documents each version is judged on."""
    if version == "v1":
        return {
            "S01": read(f"{MISSION}/slices/S01/SPEC.md"),
            "S02": read(f"{MISSION}/slices/S02/SPEC.md"),
            "INSTRUCTIONS": git_show(
                V1_COMMIT,
                "dialectical-engine/docs/missions/provider-env-selection/INSTRUCTIONS.md"),
            "S02PLAN": git_show(
                V1_COMMIT,
                "dialectical-engine/docs/missions/provider-env-selection/slices/S02/PLAN.md"),
            "S01PLAN": git_show(
                V1_COMMIT,
                "dialectical-engine/docs/missions/provider-env-selection/slices/S01/PLAN.md"),
        }
    return {
        "S01": read(f"{MISSION}/slices/S01/SPEC-v2.md"),
        "S02": read(f"{MISSION}/slices/S02/SPEC-v2.md"),
        "INSTRUCTIONS": read(f"{MISSION}/INSTRUCTIONS.md"),
        "S02PLAN": read(f"{MISSION}/slices/S02/PLAN.md"),
        "S01PLAN": read(f"{MISSION}/slices/S01/PLAN.md"),
    }


# --- B1 -------------------------------------------------------------------
# The class: the hosted set's inputs do not determine the row. The row needs
# six things (packages/register/src/configured-provider-set.ts:177-196). A SPEC
# that determines the row names a source for each, and does NOT claim the
# shipped parser as one (packages/providers/src/index.ts:232-235 takes the
# already-published set as its second argument).
ROW_MEMBERS = ["providerRef", "adapterKind", "maker", "vetting",
               "requiredDistinctMakers", "sealedSourceRef"]


def check_b1(docs):
    s01 = docs["S01"]
    problems = []
    table = re.search(r"\| row member \| its ONE source \|(.+?)\n\n", s01, re.S)
    if table is None:
        problems.append("no `row member | its ONE source` table in the S01 SPEC of record")
    else:
        body = table.group(1)
        for member in ROW_MEMBERS:
            if member not in body:
                problems.append(f"row member {member} has no named source")
    if "composed from two inputs and from nothing else" in s01:
        problems.append("still claims two inputs determine the row")
    # the vacuous order code must be gone as a REFUSAL the command can emit
    for line in s01.splitlines():
        if "PES_PUBLISH_SET_ORDER_MISMATCH" in line and "REMOVED" not in line:
            problems.append(f"vacuous order code still live: {line.strip()[:90]}")
    if "PES_PUBLISH_SET_TARGETS_REJECTED" not in s01:
        problems.append("no shipped-parser self-check replaces the order code")
    return problems


# --- B2 -------------------------------------------------------------------
# The class: one frozen document says two things. No document may assert that
# S02 waits on S01 while S02's own steps never publish.
S01_DEPENDENCY = re.compile(
    r"(S02 depends on S01"
    r"|Depends on S01"
    r"|publishes the hosted row with S01's command"
    r"|publishes with S01's command"
    r"|UNVERIFIED until S01"
    r"|[Uu]ntil S01 is merged"
    r"|until S01 is in the lane"
    r"|merged into this lane, or step 5)")
# The claim is PROSE and prose WRAPS, so a per-line regex reads only the first
# half of a wrapped sentence. (v1 of this detector did exactly that and missed
# S02's own header at SPEC.md:7-8, finding only the two unwrapped copies — the
# same class of defect it exists to catch: a check whose input does not
# determine its verdict. It is matched over the flattened document instead, and
# the line number is recovered from the match offset.)
WITHDRAWN = ("withdraw", "not a frame", "v1 of s02", "the dependency is")


def check_b2(docs):
    problems = []
    for name in ("S02", "INSTRUCTIONS", "S02PLAN"):
        text = docs[name]
        flat = text.replace("\n", " ")
        for match in S01_DEPENDENCY.finditer(flat):
            window = flat[max(0, match.start() - 220):match.end() + 220].lower()
            if any(token in window for token in WITHDRAWN):
                continue
            number = text.count("\n", 0, match.start()) + 1
            problems.append(f"{name}:~{number} still claims the S01 dependency: "
                            f"{flat[match.start():match.start() + 90].strip()}")
    return problems


# --- B3 -------------------------------------------------------------------
# The class: a rule forbids an output another rule requires. Every code the
# acceptance must print that contains `authorization` has to be declared
# lawful by the stdout rule.
CODE = re.compile(r"\b(PROVIDER_[A-Z_]*AUTHORIZATION[A-Z_]*|[A-Z_]*AUTHORIZATION[A-Z_]*)\b")


def check_b3(docs):
    s02 = docs["S02"]
    problems = []
    acceptance = s02.split("## 5. Acceptance")[-1]
    required = {c for c in CODE.findall(acceptance) if c.isupper() and len(c) > 12}
    rule = ""
    for block in s02.split("\n\n"):
        if block.lstrip().startswith("**R2.9"):
            rule = block
    if not rule:
        problems.append("no R2.9 block found")
        return problems
    forbids_the_word = bool(re.search(r"contains? .*the words? `?Bearer`? or `?authorization`?", rule))
    if forbids_the_word:
        problems.append("R2.9 forbids the WORD `authorization`, which the acceptance must print")
    lawful = {c for c in CODE.findall(rule)}
    for code in sorted(required):
        if code not in lawful:
            problems.append(f"acceptance prints {code}; R2.9 does not declare it lawful")
    return problems


# --- the assigned N findings ---------------------------------------------
def check_n(docs):
    s01, s02 = docs["S01"], docs["S02"]
    problems = []
    # N3 — the body the shipped probe accepts, quoted
    if not ("`OK`" in s02 and "choices[0].message.content" in s02
            and "provider-probe.ts:103" in s02):
        problems.append("N3: R2.5 does not quote the body provider-probe.ts:103 accepts")
    # N4 — the trust mechanism named, and the two forbidden ones named
    if not ("fetchImplementation" in s02 and "NODE_TLS_REJECT_UNAUTHORIZED" in s02):
        problems.append("N4: the TLS trust mechanism is not named")
    # N5 — the runner environment record named
    if "dev-runner-process.ts:85-128" not in s02:
        problems.append("N5: the runner environment record is not named")
    # N7 — the suite path in acceptance step 2
    acceptance = s02.split("## 5. Acceptance")[-1]
    if "tests/unit/v9-deployment-mode.test.ts" not in acceptance:
        problems.append("N7: acceptance step 2 names no suite path")
    if "the suite `PLAN.md` names" in acceptance or "the suite PLAN.md names" in acceptance:
        problems.append("N7: acceptance step 2 still defers the path to PLAN.md")
    # N8 — a record step before the run
    if "Record the NO-TOUCH stack as it stands" not in acceptance:
        problems.append("N8: no step records the lsof baseline before the run")
    # N9 — the hosted receipt prefix as a literal
    if "PES_HOSTED_PROVIDER_SET_RECEIPT_V1=" not in s01:
        problems.append("N9: R1.8 names no literal receipt prefix")
    # N10 — the two parse call sites, corrected
    if not ("main.ts:300" in s01 and "runner/src/main.ts:74" in s01):
        problems.append("N10: the two parse call sites are not cited at 300 / 74")
    return problems


# --- mechanical checks that ride along ------------------------------------
BANNED = re.compile(r"\b(improve\w*|better|robust\w*|handle\w*|appropriate\w*)\b", re.I)


def check_banned(docs):
    problems = []
    for name in ("S01", "S02"):
        for number, line in enumerate(docs[name].splitlines(), 1):
            if BANNED.search(line):
                problems.append(f"{name}:{number} banned word in a SPEC: {line.strip()[:70]}")
    return problems


REQ_ID = re.compile(r"^\*\*(R\d+\.\d+[a-z]?)")
PLAN_ID = re.compile(r"^\| (R\d+\.\d+[a-z]?) ")


def check_trace(docs):
    problems = []
    for spec_key, plan_key in (("S01", "S01PLAN"), ("S02", "S02PLAN")):
        spec_ids = {m.group(1) for line in docs[spec_key].splitlines()
                    if (m := REQ_ID.match(line))}
        plan_ids = {m.group(1) for line in docs[plan_key].splitlines()
                    if (m := PLAN_ID.match(line))}
        for missing in sorted(spec_ids - plan_ids):
            problems.append(f"{spec_key}: requirement {missing} has no PLAN trace row")
        for orphan in sorted(plan_ids - spec_ids):
            problems.append(f"{spec_key}: PLAN row {orphan} traces to no requirement")
    return problems


CHECKS = [
    ("B1  hosted-set inputs determine the row", check_b1),
    ("B2  S02 is vertical in every document", check_b2),
    ("B3  the stdout rule admits the codes the acceptance prints", check_b3),
    ("N3,N4,N5,N7,N8,N9,N10  named sources", check_n),
    ("--  no banned word in a SPEC", check_banned),
    ("--  SPEC<->PLAN trace, both directions", check_trace),
]


def main():
    version = sys.argv[1] if len(sys.argv) > 1 else "v2"
    docs = documents(version)
    failed = 0
    print(f"REQ-FIX-PES detectors against {version}")
    for label, check in CHECKS:
        problems = check(docs)
        if problems:
            failed += 1
            print(f"  FAIL  {label}")
            for problem in problems:
                print(f"          - {problem}")
        else:
            print(f"  pass  {label}")
    print(f"{version}: {'FAIL' if failed else 'PASS'} ({failed} failing checks)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
