import type {AllowanceCohort} from './allowance-data';

// What a bar says: did the limit change? Usage is never a source here, because a busy day is not a smaller limit.
export type Announcement={provider:'claude'|'codex';percent:number;date:string;until?:string;source:string;url:string};
export type LimitChange=
 {state:'cut'|'extra';percent:number;filled:number;contributors:number|null;announcement:Announcement|null}|
 {state:'normal';percent:0;filled:40;contributors:number;announcement:null}|
 {state:'unclear'|'unknown';percent:null;filled:0;contributors:number|null;announcement:null};

// Official changes that state a number, for example "doubling five-hour limits" is percent 100. Add one only from the
// provider's own page, never from a forum post. Measured results always win over this list.
export const ANNOUNCEMENTS:Announcement[]=[];
const SHOWN_FOR=30*86400000;
const SEGMENTS=40;
const remaining=(percent:number)=>Math.max(0,Math.min(SEGMENTS,Math.round((100-percent)/2.5)));

function current(list:Announcement[],provider:Announcement['provider'],now:number){
 const live=list.filter(a=>{
  const start=Date.parse(a.date),end=a.until?Date.parse(a.until):start+SHOWN_FOR;
  return a.provider===provider&&Number.isFinite(start)&&Number.isFinite(end)&&start<=now&&now<=end;
 });
 return live.sort((a,b)=>Date.parse(b.date)-Date.parse(a.date))[0]??null;
}

export function limitChange(provider:Announcement['provider'],cohort:AllowanceCohort|undefined,now:number,announcements:Announcement[]=ANNOUNCEMENTS):LimitChange{
 if(cohort&&cohort.status!=='insufficient'&&cohort.index!==null){
  const contributors=cohort.contributors;
  if(cohort.status==='decreased'){const percent=Math.max(0,100-cohort.index);return {state:'cut',percent,filled:remaining(percent),contributors,announcement:null};}
  if(cohort.status==='increased')return {state:'extra',percent:Math.max(0,cohort.index-100),filled:SEGMENTS,contributors,announcement:null};
  if(cohort.status==='no_detectable_change')return {state:'normal',percent:0,filled:SEGMENTS,contributors:contributors??0,announcement:null};
  return {state:'unclear',percent:null,filled:0,contributors,announcement:null};
 }
 const announcement=current(announcements,provider,now);
 if(announcement){
  if(announcement.percent<0){const percent=-announcement.percent;return {state:'cut',percent,filled:remaining(percent),contributors:null,announcement};}
  if(announcement.percent>0)return {state:'extra',percent:announcement.percent,filled:SEGMENTS,contributors:null,announcement};
 }
 return {state:'unknown',percent:null,filled:0,contributors:null,announcement:null};
}
