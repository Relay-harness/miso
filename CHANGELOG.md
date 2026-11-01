# Changelog

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
