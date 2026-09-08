import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * F-T9-UNATTENDED-PROMISES.
 *
 * PROPERTY. Every promise pushed into `issued` by the T9 resend window in
 * tests/integration/registration-database.test.ts has a rejection handler
 * attached in the SAME expression as the push, so a rejection arriving during
 * the ~22 s the loop spends awaiting its cadence can never reach Node's
 * unhandled-rejection checkpoint unattended — and the join below still reports
 * that rejection, unchanged.
 *
 * WHY THIS FILE RUNS THE REAL LOOP INSTEAD OF A HAND-WRITTEN COPY. The defect
 * is a property of the loop's shape, and a hand-written copy of that shape
 * would stay green no matter what the real loop does — it would pin nothing.
 * So the rows below EXTRACT the region's own source text (the packet's
 * :7104–:7139) and execute it in a child Node process against stubs, with one
 * slot's `injectResend` rejecting. Node strips the type annotations
 * (--input-type=module-typescript), so the region runs verbatim.
 *
 * The child, not vitest, is the observer: an unattended rejection ends the
 * child with ERR_UNHANDLED_REJECTION, which no in-process assertion can catch.
 *
 * WHAT THIS DOES NOT PROVE. It runs the region's TEXT with stubs, not the T9
 * window against its database, so it cannot see anything the real
 * `injectResend`, the API or the pool contribute. It is a shape check with a
 * behavioural observer, and the surviving integration gate is T9 itself.
 */

const T9_SOURCE = new URL(
  "../../tests/integration/registration-database.test.ts",
  import.meta.url
);
const REGION_START = "const issued: Array<";
const REGION_END = "const observations = await Promise.all(issued);";
const ATTENDANCE = "void promise.catch(() => undefined);";

/** The stubs the extracted region closes over. One slot's issuance rejects. */
const PREAMBLE = `
const samplesPerArm = 2;
const windowCadenceMs = 5;
const cadenceToleranceMs = 1_000;
const windowIndex = 0;
const order = "existing-first";
const namespace = "f-t9-attendance-probe";
const registered = { email: "probe@example.test" };
const api = {};
const armsForOrder = (_order: string) => ["existing", "missing"];
let issuedCount = 0;
const injectResend = async (
  _api: unknown, arm: string, slot: number, _email: string, _ip: string
) => {
  const position = issuedCount;
  issuedCount += 1;
  if (position === 1) throw new TypeError("T9_PROBE_INJECTED_REJECTION");
  return { arm, slot, elapsedMs: 1, ip: _ip, status: 202, body: "", rejection: null };
};
`;

async function extractRegion(): Promise<string> {
  const source = await readFile(T9_SOURCE, "utf8");
  const start = source.indexOf(REGION_START);
  const end = source.indexOf(REGION_END);
  expect(start, `${REGION_START} not found in the T9 window`).toBeGreaterThan(-1);
  expect(end, `${REGION_END} not found in the T9 window`).toBeGreaterThan(start);
  const region = source.slice(start, end + REGION_END.length);
  expect(region).toContain("issued.push(");
  expect(region).toContain("injectResend(");
  return region;
}

function runChild(region: string): { status: number | null; output: string } {
  const script = `${PREAMBLE}
try {
${region}
  console.log("NO_REJECTION:" + observations.length);
} catch (error) {
  console.log("JOIN_REPORTED:" + (error as Error).message);
}
console.log("SURVIVED");
`;
  const child = spawnSync(
    process.execPath,
    ["--input-type=module-typescript", "-e", script],
    { encoding: "utf8", timeout: 60_000 }
  );
  return { status: child.status, output: `${child.stdout ?? ""}${child.stderr ?? ""}` };
}

describe("F-T9-UNATTENDED-PROMISES · the issuance loop attends every promise it pushes", () => {
  it("survives a rejecting slot and still reports it through the join", async () => {
    const { status, output } = runChild(await extractRegion());
    expect(output).toContain("JOIN_REPORTED:T9_PROBE_INJECTED_REJECTION");
    expect(output).toContain("SURVIVED");
    expect(status).toBe(0);
  }, 90_000);

  /**
   * The observable is the child's DEATH, not a code string. Node's default
   * `--unhandled-rejections=throw` re-throws an Error-typed reason as an
   * ordinary uncaught exception and prints the error; it emits the
   * `ERR_UNHANDLED_REJECTION` code only when the reason is not an Error. So the
   * discriminator is: the process never reached the join's catch, never reached
   * the line after it, and exited nonzero — with the injected reason on stderr
   * as the thing that killed it.
   */
  it("dies before the join once the handler is detached (positive control)", async () => {
    const region = await extractRegion();
    const occurrences = region.split(ATTENDANCE).length - 1;
    expect(occurrences, "the region must attach exactly one rejection handler").toBe(1);
    const detached = region.replace(ATTENDANCE, "/* detached */");
    expect(detached).not.toContain(ATTENDANCE);
    const { status, output } = runChild(detached);
    expect(output).toContain("T9_PROBE_INJECTED_REJECTION");
    expect(output).not.toContain("JOIN_REPORTED");
    expect(output).not.toContain("SURVIVED");
    expect(status).not.toBe(0);
  }, 90_000);

  it("attaches the handler in the same expression as the push (source contract)", async () => {
    const region = await extractRegion();
    expect(region).toContain("issued.push(attendedByJoin(injectResend(");
    expect(region).toContain(ATTENDANCE);
  });
});
