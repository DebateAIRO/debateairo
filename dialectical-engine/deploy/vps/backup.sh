#!/usr/bin/env bash
# deploy/vps/backup.sh — nightly encrypted backup of everything needed to restore DebateAI.
#
# Why more than pg_dump (audit L2-F3, L5-F8, L7 "C2/C3 validation"): every private run is
# AEAD-encrypted under a per-run content key wrapped by a per-user DEK wrapped by the file-held
# KEK. A database dump alone restores ciphertext that nothing can open. So this script captures,
# in ONE age envelope for the data recipient:
#   1. cluster globals   (pg_dumpall --globals-only — roles and their SCRAM verifiers; a
#                         --format=custom dump of one database contains neither)
#   2. the debateai database
#   3. the custody tree  (user-DEK store incl. runs/<run>/content-key.v1.json, the publication
#                         key store, the audit key store)
# in that order: DB first, then keys. A content key referenced by a row at dump time is present
# in the later key snapshot; a key erased between the two corresponds to a row that was already
# erased. The reverse order can produce a row whose key no longer exists.
#
# The four raw 32-byte secrets are NOT in that envelope. They go to a SECOND age recipient whose
# private key never touches this host (offline escrow held by V). The audit source-IP salt is a
# key, not metadata: bundling it with the dump would let whoever holds one backup re-identify
# every hashed source IP in it.
#
# Runs as root from debateai-backup.timer. Reaches PostgreSQL as the postgres OS user over the
# unix socket (peer auth, pg_hba line 1) — no DebateAI principal has read-all rights, and the
# manifest forbids minting one a superuser credential (L5-F8).

set -euo pipefail
umask 077

CONFIG="${DEBATEAI_BACKUP_CONFIG:-/etc/debateai/backup.conf}"
# shellcheck source=/dev/null
. "$CONFIG"

: "${BACKUP_DATA_RECIPIENT:?age recipient for dump+custody (public key, private key off-host)}"
: "${BACKUP_ESCROW_RECIPIENT:?age recipient for the raw secrets (private key NEVER on this host)}"
: "${BACKUP_DIR:?local staging and retention directory}"
: "${USER_DEK_STORE_PATH:?}"
: "${PUBLICATION_KEY_STORE_PATH:?}"
: "${AUDIT_KEY_STORE_PATH:?}"
: "${KEK_PATH:?}"
: "${CORPUS_KEK_PATH:?}"
: "${BLIND_INDEX_KEY_PATH:?}"
: "${AUDIT_SOURCE_IP_SALT_PATH:?}"

KEEP_DAILY=14
KEEP_WEEKLY=8

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DAY_OF_WEEK="$(date -u +%u)"
DAILY_DIR="$BACKUP_DIR/daily"
WEEKLY_DIR="$BACKUP_DIR/weekly"
ESCROW_DIR="$BACKUP_DIR/escrow"
mkdir -p "$DAILY_DIR" "$WEEKLY_DIR" "$ESCROW_DIR"
chmod 0700 "$BACKUP_DIR" "$DAILY_DIR" "$WEEKLY_DIR" "$ESCROW_DIR"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/debateai-backup.XXXXXXXX")"
cleanup() {
  # The staging tree holds plaintext dumps and copies of key files; it never outlives the run.
  rm -rf -- "$WORK"
}
trap cleanup EXIT INT TERM

# --- 1. cluster globals ------------------------------------------------------------------
# --no-role-passwords is deliberately NOT passed: the SCRAM verifiers are part of what a restore
# needs. That is precisely why this file only ever leaves the staging dir inside an age envelope.
sudo -u postgres pg_dumpall --globals-only > "$WORK/globals.sql"

# --- 2. the database ---------------------------------------------------------------------
sudo -u postgres pg_dump --format=custom --compress=9 debateai > "$WORK/debateai.dump"

# --- 3. the custody tree (AFTER the dump) -------------------------------------------------
# Each store is archived under its own basename, so the drill can find it without knowing the
# production paths. Distinct basenames are required; refuse rather than silently overwrite.
dek_name="$(basename "$USER_DEK_STORE_PATH")"
publication_name="$(basename "$PUBLICATION_KEY_STORE_PATH")"
audit_name="$(basename "$AUDIT_KEY_STORE_PATH")"
if [ "$dek_name" = "$publication_name" ] || [ "$dek_name" = "$audit_name" ] \
  || [ "$publication_name" = "$audit_name" ]; then
  echo "BACKUP_REFUSED custody store basenames must be distinct" >&2
  exit 1
fi
tar -cf "$WORK/custody.tar" -C "$(dirname "$USER_DEK_STORE_PATH")" "$dek_name"
tar -rf "$WORK/custody.tar" -C "$(dirname "$PUBLICATION_KEY_STORE_PATH")" "$publication_name"
tar -rf "$WORK/custody.tar" -C "$(dirname "$AUDIT_KEY_STORE_PATH")" "$audit_name"

# --- 4. one envelope to the data recipient ------------------------------------------------
ARTEFACT="$DAILY_DIR/debateai-$STAMP.tar.age"
tar -cf - -C "$WORK" globals.sql debateai.dump custody.tar \
  | age -r "$BACKUP_DATA_RECIPIENT" > "$ARTEFACT"
chmod 0600 "$ARTEFACT"

DIGEST="$(sha256sum "$ARTEFACT" | cut -d' ' -f1)"
BYTES="$(wc -c < "$ARTEFACT" | tr -d ' ')"
UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# --- 5. the four raw secrets, escrowed separately -----------------------------------------
# Written only when their contents changed: an escrow copy per night would multiply the number
# of envelopes an attacker could try against the offline key for no added recoverability.
tar -cf "$WORK/keys.tar" \
  -C "$(dirname "$KEK_PATH")" "$(basename "$KEK_PATH")" \
  -C "$(dirname "$CORPUS_KEK_PATH")" "$(basename "$CORPUS_KEK_PATH")" \
  -C "$(dirname "$BLIND_INDEX_KEY_PATH")" "$(basename "$BLIND_INDEX_KEY_PATH")" \
  -C "$(dirname "$AUDIT_SOURCE_IP_SALT_PATH")" "$(basename "$AUDIT_SOURCE_IP_SALT_PATH")"
KEY_DIGEST="$(sha256sum "$WORK/keys.tar" | cut -d' ' -f1)"
STATE="$ESCROW_DIR/.last-sha256"
PREVIOUS=""
if [ -f "$STATE" ]; then PREVIOUS="$(cat "$STATE")"; fi
if [ "$KEY_DIGEST" != "$PREVIOUS" ]; then
  ESCROW="$ESCROW_DIR/debateai-escrow-$STAMP.tar.age"
  age -r "$BACKUP_ESCROW_RECIPIENT" < "$WORK/keys.tar" > "$ESCROW"
  chmod 0600 "$ESCROW"
  printf '%s\n' "$KEY_DIGEST" > "$STATE"
  chmod 0600 "$STATE"
  printf 'BACKUP_ESCROW_WRITTEN %s %s\n' "$KEY_DIGEST" "$UTC"
fi

# --- 6. weekly promotion and retention ----------------------------------------------------
if [ "$DAY_OF_WEEK" = "7" ]; then
  cp -p "$ARTEFACT" "$WEEKLY_DIR/"
fi
prune() {
  local directory="$1" keep="$2" victim
  # shellcheck disable=SC2012
  ls -1t "$directory" 2>/dev/null | grep -E '\.tar\.age$' | tail -n "+$((keep + 1))" \
    | while IFS= read -r victim; do rm -f -- "$directory/$victim"; done
}
prune "$DAILY_DIR" "$KEEP_DAILY"
prune "$WEEKLY_DIR" "$KEEP_WEEKLY"

# --- 7. off-host copy ---------------------------------------------------------------------
# Encrypted at rest before it leaves the box, so the remote is untrusted by construction.
# Configure exactly one of BACKUP_RCLONE_REMOTE or BACKUP_SCP_TARGET in backup.conf.
if [ -n "${BACKUP_RCLONE_REMOTE:-}" ]; then
  rclone copy "$BACKUP_DIR" "$BACKUP_RCLONE_REMOTE" --checksum --transfers 2
elif [ -n "${BACKUP_SCP_TARGET:-}" ]; then
  scp -q -p -o BatchMode=yes -r "$BACKUP_DIR"/. "$BACKUP_SCP_TARGET"
else
  echo "BACKUP_WARNING no off-host destination configured" >&2
fi

printf 'BACKUP_OK %s %s %s\n' "$DIGEST" "$BYTES" "$UTC"
