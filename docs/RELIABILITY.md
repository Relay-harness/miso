# Miso reporting reliability (1.9.4)

## Status contract

- A running menu-bar cat is not proof of sharing consent or successful upload.
- Inline status and **Data permissions → Connection details…** show the actual running version/path, other installed copies, per-provider failures and last server acknowledgements.
- Updating/reconnecting preserves revoked sharing. Never enable it silently to fix an empty website.
- Automatic readers follow individual Claude/Codex process presence. Presence is only a scheduling hint, not proof of interactive use, sign-in, or matching account. Explicit manual optional-provider refresh is separate.
- Only owned helper processes are cancelled. Miso never terminates the user's Claude/Codex process.

## Public display

The live bar is coarse median five-hour usage, not provider capacity or a proven allowance cut. One opted-in installation is enough. Counts are distinct reporting keys in the latest sample, not verified humans or currently online Macs. Current readings must be within ten minutes and have an unexpired reset. Historical bars remain available with **not live** and an observation age. A quota reset cannot remain a current report.

There is no heartbeat. Graceful quit, crash and hard shutdown do not guarantee an immediate server message. Server age/reset expiry is authoritative. Do not label the sampled count “connected.” A future heartbeat feature needs separate design/disclosure; it must not invent usage while idle.

## Transport and identity

Use the canonical operator collector `https://api.throttleindex.com`. Known website-root configurations map to that same collector; custom servers are retained. Numeric signed data retries bounded transient errors while fresh; identical accepted data is idempotent on retry. Stop/sleep cancels pending tasks. Last-success timestamps persist locally and are not credentials.

The ordinary random reporting key is created owner-only in app support. Read/corruption errors do not rotate it. Noninteractive migration of the old Miso Keychain identity either preserves the key or fails with a recovery status; it never opens a password dialog. Legacy deletion that requires authentication is a separately confirmed user action. A distinct active key must not be deleted by that action. Provider credentials are outside this store.

## Install/update limits

**Open at login** is registered only on explicit user action. The update notice copies a Homebrew command or opens release information; it is not an automatic installer. Update-check failures must not say “up to date.” Keep one installed app copy.

Developer ID signing/notarization is blocked until a valid Apple signing identity is supplied. The build remains ad-hoc signed. Provider authentication and optional browser/login-item approvals cannot be bypassed. A maintained signed automatic updater and clean-Mac permission validation remain separate release work.

## Regression gates

Run `python3 Scripts/test.py --native-ui --offline`, dashboard build/browser tests and server tests. Added tests cover owner-only key storage, legacy identity continuity, corruption/symlinks, cancelled helper work, provider-scoped scheduling, mocked HTTP retry/acknowledgement, consent persistence, identical retry ingestion, distinct provider union, expired resets and visibly historical bars. Fixture tests do not prove real-provider or clean-Mac permissions behavior.
