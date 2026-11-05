import type { PathId, TrustWord } from "@debateai/contract";
import type { PathProgressStore, PathStep } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";

/**
 * V4 start step, Task 53 (spec 2026-11-03 §2 item 7; items wait-d1, chat-first-round, journey-f1) — A PATH DEBATE'S PROGRESS MARKS, as
 * the runner writes them (migration 0159's store, Task 53a): each step a path reaches (FINDING_SOURCES, ARGUING, CHECKING) and each
 * mark a point gets under its path's root (PUT_FORWARD, CHECKING, CHECKED, then FOUND with its trust word, Task 54). Only the runner
 * knows when a path's work moves on; the run read shows what was written.
 *
 * Best effort, always: a mark never rejects, never fails the run and never holds it up. Each write is sent at once; the writes of one
 * path's steps, and of one point's marks, go one after another in the order they were sent, so a slow write is never overtaken by a
 * later one of the same line. A write the store refuses (RUN_ERASED) or that fails is one content-free line,
 * `{"kind":"DEBATEAI_PATH_PROGRESS","code":…}`, codes only, and the next write is still sent. No store (fixtures, local mode): nothing
 * is written. `settled()` resolves once every write sent so far has answered (tests, and the run's end).
 */
export type PathProgressMarks = Readonly<{
  step(pathId: PathId, step: PathStep): void;
  point(pathId: PathId, nodeId: string, mark: "PUT_FORWARD" | "CHECKING" | "CHECKED"): void;
  found(pathId: PathId, nodeId: string, trust: TrustWord): void;
  settled(): Promise<void>;
}>;

const NO_MARKS: PathProgressMarks = Object.freeze({
  step: () => undefined,
  point: () => undefined,
  found: () => undefined,
  settled: async () => undefined
});

/** A failed write's code: a typed refusal's own code, a database error's five-character state, else a code of its own. */
function failureCodeOf(error: unknown): string {
  if (error instanceof TypedDomainError) return error.code;
  const code = typeof error === "object" && error !== null ? (error as { readonly code?: unknown }).code : undefined;
  return typeof code === "string" && /^[0-9A-Z]{5}$/u.test(code) ? code : "PATH_PROGRESS_WRITE_FAILED";
}

export function pathProgressMarksOf(store: PathProgressStore | undefined, runId: string, log: (line: string) => void): PathProgressMarks {
  if (store === undefined) return NO_MARKS;
  /** Each line's last write (a path's steps, or one point's marks): the next one waits for it. */
  const tails = new Map<string, Promise<void>>();
  const inFlight = new Set<Promise<void>>();
  const tell = (code: string): void => {
    try { log(JSON.stringify({ kind: "DEBATEAI_PATH_PROGRESS", code })); } catch { /* the line never changes the run */ }
  };
  const send = (line: string, write: () => Promise<"RECORDED" | "ALREADY" | "RUN_ERASED">): void => {
    const after = tails.get(line) ?? Promise.resolve();
    const sent = after.then(async () => {
      try {
        const outcome = await write();
        if (outcome === "RUN_ERASED") tell(outcome);
      } catch (error) {
        tell(failureCodeOf(error));
      }
    });
    tails.set(line, sent);
    inFlight.add(sent);
    void sent.finally(() => {
      inFlight.delete(sent);
      if (tails.get(line) === sent) tails.delete(line);
    });
  };
  return Object.freeze({
    step: (pathId: PathId, step: PathStep): void => {
      send(`step:${pathId}`, () => store.recordPathStep({ runId, pathId, step }));
    },
    point: (pathId: PathId, nodeId: string, mark: "PUT_FORWARD" | "CHECKING" | "CHECKED"): void => {
      send(`point:${nodeId}`, () => store.recordPathPointMark({ runId, pathId, nodeId, mark, trust: null }));
    },
    found: (pathId: PathId, nodeId: string, trust: TrustWord): void => {
      send(`point:${nodeId}`, () => store.recordPathPointMark({ runId, pathId, nodeId, mark: "FOUND", trust }));
    },
    settled: async (): Promise<void> => {
      while (inFlight.size > 0) await Promise.allSettled([...inFlight]);
    }
  });
}
