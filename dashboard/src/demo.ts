import type {AllowanceCommunity, AllowanceCohort} from './allowance-data';

// Display-only hypothetical results, not observations of real provider changes.
export function createDemoAllowance(now = Date.now()): AllowanceCommunity {
 const cohorts: AllowanceCohort[] = [];
 for(const provider of ['claude','codex'] as const) for(const kind of ['five_hour','weekly'] as const) {
  const index=provider==='claude'?(kind==='five_hour'?65:70):(kind==='five_hour'?100:125);
  cohorts.push({provider,plan:provider==='claude'?'pro':'plus',kind,model:provider==='claude'?'sonnet-4-5':'gpt-5-2-codex',contextBand:'short',protocol:'controlled-v1',status:provider==='claude'?'decreased':kind==='five_hour'?'no_detectable_change':'increased',index,interval:provider==='claude'?[index-10,index+10]:kind==='five_hour'?[95,105]:[120,135],contributors:200,baselineIntervals:1200,currentIntervals:800,latestAt:now-1800000});
 }
 return {schema:1,method:'paired-controlled-workload-v1',generatedAt:now,freshnessMinutes:10,minCohort:10,currentDays:1,baselineDays:6,materialChangePercent:15,reportingInstallations:200,cohorts,limitations:['Hypothetical sample only. No real limit changes or participants are represented.']};
}
