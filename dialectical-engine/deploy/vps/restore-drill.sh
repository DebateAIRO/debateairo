#!/usr/bin/env bash
# deploy/vps/restore-drill.sh — quarterly proof that a backup is actually restorable.
#
# A row count proves nothing about this system: everything private is AEAD ciphertext. The drill
# therefore ends by decrypting one real encrypted run with the RESTORED keys (audit L2-F3, L5-F8,
# L7 "C2/C3 validation"). It restores into a scratch database and a scratch custody directory,
# touches neither the live cluster nor /var/lib/debateai, and removes both when it finishes.
#
# The data recipient's age identity is supplied by the operator for the duration of the drill and
# is never stored on this host. Preferred: run the whole drill on a separate machine, which also
# exercises "the VPS is gone" rather than "a table was dropped".
#
# Both age identities are needed: the data one opens dump+custody, the escrow one opens the KEK
# that unwraps the DEKs. Bring both to the drill; store neither on this host.
#
#   BACKUP_AGE_IDENTITY=/media/op/data.age.key \
#   BACKUP_ESCROW_IDENTITY=/media/op/escrow.age.key \
#     ./restore-drill.sh [artefact.tar.age]

set -euo pipefail
umask 077

CONFIG="${DEBATEAI_BACKUP_CONFIG:-/etc/debateai/backup.conf}"
# shellcheck source=/dev/null
. "$CONFIG"

: "${BACKUP_AGE_IDENTITY:?path to the data recipient's age identity, supplied for this drill only}"
: "${BACKUP_DIR:?}"

DRILL_DB="debateai_drill"
ARTEFACT="${1:-}"
if [ -z "$ARTEFACT" ]; then
  # shellcheck disable=SC2012
  ARTEFACT="$BACKUP_DIR/daily/$(ls -1t "$BACKUP_DIR/daily" | grep -E '\.tar\.age$' | head -n 1)"
fi
[ -f "$ARTEFACT" ] || { echo "RESTORE_DRILL_REFUSED no artefact at $ARTEFACT" >&2; exit 1; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/debateai-drill.XXXXXXXX")"
cleanup() {
  # Literal, never interpolated: a DROP DATABASE in a root script must not be able to name
  # anything but the scratch database, whatever else the environment holds.
  sudo -u postgres psql -v ON_ERROR_STOP=0 -q -c 'DROP DATABASE IF EXISTS debateai_drill' >/dev/null 2>&1 || true
  rm -rf -- "$WORK"
}
trap cleanup EXIT INT TERM

echo "RESTORE_DRILL_ARTEFACT $ARTEFACT"

# --- 1. open the envelope -----------------------------------------------------------------
age -d -i "$BACKUP_AGE_IDENTITY" < "$ARTEFACT" | tar -xf - -C "$WORK"
for member in globals.sql debateai.dump custody.tar; do
  [ -s "$WORK/$member" ] || { echo "RESTORE_DRILL_REFUSED missing $member" >&2; exit 1; }
done

# --- 2. globals ---------------------------------------------------------------------------
# Applying role definitions on the LIVE host would collide with the roles already there, so by
# default the drill only proves the globals are present and carry SCRAM verifiers. Set
# DRILL_APPLY_GLOBALS=true when drilling on a scratch machine to actually recreate them.
grep -q 'SCRAM-SHA-256' "$WORK/globals.sql" || {
  echo "RESTORE_DRILL_REFUSED globals carry no SCRAM verifier" >&2; exit 1; }
echo "RESTORE_DRILL_GLOBALS roles=$(grep -c '^CREATE ROLE ' "$WORK/globals.sql")"
if [ "${DRILL_APPLY_GLOBALS:-false}" = "true" ]; then
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q -f "$WORK/globals.sql"
fi

# --- 3. the database into a scratch DB ----------------------------------------------------
sudo -u postgres psql -v ON_ERROR_STOP=1 -q -c 'DROP DATABASE IF EXISTS debateai_drill' 
sudo -u postgres createdb "$DRILL_DB"
sudo -u postgres pg_restore --dbname="$DRILL_DB" --no-owner --no-privileges --exit-on-error \
  "$WORK/debateai.dump"

RUNS="$(sudo -u postgres psql -tAX -d "$DRILL_DB" -c 'SELECT count(*) FROM core.run')"
echo "RESTORE_DRILL_ROWS core.run=$RUNS"

# --- 4. audit chain verification (audit L5, "C1/C3 validation" section) -------------------
# Recomputes sha256(prev_hash || canonical payload) for every row and expects broken = 0 with a
# single root. Runs as the drill superuser because identity.audit_canonical_jsonb is revoked from
# the application roles. Rows written before migration 0040 used the app-side canonical form and
# are counted separately rather than silently passed.
CHAIN="$(sudo -u postgres psql -tAX -d "$DRILL_DB" <<'SQL'
SELECT count(*) FILTER (WHERE this_hash <> audit_crypto_internal.digest(
    COALESCE(prev_hash,''::bytea) || convert_to(
      '{"actorCiphertext":null,"actorKeyRef":'||to_jsonb(actor_key_ref)::text
      ||',"auditId":'||to_jsonb(audit_id::text)::text
      ||',"decision":'||to_jsonb(decision)::text
      ||',"eventType":'||to_jsonb(event_type)::text
      ||',"justification":'||COALESCE(to_jsonb(justification)::text,'null')
      ||',"occurredAt":'||to_jsonb(to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text
      ||',"sourceContext":'||identity.audit_canonical_jsonb(source_context)
      ||',"success":'||CASE WHEN success THEN 'true' ELSE 'false' END
      ||',"targetId":'||to_jsonb(target_id)::text
      ||',"targetType":'||to_jsonb(target_type)::text||'}','UTF8'),'sha256')) AS broken,
  count(*) FILTER (WHERE prev_hash IS NULL) AS roots,
  count(*) AS total
FROM identity.audit_event;
SQL
)"
BROKEN="$(printf '%s' "$CHAIN" | cut -d'|' -f1)"
ROOTS="$(printf '%s' "$CHAIN" | cut -d'|' -f2)"
TOTAL="$(printf '%s' "$CHAIN" | cut -d'|' -f3)"
echo "RESTORE_DRILL_CHAIN broken=$BROKEN roots=$ROOTS total=$TOTAL form=post-0040-sql-canonical"
[ "$BROKEN" = "0" ] || { echo "RESTORE_DRILL_FAILED audit chain broken=$BROKEN" >&2; exit 1; }
[ "$ROOTS" = "1" ] || [ "$TOTAL" = "0" ] || {
  echo "RESTORE_DRILL_FAILED audit chain roots=$ROOTS" >&2; exit 1; }

# --- 5. custody + escrowed KEK into a scratch tree, then decrypt one real row -------------
# BOTH envelopes are needed and that is the point of the drill: the DEK store rides with the
# dump, the KEK that unwraps it lives only in the escrow envelope whose private key is off-host.
# A drill that cannot open a run has not proved recoverability, so this arm is not optional.
: "${BACKUP_ESCROW_IDENTITY:?path to the escrow age identity, brought to the drill by the key holder}"
: "${USER_DEK_STORE_PATH:?}"
: "${KEK_PATH:?}"
ESCROW_ARTEFACT="${BACKUP_ESCROW_ARTEFACT:-}"
if [ -z "$ESCROW_ARTEFACT" ]; then
  # shellcheck disable=SC2012
  ESCROW_ARTEFACT="$BACKUP_DIR/escrow/$(ls -1t "$BACKUP_DIR/escrow" | grep -E '\.tar\.age$' | head -n 1)"
fi
[ -f "$ESCROW_ARTEFACT" ] || { echo "RESTORE_DRILL_REFUSED no escrow artefact" >&2; exit 1; }

mkdir -p "$WORK/custody" "$WORK/keys"
tar -xf "$WORK/custody.tar" -C "$WORK/custody"
age -d -i "$BACKUP_ESCROW_IDENTITY" < "$ESCROW_ARTEFACT" | tar -xf - -C "$WORK/keys"

DRILL_STORE="$WORK/custody/$(basename "$USER_DEK_STORE_PATH")"
DRILL_KEK="$WORK/keys/$(basename "$KEK_PATH")"
[ -d "$DRILL_STORE" ] || { echo "RESTORE_DRILL_REFUSED no restored DEK store" >&2; exit 1; }
[ -s "$DRILL_KEK" ] || { echo "RESTORE_DRILL_REFUSED no restored KEK" >&2; exit 1; }

# The probe runs as the postgres OS user (peer auth is the only way into the scratch database),
# so the restored custody must be readable by it and by nobody else: the crypto loaders require
# exactly 0600 on key files and 0700 on their directory.
chown -R postgres:postgres "$WORK/custody" "$WORK/keys"
chmod 0700 "$WORK/custody" "$WORK/keys" "$DRILL_STORE"
chmod 0600 "$DRILL_KEK"
chmod 0711 "$WORK"

sudo -u postgres env \
  DRILL_DATABASE_URL="postgresql://postgres@localhost/$DRILL_DB?host=/var/run/postgresql" \
  DRILL_KEK_PATH="$DRILL_KEK" \
  DRILL_USER_DEK_STORE_PATH="$DRILL_STORE" \
  /usr/bin/pnpm --dir /opt/debateai/dialectical-engine exec tsx \
  /opt/debateai/dialectical-engine/deploy/vps/drill-decrypt-sample.ts

echo "RESTORE_DRILL_OK $(date -u +%Y-%m-%dT%H:%M:%SZ)"
