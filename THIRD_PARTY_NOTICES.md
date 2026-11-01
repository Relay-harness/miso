# Third-party software

Relay Cat's original Swift code, artwork generator and project tooling are licensed under the root MIT LICENSE. Third-party material retains its own terms.

## CodexBar CLI 0.82.0

- Upstream: https://github.com/steipete/CodexBar
- Release: https://github.com/steipete/CodexBar/releases/tag/v0.82.0
- Pinned archive URL and SHA-256: ThirdParty/CodexBar/dependency.json
- CodexBar MIT license: ThirdParty/CodexBar/LICENSE
- Upstream bundled dependency notices: ThirdParty/CodexBar/THIRD_PARTY_NOTICES

The clean build downloads the upstream arm64 macOS release, verifies its archive hash, and preserves its license and third-party notices in Relay Cat.app/Contents/Resources/QuotaReader. The MIT text was checked against upstream's LICENSE at the pinned release tag. No upstream binary, private provider credentials, downloaded website research, or development-agent skill is committed in this repository. The upstream helper is a binary dependency, not claimed to be rebuilt from source here.

Apple frameworks and SDK tools are supplied by the user's macOS/Apple developer tools under Apple's terms; they are not relicensed by Relay Cat.
