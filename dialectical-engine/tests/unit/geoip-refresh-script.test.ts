import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { openGeoLookup } from "@debateai/geo";
import { writeCountryMmdb } from "../support/mmdb-writer.js";

const execute = promisify(execFile);
const SCRIPT = resolve(process.cwd(), "deploy/vps/geoip-refresh.sh");
/** A stand-in for curl: serves the two known URLs from a fixture directory, logs each request. */
const FAKE_CURL = `#!/usr/bin/env bash
set -euo pipefail
output=""
url=""
previous=""
for argument in "$@"; do
  if [ "$previous" = "--output" ]; then output="$argument"; fi
  case "$argument" in https://*) url="$argument" ;; esac
  previous="$argument"
done
printf '%s\\n' "$url" >> "$FAKE_CURL_ROOT/requests.log"
case "$url" in
  https://check.torproject.org/torbulkexitlist) cp "$FAKE_CURL_ROOT/tor.txt" "$output" ;;
  https://download.db-ip.com/free/dbip-country-lite-*.mmdb.gz) cp "$FAKE_CURL_ROOT/country.mmdb.gz" "$output" ;;
  *) exit 22 ;;
esac
`;
const COUNTRY = writeCountryMmdb([
  { network: "81.196.0.0/16", country: "RO" },
  { network: "185.220.101.0/24", country: "DE" }
]);
const TOR = "185.220.101.7\n185.220.101.8\n2a0b:f4c2::1\n";
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function stage(files: Readonly<{ tor: string; country: Buffer }> = { tor: TOR, country: COUNTRY }) {
  const root = await mkdtemp(join(tmpdir(), "geoip-refresh-"));
  roots.push(root);
  const staged = { bin: join(root, "bin"), state: join(root, "state"), fake: join(root, "fake") };
  for (const directory of Object.values(staged)) await mkdir(directory);
  await writeFile(join(staged.bin, "curl"), FAKE_CURL);
  await chmod(join(staged.bin, "curl"), 0o755);
  await writeFile(join(staged.fake, "tor.txt"), files.tor);
  await writeFile(join(staged.fake, "country.mmdb.gz"), gzipSync(files.country));
  return staged;
}

async function refresh(
  staged: Readonly<{ bin: string; state: string; fake: string }>,
  withState = true
): Promise<{ code: number; stdout: string; stderr: string }> {
  const environment: Record<string, string> = {
    PATH: `${staged.bin}:${process.env.PATH ?? ""}`,
    FAKE_CURL_ROOT: staged.fake,
    GEOIP_COUNTRY_MIN_BYTES: "64",
    GEOIP_TOR_MIN_LINES: "2",
    ...(withState ? { STATE_DIRECTORY: staged.state } : {})
  };
  try {
    const { stdout, stderr } = await execute("bash", [SCRIPT], { env: environment });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: unknown; stdout?: string; stderr?: string };
    return { code: typeof failure.code === "number" ? failure.code : -1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
}

const countryPath = (state: string) => join(state, "dbip-country-lite.mmdb");
const torPath = (state: string) => join(state, "tor-exit-list.txt");
const requests = async (fake: string) => (await readFile(join(fake, "requests.log"), "utf8")).trim().split("\n");

describe("deploy/vps/geoip-refresh.sh (paid plans G4)", () => {
  it("downloads, checks and renames both files into place, world-readable, readable by the lookup", async () => {
    const staged = await stage();
    const result = await refresh(staged);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/^GEOIP_REFRESH_OK tor-list lines=3$/mu);
    expect(result.stdout).toMatch(/^GEOIP_REFRESH_OK country-db month=\d{4}-\d{2} bytes=\d+$/mu);
    for (const path of [countryPath(staged.state), torPath(staged.state)]) {
      expect((await stat(path)).mode & 0o777, path).toBe(0o644);
    }
    expect((await readdir(staged.state)).sort()).toEqual(["dbip-country-lite.mmdb", "tor-exit-list.txt"]);
    const geo = openGeoLookup({ countryDbPath: countryPath(staged.state), torListPath: torPath(staged.state) });
    expect(geo.lookup("81.196.20.30")).toEqual({ country: "RO", tor: false });
    expect(geo.lookup("185.220.101.7")).toEqual({ country: "DE", tor: true });
    geo.close();
  });

  it("skips a fresh country file, and fetches it again once it is older than 27 days", async () => {
    const staged = await stage();
    await refresh(staged);
    const second = await refresh(staged);
    expect(second.code).toBe(0);
    expect(second.stdout).toContain("GEOIP_REFRESH_SKIPPED country-db fresh");
    const countryRequests = (await requests(staged.fake)).filter((url) => url.includes("dbip-country-lite-"));
    expect(countryRequests).toHaveLength(1);
    const old = new Date(Date.now() - 40 * 86_400_000);
    await utimes(countryPath(staged.state), old, old);
    const third = await refresh(staged);
    expect(third.stdout).toMatch(/GEOIP_REFRESH_OK country-db/u);
  });

  it("refuses a short or malformed Tor list and keeps the previous one", async () => {
    const staged = await stage();
    await refresh(staged);
    const before = await readFile(torPath(staged.state), "utf8");
    await writeFile(join(staged.fake, "tor.txt"), "1.2.3.4\n");
    const short = await refresh(staged);
    expect(short.code).toBe(1);
    expect(short.stderr).toMatch(/GEOIP_REFRESH_REFUSED tor-list lines=1 invalid=0/u);
    await writeFile(join(staged.fake, "tor.txt"), "1.2.3.4\nexit-node\n5.6.7.8\n");
    const malformed = await refresh(staged);
    expect(malformed.stderr).toMatch(/GEOIP_REFRESH_REFUSED tor-list lines=2 invalid=1/u);
    expect(await readFile(torPath(staged.state), "utf8")).toBe(before);
  });

  it("refuses every line the API's own parser would refuse, so a list it accepts never refuses the boot", async () => {
    const staged = await stage();
    await refresh(staged);
    const before = await readFile(torPath(staged.state), "utf8");
    // Hex letters, three octets, a leading-zero octet, an octet over 255, two "::", nine groups, a zone id:
    // all but the last are made only of [0-9A-Fa-f:.], which a one-class check would count as addresses;
    // packages/geo's parseIp refuses every one, and would then refuse the API boot (TOR_EXIT_LIST_INVALID).
    await writeFile(join(staged.fake, "tor.txt"),
      "1.2.3.4\nabc\n1.2.3\n01.2.3.4\n1.2.3.256\n1::2::3\n1:2:3:4:5:6:7:8:9\nfe80::1%eth0\n2a0b:f4c2::1\n5.6.7.8\n");
    const refused = await refresh(staged);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toMatch(/GEOIP_REFRESH_REFUSED tor-list lines=3 invalid=7/u);
    expect(await readFile(torPath(staged.state), "utf8")).toBe(before);
    // A list this check accepts is one the lookup opens.
    await writeFile(join(staged.fake, "tor.txt"), "# comment\n\n 1.2.3.4 \n::1\n2a0b:f4c2:0:0:0:0:0:1\n");
    const accepted = await refresh(staged);
    expect(accepted.code, accepted.stderr).toBe(0);
    expect(accepted.stdout).toMatch(/^GEOIP_REFRESH_OK tor-list lines=3$/mu);
    const geo = openGeoLookup({ countryDbPath: countryPath(staged.state), torListPath: torPath(staged.state) });
    expect(geo.lookup("1.2.3.4").tor).toBe(true);
    geo.close();
  });

  it("refuses a country file without the MMDB marker, and still refreshes the Tor list", async () => {
    const staged = await stage({ tor: TOR, country: Buffer.alloc(256, 7) });
    const result = await refresh(staged);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/GEOIP_REFRESH_REFUSED country-db month=\d{4}-\d{2} bytes=256/u);
    expect((await readdir(staged.state)).sort()).toEqual(["tor-exit-list.txt"]);
  });

  // Both refresh functions run under `|| status=1`, where bash ignores set -e: a failing check step
  // must refuse by itself. A tool that dies stands in for SIGSYS from SystemCallFilter, running out
  // of memory, or a missing binary.
  it("refuses the Tor list when its check fails or prints no numbers, and keeps the previous one", async () => {
    const staged = await stage();
    await refresh(staged);
    const before = await readFile(torPath(staged.state), "utf8");
    await writeFile(join(staged.fake, "tor.txt"), "1.2.3.4\nexit-node\n5.6.7.8\n");
    await writeFile(join(staged.bin, "awk"), "#!/usr/bin/env bash\nexit 1\n");
    await chmod(join(staged.bin, "awk"), 0o755);
    const failed = await refresh(staged);
    expect(failed.code).toBe(1);
    expect(failed.stderr).toMatch(/GEOIP_REFRESH_REFUSED tor-list check/u);
    expect(failed.stdout).not.toMatch(/GEOIP_REFRESH_OK tor-list/u);
    expect(await readFile(torPath(staged.state), "utf8")).toBe(before);
    await writeFile(join(staged.bin, "awk"), "#!/usr/bin/env bash\nprintf 'x y\\n'\nexit 0\n");
    const garbled = await refresh(staged);
    expect(garbled.code).toBe(1);
    expect(garbled.stderr).toMatch(/GEOIP_REFRESH_REFUSED tor-list lines=x invalid=y/u);
    expect(garbled.stdout).not.toMatch(/GEOIP_REFRESH_OK tor-list/u);
    expect(await readFile(torPath(staged.state), "utf8")).toBe(before);
  });

  it("refuses the country file when its size check fails, and keeps the previous one", async () => {
    const staged = await stage();
    await refresh(staged);
    const before = await readFile(countryPath(staged.state));
    const old = new Date(Date.now() - 40 * 86_400_000);
    await utimes(countryPath(staged.state), old, old);
    await writeFile(join(staged.fake, "country.mmdb.gz"),
      gzipSync(writeCountryMmdb([{ network: "81.196.0.0/16", country: "IT" }])));
    await writeFile(join(staged.bin, "wc"), "#!/usr/bin/env bash\nexit 1\n");
    await chmod(join(staged.bin, "wc"), 0o755);
    const failed = await refresh(staged);
    expect(failed.code).toBe(1);
    expect(failed.stderr).toMatch(/GEOIP_REFRESH_REFUSED country-db month=\d{4}-\d{2} check/u);
    expect(failed.stdout).not.toMatch(/GEOIP_REFRESH_OK country-db/u);
    expect((await readFile(countryPath(staged.state))).equals(before)).toBe(true);
  });

  it("refuses to run outside its systemd unit", async () => {
    const result = await refresh(await stage(), false);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("GEOIP_REFRESH_REFUSED no state directory");
  });
});
