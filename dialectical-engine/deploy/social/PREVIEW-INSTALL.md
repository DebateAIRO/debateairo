# Switching on "Continue with Google" on dezbatere.ro

Plain words first. The sign-in page asks the server which companies are ready and draws one button per answer. The
server answers "Google" only when three things are in place:

1. **the relay**: a small helper program on the server, the only thing allowed to talk to Google;
2. **the key file**: Google's client ID and client secret, readable by the relay alone;
3. **two settings lines** in the API's settings file, naming the relay's socket and the public half of the key file.

Until all three are there, the page draws no button and nothing else changes. Removing the two settings lines and
restarting the API switches it off again (part 8).

This guide fits the server as it was read on 2026-11-24 (release r28, systemd 259): nothing of the relay installed, no
`debateai-preview-social` user, no `SOCIAL_` line in any settings file, the site answering as `https://dezbatere.ro`.
The Turnstile relay (`debateai-preview-turnstile.service`) is the model for every choice below.

Every block is run as root on the server, one at a time. Each ends with a `…_DONE` line. **If a block prints anything
else as its last line, stop and ask; never run the next block after a refusal.**

## 0. Before you start

- **The release on the server carries both fixes of pull request 365**: the website's return address
  (`/v1/auth/social/google/callback`) and the relay's reading of systemd's credential file. Part 1 checks this.
- **From Google Cloud Console** (APIs & Services → Credentials → OAuth client ID, type "Web application"):
  - the **client ID** (public; ends in `.apps.googleusercontent.com`);
  - the **client secret** (never paste it into a chat, a ticket or a shell history; part 3 asks for it at a hidden prompt);
  - the **project ID** of the Google Cloud project (public; used here only as a label that both files must agree on).
- In that same Google client, exactly this **Authorised redirect URI**:
  `https://dezbatere.ro/v1/auth/social/google/callback`
- Consent screen scopes: `openid`, `email`, `profile` only.

## 1. CHECK (reads only)

```bash
set -euo pipefail
API=$(systemctl list-units --plain --no-legend --state=active 'debateai-preview-api@*.service' | awk '{print $1}')
[ "$(printf '%s\n' "$API" | grep -c .)" = 1 ] || { echo "CHECK_NOT_DONE: expected one running API, found: $API"; exit 1; }
LABEL=${API#debateai-preview-api@}; LABEL=${LABEL%.service}
REL=/opt/debateai-v3-preview/releases/auth-dev-candidate-$LABEL-api/dialectical-engine
ENVF=/etc/debateai-v3-preview/auth-dev-v1/api-$LABEL.env
[ -f "$REL/deploy/social/social-relay.mjs" ] || { echo "CHECK_NOT_DONE: no relay in $REL"; exit 1; }
grep -q "socialCredentialCustody" "$REL/deploy/social/social-relay.mjs" || { echo "CHECK_NOT_DONE: this release's relay cannot read systemd's credential file (it is older than pull request 365): upload a newer release first"; exit 1; }
[ -f "$REL/deploy/social/debateai-preview-social.service" ] || { echo "CHECK_NOT_DONE: no preview unit file in this release"; exit 1; }
[ -d "$REL/apps/ui/app/v1/auth/social" ] || { echo "CHECK_NOT_DONE: this release's website has no return address"; exit 1; }
[ "$(grep -c '^PUBLIC_APP_URL=https://dezbatere.ro$' "$ENVF")" = 1 ] || { echo "CHECK_NOT_DONE: the API's site address is not https://dezbatere.ro: the redirect URI in part 0 would be wrong"; exit 1; }
[ "$(grep -c '^SOCIAL_' "$ENVF" || true)" = 0 ] || { echo "CHECK_NOT_DONE: the settings file already has SOCIAL_ lines: ask"; exit 1; }
! getent passwd debateai-preview-social >/dev/null || { echo "CHECK_NOT_DONE: the relay user already exists: ask"; exit 1; }
! systemctl cat debateai-preview-social.service >/dev/null 2>&1 || { echo "CHECK_NOT_DONE: a relay unit already exists: ask"; exit 1; }
[ -x /usr/bin/python3 ] || { echo "CHECK_NOT_DONE: /usr/bin/python3 is missing (the relay reads the credential ACL with it)"; exit 1; }
echo "label=$LABEL"; echo "CHECK_DONE"
```

## 2. USER: the relay's user, group, folders and program

```bash
set -euo pipefail
API=$(systemctl list-units --plain --no-legend --state=active 'debateai-preview-api@*.service' | awk '{print $1}')
LABEL=${API#debateai-preview-api@}; LABEL=${LABEL%.service}
REL=/opt/debateai-v3-preview/releases/auth-dev-candidate-$LABEL-api/dialectical-engine
groupadd --system debateai-preview-social-clients
useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --gid debateai-preview-social-clients debateai-preview-social
install -d -o root -g root -m 0755 /opt/debateai-v3-preview/social
install -o root -g root -m 0644 "$REL/deploy/social/social-relay.mjs" /opt/debateai-v3-preview/social/social-relay.mjs
install -d -o root -g root -m 0700 /etc/debateai-v3-preview/social
install -o root -g root -m 0644 "$REL/deploy/social/debateai-preview-social.service" /etc/systemd/system/debateai-preview-social.service
systemctl daemon-reload
echo "USER_DONE"
```

The program is copied out of the release on purpose: releases are archived, and the archive tool knows only the
Turnstile relay's folder. Part 7 keeps the copy equal to the live release.

## 3. KEY: the key file (the owner runs this one, in a terminal on the server)

Fill in the two public values on the first line; the secret is asked for at a prompt that shows nothing.

```bash
set -euo pipefail; umask 077
CLIENT_ID='<client id>'; APP_SCOPE='<google cloud project id>'
printf '%s' "$CLIENT_ID" | grep -Eq '^[A-Za-z0-9._-]{1,256}$' || { echo "KEY_NOT_DONE: the client ID has an unexpected character"; exit 1; }
printf '%s' "$APP_SCOPE" | grep -Eq '^[A-Za-z0-9._-]{1,256}$' || { echo "KEY_NOT_DONE: the project ID has an unexpected character"; exit 1; }
read -rs -p 'Google client secret: ' SECRET; echo
printf '%s' "$SECRET" | grep -Eq '^[A-Za-z0-9._~-]{8,2048}$' || { echo "KEY_NOT_DONE: the secret has an unexpected character or length"; exit 1; }
F=/etc/debateai-v3-preview/social/providers.json
[ ! -e "$F" ] || { echo "KEY_NOT_DONE: $F is already there: ask"; exit 1; }
printf '{"google":{"clientId":"%s","appScope":"%s","callback":"https://dezbatere.ro/v1/auth/social/google/callback","access":"existing-approved","clientSecret":"%s"}}' "$CLIENT_ID" "$APP_SCOPE" "$SECRET" > "$F"
unset SECRET; chown root:root "$F"; chmod 0600 "$F"
echo "KEY_DONE"
```

`access: existing-approved` is your statement that the Google registration exists and is approved for this site.

## 4. RELAY: start the relay and see that it holds its socket

```bash
set -euo pipefail
systemctl enable --now debateai-preview-social.service
sleep 2
[ "$(systemctl is-active debateai-preview-social.service)" = active ] || { journalctl -u debateai-preview-social.service -n 5 --no-pager -o cat; echo "RELAY_NOT_DONE: the relay did not start (SOCIAL_RELAY_STARTUP_FAILED means the key file or its custody was refused)"; exit 1; }
[ "$(stat -c '%U:%G %a' /run/debateai-social)" = "debateai-preview-social:debateai-preview-social-clients 750" ] || { echo "RELAY_NOT_DONE: unexpected socket folder"; exit 1; }
[ "$(stat -c '%U:%G %a' /run/debateai-social/identity.sock)" = "debateai-preview-social:debateai-preview-social-clients 660" ] || { echo "RELAY_NOT_DONE: unexpected socket"; exit 1; }
echo "RELAY_DONE"
```

Nothing uses the relay yet: the API is not in its group and has no settings line.

## 5. API: let the API reach the relay, add the two settings lines, restart the API

This restarts the API once. Sign-ins and new questions wait a few seconds; running debates are the runner's and go on.

```bash
set -euo pipefail
CLIENT_ID='<client id>'; APP_SCOPE='<google cloud project id>'
API=$(systemctl list-units --plain --no-legend --state=active 'debateai-preview-api@*.service' | awk '{print $1}')
LABEL=${API#debateai-preview-api@}; LABEL=${LABEL%.service}
ENVF=/etc/debateai-v3-preview/auth-dev-v1/api-$LABEL.env
grep -q "\"clientId\":\"$CLIENT_ID\",\"appScope\":\"$APP_SCOPE\"" /etc/debateai-v3-preview/social/providers.json || { echo "API_NOT_DONE: these two values are not the key file's"; exit 1; }
[ "$(grep -c '^SOCIAL_' "$ENVF" || true)" = 0 ] || { echo "API_NOT_DONE: SOCIAL_ lines already there: ask"; exit 1; }
install -d -o root -g root -m 0700 /root/social-install
cp -p "$ENVF" "/root/social-install/api-$LABEL.env.before"
printf '[Service]\nSupplementaryGroups=debateai-preview-social-clients\n' > /etc/systemd/system/debateai-preview-api@.service.d/70-social-clients.conf
[ -z "$(tail -c1 "$ENVF")" ] || echo >> "$ENVF"
printf 'SOCIAL_SOCKET_PATH=/run/debateai-social/identity.sock\nSOCIAL_PROVIDERS_JSON=[{"provider":"google","clientId":"%s","appScope":"%s","access":"existing-approved"}]\n' "$CLIENT_ID" "$APP_SCOPE" >> "$ENVF"
systemctl daemon-reload
systemctl restart "$API"
sleep 8
[ "$(systemctl is-active "$API")" = active ] || { echo "API_NOT_DONE: the API did not come back: run part 8 (UNDO) now"; exit 1; }
journalctl -u "$API" --since '-1min' --no-pager -o cat | grep -q 'SOCIAL_CONFIGURATION_INVALID' && { echo "API_NOT_DONE: the API refused the settings line (it runs, with no provider): ask"; exit 1; }
echo "API_DONE"
```

The settings file is copied line for line into every later release's own file (`release-env.mjs derive`), so the two
lines travel with each upload. The copy taken before the change is `/root/social-install/api-<label>.env.before`.

## 6. LOOK: from a browser

1. Open `https://dezbatere.ro/login`: a "Continue with Google" button is there.
2. Press it, choose an account at Google, come back: the site shows the "finish signing in" step (a new person) or
   signs you in (an account already linked).
3. Press it again and press Cancel at Google: you land on the sign-in page with "Sign-in could not be completed."

If the button is missing, the relay and the API disagree on one of client ID, project ID or the return address; the
server then offers no provider. Compare part 3's and part 5's two values.

## 7. After every upload: SAME

Run after a new release is current. It says whether the relay's program is still the live release's.

```bash
set -euo pipefail
API=$(systemctl list-units --plain --no-legend --state=active 'debateai-preview-api@*.service' | awk '{print $1}')
LABEL=${API#debateai-preview-api@}; LABEL=${LABEL%.service}
REL=/opt/debateai-v3-preview/releases/auth-dev-candidate-$LABEL-api/dialectical-engine
if cmp -s "$REL/deploy/social/social-relay.mjs" /opt/debateai-v3-preview/social/social-relay.mjs; then echo "SAME_DONE"; else echo "SAME_NOT_DONE: the release carries a newer relay program: ask (copy it as in part 2, then restart debateai-preview-social.service)"; fi
```

## 8. UNDO: switch it off

```bash
set -euo pipefail
API=$(systemctl list-units --plain --no-legend 'debateai-preview-api@*.service' | awk '{print $1}' | head -1)
LABEL=${API#debateai-preview-api@}; LABEL=${LABEL%.service}
ENVF=/etc/debateai-v3-preview/auth-dev-v1/api-$LABEL.env
sed -i '/^SOCIAL_SOCKET_PATH=/d;/^SOCIAL_PROVIDERS_JSON=/d' "$ENVF"
rm -f /etc/systemd/system/debateai-preview-api@.service.d/70-social-clients.conf
systemctl daemon-reload
systemctl restart "$API"
sleep 8
[ "$(systemctl is-active "$API")" = active ] || { echo "UNDO_NOT_DONE: the API did not come back: ask"; exit 1; }
systemctl disable --now debateai-preview-social.service
echo "UNDO_DONE"
```

The button is gone on the next page load. Accounts already linked to Google keep their link and their other ways to
sign in. The user, group, key file and program stay; removing them is a separate, deliberate step.

## The relay's way out to the Internet (owner ruling 2026-11-24)

Like the Turnstile relay, this unit is closed in by systemd (no access to keys, databases or settings) but may open
connections to any address; its code calls only Google's fixed addresses. `deploy/social/README.md` asks for a host
firewall rule before enablement. The owner ruled on 2026-11-24: **no firewall rule, the same as the Turnstile relay.**
Google's address ranges change, and a stale rule would break sign-in.

## What this guide does not settle

- **Apple and X.** Apple returns by form post, an address the website does not answer yet. X needs its own
  registration. Facebook stays disabled in code.
- **A test of this guide.** These blocks were written from a read of the server and have not been run.
