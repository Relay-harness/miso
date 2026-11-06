import type {AllowanceCohort} from './allowance-data';

// What a bar says: did the limit change? Usage is never a source here, because a busy day is not a smaller limit.
export type Announcement={provider:'claude'|'codex';percent:number;date:string;headline:string;detail:string;source:string;url:string};
export type LimitChange=
 {state:'cut'|'extra';percent:number;filled:number;contributors:number|null;announcement:Announcement|null}|
 {state:'normal';percent:0;filled:40;contributors:number;announcement:null}|
 {state:'unclear'|'unknown';percent:null;filled:0;contributors:number|null;announcement:null};

// The latest change each provider announced with a number, until Miso has its own measurements. Measured results always
// win over this list. Update it by hand when a provider announces a change: the figure must trace back to the provider's
// own statement, never a forum post or a complaint.
export const ANNOUNCEMENTS:Announcement[]=[
 {provider:'claude',percent:-17,date:'2026-09-14',headline:'weekly limit cut.',detail:'17% below the temporary boost, 25% above the old standard. 5-hour limit raised Sep 22, size not published.',source:'BleepingComputer',url:'https://www.bleepingcomputer.com/news/artificial-intelligence/anthropic-is-cutting-claude-codes-current-weekly-limits-by-17-percent/'},
 {provider:'codex',percent:100,date:'2026-10-29',headline:'limits doubled on Pro plans.',detail:'A planned 50% cut was dropped. Plus unchanged.',source:'BleepingComputer',url:'https://www.bleepingcomputer.com/news/artificial-intelligence/openai-doubles-chatgpt-pro-usage-limits-after-backlash-over-planned-50-percent-cut/'},
];
const SEGMENTS=40;
const remaining=(percent:number)=>Math.max(0,Math.min(SEGMENTS,Math.round((100-percent)/2.5)));

function current(list:Announcement[],provider:Announcement['provider'],now:number){
 const live=list.filter(a=>{
  const start=Date.parse(a.date);
  return a.provider===provider&&Number.isFinite(start)&&start<=now;
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
