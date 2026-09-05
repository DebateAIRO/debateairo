import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * THE CLASS, not the instance (board F33).
 *
 * Five times in this mission one shape has cost a round: a register family is
 * sealed by one lane, consumed by the runner behind an OPTIONAL settings field,
 * wired into ONE deployment entry point, and silently absent from the other.
 * Because the field is optional the compiler never asks, and because every unit
 * test builds its own settings object, no unit test can see it either — supplying
 * the setting is precisely what such a test does. The defect surfaces only as a
 * live run refusing at claim time.
 *
 * Members already paid for: `panelPolicy` (F33 itself), `stoppingPolicy` (the T7
 * merge repair recorded in tests/integration/t17-envelope-ledger.test.ts),
 * `verdictLabelPolicy`, `scoringOperator`, and `synthesisRolePolicy` — this
 * ticket, on the acceptance deployment.
 *
 * The strongest guard is a COMPILE ERROR, and `synthesisRolePolicy` now has one:
 * it is REQUIRED on `WalkingSkeletonSettings`, so omitting it on any deployment
 * path does not build. That closes this member of the class outright.
 *
 * THE OTHER FOUR MEMBERS ARE STILL OPTIONAL, which is why this test remains.
 * `panelPolicy`, `scoringOperator` and `stoppingPolicy` gate only at M>1 and
 * `verdictLabelPolicy` gates unconditionally, yet all four are declared with
 * `?`. Until each is made required in turn, this is the only check standing
 * between them and a repeat: it DERIVES the obligation set from the runner's own
 * refusal gates and checks it against both shipped entry points, so a family
 * added tomorrow is covered the moment its gate lands, with no list to extend.
 *
 * What it does NOT do — codex r1 FOLLOW-UP 3, and it is worth stating plainly
 * rather than overselling the guard: it does NOT make omission impossible. It
 * matches SOURCE TEXT. A gate written in a different shape, a third deployment
 * entry point nobody added here, or an incidental `foo:` inside the sliced
 * region can each make it miss or falsely pass. It is an interim regression
 * check whose replacement is the type change above, applied to the rest.
 *
 * Nor does it prove the value passed is the sealed row rather than a restatement.
 * That property is behavioural and lives with each family's own reader test —
 * for the acceptance families, in acceptance/runtime-policy.test.ts.
 */

const RUNNER = new URL("../../apps/runner/src/index.ts", import.meta.url);
const DEPLOYMENT_ENTRY_POINTS = Object.freeze([
  { label: "dev (shipped)", url: new URL("../../apps/runner/src/main.ts", import.meta.url) },
  { label: "acceptance (ceremony)", url: new URL("../../acceptance/main.ts", import.meta.url) }
]);

/**
 * Every settings field the runner REFUSES a work item over. Both gate shapes
 * count: the unconditional one that binds at every maker count, and the
 * `#configuredMakers.length > 1 &&` one that binds as soon as a second maker is
 * configured. Both deployments configure more than one maker, so both shapes are
 * obligations on both of them.
 */
function gatedSettingsFields(runnerSource: string): readonly string[] {
  const pattern = /if \((?:this\.#configuredMakers\.length > 1 && )?this\.settings\.([A-Za-z]+) === undefined\)[\s\S]{0,1600}?throw new TypedDomainError\(\s*"([A-Z0-9_]+_UNRESOLVED)"/g;
  const found = new Set<string>();
  for (const match of runnerSource.matchAll(pattern)) found.add(match[1]!);
  return Object.freeze([...found].sort());
}

/** `name:` or the `{ name }` shorthand, but never `name === undefined`. */
function suppliesField(settingsSource: string, field: string): boolean {
  return new RegExp(`(^|[^A-Za-z0-9_.])${field}\\s*[:,}]`, "m").test(settingsSource);
}

/** The settings object literal handed to the runner this file constructs. */
function runnerSettingsRegion(entryPointSource: string): string {
  const constructed = entryPointSource.indexOf("new WalkingSkeletonRunner(");
  expect(constructed).toBeGreaterThan(-1);
  return entryPointSource.slice(constructed);
}

describe("F33 class — every register family the runner gates on is wired into EVERY deployment", () => {
  it("derives the gated field set from the runner's own refusals, and derives a non-empty one", async () => {
    const runnerSource = await readFile(RUNNER, "utf8");

    const gated = gatedSettingsFields(runnerSource);

    // D41's rule, applied to a derivation: an empty result is not a pass. If the
    // gate's source shape ever changes, this test must go red rather than
    // quietly check nothing — which is how a derived check becomes decoration.
    expect(gated.length).toBeGreaterThanOrEqual(5);
    // The members known to this mission are all present. A NEW family may join
    // this list freely; one going MISSING means the derivation stopped seeing a
    // gate that still exists.
    expect(gated).toEqual(expect.arrayContaining([
      "panelPolicy", "scoringOperator", "stoppingPolicy", "synthesisRolePolicy", "verdictLabelPolicy"
    ]));
  });

  it("finds every gated family supplied by BOTH shipped deployment entry points", async () => {
    const [runnerSource, ...entryPointSources] = await Promise.all([
      readFile(RUNNER, "utf8"),
      ...DEPLOYMENT_ENTRY_POINTS.map(({ url }) => readFile(url, "utf8"))
    ]);
    const gated = gatedSettingsFields(runnerSource!);

    const missing: string[] = [];
    for (const [index, entryPoint] of DEPLOYMENT_ENTRY_POINTS.entries()) {
      const region = runnerSettingsRegion(entryPointSources[index]!);
      for (const field of gated) {
        if (!suppliesField(region, field)) missing.push(`${entryPoint.label}: ${field}`);
      }
    }

    // Named rather than counted, so the failure says WHICH deployment is missing
    // WHICH family — the sentence board F33 had to be written by hand.
    expect(missing).toEqual([]);
  });
});
