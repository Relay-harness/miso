export type PulseSummary={installs:number;atLimit:number;medianUsed:number;latestAt?:number};
export type PulseBucket={start:number;installs:number|null;atLimit:number|null;medianUsed:number|null};
export type PulseProvider={lastKnown?:PulseSummary|null;now:PulseSummary|null;previous:PulseSummary|null;buckets:PulseBucket[];quietest:{startHourUtc:number;hours:number;atLimit:number}|null};
export type Pulse={schema:number;method:string;generatedAt:number;bucketMinutes:number;minInstalls:number;freshnessMinutes?:number;reportingInstallations?:number|null;providers:{claude:PulseProvider;codex:PulseProvider}};
const pct=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100;
const summary=(s:unknown)=>s===null||(!!s&&typeof s==='object'&&Number.isInteger((s as PulseSummary).installs)&&(s as PulseSummary).installs>=1&&pct((s as PulseSummary).atLimit)&&pct((s as PulseSummary).medianUsed)&&((s as PulseSummary).latestAt===undefined||Number.isFinite((s as PulseSummary).latestAt)));
export function isPulse(v:unknown):v is Pulse{
 if(!v||typeof v!=='object')return false;const p=v as Pulse;
 if(p.reportingInstallations!==undefined&&p.reportingInstallations!==null&&(!Number.isInteger(p.reportingInstallations)||p.reportingInstallations<1))return false;
 if(p.schema!==1||p.method!=='opt-in-quota-pressure-v1'||!Number.isFinite(p.generatedAt)||p.bucketMinutes!==30||!Number.isInteger(p.minInstalls)||p.minInstalls<1||!p.providers)return false;
 return (['claude','codex'] as const).every(k=>{const x=p.providers[k];return !!x&&(x.lastKnown===undefined||summary(x.lastKnown))&&summary(x.now)&&summary(x.previous)&&Array.isArray(x.buckets)&&x.buckets.length===48&&x.buckets.every(b=>Number.isFinite(b.start)&&(b.atLimit===null?b.installs===null:pct(b.atLimit)&&Number.isInteger(b.installs)&&b.installs!>=p.minInstalls))&&(x.quietest===null||(Number.isInteger(x.quietest.startHourUtc)&&x.quietest.startHourUtc>=0&&x.quietest.startHourUtc<24&&pct(x.quietest.atLimit)));});
}
// Display-only hypothetical pulse. Never seeded into the collector.
export function createDemoPulse(now=Date.now()):Pulse{
 const end=Math.floor(now/1800000)*1800000+1800000;
 const make=(base:number,peak:number,nowV:number,prevV:number,installs:number):PulseProvider=>{
  const buckets=Array.from({length:48},(_,i)=>{const start=end-(48-i)*1800000;const h=new Date(start).getUTCHours()+new Date(start).getUTCMinutes()/60;const wave=Math.max(0,Math.sin((h-9)/24*2*Math.PI));const v=Math.round(base+(peak-base)*wave+((i*37)%7)-3);return {start,installs:installs-((i*13)%17),atLimit:Math.max(0,Math.min(100,i>=46?(i===47?nowV:prevV):v)),medianUsed:Math.min(99,40+v)};});
  return {now:{installs,atLimit:nowV,medianUsed:62},previous:{installs:installs-4,atLimit:prevV,medianUsed:70},buckets,quietest:{startHourUtc:3,hours:3,atLimit:base}};
 };
 return {schema:1,method:'opt-in-quota-pressure-v1',generatedAt:now,bucketMinutes:30,minInstalls:1,providers:{claude:make(6,48,23,41,142),codex:make(3,18,9,8,96)}};
}
