import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const launchdLabel = "com.dialectical-engine.observation-agent";

export type CommandExecutor = (file: string, args: readonly string[]) => Promise<void>;

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function renderLaunchAgent(input: Readonly<{
  launchScript: string;
  stateDir: string;
}>): string {
  const script = escapeXml(input.launchScript);
  const state = escapeXml(input.stateDir);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${launchdLabel}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${script}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>${state}/stdout.log</string>
  <key>StandardErrorPath</key>
  <string>${state}/stderr.log</string>
</dict>
</plist>
`;
}

export function launchAgentPath(home: string): string {
  return join(home, "Library", "LaunchAgents", `${launchdLabel}.plist`);
}

export async function installLaunchAgent(input: Readonly<{
  home: string;
  uid: number;
  launchScript: string;
  stateDir: string;
  execute: CommandExecutor;
}>): Promise<string> {
  const path = launchAgentPath(input.home);
  await mkdir(join(input.home, "Library", "LaunchAgents"), { recursive: true });
  await mkdir(input.stateDir, { recursive: true, mode: 0o700 });
  await writeFile(path, renderLaunchAgent(input), { mode: 0o644 });
  await input.execute("/bin/launchctl", ["bootstrap", `gui/${input.uid}`, path]);
  return path;
}

export async function uninstallLaunchAgent(input: Readonly<{
  home: string;
  uid: number;
  execute: CommandExecutor;
}>): Promise<void> {
  const path = launchAgentPath(input.home);
  await input.execute("/bin/launchctl", ["bootout", `gui/${input.uid}`, path]);
  await rm(path, { force: true });
}

export async function startLaunchAgent(input: Readonly<{
  uid: number;
  execute: CommandExecutor;
  fallbackPlistPath?: string;
}>): Promise<void> {
  try {
    await input.execute("/bin/launchctl", [
      "kickstart", `gui/${input.uid}/${launchdLabel}`
    ]);
  } catch (error) {
    if (input.fallbackPlistPath === undefined) throw error;
    await input.execute("/bin/launchctl", [
      "bootstrap", `gui/${input.uid}`, input.fallbackPlistPath
    ]);
  }
}

export async function stopLaunchAgent(input: Readonly<{
  uid: number;
  execute: CommandExecutor;
}>): Promise<void> {
  await input.execute("/bin/launchctl", [
    "bootout", `gui/${input.uid}/${launchdLabel}`
  ]);
}

async function launchAgentPid(): Promise<number | null> {
  const output = await new Promise<string>((resolve, reject) => {
    execFile("/bin/launchctl", ["list", launchdLabel], { timeout: 2_000, encoding: "utf8" },
      (error, stdout) => error === null ? resolve(stdout) : reject(error));
  });
  const match = /"PID"\s*=\s*([0-9]+)/u.exec(output);
  return match === null ? null : Number(match[1]);
}

function signalProcess(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function killLaunchAgent(input: Readonly<{
  uid: number;
  execute: CommandExecutor;
  findPid?: () => Promise<number | null>;
  signal?: (pid: number, signal: NodeJS.Signals) => void;
  wait?: (milliseconds: number) => Promise<void>;
  isAlive?: (pid: number) => boolean;
}>): Promise<void> {
  const pid = await (input.findPid ?? launchAgentPid)();
  await stopLaunchAgent(input);
  if (pid === null) return;
  (input.signal ?? signalProcess)(pid, "SIGTERM");
  await (input.wait ?? (async (milliseconds) => {
    await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
  }))(5_000);
  if ((input.isAlive ?? processIsAlive)(pid)) {
    (input.signal ?? signalProcess)(pid, "SIGKILL");
  }
}

export async function renderLaunchAgentFromTemplate(input: Readonly<{
  templatePath: string;
  launchScript: string;
  stateDir: string;
}>): Promise<string> {
  return (await readFile(input.templatePath, "utf8"))
    .replaceAll("__OBSERVATION_LAUNCH_SCRIPT__", escapeXml(input.launchScript))
    .replaceAll("__OBSERVATION_STATE_DIR__", escapeXml(input.stateDir));
}
