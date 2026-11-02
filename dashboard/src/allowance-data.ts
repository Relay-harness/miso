export type WindowKind = 'five_hour' | 'weekly';
export type AllowanceStatus = 'insufficient' | 'decreased' | 'increased' | 'no_detectable_change' | 'inconclusive';
export type AllowanceCohort = {
 provider: 'claude' | 'codex'; plan: string; kind: WindowKind; model: string; contextBand: string; protocol: string;
 status: AllowanceStatus; index: number | null; interval: [number,number] | null; contributors: number | null;
 baselineIntervals: number | null; currentIntervals: number | null; latestAt: number | null;
};
export type AllowanceCommunity = {
 schema: number; method: string; generatedAt: number; freshnessMinutes: number; minCohort: number;
 currentDays: number; baselineDays: number; materialChangePercent: number;
 reportingInstallations: number | null; cohorts: AllowanceCohort[]; limitations: string[];
};
export function isAllowanceCommunity(value: unknown): value is AllowanceCommunity {
 if(!value || typeof value!=='object') return false;
 const v=value as AllowanceCommunity;
 if(v.schema!==1 || v.method!=='paired-controlled-workload-v1' || !Number.isFinite(v.generatedAt) || v.freshnessMinutes!==10 || !Number.isInteger(v.minCohort) || v.minCohort<10 || v.currentDays!==1 || v.baselineDays!==6 || v.materialChangePercent!==15 || !Array.isArray(v.cohorts) || !Array.isArray(v.limitations)) return false;
 if(v.reportingInstallations!==null && (!Number.isInteger(v.reportingInstallations) || v.reportingInstallations<v.minCohort)) return false;
 return v.cohorts.every(c=>{
  if(!c || !['claude','codex'].includes(c.provider) || !['five_hour','weekly'].includes(c.kind) || typeof c.plan!=='string' || typeof c.model!=='string' || !['short','medium','long'].includes(c.contextBand) || !['controlled-v1','claude-sort-v1'].includes(c.protocol) || !['insufficient','decreased','increased','no_detectable_change','inconclusive'].includes(c.status)) return false;
  if(c.protocol==='claude-sort-v1' && (c.provider!=='claude' || c.model!=='sonnet-4-5')) return false;
  if(c.status==='insufficient') return c.index===null && c.interval===null && c.contributors===null;
  if(typeof c.index!=='number' || !Number.isFinite(c.index) || c.index<0 || !Array.isArray(c.interval) || c.interval.length!==2 || !c.interval.every(n=>typeof n==='number' && Number.isFinite(n) && n>=0) || c.interval[0]>c.interval[1]) return false;
  const n=c.contributors;
  if(n===null || !Number.isInteger(n) || n<v.minCohort || c.baselineIntervals===null || c.currentIntervals===null || !Number.isInteger(c.baselineIntervals) || !Number.isInteger(c.currentIntervals) || c.baselineIntervals<3*n || c.currentIntervals<3*n || typeof c.latestAt!=='number' || !Number.isFinite(c.latestAt) || c.latestAt>v.generatedAt || c.latestAt<v.generatedAt-86400000) return false;
  const expected=c.interval[1]<85?'decreased':c.interval[0]>115?'increased':c.interval[0]>=85&&c.interval[1]<=115?'no_detectable_change':'inconclusive';
  return c.status===expected;
 });
}
