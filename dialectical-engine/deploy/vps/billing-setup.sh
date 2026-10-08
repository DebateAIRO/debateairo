#!/usr/bin/env bash
# deploy/vps/billing-setup.sh — NETOPIA spec 2026-10-05 §2.17.2 (task N21): the guided setup of billing's private
# settings. Run it as root on the server, from the checkout:
#
#   bash deploy/vps/billing-setup.sh                      # every section: netopia, quaderno, smartbill, owner-email
#   bash deploy/vps/billing-setup.sh netopia smartbill    # some sections, by name
#   bash deploy/vps/billing-setup.sh --replace netopia    # that section, replacing its existing key files
#
# Each section asks its values one at a time and says where to find each one. Secrets are read with
# systemd-ask-password (never shown, never on a command line or in shell history) and written as custody files: 0600,
# owned by debateai-api, in the 0700 directory /etc/debateai/api/billing, each through a temporary file in the same
# directory and one rename. An existing key file is kept unless --replace names its section. NETOPIA's public-key file
# is root's, 0644, never writable by the API's user. The plain values go into ONE block of /etc/debateai/api.env,
# between the two marker lines below: only that block is rewritten, a dated copy of the file is kept beside it with
# its mode and owner, and a line outside the block that sets one of the block's keys is commented out with a note
# (systemd would use the later one). It ends with pnpm billing:check, run as the API. It never prints an answer.
#
# --test-root <dir> exists for tests/unit/billing-setup-script.test.ts only: every path moves under <dir>, answers
# come from standard input, owners are written to <dir>/.billing-setup-owners instead of being set, and the check is
# not run. It is refused as root, and for any directory that is not inside the system's temporary directory or does
# not hold the marker file .billing-setup-test-root.
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ENGINE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
PUBLISHED_KEY="$SCRIPT_DIR/netopia/published-ipn-key.pem"
BEGIN_MARK="# >>> billing settings (billing-setup.sh) >>>"
# The end marker's three angle brackets are joined from pieces, so this file never holds a here-string's spelling
# (tests/unit/billing-setup-script.test.ts refuses it anywhere in the script).
ANGLES='<''<''<'
END_MARK="# $ANGLES billing settings $ANGLES"
ALL_SECTIONS="netopia quaderno smartbill owner-email"
BLOCK_ORDER="NETOPIA_API_BASE_URL NETOPIA_POS_SIGNATURE NETOPIA_API_KEY_PATH NETOPIA_IPN_KEYS_PATH QUADERNO_API_BASE_URL QUADERNO_API_KEY_PATH SMARTBILL_API_BASE_URL SMARTBILL_SERIES SMARTBILL_CREDENTIALS_PATH OWNER_REPORT_EMAIL_PATH"
SANDBOX_BASE="https://secure-sandbox.netopia-payments.com"
LIVE_BASE="https://secure.netopia-payments.com/api"
POS_PATTERN='^[A-Z0-9]{4}(-[A-Z0-9]{4}){4}$'
HTTPS_PATTERN='^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~/-]*)?$'
SERIES_PATTERN='^[A-Za-z0-9]{1,16}$'
SECRET_PATTERN='^[!-~]([ -~]*[!-~])?$'
SMARTBILL_USER_PATTERN='^[^@[:space:]:]+@[^@[:space:]:]+$'
EMAIL_PATTERN='^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'

ROOT=""
TEST_MODE=0
SECTIONS=""
REPLACE=" "
WORK=""
PENDING=""
ANSWER=""
VALUE=""

refuse() { printf '%s\n' "$1" >&2; exit "${2:-1}"; }
say() { printf '%s\n' "$*" >&2; }
cleanup() {
  if [ -n "$PENDING" ]; then rm -f "$PENDING"; fi
  if [ -n "$WORK" ]; then rm -rf "$WORK"; fi
}
trap cleanup EXIT

is_section() { case " $ALL_SECTIONS " in *" $1 "*) return 0 ;; esac; return 1; }
replacing() { case "$REPLACE" in *" $1 "*) return 0 ;; esac; return 1; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    --test-root)
      [ "$#" -ge 2 ] || refuse "BILLING_SETUP_USAGE" 2
      ROOT="$2"; TEST_MODE=1; shift 2 ;;
    --replace)
      [ "$#" -ge 2 ] && is_section "$2" || refuse "BILLING_SETUP_USAGE" 2
      REPLACE="$REPLACE$2 "; SECTIONS="$SECTIONS $2"; shift 2 ;;
    *)
      is_section "$1" || refuse "BILLING_SETUP_USAGE" 2
      SECTIONS="$SECTIONS $1"; shift ;;
  esac
done
[ -n "$SECTIONS" ] || SECTIONS="$ALL_SECTIONS"

if [ "$TEST_MODE" = 1 ]; then
  [ "$(id -u)" != 0 ] || refuse "BILLING_SETUP_TEST_ROOT_REFUSED" 2
  case "$ROOT" in /*) ;; *) refuse "BILLING_SETUP_TEST_ROOT_REFUSED" 2 ;; esac
  { [ -d "$ROOT" ] && [ -f "$ROOT/.billing-setup-test-root" ]; } || refuse "BILLING_SETUP_TEST_ROOT_REFUSED" 2
  TEMP_REAL="$(cd "${TMPDIR:-/tmp}" && pwd -P)"
  ROOT="$(cd "$ROOT" && pwd -P)"
  case "$ROOT" in "$TEMP_REAL"/?*) ;; *) refuse "BILLING_SETUP_TEST_ROOT_REFUSED" 2 ;; esac
else
  [ "$(id -u)" = 0 ] || refuse "BILLING_SETUP_NOT_ROOT: run it as root (sudo bash deploy/vps/billing-setup.sh)" 2
  command -v systemd-ask-password >/dev/null 2>&1 || refuse "BILLING_SETUP_REFUSED: systemd-ask-password is not installed"
fi

API_ENV="$ROOT/etc/debateai/api.env"
BILLING_DIR="$ROOT/etc/debateai/api/billing"
KEYS_FILE="$BILLING_DIR/netopia-ipn-keys.pem"
[ -f "$API_ENV" ] || refuse "BILLING_SETUP_REFUSED: /etc/debateai/api.env does not exist; install the API first (README §5)"
[ -d "$(dirname "$BILLING_DIR")" ] || refuse "BILLING_SETUP_REFUSED: /etc/debateai/api does not exist; set up the API's key files first (README §3)"
[ -f "$PUBLISHED_KEY" ] || refuse "BILLING_SETUP_REFUSED: deploy/vps/netopia/published-ipn-key.pem is missing from the checkout"

# The block must be absent, or one begin line followed by one end line; anything else is the owner's to repair.
MARKERS="$(awk -v b="$BEGIN_MARK" -v e="$END_MARK" '$0 == b { printf "B" } $0 == e { printf "E" }' "$API_ENV")"
case "$MARKERS" in ""|BE) ;; *) refuse "BILLING_SETUP_BLOCK_DAMAGED: /etc/debateai/api.env must hold the two billing marker lines once each, in order" ;; esac

WORK="$(mktemp -d "$(dirname "$API_ENV")/.billing-setup.XXXXXXXX")"
awk -v b="$BEGIN_MARK" -v e="$END_MARK" '$0 == b { f = 1; next } $0 == e { f = 0; next } f && /^[A-Za-z_][A-Za-z0-9_]*=/ { print }' \
  "$API_ENV" > "$WORK/entries"

server_path() { printf '%s' "${1#"$ROOT"}"; }

# The owner of a file being written: set on the server, recorded under the test root.
set_owner() { # <owner:group> <the file now> <its final path>
  if [ "$TEST_MODE" = 1 ]; then
    printf '%s %s\n' "$1" "${3#"$ROOT"/}" >> "$ROOT/.billing-setup-owners"
  else
    chown "$1" "$2"
  fi
}

# Writes standard input to <path> through a temporary file in the same directory and one rename.
write_file() { # <path> <mode> <owner:group>
  local path="$1" tmp
  tmp="$(mktemp "$(dirname "$path")/.billing-setup.XXXXXXXX")"
  PENDING="$tmp"
  cat > "$tmp"
  chmod "$2" "$tmp"
  set_owner "$3" "$tmp" "$path"
  mv -f "$tmp" "$path"
  PENDING=""
}

ensure_billing_dir() {
  [ -d "$BILLING_DIR" ] || mkdir "$BILLING_DIR"
  chmod 0700 "$BILLING_DIR"
  set_owner debateai-api:debateai-api "$BILLING_DIR" "$BILLING_DIR"
}

block_value() { awk -v k="$1" 'index($0, k "=") == 1 { print substr($0, length(k) + 2); exit }' "$WORK/entries"; }
set_value() {
  awk -v k="$1" 'index($0, k "=") != 1' "$WORK/entries" > "$WORK/entries.next"
  printf '%s=%s\n' "$1" "$2" >> "$WORK/entries.next"
  mv -f "$WORK/entries.next" "$WORK/entries"
}

# One line from the owner: the terminal on the server, standard input under the test root. Never printed back.
read_line() {
  local line=""
  if ! IFS= read -r line; then [ -n "$line" ] || refuse "BILLING_SETUP_ANSWER_MISSING"; fi
  ANSWER="${line%$'\r'}"
}
read_secret() { # <prompt>
  if [ "$TEST_MODE" = 1 ]; then
    say "$1"
    read_line
  else
    ANSWER="$(systemd-ask-password "$1")" || refuse "BILLING_SETUP_ANSWER_MISSING"
  fi
}
too_many() { # <tries so far> <name>
  [ "$1" -lt 3 ] || refuse "BILLING_SETUP_ANSWER_INVALID:$2"
  say "That does not look right; please type it again."
}

# ask_value <KEY> <pattern> <explanation>: sets VALUE; Enter keeps the value the block already holds.
ask_value() {
  local key="$1" pattern="$2" current tries=0
  current="$(block_value "$key")"
  say ""
  say "$3"
  [ -z "$current" ] || say "(Press Enter to keep the value already set.)"
  while :; do
    say "$key:"
    read_line
    if [ -z "$ANSWER" ] && [ -n "$current" ]; then VALUE="$current"; return 0; fi
    if [[ $ANSWER =~ $pattern ]]; then VALUE="$ANSWER"; return 0; fi
    tries=$((tries + 1))
    too_many "$tries" "$key"
  done
}

# ask_secret <name> <explanation> <prompt>: sets ANSWER to one printable line of at most 4,096 characters.
ask_secret() {
  local tries=0
  say ""
  say "$2"
  while :; do
    read_secret "$3"
    if [ "${#ANSWER}" -le 4096 ] && [[ $ANSWER =~ $SECRET_PATTERN ]]; then return 0; fi
    tries=$((tries + 1))
    too_many "$tries" "$1"
  done
}

kept() { # <path> <section>: true (and says so) when the file stays as it is
  if [ -e "$1" ] && ! replacing "$2"; then
    say ""
    say "Kept the existing $(basename "$1") (run with --replace $2 to change it)."
    return 0
  fi
  return 1
}

save_secret() { # <path>; the secret in ANSWER, written as "<prefix><ANSWER>"
  write_file "$1" 0600 debateai-api:debateai-api < <(printf '%s%s\n' "${2:-}" "$ANSWER")
  ANSWER=""
  say "Saved $(basename "$1") (mode 0600, owned by debateai-api)."
}

published_fingerprint() { sed -n 's/^# SPKI SHA-256: \([0-9a-f]\{64\}\)$/\1/p' "$PUBLISHED_KEY" | head -n 1; }

print_fingerprints() { # <pem file>
  local published count=0 fingerprint block
  if ! command -v openssl >/dev/null 2>&1; then
    say "(openssl is not installed here: the check below prints each key's fingerprint.)"
    return 0
  fi
  published="$(published_fingerprint)"
  rm -f "$WORK"/block.*
  awk -v dir="$WORK" '/^-----BEGIN / { n++; name = dir "/block." n } name != "" { print > name } /^-----END / { close(name); name = "" }' "$1"
  for block in "$WORK"/block.*; do
    [ -f "$block" ] || continue
    count=$((count + 1))
    if grep -q -- '-----BEGIN CERTIFICATE-----' "$block"; then
      fingerprint="$(openssl x509 -in "$block" -pubkey -noout 2>/dev/null | openssl pkey -pubin -outform DER 2>/dev/null \
        | openssl dgst -sha256 | awk '{ print $NF }')" || fingerprint=""
    else
      fingerprint="$(openssl pkey -pubin -in "$block" -outform DER 2>/dev/null | openssl dgst -sha256 | awk '{ print $NF }')" \
        || fingerprint=""
    fi
    if [ -z "$fingerprint" ]; then
      say "Key $count: could not be read (pnpm billing:check says why)."
    elif [ "$fingerprint" = "$published" ]; then
      say "Key $count: SHA-256 $fingerprint, NETOPIA's published plugin key."
    else
      say "Key $count: SHA-256 $fingerprint, not NETOPIA's published plugin key: confirm this fingerprint with NETOPIA."
    fi
  done
}

pem_well_formed() { # <file>: one or more PUBLIC KEY or CERTIFICATE blocks of base64 lines, nothing else
  awk '
    /^-----BEGIN (PUBLIC KEY|CERTIFICATE)-----$/ { if (open) bad = 1; open = 1; closing = $0; sub(/BEGIN/, "END", closing); blocks++; next }
    open && $0 == closing { open = 0; next }
    open && /^[A-Za-z0-9+\/=]+$/ { next }
    { bad = 1 }
    END { exit (bad || open || blocks == 0) ? 1 : 0 }
  ' "$1"
}

trusted_keys() {
  local tries=0
  if kept "$KEYS_FILE" netopia; then print_fingerprints "$KEYS_FILE"; return 0; fi
  say ""
  say "NETOPIA's public key proves that NETOPIA's payment messages are genuine. Type 1 to use the key NETOPIA publishes in its own shop plugins (confirm with NETOPIA first that its SHA-256 fingerprint is $(published_fingerprint)), or 2 to paste the key or keys NETOPIA gave you."
  while :; do
    say "Type 1 or 2:"
    read_line
    if [ "$ANSWER" = 1 ]; then cp "$PUBLISHED_KEY" "$WORK/keys.pem"; break; fi
    if [ "$ANSWER" = 2 ]; then
      say "Paste the block or blocks (each from its -----BEGIN line to its -----END line), then press Enter on an empty line:"
      : > "$WORK/keys.pem"
      while :; do
        read_line
        [ -n "$ANSWER" ] || break
        printf '%s\n' "$ANSWER" >> "$WORK/keys.pem"
      done
      if pem_well_formed "$WORK/keys.pem"; then break; fi
      say "That is not one or more PUBLIC KEY or CERTIFICATE blocks."
    fi
    tries=$((tries + 1))
    too_many "$tries" NETOPIA_IPN_KEYS
  done
  write_file "$KEYS_FILE" 0644 root:root < "$WORK/keys.pem"
  say "Saved netopia-ipn-keys.pem (mode 0644, owned by root, not writable by the API's user)."
  print_fingerprints "$KEYS_FILE"
}

section_netopia() {
  local current base="" tries=0
  say ""
  say "== NETOPIA Payments =="
  current="$(block_value NETOPIA_API_BASE_URL)"
  say "Test payments (sandbox) or real payments (live)? Start with sandbox; move to live later with --replace netopia."
  [ -z "$current" ] || say "(Press Enter to keep the choice already set.)"
  while :; do
    say "Type sandbox or live:"
    read_line
    if [ "$ANSWER" = sandbox ]; then base="$SANDBOX_BASE"; break; fi
    if [ "$ANSWER" = live ]; then base="$LIVE_BASE"; break; fi
    if [ -z "$ANSWER" ] && [ -n "$current" ]; then base="$current"; break; fi
    tries=$((tries + 1))
    too_many "$tries" NETOPIA_API_BASE_URL
  done
  set_value NETOPIA_API_BASE_URL "$base"
  ask_value NETOPIA_POS_SIGNATURE "$POS_PATTERN" "Your POS signature: five groups of four capital letters or digits, such as AB12-CD34-EF56-GH78-IJ90. In NETOPIA's admin: Points of sale, then your point of sale, then Technical settings (Puncte de vânzare, Setări tehnice). The sandbox has its own."
  set_value NETOPIA_POS_SIGNATURE "$VALUE"
  if ! kept "$BILLING_DIR/netopia-api-key" netopia; then
    ask_secret NETOPIA_API_KEY "Your NETOPIA API key. In NETOPIA's admin: your profile (top right), then Security, then API key (Securitate, Cheie API). A sandbox key works only on the sandbox, a live key only live. It stays hidden as you type." "NETOPIA API key:"
    save_secret "$BILLING_DIR/netopia-api-key"
  fi
  set_value NETOPIA_API_KEY_PATH "$(server_path "$BILLING_DIR/netopia-api-key")"
  trusted_keys
  set_value NETOPIA_IPN_KEYS_PATH "$(server_path "$KEYS_FILE")"
}

section_quaderno() {
  say ""
  say "== Quaderno (the tax service) =="
  ask_value QUADERNO_API_BASE_URL "$HTTPS_PATTERN" "Quaderno's API address, as your Quaderno account shows it with its API keys (https://ACCOUNT.quadernoapp.com/api). With NETOPIA's sandbox, use your Quaderno sandbox account's address (https://ACCOUNT.sandbox-quadernoapp.com/api)."
  set_value QUADERNO_API_BASE_URL "$VALUE"
  if ! kept "$BILLING_DIR/quaderno-api-key" quaderno; then
    ask_secret QUADERNO_API_KEY "Your Quaderno private API key, from the same page. It stays hidden as you type." "Quaderno API key:"
    save_secret "$BILLING_DIR/quaderno-api-key"
  fi
  set_value QUADERNO_API_KEY_PATH "$(server_path "$BILLING_DIR/quaderno-api-key")"
}

section_smartbill() {
  local user
  say ""
  say "== SmartBill (Romanian invoices) =="
  ask_value SMARTBILL_API_BASE_URL "$HTTPS_PATTERN" "SmartBill's API address, as docs/architecture/smartbill-api-facts.md records it. SmartBill has no sandbox: with NETOPIA's sandbox, use an address ending in .invalid (such as https://smartbill.invalid/SBORO/api), so no real invoice can be issued."
  set_value SMARTBILL_API_BASE_URL "$VALUE"
  ask_value SMARTBILL_SERIES "$SERIES_PATTERN" "The invoice series agreed with the accountant: letters and digits, at most 16."
  set_value SMARTBILL_SERIES "$VALUE"
  if ! kept "$BILLING_DIR/smartbill-credentials" smartbill; then
    ask_value SMARTBILL_USER "$SMARTBILL_USER_PATTERN" "SmartBill's API user: the email address you sign in to SmartBill with. SmartBill shows it, with the API token, under your account's Integrations page."
    user="$VALUE"
    ask_secret SMARTBILL_TOKEN "SmartBill's API token, from the same page. It stays hidden as you type." "SmartBill API token:"
    save_secret "$BILLING_DIR/smartbill-credentials" "$user:"
  fi
  set_value SMARTBILL_CREDENTIALS_PATH "$(server_path "$BILLING_DIR/smartbill-credentials")"
}

section_owner_email() {
  say ""
  say "== The owner's address =="
  if ! kept "$BILLING_DIR/owner-report-email" owner-email; then
    ask_value OWNER_REPORT_EMAIL "$EMAIL_PATTERN" "The email address the owner's reports and alerts go to (the quarterly tax summary and the O2, O3 and O4 emails). It is not a secret."
    ANSWER="$VALUE"
    save_secret "$BILLING_DIR/owner-report-email"
  fi
  set_value OWNER_REPORT_EMAIL_PATH "$(server_path "$BILLING_DIR/owner-report-email")"
}

# The new api.env: the old one with its block replaced (or appended) and every duplicate outside it commented out.
read -r -d '' REWRITE_AWK <<'AWK' || true
BEGIN {
  n = split(order, keys, " ")
  for (i = 1; i <= n; i++) known[keys[i]] = 1
  while ((getline line < entries) > 0) {
    k = line; sub(/=.*/, "", k)
    if (!(k in value)) extra[++extras] = k
    value[k] = substr(line, length(k) + 2)
  }
  close(entries)
}
function key_of(s,   t) {
  t = s
  sub(/^[ \t]*export[ \t]+/, "", t)
  sub(/^[ \t]+/, "", t)
  if (t !~ /^[A-Za-z_][A-Za-z0-9_]*=/) return ""
  sub(/=.*/, "", t)
  return t
}
function print_block(   i, k) {
  print begin
  for (i = 1; i <= n; i++) if (keys[i] in value) print keys[i] "=" value[keys[i]]
  for (i = 1; i <= extras; i++) { k = extra[i]; if (!(k in known)) print k "=" value[k] }
  print end
  printed = 1
}
$0 == begin { inside = 1; if (!printed) print_block(); next }
$0 == end { inside = 0; next }
inside { next }
{
  k = key_of($0)
  if (k != "" && (k in value)) { print "# billing-setup.sh " stamp ": now set in the billing settings block: " $0; next }
  print
}
END { if (!printed) print_block() }
AWK

rewrite_api_env() {
  local stamp backup tmp
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  backup="$API_ENV.bak-$stamp"
  [ ! -e "$backup" ] || backup="$backup-$$"
  cp -p "$API_ENV" "$backup"
  tmp="$(mktemp "$(dirname "$API_ENV")/.api.env.XXXXXXXX")"
  PENDING="$tmp"
  cp -p "$API_ENV" "$tmp"
  awk -v begin="$BEGIN_MARK" -v end="$END_MARK" -v entries="$WORK/entries" -v order="$BLOCK_ORDER" -v stamp="$stamp" \
    "$REWRITE_AWK" "$API_ENV" > "$tmp"
  mv -f "$tmp" "$API_ENV"
  PENDING=""
  say ""
  say "Updated the billing settings block of /etc/debateai/api.env; the previous file is kept as $(server_path "$backup")."
}

ensure_billing_dir
for section in $SECTIONS; do
  if [ "$section" = netopia ]; then section_netopia
  elif [ "$section" = quaderno ]; then section_quaderno
  elif [ "$section" = smartbill ]; then section_smartbill
  else section_owner_email
  fi
done
rewrite_api_env

if [ "$TEST_MODE" = 1 ]; then
  say "Test root: the check command is not run."
  exit 0
fi
say "Restart the API to use the new settings: systemctl restart debateai-api"
say ""
say "Checking everything (pnpm billing:check, run as the API):"
PNPM="$(command -v pnpm)" || refuse "BILLING_SETUP_CHECK_SKIPPED: pnpm is not on PATH; run pnpm billing:check as the runbook shows"
set +e
systemd-run --pipe --wait --collect --uid=debateai-api --gid=debateai-api --property=EnvironmentFile=/etc/debateai/api.env \
  --working-directory="$ENGINE_DIR" "$PNPM" billing:check
STATUS=$?
set -e
exit "$STATUS"
