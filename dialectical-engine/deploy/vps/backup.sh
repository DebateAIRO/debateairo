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
# The six raw 32-byte secrets are NOT in that envelope. They go to a SECOND age recipient whose
# private key never touches this host (offline escrow held by V). The audit source-IP salt is a
# key, not metadata: bundling it with the dump would let whoever holds one backup re-identify
# every hashed source IP in it. The fifth, the support KEK (DL2-F5), wraps the support session
# and case keys that live IN the dump: without it in escrow a restore opens no support
# conversation at all, and beside the dump it would open every one. The records key is the sixth
# (paid plans ruling Q-12); it seals the acceptance and billing evidence kept after an account is
# erased, so it never rides with the dump.
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
: "${SUPPORT_KEK_PATH:?}"
: "${RECORDS_KEY_PATH:?}"

# Exactly one off-host destination, checked before any work. A copy that stays on this host is
# not a backup: the VPS is the thing a backup must survive. Neither set, or both set, is refused
# with a nonzero exit, so the unit fails instead of printing a receipt for a local-only copy.
if [ -n "${BACKUP_RCLONE_REMOTE:-}" ] && [ -n "${BACKUP_SCP_TARGET:-}" ]; then
  echo "BACKUP_REFUSED both BACKUP_RCLONE_REMOTE and BACKUP_SCP_TARGET are set; configure exactly one" >&2
  exit 1
fi
if [ -z "${BACKUP_RCLONE_REMOTE:-}" ] && [ -z "${BACKUP_SCP_TARGET:-}" ]; then
  echo "BACKUP_REFUSED no off-host destination: set BACKUP_RCLONE_REMOTE or BACKUP_SCP_TARGET" >&2
  exit 1
fi

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

# --- 5. the six raw secrets, escrowed separately ------------------------------------------
# Written only when their contents changed: an escrow copy per night would multiply the number
# of envelopes an attacker could try against the offline key for no added recoverability. A
# master-key rotation (README §3) changes the digest, so the next night escrows the new keys.
# Each secret is archived under its own basename; refuse rather than let one shadow another.
secret_names="$(printf '%s\n' "$KEK_PATH" "$CORPUS_KEK_PATH" "$BLIND_INDEX_KEY_PATH" \
  "$AUDIT_SOURCE_IP_SALT_PATH" "$SUPPORT_KEK_PATH" "$RECORDS_KEY_PATH" | xargs -n 1 basename | sort)"
if [ "$(printf '%s\n' "$secret_names" | uniq | wc -l | tr -d ' ')" != "6" ]; then
  echo "BACKUP_REFUSED escrowed secret basenames must be distinct" >&2
  exit 1
fi
tar -cf "$WORK/keys.tar" \
  -C "$(dirname "$KEK_PATH")" "$(basename "$KEK_PATH")" \
  -C "$(dirname "$CORPUS_KEK_PATH")" "$(basename "$CORPUS_KEK_PATH")" \
  -C "$(dirname "$BLIND_INDEX_KEY_PATH")" "$(basename "$BLIND_INDEX_KEY_PATH")" \
  -C "$(dirname "$AUDIT_SOURCE_IP_SALT_PATH")" "$(basename "$AUDIT_SOURCE_IP_SALT_PATH")" \
  -C "$(dirname "$SUPPORT_KEK_PATH")" "$(basename "$SUPPORT_KEK_PATH")" \
  -C "$(dirname "$RECORDS_KEY_PATH")" "$(basename "$RECORDS_KEY_PATH")"
KEY_DIGEST="$(sha256sum "$WORK/keys.tar" | cut -d' ' -f1)"
STATE="$ESCROW_DIR/.last-sha256"
PREVIOUS=""
if [ -f "$STATE" ]; then PREVIOUS="$(cat "$STATE")"; fi
# Paths relative to BACKUP_DIR that this run must find off-host before it prints its receipt.
VERIFY=("daily/debateai-$STAMP.tar.age")
if [ "$KEY_DIGEST" != "$PREVIOUS" ]; then
  ESCROW="$ESCROW_DIR/debateai-escrow-$STAMP.tar.age"
  VERIFY+=("escrow/debateai-escrow-$STAMP.tar.age")
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
  # grep exits 1 when nothing matches — an empty directory, e.g. weekly/ before its first Sunday —
  # and under pipefail that would end the run before the off-host copy. Exit 1 is therefore
  # success here; any other failure (ls, grep exit 2, rm) still fails the run.
  # shellcheck disable=SC2012
  ls -1t "$directory" | { grep -E '\.tar\.age$' || [ "$?" -eq 1 ]; } | tail -n "+$((keep + 1))" \
    | while IFS= read -r victim; do rm -f -- "$directory/$victim" || exit 1; done
}
prune "$DAILY_DIR" "$KEEP_DAILY"
prune "$WEEKLY_DIR" "$KEEP_WEEKLY"

# --- 7. off-host copy, then proof that it arrived ------------------------------------------
# Encrypted at rest before it leaves the box, so the remote is untrusted by construction.
# Exactly one of BACKUP_RCLONE_REMOTE or BACKUP_SCP_TARGET is set (checked at the top). A copy
# command that exits 0 is not proof: the artefact (and tonight's escrow envelope, if one was
# written) is looked up on the remote, and BACKUP_OK is printed only once it is there.
offhost_failed() {
  echo "BACKUP_FAILED $1" >&2
  exit 1
}
if [ -n "${BACKUP_RCLONE_REMOTE:-}" ]; then
  rclone copy "$BACKUP_DIR" "$BACKUP_RCLONE_REMOTE" --checksum --transfers 2 \
    || offhost_failed "rclone copy to the off-host remote exited nonzero"
  # One-way check of exactly this run's files: present on the remote, and equal by hash where
  # the backend keeps one (by size where it does not — rclone says so in the journal).
  includes=()
  for relative in "${VERIFY[@]}"; do
    # A filter that matches nothing locally would make the check vacuous: the file must be here.
    [ -f "$BACKUP_DIR/$relative" ] || offhost_failed "$relative is missing from the local staging directory"
    includes+=(--include "/$relative")
  done
  rclone check "$BACKUP_DIR" "$BACKUP_RCLONE_REMOTE" --one-way "${includes[@]}" \
    || offhost_failed "rclone check did not find this run's files intact on the off-host remote"
else
  scp -q -p -o BatchMode=yes -r "$BACKUP_DIR"/. "$BACKUP_SCP_TARGET" \
    || offhost_failed "scp to the off-host target exited nonzero"
  # scp has no remote listing, so each file is read back and compared byte for byte. That costs
  # one download of the artefact per night, and needs read access on the target.
  case "$BACKUP_SCP_TARGET" in
    *:) remote_base="$BACKUP_SCP_TARGET" ;;
    *) remote_base="${BACKUP_SCP_TARGET%/}/" ;;
  esac
  for relative in "${VERIFY[@]}"; do
    rm -f -- "$WORK/readback"
    scp -q -o BatchMode=yes "$remote_base$relative" "$WORK/readback" \
      || offhost_failed "could not read $relative back from the off-host target"
    cmp -s "$BACKUP_DIR/$relative" "$WORK/readback" \
      || offhost_failed "$relative read back from the off-host target differs from the local copy"
  done
  rm -f -- "$WORK/readback"
fi

printf 'BACKUP_OK %s %s %s\n' "$DIGEST" "$BYTES" "$UTC"
