#!/usr/bin/env python3
"""REV-PES-S02-p1-correctness-tests mutant runner (written against slice head dfef0de94).
Usage: WORKTREE=<lane dialectical-engine dir> python3 mutate.py <mutants.json> <outdir> [id ...]
Each mutant: {"id","file","old","new","suites":[...],"expect":"RED"|"SURVIVES?"}. Captures the file's bytes BEFORE the
edit, applies exactly one occurrence of old->new (refuses when old is absent or ambiguous), runs vitest on the suites,
restores FROM the captured bytes, then prints `git status --porcelain`."""
import json, os, subprocess, sys, re
W = os.environ["WORKTREE"]; muts = json.load(open(sys.argv[1])); out = sys.argv[2]; only = set(sys.argv[3:])
env = {k: v for k, v in os.environ.items() if k not in ("FORCE_COLOR", "NO_COLOR")}
env["PATH"] = "/opt/homebrew/bin:" + env["PATH"]
for m in muts:
    if only and m["id"] not in only: continue
    path = os.path.join(W, m["file"]); captured = open(path, "rb").read(); text = captured.decode()
    n = text.count(m["old"])
    if n != 1: print(f"{m['id']}: SKIP old occurs {n} times"); continue
    open(path, "w").write(text.replace(m["old"], m["new"], 1))
    try:
        log = os.path.join(out, f"{m['id']}.log")
        r = subprocess.run(["pnpm", "exec", "vitest", "run", *m["suites"]], cwd=W, env=env, capture_output=True, text=True, timeout=500)
        open(log, "w").write(r.stdout + r.stderr)
        tests = [l.strip() for l in (r.stdout + r.stderr).splitlines() if re.match(r"\s*Tests\s", l)]
        failed = sorted({re.sub(r" \d+ms$", "", l.strip()) for l in (r.stdout + r.stderr).splitlines() if l.strip().startswith("×")})
    finally:
        open(path, "wb").write(captured)
    st = subprocess.run(["git", "status", "--porcelain"], cwd=W, capture_output=True, text=True).stdout
    print(f"{m['id']}: rc={r.returncode} {tests[-1] if tests else 'NO-SUMMARY'} | expect {m['expect']}")
    for f in failed: print(f"    {f[:200]}")
    print(f"    restore: git status --porcelain -> {st.strip() or '(empty)'}")
