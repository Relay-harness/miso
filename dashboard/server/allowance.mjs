import {createHash, createPublicKey, verify} from 'node:crypto';

export const DAY = 86400000;
export const ALLOWANCE_RETENTION = 7 * DAY;
export const ALLOWANCE_METHOD = 'paired-controlled-workload-v1';
const WINDOW = {five_hour: 18000000, weekly: 604800000};
const MODELS = {claude: ['sonnet-4', 'sonnet-4-5', 'sonnet-4-6', 'opus-4', 'opus-4-1', 'opus-4-5', 'opus-4-6', 'haiku-4-5'], codex: ['gpt-5-codex', 'gpt-5-1-codex', 'gpt-5-2-codex', 'gpt-5-3-codex']};
export const CALIBRATION_PLANS = {claude: ['pro', 'max_5x', 'max_20x'], codex: ['plus']};
const PLANS = CALIBRATION_PLANS;
const METRICS = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'toolCalls'];
export class AllowanceError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const fail = (message, status) => { throw new AllowanceError(message, status); };
const exact = (value, keys) => {
 if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) fail('Unexpected or missing calibration fields');
};
const integer = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
const finite = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;

// Separate explicit protocol: legacy usage reports and daily token totals cannot enter this estimator.
export function authenticateAllowance(raw, signature, now) {
 let report; try { report = JSON.parse(raw); } catch { fail('Invalid JSON'); }
 exact(report, ['version', 'publicKey', 'nonce', 'sentAt', 'provider', 'plan', 'series', 'measurement']);
 if (report.version !== 1 || !integer(report.sentAt, now - 120000, now + 120000) || typeof report.nonce !== 'string' || !/^[-a-zA-Z0-9]{16,64}$/.test(report.nonce)) fail('Invalid calibration envelope');
 if (!Object.hasOwn(PLANS, report.provider) || !PLANS[report.provider].includes(report.plan)) fail('Known provider and declared plan required');
 if (typeof report.series !== 'string' || !/^[-a-zA-Z0-9]{16,64}$/.test(report.series)) fail('Stable pseudonymous account series required');
 const decode = (s, n) => {
  if (typeof s !== 'string') fail('Invalid signing material');
  const b = Buffer.from(s, 'base64'); if (b.length !== n || b.toString('base64') !== s) fail('Invalid signing material'); return b;
 };
 const key = decode(report.publicKey, 32), sig = decode(signature, 64);
 const publicKey = createPublicKey({key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), key]), format: 'der', type: 'spki'});
 if (!verify(null, Buffer.from(raw), publicKey, sig)) fail('Signature did not verify', 401);
 validateMeasurement(report.measurement, report.provider, now);
 return {report, install: createHash('sha256').update(key).digest('hex')};
}

export function validateMeasurement(m, provider, now) {
 exact(m, ['kind', 'model', 'contextBand', 'protocol', 'startAt', 'endAt', 'resetsAt', 'startUsed', 'endUsed', 'resolutionPercent', 'exclusive', 'complete', 'workload']);
 if (!Object.hasOwn(WINDOW, m.kind) || !MODELS[provider]?.includes(m.model) || !['short', 'medium', 'long'].includes(m.contextBand) || !['controlled-v1', 'claude-sort-v1'].includes(m.protocol)) fail('Unsupported calibration stratum');
 if (m.exclusive !== true || m.complete !== true) fail('Complete, exclusive workload coverage must be explicitly confirmed', 422);
 if (![m.startAt, m.endAt, m.resetsAt].every(t => integer(t, 0, now + WINDOW[m.kind])) || m.startAt % 300000 || m.endAt % 300000 || m.resetsAt % 300000) fail('Coarse calibration timestamps required');
 if (m.endAt > now + 60000 || now - m.endAt > 600000 || m.endAt - m.startAt < 300000 || m.endAt - m.startAt > 3600000 || m.resetsAt <= m.endAt || m.resetsAt > m.startAt + WINDOW[m.kind] + 300000) fail('Stale, reset-crossing or invalid interval');
 if (!finite(m.startUsed, 5, 90) || !finite(m.endUsed, 5, 90) || !finite(m.resolutionPercent, 0.1, 5) || m.endUsed - m.startUsed < Math.max(10, 4 * m.resolutionPercent)) fail('Insufficient uncensored quota movement', 422);
 exact(m.workload, ['tasks', ...METRICS, 'contextTokens']);
 if (!integer(m.workload.tasks, 1, 10000) || !integer(m.workload.contextTokens, 1, 2000000) || METRICS.some(k => !integer(m.workload[k], 0, 1000000000)) || m.workload.inputTokens + m.workload.outputTokens === 0) fail('Invalid aggregate workload');
 if (m.protocol === 'claude-sort-v1' && (provider !== 'claude' || m.model !== 'sonnet-4-5' || ![6, 12].includes(m.workload.tasks) || m.workload.toolCalls !== 0)) fail('Native sorting protocol requires its fixed Claude model, task counts and no tools');
 const context = m.workload.contextTokens;
 if ((m.contextBand === 'short' && context > 16000) || (m.contextBand === 'medium' && (context <= 16000 || context > 64000)) || (m.contextBand === 'long' && context <= 64000)) fail('Context band does not match workload');
 return m;
}

export function median(values) {
 if (!values.length) return null;
 const sorted = [...values].sort((a,b) => a-b), middle = Math.floor(sorted.length/2);
 return sorted.length % 2 ? sorted[middle] : (sorted[middle-1] + sorted[middle])/2;
}
const efficiency = m => 100 * m.workload.tasks / (m.endUsed - m.startUsed);
const shape = m => Object.fromEntries([...METRICS.map(k => [k, m.workload[k] / m.workload.tasks]), ['contextTokens', m.workload.contextTokens]]);
function comparable(a, b) {
 return Object.keys(a).every(k => a[k] === 0 || b[k] === 0 ? a[k] === b[k] : Math.abs(b[k] / a[k] - 1) <= (k === 'contextTokens' ? 0.05 : 0.1));
}
function logEfficiency(m) {
 // Quota values may each be rounded. Carry their resolution into a conservative ratio interval.
 const delta = m.endUsed - m.startUsed, resolution = m.resolutionPercent;
 return {center: Math.log(efficiency(m)), low: Math.log(100 * m.workload.tasks / (delta + resolution)), high: Math.log(100 * m.workload.tasks / (delta - resolution))};
}
function confidenceInterval(pairs) {
 // Cluster bootstrap: resample installations, never individual requests/intervals.
 // Fixed PRNG makes the result reproducible; ordering is canonicalized by the caller.
 let seed = 0x49ab32;
 const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
 const low = [], high = [];
 for (let iteration = 0; iteration < 2000; iteration++) {
  const sample = Array.from({length: pairs.length}, () => pairs[Math.floor(random() * pairs.length)]);
  low.push(median(sample.map(p => p.low))); high.push(median(sample.map(p => p.high)));
 }
 low.sort((a,b) => a-b); high.sort((a,b) => a-b);
 return [Math.exp(low[49]) * 100, Math.exp(high[1950]) * 100];
}
const round = n => Math.round(n / 5) * 5;

export function aggregateAllowance(rows, now, minimum = 10) {
 const min = Math.max(10, minimum), boundary = now - DAY;
 const strata = new Map();
 for (const row of rows) {
  const m = row.measurement;
  if (m.startAt < now - ALLOWANCE_RETENTION || m.endAt > now || now - m.endAt > ALLOWANCE_RETENTION) continue;
  const key = [row.provider, row.plan, m.kind, m.model, m.contextBand, m.protocol].join(':');
  if (!strata.has(key)) strata.set(key, {provider: row.provider, plan: row.plan, kind: m.kind, model: m.model, contextBand: m.contextBand, protocol: m.protocol, accounts: new Map()});
  const accounts = strata.get(key).accounts, identity = row.install + ':' + row.series;
  if (!accounts.has(identity)) accounts.set(identity, {install: row.install, baseline: [], current: []});
  const account = accounts.get(identity);
  if (m.endAt <= boundary) account.baseline.push(m);
  else if (m.startAt >= boundary) account.current.push(m);
 }
 const eligible = new Set(), cohorts = [];
 for (const stratum of strata.values()) {
  const {accounts, ...metadata} = stratum, byInstall = new Map();
  for (const account of accounts.values()) {
   if (account.baseline.length < 3 || account.current.length < 3) continue;
   const all = [...account.baseline, ...account.current].sort((a,b) => a.startAt-b.startAt);
   // An instrumentation bug or duplicate input must not manufacture multiple experiments.
   if (all.some((m,i) => i > 0 && m.startAt < all[i-1].endAt)) continue;
   const reference = Object.fromEntries(Object.keys(shape(account.baseline[0])).map(k => [k, median(account.baseline.map(m => shape(m)[k]))]));
   const baseline = account.baseline.filter(m => comparable(reference, shape(m)));
   const current = account.current.filter(m => comparable(reference, shape(m)));
   if (baseline.length < 3 || current.length < 3) continue;
   const b = baseline.map(logEfficiency), c = current.map(logEfficiency);
   const pair = {install: account.install, center: median(c.map(v=>v.center))-median(b.map(v=>v.center)), low: median(c.map(v=>v.low))-median(b.map(v=>v.high)), high: median(c.map(v=>v.high))-median(b.map(v=>v.low)), baselineIntervals: baseline.length, currentIntervals: current.length, latest: Math.max(...current.map(m=>m.endAt))};
   // Multiple declared account series on one installation never become extra votes.
   if (!byInstall.has(pair.install) || pair.latest > byInstall.get(pair.install).latest) byInstall.set(pair.install, pair);
  }
  const pairs = [...byInstall.values()].sort((a,b) => a.install.localeCompare(b.install));
  // Do not reveal even the presence of a small plan/model/context subgroup.
  if (pairs.length < min) continue;
  const index = Math.exp(median(pairs.map(p=>p.center))) * 100;
  const rawInterval = confidenceInterval(pairs);
  const interval = [Math.floor(rawInterval[0]/5)*5, Math.ceil(rawInterval[1]/5)*5];
  const status = interval[1] < 85 ? 'decreased' : interval[0] > 115 ? 'increased' : interval[0] >= 85 && interval[1] <= 115 ? 'no_detectable_change' : 'inconclusive';
  for (const p of pairs) eligible.add(p.install);
  cohorts.push({...metadata, status, index: round(index), interval, contributors: pairs.length, baselineIntervals: pairs.reduce((s,p)=>s+p.baselineIntervals,0), currentIntervals: pairs.reduce((s,p)=>s+p.currentIntervals,0), latestAt: Math.max(...pairs.map(p=>p.latest))});
 }
 return {schema: 1, method: ALLOWANCE_METHOD, generatedAt: now, freshnessMinutes: 10, minCohort: min, currentDays: 1, baselineDays: 6, materialChangePercent: 15, reportingInstallations: eligible.size >= min ? eligible.size : null, cohorts, limitations: ['Experimental client-reported effective allowance, not provider-attested limits.', 'Requires complete exclusive workload coverage and matched plan/model/context/task protocol.', 'Current 24 hours compared with preceding six days; no inference from quota used alone.', 'Bootstrap uncertainty does not remove reporting bias, confounding or fabricated installations.']};
}
