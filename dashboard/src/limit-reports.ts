// Public posts whose titles mention subscription limits, counted per day by the collector (server/reports.mjs).
// This is how loudly people are talking about limits. It is not the size of any limit.
export type Provider='claude'|'codex';
export type DailyReports={days:number[];total:number;prior:number|null;capped:boolean;sources:string[]};
export type ReportsResponse={schema:1;generatedAt:number;providers:Record<Provider,DailyReports|null>};
const count=(n:unknown)=>Number.isSafeInteger(n)&&(n as number)>=0;
const valid=(r:unknown)=>{
 if(r===null)return true;
 const v=r as DailyReports;
 return !!v&&typeof v==='object'&&Array.isArray(v.days)&&v.days.length===7&&v.days.every(count)&&count(v.total)&&v.total===v.days.reduce((a,b)=>a+b,0)&&(v.prior===null||count(v.prior))&&typeof v.capped==='boolean'&&Array.isArray(v.sources)&&v.sources.length>0&&v.sources.every(s=>s==='GitHub'||s==='Hacker News');
};
export function isReportsResponse(value:unknown):value is ReportsResponse {
 const v=value as ReportsResponse;
 return !!v&&typeof v==='object'&&v.schema===1&&Number.isFinite(v.generatedAt)&&!!v.providers&&valid(v.providers.claude)&&valid(v.providers.codex);
}
export function reportTrend(r:DailyReports):number|null {
 return r.prior?Math.round((r.total-r.prior)/r.prior*100):null;
}
