import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, constants, existsSync, fsyncSync, lstatSync, openSync,
  readFileSync, readdirSync, renameSync, writeFileSync
} from "node:fs";
import { dirname, join } from "node:path";

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export const shaFile = (path) => sha256(readFileSync(path));

const immutableFile = (path) => {
  const stats = lstatSync(path);
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error(`NOT_REGULAR_FILE:${path}`);
  return stats;
};

const immutableDirectory = (path) => {
  const stats = lstatSync(path);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error(`NOT_DIRECTORY:${path}`);
  return stats;
};

const statRecord = (stats) => Object.freeze({
  device: stats.dev,
  inode: stats.ino,
  mode: stats.mode & 0o777,
  uid: stats.uid,
  gid: stats.gid,
  size: stats.size,
  mtime_ms: stats.mtimeMs
});

const sameScalar = (actual, expected, name) => {
  if (actual !== expected) throw new Error(`CUSTODY_MISMATCH:${name}`);
};

const readJson = (path) => {
  const stats = immutableFile(path);
  const bytes = readFileSync(path);
  return Object.freeze({ bytes, value: JSON.parse(bytes.toString("utf8")), stats });
};

export const writeImmutableJson = (path, value) => {
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  const fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o400);
  try {
    writeFileSync(fd, bytes);
    fsyncSync(fd);
    chmodSync(path, 0o400);
  } finally {
    closeSync(fd);
  }
  const directoryFd = openSync(dirname(path), constants.O_RDONLY);
  try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
  return Object.freeze({ path, sha256: sha256(bytes), size: Buffer.byteLength(bytes) });
};

export const snapshotLock = (lockPath) => {
  const directoryStats = immutableDirectory(lockPath);
  const entries = readdirSync(lockPath).sort();
  if (entries.length !== 1 || entries[0] !== "claim.json") {
    throw new Error(`LOCK_CONTENTS_UNEXPECTED:${entries.join(",")}`);
  }
  const claimPath = join(lockPath, "claim.json");
  const claim = readJson(claimPath);
  const snapshot = {
    directory: statRecord(directoryStats),
    claim: { ...statRecord(claim.stats), sha256: sha256(claim.bytes) },
    claim_value: claim.value
  };
  snapshot.tree_sha256 = sha256(JSON.stringify({
    directory: snapshot.directory,
    claim: snapshot.claim,
    claim_value: snapshot.claim_value
  }));
  return Object.freeze(snapshot);
};

export const inspectNeverStartedFilesystem = ({
  receiptDir, lockPath, archivePath, runId, expectedOwnerSha256, expectedClaimSha256,
  expectedTokenSha256, expectedLockDevice, expectedLockInode, expectedClaimInode,
  absentNames, zeroStreamNames
}) => {
  immutableDirectory(receiptDir);
  if (existsSync(archivePath)) throw new Error("ARCHIVED_LOCK_ALREADY_EXISTS");
  const ownerPath = join(receiptDir, "owner.json");
  const ownerDocument = readJson(ownerPath);
  const ownerSha256 = sha256(ownerDocument.bytes);
  sameScalar(ownerSha256, expectedOwnerSha256, "owner.sha256");
  sameScalar(ownerDocument.value.run_id, runId, "owner.run_id");
  sameScalar(ownerDocument.value.ownership_token_sha256, expectedTokenSha256,
    "owner.ownership_token_sha256");
  sameScalar(ownerDocument.value.lock?.path, lockPath, "owner.lock.path");
  sameScalar(ownerDocument.value.lock?.device, expectedLockDevice, "owner.lock.device");
  sameScalar(ownerDocument.value.lock?.inode, expectedLockInode, "owner.lock.inode");

  const lock = snapshotLock(lockPath);
  sameScalar(lock.directory.device, expectedLockDevice, "lock.device");
  sameScalar(lock.directory.inode, expectedLockInode, "lock.inode");
  if (expectedClaimInode !== undefined) {
    sameScalar(lock.claim.inode, expectedClaimInode, "claim.inode");
  }
  sameScalar(lock.claim.sha256, expectedClaimSha256, "claim.sha256");
  sameScalar(lock.claim_value.run_id, runId, "claim.run_id");
  sameScalar(lock.claim_value.ownership_token_sha256, expectedTokenSha256,
    "claim.ownership_token_sha256");
  sameScalar(lock.claim_value.owner_sha256, expectedOwnerSha256, "claim.owner_sha256");
  sameScalar(lock.claim_value.lock_device, expectedLockDevice, "claim.lock_device");
  sameScalar(lock.claim_value.lock_inode, expectedLockInode, "claim.lock_inode");

  const receiptEntries = readdirSync(receiptDir);
  for (const name of absentNames) {
    const present = name.endsWith("-")
      ? receiptEntries.some((entry) => entry.startsWith(name))
      : existsSync(join(receiptDir, name));
    if (present) throw new Error(`NEVER_STARTED_ARTIFACT_PRESENT:${name}`);
  }
  const streams = {};
  for (const name of zeroStreamNames) {
    const streamPath = join(receiptDir, name);
    const stats = immutableFile(streamPath);
    if (stats.size !== 0) throw new Error(`NONEMPTY_NEVER_STARTED_STREAM:${name}`);
    streams[name] = statRecord(stats);
  }
  return Object.freeze({
    run_id: runId,
    receipt_directory: statRecord(immutableDirectory(receiptDir)),
    owner: { sha256: ownerSha256, ...statRecord(ownerDocument.stats) },
    lock,
    absent: [...absentNames],
    zero_streams: streams
  });
};

export const archiveLockPreservingInodes = ({ lockPath, archivePath, expected }) => {
  if (!existsSync(lockPath)) throw new Error("LIVE_LOCK_ABSENT");
  if (existsSync(archivePath)) throw new Error("ARCHIVED_LOCK_ALREADY_EXISTS");
  const before = snapshotLock(lockPath);
  sameScalar(before.tree_sha256, expected.tree_sha256, "pre_archive.tree_sha256");
  sameScalar(before.directory.device, expected.directory.device, "pre_archive.directory.device");
  sameScalar(before.directory.inode, expected.directory.inode, "pre_archive.directory.inode");
  sameScalar(before.claim.device, expected.claim.device, "pre_archive.claim.device");
  sameScalar(before.claim.inode, expected.claim.inode, "pre_archive.claim.inode");
  sameScalar(before.claim.sha256, expected.claim.sha256, "pre_archive.claim.sha256");

  renameSync(lockPath, archivePath);
  const directoryFd = openSync(dirname(archivePath), constants.O_RDONLY);
  try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }

  if (existsSync(lockPath)) throw new Error("LIVE_LOCK_REMAINS_AFTER_ARCHIVE");
  const after = snapshotLock(archivePath);
  sameScalar(after.tree_sha256, before.tree_sha256, "archived.tree_sha256");
  sameScalar(after.directory.device, before.directory.device, "archived.directory.device");
  sameScalar(after.directory.inode, before.directory.inode, "archived.directory.inode");
  sameScalar(after.claim.device, before.claim.device, "archived.claim.device");
  sameScalar(after.claim.inode, before.claim.inode, "archived.claim.inode");
  sameScalar(after.claim.sha256, before.claim.sha256, "archived.claim.sha256");
  return after;
};
