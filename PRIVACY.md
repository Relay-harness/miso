# Privacy

## Sharing with throttleindex.com

Miso turns on quota reading and, from the first launch, sends rounded five-hour and weekly usage percentages to https://www.throttleindex.com once right away and then at most once every 24 hours. It shows a one-time notice saying so. The declared plan is sent as `unknown`. No prompts, files, emails, account IDs or credentials are sent. Turn sharing off anytime by unchecking **Share usage with throttleindex** in Miso's settings menu (gear icon in the popover, or right-click the cat), and use **Delete my shared readings** to remove what was sent. If you previously turned quota access or sharing off, an update keeps that choice. Allowance calibration is never started automatically, because it uses subscription quota.

## Experimental allowance calibration (separate from native quota sharing)

The web dashboard now estimates changes in effective allowance only from separately consented controlled-workload calibration reports. The current Mac app does **not** automatically collect or upload those reports; its ordinary percentage-used readings and daily local token totals are not valid allowance-change evidence.

The optional `dashboard/server/calibration-client.mjs` accepts a qualified aggregate export supplied by the user. Sending requires a new `calibration-v1` consent flag and confirmation of complete, exclusive workload coverage. Existing native quota-sharing consent does not authorize this protocol. The client does not scan logs, run workloads or read provider credentials. Offline validation neither uploads data nor creates an identity.

Calibration records contain a signing-key-derived installation pseudonym, random account series, declared plan/model/context, interval percentage/reset metadata, and aggregate task/token/cache/tool counters. They contain no prompts, transcript contents, paths, emails, account IDs or provider credentials. They remain linkable, pseudonymous client reports; the collector receives the network address. The separate local client signing key is stored in an owner-only file and is not the native Keychain identity.

Calibration intervals expire after **seven days**. Raw quota reports expire after **48 hours**, but each installation's membership (its hashed signing key, first and last check-in times) and its latest coarse reading are kept until that installation's signed deletion. Signed deletion removes both record types for the signing identity, invalidates public caches, and retains a revocation hash for the existing 48-hour protection period. Different signing identities must be deleted separately. Public allowance results expose only supported aggregate groups (at least 10 matched installations), uncertainty and aggregate sample support, not per-install workload records or identity hashes. Backups/logs require a separate operator retention and restoration policy.

The updated source app adds a separate **Run allowance calibration…** action for a bounded Claude Sonnet 4.5 fixed workload. Each session requires explicit consent, runs only 6 or 12 public sorting tasks (consuming subscription quota), and requires another confirmation before any upload. It never runs on installation, launch, a timer or ordinary quota refresh. A stop control terminates the active command and prevents new work, but cannot refund consumed/in-flight quota. A native Codex adapter is not supplied.

Local CLI authentication and quota JSON are parsed in memory to confirm first-party subscription/account continuity. The adapter does not scan private workspaces or conversations. Raw responses/outputs are discarded; only allowlisted numeric metadata is eligible. Unknown CLI schemas, model fallback, account changes, saturation, resets, incomplete results, moving quota and small percentage changes are rejected. The user must confirm exclusive account use; the app cannot independently verify browser/mobile activity. No ordinary conversation is relabeled a controlled task.

A separate native Keychain item stores the calibration private key, collector binding, hashed local account scope, declared tier and random series so comparisons can persist across launches without uploading an account identifier. Account/tier changes rotate the series. The scope digest does not leave the Mac. The temporary run directory contains only restricted reader configuration and is removed on completion. **Delete calibration reports…** targets this identity; the standalone client and ordinary sharing identity are separate. Synthetic tests and demo results do not verify an actual provider limit change. See [measurement limitations and protocol](docs/ALLOWANCE_CHANGES.md).

## Defaults

The cat and timer work locally without account access. Live quota access, local token statistics, and Gemini browser access and community quota sharing are off until separately approved. No automatic login startup is installed. Miso's inspected application code contains no advertising analytics, keyboard recording, or background workspace upload. Optional community quota telemetry is described below and is off by default.

## Live quotas

After approval, the bundled CodexBar reader contacts enabled providers using existing owner-CLI/default-profile sign-ins. Miso passes explicit HOME, macOS USER/LOGNAME, an allowlisted PATH, its isolated helper config and basic locale/temp settings. It does not pass through API-key/OAuth-token environment variables or custom account profiles. Provider owner CLIs may refresh their own credentials or read usage metadata as part of their normal operation.

OpenAI refers to Codex subscription limits. Gemini refers to app quota and requires separate browser consent; do not assume it is Gemini CLI/API quota. Grok quota is not an API wallet. Provider-private endpoints, account plans, browser support and CLI formats can change.

## Local statistics and browser access

Local statistics require approval to scan supported Claude/Codex local histories for today's numeric input/output totals. These may be incomplete or mixed-account and are not message/remaining-allowance counts. The helper may update its own usage cache or public pricing data. Miso does not persist prompts or transcript text.

Gemini browser-session access is separately approved. Only approve expected helper/browser Safe Storage prompts. Miso does not display cookie values. A denial or unsupported browser leaves quota unavailable.

## Data retained by Miso

Preferences use `org.relayharness.relay-cat`. Non-secret helper config is stored under `~/Library/Application Support/Relay Cat/QuotaReader`. Ordinary quota forecasts, numeric readings, their in-memory account-scope digest, and timer state reset on quit. The separately consented native calibration identity retains its own hashed scope inside Keychain for historical pairing, as described above. Miso does not persist raw quota JSON, account email addresses, OAuth tokens, or conversation content. Original owner CLIs and CodexBar may maintain their own credential/cache state; this policy does not claim to control their independent behavior or telemetry.

## Community quota sharing (on by default)

Website sharing and local quota access are on from the first launch, disclosed in a one-time notice. If you previously stopped sharing or turned quota access off, updating preserves that choice. Uncheck **Share usage with throttleindex** in Miso's menu to stop.

Only numeric Claude/Codex standard quota windows are sent: percentages rounded down to steps of 5%, bucketed observation/reset times, a declared plan (or `unknown`), random series and installation public signing key. No credentials, prompts, transcripts, email, account IDs or token logs are uploaded. The collector sees network addresses; reports are pseudonymous, not anonymous.

**There is no live view.** The website counts every Miso installation that has ever checked in (members), including Macs that are asleep or off, and shows the median of each member's latest daily reading. With one member, that member's coarse usage is visible. Counts mean distinct signing identities, not downloads, online Macs or verified people. Provider-wide allowance-change evidence remains a separate calibration system requiring at least ten matched installations.

Ordinary reporting uses a random signing key in `~/Library/Application Support/Relay Cat/Community/signing-v1.key`, created with owner-only permissions. Updates reuse it. If no file exists, Miso tries to migrate its pre-1.9.3 Keychain key without opening authentication UI. If macOS denies that non-interactive migration, reporting stops with a recovery status instead of silently creating another identity. Older reports from a legacy key expire under retention. A corrupt key is not overwritten automatically.

Reports use the canonical collector `https://api.throttleindex.com`; saved `https://www.throttleindex.com` roots refer to that same collector and are mapped to it. Custom collectors are unchanged. HTTPS redirects are rejected. Cookies and URL caches are disabled. Transient failures retry a bounded number of times while the reading is fresh; server acknowledgements, not send attempts, mark a bucket accepted. The app stores per-provider last-acknowledgement timestamps locally, not raw quota responses.

Stopping sharing cancels pending uploads but does not retract earlier accepted data. **Delete my shared readings** signs deletion for the active file identity, and retains the key if the server cannot confirm. Pre-1.9.3 keys that differ from the active key have a separate explicit legacy-deletion action. No unrelated identity is silently erased. Raw quota reports expire after 48 hours; operator logs/backups need their own retention controls. Deleting/uninstalling an app alone does not guarantee immediate server removal.

## Limit reports on the website

Anyone can report how their Claude or OpenAI limit feels on throttleindex.com, with no sign-in. The collector stores the provider, the choice, the date and a salted one-way hash of the network address, used so one network counts once. The network address itself is not stored. Reports and their hashes are deleted after **7 days**. The browser also remembers your choice for that day in local storage. Your report is not linked to Miso or to any account.

## Public web dashboard

The public page requests aggregated community quota data from its collector origin. It separately fetches public Hacker News stories from hn.algolia.com on page load for the compact source rail and when the full Internet signal is opened, with refreshes every five minutes while visible; Algolia receives the visitor's network address and targeted provider/limit/quota queries with a 90-day date cutoff, not native quota reports or credentials. Public titles and available story text are filtered locally for specific subscription-limit reports; selected posts include source attribution and remain unverified author claims. Reddit/X are outbound search links, not embedded authenticated feeds. There are no advertising analytics or account-login forms in this implementation.

## Revoke and remove

Use Miso's settings menu to stop sharing (**Share usage with throttleindex**), token scans (**Local token statistics**) or approved Gemini browser imports. Disconnect live quotas from the popover. In-flight subprocesses may finish; generation checks prevent revoked results from publishing. Disconnecting Miso does not delete shared provider credentials or log you out of other tools.

Quit and delete Miso.app to remove the app. Optional non-secret cleanup is `defaults delete org.relayharness.relay-cat` and removal of `~/Library/Application Support/Miso`. Do not delete provider CLI credentials unless you intend to log those CLIs out. Use provider/browser session controls to revoke shared authentication.

## Testing and reports

Automated tests and repository screenshots use synthetic data and isolated preferences. Do not include account output, emails, cookies, keys, or private messages in bug reports. A local secret-pattern check is not proof that every possible secret format is absent.

## Activity and startup behavior

Automatic Claude/Codex quota and token work is scoped to the detected running provider. An explicit manual refresh can query an approved optional provider; Gemini still requires separate browser approval. Owned helper processes are cancelled on revoke/sleep/quit; this does not terminate the user's Claude/Codex process. Existing network requests may already have reached a provider/server before cancellation.

**Open at login** is turned on once at first launch of an installed copy, so Miso can notice Claude or Codex; unchecking it is respected from then on. macOS shows its own login-item notice and lets you turn it off in System Settings. The cat stays available to detect the next provider session; a website count denotes a recent valid report, not a heartbeat or proof the Mac is online.
