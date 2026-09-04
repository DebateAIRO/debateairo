export const FIX01_RELEASE_MANIFEST_VERSION = 2 as const;
export const FIX01_RELEASE_VERIFIER_VERSION =
  "fix01-release-admission-v2" as const;

export const FIX01_RELEASE_MANIFEST_KEYS = [
  "version",
  "verdict",
  "phase",
  "spool_directory_realpath",
  "target_build_ref",
  "verified_at",
  "verifier_version",
  "admission_ref",
  "admission_record_count",
  "first_snapshot_sha256",
  "second_snapshot_sha256",
  "source_entry_count",
  "candidate_count",
  "lawful_count",
  "indexed_candidate_count",
  "rejected_count",
  "requires_v_review",
  "entries",
  "index",
] as const;

export const FIX01_RELEASE_ENTRY_KEYS = [
  "basename",
  "kind",
  "dev",
  "ino",
  "nlink",
  "size",
  "mtime_ms",
  "mtime_ns",
  "ctime_ns",
  "sha256",
  "classification",
  "indexed",
  "reason",
] as const;

export const FIX01_RELEASE_INDEX_KEYS = [
  "basename",
  "dev",
  "ino",
  "nlink",
  "size",
  "sha256",
  "covered_lawful_count",
] as const;

export type Fix01ReleaseClassification =
  | "lawful_empty"
  | "lawful_envelopes"
  | "retained_invalid_bytes"
  | "reserved_metadata"
  | "rejected_unsafe_path";

export type Fix01ReleaseEntryKind =
  | "candidate"
  | "reserved"
  | "rejected_unsafe_path";

export interface Fix01ReleaseManifestEntryV2 {
  readonly basename: string;
  readonly kind: Fix01ReleaseEntryKind;
  readonly dev: string | null;
  readonly ino: string | null;
  readonly nlink: number | null;
  readonly size: number | null;
  readonly mtime_ms: number | null;
  readonly mtime_ns: string | null;
  readonly ctime_ns: string | null;
  readonly sha256: string | null;
  readonly classification: Fix01ReleaseClassification;
  readonly indexed: boolean;
  readonly reason: string | null;
}

export interface Fix01ReleaseManifestIndexV2 {
  readonly basename: ".obs-spool-index-v1";
  readonly dev: string;
  readonly ino: string;
  readonly nlink: 1;
  readonly size: number;
  readonly sha256: string;
  readonly covered_lawful_count: number;
}

export interface Fix01ReleaseAdmissionManifestV2 {
  readonly version: typeof FIX01_RELEASE_MANIFEST_VERSION;
  readonly verdict: "PASS_EMPTY" | "PASS_INDEXED";
  readonly phase: "before_first_indexed_launch";
  readonly spool_directory_realpath: string;
  readonly target_build_ref: string;
  readonly verified_at: string;
  readonly verifier_version: typeof FIX01_RELEASE_VERIFIER_VERSION;
  readonly admission_ref: string;
  readonly admission_record_count: number;
  readonly first_snapshot_sha256: string;
  readonly second_snapshot_sha256: string;
  readonly source_entry_count: number;
  readonly candidate_count: number;
  readonly lawful_count: number;
  readonly indexed_candidate_count: number;
  readonly rejected_count: number;
  readonly requires_v_review: boolean;
  readonly entries: readonly Fix01ReleaseManifestEntryV2[];
  readonly index: Fix01ReleaseManifestIndexV2 | null;
}

export function canonicalFix01ReleaseJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalFix01ReleaseJson(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalFix01ReleaseJson(record[key])}`
    ).join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) {
    throw new TypeError("FIX01_RELEASE_MANIFEST_VALUE_INVALID");
  }
  return encoded;
}
