// ARCH-FIX-PES-S03-p4 · every `path:line` Revision 4 cites, re-measured in the LANE (and SPEC-v3 in the
// main tree): each cited span must contain the token the PLAN's sentence relies on.
// SELFTEST=1 shifts every citation by +3 lines; it must FAIL (a checker that only ever passed proves nothing).
import { readFileSync } from "node:fs";
const MAIN = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/";
const LANE = MAIN + ".worktrees/pes-s03/dialectical-engine/";
const SPEC = MAIN + "docs/missions/provider-env-selection/slices/S03/SPEC-v3.md";
const SHIFT = process.env.SELFTEST === "1" ? 3 : 0;
const cites = [
  ["deploy/vps/README.md", 700, 700, "`COST_ENVELOPES_NOT_SEALED`)."],
  ["deploy/vps/README.md", 737, 737, "COST_ENVELOPES_NOT_SEALED"],
  ["deploy/vps/README.md", 769, 769, "| `COST_ENVELOPES_NOT_SEALED` | the per-run and daily cost envelopes (V-28) are not published yet."],
  ["deploy/vps/README.md", 692, 692, "- **The production maker path is now ruled"],
  ["deploy/vps/README.md", 698, 700, "envelopes are V-28's (until they are sealed, a hosted runner refuses to start with"],
  ["deploy/vps/README.md", 734, 734, "**What the support chat cannot tell you yet.**"],
  ["deploy/vps/README.md", 739, 739, "mistaken for a call that was free."],
  ["deploy/vps/README.md", 736, 737, "A hosted deployment refuses to start until"],
  ["deploy/vps/README.md", 776, 777, "| `COST_ENVELOPE_POLICY_UNRESOLVED` |"],
  ["packages/register/src/cost-envelope-policy.ts", 163, 166, "\"COST_ENVELOPE_POLICY_UNRESOLVED\""],
  ["packages/register/src/cost-envelope-policy.ts", 163, 163, "row === undefined"],
  ["packages/register/src/cost-envelope-policy.ts", 131, 134, "\"COST_ENVELOPE_POLICY_INVALID\""],
  ["packages/register/src/cost-envelope-policy.ts", 169, 169, "return costEnvelopePolicyFromValue("],
  ["apps/api/src/main.ts", 238, 238, "environment.DEPLOYMENT_MODE === \"hosted\""],
  ["apps/api/src/main.ts", 241, 242, "readCostEnvelopePolicy(pool, environment.REGISTER_VERSION)"],
  ["apps/runner/src/main.ts", 111, 111, "readCostEnvelopePolicy(pool, environment.REGISTER_VERSION)"],
  ["packages/register/src/runtime-environment.ts", 106, 106, "A BUILD-INTEGRITY CHECK"],
  ["packages/register/src/runtime-environment.ts", 112, 115, "unreachable at"],
  ["packages/register/src/runtime-environment.ts", 112, 115, "removed, emptied"],
  ["packages/register/src/runtime-environment.ts", 118, 124, "THE LIVE FAIL-CLOSED GATE IS ELSEWHERE"],
  ["packages/register/src/runtime-environment.ts", 143, 147, "readonly code = \"COST_ENVELOPES_NOT_SEALED\""],
  ["tests/architecture/vps-deployment-baseline.test.ts", 359, 359, "\"COST_ENVELOPES_NOT_SEALED\""],
  ["tests/unit/v30-support-provider.test.ts", 550, 555, "for (const code of codes) expect(section, code).toContain(code);"],
  [SPEC, 4, 4, "Requirements UNCHANGED, byte for byte"],
  [SPEC, 58, 58, "**R3.1**"], [SPEC, 62, 62, "**R3.2**"], [SPEC, 65, 65, "**R3.3**"],
  [SPEC, 72, 72, "**R3.4**"], [SPEC, 83, 83, "V-11)."], [SPEC, 85, 85, "**R3.4b**"], [SPEC, 112, 112, "row V-14"],
  [SPEC, 104, 105, "prints exactly two lines"],
  [SPEC, 114, 114, "**R3.5**"], [SPEC, 122, 122, "**R3.6**"], [SPEC, 130, 130, "**R3.7**"],
  [SPEC, 137, 137, "**R3.8**"], [SPEC, 143, 143, "**R3.9**"]
];
let bad = 0;
for (const [path, from, to, token] of cites) {
  const file = path.startsWith("/") ? path : LANE + path;
  const lines = readFileSync(file, "utf8").split("\n");
  const span = lines.slice(from - 1 + SHIFT, to + SHIFT).join("\n");
  const ok = span.includes(token);
  if (!ok) bad += 1;
  const name = path.startsWith("/") ? "SPEC-v3.md" : path;
  console.log(`${ok ? "ok  " : "BAD "} ${name}:${from}${to !== from ? "-" + to : ""}  ${JSON.stringify(token).slice(0, 90)}`);
}
console.log(`\n${bad === 0 ? "CITES_OK" : "CITES_FAIL"} — ${bad} of ${cites.length} citations do not hold${SHIFT ? " (SELFTEST shift +" + SHIFT + ")" : ""}`);
process.exitCode = bad === 0 ? 0 : 1;
