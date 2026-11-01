# Privacy

## Defaults

The cat and timer work locally without account access. Live quota access, local token statistics, and Gemini browser access are off until separately approved. No automatic login startup is installed. Relay Cat's inspected application code contains no analytics, advertising, keyboard recording, or background workspace upload.

## Live quotas

After approval, the bundled CodexBar reader contacts enabled providers using existing owner-CLI/default-profile sign-ins. Relay Cat passes explicit HOME, macOS USER/LOGNAME, an allowlisted PATH, its isolated helper config and basic locale/temp settings. It does not pass through API-key/OAuth-token environment variables or custom account profiles. Provider owner CLIs may refresh their own credentials or read usage metadata as part of their normal operation.

OpenAI refers to Codex subscription limits. Gemini refers to app quota and requires separate browser consent; do not assume it is Gemini CLI/API quota. Grok quota is not an API wallet. Provider-private endpoints, account plans, browser support and CLI formats can change.

## Local statistics and browser access

Local statistics require approval to scan supported Claude/Codex local histories for today's numeric input/output totals. These may be incomplete or mixed-account and are not message/remaining-allowance counts. The helper may update its own usage cache or public pricing data. Relay Cat does not persist prompts or transcript text.

Gemini browser-session access is separately approved. Only approve expected helper/browser Safe Storage prompts. Relay Cat does not display cookie values. A denial or unsupported browser leaves quota unavailable.

## Data retained by Relay Cat

Preferences use `org.relayharness.relay-cat`. Non-secret helper config is stored under `~/Library/Application Support/Relay Cat/QuotaReader`. Forecasts, numeric readings, a digest of account scope, and timer state are held in memory and reset on quit. Relay Cat does not persist raw quota JSON, account email addresses, OAuth tokens, or conversation content. Original owner CLIs and CodexBar may maintain their own credential/cache state; this policy does not claim to control their independent behavior or telemetry.

## Revoke and remove

Use Settings → Data permissions to stop future quota reads, token scans, or approved Gemini browser imports. In-flight subprocesses may finish; generation checks prevent revoked results from publishing. Disconnecting Relay Cat does not delete shared provider credentials or log you out of other tools.

Quit and delete Relay Cat.app to remove the app. Optional non-secret cleanup is `defaults delete org.relayharness.relay-cat` and removal of `~/Library/Application Support/Relay Cat`. Do not delete provider CLI credentials unless you intend to log those CLIs out. Use provider/browser session controls to revoke shared authentication.

## Testing and reports

Automated tests and repository screenshots use synthetic data and isolated preferences. Do not include account output, emails, cookies, keys, or private messages in bug reports. A local secret-pattern check is not proof that every possible secret format is absent.
