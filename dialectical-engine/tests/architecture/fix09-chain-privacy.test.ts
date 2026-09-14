import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function bytes(relative:string):Promise<Buffer>{
  return readFile(new URL(`../../${relative}`,import.meta.url));
}

describe("FIX-09 chain privacy",()=>{
  it("proves public-only verification, descriptor trust, safe journals, and absence of private or user material",async()=>{
    const native=(await bytes("packages/obs-capture/native/fix09-openat-read.c")).toString("utf8");
    expect(native).toContain("if (argc != 2) return 64;");
    expect(native).toContain("openat(ROOT_FD, \"chain\"");
    expect(native).toContain("openat(ROOT_FD, \"keys\"");
    expect(native).toContain("O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC");
    expect(native).toContain("fstatat(parent, name, &path, AT_SYMLINK_NOFOLLOW)");
    expect(native.match(/memset_s\s*\(/gu)).toHaveLength(2);
    expect(native).not.toMatch(/\b(?:socket|connect|listen|accept|system|popen|exec[lv]p?)\s*\(/u);
    expect(native).not.toContain("PRIVATE KEY");

    const helper=(await bytes("packages/obs-capture/src/chain/private-key-helper.ts")).toString("utf8");
    expect(helper).toContain("cwd: \"/\", env: {}, shell: false");
    expect(helper).toContain("stdio: [\"ignore\", \"ignore\", \"pipe\", root.fd, \"pipe\", \"pipe\"]");
    expect(helper).not.toMatch(/console\.|process\.stdout|process\.stderr/u);
    expect([...helper.matchAll(/export\s+async\s+function\s+(\w+)/gu)].map((match)=>match[1]))
      .toEqual(["openPinnedPrivateKey"]);
    expect(helper).not.toMatch(/export\s+function\s+/u);

    const signer=(await bytes("packages/obs-capture/src/chain/signer.ts")).toString("utf8");
    expect(signer).toContain("transfer.fill(0)");
    expect(signer).toContain("const released = Object.freeze(Object.create(null))");
    expect([...signer.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/gu)].map((match)=>match[1]))
      .toEqual([
        "prepareChainedWriterSigner", "getReleasedSigner", "installReleasedSignerForTest",
        "assertPreActivationSignerAbsent", "configureSignerAuthorityForTest",
        "abortAllPreparedSignersForTest", "resetSignerStateForTest",
      ]);
    expect(signer).not.toMatch(/export\s+(?:async\s+)?function\s+(?:sign|exportKey|getKey)\b/u);
    expect(signer).not.toContain("privateKey.export");

    const verifier=await bytes("packages/obs-capture/scripts/verify-fix09-native-wipe.mjs");
    expect(verifier).toHaveLength(47_689);
    expect(createHash("sha256").update(verifier).digest("hex"))
      .toBe("b97c89f278812c75deb6f234d75f18a1bba1d1a8320e5ea452bbf2cfaf75a66f");
    const packageJson=JSON.parse((await bytes("packages/obs-capture/package.json")).toString("utf8"));
    expect(packageJson.bin).toBeUndefined();
  });
});
