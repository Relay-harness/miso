# Support

Read the README and docs/PROVIDERS.md first. Use GitHub Discussions for setup questions and the issue templates for reproducible bugs/features. Use SECURITY.md for sensitive security reports, not public issues.

Include Relay Cat version, macOS version, architecture, provider and owner-CLI version, plus redacted reproduction steps. Do not post whole auth-status output, raw quota JSON, credentials, cookies, account emails, or conversation logs.

For Claude, a website login is separate from the default Claude Code login. Run `claude auth login`, then refresh Relay Cat. If Terminal works but Relay Cat does not, confirm `whoami`, HOME, executable path and default profile; a cosmetic shell prompt is not proof of a different account. Preserve USER/LOGNAME in diagnostic subprocesses. Never copy shared credentials between accounts to work around a lookup issue.

Quota endpoints and supported plans can change. Unavailable does not mean zero usage. Forecasts need stable account/reset identity and several valid samples. Message counts are not exposed by the current quota feed. Preview support is best-effort, without an SLA.
