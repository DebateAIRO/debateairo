#!/bin/zsh
# ARCH-REV-PES-S03-p2 closure probes. Lane is read-only. States live in this dir.
set -u
export PATH="/opt/homebrew/bin:$PATH"
PROBE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-REV-PES-S03-p3
LANE=/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03/dialectical-engine
SRC="$LANE/deploy/vps/README.md"
STATES="$PROBE/scratch/states"
rm -rf "$STATES"
mkdir -p "$STATES"

node "$PROBE/closure-p2-replay.mjs"

echo
echo "===== J. literal /usr/bin/grep oracles on simulated READMEs ====="
cp "$SRC" "$STATES/base.md"

python3 - << 'PY'
from pathlib import Path
src = Path("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s03/dialectical-engine/deploy/vps/README.md").read_text()
states = Path("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-REV-PES-S03-p3/scratch/states")
rows = [
"| `PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` | one member without the other. Raised while the targets are PARSED, before any hosted rule runs |",
"| `PROVIDER_TARGET_PRICE_REQUIRED:` and the provider ref | hosted mode, no price pair |",
"| `PROVIDER_TARGET_PRICE_ZERO:` and the provider ref | hosted mode, amount below 1 |",
"| `COST_ENVELOPE_POLICY_UNRESOLVED` | no row |",
"| `COST_ENVELOPE_POLICY_INVALID` | row does not parse |",
"| `SUPPORT_ADMISSION_SCOPES_NOT_SEALED` | scopes not sealed |",
]
sentence = "`PROVIDER_DISCOVERY_TARGET_PRICE_INVALID` is raised while the targets are parsed, before any hosted rule runs and before `PROVIDER_TARGET_PRICE_REQUIRED` or `PROVIDER_TARGET_PRICE_ZERO` can be: a target whose price is malformed refuses with the first code and never reaches the other two.\n"
marker = "| `SUPPORT_MODEL_PATH_NOT_RATIFIED` |"
def insert_rows(text, rs):
    i = text.index(marker)
    nl = text.index("\n", i)
    return text[:nl+1] + "\n".join(rs) + "\n" + text[nl+1:]
def insert_sentence(text):
    at = text.index("### The credential-file contract")
    return text[:at] + sentence + "\n" + text[at:]
price_a = [
"| `input_price_micros_per_million` | an integer, at least 1, at most Number.MAX_SAFE_INTEGER, micro-USD per million tokens |",
"| `output_price_micros_per_million` | an integer, at least 1, at most Number.MAX_SAFE_INTEGER, micro-USD per million tokens |",
]
price_b = [
"| `input_price_micros_per_million` | an integer, at least 1 |",
"| `output_price_micros_per_million` | declaring it without `input_price_micros_per_million` refuses with PROVIDER_DISCOVERY_TARGET_PRICE_INVALID |",
]
runner = '{"provider_ref":"vendor:acme","base_url":"https://api.acme.example/v1","model":"acme-large","input_price_micros_per_million":3000000,"output_price_micros_per_million":15000000,"authorization_file":"/etc/debateai/runner/providers/acme.header"}'
api = '{"provider_ref":"vendor:acme","base_url":"https://api.acme.example/v1","model":"acme-large","input_price_micros_per_million":3000000,"output_price_micros_per_million":15000000,"authorization_file":"/etc/debateai/api/providers/acme.header"}'
def replace_example(text, api_line):
    old_runner = text.split("\n")
    # lines are 1-based 848 and 849 in the unedited file; anchor on text instead
    start = text.index('In `runner.env` the entry for the example above reads')
    end = text.index("An `authorization_header` member")
    block = "In `runner.env`:\n\n" + runner + "\n\nIn `api.env`:\n\n" + api_line + "\n\n"
    return text[:start] + block + text[end:]
def insert_member(text, rs):
    needle = "| `model` |"
    i = text.index(needle)
    nl = text.index("\n", i)
    return text[:nl+1] + "\n".join(rs) + "\n" + text[nl+1:]

(states / "c12.md").write_text(insert_rows(src, rows))
(states / "c12s.md").write_text(insert_sentence(insert_rows(src, rows)))
(states / "c12five.md").write_text(insert_rows(src, rows[:5]))
c2 = insert_member(src, price_a)
(states / "c25a.md").write_text(c2)
(states / "c25b.md").write_text(insert_member(src, price_b))
(states / "c25one.md").write_text(insert_member(src, price_a[:1]))
full_a = replace_example(insert_member(insert_rows(src, rows), price_a), api)
(states / "c26a.md").write_text(full_a)
full_b = replace_example(insert_member(insert_rows(src, rows), price_b), api)
(states / "c26b.md").write_text(full_b)
# api line lost its output price
bad_api = api.replace('"output_price_micros_per_million":15000000,', "")
(states / "c26drop.md").write_text(replace_example(insert_member(src, price_a), bad_api))
print("states", sorted(p.name for p in states.iterdir()))
PY

o1() {
  sed -n '/^### What the hosted mode refuses, in code$/,/^### The credential-file contract$/p' "$1" | /usr/bin/grep -c '^|'
}
o1space() {
  sed -n '/^### What the hosted mode refuses, in code$/,/^### The credential-file contract$/p' "$1" | /usr/bin/grep -c '^| '
}
o2() {
  sed -n '/^| Member | Value |$/,/^$/p' "$1" | /usr/bin/grep -c '^|'
}
o2space() {
  sed -n '/^| Member | Value |$/,/^$/p' "$1" | /usr/bin/grep -c '^| '
}
o3runner() {
  /usr/bin/grep '"input_price_micros_per_million":' "$1" | /usr/bin/grep '"output_price_micros_per_million":' | /usr/bin/grep -c '/etc/debateai/runner/providers/acme.header' || true
}
o3api() {
  /usr/bin/grep '"input_price_micros_per_million":' "$1" | /usr/bin/grep '"output_price_micros_per_million":' | /usr/bin/grep -c '/etc/debateai/api/providers/acme.header' || true
}
cell_in() {
  sed -n '/^| Member | Value |$/,/^$/p' "$1" | /usr/bin/grep -c '^| `input_price_micros_per_million` |' || true
}
cell_out() {
  sed -n '/^| Member | Value |$/,/^$/p' "$1" | /usr/bin/grep -c '^| `output_price_micros_per_million` |' || true
}

for f in base c12 c12s c12five; do
  echo "O1 $f pipe=$(o1 "$STATES/$f.md") pipe-space=$(o1space "$STATES/$f.md")"
done
for f in base c25a c25b c25one; do
  echo "O2 $f pipe=$(o2 "$STATES/$f.md") pipe-space=$(o2space "$STATES/$f.md") in=$(cell_in "$STATES/$f.md") out=$(cell_out "$STATES/$f.md")"
done
for f in base c26a c26b c26drop; do
  echo "O3 $f runner=$(o3runner "$STATES/$f.md") api=$(o3api "$STATES/$f.md")"
done

echo
echo "===== K. per-code loop on c12 ====="
for c in PROVIDER_DISCOVERY_TARGET_PRICE_INVALID PROVIDER_TARGET_PRICE_REQUIRED PROVIDER_TARGET_PRICE_ZERO COST_ENVELOPE_POLICY_UNRESOLVED COST_ENVELOPE_POLICY_INVALID SUPPORT_ADMISSION_SCOPES_NOT_SEALED; do
  printf '%s ' "$c"
  sed -n '/^### What the hosted mode refuses, in code$/,/^### The credential-file contract$/p' "$STATES/c12.md" | /usr/bin/grep '^|' | /usr/bin/grep -c "$c" || true
done

echo
echo "===== L. max_tokens and price name at base ====="
/usr/bin/grep -c 'max_tokens' "$SRC" || true
/usr/bin/grep -c 'input_price_micros_per_million' "$SRC" || true

echo
echo "===== M. four RED suites do not name the two files this slice writes ====="
cd "$LANE"
for f in tests/integration/dev-api-environment.test.ts tests/integration/dev-api-process.test.ts tests/integration/dev-provider-panel.test.ts tests/integration/t16-algorithm-register.test.ts; do
  hits=$(/usr/bin/grep -c -E 'README\.md|v9-provider-credential-files' "$f" || true)
  echo "$f hits=$hits"
done

echo
echo "===== N. replay pass-1 trace.sh ====="
zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-REV-PES-S03-p1/trace.sh

echo
echo "===== O. replay pass-1 measure.mjs sections 1, 6, 7 (full script) ====="
zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/provider-env-selection/probes/ARCH-REV-PES-S03-p1/measure.sh
