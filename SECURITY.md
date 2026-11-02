# Security policy

## Supported versions

Security fixes target the latest public preview/release on the default branch. Earlier local development builds are not supported. Provider compatibility may change independently of Relay Cat releases.

## Private vulnerability reports

Use [GitHub private vulnerability reporting](https://github.com/Relay-harness/miso/security/advisories/new). Do not open a public issue with credentials, account identifiers, cookies, private conversation content, or an exploitable secret. If GitHub's private report form is unavailable, do not post the sensitive details publicly; use GitHub Support's reporting flow and ask that the repository owner be contacted.

Describe affected version/OS, impact, reproduction steps with synthetic data, and any proposed mitigation. The maintainer aims to acknowledge reports within seven days, but this volunteer project cannot promise a response or fix deadline. Coordinate disclosure privately; do not test against accounts or systems you do not own or have permission to test.

## Boundaries

Relay Cat runs as the local macOS user and is not sandboxed as an untrusted-code execution boundary. It can invoke an upstream helper/owner CLIs and access approved local provider state. The helper is pinned and checksum-verified at build time; upstream behavior remains a supply-chain dependency. Do not use an untrusted modified bundle.

The reader uses argument arrays, a restricted environment, a four-MiB output cap and bounded subprocess deadlines. This reduces risk; it is not a full security certification. A local process with equivalent user privileges may still modify preferences/files or access that user's data.

No provider API key, OAuth token, browser cookie, or sandbox credential belongs in source, issues, screenshots, logs, release assets, or environment examples. Use the provider's supported login flow, not shared credentials. See PRIVACY.md for consent and third-party caveats.

Public preview binaries are ad-hoc signed, not Developer ID signed/notarized. SHA256SUMS detects changes only when obtained from a trusted repository/release; it does not independently establish publisher identity.
