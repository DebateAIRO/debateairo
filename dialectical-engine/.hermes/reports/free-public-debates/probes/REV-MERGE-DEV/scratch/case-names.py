#!/usr/bin/env python3
"""REV-MERGE-DEV charge 2 — case-name set diff of a test file across four revisions.
Usage: case-names.py <repo-root> <path-relative-to-repo-root>...
Extracts every it()/test()/describe() title literal, without executing anything."""
import re, subprocess, sys

PAT = re.compile(r"""\b(it|test|describe)(?:\.(?:each|skip|only|todo|concurrent|sequential|failing)\b[^(]*)?\s*\(\s*(?:(?P<q>["'`])(?P<t>(?:\\.|(?!(?P=q)).)*?)(?P=q))""", re.S)

def titles(root, rev, path):
    r = subprocess.run(["git", "-C", root, "show", f"{rev}:./{path}"], capture_output=True, text=True)
    if r.returncode != 0:
        return None
    out = []
    for m in PAT.finditer(r.stdout):
        out.append((m.group(1), " ".join(m.group("t").split())))
    return out

def main():
    root, paths = sys.argv[1], sys.argv[2:]
    revs = {"base": "f19c706f", "ours": "64d052b4", "theirs": "cbf1b281", "merged": "df06aedf"}
    for path in paths:
        print(f"################ {path}")
        sets = {}
        for name, rev in revs.items():
            t = titles(root, rev, path)
            if t is None:
                print(f"  {name:7s} ABSENT")
                sets[name] = None
                continue
            sets[name] = t
            cases = [x for x in t if x[0] in ("it", "test")]
            print(f"  {name:7s} describe={sum(1 for x in t if x[0]=='describe')} cases={len(cases)}")
        merged = set(sets["merged"] or [])
        for side in ("ours", "theirs"):
            s = set(sets[side] or [])
            lost = sorted(x for x in s - merged)
            if lost:
                print(f"  LOST-FROM-{side.upper()} ({len(lost)}):")
                for kind, title in lost:
                    print(f"    - [{kind}] {title}")
            else:
                print(f"  LOST-FROM-{side.upper()}: none")
        added = sorted(merged - set(sets['ours'] or []) - set(sets['theirs'] or []))
        if added:
            print(f"  NEW-IN-MERGED-ONLY ({len(added)}):")
            for kind, title in added:
                print(f"    + [{kind}] {title}")
main()
