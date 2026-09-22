#!/usr/bin/env python3
"""CODE-REV-S02-C5C6 r1 — mutant applier. Exact-string replace, fails loudly if the
anchor is absent, so a mutant can never silently be a no-op."""
import sys, hashlib, pathlib
path, old, new = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
s = path.read_text(encoding="utf8")
n = s.count(old)
if n != 1:
    print(f"ANCHOR-COUNT={n} (expected 1) for {old!r}", file=sys.stderr); sys.exit(3)
path.write_text(s.replace(old, new), encoding="utf8")
print("mutant applied; md5=" + hashlib.md5(path.read_bytes()).hexdigest())
