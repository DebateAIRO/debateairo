#!/usr/bin/env python3
"""Literal, content-matched replacement. Refuses unless OLD occurs exactly once."""
import sys

path, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path, "r", encoding="utf-8") as handle:
    text = handle.read()
count = text.count(old)
if count != 1:
    print(f"REFUSED {path}: match count={count} (need exactly 1)")
    sys.exit(3)
with open(path, "w", encoding="utf-8") as handle:
    handle.write(text.replace(old, new))
print(f"  mutated {path} (1 literal match)")
