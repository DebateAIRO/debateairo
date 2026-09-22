import os
import subprocess

DETACHED = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine"
PRIMARY = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine"
PATHS = [
    "node_modules",
    "apps/api/node_modules",
    "apps/ui/node_modules",
    "apps/runner/node_modules",
    "packages/support-kb/node_modules",
]


def git(directory: str, *args: str) -> str:
    return subprocess.check_output(["git", "-C", directory, *args], text=True).strip()


for label, directory in (("detached", DETACHED), ("primary", PRIMARY)):
    print(f"{label}_head={git(directory, 'rev-parse', 'HEAD')}")
    dirty = git(directory, "status", "--porcelain=v1")
    print(f"{label}_dirty={0 if dirty == '' else len(dirty.splitlines())}")

for path in PATHS:
    status = "ABSENT" if not os.path.lexists(os.path.join(DETACHED, path)) else "PRESENT"
    print(f"{status}\t{path}")
