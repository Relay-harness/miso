# Privacy

## Experimental allowance calibration (separate from native quota sharing)

The web dashboard now estimates changes in effective allowance only from separately consented controlled-workload calibration reports. The current Mac app does **not** automatically collect or upload those reports; its ordinary percentage-used readings and daily local token totals are not valid allowance-change evidence.

The optional `dashboard/server/calibration-client.mjs` accepts a qualified aggregate export supplied by the user. Sending requires a new `calibration-v1` consent flag and confirmation of complete, exclusive workload coverage. Existing native quota-sharing consent does not authorize this protocol. The client does not scan logs, run workloads or read provider credentials. Offline validation neither uploads data nor creates an identity.

Calibration records contain a signing-key-derived installation pseudonym, random account series, declared plan/model/context, interval percentage/reset metadata, and aggregate task/token/cache/tool counters. They contain no prompts, transcript contents, paths, emails, account IDs or provider credentials. They remain linkable, pseudonymous client reports; the collector receives the network address. The separate local client signing key is stored in an owner-only file and is not the native Keychain identity.

Calibration intervals expire after **seven days**, unlike the existing **48-hour** quota-report retention. Signed deletion removes both record types for the signing identity, invalidates public caches, and retains a revocation hash for the existing 48-hour protection period. Different signing identities must be deleted separately. Public allowance results expose only supported aggregate groups (at least 10 matched installations), uncertainty and aggregate sample support, not per-install workload records or identity hashes. Backups/logs require a separate operator retention and restoration policy.

The updated source app adds a separate **Run allowance calibration…** action for a bounded Claude Sonnet 4.5 fixed workload. Each session requires explicit consent, runs only 6 or 12 public sorting tasks (consuming subscription quota), and requires another confirmation before any upload. It never runs on installation, launch, a timer or ordinary quota refresh. A stop control terminates the active command and prevents new work, but cannot refund consumed/in-flight quota. A native Codex adapter is not supplied.

Local CLI authentication and quota JSON are parsed in memory to confirm first-party subscription/account continuity. The adapter does not scan private workspaces or conversations. Raw responses/outputs are discarded; only allowlisted numeric metadata is eligible. Unknown CLI schemas, model fallback, account changes, saturation, resets, incomplete results, moving quota and small percentage changes are rejected. The user must confirm exclusive account use; the app cannot independently verify browser/mobile activity. No ordinary conversation is relabeled a controlled task.

A separate native Keychain item stores the calibration private key, collector binding, hashed local account scope, declared tier and random series so comparisons can persist across launches without uploading an account identifier. Account/tier changes rotate the series. The scope digest does not leave the Mac. The temporary run directory contains only restricted reader configuration and is removed on completion. **Delete calibration reports…** targets this identity; the standalone client and ordinary sharing identity are separate. Synthetic tests and demo results do not verify an actual provider limit change. See [measurement limitations and protocol](docs/ALLOWANCE_CHANGES.md).

## Defaults

The cat and timer work locally without account access. Live quota access, local token statistics, and Gemini browser access and community quota sharing are off until separately approved. No automatic login startup is installed. Relay Cat's inspected application code contains no advertising analytics, keyboard recording, or background workspace upload. Optional community quota telemetry is described below and is off by default.

## Live quotas

After approval, the bundled CodexBar reader contacts enabled providers using existing owner-CLI/default-profile sign-ins. Relay Cat passes explicit HOME, macOS USER/LOGNAME, an allowlisted PATH, its isolated helper config and basic locale/temp settings. It does not pass through API-key/OAuth-token environment variables or custom account profiles. Provider owner CLIs may refresh their own credentials or read usage metadata as part of their normal operation.

OpenAI refers to Codex subscription limits. Gemini refers to app quota and requires separate browser consent; do not assume it is Gemini CLI/API quota. Grok quota is not an API wallet. Provider-private endpoints, account plans, browser support and CLI formats can change.

## Local statistics and browser access

Local statistics require approval to scan supported Claude/Codex local histories for today's numeric input/output totals. These may be incomplete or mixed-account and are not message/remaining-allowance counts. The helper may update its own usage cache or public pricing data. Relay Cat does not persist prompts or transcript text.

Gemini browser-session access is separately approved. Only approve expected helper/browser Safe Storage prompts. Relay Cat does not display cookie values. A denial or unsupported browser leaves quota unavailable.

## Data retained by Relay Cat

Preferences use `org.relayharness.relay-cat`. Non-secret helper config is stored under `~/Library/Application Support/Relay Cat/QuotaReader`. Ordinary quota forecasts, numeric readings, their in-memory account-scope digest, and timer state reset on quit. The separately consented native calibration identity retains its own hashed scope inside Keychain for historical pairing, as described above. Relay Cat does not persist raw quota JSON, account email addresses, OAuth tokens, or conversation content. Original owner CLIs and CodexBar may maintain their own credential/cache state; this policy does not claim to control their independent behavior or telemetry.

## Optional community quota sharing (new source builds)

This is a separate, explicit consent in Settings → Data permissions → Share community quota signals. Merely installing/using Relay Cat, signing into an owner CLI, or enabling local quota access does not enable it. Existing public downloads are not modified remotely.

Only fresh, supported Claude/Codex primary/secondary five-hour and weekly windows are eligible. Uploads contain percentage **used** floored to 5%, reset/observation times floored to five-minute buckets, a self-declared plan, provider/window IDs, a random continuity series, public signing key, nonce and request timestamp. Unknown, model-specific extra windows, file-upload limits, stale/cached readings, failed polls and Gemini/Grok measurements are not sent. No file contents are inspected. Account emails/IDs, local account-scope digests, OAuth tokens, raw reader JSON, prompts, code and token logs are not included.

A random installation signing key is created in macOS Keychain after consent, marked this-device-only. It is not a provider credential. The private key stays local. A random session series rotates on launch/account-scope change; missing scope starts a new series every report. Requests are sent only to the chosen server root over HTTPS (loopback HTTP allowed for development); redirects are rejected, cookies/caches are disabled, and raw responses are not persisted by the sharing client.

**Pseudonymous is not fully anonymous.** The chosen server sees the public key and network address and can link measurements from that installation. In this implementation SQLite retains a hash of the public key, coarse quota values and timestamps, declared plan and random series. It does not store IP addresses; one-minute rate counters use IPs in server memory. Reverse proxies, hosting providers and backups require an operator-specific policy. Signatures do not attest provider truth, unique humans, unique accounts or honest plan declarations.

The collector excludes observations older than ten minutes from current cohorts, hides public cohorts below at least five installations and suppresses small near-limit/at-limit subgroups. These are thresholds, not a formal anonymity or differential-privacy guarantee. Raw observations and replay metadata expire after 48 hours. Revoked installation-key hashes are retained up to 48 hours to prevent in-flight replay after deletion. The public API returns cohort aggregates only.

Stop sharing from Data permissions to prevent further uploads. Already-sent observations are not withdrawn by stopping alone. **Delete my shared readings** sends a signed deletion request, stops sharing, deletes active server observations and checkpoints the active WAL. On confirmation the local signing key is deleted; failed deletion retains it for retry. A new opt-in after successful deletion creates a new identity. Switching servers requires deleting the previous identity first. If the server is unreachable or the key is lost, active observations expire under the server policy; independently configured backups/logs are not controlled by this app. Delete shared readings before uninstalling if immediate withdrawal is required. Uninstalling an app/preferences alone does not automatically remove its Keychain items.

The bundled local development server is not a deployed public service. Read [the protocol and deployment guide](docs/COMMUNITY_SIGNALS.md) and trust the operator before choosing a server. No provider login or provider secret belongs on the global dashboard.

## Public web dashboard

The public page requests aggregated community quota data from its collector origin. It separately fetches public Hacker News stories from hn.algolia.com on page load for the compact source rail and when the full Internet signal is opened, with refreshes every five minutes while visible; Algolia receives the visitor's network address and targeted provider/limit/quota queries with a 90-day date cutoff, not native quota reports or credentials. Public titles and available story text are filtered locally for specific subscription-limit reports; selected posts include source attribution and remain unverified author claims. Reddit/X are outbound search links, not embedded authenticated feeds. There are no advertising analytics or account-login forms in this implementation.

## Revoke and remove

Use Settings → Data permissions to stop future quota reads, token scans, or approved Gemini browser imports. In-flight subprocesses may finish; generation checks prevent revoked results from publishing. Disconnecting Relay Cat does not delete shared provider credentials or log you out of other tools.

Quit and delete Relay Cat.app to remove the app. Optional non-secret cleanup is `defaults delete org.relayharness.relay-cat` and removal of `~/Library/Application Support/Relay Cat`. Do not delete provider CLI credentials unless you intend to log those CLIs out. Use provider/browser session controls to revoke shared authentication.

## Testing and reports

Automated tests and repository screenshots use synthetic data and isolated preferences. Do not include account output, emails, cookies, keys, or private messages in bug reports. A local secret-pattern check is not proof that every possible secret format is absent.
