// Daily member summary. Every Mac that has ever reported is a member and stays counted while its Mac sleeps or
// is off; only a signed deletion removes it. Each member contributes its most recent daily reading, one vote each.
// Members report once after install and then at most once per 24 hours, so there is no "live" view.
export const DAY=86400000;
const median=v=>{if(!v.length)return null;const s=[...v].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;};
function summarize(rows){
 if(!rows.length)return null;
 return {members:rows.length,medianUsed:Math.floor(median(rows.map(r=>r.used))/5)*5,atLimit:Math.round(100*rows.filter(r=>r.used>=100).length/rows.length),updatedAt:rows.reduce((t,r)=>Math.max(t,r.observed),0)};
}
/** members: [{install, first_seen, last_seen}]; latest: [{install, provider, kind, used, observed}] (one row per install/provider/kind). */
export function computeMembers(members,latest,now){
 const providers={};
 for(const provider of ['claude','codex']){
  const mine=new Map();for(const r of latest)if(r.provider===provider&&r.kind==='five_hour'&&Number.isFinite(r.used)&&r.observed<=now+60000)mine.set(r.install,r);
  providers[provider]=summarize([...mine.values()]);
 }
 return {schema:2,method:'daily-members-v1',generatedAt:now,cadenceHours:24,members:members.length,
  joinedToday:members.filter(m=>m.first_seen>=now-DAY).length,checkedInToday:members.filter(m=>m.last_seen>=now-DAY).length,providers};
}
