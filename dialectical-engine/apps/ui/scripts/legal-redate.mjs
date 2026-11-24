#!/usr/bin/env node
/**
 * Sets the day the current Terms of Service and Privacy Policy take effect, in one command, from dialectical-engine/:
 *
 *   pnpm run legal:redate --date YYYY-MM-DD            sets the day, regenerates, archives, runs the release check
 *   pnpm run legal:redate --date YYYY-MM-DD --dry-run  prints every line it would change and writes nothing
 *
 * The effective day is the upload day. A day before the upload would read as a change made retroactive, which the
 * Terms promise never to do. The upload day is known only once the upload is fixed, so the drafts carry a working day
 * until then and this command puts the real one everywhere the repository's rules need it:
 *   - every draft, in every language, of each document whose current version was not released: the day in the eyebrow
 *     and in the version line, in that language's words (`legalDayText`). A document whose current version was released
 *     keeps its day, so one document can take a new version while the other stays as it is;
 *   - English, and each translation recorded as following the current English text (apps/ui/legal/translated-from.json):
 *     the same day wherever else the text gives it (the Privacy Policy's "last updated" sentence). A translation that
 *     follows an older English text keeps its body as it is;
 *   - the archive copies of the current version, made before the release with the working day: removed with their
 *     manifest entries, then made again from the re-dated texts. A copy of an older version is never touched;
 *   - generate-legal-data.mjs: the modules and the manifest, the record of each translation that followed the English
 *     text before (`--translated`), then the archive (`--archive`);
 *   - last, legal-release-check.mjs, whose exit code this command returns.
 * Before writing anything it refuses:
 *   - a day that is not YYYY-MM-DD, a day before today (Romanian time), or a day that is not after the day the
 *     document's previous version took effect (read from that version's archived English text);
 *   - a day that would re-date only released current versions: a version is released when its archive copy is in the
 *     commit of the release the site runs, which tests/n1-baseline.json names. A released text is kept as it was, so a
 *     change to it needs a new version number. That file is the only record of the live release in the repository, and
 *     it lags: it names a new release only once the pull request after that upload is merged. Until then this command
 *     does not see the new release, so a version an upload has just carried must not be re-dated after that upload;
 *   - any change while a translation of either document, in a language the release offers (RELEASE_LEGAL_LOCALES),
 *     follows an older English text: the archive step would keep that untranslated text under the current number for
 *     good, so the translation is made and recorded first;
 *   - a draft whose eyebrow or version line does not carry the current day in the words this command would write.
 * The tests read each document's day from its English version line (tests/support/legalText.ts), so they need no edit
 * when the day changes.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LOCALES } from "../lib/i18n/locales.ts";
import {
  LEGAL_MANIFEST_OUTPUT,
  LEGAL_TRANSLATIONS_PATH,
  legalDraftSha256,
  RELEASE_LEGAL_LOCALES,
  renderLegalManifest
} from "./generate-legal-data.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SCRIPTS = dirname(fileURLToPath(import.meta.url));

export const LEGAL_REDATE_DOCUMENTS = Object.freeze([
  Object.freeze({ kind: "PRIVACY", key: "privacy", name: "Privacy Policy", draft: "privacy-policy.md" }),
  Object.freeze({ kind: "TERMS", key: "terms", name: "Terms of Service", draft: "terms-of-service.md" })
]);

const ENGLISH_MONTHS = Object.freeze(["January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December"]);
/**
 * Month names where a draft uses another grammatical case than Intl's long month: Slovenian's genitive (version line
 * and eyebrow), Estonian's elative and Latvian's genitive after "from" in the eyebrow. January first.
 */
const SLOVENIAN_GENITIVE = Object.freeze(["januarja", "februarja", "marca", "aprila", "maja", "junija", "julija",
  "avgusta", "septembra", "oktobra", "novembra", "decembra"]);
const ESTONIAN_ELATIVE = Object.freeze(["jaanuarist", "veebruarist", "märtsist", "aprillist", "maist", "juunist",
  "juulist", "augustist", "septembrist", "oktoobrist", "novembrist", "detsembrist"]);
const LATVIAN_GENITIVE = Object.freeze(["janvāra", "februāra", "marta", "aprīļa", "maija", "jūnija", "jūlija",
  "augusta", "septembra", "oktobra", "novembra", "decembra"]);

const VERSION_LINE = /^\*\*Version (\d+\.\d+) · Effective (.+?) · /u;

function refused(sentence) {
  return new Error(`LEGAL_REDATE_REFUSED: ${sentence}`);
}

/** A calendar day `YYYY-MM-DD` as `{ year, month, day }`; anything else is refused. */
export function parseLegalDay(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(typeof text === "string" ? text : "");
  const day = match === null ? null : { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const date = day === null ? null : new Date(Date.UTC(day.year, day.month - 1, day.day));
  if (day === null || date.getUTCFullYear() !== day.year || date.getUTCMonth() !== day.month - 1 || date.getUTCDate() !== day.day) {
    throw refused(`${JSON.stringify(text ?? "")} is not a calendar day written YYYY-MM-DD`);
  }
  return Object.freeze(day);
}

export function legalDayIso({ year, month, day }) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const order = ({ year, month, day }) => year * 10_000 + month * 100 + day;

/** The day in the words `code`'s drafts use: `line` for the version line and the text, `eyebrow` for the eyebrow. */
export function legalDayText(code, { year, month, day }, form) {
  let text;
  if (code === "en") text = `${day} ${ENGLISH_MONTHS[month - 1]} ${year}`;
  else if (code === "zh") text = `${year} 年 ${month} 月 ${day} 日`;
  else if (code === "vi") text = `${day} tháng ${month} năm ${year}`;
  else if (code === "sl") text = `${day}. ${SLOVENIAN_GENITIVE[month - 1]} ${year}`;
  else if (code === "et" && form === "eyebrow") text = `${day}. ${ESTONIAN_ELATIVE[month - 1]} ${year}`;
  else if (code === "lv" && form === "eyebrow") text = `${year}. gada ${day}. ${LATVIAN_GENITIVE[month - 1]}`;
  else {
    text = new Intl.DateTimeFormat(`${code}-u-nu-latn`, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
      .format(new Date(Date.UTC(year, month - 1, day)));
  }
  return form === "eyebrow" ? text.toLocaleUpperCase(code) : text;
}

/** The version and the effective day an English draft's version line gives (`**Version N.M · Effective <day> <Month> <year> · …`). */
export function englishVersionAndDay(markdown) {
  const line = markdown.split("\n").find((candidate) => candidate.startsWith("**Version "));
  const match = line === undefined ? null : VERSION_LINE.exec(line);
  const words = match === null ? null : /^(\d{1,2}) ([A-Z][a-z]+) (\d{4})$/u.exec(match[2]);
  const month = words === null ? 0 : ENGLISH_MONTHS.indexOf(words[2]) + 1;
  if (match === null || words === null || month === 0) throw refused("the English version line gives no version and day in the form `Version N.M · Effective <day> <Month> <year>`");
  return Object.freeze({ version: match[1], day: Object.freeze({ year: Number(words[3]), month, day: Number(words[1]) }) });
}

/** Today in Romania (the site's and the release guide's day), as `{ year, month, day }`. */
export function romanianToday(now = new Date()) {
  return parseLegalDay(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit" }).format(now));
}

function countOf(text, part) {
  return text.split(part).length - 1;
}

/**
 * One draft with its day changed from `from` to `to`, or a refusal naming the draft. The eyebrow and the version line
 * must each carry `from` once, in this command's words; with `wholeText` (English, and a translation that follows the
 * current English text) every other place that gives `from` changes too.
 */
function redateDraft(path, code, markdown, from, to, wholeText) {
  const lines = markdown.split("\n");
  const eyebrowAt = lines.findIndex((line) => line.startsWith("eyebrow: "));
  const versionAt = lines.findIndex((line) => line.startsWith("**Version "));
  const oldEyebrow = legalDayText(code, from, "eyebrow");
  const oldLine = legalDayText(code, from, "line");
  if (eyebrowAt === -1 || countOf(lines[eyebrowAt], oldEyebrow) !== 1) {
    throw refused(`${path}: its eyebrow does not give ${JSON.stringify(oldEyebrow)} once; set it by hand to match the version line, then run this again`);
  }
  if (versionAt === -1 || VERSION_LINE.exec(lines[versionAt])?.[2] !== oldLine) {
    throw refused(`${path}: its version line does not say "Effective ${oldLine}"; set it by hand to match the English text, then run this again`);
  }
  const changed = [...lines];
  changed[eyebrowAt] = lines[eyebrowAt].replace(oldEyebrow, legalDayText(code, to, "eyebrow"));
  changed[versionAt] = lines[versionAt].replace(`Effective ${oldLine} · `, `Effective ${legalDayText(code, to, "line")} · `);
  if (wholeText) {
    for (let index = 0; index < changed.length; index += 1) {
      if (index !== eyebrowAt && index !== versionAt) changed[index] = changed[index].replaceAll(oldLine, legalDayText(code, to, "line"));
    }
  }
  const lineChanges = changed.flatMap((line, index) => (line === lines[index] ? [] : [Object.freeze({ before: lines[index], after: line })]));
  return Object.freeze({ path, after: changed.join("\n"), lines: Object.freeze(lineChanges) });
}

/**
 * What re-dating the current texts to `to` changes, computed before anything is written; throws a LEGAL_REDATE_REFUSED
 * sentence instead when the day or the repository does not allow it.
 *   - `readDraft(code, kind)`: a draft as it is now; `manifest`: the committed manifest (its `archive` is the index);
 *     `translations`: the record of translations; `readArchived(path)`: an archived text;
 *   - `isReleased(path)`: whether that archive copy is in the release the site runs (throws when that cannot be told);
 *   - `today`: Romania's day; `locales`: every language when left out.
 * Returns the days before, the documents kept because their current version was released, each draft that changes
 * (its new text and changed lines), the archive copies of the current version to remove, and per document the
 * translations to record again from the re-dated English text.
 */
export function planLegalRedate({ to, today, readDraft, manifest, translations, readArchived, isReleased, locales = LOCALES.map(({ code }) => code) }) {
  if (order(to) < order(today)) {
    throw refused(`${legalDayIso(to)} is before today (${legalDayIso(today)}, Romanian time): a text dated before it is posted reads as retroactive`);
  }
  const codes = [...new Set(["en", ...locales])].sort();
  const drafts = [];
  const archiveRemovals = [];
  const retranslate = {};
  const from = {};
  const kept = [];
  const lagging = [];
  for (const { kind, name, draft } of LEGAL_REDATE_DOCUMENTS) {
    const englishText = readDraft("en", kind);
    const current = englishVersionAndDay(englishText);
    from[kind] = current.day;
    const behind = RELEASE_LEGAL_LOCALES.filter((code) => code !== "en" && translations[kind]?.[code]?.sha256 !== legalDraftSha256(englishText));
    if (behind.length > 0) lagging.push(Object.freeze({ name, version: current.version, codes: behind }));
    const copies = Object.entries(manifest.archive?.[kind] ?? {}).flatMap(([code, entries]) => Object.entries(entries)
      .filter(([, entry]) => entry.version === current.version)
      .map(([sha256, entry]) => Object.freeze({ kind, code, sha256, path: entry.path })));
    // A released text keeps its day: the document is left as it is, and only the other one is re-dated.
    const released = order(to) === order(current.day) ? undefined : copies.find((copy) => isReleased(copy.path));
    if (released !== undefined) {
      kept.push(Object.freeze({ kind, name, version: current.version, path: released.path }));
      retranslate[kind] = Object.freeze([]);
      continue;
    }
    const englishEntries = Object.entries(manifest.archive?.[kind]?.en ?? {});
    for (const [, entry] of englishEntries.filter(([, entry]) => entry.version !== current.version)) {
      const before = englishVersionAndDay(readArchived(entry.path));
      if (order(to) <= order(before.day)) {
        throw refused(`${legalDayIso(to)} is not after ${legalDayText("en", before.day, "line")}, the day the ${name} ${before.version} took effect`);
      }
    }
    if (order(to) === order(current.day)) {
      retranslate[kind] = Object.freeze([]);
      continue;
    }
    const englishSha256 = legalDraftSha256(englishText);
    archiveRemovals.push(...copies);
    const following = codes.filter((code) => code !== "en" && translations[kind]?.[code]?.sha256 === englishSha256);
    retranslate[kind] = Object.freeze(following);
    for (const code of codes) {
      const path = `apps/ui/legal/${code}/${draft}`;
      drafts.push(redateDraft(path, code, code === "en" ? englishText : readDraft(code, kind), current.day, to, code === "en" || following.includes(code)));
    }
  }
  if (kept.length === LEGAL_REDATE_DOCUMENTS.length) {
    const [{ name, version, path }] = kept;
    throw refused(`the ${name} ${version} (${path}) is in the release the site runs (tests/n1-baseline.json): a released text keeps its day, so a change to it needs a new version number`);
  }
  // The archive step that follows a change copies the current text of every language the release offers, of both
  // documents, and keeps it for good: a translation that lags would stay there under the current number.
  if (drafts.length > 0 && lagging.length > 0) {
    const [{ name, version, codes: behind }] = lagging;
    throw refused(`the ${name} in ${behind.join(", ")} follows an older English text: translate it and record it (generate-legal-data.mjs --translated) first, or the archive would keep the untranslated text as version ${version}`);
  }
  return Object.freeze({
    to,
    from: Object.freeze(from),
    kept: Object.freeze(kept),
    drafts: Object.freeze(drafts),
    archiveRemovals: Object.freeze(archiveRemovals),
    retranslate: Object.freeze(retranslate)
  });
}

/**
 * `isReleased` for `planLegalRedate`, by git: an archive copy is released when it is in the commit tests/n1-baseline.json
 * names (the release the site runs). A clone without that commit cannot tell, so it refuses. The file names a new release
 * only once the pull request after its upload is merged, so between the two this answers for the release before.
 */
export function releasedByLiveRelease(root) {
  const commit = JSON.parse(readFileSync(resolve(root, "tests/n1-baseline.json"), "utf8")).commit;
  if (typeof commit !== "string" || !/^[0-9a-f]{40}$/u.test(commit)) throw refused("tests/n1-baseline.json names no commit");
  const git = (...args) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const top = git("rev-parse", "--show-toplevel");
  if (top.status !== 0) throw refused(`${root} is not in a git clone, so the release the site runs cannot be read`);
  if (git("cat-file", "-e", `${commit}^{commit}`).status !== 0) {
    throw refused(`the commit of the release the site runs (${commit.slice(0, 12)}, tests/n1-baseline.json) is not in this clone: fetch it first`);
  }
  const prefix = relative(top.stdout.trim(), root).split(sep).join(posix.sep);
  return (path) => git("cat-file", "-e", `${commit}:${prefix === "" ? path : `${prefix}/${path}`}`).status === 0;
}

function parseArguments(argv) {
  let date;
  let dryRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--dry-run") dryRun = true;
    else if (argv[index] === "--date" && argv[index + 1] !== undefined) {
      date = argv[index + 1];
      index += 1;
    } else if (argv[index] !== "--") throw refused(`unknown argument ${JSON.stringify(argv[index])}; use --date YYYY-MM-DD [--dry-run]`);
  }
  if (date === undefined) throw refused("give the day the texts take effect: --date YYYY-MM-DD");
  return { to: parseLegalDay(date), dryRun };
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, path), "utf8"));
}

/** Runs one of the legal scripts beside this one from the repository root; returns its exit status. */
function run(script, args) {
  process.stdout.write(`\n$ node apps/ui/scripts/${script} ${args.join(" ")}\n`);
  return spawnSync(process.execPath, [resolve(SCRIPTS, script), ...args], { cwd: REPO_ROOT, stdio: "inherit" }).status ?? 1;
}

export function main(argv, now = new Date()) {
  let plan;
  let dryRun;
  try {
    const options = parseArguments(argv);
    dryRun = options.dryRun;
    const manifest = readJson(LEGAL_MANIFEST_OUTPUT);
    plan = planLegalRedate({
      to: options.to,
      today: romanianToday(now),
      readDraft: (code, kind) => readFileSync(resolve(REPO_ROOT, "apps/ui/legal", code, kind === "TERMS" ? "terms-of-service.md" : "privacy-policy.md"), "utf8"),
      manifest,
      translations: readJson(LEGAL_TRANSLATIONS_PATH),
      readArchived: (path) => readFileSync(resolve(REPO_ROOT, path), "utf8"),
      isReleased: releasedByLiveRelease(REPO_ROOT)
    });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  const day = legalDayText("en", plan.to, "line");
  const keptKinds = new Set(plan.kept.map(({ kind }) => kind));
  for (const { kind, name } of LEGAL_REDATE_DOCUMENTS) {
    const before = legalDayText("en", plan.from[kind], "line");
    process.stdout.write(keptKinds.has(kind)
      ? `${name}: released, keeps ${before}\n`
      : `${name}: from ${before} to ${day}; translations recorded again: ${plan.retranslate[kind].join(", ") || "none"}\n`);
  }
  for (const draft of plan.drafts) {
    process.stdout.write(`${draft.path}\n${draft.lines.map((line) => `  - ${line.before}\n  + ${line.after}\n`).join("")}`);
  }
  for (const removal of plan.archiveRemovals) process.stdout.write(`${removal.path}: removed, made again by --archive\n`);
  if (dryRun) {
    process.stdout.write(`dry run: ${plan.drafts.length} draft(s) would change; nothing was written\n`);
    return 0;
  }
  if (plan.drafts.length > 0) {
    for (const draft of plan.drafts) writeFileSync(resolve(REPO_ROOT, draft.path), draft.after);
    const manifest = readJson(LEGAL_MANIFEST_OUTPUT);
    for (const removal of plan.archiveRemovals) {
      delete manifest.archive[removal.kind][removal.code][removal.sha256];
      unlinkSync(resolve(REPO_ROOT, removal.path));
    }
    writeFileSync(resolve(REPO_ROOT, LEGAL_MANIFEST_OUTPUT), renderLegalManifest(manifest));
    const steps = [["generate-legal-data.mjs", []]];
    for (const { kind, key } of LEGAL_REDATE_DOCUMENTS) {
      const codes = plan.retranslate[kind];
      if (codes.length > 0) steps.push(["generate-legal-data.mjs", ["--translated", "--document", key, ...codes.flatMap((code) => ["--locale", code])]]);
    }
    steps.push(["generate-legal-data.mjs", ["--archive"]]);
    for (const [script, args] of steps) {
      if (run(script, args) !== 0) {
        process.stderr.write(`LEGAL_REDATE_NOT_DONE: node apps/ui/scripts/${script} ${args.join(" ")} failed (above); the drafts already say ${day}: fix the cause, then run that step and the ones after it by hand\n`);
        return 1;
      }
    }
  } else {
    process.stdout.write(`no text to re-date to ${day}: nothing to change\n`);
  }
  const status = run("legal-release-check.mjs", []);
  if (status !== 0) {
    process.stderr.write("LEGAL_REDATE_NOT_DONE: the release check refused (above)\n");
    return status;
  }
  const dated = LEGAL_REDATE_DOCUMENTS.filter(({ kind }) => !keptKinds.has(kind)).map(({ name }) => `the ${name}`);
  process.stdout.write(`LEGAL_REDATE_DONE: ${dated.join(" and ")} take${dated.length === 1 ? "s" : ""} effect on ${day}; commit what changed\n`);
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
