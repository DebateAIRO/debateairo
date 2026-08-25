// T1 three-worker A/B — anchor-bound mutation helper.
//
// AUTHORING STATUS: design evidence for `T1-claude-3worker-ab-draft-packet.md`,
// corrected under `T1-claude-3worker-ab-artifact-correction1-packet.md`. Never
// executed by the authoring seat.
//
// WHY THIS EXISTS
// A mutant is only evidence if the edit it applied is the edit it claims to
// have applied. A `sed -i 's/.../.../'` cannot promise that: it silently edits
// zero sites, or two, or a line that drifted since the anchor was written, and
// the receipt looks identical in all four cases. This helper makes the three
// interesting failures impossible rather than unlikely:
//
//   * the anchor comment must occur EXACTLY once in the source;
//   * the targeted line (anchor line + offset) must equal the caller's expected
//     bytes EXACTLY, so a drifted or reindented line is a refusal, not a silent
//     mutation of the wrong statement;
//   * the replacement must differ from the expected bytes, so a no-op mutation
//     cannot be reported as a successful one.
//
// It NEVER writes to the source it read. The destination must be a different
// path, and the caller (the wrapper) is responsible for that path living inside
// its own `mktemp -d` directory or being the installed temporary governed test
// it has already backed up with `cp -p`.
//
// USAGE
//   node T1-3worker-ab-mutation-helper.mjs \
//     --source <path> --destination <path> \
//     --anchor <anchor-text> [--offset <n>] \
//     --expected <exact line bytes> --replacement <exact line bytes>
//
// EXIT STATUS
//   0  exactly one site was replaced; the report line names both hashes
//   9  a refusal: anchor count != 1, target-line mismatch, no-op replacement,
//      identical source/destination, or an unreadable input
//   3  bad invocation
//
// OUTPUT
//   one line: `[T1_N3_AB_MUTATION]{...}` on success,
//   one line: `[T1_N3_AB_MUTATION_REFUSED]{...}` on refusal.
// Both are secret-free: they carry counts, offsets, hashes and a refusal code,
// never the anchor's surrounding source, the expected bytes or the replacement.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/** The only flags this helper accepts. An unknown flag is a bad invocation. */
const FLAGS = Object.freeze([
  "--source", "--destination", "--anchor", "--offset", "--expected", "--replacement"
]);

/** Marker prefixes, located by the matrix and the manifest builder. */
const OK_MARKER = "[T1_N3_AB_MUTATION]";
const REFUSED_MARKER = "[T1_N3_AB_MUTATION_REFUSED]";

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function parseArguments(argv) {
  const parsed = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!FLAGS.includes(flag) || value === undefined) return null;
    if (parsed.has(flag)) return null;
    parsed.set(flag, value);
  }
  for (const required of ["--source", "--destination", "--anchor", "--expected", "--replacement"]) {
    if (!parsed.has(required)) return null;
  }
  return parsed;
}

function refuse(code, detail = {}) {
  process.stdout.write(`${REFUSED_MARKER}${JSON.stringify({ refusal: code, ...detail })}\n`);
  return 9;
}

function main(argv) {
  const parsed = parseArguments(argv);
  if (parsed === null) {
    process.stderr.write(
      "T1_N3_AB_MUTATION_USAGE: --source <p> --destination <p> --anchor <a> "
      + "[--offset <n>] --expected <line> --replacement <line>\n"
    );
    return 3;
  }

  const sourcePath = resolve(parsed.get("--source"));
  const destinationPath = resolve(parsed.get("--destination"));
  const anchor = parsed.get("--anchor");
  const expected = parsed.get("--expected");
  const replacement = parsed.get("--replacement");
  const offsetText = parsed.get("--offset") ?? "1";

  // Writing back over the file that was read would turn a mutation into an
  // in-place edit of the very source the restoration check compares against.
  if (sourcePath === destinationPath) return refuse("SOURCE_AND_DESTINATION_IDENTICAL");
  if (!/^-?\d{1,3}$/.test(offsetText)) return refuse("OFFSET_NOT_AN_INTEGER");
  const offset = Number(offsetText);
  if (anchor.length === 0) return refuse("ANCHOR_EMPTY");
  if (expected === replacement) return refuse("REPLACEMENT_IS_A_NO_OP");

  let source;
  try {
    source = readFileSync(sourcePath, "utf8");
  } catch {
    return refuse("SOURCE_UNREADABLE");
  }

  // Split on "\n" and rejoin the same way: the file's own trailing-newline shape
  // is preserved exactly, because a mutation that also normalized line endings
  // would make the later byte-identical restoration check meaningless.
  const lines = source.split("\n");
  const anchorLines = [];
  lines.forEach((line, index) => { if (line.includes(anchor)) anchorLines.push(index); });
  if (anchorLines.length !== 1) {
    return refuse("ANCHOR_NOT_UNIQUE", { anchorOccurrences: anchorLines.length });
  }

  const targetIndex = anchorLines[0] + offset;
  if (targetIndex < 0 || targetIndex >= lines.length) {
    return refuse("TARGET_LINE_OUT_OF_RANGE", { offset });
  }
  if (lines[targetIndex] !== expected) {
    // Deliberately reports lengths, never the bytes: an expected-line mismatch
    // is a drift report, not an excuse to echo source into a durable receipt.
    return refuse("TARGET_LINE_MISMATCH", {
      offset,
      expectedLength: expected.length,
      actualLength: lines[targetIndex].length
    });
  }

  lines[targetIndex] = replacement;
  const mutated = lines.join("\n");
  try {
    writeFileSync(destinationPath, mutated, "utf8");
  } catch {
    return refuse("DESTINATION_UNWRITABLE");
  }

  process.stdout.write(`${OK_MARKER}${JSON.stringify({
    anchorOccurrences: 1,
    replacements: 1,
    offset,
    sourceSha256: sha256(source),
    mutatedSha256: sha256(mutated),
    sourceLines: lines.length,
    mutatedTemporaryCopy: true
  })}\n`);
  process.stdout.write("ANCHOR_REPLACEMENTS=1\n");
  return 0;
}

process.exitCode = main(process.argv.slice(2));
