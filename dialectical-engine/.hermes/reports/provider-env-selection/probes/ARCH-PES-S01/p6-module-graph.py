#!/usr/bin/env python3
"""ARCH-PES-S01 probe p6 — R1.6 feasibility at base: walk the RUNTIME module graph the hosted command will have
(its three workspace entry points @debateai/db, @debateai/register, @debateai/providers, followed transitively through
relative specifiers and @debateai/<name> -> packages/<name>/src/index.ts) and report every module whose path has a
segment beginning `dev-`, and whether apps/runner/src/dev-provider-panel.ts is reachable. `import type` / `export type`
statements are erased at runtime and are not edges. Read-only.
"""
import os
import re
import sys

LANE = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine"
EDGE = re.compile(
    r'''(?:^|[;\n])\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\s+from\s+)?["']([^"']+)["']'''
    r'''|\bimport\(\s*["']([^"']+)["']\s*\)''',
    re.M,
)


def resolve(importer, specifier):
    if specifier.startswith("@debateai/"):
        name = specifier.split("/", 1)[1]
        target = os.path.join(LANE, "packages", name, "src", "index.ts")
        return target if os.path.exists(target) else ("UNRESOLVED:" + specifier)
    if specifier.startswith("."):
        base = os.path.normpath(os.path.join(os.path.dirname(importer), specifier))
        for candidate in (base, re.sub(r"\.js$", ".ts", base), base + ".ts", os.path.join(base, "index.ts")):
            if os.path.isfile(candidate):
                return candidate
        return "UNRESOLVED:" + specifier
    return None  # node: builtins and third-party packages are leaves


def walk(roots):
    seen, stack = set(), list(roots)
    while stack:
        path = stack.pop()
        if path in seen or path.startswith("UNRESOLVED:"):
            seen.add(path)
            continue
        seen.add(path)
        with open(path, encoding="utf8") as handle:
            source = handle.read()
        for match in EDGE.finditer(source):
            specifier = match.group(1) or match.group(2)
            target = resolve(path, specifier)
            if target is not None and target not in seen:
                stack.append(target)
    return seen


roots = [os.path.join(LANE, "packages", name, "src", "index.ts") for name in ("db", "register", "providers")]
graph = walk(roots)
relative = sorted(os.path.relpath(p, LANE) if not p.startswith("UNRESOLVED:") else p for p in graph)
dev = [p for p in relative if any(segment.startswith("dev-") for segment in p.split("/"))]
print(f"modules\t{len(relative)}")
print(f"unresolved\t{[p for p in relative if p.startswith('UNRESOLVED:')]}")
print(f"packages\t{sorted({p.split('/')[1] for p in relative if p.startswith('packages/')})}")
print(f"dev_segment_modules\t{dev}")
print(f"dev_provider_panel_reachable\t{'apps/runner/src/dev-provider-panel.ts' in relative}")
print(f"apps_modules\t{[p for p in relative if p.startswith('apps/')]}")
sys.exit(0)
