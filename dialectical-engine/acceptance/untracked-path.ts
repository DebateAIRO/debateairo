import { existsSync, lstatSync, realpathSync, type Stats } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";

/**
 * THE UNTRACKED-OUTPUT RULE, shared by the two acceptance tools that write
 * private text: relay-host's endpoints file (live bearers) and the moment
 * tools' files (decrypted debate text). Each tool keeps its own refusal code;
 * this module only judges.
 *
 * Inside the repository an output path must sit under a `.local/` folder
 * (git-ignored); outside it, anywhere. A18a fix round 1 closed three ways the
 * first version could be walked around:
 *
 *  - `..` AFTER A LINK. `path.resolve` folds `..` by string rules, before any
 *    link is read; the kernel follows the link first. So `<link>/../x` was
 *    judged in the folder holding the link and written in the one above its
 *    TARGET. The path is now made absolute WITHOUT normalising it, and the
 *    kernel's own `realpath` reads its existing part.
 *  - A LINK AS THE LAST SEGMENT. An atomic writer renames over the link
 *    (the text lands where the link was); an appending writer follows it (the
 *    text lands at its target, created if dangling). The rule cannot know
 *    which one will write, so a file path whose last segment is a link is
 *    refused, and so is a dangling link anywhere on the way.
 *  - NESTED CHECKOUTS. A worktree sits inside its main checkout. Every
 *    enclosing folder holding `.git` (a folder or a worktree's file) is a
 *    tracked tree, and the path must be admissible in each one.
 *
 * Fix round 2 closed a fourth: A SLASH THAT HIDES A DANGLING LINK. `lstat` of
 * `<link>/` follows the link, so a dangling link spelled with a trailing slash
 * never showed as a link — and `mkdir("<dangling link>/")` creates the link's
 * TARGET (macOS, Node 26). `path.dirname` keeps that slash for a doubled one
 * (`dirname("/o/dlink//e.json")` is `"/o/dlink/"`). `absolutePathOf` now
 * collapses separator runs and drops a trailing separator, and every caller
 * checks, creates, writes and removes at the string it returns.
 *
 * ASSUMPTION (re-review N2, a ruling, not a check): every enclosing checkout
 * ignores `.local/`. This branch's root `.gitignore` adds that rule (line 55
 * ignores a `.local/` folder at any depth); a main checkout that holds this
 * one as a worktree is assumed to carry it too. Only `.local/` folders are
 * exempted here, and nothing in this module reads a checkout's ignore rules.
 */
export type UntrackedPathKind = "file" | "directory";

export type TrackedPathRefusal =
  | "INSIDE_A_TRACKED_TREE"
  | "LAST_SEGMENT_IS_A_LINK"
  | "DANGLING_LINK_ON_THE_WAY";

/** One or more separators in a row (either spelling on a platform that has two). */
const SEPARATOR_RUN = sep === "/" ? /\/+/gu : /[\\/]+/gu;

/**
 * `path` made absolute, normalised by SLASHES ONLY: a relative path is joined
 * to the cwd as a string, runs of separators collapse to one, and a trailing
 * separator is dropped (fix round 2). `.` and `..` are never touched: each is
 * left for the kernel to read after the links before it (fix round 1). Every
 * caller checks, creates, writes and removes at the string this returns.
 */
export function absolutePathOf(path: string): string {
  const absolute = (isAbsolute(path) ? path : `${process.cwd()}${sep}${path}`).replace(SEPARATOR_RUN, sep);
  return absolute.length > 1 && absolute.endsWith(sep) ? absolute.slice(0, -1) : absolute;
}

/** The entry itself, never followed; undefined when the kernel cannot reach it. */
function entryOf(path: string): Stats | undefined {
  try {
    return lstatSync(path, { throwIfNoEntry: false });
  } catch {
    return undefined;
  }
}

/**
 * Where the kernel puts `path`: its longest existing part resolved by the
 * NATIVE `realpath` (links, `..` after links, and on-disk letter case). The
 * JavaScript realpath would undo both fixes: it folds `..` by string rules
 * before reading a link, and it keeps the caller's spelling, so on a
 * case-insensitive volume another spelling would compare as "outside". Then
 * the part that does not exist yet, joined by string rules: nothing in it can
 * be a link. Null when a dangling link sits on the way: where it leads cannot
 * be judged.
 */
function kernelPathOf(path: string): string | null {
  let existing = absolutePathOf(path);
  const missing: string[] = [];
  while (!existsSync(existing)) {
    if (entryOf(existing)?.isSymbolicLink() === true) return null;
    const parent = dirname(existing);
    if (parent === existing) break;
    missing.unshift(basename(existing));
    existing = parent;
  }
  return join(realpathSync.native(existing), ...missing);
}

/** Every checkout around `root`: each folder from `root` up that holds `.git`; `root` itself when none does. */
function enclosingCheckoutsOf(root: string): readonly string[] {
  const canonicalRoot = kernelPathOf(root) ?? absolutePathOf(root);
  const checkouts: string[] = [];
  for (let current = canonicalRoot; ; current = dirname(current)) {
    if (existsSync(join(current, ".git"))) checkouts.push(current);
    if (dirname(current) === current) break;
  }
  return checkouts.length === 0 ? [canonicalRoot] : checkouts;
}

/**
 * Why `path` may not receive private output, or null when it may. A `"file"`
 * is written AT `path`, so a `.local` folder must sit above it; a
 * `"directory"` receives files INSIDE it, so it may itself be the `.local`
 * folder, and a link to it is followed exactly as a writer follows it.
 */
export function trackedPathRefusal(
  path: string,
  kind: UntrackedPathKind,
  repositoryRoot: string
): TrackedPathRefusal | null {
  if (kind === "file" && entryOf(absolutePathOf(path))?.isSymbolicLink() === true) return "LAST_SEGMENT_IS_A_LINK";
  const location = kernelPathOf(path);
  if (location === null) return "DANGLING_LINK_ON_THE_WAY";
  for (const checkout of enclosingCheckoutsOf(repositoryRoot)) {
    const fromCheckout = relative(checkout, location);
    const outside = isAbsolute(fromCheckout) || fromCheckout === ".." || fromCheckout.startsWith(`..${sep}`);
    if (outside) continue;
    const segments = fromCheckout === "" ? [] : fromCheckout.split(sep);
    const folders = kind === "file" ? segments.slice(0, -1) : segments;
    if (!folders.includes(".local")) return "INSIDE_A_TRACKED_TREE";
  }
  return null;
}
