export type ActivationState = "ABSENT" | "FILE_ONLY" | "DATABASE_ONLY" | "MATCHED" | "MISMATCH";

export function activationState(fileDigest: string | null, databaseDigest: string | null): ActivationState {
  if (fileDigest === null && databaseDigest === null) return "ABSENT";
  if (fileDigest !== null && databaseDigest === null) return "FILE_ONLY";
  if (fileDigest === null) return "DATABASE_ONLY";
  return fileDigest === databaseDigest ? "MATCHED" : "MISMATCH";
}
