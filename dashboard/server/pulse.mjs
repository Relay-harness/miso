// Live "pressure" signal from opt-in quota readings. This is NOT allowance-change evidence:
// it shows how hard people are hitting their 5-hour window, not whether the window shrank.
export const PULSE_BUCKET=1800000, PULSE_HOURS=24;
// Readings are floored to 5-minute buckets (up to 4m59s old on arrival) and Macs report every ~5 minutes.
// A 10-minute window left only ~5 minutes of life, so live bars flickered off between reports. 15 minutes covers
// bucket flooring + one polling interval + helper latency.
export const LIVE_WINDOW=900000;
const median=v=>{if(!v.length)return null;const s=[...v].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;};
function summarize(rows,min){
 // One vote per installation: its latest reading inside the slice.
 const latest=new Map();for(const r of rows)if(!latest.has(r.install)||r.observed>latest.get(r.install).observed)latest.set(r.install,r);
 const v=[...latest.values()];if(v.length<min)return null;
 return {installs:v.length,atLimit:Math.round(100*v.filter(r=>r.used>=100).length/v.length),medianUsed:Math.round(median(v.map(r=>r.used))),latestAt:v.reduce((latest,r)=>Math.max(latest,r.observed),0)};
}
export function computePulse(rows,now,min=1){
 const minInstalls=Math.max(1,min),end=Math.floor(now/PULSE_BUCKET)*PULSE_BUCKET+PULSE_BUCKET;
 const current=rows.filter(r=>['claude','codex'].includes(r.provider)&&r.kind==='five_hour'&&r.observed>=now-LIVE_WINDOW&&r.observed<=now&&r.reset>now&&Number.isFinite(r.used));
 const ids=new Set(current.map(r=>r.install));
 const result={schema:1,method:'opt-in-quota-pressure-v1',generatedAt:now,bucketMinutes:30,freshnessMinutes:LIVE_WINDOW/60000,reportingInstallations:ids.size>=minInstalls?ids.size:null,minInstalls,providers:{}};
 for(const provider of ['claude','codex']){
  const mine=rows.filter(r=>r.provider===provider&&r.kind==='five_hour'&&r.observed<=now&&r.reset>r.observed&&Number.isFinite(r.used));
  const slice=(from,to)=>mine.filter(r=>r.observed>=from&&r.observed<to);
  const buckets=[];for(let i=PULSE_HOURS*2;i>0;i--){const start=end-i*PULSE_BUCKET;buckets.push({start,...(summarize(slice(start,start+PULSE_BUCKET),minInstalls)??{installs:null,atLimit:null,medianUsed:null})});}
  // Quietest three-hour stretch by UTC hour of day, over all retained readings (up to 48 hours).
  const byHour=Array.from({length:24},(_,h)=>summarize(mine.filter(r=>new Date(r.observed).getUTCHours()===h),minInstalls));
  let quietest=null;for(let h=0;h<24;h++){const w=[0,1,2].map(k=>byHour[(h+k)%24]);if(w.some(x=>!x))continue;const score=w.reduce((s,x)=>s+x.atLimit,0)/3;if(!quietest||score<quietest.score)quietest={startHourUtc:h,hours:3,score:Math.round(score)};}
  const lastAt=mine.length?mine.reduce((latest,r)=>Math.max(latest,r.observed),0):null;
  const lastKnown=lastAt===null?null:summarize(mine.filter(r=>r.observed>=lastAt-LIVE_WINDOW&&r.reset>lastAt),minInstalls);
  result.providers[provider]={lastKnown,now:summarize(current.filter(r=>r.provider===provider),minInstalls),previous:summarize(slice(now-3600000,now-1800000),minInstalls),buckets,quietest:quietest&&{startHourUtc:quietest.startHourUtc,hours:3,atLimit:quietest.score}};
 }
 return result;
}
