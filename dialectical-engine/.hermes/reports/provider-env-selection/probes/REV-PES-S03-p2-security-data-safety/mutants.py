#!/usr/bin/env python3
"""REV-PES-S03-p2-security-data-safety — mutants against the F1 fix (pass 2 of REV(S03)).

Written against slice head 60993d2db (slice/provider-env-selection-s03). Root from $WORKTREE or argv[1]
(the `dialectical-engine/` dir of ANY checkout of that head). Each mutant: capture the bytes and the
`git status --porcelain -- <path>` line of every path it touches, apply, run v9 + the architecture
baseline, restore FROM THE CAPTURED BYTES (never a literal), prove cmp-equal and porcelain-identical.
Logs: <this dir>/mut-<name>.log ; summary: <this dir>/mutants-summary.json and stdout.
usage: WORKTREE=<abs> python3 mutants.py [name ...]   (no names = all)
"""
import json, os, pathlib, re, subprocess, sys

HERE = pathlib.Path(__file__).resolve().parent
WT = pathlib.Path(os.environ.get("WORKTREE") or sys.argv[1] if (os.environ.get("WORKTREE") or len(sys.argv) > 1) else "")
if not (WT / "deploy/vps/README.md").exists():
    sys.exit("set WORKTREE=<abs dialectical-engine dir> (or argv[1])")
ARGS = [a for a in sys.argv[1:] if not a.startswith("/")]
ENV = dict(os.environ, PATH="/opt/homebrew/bin:" + os.environ.get("PATH", ""))
README = "deploy/vps/README.md"
TEST = "tests/unit/v9-provider-credential-files.test.ts"
PROV = "packages/providers/src/index.ts"
V9, BASE = TEST, "tests/architecture/vps-deployment-baseline.test.ts"

TWELVE = ["COST_ENVELOPE_POLICY_INVALID", "COST_ENVELOPE_POLICY_UNRESOLVED", "CUSTODY_GROUP_UNRESOLVED",
          "PROVIDER_CREDENTIAL_FILE_ABSENT", "PROVIDER_CREDENTIAL_FILE_INVALID",
          "PROVIDER_DISCOVERY_TARGET_PRICE_INVALID", "PROVIDER_TARGET_PRICE_REQUIRED",
          "PROVIDER_TARGET_PRICE_ZERO", "SECRET_CUSTODY_INVALID", "SUPPORT_ADMISSION_SCOPES_NOT_SEALED",
          "SUPPORT_MODEL_CREDENTIAL_ABSENT", "SUPPORT_MODEL_PATH_NOT_RATIFIED"]


def drop_row(prefix):
    def f(t):
        lines = t.split("\n")
        kept = [l for l in lines if not l.startswith(prefix)]
        assert len(kept) == len(lines) - 1, f"row not unique/found: {prefix}"
        return "\n".join(kept)
    return f


def insert_after_row(prefix, new):
    def f(t):
        lines = t.split("\n")
        i = [n for n, l in enumerate(lines) if l.startswith(prefix)]
        assert len(i) == 1, prefix
        lines.insert(i[0] + 1, new)
        return "\n".join(lines)
    return f


def insert_before(anchor, new):
    def f(t):
        assert t.count(anchor) == 1, anchor
        return t.replace(anchor, new + anchor)
    return f


def replace_once(old, new):
    def f(t):
        assert t.count(old) == 1, old[:60]
        return t.replace(old, new)
    return f


def replace_all(old, new):
    def f(t):
        assert old in t, old
        return t.replace(old, new)
    return f


RETYPE_FROM = "    const union = new Set<string>();\n    for (const [source, from, until] of anchors) {"
RETYPE_UNTIL = "      for (const code of codes) union.add(code);\n    }\n"


def retype(t):
    a = t.index(RETYPE_FROM)
    b = t.index(RETYPE_UNTIL, a) + len(RETYPE_UNTIL)
    lit = "    const union = new Set<string>(" + json.dumps(TWELVE) + ");\n"
    return t[:a] + lit + t[b:]


# a 13th start-up code inside anchor E4 (assertPricedProviderTargets), before its closing brace
CEILING = replace_once(
    "      throw new TypeError(`PROVIDER_TARGET_PRICE_ZERO:${target.providerRef}`);\n    }\n",
    "      throw new TypeError(`PROVIDER_TARGET_PRICE_ZERO:${target.providerRef}`);\n    }\n"
    "    if (price.inputMicrosPerMillionTokens > 1e12) throw new TypeError(`PROVIDER_TARGET_PRICE_CEILING:${target.providerRef}`);\n")

ADM = "| `SUPPORT_ADMISSION_SCOPES_NOT_SEALED` |"
HDR = "### What the hosted mode refuses, in code\n"
TABLE_HDR = "| Code | Meaning |\n"

MUTANTS = {
    # --- pass-1 mutants (correctness B1 rows :779/:780/:781, security N3 A + DAILY, control :784) ---
    "p1-drop-PRICE_INVALID": [(README, drop_row("| `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` |"))],
    "p1-drop-PRICE_REQUIRED": [(README, drop_row("| `PROVIDER_TARGET_PRICE_REQUIRED:`"))],
    "p1-drop-PRICE_ZERO": [(README, drop_row("| `PROVIDER_TARGET_PRICE_ZERO:`"))],
    "p1-insert-DAILY-row": [(README, insert_after_row(ADM, "| `DAILY_COST_ENVELOPE_REACHED` | the day's cost envelope is spent. |"))],
    "p1-control-drop-SUPPORT_ADMISSION": [(README, drop_row(ADM))],
    # --- the named residual: the source-inventory retype ---
    "retype-at-head": [(TEST, retype)],
    "source-rename-PRICE_ZERO": [(PROV, replace_all("PROVIDER_TARGET_PRICE_ZERO", "PROVIDER_TARGET_PRICE_NIL"))],
    "retype+source-rename-PRICE_ZERO": [(TEST, retype), (PROV, replace_all("PROVIDER_TARGET_PRICE_ZERO", "PROVIDER_TARGET_PRICE_NIL"))],
    "source-add-13th-code": [(PROV, CEILING)],
    "retype+source-add-13th-code": [(TEST, retype), (PROV, CEILING)],
    # --- security lens: V-8 codes in the refusal span but not in the first column ---
    "v8-in-meaning-cell": [(README, replace_once(ADM, ADM + " unlike `DAILY_COST_ENVELOPE_REACHED`, which stops a run at run time;"))],
    "v8-prose-above-table": [(README, replace_once(HDR + "\n" + TABLE_HDR, HDR + "\n" + "A run that stops with `DAILY_COST_ENVELOPE_REACHED` is refused here too.\n\n" + TABLE_HDR))],
    "v8-second-table-above": [(README, replace_once(HDR + "\n" + TABLE_HDR, HDR + "\n" + "| Run-time code | Meaning |\n|---|---|\n| `DAILY_COST_ENVELOPE_REACHED` | the day's envelope is spent. |\n\n" + TABLE_HDR))],
    "v8-all-four-prose-below": [(README, replace_once("\n### The credential-file contract", "\nRun-time stops `RUN_COST_ENVELOPE_MONEY_REACHED`, `PROVIDER_USAGE_UNREPORTED`, `COST_ENVELOPE_CHARGE_UNREPRESENTABLE` and `DAILY_COST_ENVELOPE_REACHED` are refused at boot as well.\n\n### The credential-file contract"))],
    # --- security lens: table heading claim (charge 5: the heading still says what it refuses) ---
    "heading-reworded": [(README, replace_once(HDR, "### What the hosted mode refuses\n"))],
    # --- security lens: a literal-only table code renamed in source (outside the 8 anchors) ---
    "source-rename-LOOPBACK": [(PROV, replace_all("PROVIDER_TARGET_LOOPBACK_REFUSED", "PROVIDER_TARGET_LOCALHOST_REFUSED"))],
    "source-rename-AUTH_FILE_UNUSABLE": [(PROV, replace_all("PROVIDER_AUTHORIZATION_FILE_UNUSABLE", "PROVIDER_AUTHORIZATION_FILE_REFUSED"))],
    # --- merge exposure: the slice's pins run against origin/dev's README (read by `git show`, never checked out) ---
    "origin-dev-readme": [(README, lambda _t: subprocess.run(["git", "show", "origin/dev:dialectical-engine/deploy/vps/README.md"], cwd=WT, capture_output=True, text=True, check=True).stdout)],
}
# suites beyond v9 + baseline that a mutant is also run against (behavioural suites holding the code as a literal)
EXTRA = {
    "source-rename-LOOPBACK": ["tests/unit/v9-deployment-mode.test.ts", "tests/unit/v30-support-provider.test.ts"],
    "source-rename-AUTH_FILE_UNUSABLE": ["tests/unit/v9-deployment-mode.test.ts"],
}


def porcelain(p):
    return subprocess.run(["git", "status", "--porcelain", "--", p], cwd=WT, capture_output=True, text=True).stdout


def run(suite, log):
    r = subprocess.run(["pnpm", "exec", "vitest", "run", suite], cwd=WT, capture_output=True, text=True, env=ENV)
    out = r.stdout + r.stderr
    with open(log, "a") as fh:
        fh.write(f"===== {suite} rc={r.returncode}\n{out}\n")
    s = [l for l in out.splitlines() if re.match(r"^\s*Tests\s+", l)]
    s = s[-1].strip() if s else "NO SUMMARY"
    fails = sorted(set(re.sub(r"\s+\d+ms$", "", l.strip()) for l in out.splitlines() if re.match(r"^\s*(×|FAIL)\s", l)))
    return {"rc": r.returncode, "summary": s, "failed": fails}


def main():
    names = ARGS or list(MUTANTS)
    results = {}
    for name in names:
        edits = MUTANTS[name]
        log = HERE / f"mut-{name}.log"
        log.write_text(f"mutant {name} @ {subprocess.run(['git','rev-parse','--short','HEAD'],cwd=WT,capture_output=True,text=True).stdout.strip()}\n")
        saved = {}
        for p, _ in edits:
            if p not in saved:
                saved[p] = ((WT / p).read_bytes(), porcelain(p))
        try:
            for p, fn in edits:
                (WT / p).write_text(fn((WT / p).read_text()))
            res = {"v9": run(V9, log), "baseline": run(BASE, log)}
            for s in EXTRA.get(name, []):
                res[s] = run(s, log)
        finally:
            restore = {}
            for p, (b, por) in saved.items():
                (WT / p).write_bytes(b)
                restore[p] = {"cmp": (WT / p).read_bytes() == b, "porcelain_same": porcelain(p) == por}
        res["restore"] = restore
        results[name] = res
        print(f"{name:34} v9[{res['v9']['summary']}] base[{res['baseline']['summary']}] restore={restore}")
        for f in res["v9"]["failed"]:
            print(f"    v9 FAIL {f}")
        for s in EXTRA.get(name, []):
            print(f"    extra {s}: {res[s]['summary']} failed={len(res[s]['failed'])}")
    out = HERE / "mutants-summary.json"
    prev = json.loads(out.read_text()) if out.exists() else {}
    prev.update(results)
    out.write_text(json.dumps(prev, indent=1))
    print("tree porcelain lines:", len(subprocess.run(["git", "status", "--porcelain"], cwd=WT, capture_output=True, text=True).stdout.splitlines()))


if __name__ == "__main__":
    main()
