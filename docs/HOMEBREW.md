# Homebrew installation


## Install and launch

Install [Homebrew](https://brew.sh/) first if needed. Relay Cat currently needs Apple Silicon and macOS 14+.

```sh
brew install --cask relay-harness/tap/relay-cat
```

The fully qualified cask name automatically registers [Relay-harness/homebrew-tap](https://github.com/Relay-harness/homebrew-tap). The cask downloads the versioned release ZIP and verifies its pinned SHA-256 before installing Miso.app. It does not compile the app, log in, launch it, or read provider accounts.

Quit any older Miso copy and open **Miso** from Applications. If you want a per-user install instead, use:

```sh
brew install --cask --appdir="$HOME/Applications" relay-harness/tap/relay-cat
```

Do not run both public and earlier private Miso copies at once. Public builds use `org.relayharness.relay-cat` and require their own data-permission approval; existing provider CLI sign-ins remain owned by those CLIs.

## Why macOS still says “not verified”

Homebrew is a package manager, not Apple notarization. The current preview is **ad-hoc signed, not Developer ID signed or notarized**. Download checksum verification helps detect a mismatched archive, but does not independently prove publisher identity. The cask preserves quarantine and does not disable Gatekeeper or approve the app for you.

If the warning is that Apple cannot check Relay Cat for malicious software:

1. Review the source, release notes and checksum before deciding whether to trust it.
2. Try opening Relay Cat once, then dismiss the unverified-developer warning.
3. Only if you trust the build, open **System Settings → Privacy & Security**, find the blocked Miso entry and choose **Open Anyway**.
4. Authenticate if asked, then confirm **Open**.

The override may appear only shortly after the blocked launch. Control-click → Open alone may not work on newer macOS. Managed Macs may require administrator approval. See [Apple’s guidance](https://support.apple.com/102445).

**Do not override an alert that says the app contains malware or will damage your computer.** Stop and report it privately through SECURITY.md. Do not disable Gatekeeper or remove quarantine recursively to avoid a warning.

## Updates and removal

Quit Miso before updating:

```sh
brew update
brew upgrade --cask relay-harness/tap/relay-cat
```

The maintainer must publish each new version/checksum to the tap; Homebrew cannot discover an unlisted preview automatically. Ad-hoc signature changes can require another manual approval.

```sh
brew uninstall --cask relay-cat
```

Uninstall removes only the Homebrew-managed app. No zap operation is configured: preferences, shared helper config, provider credentials and manually installed copies are not erased. Optional non-secret cleanup is described in PRIVACY.md.

## Troubleshooting

- **There is already an App at …**: quit the existing app and move the old manual copy somewhere safe, then retry. Do not use `--force` blindly.
- **Intel Mac or macOS older than 14**: the current cask cannot run on this system; there is no Intel/universal binary yet.
- **Checksum mismatch**: stop. Do not bypass SHA verification. Report the release version and redacted error to the tap maintainer.
- **Download/tap lookup fails**: check connectivity and `brew update`; report package-manager errors in the tap repository, application bugs in relay-cat.
- **Quota is unavailable**: installation does not grant data access or authenticate providers. Use Connect, the separate permission prompts, and docs/PROVIDERS.md.

### Homebrew 7 cask trust

The fully qualified install command automatically records trust for this specific cask. Standalone `brew info`, `brew fetch` or `brew audit` commands can refuse an untrusted third-party cask before installation. After reviewing the cask, Homebrew 7 users can run `brew trust --cask relay-harness/tap/relay-cat` to authorize only its package definition. Do not trust all taps as a workaround. This is separate from Apple verification and does not disable Gatekeeper. Earlier Homebrew versions may not have the trust command.

## Connection and update status

The popover footer shows the sharing state, per-provider upload status and last server acknowledgement; the menu's **Share usage with throttleindex** checkbox shows whether sharing is on. A cat in the menu bar does not by itself mean website sharing is on.

Keep one managed copy. If a manual copy in `~/Applications` coexists with the Homebrew copy in `/Applications`, quit both and choose which installation to keep before updating. Do not delete preferences or reporting keys to fix an app-path issue.

The current app's update action copies the Homebrew command or opens release information. It is not an automatic verified installer. A failed update check is shown as a failure, not “up to date.” **Open at login** is optional and is registered only when you select it; macOS can ask for approval of that explicit login-item setting.

Developer ID signing and notarization are still pending a valid signing identity. No release disables Gatekeeper, clears quarantine, or grants provider/browser access automatically.
