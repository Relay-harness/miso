# Miso allowance-change dashboard

**Purpose:** experimental changes in effective subscription allowance, not percentage of quota used. The visible bars read `/api/allowance` and show one of: a cut such as -30%, Normal, extra such as +25%, Unclear, or Not measured yet. The comparison is against the past week. Typical usage is a small line of text and never fills a bar. Claude/Codex, five-hour/weekly, plan/model/context groups stay separate. Estimates require matched historical workload evidence and uncertainty bounds.

**Collection:** the updated native app offers optional **Data permissions → Run allowance calibration…** sessions for Claude Sonnet 4.5. These run 6 or 12 public fixed tasks, consume subscription quota, require exclusive-account confirmation before and after work, and upload only validated numeric intervals. Nothing runs automatically. Ordinary quota uploads/daily totals are still not evidence, and no native Codex adapter is supplied. Small sessions may have insufficient movement and send nothing. Real-provider validation is still required; live estimates need historical data and enough matched installations.

## Run locally

Requires Node 22.13+ (`node:sqlite`; tested with Node 22.23.1).

```
npm ci
npm run build
npm run collector
```

Open http://127.0.0.1:8787 for live results. Open http://127.0.0.1:8787/?demo=1 for clearly labeled hypothetical results. The demo does not upload reports or seed SQLite. The collector serves the UI and uses ignored `.data/community.sqlite` for legacy quota reports and separately consented calibration intervals. Keep the database local and run one collector process.

For Vite development, keep the collector running and run `npm run dev`; `/api` proxies to port 8787.

## Measurement and privacy

Read [the algorithm, protocol, tests, privacy and remaining collection work](../docs/ALLOWANCE_CHANGES.md).

- Recent 24 hours vs preceding six days, paired within installation/account series.
- At least three eligible intervals per period and 10 matched installations per public group.
- Task-normalized workload shape and context must match. Unknown or incomplete data is rejected.
- Bootstrap uncertainty includes conservative quota-resolution bounds. Changes need evidence beyond a 15% material-change boundary.
- All results are experimental, client-reported and pseudonymous—not provider-attested or unique-human counts.
- Legacy quota sharing remains off by default, retains its 48-hour consent/retention, and serves `/api/community`. It is not allowance-change evidence.
- New calibration uses a separate native one-shot consent flow or the explicit-consent `server/calibration-client.mjs`, retains interval counters for seven days, and supports signed deletion. Existing quota-sharing consent does not authorize it.
- The command-line calibration client consumes qualified aggregate exports. The native adapter independently runs a bounded fixed workload through the existing local Claude CLI; no provider credentials are uploaded.

## Interface

The left side contains the GitHub connection link, five-hour/weekly switch, segmented limit-change bars, a concise evidence group/uncertainty line, and matched installation count. There is no Miso navbar. Theme follows the system. Unsupported, small or stale evidence never becomes a numeric estimate. More than one supported plan/model/context group gets an explicit selector; unavailable selections do not silently become another plan.

The right-hand internet feed remains secondary context and is not part of the estimator. It queries public HN/Algolia stories. Those browser requests expose the visitor's IP and search terms to Algolia, not native quota data. X/Reddit remain search links, not ingested streams.

## Checks

```
npm run build
npm run test:server
DASHBOARD_URL=http://127.0.0.1:8787 npm test
```

Browser sources are mocked. Server tests use in-memory databases and temporary calibration-client files. Native account-free fixtures run from the repository root with `python3 Scripts/test.py`. No test logs into a provider, enables native sharing, or creates fake production participants.

Deployment still needs the HTTPS domain, privacy/operator policy, qualified instrumentation, abuse controls, capacity/security review and an updated signed/notarized app release. See [legacy quota sharing](../docs/COMMUNITY_SIGNALS.md) for the separate existing protocol.

## Conversation quality

Both the compact rail and Internet signal use `src/limit-posts.ts`. Targeted Hacker News searches cover the last 90 days. Generic launches, pricing-only posts, bare complaints and API-only throttling do not qualify. Specific limit hits, before/after allowance comparisons and reset-window reports are ranked by detail, discussion support and recency. Popularity does not verify a claim. Source links, author, date and engagement stay visible. No qualifying reports means an empty feed, never unrelated filler or invented evidence. Posts never populate the measured allowance bars.

## Production: throttleindex.com

- **Web page:** Vercel serves the built `dist/` at `https://www.throttleindex.com`. `vercel.json` forwards `/api/*`, `/v1/*` and `/health` to the collector at `https://api.throttleindex.com`, so the page and the Mac app use one address.
- **Collector:** deploy with the Render Blueprint in `render.yaml` (or `dashboard/Dockerfile` on any Docker host) and attach a persistent volume at `/data`. Without the volume, every redeploy deletes all reports. Point `api.throttleindex.com` at it.
- **Environment:** the image sets `MISO_HOST=0.0.0.0`, `MISO_DB=/data/community.sqlite` and `MISO_CLIENT_IP_HEADER=x-real-ip`. The platform sets `PORT`. Rate limiting uses the client address from that header, so only expose the collector behind a proxy that sets it.
- **Mac app:** new builds fill in `https://www.throttleindex.com` as the server. Sharing and calibration still need the user's separate consent.
- **Check:** `curl https://www.throttleindex.com/health` returns `{"ok":true}` when everything is connected.
