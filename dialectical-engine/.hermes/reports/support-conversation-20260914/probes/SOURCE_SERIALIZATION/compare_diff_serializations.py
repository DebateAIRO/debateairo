#!/usr/bin/env python3
import hashlib
import json
import subprocess
import time

ROOT = "/Users/vladmihaimiron/Documents/DebateAIRO"
INTAKE = "606ad70f5e8b852724469816ca922d5685a4117668daeeed1a4d740b8988035e"
LATER_DEFAULT = "dc9f0caa2b77b167ee9d4d779464f95f84494a362043eec1d48c2256622c1813"
FORWARD_FULL = "0a5e7ab820d02a74ea8ece4215371aa9d4e3b7cbd162fdf045e45b597d098f8b"
EMPTY = hashlib.sha256(b"").hexdigest()


def git(*args: str, allow_one: bool = False) -> tuple[bytes, list[str]]:
    argv = ["git", "--no-optional-locks", *args]
    result = subprocess.run(argv, cwd=ROOT, check=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode != 0 and not (allow_one and result.returncode == 1):
        raise RuntimeError(json.dumps({"argv": argv, "returncode": result.returncode}))
    return result.stdout, argv


def sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def custody() -> dict:
    head, head_argv = git("rev-parse", "HEAD")
    cached, cached_argv = git("diff", "--no-ext-diff", "--no-textconv", "--cached", "--binary", "--full-index")
    working, working_argv = git("diff", "--no-ext-diff", "--no-textconv", "--binary", "--full-index")
    names, names_argv = git("diff", "--no-ext-diff", "--no-textconv", "--name-only", "-z", "HEAD")
    return {
        "sourceHead": head.decode("ascii").strip(),
        "cachedBinaryFullIndexSha256": sha(cached),
        "workingBinaryFullIndexSha256": sha(working),
        "trackedDirtyPathCount": len([name for name in names.split(b"\0") if name]),
        "argv": {
            "head": head_argv,
            "cachedBinaryFullIndex": cached_argv,
            "workingBinaryFullIndex": working_argv,
            "trackedDirtyPaths": names_argv,
        },
    }


started_ns = time.time_ns()
before = custody()
version, version_argv = git("version")
configured_abbrev, abbrev_argv = git("config", "--get", "core.abbrev", allow_one=True)
core_abbrev = configured_abbrev.decode("utf-8").strip() or "UNSET"

default_bytes, default_argv = git("diff", "--no-ext-diff", "--no-textconv", "--binary")
default_hash = sha(default_bytes)
variants = []
for width in range(4, 41):
    diff_bytes, argv = git(
        "diff", "--no-ext-diff", "--no-textconv", "--binary", f"--abbrev={width}"
    )
    digest = sha(diff_bytes)
    variants.append({
        "abbrev": width,
        "sha256": digest,
        "equalsIntake": digest == INTAKE,
        "equalsLaterDefault": digest == LATER_DEFAULT,
        "equalsForwardFullIndex": digest == FORWARD_FULL,
        "argv": argv,
    })

after = custody()
ended_ns = time.time_ns()
custody_equal = {
    key: before[key] == after[key]
    for key in [
        "sourceHead", "cachedBinaryFullIndexSha256",
        "workingBinaryFullIndexSha256", "trackedDirtyPathCount"
    ]
}

result = {
    "schema": "support-source-serialization-v1",
    "root": ROOT,
    "knownFingerprints": {
        "intakeDefaultBinarySha256": INTAKE,
        "laterDefaultBinarySha256": LATER_DEFAULT,
        "forwardWorkingBinaryFullIndexSha256": FORWARD_FULL,
        "emptySha256": EMPTY,
    },
    "gitVersion": version.decode("utf-8").strip(),
    "coreAbbrev": core_abbrev,
    "before": before,
    "controls": {
        "defaultBinary": {
            "sha256": default_hash,
            "equalsIntake": default_hash == INTAKE,
            "equalsLaterDefault": default_hash == LATER_DEFAULT,
            "equalsForwardFullIndex": default_hash == FORWARD_FULL,
            "argv": default_argv,
        },
        "cachedBinaryFullIndex": {
            "sha256": before["cachedBinaryFullIndexSha256"],
            "equalsEmpty": before["cachedBinaryFullIndexSha256"] == EMPTY,
            "argv": before["argv"]["cachedBinaryFullIndex"],
        },
        "workingBinaryFullIndex": {
            "sha256": before["workingBinaryFullIndexSha256"],
            "equalsForwardFullIndex": before["workingBinaryFullIndexSha256"] == FORWARD_FULL,
            "equalsIntake": before["workingBinaryFullIndexSha256"] == INTAKE,
            "argv": before["argv"]["workingBinaryFullIndex"],
        },
    },
    "variants": variants,
    "summary": {
        "variantCount": len(variants),
        "intakeMatches": [row["abbrev"] for row in variants if row["equalsIntake"]],
        "laterDefaultMatches": [row["abbrev"] for row in variants if row["equalsLaterDefault"]],
        "forwardFullIndexMatches": [row["abbrev"] for row in variants if row["equalsForwardFullIndex"]],
        "defaultMatchesIntake": default_hash == INTAKE,
        "defaultMatchesLaterDefault": default_hash == LATER_DEFAULT,
        "workingFullMatchesForward": before["workingBinaryFullIndexSha256"] == FORWARD_FULL,
    },
    "after": after,
    "custodyEqual": custody_equal,
    "allCustodyEqual": all(custody_equal.values()),
    "meta": {
        "startedUnixNs": started_ns,
        "endedUnixNs": ended_ns,
        "versionArgv": version_argv,
        "coreAbbrevArgv": abbrev_argv,
        "rawDiffPersisted": False,
        "rawDiffPrinted": False,
    },
}
print(json.dumps(result, indent=2, sort_keys=True))
