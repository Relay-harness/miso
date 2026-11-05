# Community quota signals

> **Dashboard update:** the visible web dashboard now targets experimental effective-allowance changes through a separate calibration protocol. The legacy usage protocol below still works, but percentage-used reports cannot establish provider limit changes. See [ALLOWANCE_CHANGES.md](ALLOWANCE_CHANGES.md) for the estimator, separate seven-day calibration consent/retention, and the optional native Claude fixed-workload adapter and its remaining real-provider validation limits.

## Product purpose

Relay Cat reads a person's subscription quota locally. With separate explicit consent, a new build can send minimal signed measurements to a trusted collector. The global dashboard shows fresh five-hour and weekly cohorts first. Internet posts are secondary context, not substitutes for measurements.

The code does not prove a provider reduced context, identify unique humans, measure provider capacity, or bypass paid service limits. It is a transparency tool, not an account-verification system.

## Local sign-in

- Claude: install/sign into Claude Code with `claude auth login`; confirm local `/usage` works.
- OpenAI: install Codex and run `codex login` with the intended subscription. This is local Codex OAuth, not a dashboard OAuth login and not a universal ChatGPT message/file limit counter.
- Default profiles only, as described in [PROVIDERS.md](PROVIDERS.md).
- Gemini/Grok community uploads and unknown/model-specific/file-upload windows are not supported. They are not guessed from token totals. No files are read by this sharing feature.

Live-quota access and community sharing are on from the first launch, with a one-time notice. An explicit earlier "off" is kept on update.

## Native sharing

Build with `python3 Scripts/build.py --offline` if the pinned reader is already cached, or follow the ordinary build instructions. The artifact is `build/Relay Cat.app` (ad-hoc signed, not a notarized public release).

Sharing starts automatically against `https://api.throttleindex.com` with plan `unknown`. To point a build at a local collector, set the `communityServer` preference (for example `defaults write org.relayharness.relay-cat communityServer http://127.0.0.1:8787`) before first launch. HTTPS is required except for loopback development. Uncheck **Share usage with throttleindex** to stop.

`CommunitySharing.swift` receives only successfully parsed quota readings through `QuotaStore.onFreshReading`. It accepts fresh, noncached Claude/Codex primary/secondary windows with explicit 300- or 10080-minute durations and nonexpired reset metadata. Extra/model-specific/unknown windows are skipped. No raw JSON, title, account digest, email, OAuth credential, token totals, prompt, hostname, or project path is sent.

A random Ed25519 signing key is created in macOS Keychain only after consent. The public key is included in the envelope; the private key never leaves the device. Usage is floored to 5% increments, so 99.9% cannot be mislabeled 100%. Observed/reset timestamps are floored to five-minute buckets. Each payload is signed over its exact JSON bytes. A random per-provider session series rotates at launch/account-scope changes; missing scope rotates it for every reading, disabling longitudinal forecasting. The private account-scope digest itself stays local.

Sharing can be stopped independently of local quota tracking. Signed deletion stops sharing, removes that identity's observations, and revokes the identity server-side to prevent already-in-flight reports from recreating them. Failed deletion retains the key to allow retries. A successful deletion removes the local key; a later opt-in creates a new one. Switching servers requires deleting the previous identity first.

This is **pseudonymous**, not untraceable. The collector can link reports by installation key hash and sees the network address. Reinstalling/removing keys can produce another identity; several installs can belong to one person. Do not label this as a verified number of people.

## Collector and dashboard

Requires Node.js **22.13+** with `node:sqlite` support (the project uses Node 22.23.1). Node 22 prints an experimental SQLite warning. No third-party database or provider credentials are needed.

```sh
cd dashboard
npm ci
npm run build
npm run collector
```

The collector serves the built dashboard at **http://127.0.0.1:8787** and its APIs on the same origin. It creates `.data/community.sqlite`, excluded from source control, with restrictive file creation permissions. It has no seed data. For frontend development, also run `npm run dev`; port 5173 proxies `/api` to the collector.

Configuration:

| Variable | Default | Purpose |
| --- | --- | --- |
| `MISO_HOST` | `127.0.0.1` | Listen address; keep loopback behind TLS proxy |
| `MISO_PORT` | `8787` | HTTP listener |
| `MISO_DB` | `.data/community.sqlite` | Persistent SQLite database |
| `MISO_MIN_COHORT` | `5` | Minimum public cohort; cannot be below 5 |
| `MISO_STATIC_ROOT` | `dist` | Trusted built frontend directory |

Endpoints:

- `POST /v1/reports`: native signed quota envelope; `Content-Type: application/json`, signature in `X-Miso-Signature`.
- `DELETE /v1/reports`: signed action envelope to delete/revoke this identity.
- `GET /api/community`: public aggregate only. Never exposes installation hashes, public keys, per-install readings, raw reset timestamps, or plans tied to identities.
- `GET /health`: process health, not an external provider status check.

There is no OpenAI/Anthropic login on the public dashboard. Owner credentials remain in the owner CLIs' local authentication flow.

## Validation and aggregation algorithm

1. Bound request bodies to 8 KiB, allowlist exact fields, and reject browser-origin writes. No generic relay/proxy URL is accepted.
2. Verify the Ed25519 signature, timestamp tolerance, nonce, supported provider/plan/window, coarse percentages, and plausible nonexpired reset boundary. Reject replayed nonces and duplicate/out-of-order provider buckets.
3. Each Mac reports once right after install, then at most once every 24 hours. Every installation that has ever reported is a **member** and stays counted while its Mac is asleep or off; the collector keeps one latest reading per member/provider/window, so check-ins never become extra votes. `/api/pulse` returns the member count, members who joined or checked in during the last 24 hours, and per provider the member count, median of members' latest five-hour readings (floored to 5%) and the share at 100%. Counts are not downloads, online users, provider accounts, or humans.
4. Group by provider, declared plan, and five-hour/weekly window. All-plan views explicitly mix plans. Hide cohorts smaller than the configured minimum. Suppress at-limit/near-limit percentages if either side of that subgroup contains 1 to minimum-minus-one installations. Percentages are coarse; a small positive supported share is displayed as <5%, not a false 0%, and a non-total high share as >95%, not a false 100%. This is thresholding, not a formal differential-privacy guarantee.
5. Show median quota used, share reporting at least 90% used, share reporting exactly 100% used, median time to reset, and hourly median history where supported. Reported 100% is not independent proof of an active task's 429 or provider-wide outage.
6. Experimental pace: per installation use at least three increasing/comparable readings across ten minutes, same provider/declared-plan/session/reset, in the last hour. Take the median pairwise percentage-per-hour slope (Theil–Sen style). Do not extrapolate across decreasing counters, resets, or expired windows. Keep predictions only if they reach 100% before reset. Public ETA requires the minimum number of eligible installation estimates; display their median rounded to half-hour increments.
7. Members and their latest coarse reading are kept until a signed deletion. Raw observations and replay metadata expire after **48 hours**; revoked identity hashes are kept up to 48 hours to reject old/in-flight replays. Deletion removes active raw observations and checkpoints the SQLite WAL. Backups/reverse-proxy logs require a separate operator policy.

The service keeps short-lived per-IP one-minute rate counters in process memory, swept within about 90 seconds; it does not store IPs in SQLite or log request bodies. Aggregate views are cached for 15 seconds and invalidated immediately after a deletion. History indexing avoids scanning every observation separately for each installation.

## Trust boundary and deployment blockers

A valid installation signature is **not provider attestation**. A modified client can invent quota data or register many keys. Cryptography here prevents third-party mutation/replay of a submitted packet, not Sybil identities, false plans, or a compromised provider reader. The first implementation tests 1,000 synthetic installation identities in an isolated database; this is not a sustained-production load/security certification.

Before a public launch: choose the HTTPS domain, publish the collector operator/retention policy, decide stronger abuse/eligibility controls, review cohort differencing and exposure, capacity-test sustained writes/reads, configure resource limits, backups and deletion policy, and release/notarize the updated app. Keep provider secrets out of the collector. Do not automatically opt users in or seed synthetic participants into the public database.

A minimal TLS reverse proxy configuration is included as `dashboard/server/Caddyfile.example`. Do not enable identifying access logs without an explicit, published retention policy. Deploy one collector process for this initial SQLite implementation; do not share the database over a network filesystem or run separate replicas without redesigning ingestion/replay coordination.

## Checks

```sh
python3 Scripts/test.py
python3 Scripts/build.py --offline
cd dashboard
npm run build
npm test
npm run test:server
```

All test reports are synthetic and isolated. Native fixtures do not read an account or Keychain, log in, or enable sharing. The Swift test encoder can emit a public test envelope with `build/tests/community --emit-envelope`; `server/interop.mjs` validates such an envelope in an in-memory store. Browser quota tests mock responses; real empty-collector checks confirm that no artificial participants were added.
