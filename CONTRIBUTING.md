# Contributing

Thanks for helping keep Miso small, native, and honest.

## Before changing code

Read the README, PRIVACY.md, SECURITY.md, and CODE_OF_CONDUCT.md. For a large change, open an issue first. Keep pull requests focused; describe the user-visible result, risks, tests, and any new dependency or data access.

The maintainer is @cicada0007. Contribution to this repository is under its MIT license; preserve upstream copyright and notice requirements. No CLA is currently required. Use a GitHub noreply address if you do not want your email in public Git history.

## Local workflow

```sh
git switch -c fix/short-description
python3 Scripts/test.py
python3 Scripts/build.py
python3 Scripts/test.py --native-ui --offline
```

Python 3.9+ and Apple Command Line Tools are required; no Python dependencies are installed. The app targets Apple Silicon macOS 14+. Core/reader tests are account-free. Native UI tests need an interactive Apple Silicon desktop and briefly display a test popover. Never run them against a private account as a substitute for fixtures.

When changing UI, check populated, unavailable, light, dark, Stats/back, three-window, and short-display states. Verify actual native controls, not just direct model assignment. Preserve the single hosting root and stable geometry during provider changes.

## Required invariants

- Quota percentages are **used**; tokens/API spend/local request counts are not subscription message allowances.
- Missing, stale, synthetic-placeholder, reset-expired, and unscoped readings must not become invented live quota or confident forecasts.
- Forecasts require same-account/window/reset continuity and enough fresh measured movement. Do not lower gates just to show an estimate.
- Keep the owner CLI's HOME/USER/LOGNAME identity while retaining the environment allowlist. Never inherit provider API keys, OAuth-token environment variables, custom profiles, or shell startup scripts silently.
- Quota, local-token, and Gemini browser access keep separate consent/revocation. No new transcript collection, uploading, or monitoring without an explicit design and approval.
- A quota endpoint 429 or 100% usage alone does not prove an active terminal task is frozen.
- Do not add feeding systems, achievements, or elaborate settings panels.

## Dependencies and releases

CodexBar is pinned in ThirdParty/CodexBar/dependency.json. To update it, verify the upstream release's license/notices and published SHA-256, update the manifest and applicable notices, and test the installed helper against fixtures plus an explicitly approved live account where available. Never commit provider credentials or raw account responses. An account-specific success is not universal compatibility.

Follow docs/RELEASING.md for public builds. Ad-hoc signing is not notarization. Keep downloaded binaries, caches, generated app bundles, local logs, research downloads, and development-agent directories out of Git.

## Review

CI must pass. A maintainer reviews changes, particularly permissions, subprocesses, dependencies, and provider assumptions. Include screenshots with synthetic data for visible changes. Report vulnerabilities privately instead of opening a public issue.
