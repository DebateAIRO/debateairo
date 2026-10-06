import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, statSync, type Stats } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { TypedDomainError } from "../../../../packages/kernel/src/index.js";
import { createSupportModelAdapter, type SupportModelTarget } from "../support/model.js";
import { PublicationJudgeFailure, type JudgeFailureCause, type PublicationJudgePort } from "./check.js";

/**
 * FIX-HS2-p1 pt-N4: the adapter's own timeout is a BACKSTOP strictly above the check's deadline D, so the only
 * clock that can end a call inside D is the check's shared signal, and every expiry is recorded as JUDGE_DEADLINE.
 * FIX-HS2-p2 (REV p2 survivor M4c): D + 10 s, so a hung call never holds the relay much past D. D is the register's
 * publicationCheckPolicy row, which the composition root passes in.
 */
const ADAPTER_BACKSTOP_MARGIN_MS = 10_000;

/** FIX-HS2-p1 sd-N6: the judge's diagnostics carry the judge's name, never the support chat's. */
const JUDGE_DIAGNOSTIC_PREFIX = "PUBLICATION_JUDGE:";

export function createPublicationJudgeTransport(target: SupportModelTarget, options: {
  readAuthorizationHeader: (path: string) => string;
  /** D, the check's deadline (the register's publicationCheckPolicy row); the adapter's backstop is D + 10 s. */
  deadlineMs: number;
  fetchImplementation?: typeof fetch;
  reportDiagnostic?: (diagnostic: Readonly<{ code: string }>) => void;
}): PublicationJudgePort {
  const report = options.reportDiagnostic;
  const backstopMs = options.deadlineMs + ADAPTER_BACKSTOP_MARGIN_MS;
  return {
    providerRef: target.providerRef, modelId: target.model,
    async complete(input) {
      let httpStatus: number | undefined;
      try {
        const adapter = createSupportModelAdapter(target, {
          readAuthorizationHeader: options.readAuthorizationHeader,
          timeoutMs: backstopMs,
          ...(report === undefined ? {} : {
            reportDiagnostic: (diagnostic: Readonly<{ code: string }>) => { report({ code: `${JUDGE_DIAGNOSTIC_PREFIX}${diagnostic.code}` }); }
          }),
          fetchImplementation: async (url, init) => {
            const response = await (options.fetchImplementation ?? fetch)(url, init);
            httpStatus = response.status;
            return response;
          }
        });
        const { text } = await adapter.complete({ ...input, language: "en" });
        return { text };
      } catch (error) {
        const cause: JudgeFailureCause = error instanceof TypedDomainError && error.code.startsWith("PROMPT_") ? "JUDGE_DOOR_REFUSED"
          : input.signal.aborted ? "JUDGE_DEADLINE"
          : error instanceof TypedDomainError && error.code === "SUPPORT_MODEL_LENGTH_EXCEEDED" ? "JUDGE_ANSWER_NOT_JSON"
          : httpStatus !== undefined && (httpStatus < 200 || httpStatus > 299) ? "JUDGE_HTTP_STATUS"
          : "JUDGE_TRANSPORT_FAILED";
        throw new PublicationJudgeFailure(cause);
      }
    }
  };
}

/**
 * FIX-HS2-p1 sd-N5 (SPEC-v2 §6 step 9): the judge-off switch of a LOCAL deployment is a flag file named by the API
 * port. While ANYTHING exists at that path every publish answers UNAVAILABLE `JUDGE_NOT_CONFIGURED`; it is read on
 * every attempt, so it is explicit (`touch` = off, `rm` = on), idempotent, and it survives an API restart. A hosted
 * composition passes `offFlagPath: null` and reads no file.
 *
 * FIX-HS2-p2 api-N2: the flag lives in a directory only this user can write. `directory` defaults to the OS temp
 * directory (macOS `$TMPDIR`: 0700, per user); when that directory is group- or world-writable (Linux `/tmp`, mode
 * 1777, shared by every account) the flag goes into a `debateai-<uid>` subdirectory created 0700. (The process
 * environment is read only by the register loader — tests/architecture/scaffold.test.ts — so no XDG lookup here.) Whether the directory really is private is checked on every read
 * (withPrivateDirectory), not trusted from here: a subdirectory pre-created by another account fails that check and
 * the switch reads OFF.
 */
export function publicationJudgeOffFlagPath(apiPort: number, directory: string = tmpdir()): string {
  return join(privateDirectory(directory) ? directory : perUserDirectory(directory), `debateai-publication-judge-${apiPort}.off`);
}

const currentUid = (): number | undefined => typeof process.getuid === "function" ? process.getuid() : undefined;

/** A directory owned by this user that no group or other account can write. */
function privateStat(stat: Stats): boolean {
  const uid = currentUid();
  return stat.isDirectory() && (uid === undefined || stat.uid === uid) && (stat.mode & 0o022) === 0;
}

/** A real directory (not a link) that is private — used to CHOOSE the flag's directory. Never throws. */
function privateDirectory(path: string): boolean {
  try {
    const stat = lstatSync(path);
    return !stat.isSymbolicLink() && privateStat(stat);
  } catch {
    return false;
  }
}

function perUserDirectory(base: string): string {
  const path = join(base, `debateai-${currentUid() ?? "user"}`);
  try { mkdirSync(path, { mode: 0o700 }); } catch { /* exists, or cannot be made: the read-side check decides */ }
  return path;
}

/**
 * FIX-HS2-v api-p3 N3 (wording corrected by FIX-HS2-v2 N4): ANOTHER ACCOUNT cannot swap the directory between the
 * privacy check and the use; the SAME account can. The check and the use are NOT one operation — Node offers no
 * openat, and `/dev/fd/<n>/<name>` does not resolve on macOS (measured: ENOENT) — so the directory is pinned instead:
 * 1. its parent must not let another account rename or replace it — no group/other write, or the sticky bit
 *    (Linux `/tmp`); a world-writable parent without the sticky bit is refused;
 * 2. the directory is opened ONCE with O_DIRECTORY|O_NOFOLLOW (a symlinked directory fails here) and the privacy
 *    check runs on that descriptor (fstat), not on a second lookup of the name;
 * 3. after `use`, the name must still be that same directory (dev/ino of the held descriptor). This catches a swap
 *    that is still in place at the re-check; a same-account swap that is undone before the re-check (ABA) is not
 *    caught and can read ON — no privilege boundary is crossed, since that account can delete the flag itself.
 * Any failure returns `refused`; nothing throws.
 */
function withPrivateDirectory<T>(directory: string, use: () => T, refused: T): T {
  try {
    const parent = statSync(dirname(directory));
    if ((parent.mode & 0o022) !== 0 && (parent.mode & 0o1000) === 0) return refused;
  } catch {
    return refused;
  }
  let descriptor: number;
  try {
    descriptor = openSync(directory, constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0));
  } catch {
    return refused;
  }
  try {
    const held = fstatSync(descriptor);
    if (!privateStat(held)) return refused;
    const result = use();
    const named = lstatSync(directory);
    return named.isDirectory() && named.dev === held.dev && named.ino === held.ino ? result : refused;
  } catch {
    return refused;
  } finally {
    closeSync(descriptor);
  }
}

/** The judge is OFF unless the path provably holds nothing: only ENOENT inside a pinned private directory reads ON. */
function flagAbsent(flag: string): boolean {
  return withPrivateDirectory(dirname(flag), () => {
    try {
      lstatSync(flag);
      return false;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "ENOENT";
    }
  }, false);
}

/**
 * `switchOff` creates the flag with O_CREAT|O_EXCL (which never follows a symlink, live or dangling) and O_NOFOLLOW,
 * mode 0600, inside the pinned directory (withPrivateDirectory), and never throws. When the path already holds something the switch did not make — a directory, a link,
 * another account's file — or the directory is not private, the switch stays OFF in memory until the API restarts,
 * so removing that thing cannot turn the judge back on behind the signal.
 */
export function createPublicationJudgeSwitch(port: PublicationJudgePort | null, options: {
  offFlagPath: string | null;
}): { current(): PublicationJudgePort | null; switchOff(): boolean } {
  const flag = options.offFlagPath;
  let forcedOff = false;
  const off = () => flag !== null && (forcedOff || !flagAbsent(flag));
  const operatorFlag = (path: string) => {
    try {
      const stat = lstatSync(path);
      const uid = currentUid();
      return stat.isFile() && (uid === undefined || stat.uid === uid);
    } catch {
      return false;
    }
  };
  return {
    current: () => port === null || off() ? null : port,
    switchOff: () => {
      if (flag !== null) {
        const made = withPrivateDirectory(dirname(flag), () => {
          try {
            closeSync(openSync(flag, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600));
            return true;
          } catch (error) {
            return (error as NodeJS.ErrnoException).code === "EEXIST" && operatorFlag(flag);
          }
        }, false);
        if (!made) forcedOff = true;
      }
      return port !== null && !off();
    }
  };
}
