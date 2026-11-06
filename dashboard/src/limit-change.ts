import type {AllowanceCohort} from './allowance-data';

// What a bar says: did the limit change? Usage is never a source here, because a busy day is not a smaller limit.
export type Announcement={provider:'claude'|'codex';percent:number|null;date:string;headline:string;detail:string;source:string;url:string};
export type LimitChange=
 {state:'cut'|'extra';percent:number;filled:number;contributors:number|null;announcement:Announcement|null}|
 {state:'normal';percent:0;filled:40;contributors:number;announcement:null}|
 {state:'changed';percent:null;filled:40;contributors:null;announcement:Announcement}|
 {state:'quiet';percent:null;filled:40;contributors:null;announcement:Announcement;checked:boolean}|
 {state:'unclear'|'unknown';percent:null;filled:0;contributors:number|null;announcement:null};

// The latest change each provider announced, until Miso has its own measurements. Measured results always win.
// Only a change from the past 7 days sets the figure; an older one is shown as the last change.
// Update this by hand, and move ANNOUNCEMENTS_CHECKED forward each time the list is checked. Past 7 days without a check,
// the bars stop saying no change was announced. A percent must trace back to the provider's own statement.
export const ANNOUNCEMENTS_CHECKED='2026-11-07';
export const ANNOUNCEMENTS:Announcement[]=[
 {provider:'claude',percent:null,date:'2026-10-30',headline:'Ultra plan dropped 5-hour limit',detail:'Max 20x became Ultra. Verified accounts have no 5-hour limit and the weekly limit is unchanged. Not measured by Miso.',source:'Anthropic',url:'https://support.claude.com/en/articles/17728952-what-is-the-ultra-plan'},
 {provider:'codex',percent:100,date:'2026-10-29',headline:'Pro plans doubled',detail:'Work and Codex allowance doubled on Pro 100 and Pro 500, and on Pro 200 for the lower allowance. A planned Pro 200 cut was canceled. Plus unchanged. Not measured by Miso.',source:'OpenAI',url:'https://help.openai.com/en/articles/9793128-about-chatgpt-pro-tiers'},
];
const WEEK=7*86400000;
const SEGMENTS=40;
const remaining=(percent:number)=>Math.max(0,Math.min(SEGMENTS,Math.round((100-percent)/2.5)));

function current(list:Announcement[],provider:Announcement['provider'],now:number){
 const live=list.filter(a=>{
  const start=Date.parse(a.date);
  return a.provider===provider&&Number.isFinite(start)&&start<=now;
 });
 return live.sort((a,b)=>Date.parse(b.date)-Date.parse(a.date))[0]??null;
}

export function limitChange(provider:Announcement['provider'],cohort:AllowanceCohort|undefined,now:number,announcements:Announcement[]=ANNOUNCEMENTS,checked:string=ANNOUNCEMENTS_CHECKED):LimitChange{
 if(cohort&&cohort.status!=='insufficient'&&cohort.index!==null){
  const contributors=cohort.contributors;
  if(cohort.status==='decreased'){const percent=Math.max(0,100-cohort.index);return {state:'cut',percent,filled:remaining(percent),contributors,announcement:null};}
  if(cohort.status==='increased')return {state:'extra',percent:Math.max(0,cohort.index-100),filled:SEGMENTS,contributors,announcement:null};
  if(cohort.status==='no_detectable_change')return {state:'normal',percent:0,filled:SEGMENTS,contributors:contributors??0,announcement:null};
  return {state:'unclear',percent:null,filled:0,contributors,announcement:null};
 }
 const announcement=current(announcements,provider,now);
 if(announcement){
  if(now-Date.parse(announcement.date)>=WEEK)return {state:'quiet',percent:null,filled:SEGMENTS,contributors:null,announcement,checked:now-Date.parse(checked)<WEEK};
  const percent=announcement.percent;
  if(percent!==null&&percent<0)return {state:'cut',percent:-percent,filled:remaining(-percent),contributors:null,announcement};
  if(percent!==null&&percent>0)return {state:'extra',percent,filled:SEGMENTS,contributors:null,announcement};
  return {state:'changed',percent:null,filled:SEGMENTS,contributors:null,announcement};
 }
 return {state:'unknown',percent:null,filled:0,contributors:null,announcement:null};
}
