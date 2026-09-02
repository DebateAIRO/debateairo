import { chmod, link, lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEVELOPMENT_COMPOSE_SECRET_KEYS,
  developmentComposeSecretsPath,
  ensureDevelopmentComposeSecrets
} from "../../apps/runner/src/dev-compose-secrets.js";

const roots: string[] = [];

async function custodyRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "debateai-compose-secrets-"));
  roots.push(root);
  return root;
}

function parse(source: string): Map<string, string> {
  return new Map(source.slice(0, -1).split("\n").map((row) => {
    const separator = row.indexOf("=");
    return [row.slice(0, separator), row.slice(separator + 1)] as const;
  }));
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("development compose secrets custody (L7-F2, L7-F3, L7-F4)", () => {
  it("generates every key once at 0600 and reuses the same values", async () => {
    const root = await custodyRoot();
    const path = await ensureDevelopmentComposeSecrets(root);
    expect(path).toBe(developmentComposeSecretsPath(root));

    const metadata = await lstat(path);
    expect(metadata.mode & 0o777).toBe(0o600);
    expect(metadata.nlink).toBe(1);

    const first = parse(await readFile(path, "utf8"));
    expect([...first.keys()].sort()).toEqual([...DEVELOPMENT_COMPOSE_SECRET_KEYS].sort());
    for (const [key, value] of first) expect(value.length, key).toBeGreaterThanOrEqual(16);
    // Distinct material per credential: one leak must not be four.
    expect(new Set(first.values()).size).toBe(first.size);

    await ensureDevelopmentComposeSecrets(root);
    expect(parse(await readFile(path, "utf8"))).toEqual(first);
  });

  it("refuses a drifted mode, a hard link, and a truncated file instead of repairing them", async () => {
    const loosened = await custodyRoot();
    const loosenedPath = await ensureDevelopmentComposeSecrets(loosened);
    await chmod(loosenedPath, 0o644);
    await expect(ensureDevelopmentComposeSecrets(loosened))
      .rejects.toThrow("DEV_COMPOSE_SECRETS_CUSTODY_INVALID");
    // The exposure must stay visible rather than be narrowed back.
    expect((await lstat(loosenedPath)).mode & 0o777).toBe(0o644);

    const linked = await custodyRoot();
    const linkedPath = await ensureDevelopmentComposeSecrets(linked);
    await link(linkedPath, join(linked, "compose-secrets-copy.env"));
    await expect(ensureDevelopmentComposeSecrets(linked))
      .rejects.toThrow("DEV_COMPOSE_SECRETS_CUSTODY_INVALID");

    const partial = await custodyRoot();
    await writeFile(
      developmentComposeSecretsPath(partial),
      "HATCHET_DATABASE_PASSWORD=only-one-key\n",
      { encoding: "utf8", mode: 0o600 }
    );
    await expect(ensureDevelopmentComposeSecrets(partial))
      .rejects.toThrow("DEV_COMPOSE_SECRETS_INCOMPLETE");
  });
});
