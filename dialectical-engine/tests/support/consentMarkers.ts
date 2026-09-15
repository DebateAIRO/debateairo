/**
 * The four delimiters that fence each consent slice's block in `apps/ui/app/globals.css`.
 *
 * ONE source for four load-bearing constants that cross a slice boundary
 * (CODE-REV-S02-C9 r1 **N3**). Before this module `tests/render/consent-bar.test.tsx` — S01's
 * suite — carried S02's two markers as its own literals, so renaming an S02 marker would fail
 * S01's suite with a message about S02's block: a failure in the wrong slice's file, and one
 * whose fix is in a file the failing suite does not name.
 *
 * These strings are the CSS comments themselves, byte for byte, because both suites use them as
 * `indexOf`/`split` needles against the raw stylesheet. Changing one here changes the contract
 * for both slices at once, which is the point.
 *
 * Owners: `tests/render/consent-bar.test.tsx` (S01's block, plus the S02 markers it must
 * tolerate after the S02-S66 merge) and `tests/unit/consent-s02-style-contract.test.ts`
 * (S02's block).
 */

/** Opens slice S01's ONE delimited block. */
export const S01_OPEN_MARKER = "/* === consent-ui S01 === */";

/** Closes slice S01's ONE delimited block. */
export const S01_CLOSE_MARKER = "/* === end consent-ui S01 === */";

/** Opens slice S02's ONE delimited block, which follows S01's after the S02-S66 merge. */
export const S02_OPEN_MARKER = "/* === consent-ui S02 === */";

/** Closes slice S02's ONE delimited block, and is the last non-whitespace text in the file. */
export const S02_CLOSE_MARKER = "/* === end consent-ui S02 === */";
