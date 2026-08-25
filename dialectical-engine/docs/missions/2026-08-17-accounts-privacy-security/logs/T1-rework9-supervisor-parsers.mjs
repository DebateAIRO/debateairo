const PS_LINE = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d{1,2})\s+(\d{2}:\d{2}:\d{2})\s+(\d{4})\s+(.+)$/;
const ANSI_CSI = /\u001b\[[0-?]*[ -/]*[@-~]/g;

const fail = (code) => { throw new Error(code); };
const commandFor = (argv) => argv.join(" ");

export const stripAnsi = (value) => String(value).replace(ANSI_CSI, "");

export const parseVitestCounts = (rawOutput) => {
  const output = stripAnsi(rawOutput);
  const fileMatch = /Test Files\s+(\d+) passed \((\d+)\)/.exec(output);
  const testMatch = /Tests\s+(\d+) passed(?:\s+\|\s+(\d+) skipped)? \((\d+)\)/.exec(output);
  return Object.freeze({
    test_files_passed: fileMatch === null ? null : Number(fileMatch[1]),
    test_files_total: fileMatch === null ? null : Number(fileMatch[2]),
    tests_passed: testMatch === null ? null : Number(testMatch[1]),
    tests_skipped: testMatch === null ? null : Number(testMatch[2] ?? 0),
    tests_total: testMatch === null ? null : Number(testMatch[3])
  });
};

export const parseProcessSnapshot = (snapshot) => {
  if (typeof snapshot !== "string" || !snapshot.endsWith("\n")) {
    fail("PROCESS_SNAPSHOT_PARTIAL");
  }
  const lines = snapshot.split("\n").filter(Boolean);
  if (lines.length === 0) fail("PROCESS_SNAPSHOT_EMPTY");
  return Object.freeze(lines.map((line) => {
    const match = PS_LINE.exec(line);
    if (match === null) fail(`PROCESS_SNAPSHOT_PARSE_UNKNOWN:${line}`);
    return Object.freeze({
      line,
      pid: Number(match[1]),
      ppid: Number(match[2]),
      lstart: `${match[3]} ${match[4]} ${match[5]} ${match[6]} ${match[7]}`,
      command: match[8]
    });
  }));
};

export const classifyPostflightProcesses = ({
  snapshot, controller, ownedIdentityArgv, viewerIdentityArgv, receiptDir
}) => {
  if (!Number.isInteger(controller?.pid) || controller.pid <= 1
    || !Array.isArray(controller.argv) || controller.argv.length === 0
    || !Array.isArray(ownedIdentityArgv) || !Array.isArray(viewerIdentityArgv)
    || typeof receiptDir !== "string" || receiptDir.length === 0) {
    fail("PROCESS_CLASSIFIER_INPUT_INVALID");
  }
  const records = parseProcessSnapshot(snapshot);
  const controllerCommand = commandFor(controller.argv);
  const controllerRecord = records.find((record) => record.pid === controller.pid);
  if (controllerRecord === undefined || controllerRecord.command !== controllerCommand) {
    fail("CONTROLLER_PROCESS_IDENTITY_MISMATCH");
  }

  const ownedCommands = new Set([controllerCommand, ...ownedIdentityArgv.map(commandFor)]);
  const viewerCommands = new Set(viewerIdentityArgv.map(commandFor));
  const ownedPids = new Set(records
    .filter((record) => ownedCommands.has(record.command)).map((record) => record.pid));
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const record of records) {
      if (!ownedPids.has(record.pid) && ownedPids.has(record.ppid)) {
        ownedPids.add(record.pid);
        expanded = true;
      }
    }
  }

  const displayOnly = (record) => viewerCommands.has(record.command)
    || (record.command.includes("/usr/bin/tail") && record.command.includes(receiptDir));
  const displayOnlyLines = records.filter(displayOnly).map((record) => record.line);
  const exemptLines = [controllerRecord.line, ...displayOnlyLines];
  const runOwnedDescendantLines = records.filter((record) => ownedPids.has(record.pid)
    && record.pid !== controller.pid && !displayOnly(record)).map((record) => record.line);
  return Object.freeze({
    controller_line: controllerRecord.line,
    run_owned_descendant_lines: Object.freeze(runOwnedDescendantLines),
    display_only_lines: Object.freeze(displayOnlyLines),
    exempt_lines: Object.freeze(exemptLines)
  });
};
