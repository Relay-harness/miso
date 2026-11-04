# Changelog

## 1.9.4 - Reporting reliability and truthful connection status

- Show inline website state and per-provider last server acknowledgement in Connection details, with running version/path and duplicate app-copy diagnostics.
- Preserve revoked sharing on reconnect/update. Report connection errors instead of swallowing them.
- Scope quota and token workers to the active provider; cancel owned helper processes on pause/revoke/sleep/quit. Add explicit optional Open at login.
- Send native reports directly to the collector, retry transient failures while data is fresh, and accept identical signed retry data idempotently without inflating counts.
- Preserve accessible legacy signing identities without a password prompt. Fail safely on blocked/corrupt storage and offer explicit legacy-report recovery/deletion.
- Exclude reset-expired reports, show distinct recent reporting installations instead of claiming online Macs, and preserve recent live data during short API failures.
- Make update checks distinguish errors from “up to date”; offer Copy Homebrew update command or View release, not a fake automatic installer.
- Developer ID/notarization and a signed automatic installer remain pending. Provider access can still require explicit system approval. No permission is bypassed.

## 1.9.3 - No Keychain prompt for quota sharing

- Community quota sharing now stores its random pseudonymous signing key in an owner-only local app-support file instead of Keychain. Enabling live quotas does not request a Keychain password.

## 1.9.2 - Update and provider activity

- Older Miso versions check the published GitHub release at launch and offer an explicit **Update Miso** button. No update installs automatically.
- Add **Check for updates…** to the menu.
- Quota checks and community uploads run only while a `claude`, `codex`, Claude, or Codex process is active. Miso stays in the menu bar and waits when neither is running.

## 1.9.1 - Miso name, no popup

- Rename the app to Miso (`Miso.app`). Settings, sign-ins and sharing identities carry over.
- Remove the launch invitation popup. Sharing with throttleindex.com turns on when you enable live quotas, as stated in that dialog. Turn it off in Data permissions.

## 1.9.0 - throttleindex.com community dashboard

- Default community server is https://www.throttleindex.com. Quota sharing and calibration stay off until the user agrees.

- Redesign the dashboard as throttleindex: blackletter masthead, light-only theme, Geist type, one Claude and one OpenAI allowance bar with runway and live pressure, a live opt-in pressure endpoint (`/api/pulse`), a contributor count and a single install command.
- Add a one-time, optional contribution invitation after launch, with separate calibration/quota-sharing reviews, a remembered Not now choice, and a manual menu entry. No sharing, identity creation or workload starts from the invitation itself.

- Add separately consented Claude/Codex five-hour and weekly quota sharing, disabled by default.
- Keep provider authentication local; sign minimal coarse reports with a random Keychain Ed25519 identity.
- Add a SQLite collector with validation, replay rejection, deduplication, small-cohort suppression, signed deletion and 48-hour retention.
- Add experimental effective-allowance comparisons with paired historical workloads, independent five-hour/weekly windows, conservative uncertainty and at least 10 matched installations. Ordinary quota percentages are not allowance-change evidence.
- Add separately consented, user-started native Claude fixed-workload calibration with bounded tasks, stop controls, numeric-only uploads and signed deletion. No automatic benchmark or native Codex calibration is enabled.
- Add the React/Vite dashboard, supplied Claude logo, high-signal subscription-limit conversation filtering and a clean source rail. Keep hypothetical demo data separate from live measurements.
- Document pseudonymous trust boundaries, local setup, public-deployment blockers and tests. No public deployment, notarized release or automatic opt-in of existing downloads is included.

## 1.8.1 — Relay Cat rename

- Rename Miso Track to Relay Cat across the app, build, package and docs.
- Use `org.relayharness.relay-cat` for preferences and `~/Library/Application Support/Relay Cat` for helper configuration. Data permissions must be approved again; shared provider sign-ins are unchanged.
- Publish the renamed app as `Relay Cat.app` with `RelayCat-1.8.1-macos-arm64.zip`.

## 1.8.0 — Initial public preview

- Publish the original native menu-bar cat and used-quota dashboard as an MIT-licensed source project.
- Stack provider-reported windows vertically with percentage used, reset countdowns, and the earliest safe pre-reset exhaustion estimate.
- OpenAI/Codex and Claude defaults, optional Gemini/Grok, separate Gemini browser approval and local-token opt-in.
- Preserve HOME/USER/LOGNAME in the restricted owner-CLI environment for correct Claude credential lookup.
- Wake on opening usage; two-second close cooldown; manual wake/nap override; compact native settings.
- Add a clean source-to-app build, pinned/checksum-verified helper, generated icon, fixture tests, publication guard, macOS CI and packaging script.
- Add privacy/security/contribution/support/conduct policies and third-party licensing/provenance.

### Known limits

- Apple Silicon macOS 14+ app; no Intel/universal app distribution.
- Preview binaries are ad-hoc signed, not notarized.
- Exact human messages used/left are not exposed by the quota feed.
- Forecasts are conditional estimates, not guaranteed availability.
- No verified terminal 429 status feed, workspace upload, or E2B connector is included.
- Provider endpoints and CLI output may change or be unavailable for an account.
