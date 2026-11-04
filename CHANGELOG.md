# Changelog

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
