const INVALID = "GUIDE_CAPTURE_PROCESS_IDENTITY_INVALID";

export function assertOwnedProcessRow(text, expected) {
  const rows = String(text).split(/\r?\n/u).map(row => row.trim()).filter(Boolean);
  if (rows.length !== 1) throw new Error(INVALID);
  const match = /^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/u.exec(rows[0]);
  if (!match) throw new Error(INVALID);
  const pid = Number(match[1]);
  const ppid = Number(match[2]);
  const pgid = Number(match[3]);
  const command = match[4];
  if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(ppid) || !Number.isSafeInteger(pgid)
    || pid !== expected.pid || pgid !== expected.pgid || ppid !== 1
    || typeof expected.commandMarker !== "string" || expected.commandMarker.length === 0
    || !command.includes(expected.commandMarker)) {
    throw new Error(INVALID);
  }
  return { pid,ppid,pgid,commandMarker:expected.commandMarker };
}
