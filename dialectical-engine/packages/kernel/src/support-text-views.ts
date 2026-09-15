export type CanonicalSupportTextViews = Readonly<{
  views: readonly string[];
  unsafeEncoding: boolean;
}>;

const MAX_DECODE_PASSES = 4;
const ENCODED_RUN = /(?:%[0-9a-f]{2})+/giu;
const UNRESOLVED_DANGEROUS_ENCODING = /%[0-9a-f]{2}/iu;
const MALFORMED_STRUCTURAL_ENCODING = /%(?:2f|3a|5c|2|3|5)(?![0-9a-f])/iu;

function normalized(value: string): string {
  return value.normalize("NFKC").replace(/[\p{Cc}\p{Cf}]/gu,"");
}

function decodeRuns(value: string): string {
  return value.replace(ENCODED_RUN,(run) => {
    try { return decodeURIComponent(run); }
    catch { return run; }
  });
}

/** Bounded canonical views for Support output screening; decoding never expands input. */
export function canonicalSupportTextViews(value: string): CanonicalSupportTextViews {
  const views: string[] = [normalized(value)];
  for (let pass = 0;pass < MAX_DECODE_PASSES;pass += 1) {
    const previous = views.at(-1)!;
    const decoded = normalized(decodeRuns(previous));
    if (decoded === previous) break;
    views.push(decoded);
  }
  const final = views.at(-1)!;
  return Object.freeze({
    views:Object.freeze([...new Set(views)]),
    unsafeEncoding: UNRESOLVED_DANGEROUS_ENCODING.test(final)
      || MALFORMED_STRUCTURAL_ENCODING.test(final)
  });
}

const UNSAFE_PATH = /(?:^|[\s('"`])(?:\/{1,2}(?=\S)|\\{1,2}(?=\S)|\.{1,2}[\\/](?=\S)|[a-z]:[\\/](?=\S))/iu;

/** True when any bounded canonical view contains a URL-independent path form. */
export function supportTextHasUnsafePath(value: string): boolean {
  const canonical = canonicalSupportTextViews(value);
  return canonical.unsafeEncoding || canonical.views.some((candidate) => UNSAFE_PATH.test(candidate));
}
