import collections
import json
import re
from pathlib import Path

REPORT_ROOT = Path("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914")
BASELINE_PATH = REPORT_ROOT / "evidence/TYPEBASE-diagnostics.json"
CURRENT_LOG = REPORT_ROOT / "logs/UI-root-typecheck.log"
OUTPUT_PATH = REPORT_ROOT / "evidence/UI-typecheck-comparison.json"
PREFIXES = (
    "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-typebase/dialectical-engine",
    "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine",
)
DIAGNOSTIC = re.compile(r"^(?P<file>[^:(]+)\((?P<line>\d+),(?P<column>\d+)\): error (?P<code>TS\d+): (?P<message>.*)$")


def normalize_message(message: str) -> str:
    for prefix in PREFIXES:
        message = message.replace(prefix, "<CHECKOUT>")
    return message


def tuple_key(item: dict[str, object]) -> tuple[object, ...]:
    return (item["file"], item["line"], item["column"], item["code"], item["message"])


def moved_key(item: dict[str, object]) -> tuple[object, ...]:
    return (item["file"], item["code"], item["message"])


baseline_document = json.loads(BASELINE_PATH.read_text())
baseline = [
    {**item, "message": normalize_message(item["message"])}
    for item in baseline_document["baseline"]["tuples"]
]
current: list[dict[str, object]] = []
for line in CURRENT_LOG.read_text().splitlines():
    match = DIAGNOSTIC.match(line)
    if match is None:
        continue
    current.append({
        "file": match.group("file"),
        "line": int(match.group("line")),
        "column": int(match.group("column")),
        "code": match.group("code"),
        "message": normalize_message(match.group("message")),
    })

baseline_exact = collections.Counter(tuple_key(item) for item in baseline)
current_exact = collections.Counter(tuple_key(item) for item in current)
exact_count = sum((baseline_exact & current_exact).values())

remaining_baseline: list[dict[str, object]] = []
remaining_current: list[dict[str, object]] = []
exact_to_consume = baseline_exact & current_exact
for collection, destination in ((baseline, remaining_baseline), (current, remaining_current)):
    consumed: collections.Counter[tuple[object, ...]] = collections.Counter()
    for item in collection:
        key = tuple_key(item)
        if consumed[key] < exact_to_consume[key]:
            consumed[key] += 1
        else:
            destination.append(item)

baseline_moved = collections.Counter(moved_key(item) for item in remaining_baseline)
current_moved = collections.Counter(moved_key(item) for item in remaining_current)
moved_count = sum((baseline_moved & current_moved).values())

introduced: list[dict[str, object]] = []
baseline_only: list[dict[str, object]] = []
moved_to_consume = baseline_moved & current_moved
for collection, destination in ((remaining_current, introduced), (remaining_baseline, baseline_only)):
    consumed: collections.Counter[tuple[object, ...]] = collections.Counter()
    for item in collection:
        key = moved_key(item)
        if consumed[key] < moved_to_consume[key]:
            consumed[key] += 1
        else:
            destination.append(item)

result = {
    "schema_version": 1,
    "baseline_commit": baseline_document["baseline"]["commit"],
    "current_commit_before_ui": "58fbaa7d5535dad89b479b98776cf2b8e88b978e",
    "current_log": str(CURRENT_LOG),
    "baseline_diagnostic_count": len(baseline),
    "current_diagnostic_count": len(current),
    "observed_in_baseline_exact": exact_count,
    "observed_in_baseline_at_moved_line": moved_count,
    "introduced_count": len(introduced),
    "baseline_only_count": len(baseline_only),
    "introduced": introduced,
    "baseline_only": baseline_only,
}
OUTPUT_PATH.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
print(json.dumps(result, indent=2, ensure_ascii=False))
