import { readFile, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative } from "node:path";
import { expect } from "vitest";

/**
 * D8 lean calls (Task A12b): what every relay suite checks about WHERE its CLI
 * ran. Test support only — no relay imports this file.
 *
 * `leanCwdReportSnippet(logPath)` is CommonJS for a `node -e` probe. Each time
 * the probe runs — the relay's handshake included — it appends its working
 * directory's PARENT (the relay's workspace) to `logPath`, one line per call,
 * and leaves `leanCwdReport` (its cwd, that directory's mode and its entries)
 * for the probe to print inside its maker's own output shape.
 */
export function leanCwdReportSnippet(logPath: string): string {
  return [
    'const { appendFileSync: leanAppend, readdirSync: leanReaddir, statSync: leanStat } = require("node:fs");',
    'const { dirname: leanDirname } = require("node:path");',
    `leanAppend(${JSON.stringify(logPath)}, leanDirname(process.cwd()) + "\\n");`,
    "const leanCwdReport = {",
    "  cwd: process.cwd(),",
    "  cwdMode: (leanStat(process.cwd()).mode & 0o777).toString(8),",
    "  cwdEntries: leanReaddir(process.cwd())",
    "};"
  ].join("\n");
}

export interface LeanCwdReport {
  readonly cwd: string;
  readonly cwdMode: string;
  readonly cwdEntries: readonly string[];
}

/** The workspaces the probe logged, one per call, in call order. */
export async function loggedWorkspaces(logPath: string): Promise<readonly string[]> {
  return (await readFile(logPath, "utf8")).split("\n").filter((line) => line !== "");
}

/**
 * The served call worked in an EMPTY 0700 directory outside this project,
 * inside the relay's own 0700 workspace (`relay-<maker>-workspace-…`), and the
 * relay's one handshake ran in that SAME workspace — so it was opened at start.
 * Returns the workspace, so the caller can prove that stopping the relay removes it.
 */
export async function expectLeanWorkingDirectory(
  report: LeanCwdReport,
  makerSlug: string,
  logPath: string
): Promise<string> {
  const fromProject = relative(process.cwd(), report.cwd);
  expect(isAbsolute(report.cwd)).toBe(true);
  expect(report.cwd).not.toBe(process.cwd());
  expect(fromProject.startsWith("..") || isAbsolute(fromProject)).toBe(true);
  expect(report.cwdEntries).toEqual([]);
  expect(report.cwdMode).toBe("700");
  expect(basename(report.cwd).startsWith(`relay-${makerSlug}-`)).toBe(true);
  const workspace = dirname(report.cwd);
  expect(basename(workspace).startsWith(`relay-${makerSlug}-workspace-`)).toBe(true);
  expect(((await stat(workspace)).mode & 0o777).toString(8)).toBe("700");
  expect(await loggedWorkspaces(logPath)).toEqual([workspace, workspace]);
  return workspace;
}
