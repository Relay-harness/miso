# Release checklist

## Rename rollout

The GitHub repository is `Relay-harness/miso`. This repository rename does not rename the app bundle, release assets, or the `relay-cat` cask in the separate Homebrew tap. Build new `RelayCat-<version>-macos-arm64.zip` assets containing `Relay Cat.app`; old release archives still contain the old app name and must not be silently replaced. Update the tap URL, app stanza and checksum for the new release. These external changes are not performed by a local source rename.

1. Use the maintainer account with repository write permission. Review LICENSE, ThirdParty notices and the pinned reader hash. Never publish local credentials, raw quota output, research downloads, build logs or old app backups.
2. Update Resources/Info.plist, the About version and CHANGELOG.md. Use a `vMAJOR.MINOR.PATCH` tag matching the public version.
3. In a clean checkout, run `python3 Scripts/check_source.py`, `python3 Scripts/test.py`, and `python3 Scripts/build.py`.
4. On an interactive Apple Silicon desktop, run `python3 Scripts/test.py --native-ui --offline`. Inspect light/dark, populated/unavailable, Stats/back, three-window and short-display layouts. Use synthetic accounts/data for screenshots. A fixture pass is not live provider validation.
5. Run `python3 Scripts/package.py`. Verify the app's strict ad-hoc signature and dist/SHA256SUMS. The build maps source paths to avoid embedding the builder's private home path. Check the distribution contains only the generated app, expected upstream helper/resources and licenses.
6. Ensure CI passes for the exact release commit. Create an annotated tag and push it; create a GitHub release with the ZIP and SHA256SUMS, matching the tested commit. Mark preview releases as prerelease.
7. State clearly: Apple Silicon macOS 14+, ad-hoc signed, **not notarized**, no guarantee of provider availability. Publish known limitations and the source commit. Do not describe checksum validation as Developer ID signing or notarization.

Developer ID signing/notarization requires the owner's Apple developer identity and is a separate optional distribution step. No signing identity, certificate, private key or Apple credential belongs in this repository. No unattended release script will upload credentials or notarize on the maintainer's behalf.

Dependency updates require independent verification of the upstream archive SHA-256 and applicable licenses/notices. Dependabot covers GitHub Actions; this custom helper manifest needs maintainer review rather than an assumed automatic CVE feed.

## Homebrew tap update

After publishing and verifying the release assets, update `Casks/relay-cat.rb` in https://github.com/Relay-harness/homebrew-tap with the new version and independently checked ZIP SHA-256. Preserve the immutable release URL, Apple Silicon/macOS minimum, quarantine behavior and honest notarization caveat. Run the tap style/audit/download checks and wait for CI. Keep preview updates manual until a stable-release policy is defined. Never mutate a released ZIP silently or add a postflight security bypass. The app release and Homebrew tap are separate repositories; publishing one does not update the other automatically.
