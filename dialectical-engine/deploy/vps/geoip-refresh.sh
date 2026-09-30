#!/usr/bin/env bash
# deploy/vps/geoip-refresh.sh — paid plans G4 (spec 2026-09-29 §2.3.3 "Refresh").
#
# Refreshes the two PUBLIC data files the API's country gate reads:
#   - DB-IP's Lite country database (MMDB, CC BY 4.0, monthly), from
#     https://download.db-ip.com/free/dbip-country-lite-YYYY-MM.mmdb.gz
#     The site footer carries the credit link its licence requires (README "Country data").
#   - the Tor Project's bulk exit list, one address per line, daily, from
#     https://check.torproject.org/torbulkexitlist
# Run by debateai-geoip-refresh.service (a daily timer) as debateai-geoip, a user that owns nothing
# else on this host. systemd hands it STATE_DIRECTORY (/var/lib/debateai-geoip).
#
# Each file is downloaded into a private directory INSIDE the state directory, checked (the MMDB
# metadata marker and a minimum size; for the Tor list, a minimum number of address lines and not
# one line the API's own parser would refuse), and only then renamed into place: one atomic
# rename, so the API never reads half a file, and a refused download leaves the previous file
# untouched. The country file is fetched when it is missing or
# older than 27 days; the Tor list on every run. Output: one receipt line per file.
set -euo pipefail
umask 022

: "${STATE_DIRECTORY:?GEOIP_REFRESH_REFUSED no state directory; run through debateai-geoip-refresh.service}"
DIR="$STATE_DIRECTORY"
COUNTRY_FILE="$DIR/dbip-country-lite.mmdb"
TOR_FILE="$DIR/tor-exit-list.txt"
COUNTRY_MIN_BYTES="${GEOIP_COUNTRY_MIN_BYTES:-1000000}"
TOR_MIN_LINES="${GEOIP_TOR_MIN_LINES:-500}"
COUNTRY_MAX_AGE_DAYS=27
COUNTRY_URL_PREFIX="https://download.db-ip.com/free/dbip-country-lite-"
TOR_URL="https://check.torproject.org/torbulkexitlist"
MMDB_MARKER=$'\xab\xcd\xefMaxMind.com'

WORK="$(mktemp -d "$DIR/.refresh.XXXXXXXX")"
trap 'rm -rf "$WORK"' EXIT

fetch() {
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
    --max-time 300 --retry 3 --retry-delay 10 --output "$2" "$1"
}

# Prints "<address lines> <refused lines>" for one Tor list, judged exactly as the API's own parser
# (packages/geo parseIp, via loadTorList) judges it, so a list this script accepts never refuses the
# API boot with TOR_EXIT_LIST_INVALID. Accepted: dotted IPv4 without leading zeros (each octet 0-255),
# and IPv6 of one to four hex digits per group with at most one "::" (no zone id). Blank lines and
# "#" comments are neither, and surrounding blanks are trimmed, as the lookup trims them. Plain awk,
# no interval expressions, so mawk, gawk and the BSD awk all read it the same.
tor_counts() {
  LC_ALL=C awk '
    function ipv4(s,   n, parts, i) {
      n = split(s, parts, ".")
      if (n != 4) return 0
      for (i = 1; i <= 4; i++) {
        if (parts[i] !~ /^(0|[1-9][0-9]*)$/ || length(parts[i]) > 3 || parts[i] + 0 > 255) return 0
      }
      return 1
    }
    function groups(s,   n, parts, i) {
      if (s == "") return 0
      n = split(s, parts, ":")
      for (i = 1; i <= n; i++) {
        if (parts[i] !~ /^[0-9A-Fa-f]+$/ || length(parts[i]) > 4) return -1
      }
      return n
    }
    function ipv6(s,   n, halves, left, right) {
      if (s !~ /^[0-9A-Fa-f:]+$/ || index(s, ":") == 0 || index(s, ":::") > 0) return 0
      n = split(s, halves, "::")
      if (n > 2) return 0
      left = groups(halves[1])
      if (n == 1) return left == 8
      right = groups(halves[2])
      return left >= 0 && right >= 0 && left + right <= 7
    }
    {
      line = $0
      sub(/^[ \t\r]+/, "", line)
      sub(/[ \t\r]+$/, "", line)
      if (line == "" || substr(line, 1, 1) == "#") next
      if (ipv4(line) || ipv6(line)) lines++
      else invalid++
    }
    END { printf "%d %d\n", lines, invalid }
  ' "$1"
}

# Both refresh functions run under `|| status=1`, where bash ignores set -e: every step refuses by itself.
refresh_tor() {
  local counts lines invalid
  if ! fetch "$TOR_URL" "$WORK/tor.txt"; then
    printf 'GEOIP_REFRESH_REFUSED tor-list download\n' >&2
    return 1
  fi
  if ! counts="$(tor_counts "$WORK/tor.txt")"; then
    printf 'GEOIP_REFRESH_REFUSED tor-list check\n' >&2
    return 1
  fi
  lines="${counts% *}"
  invalid="${counts#* }"
  if ! { [ "$lines" -ge "$TOR_MIN_LINES" ] && [ "$invalid" -eq 0 ]; }; then
    printf 'GEOIP_REFRESH_REFUSED tor-list lines=%s invalid=%s\n' "$lines" "$invalid" >&2
    return 1
  fi
  mv -f "$WORK/tor.txt" "$TOR_FILE" || return 1
  printf 'GEOIP_REFRESH_OK tor-list lines=%s\n' "$lines"
}

country_due() {
  [ ! -e "$COUNTRY_FILE" ] || [ -n "$(find "$COUNTRY_FILE" -mtime +"$COUNTRY_MAX_AGE_DAYS" -print)" ]
}

refresh_country() {
  local year month previous candidate bytes
  year="$(date -u +%Y)"
  month="$(date -u +%m)"
  month=$((10#$month))
  if [ "$month" -eq 1 ]; then
    previous="$((year - 1))-12"
  else
    previous="$(printf '%d-%02d' "$year" "$((month - 1))")"
  fi
  # Early in a month the new file may not be published yet: last month's is the fallback.
  for candidate in "$(printf '%d-%02d' "$year" "$month")" "$previous"; do
    if fetch "${COUNTRY_URL_PREFIX}${candidate}.mmdb.gz" "$WORK/country.mmdb.gz"; then
      if ! gzip -dc "$WORK/country.mmdb.gz" > "$WORK/country.mmdb"; then
        printf 'GEOIP_REFRESH_REFUSED country-db month=%s not-gzip\n' "$candidate" >&2
        return 1
      fi
      if ! bytes="$(wc -c < "$WORK/country.mmdb" | tr -d ' ')"; then
        printf 'GEOIP_REFRESH_REFUSED country-db month=%s check\n' "$candidate" >&2
        return 1
      fi
      if ! { [ "$bytes" -ge "$COUNTRY_MIN_BYTES" ] && LC_ALL=C grep -qaF "$MMDB_MARKER" "$WORK/country.mmdb"; }; then
        printf 'GEOIP_REFRESH_REFUSED country-db month=%s bytes=%s\n' "$candidate" "$bytes" >&2
        return 1
      fi
      mv -f "$WORK/country.mmdb" "$COUNTRY_FILE" || return 1
      printf 'GEOIP_REFRESH_OK country-db month=%s bytes=%s\n' "$candidate" "$bytes"
      return 0
    fi
  done
  printf 'GEOIP_REFRESH_REFUSED country-db download\n' >&2
  return 1
}

status=0
refresh_tor || status=1
if country_due; then
  refresh_country || status=1
else
  printf 'GEOIP_REFRESH_SKIPPED country-db fresh\n'
fi
exit "$status"
