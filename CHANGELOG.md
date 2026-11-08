# Changelog

## 1.9.10 - Miso has something to tell you

- Mac app: at 95% of a 5-hour or weekly limit, the menu-bar Miso turns to face you and waves, and a small "click me, hooman" tag appears under it for a few seconds. Nothing opens by itself. Clicking Miso shows a short message from Miso in the usual usage window, at the same size, with Finish in Relay Cloud Sandbox (relayevals.com/resume) and a small Dismiss link. Once per window, no notification permission, and waving stops when Reduce Motion is on.

## 1.9.9 - A heads-up before your limit runs out

- Mac app: when a 5-hour or weekly limit reaches 95%, Miso shows one notification per window suggesting Relay, with an Open relayevals.com button. macOS asks for notification permission the first time. Nothing is sent anywhere.
- Website: the collector reads public GitHub and Hacker News posts about limits, and each bar shows Normal or a stated change such as −30%. A change only shows once 3 separate posts state one in the past 7 days. An announced change from the past 7 days, or Miso's own measurement, takes priority. This is what posts say, not a measurement.

## 1.9.8 - Know when Miso is watching

- Open at login by default, once, for installed copies, so Miso is running when Claude or Codex starts. Unchecking **Open at login** is respected.
- The cat is awake while Claude or Codex runs and asleep otherwise. A chosen nap lasts until that session ends.
- The popover shows a green or grey dot with "Miso is running · watching Claude" or "waiting for Claude or Codex", plus the last website check-in. It no longer says sharing is paused when a provider isn't running.

## 1.9.7 - Daily check-ins and member counts

- Report once right after install, then at most once every 24 hours, even when Claude Code or Codex isn't open. No more live reporting.
- The collector counts every Mac that has ever checked in (members) until a signed deletion, and `/api/pulse` returns member counts plus the median of each member's latest reading.
- The website drops all live wording: it shows the member count, new members today, typical 5-hour usage across members and the share at the limit, refreshing every 10 minutes.

## 1.9.6 - Share by default, live updates within a window

- Read live quotas and share rounded usage with throttleindex.com from the first launch, with a one-time notice that can turn sharing off. Installs that never chose are enrolled on update; an explicit earlier "off" is kept.
- Replace the Data permissions submenu and consent dialogs with one **Share usage with throttleindex** checkbox, plus **Delete my shared readings**. Remove the contribution invitation.
- Let usage that rises within the same five-minute window update the live bars (client resend + collector replacement, still one reading per Mac per window).
- Keep the measurement series stable within a window when the account can't be identified, so those updates are not rejected.
- Keep a collector chosen before first launch instead of overwriting it. The first-run notice points to the gear icon in the popover.

## 1.9.5 - Visible update and refresh, steadier live data

- Show an **Update x.y.z** button in the popover footer when a newer release exists. The update dialog now opens in front of other windows.
- Refresh (button and Cmd-R) and opening the popover now read quotas even when Claude Code or Codex is not running. The open popover refreshes at most once a minute. Automatic background polling still pauses outside provider sessions.
- Make the refresh button always visible and clickable; it shows progress, and opens Connect when quota access is off. Keep the last measured reading visible when the provider app closes.
- Show the dashboard-contribution invitation once on first launch of an updated build, as documented. It never grants consent; declining is remembered.
- Round reset times up so reports in a window's final five minutes are not rejected. Fall back to the default collector if the saved server setting is missing after consent.
- Collector: keep live readings for 15 minutes (5-minute flooring plus one polling interval), refresh the community cache on new reports, and honour the configured read origin.
- Web: re-sync the clock on tab wake so fresh live data is not discarded, honour the server freshness window, show when live data was last checked with a Refresh now button, and ignore self-cancelled allowance requests.

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
