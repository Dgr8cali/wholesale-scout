---
title: Signing in
summary: Sign in with a passkey (Face ID, Touch ID, Windows Hello) or an emailed link; manage your devices, passkeys and the extension's tokens in Settings → Security.
synonyms: [login, log in, sign in, passkey, face id, touch id, windows hello, magic link, email link, sign out, devices, sessions, api token, extension token, app password, locked out]
route: /login
order: 2
workspace: general
---
Wholesale Scout opens only for the addresses on its allowlist (`AUTH_ALLOWED_EMAILS` on the server); there's no sign-up. Every page and API call needs you signed in, except this sign-in page.

## Sign in

- **Sign in with passkey**: the main way. Your device asks for Face ID, Touch ID or Windows Hello, and you're in. Nothing to type, no password, no email needed.
- **Email me a sign-in link**: the backup. Enter your address and a link arrives. It works once, for 15 minutes; open it and press **Continue signing in**. It needs the server's email set up (`RESEND_API_KEY`); until then the page says so, and passkeys still work.
- **App password**: shown only until your first passkey is added, so you can get in to add it. After that it's off, unless the emergency fallback is switched on (below).

After signing in you land on the page you asked for. A device stays signed in for 90 days after you last used it; each use starts the 90 days again.

Ten sign-in attempts in 10 minutes from one address are refused for the rest of the 10 minutes ("Too many sign-in attempts").

## Add a passkey (Mac, iPhone, another computer)

Add one on each device you sign in from:

1. Sign in on that device (by email link, or with a passkey synced to it).
2. Open **Settings → Security**.
3. Optionally give it a name (e.g. "iPhone"), then press **Add a passkey on this device** and confirm with Face ID or Touch ID.

A passkey saved to iCloud Keychain also appears on your other Apple devices signed in to the same Apple ID ("synced" in the list), so adding it on your Mac in Safari or Chrome often covers your iPhone too. On a phone, a passkey from another device also works by scanning the QR code your computer shows.

**Remove** takes a passkey off (a lost phone's). Your last passkey can't be removed: add another first.

## Devices and signing out

**Settings → Security → Signed-in devices** lists every browser signed in: which browser and computer, how it signed in (passkey, email link or app password), when it last did something, and its address. **Sign out** signs one out; **Sign out everywhere** signs out every browser, this one too (the extension's tokens keep working: revoke those separately).

## The Chrome extension's token

The extension signs in with its own **API token**, not your passkey: see [Set up the Chrome extension](/help/howto/set-up-the-extension). Create one per browser in **Settings → Security → Extension tokens**. It's shown once, opens only the extension's endpoints (not the app's pages or other data), and **Revoke** stops it at once.

## If you're locked out

With no passkey that works and no email set up, on the server:

1. Add `AUTH_PASSWORD_FALLBACK=1` to `~/wholesale-scout/.env` and restart (`make deploy`, or `docker compose -f infra/docker-compose.yml up -d` on the server).
2. Sign in with the app password (`APP_PASSWORD`) on the sign-in page, add a passkey in Settings → Security.
3. Remove the line and restart again.

The fallback also accepts the password as `Authorization: Bearer …` or HTTP Basic, for scripts.
