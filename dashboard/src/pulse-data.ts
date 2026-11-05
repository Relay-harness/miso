// Daily member summary from /api/pulse. Every Mac that has ever checked in is counted; each contributes its
// most recent daily reading. There is no live view.
export type MemberSummary={members:number;medianUsed:number;atLimit:number;updatedAt:number};
export type Pulse={schema:2;method:'daily-members-v1';generatedAt:number;cadenceHours:number;members:number;joinedToday:number;checkedInToday:number;providers:{claude:MemberSummary|null;codex:MemberSummary|null}};
const pct=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100;
const count=(n:unknown)=>Number.isInteger(n)&&(n as number)>=0;
const summary=(s:unknown)=>s===null||(!!s&&typeof s==='object'&&Number.isInteger((s as MemberSummary).members)&&(s as MemberSummary).members>=1&&pct((s as MemberSummary).medianUsed)&&pct((s as MemberSummary).atLimit)&&Number.isFinite((s as MemberSummary).updatedAt));
export function isPulse(v:unknown):v is Pulse{
 if(!v||typeof v!=='object')return false;const p=v as Pulse;
 if(p.schema!==2||p.method!=='daily-members-v1'||!Number.isFinite(p.generatedAt)||p.cadenceHours!==24||!count(p.members)||!count(p.joinedToday)||!count(p.checkedInToday)||!p.providers)return false;
 if(p.joinedToday>p.members||p.checkedInToday>p.members)return false;
 return (['claude','codex'] as const).every(k=>summary(p.providers[k])&&(p.providers[k]===null||p.providers[k]!.members<=p.members));
}
// Display-only hypothetical members. Never seeded into the collector.
export function createDemoPulse(now=Date.now()):Pulse{
 return {schema:2,method:'daily-members-v1',generatedAt:now,cadenceHours:24,members:142,joinedToday:9,checkedInToday:61,
  providers:{claude:{members:131,medianUsed:60,atLimit:23,updatedAt:now-40*60000},codex:{members:88,medianUsed:35,atLimit:9,updatedAt:now-2*3600000}}};
}
