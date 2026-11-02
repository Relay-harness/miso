export type Provider = 'Claude' | 'OpenAI';
export type Region = 'North America' | 'Europe' | 'Asia Pacific';
export type Signal = { id: string; provider: Provider; region: Region; plan: string; kind: '429' | 'latency' | 'ok'; latency: number; time: number };
export const regions: Region[] = ['North America', 'Europe', 'Asia Pacific'];
export const plans = {Claude: ['Pro', 'Max', 'API'], OpenAI: ['Plus', 'Pro', 'API']};
export function makeFixtures(now = Date.now()): Signal[] {
  // Deterministic, synthetic measurements. Never represent provider capacity.
  return Array.from({length: 720}, (_, i) => {
    const provider: Provider = i % 3 === 0 ? 'OpenAI' : 'Claude';
    const region = regions[(i * 7 + Math.floor(i / 5)) % 3];
    const age = i < 120 ? i * 30000 : (i - 119) * 1000000;
    const peak = i % 48 > 17 && i % 48 < 35;
    const limited = provider === 'Claude' ? i % (peak ? 4 : 13) === 0 : i % 29 === 0;
    const slow = !limited && i % 11 === 0;
    return {id: `sample-${i}`, provider, region, plan: plans[provider][i % 3], kind: limited ? '429' : slow ? 'latency' : 'ok', latency: 650 + (i * 83) % 1450 + (provider === 'Claude' ? 800 : 0) + (slow ? 2500 : 0), time: now - age};
  });
}
export function summarize(signals: Signal[]) {
 const limited = signals.filter(s => s.kind === '429').length;
 const sorted = signals.map(s => s.latency).sort((a,b) => a-b);
 return {count: signals.length, limited, rate: signals.length ? limited / signals.length * 100 : 0, median: sorted.length ? (sorted[Math.floor(sorted.length / 2)] + sorted[Math.floor((sorted.length - 1) / 2)]) / 2000 : 0};
}
export const rangeMs = {'1h': 3600000, '24h': 86400000, '7d': 604800000};
export type Range = keyof typeof rangeMs;
export function getTrend(signals: Signal[], now: number, range: Range) {
 const size = rangeMs[range] / 32;
 return Array.from({length:32}, (_,i) => {
  const start = now - rangeMs[range] + i * size;
  return summarize(signals.filter(s => s.time >= start && s.time < start + size));
 });
}
