import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LegalManifest, LegalTranslations } from "../../apps/ui/scripts/generate-legal-data.mjs";
import {
  englishVersionAndDay, legalDayText, parseLegalDay, planLegalRedate, romanianToday
} from "../../apps/ui/scripts/legal-redate.mjs";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";

/**
 * `pnpm run legal:redate --date YYYY-MM-DD` (apps/ui/scripts/legal-redate.mjs) sets the day the current Terms of
 * Service and Privacy Policy take effect, everywhere the repository's rules need it, in one command. These tests pin:
 *  - the day in each language's words, for other months too;
 *  - the plan on the real drafts: exactly the eyebrow and the version line of every draft, the "last updated" sentence
 *    of the languages that follow the current English text, the archive copies of the current version only, and the
 *    translations to record again;
 *  - the refusals: a day before today, a day not after the previous version's, a current version that is in the
 *    release the site runs, a draft whose day does not match;
 *  - the whole command on a copy of the legal files, with git standing in for the live release: --dry-run writes
 *    nothing, a run leaves the release check passing and the 1.0 copies byte for byte, and a released version is refused.
 */

const root = process.cwd();
const sha = (text: string | Buffer): string => createHash("sha256").update(text).digest("hex");
const DRAFT = { PRIVACY: "privacy-policy.md", TERMS: "terms-of-service.md" } as const;
const readDraft = (code: string, kind: "PRIVACY" | "TERMS") => readFileSync(resolve(root, "apps/ui/legal", code, DRAFT[kind]), "utf8");
const manifest = (): LegalManifest => JSON.parse(readFileSync(resolve(root, "packages/legal-manifest/src/manifest.json"), "utf8"));
const translations = (): LegalTranslations => JSON.parse(readFileSync(resolve(root, "apps/ui/legal/translated-from.json"), "utf8"));
const readArchived = (path: string) => readFileSync(resolve(root, path), "utf8");
const CODES = LOCALES.map(({ code }) => code).sort();
const current = englishVersionAndDay(readDraft("en", "PRIVACY"));
const dayAfter = (day: { year: number; month: number; day: number }, days: number) => {
  const date = new Date(Date.UTC(day.year, day.month - 1, day.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
};
/** A plan on the real drafts: `to` and `today` chosen around the working day, nothing released. */
const plan = (to: { year: number; month: number; day: number }, overrides: Partial<Parameters<typeof planLegalRedate>[0]> = {}) => planLegalRedate({
  to, today: current.day, readDraft, manifest: manifest(), translations: translations(), readArchived, isReleased: () => false, ...overrides
});
const refusal = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected a refusal");
};

describe("the day in each language's words", () => {
  it("follows the drafts' grammar for other months too", () => {
    const first = parseLegalDay("2026-12-01");
    expect(legalDayText("en", first, "line")).toBe("1 December 2026");
    expect(legalDayText("en", first, "eyebrow")).toBe("1 DECEMBER 2026");
    expect(legalDayText("fr", first, "line")).toBe("1 décembre 2026");
    expect(legalDayText("ro", first, "line")).toBe("1 decembrie 2026");
    expect(legalDayText("de", first, "eyebrow")).toBe("1. DEZEMBER 2026");
    expect(legalDayText("ja", first, "line")).toBe("2026年12月1日");
    expect(legalDayText("zh", first, "line")).toBe("2026 年 12 月 1 日");
    expect(legalDayText("vi", first, "eyebrow")).toBe("1 THÁNG 12 NĂM 2026");
    expect(legalDayText("sl", first, "line")).toBe("1. decembra 2026");
    expect(legalDayText("et", first, "line")).toBe("1. detsember 2026");
    expect(legalDayText("et", first, "eyebrow")).toBe("1. DETSEMBRIST 2026");
    expect(legalDayText("lv", first, "line")).toBe("2026. gada 1. decembris");
    expect(legalDayText("lv", first, "eyebrow")).toBe("2026. GADA 1. DECEMBRA");
    expect(legalDayText("ar", first, "line")).toBe("1 ديسمبر 2026");
  });

  it("takes a calendar day as YYYY-MM-DD only", () => {
    expect(parseLegalDay("2026-11-26")).toEqual({ year: 2026, month: 11, day: 26 });
    for (const bad of ["2026-02-30", "26-11-2026", "2026-11-26T00:00", "", undefined, 20261126]) {
      expect(() => parseLegalDay(bad), String(bad)).toThrow("LEGAL_REDATE_REFUSED");
    }
    expect(romanianToday(new Date("2026-11-24T22:30:00Z"))).toEqual({ year: 2026, month: 11, day: 25 });
  });
});

describe("the plan on the drafts as they are", () => {
  const next = dayAfter(current.day, 1);

  it("changes every draft's eyebrow and version line, and the last-updated sentence where the text follows English", () => {
    const result = plan(next);
    expect(result.drafts.map((draft) => draft.path).sort()).toEqual(
      CODES.flatMap((code) => [`apps/ui/legal/${code}/privacy-policy.md`, `apps/ui/legal/${code}/terms-of-service.md`]).sort());
    for (const draft of result.drafts) {
      const code = draft.path.split("/")[3]!;
      // Every translation follows the current English text (24 November 2026), so each Privacy Policy's last-updated day moves too.
      const following = draft.path.endsWith("privacy-policy.md");
      expect(draft.lines.map((line) => line.before.slice(0, 9)).slice(0, 2), draft.path).toEqual(["eyebrow: ", "**Version"]);
      expect(draft.lines, draft.path).toHaveLength(following ? 3 : 2);
      if (following) {
        expect(draft.lines[2]!.before).toContain(legalDayText(code, current.day, "line"));
        expect(draft.lines[2]!.after).toContain(legalDayText(code, next, "line"));
      }
      expect(draft.after).toContain(`**Version 1.1 · Effective ${legalDayText(code, next, "line")} · `);
      expect(draft.after).toContain(legalDayText(code, next, "eyebrow"));
      expect(draft.after.split("\n").length).toBe(readFileSync(resolve(root, draft.path), "utf8").split("\n").length);
    }
    const translations = CODES.filter((code) => code !== "en");
    expect(result.retranslate).toEqual({ PRIVACY: translations, TERMS: translations });
  });

  it("removes the archive copies of the current version only; the 1.0 copies are never touched or asked about", () => {
    const asked: string[] = [];
    const result = plan(next, { isReleased: (path) => (asked.push(path), false) });
    const archive = manifest().archive;
    const copies = (version: string) => (["PRIVACY", "TERMS"] as const).flatMap((kind) => Object.entries(archive[kind])
      .flatMap(([code, entries]) => Object.values(entries).filter((entry) => entry.version === version).map((entry) => ({ kind, code, path: entry.path }))));
    // The archive holds the 1.1 texts of all 35 languages, one per document and language; only English, French and
    // Romanian also hold 1.0 (the launch texts), since the other 32 languages were first released at 1.1.
    const currentCopies = copies("1.1");
    expect(currentCopies).toHaveLength(2 * CODES.length);
    for (const kind of ["PRIVACY", "TERMS"] as const) {
      expect(currentCopies.filter((copy) => copy.kind === kind).map((copy) => copy.code).sort(), kind).toEqual(CODES);
      expect(copies("1.0").filter((copy) => copy.kind === kind).map((copy) => copy.code).sort(), kind).toEqual(["en", "fr", "ro"]);
    }
    const currentPaths = currentCopies.map((copy) => copy.path).sort();
    expect(result.archiveRemovals.map((removal) => removal.path).sort()).toEqual(currentPaths);
    expect(asked.sort()).toEqual(currentPaths);
    for (const { path } of copies("1.0")) expect(asked, path).not.toContain(path);
  });

  it("changes nothing for the day the texts already carry", () => {
    const result = plan(current.day);
    expect(result.drafts).toEqual([]);
    expect(result.archiveRemovals).toEqual([]);
  });

  it("refuses a day before today, a day not after 1.0's, a released current version and a draft whose day does not match", () => {
    expect(refusal(() => plan(next, { today: dayAfter(next, 1) }))).toMatch(/^LEGAL_REDATE_REFUSED: .* is before today .*: a text dated before it is posted reads as retroactive$/u);
    const launched = englishVersionAndDay(readArchived(Object.values(manifest().archive.PRIVACY.en ?? {}).find((entry) => entry.version === "1.0")!.path)).day;
    for (const day of [launched, dayAfter(launched, -1)]) {
      expect(refusal(() => plan(day, { today: dayAfter(launched, -5) }))).toBe(
        `LEGAL_REDATE_REFUSED: ${day.year}-${String(day.month).padStart(2, "0")}-${String(day.day).padStart(2, "0")} is not after ${legalDayText("en", launched, "line")}, the day the Privacy Policy 1.0 took effect`);
    }
    expect(refusal(() => plan(next, { isReleased: (path) => path.startsWith("apps/ui/legal/archive/fr/") })))
      .toMatch(/^LEGAL_REDATE_REFUSED: the Privacy Policy 1\.1 \(apps\/ui\/legal\/archive\/fr\/[0-9a-f]{64}\.md\) is in the release the site runs/u);
    const wrong = (code: string, kind: "PRIVACY" | "TERMS") => code === "de" && kind === "TERMS"
      ? readDraft(code, kind).replace(/^(eyebrow: .*?)\d+\. /mu, (_, head: string) => `${head}1. `) : readDraft(code, kind);
    expect(refusal(() => plan(next, { readDraft: wrong }))).toMatch(/^LEGAL_REDATE_REFUSED: apps\/ui\/legal\/de\/terms-of-service\.md: its eyebrow does not give /u);
  });
});

describe("the command on a copy of the legal files", () => {
  // The real path: a script runs its command line only when it was started by that path (macOS's tmpdir is a link).
  const copy = realpathSync(mkdtempSync(join(tmpdir(), "legal-redate-")));
  afterAll(() => rmSync(copy, { recursive: true, force: true }));
  beforeAll(() => {
    for (const path of ["apps/ui/scripts", "apps/ui/legal", "apps/ui/lib/legal", "apps/ui/lib/i18n/locales.ts", "apps/ui/lib/privacyPolicy.ts",
      "apps/ui/lib/termsOfService.ts", "apps/ui/package.json", "packages/legal-manifest/src/manifest.json"]) {
      cpSync(resolve(root, path), join(copy, path), { recursive: true });
    }
    for (const { code } of LOCALES) {
      const billing = resolve(root, "apps/ui/messages", code, "billing.json");
      if (!existsSync(billing)) continue;
      mkdirSync(join(copy, "apps/ui/messages", code), { recursive: true });
      cpSync(billing, join(copy, "apps/ui/messages", code, "billing.json"));
    }
    git("init", "-q");
  });
  const git = (...args: string[]) => {
    const result = spawnSync("git", ["-C", copy, "-c", "user.name=legal-redate", "-c", "user.email=legal-redate@example.invalid",
      "-c", "commit.gpgsign=false", ...args], { encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim();
  };
  const archived = (version: string) => (["PRIVACY", "TERMS"] as const).flatMap((kind) => Object.values(manifest().archive[kind])
    .flatMap((entries) => Object.values(entries).filter((entry) => entry.version === version).map((entry) => entry.path)));
  /** The live release: a commit holding `paths`, named by the copy's tests/n1-baseline.json. */
  const liveRelease = (paths: readonly string[]) => {
    git("add", "--", ...paths);
    git("commit", "-q", "--allow-empty", "-m", "the release the site runs");
    mkdirSync(join(copy, "tests"), { recursive: true });
    writeFileSync(join(copy, "tests/n1-baseline.json"), JSON.stringify({ commit: git("rev-parse", "HEAD") }));
  };
  const redate = (...args: string[]) => spawnSync(process.execPath, [join(copy, "apps/ui/scripts/legal-redate.mjs"), ...args],
    { cwd: copy, encoding: "utf8" });
  const tree = () => Object.fromEntries(readdirSync(copy, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && !join(entry.parentPath, entry.name).includes(`${join(copy, ".git")}`))
    .map((entry) => [join(entry.parentPath, entry.name).slice(copy.length + 1), sha(readFileSync(join(entry.parentPath, entry.name)))]));
  /** A day after today, so the command takes it whenever the test runs. */
  const day = "2099-01-15";
  const to = parseLegalDay(day);

  it("refuses a current version that is in the release the site runs, and writes nothing", () => {
    liveRelease([...archived("1.0"), ...archived("1.1")]);
    const before = tree();
    const result = redate("--date", day);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/^LEGAL_REDATE_REFUSED: the Privacy Policy 1\.1 \(.*\) is in the release the site runs \(tests\/n1-baseline\.json\)/u);
    expect(tree()).toEqual(before);
  });

  it("with --dry-run prints the changed lines and writes nothing", () => {
    git("rm", "-q", "--cached", "--", ...archived("1.1"));
    liveRelease(archived("1.0"));
    const before = tree();
    const result = redate("--date", day, "--dry-run");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`  + **Version 1.1 · Effective ${legalDayText("en", to, "line")} · Previous versions at dezbatere.ro/privacy/versions`);
    expect(result.stdout).toContain(`dry run: ${2 * CODES.length} draft(s) would change; nothing was written`);
    expect(tree()).toEqual(before);
  });

  it("re-dates every draft, keeps the 1.0 copies byte for byte, makes the 1.1 copies of all 35 languages again and passes the release check", () => {
    const oneZero = Object.fromEntries(archived("1.0").map((path) => [path, sha(readFileSync(join(copy, path)))]));
    // The launch texts: English, French and Romanian only.
    expect(Object.keys(oneZero).map((path) => path.split("/")[4]).sort()).toEqual(["en", "en", "fr", "fr", "ro", "ro"]);
    const result = redate("--date", day);
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("Legal texts: ready for release.");
    expect(result.stdout).toContain(`LEGAL_REDATE_DONE: the Terms of Service and the Privacy Policy take effect on ${legalDayText("en", to, "line")}`);
    const after = JSON.parse(readFileSync(join(copy, "packages/legal-manifest/src/manifest.json"), "utf8")) as LegalManifest;
    for (const [path, hash] of Object.entries(oneZero)) expect(sha(readFileSync(join(copy, path))), path).toBe(hash);
    for (const path of archived("1.1")) expect(existsSync(join(copy, path)), path).toBe(false);
    const record = JSON.parse(readFileSync(join(copy, "apps/ui/legal/translated-from.json"), "utf8")) as LegalTranslations;
    for (const kind of ["PRIVACY", "TERMS"] as const) {
      const english = readFileSync(join(copy, "apps/ui/legal/en", DRAFT[kind]), "utf8");
      // Every translation is recorded again as following the re-dated English text, and every language's text is archived again.
      for (const code of CODES.filter((code) => code !== "en")) expect(record[kind][code], `${kind} ${code}`).toEqual({ version: "1.1", sha256: sha(english) });
      for (const code of CODES) {
        const text = readFileSync(join(copy, "apps/ui/legal", code, DRAFT[kind]), "utf8");
        expect(after.archive[kind][code]![sha(text)], `${kind} ${code}`).toEqual({ version: "1.1", path: `apps/ui/legal/archive/${code}/${sha(text)}.md` });
        expect(readFileSync(join(copy, `apps/ui/legal/archive/${code}/${sha(text)}.md`), "utf8")).toBe(text);
      }
      for (const code of CODES) {
        const text = readFileSync(join(copy, "apps/ui/legal", code, DRAFT[kind]), "utf8");
        expect(text, `${kind} ${code}`).toContain(`**Version 1.1 · Effective ${legalDayText(code, to, "line")} · `);
        expect(text, `${kind} ${code}`).not.toContain(legalDayText(code, current.day, "eyebrow"));
      }
    }
    expect(readFileSync(join(copy, "apps/ui/legal/en/privacy-policy.md"), "utf8")).toContain(`This policy was last updated on ${legalDayText("en", to, "line")}.`);
    expect(readFileSync(join(copy, "apps/ui/lib/privacyPolicy.ts"), "utf8")).toContain(legalDayText("en", to, "eyebrow"));
  });

  it("is the package script legal:redate", () => {
    const scripts = (JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
    expect(scripts["legal:redate"]).toBe("node apps/ui/scripts/legal-redate.mjs");
  });
});
