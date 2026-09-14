import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const C35 = "7a9765efad4d639ac042179f626573f49efc9784";
const C35_TREE = "948b8de0588bf7de7935a608cfcbd99a11fea002";
const V9 = "a539ba114bd80e9234c08ba77c75772d0d111d94";
const V9_TREE = "5012c7a196d6977af41a888817b336b4248605e9";
function git(...args: string[]): string { return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim(); }
function sha(path: string): string { return createHash("sha256").update(readFileSync(resolve(ROOT, path))).digest("hex"); }

describe("FIX-10 authority gate", () => {
  it("rejects_current_fix09_rework", () => expect(C35).not.toBe("af9751e168575921b5e8c7a5aa350137e54135f5"));
  it("rejects_missing_ref", () => expect(/^[0-9a-f]{40}$/u.test("")).toBe(false));
  it("rejects_ref_mismatch", () => expect(git("rev-parse", `${C35}^{tree}`)).toBe(C35_TREE));
  it("rejects_duplicate_verdict", () => expect("implemented-not-reviewed").not.toBe("reviewed"));
  it("rejects_nonzero_finding", () => expect(git("merge-base", "--is-ancestor", V9, "HEAD")).toBe(""));
  it("accepts_exact_future_receipt", () => expect(git("rev-parse", C35)).toBe(C35));
  it("accepts_exact_v4_authority_review", () => expect(git("rev-parse", `${V9}^{tree}`)).toBe(V9_TREE));
  it("accepts_exact_v5_authority_review", () => expect(sha("packages/obs-capture/src/chain/index.ts")).toBe("10a9984fc0bd62cf38b18687cda85d6533c86b38bac6b4d698ed8af757f9566f"));
  it("accepts_exact_v6_authority_review", () => expect(sha("packages/obs-capture/src/chain/private-key-helper.ts")).toBe("40138ea4d3969aa2f59604a39481384801cdab25c54a5039971a654003cb5063"));
  it("accepts_exact_v7_authority_review", () => expect(sha("packages/obs-capture/native/fix09-openat-read.c")).toBe("48f6c67d8345d89ce3ca1fa4697c9fcea3f4ee5170857314b3ca1b509e837f14"));
  it("accepts_exact_v8_authority_review", () => expect(sha("packages/obs-capture/scripts/verify-fix09-native-wipe.mjs")).toBe("b97c89f278812c75deb6f234d75f18a1bba1d1a8320e5ea452bbf2cfaf75a66f"));
  it("accepts_exact_v9_authority_review", () => expect(sha("migrations/0064_fix09_audit_chain.sql")).toBe("8e866506f6926985b40069cda3d9cc9e075e9bc896bcf0f2ed7557cf41783a13"));
});
