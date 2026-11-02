# Experimental effective-allowance changes

## What is implemented, and what is not

The web dashboard now reads `GET /api/allowance`. It no longer treats median quota **used** as a provider allowance change. `/api/community` and native quota sharing remain available as a separate legacy measurement; no existing reports are converted into calibration evidence.

Implemented: strict signed interval ingestion, persistent SQLite calibration storage, matched historical comparison, uncertainty, cohort suppression, signed deletion, an explicit-consent calibration-export client, synthetic estimator/HTTP/client/browser tests, and an isolated frontend demo.

**Implemented native source:** the updated Mac app now includes a separately consented, user-started Claude Sonnet 4.5 fixed-workload adapter (`Sources/AllowanceCalibration.swift` and `Sources/CalibrationTransport.swift`). It measures a bounded public sorting workload, validates per-task numeric CLI counters against fresh account-matched quota snapshots, and offers a second explicit coverage confirmation before signed upload. It never starts on installation or in the background.

**Not implemented:** passive instrumentation of arbitrary conversations, a native Codex adapter, independent proof of exclusive account activity, provider attestation, or an independently audited real-account study. Existing percentage-used readings and daily local token totals still cannot populate this estimator. No real benchmark was run on the owner's account during implementation; unknown CLI schemas fail closed. Public results remain **Insufficient evidence** until enough valid baseline/current calibrations exist.

No real Anthropic/OpenAI account was used to establish that a limit changed. Passing synthetic tests verifies implementation behavior under the stated measurement assumptions, not real-world causal validity.

## Meaning of the number

For one controlled interval:

```
quota movement = endUsed - startUsed  (percentage points)
effective allowance = tasks / (quota movement / 100)
```

Each matched installation/account series has a historical and recent median log effective allowance:

```
log ratio = median(log recent allowance) - median(log baseline allowance)
public index = exp(median(installation log ratios)) * 100
```

100% means baseline effective allowance. 50% means half the estimated baseline work per full quota window. 150% means one and a half times the baseline. This does NOT mean fraction of quota used, fraction of users blocked, provider server capacity, exact message allowance, or an official quota cut.

The bar scale is 0–200%, with a marker at 100%. Values above 200% keep their numeric value but saturate the visual bar. Numbers are rounded to five points; a positive estimate rounded to zero is displayed as <5%, not a claim of zero allowance. Claude and Codex, five-hour and weekly windows, declared plans, model versions, context bands and controlled task protocol stay separate. The UI never merges plans into an allowance estimate.

## Baseline and eligibility

- Recent period: last 24 hours.
- Historical reference: preceding six days (a rolling baseline, not an immutable original provider allowance).
- Supported initial calibration tiers: Claude `pro`, `max_5x`, `max_20x`, and Codex `plus`. Ambiguous generic Max/Team/Enterprise and other uncalibrated plan variants are rejected, not pooled. Extend the tier list only after an adapter can establish the actual tier.
- Same installation AND stable account series within each comparison. Rotate series when account scope changes; never send a raw account identifier or its digest.
- At least three non-overlapping eligible intervals in EACH period.
- At least 10 independent installation identities in each public stratum (or the configured minimum if higher).
- One installation receives at most one vote per stratum, even with several declared account series.
- Installation participation changes do not replace missing historical baselines with other people's data.
- An insufficient stratum is entirely omitted from the public response, including its presence/name/count. Empty results remain empty.
- Current evidence may be up to 24 hours old; the dashboard shows the latest observation time. API responses older than ten minutes are hidden.

A reported interval must have all account/window activity exclusively covered by instrumentation, a consistent plan/model/protocol throughout, and no reset inside it. These properties are **client-declared**, not independently verified. A boolean does not prove exclusive coverage.

Quota endpoints must be between 5% and 90% to avoid saturation/censoring. Movement must be at least 10 percentage points and at least four times the source's stated percentage resolution. Intervals last 5–60 minutes, arrive within ten minutes, and use five-minute timestamp buckets. Unsupported/unknown model labels are rejected rather than merged. Extend the explicit model allowlist when a new instrumented model revision is supported.

## Workload matching: controlled-v1

This reserved experimental exporter contract requires a repeated, stable controlled task definition, fixed tool behavior/settings, and a consistent model and account plan. `tasks` means repetitions of that same definition, NOT arbitrary messages, arbitrary tasks, requests or total tokens. Current normal app traffic cannot simply be labeled controlled-v1.

Exporters must count all input, output, cache-read and cache-write tokens and tool calls within the interval, plus a consistently measured context size. Counts never become an assumed provider token price or an exact token allowance. The estimator matches each interval's per-task token/cache/tool profile to its installation's baseline median within 10%; context size must match within 5% and the same context band. Zero/nonzero changes do not match. More tasks with the same per-task profile are normalized rather than mistaken for a cut. Different workloads/model/context/plan are excluded.

The new native `claude-sort-v1` source has its own fixed task definition and is grouped separately from generic `controlled-v1` exports. It does NOT prove these requirements for normal Claude/Codex conversations. In particular, browser/mobile activity during a session invalidates exclusive coverage. The user must confirm that no outside activity or account/plan change occurred both before and after the controlled session. This remains client-declared, not independently verified. Do not infer complete coverage from a local session log or run unconfirmed quota-consuming work.

## Uncertainty and status

Use a deterministic 2,000-resample bootstrap across matched INSTALLATIONS, not requests. Resample the installation-level log ratios and take percentile bounds. Each interval also contributes conservative bounds for quota rounding/resolution; these widen the bootstrap bounds. Public bounds round outward to five points before classification.

- `decreased`: entire interval below 85% of baseline.
- `increased`: entire interval above 115%.
- `no_detectable_change`: entire interval inside [85%, 115%]. This is not proof of no change.
- `inconclusive`: supported comparison, but uncertainty crosses a decision boundary.
- Insufficient evidence: no qualifying public stratum.

These uncertainty bounds are conditional on the workload/coverage assumptions. They do not remove observational confounding, provider accounting delay, task difficulty changes, inaccurate declared plans, sample bias, different quota prices, provider-side hidden weighting, or malicious clients. A change means estimated **effective allowance**, not verified change in Anthropic/OpenAI's official denominator. Real-world calibration and false-positive studies are still required.

## Native Claude calibration: how to use it

1. Build the updated app from this source with `python3 Scripts/build.py --offline` if the verified reader is cached. Existing public downloads do not gain this feature remotely.
2. Open `build/Relay Cat.app`. In the cat's settings, choose **Data permissions → Run allowance calibration…**.
3. Read the separate seven-day policy and workload warning. This consumes subscription quota. It is not passive collection. Enter your trusted collector root, such as `http://127.0.0.1:8787` for local testing, and declare the precise Claude tier.
4. Select a hard count of 6 or 12 fixed public sorting tasks. Confirm no other Claude activity will use this account, including browser/mobile/desktop and other CLI sessions.
5. The app first checks a supported first-party Claude subscription sign-in and fresh identified quota. API-key/third-party/unknown auth, missing email identity, wrong account/tier or insufficient safe headroom fail before tasks start.
6. During the bounded session, inspect **Allowance calibration status…** or choose **Stop allowance calibration**. No session starts at launch or repeats automatically. Stop terminates the active child and prevents new work/uploads, but cannot refund quota or undo an already accepted/in-flight provider request.
7. After a valid measured interval, a second dialog asks whether any outside account activity or plan/account change occurred. Confirm and upload, or discard. Timeout, failed tasks, insufficient movement or missing coverage produce no report. Discarding does not refund quota already consumed.
8. Use **Delete calibration reports…** for this separate Keychain identity. Ordinary shared quota reports use a different identity and deletion control.

The source targets the exact `claude-sonnet-4-5-20250929` revision, with a fixed system prompt, one validated sort of 512 public integers per task, tools/MCP/customizations/hooks/Chrome/session persistence disabled, and fixed low effort. Each task must produce the correct complete array, exactly one result turn, one supported model and matching usage/model token counters. No private workspace or transcript is scanned. Unknown CLI capability/schema/model revisions are rejected; no fallback model or guessed counters are accepted. Existing CLI-managed authentication/cache behavior is outside this app's control.

Tasks are paced at no more than one per minute and each command has a 70-second timeout. Sessions normally take about 6–15 minutes. The task count is not a hard token/cost budget or guarantee against reaching a provider limit. Do not keep rerunning just to force visible statistics.

Two distinct, fresh post-work quota observations at least 20 seconds apart must agree. Initial/final CLI subscription identity and quota-reader account digest/scope must match. No reset may occur. Because this reader does not attest finer percentage resolution, the native source conservatively declares five-point resolution and requires **at least 20 quota points of movement** in a window with endpoints between 5 and 90%. Small bounded sessions may produce no eligible window, especially weekly/large-plan windows. That is expected. The source does not force extra tasks, exhaust quota, invent a report or infer a weekly allowance from five-hour evidence. Wide uncertainty may remain inconclusive even after accepted intervals.

A separate native Keychain item stores its signing identity, collector binding, local hashed account scope, declared tier and random series. The local scope digest never goes to the server. It allows the series to persist across app launches for historical pairing and rotates on account/tier change. Raw account emails, provider credentials, prompts, task results and transcript records are not persisted or uploaded by the adapter. Temporary files contain only a restricted reader configuration and are removed when the session finishes.

The native source is experimental and tested with fixtures, actual owned UI interactions, cancellation, and Swift-to-server signatures. Real-provider compatibility/measurement reliability still needs explicit, voluntary participant testing; tests do not prove an actual limit change.

## Signed ingestion

`POST /v1/allowance-reports` requires `Content-Type: application/json` and `X-Miso-Signature` containing an Ed25519 signature over the exact JSON bytes. Request size is bounded to 8 KiB, browser-origin writes are rejected, nonces prevent replay, signatures must verify, and timestamps must be fresh. Overlapping intervals for one installation/provider/window are rejected even if another account series is claimed. No provider credentials belong on the collector.

The envelope contains exactly:

- `version`: 1
- `publicKey`: base64 raw Ed25519 public key
- `nonce`: fresh random UUID
- `sentAt`: epoch milliseconds (within two minutes)
- `provider`: claude or codex
- `plan`: supported, self-declared paid plan
- `series`: random stable account-scope series, 16–64 permitted characters
- `measurement`: fields below

Measurement fields:

| Field | Meaning |
| --- | --- |
| kind | five_hour or weekly |
| model | Supported explicit model revision; see server allowlist |
| contextBand | short (up to 16k), medium (over 16k to 64k), long (over 64k) |
| protocol | controlled-v1 for qualified external exports, or claude-sort-v1 for the native fixed-task source |
| startAt / endAt | Five-minute-bucketed interval boundaries |
| resetsAt | Same non-crossed window reset, five-minute bucket |
| startUsed / endUsed | Locally measured percentages, not estimated from token counts |
| resolutionPercent | Actual source percentage resolution, 0.1–5 |
| exclusive / complete | Must both be true and genuinely established by the exporter |
| workload.tasks | Complete repetitions of the fixed controlled task |
| workload.inputTokens / outputTokens | Aggregate measured interval counts |
| workload.cacheReadTokens / cacheWriteTokens | Separate aggregate measured counts |
| workload.toolCalls | Aggregate measured calls |
| workload.contextTokens | Consistently measured context size for the fixed task |

An export for the supplied client contains exactly `provider`, `plan`, `series`, and `measurement`. No prompts, private workload manifests, filenames, credentials, account IDs, or arbitrary extra fields are accepted.

## Explicit-consent client

From `dashboard/`, use Node 22.13+:

```
node server/calibration-client.mjs --help
node server/calibration-client.mjs --validate /path/to/instrumented-aggregate.json
```

Validation is offline; it neither creates a key nor sends a request. It validates structure and numerical eligibility, NOT whether a self-declared workload truly has exclusive coverage.

Only after a qualified instrumenter exists, the user has read the policy, and coverage is confirmed:

```
node server/calibration-client.mjs   --send /path/to/instrumented-aggregate.json   --server https://YOUR_COLLECTOR_HOST   --identity /path/to/private/calibration-identity.json   --consent calibration-v1   --confirm-complete-exclusive
```

The client generates an Ed25519 identity only after that consent. Its local private key file uses mode 0600; it is not a provider credential. Keep it in an owner-only directory, outside Git. The identity is bound to the configured server. The client does not scan logs, launch workloads, read provider credentials, or upload prompts. It does not automatically submit daily token totals. HTTPS is required outside loopback, and redirects are refused.

Stop by not running the exporter/client. Delete and revoke the identity's reports using:

```
node server/calibration-client.mjs   --delete   --server https://YOUR_COLLECTOR_HOST   --identity /path/to/private/calibration-identity.json
```

Deletion uses the existing signed DELETE protocol. The key is retained on a failed deletion and removed only after server confirmation. The calibration client's identity is separate from the Mac app's Keychain identity. Deleting one does not delete reports under another identity; the server deletes both report types belonging to the identity that signed the request.

## Privacy, retention and operations

Calibration sharing is a separate opt-in protocol and is NOT covered by the Mac app's existing 48-hour usage-sharing consent. Do not retrofit it into those uploads. No native opt-in is changed by this implementation.

- Legacy quota reports: existing 48-hour raw retention.
- New calibration intervals: seven-day raw retention, required for the historical comparison.
- Calibration storage contains hashed installation identity, account-series pseudonym, plan/model/context metadata, interval percentages, and aggregate workload counters. It is linkable pseudonymous data, not anonymous or provider-attested data.
- Signed deletion removes calibration AND legacy reports for that signing identity and invalidates both aggregate caches. Revocation hashes remain for the existing 48-hour replay-protection period.
- No identity hash, account series, per-install intervals or raw workload counts appear in the public API. Public aggregates include group metadata, matched installation count, aggregate interval counts, index, uncertainty, and latest observation time.
- Infrastructure logs, backups, snapshots and deletion/restoration policies remain the operator's responsibility.
- One local SQLite collector process only. Existing reverse-proxy IP rate-limiter and production abuse/load/security review requirements still apply. Signatures do not prevent Sybil clients inventing evidence.

## Reproducible verification

```
npm run build
npm run test:server
DASHBOARD_URL=http://127.0.0.1:8787 npm test
```

The server suite tests true cuts/increases, unchanged allowance, heavier equivalent work, changing workload/model/plan/account/context, missing baseline, small groups, overlap, stale records, noise, resolution uncertainty, changing participant mix, privacy suppression, signature/replay/deletion/retention, actual HTTP ingestion, and the consent-gated command-line client.

Tests use generated synthetic data in memory or temporary test directories. They do not seed the running collector, use provider accounts, access native credentials, or prove any actual provider cut.

Native and cross-language checks from the repository root:

```
python3 Scripts/test.py --native-ui --offline
build/tests/calibration --emit-envelopes build/tests/native-calibration.json
node --experimental-sqlite dashboard/server/native-calibration-check.mjs build/tests/native-calibration.json
```

The last two commands generate 60 public synthetic Swift-signed packets for 10 ephemeral identities and verify a controlled 50% effective-allowance case in an in-memory collector. They never send these packets to the live database.

The frontend demo is `http://localhost:8787/?demo=1`. Its changes, uncertainty intervals and 200 installations are hypothetical fixtures. Live `http://localhost:8787/` does not fall back to them.
