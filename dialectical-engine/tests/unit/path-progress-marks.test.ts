// V4 start step, Task 53 (item wait-d1; migration 0160): each path's step and each point's marks, written by the runner as the work
// moves on. Best effort: no store makes no call; one node's writes arrive in the order they were sent; a store that throws or refuses
// is one content-free line with its code, the next write is still sent, and nothing ever rejects or holds the run up.
import { describe, expect, it } from "vitest";
import type { PathProgressStore } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { pathProgressMarksOf } from "../../apps/runner/src/path-progress.js";

const RUN = "bbbbbbbb-0000-4000-8000-000000000001";
type Write = Readonly<{ kind: "STEP" | "MARK"; pathId: string; nodeId?: string; value: string; trust?: string | null }>;

/** A store whose writes answer in `delayOf` milliseconds each (in reverse of send order when asked), recording what arrived. */
function slowStore(delayOf: (index: number) => number, outcome: (index: number) => "RECORDED" | "RUN_ERASED" | Error = () => "RECORDED") {
  const arrived: Write[] = [];
  let index = 0;
  const answer = async (write: Write) => {
    const at = index;
    index += 1;
    await new Promise((resolve) => setTimeout(resolve, delayOf(at)));
    arrived.push(write);
    const result = outcome(at);
    if (result instanceof Error) throw result;
    return result;
  };
  const store: PathProgressStore = {
    recordPathStep: async (input) => answer({ kind: "STEP", pathId: input.pathId, value: input.step }),
    recordPathPointMark: async (input) => answer({ kind: "MARK", pathId: input.pathId, nodeId: input.nodeId, value: input.mark, trust: input.trust }),
    readPathProgress: async () => { throw new Error("not read here"); },
    readCarryOnMark: async () => "NONE"
  };
  return { store, arrived };
}

describe("a path debate's progress marks", () => {
  it("no store: nothing is called, and settled() resolves", async () => {
    const lines: string[] = [];
    const marks = pathProgressMarksOf(undefined, RUN, (line) => { lines.push(line); });
    marks.step("b1", "ARGUING");
    marks.point("b1", "node-1", "PUT_FORWARD");
    marks.found("b1", "node-1", "SURE");
    await expect(marks.settled()).resolves.toBeUndefined();
    expect(lines).toEqual([]);
  });

  it("one node's writes arrive in the order they were sent, whatever each write takes; a path's steps too", async () => {
    // The first write is the slowest: sent at once, it would land last.
    const { store, arrived } = slowStore((index) => [30, 1, 1, 30, 1][index] ?? 1);
    const marks = pathProgressMarksOf(store, RUN, () => undefined);
    marks.point("b1", "node-1", "PUT_FORWARD");
    marks.point("b1", "node-1", "CHECKING");
    marks.point("b1", "node-1", "CHECKED");
    marks.step("b2", "FINDING_SOURCES");
    marks.step("b2", "ARGUING");
    await marks.settled();
    expect(arrived.filter((write) => write.nodeId === "node-1").map((write) => write.value)).toEqual(["PUT_FORWARD", "CHECKING", "CHECKED"]);
    expect(arrived.filter((write) => write.kind === "STEP").map((write) => write.value)).toEqual(["FINDING_SOURCES", "ARGUING"]);
    expect(arrived.find((write) => write.value === "PUT_FORWARD")).toMatchObject({ pathId: "b1", trust: null });
  });

  it("a store that throws, or refuses: one line with the code only, the next write still sent, settled() resolves", async () => {
    const lines: string[] = [];
    const { store, arrived } = slowStore(() => 1, (index) => index === 0
      ? new TypedDomainError("PATH_PROGRESS_INVALID", "the words of a node nobody should read")
      : index === 1 ? "RUN_ERASED" : "RECORDED");
    const marks = pathProgressMarksOf(store, RUN, (line) => { lines.push(line); });
    marks.point("b1", "node-1", "PUT_FORWARD");
    marks.point("b1", "node-1", "CHECKING");
    marks.found("b1", "node-1", "SURE");
    await expect(marks.settled()).resolves.toBeUndefined();
    expect(arrived.map((write) => write.value)).toEqual(["PUT_FORWARD", "CHECKING", "FOUND"]);
    expect(arrived.at(-1)).toMatchObject({ trust: "SURE" });
    expect(lines.map((line) => JSON.parse(line) as unknown)).toEqual([
      { kind: "DEBATEAI_PATH_PROGRESS", code: "PATH_PROGRESS_INVALID" },
      { kind: "DEBATEAI_PATH_PROGRESS", code: "RUN_ERASED" }
    ]);
    expect(lines.join("\n")).not.toContain("nobody");
  });

  it("an untyped failure is logged by a code of its own, never its message", async () => {
    const lines: string[] = [];
    const { store } = slowStore(() => 1, () => new Error("connection to the words of a point was lost"));
    const marks = pathProgressMarksOf(store, RUN, (line) => { lines.push(line); });
    marks.step("b1", "CHECKING");
    await marks.settled();
    expect(lines).toEqual([JSON.stringify({ kind: "DEBATEAI_PATH_PROGRESS", code: "PATH_PROGRESS_WRITE_FAILED" })]);
  });

  it("a write sent after settled() was called is awaited by the next settled()", async () => {
    const { store, arrived } = slowStore(() => 5);
    const marks = pathProgressMarksOf(store, RUN, () => undefined);
    marks.step("b1", "ARGUING");
    const first = marks.settled();
    marks.step("b1", "CHECKING");
    await first;
    await marks.settled();
    expect(arrived.map((write) => write.value)).toEqual(["ARGUING", "CHECKING"]);
  });
});
