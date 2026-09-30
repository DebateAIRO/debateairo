import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openGeoLookup, UNKNOWN_COUNTRY } from "@debateai/geo";
import { parseApiEnvironment } from "../../packages/register/src/runtime-environment.js";
import { validApiEnvironmentFixture } from "../support/apiEnvironmentFixture.js";
import { writeCountryMmdb, type MmdbCountryNetwork } from "../support/mmdb-writer.js";

const NETWORKS: readonly MmdbCountryNetwork[] = [
  { network: "81.196.0.0/16", country: "RO" },
  { network: "8.8.8.0/24", country: "US" },
  { network: "185.220.101.0/24", country: "DE" },
  { network: "5.8.0.0/16", country: "ZZ" },
  { network: "2a02:2f00::/32", country: "RO" },
  { network: "2001:4860::/32", country: "US" }
];
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(networks = NETWORKS, tor = "185.220.101.7\n# a comment\n\n2a0b:f4c2::1\n") {
  const root = await mkdtemp(join(tmpdir(), "geo-lookup-"));
  roots.push(root);
  const countryDbPath = join(root, "country.mmdb");
  const torListPath = join(root, "tor.txt");
  await writeFile(countryDbPath, writeCountryMmdb(networks));
  await writeFile(torListPath, tor);
  return { root, countryDbPath, torListPath };
}

/** Replace a file the way the refresh script does: a new file renamed into place. */
async function replace(root: string, path: string, contents: Buffer | string): Promise<void> {
  const temporary = join(root, `.next-${Math.random().toString(16).slice(2)}`);
  await writeFile(temporary, contents);
  await rename(temporary, path);
}

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

describe("the country lookup (paid plans G1, spec §2.3.3)", () => {
  it("answers the IP's country and Tor flag, for IPv4, IPv4-mapped IPv6 and IPv6", async () => {
    const files = await fixture();
    const geo = openGeoLookup(files);
    expect(geo.lookup("81.196.20.30")).toEqual({ country: "RO", tor: false });
    expect(geo.lookup("8.8.8.8")).toEqual({ country: "US", tor: false });
    expect(geo.lookup("::ffff:8.8.8.8")).toEqual({ country: "US", tor: false });
    expect(geo.lookup("2a02:2f00:1234::1")).toEqual({ country: "RO", tor: false });
    expect(geo.lookup("2001:4860:4860::8888")).toEqual({ country: "US", tor: false });
    expect(geo.lookup("185.220.101.7")).toEqual({ country: "DE", tor: true });
    expect(geo.lookup("2a0b:f4c2:0:0:0:0:0:1")).toEqual({ country: UNKNOWN_COUNTRY, tor: true });
    geo.close();
  });

  it("answers XX for an address it does not know, a private or loopback one, DB-IP's ZZ, and garbage", async () => {
    const geo = openGeoLookup(await fixture());
    for (const ip of ["1.1.1.1", "10.1.2.3", "192.168.1.1", "172.20.0.1", "127.0.0.1", "169.254.1.1",
      "100.64.0.1", "::1", "fe80::1", "fc00::5", "5.8.1.1", "not-an-ip", "", "fe80::1%eth0"]) {
      expect(geo.lookup(ip).country, ip).toBe("XX");
    }
    geo.close();
  });

  it("answers lookupRegion with the country and no region while no city file is configured (spec §2.3.3)", async () => {
    const geo = openGeoLookup(await fixture());
    expect(geo.lookupRegion("81.196.20.30")).toEqual({ country: "RO", region: null });
    expect(geo.lookupRegion("2a02:2f00:1234::1")).toEqual({ country: "RO", region: null });
    expect(geo.lookupRegion("10.1.2.3")).toEqual({ country: UNKNOWN_COUNTRY, region: null });
    geo.close();
    expect(codeOf(() => geo.lookupRegion("8.8.8.8"))).toBe("GEO_LOOKUP_CLOSED");
  });

  it("reloads a replaced file, checking at most once a minute on its own clock", async () => {
    let now = 1_000_000;
    const files = await fixture();
    const geo = openGeoLookup({ ...files, clock: () => now });
    await replace(files.root, files.countryDbPath, writeCountryMmdb([{ network: "81.196.0.0/16", country: "IT" }]));
    await replace(files.root, files.torListPath, "81.196.20.30\n");
    now += 59_999;
    expect(geo.lookup("81.196.20.30")).toEqual({ country: "RO", tor: false });
    now += 1;
    expect(geo.lookup("81.196.20.30")).toEqual({ country: "IT", tor: true });
    geo.close();
  });

  it("keeps the last good data when a replacement is broken, and says so by code", async () => {
    let now = 0;
    const failures: string[] = [];
    const files = await fixture();
    const geo = openGeoLookup({ ...files, clock: () => now, onReloadFailure: (code) => failures.push(code) });
    await replace(files.root, files.countryDbPath, Buffer.from("not a database"));
    await replace(files.root, files.torListPath, "185.220.101.7\nnot-an-address\n");
    now += 60_000;
    expect(geo.lookup("81.196.20.30")).toEqual({ country: "RO", tor: false });
    expect(geo.lookup("185.220.101.7").tor).toBe(true);
    expect(failures.sort()).toEqual(["GEOIP_COUNTRY_DB_INVALID", "TOR_EXIT_LIST_INVALID"]);
    geo.close();
  });

  // Final review I-1: a list with no address would answer every Tor exit `tor: false`, so it is refused
  // like a malformed one — at open (the boot refuses) and on reload (the last good list stays).
  it("refuses to open over a Tor list that holds no address: empty, blank lines only, comments only", async () => {
    for (const tor of ["", "\n \n\t\n", "# the Tor Project's header\n# nothing else\n"]) {
      const files = await fixture(NETWORKS, tor);
      expect(codeOf(() => openGeoLookup(files)), JSON.stringify(tor)).toBe("TOR_EXIT_LIST_INVALID");
    }
  });

  it("keeps the last good Tor list when a replacement holds no address, and says so by code", async () => {
    let now = 0;
    const failures: string[] = [];
    const files = await fixture();
    const geo = openGeoLookup({ ...files, clock: () => now, onReloadFailure: (code) => failures.push(code) });
    await replace(files.root, files.torListPath, "");
    now += 60_000;
    expect(geo.lookup("185.220.101.7")).toEqual({ country: "DE", tor: true });
    await replace(files.root, files.torListPath, "# comments only\n\n");
    now += 60_000;
    expect(geo.lookup("185.220.101.7")).toEqual({ country: "DE", tor: true });
    expect(geo.lookup("2a0b:f4c2::1").tor).toBe(true);
    expect(failures).toEqual(["TOR_EXIT_LIST_INVALID", "TOR_EXIT_LIST_INVALID"]);
    geo.close();
  });

  it("refuses to open over a missing or invalid file, and refuses a lookup after close", async () => {
    const files = await fixture();
    expect(codeOf(() => openGeoLookup({ ...files, countryDbPath: join(files.root, "absent.mmdb") })))
      .toBe("GEOIP_COUNTRY_DB_UNAVAILABLE");
    await writeFile(files.countryDbPath, Buffer.alloc(64, 7));
    expect(codeOf(() => openGeoLookup(files))).toBe("GEOIP_COUNTRY_DB_INVALID");
    const good = await fixture();
    expect(codeOf(() => openGeoLookup({ ...good, torListPath: join(good.root, "absent.txt") })))
      .toBe("TOR_EXIT_LIST_UNAVAILABLE");
    await writeFile(good.torListPath, "1.2.3.4\nexit-node\n");
    expect(codeOf(() => openGeoLookup(good))).toBe("TOR_EXIT_LIST_INVALID");
    const closing = openGeoLookup(await fixture());
    closing.close();
    expect(codeOf(() => closing.lookup("8.8.8.8"))).toBe("GEO_LOOKUP_CLOSED");
  });

  it("requires both paths when hosted and neither when local", () => {
    const local = validApiEnvironmentFixture();
    expect(parseApiEnvironment(local).GEOIP_COUNTRY_DB_PATH).toBeUndefined();
    expect(() => parseApiEnvironment({ ...local, DEBATEAI_DEPLOYMENT_MODE: "hosted" })).toThrow("GEOIP_PATHS_REQUIRED");
    expect(() => parseApiEnvironment({
      ...local, DEBATEAI_DEPLOYMENT_MODE: "hosted", GEOIP_COUNTRY_DB_PATH: "/var/lib/debateai-geoip/dbip-country-lite.mmdb"
    })).toThrow("GEOIP_PATHS_REQUIRED");
    expect(parseApiEnvironment({
      ...local, DEBATEAI_DEPLOYMENT_MODE: "hosted",
      GEOIP_COUNTRY_DB_PATH: "/var/lib/debateai-geoip/dbip-country-lite.mmdb",
      TOR_EXIT_LIST_PATH: "/var/lib/debateai-geoip/tor-exit-list.txt"
    }).DEPLOYMENT_MODE).toBe("hosted");
  });
});
