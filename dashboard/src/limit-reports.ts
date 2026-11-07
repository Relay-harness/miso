// Counts public posts whose titles mention subscription limits, per day. This is how loudly people are talking about
// limits. It is not the size of any limit, so it never becomes a cut or an increase.
export type Provider='claude'|'codex';
export type ReportSource='GitHub'|'Hacker News';
export type DailyReports={days:number[];total:number;prior:number|null;capped:boolean;sources:ReportSource[]};
const DAY=86400000;
const REPOS:Record<Provider,string>={claude:'anthropics/claude-code',codex:'openai/codex'};
const HN_QUERIES:Record<Provider,string[]>={claude:['Claude limit','Claude usage limit'],codex:['Codex limit','ChatGPT limit']};
const NAMES:Record<Provider,RegExp>={claude:/\b(?:claude|anthropic)\b/i,codex:/\b(?:codex|chatgpt|openai)\b/i};
const GITHUB_TERMS='"usage limit" OR "rate limit" OR "weekly limit" OR "limit reached" OR "5-hour limit" OR "session limit"';
const MAX_PAGES=3,PER_PAGE=100;

export function githubSearchURL(provider:Provider,now:number,page=1):string {
 const since=new Date(now-14*DAY).toISOString().slice(0,10);
 return 'https://api.github.com/search/issues?'+new URLSearchParams({q:`repo:${REPOS[provider]} is:issue in:title created:>=${since} ${GITHUB_TERMS}`,sort:'created',order:'desc',per_page:String(PER_PAGE),page:String(page)});
}
export function hnSearchURL(query:string,now:number):string {
 return 'https://hn.algolia.com/api/v1/search_by_date?'+new URLSearchParams({query,tags:'story',hitsPerPage:'100',numericFilters:`created_at_i>${Math.floor((now-14*DAY)/1000)}`});
}
export function isLimitTitle(title:unknown,provider:Provider):boolean {
 if(typeof title!=='string'||/^(?:show|launch) hn:/i.test(title))return false;
 return NAMES[provider].test(title)&&/\b(?:limits?|quotas?|rate.?limited)\b/i.test(title);
}
/** days[0] is 6-7 days ago and days[6] is the last 24 hours. Rolling days, so a part day never skews the comparison. */
export function bucketReports(times:number[],now:number,sources:ReportSource[],capped=false,priorKnown=true):DailyReports {
 const days=Array<number>(7).fill(0);let prior=0;
 for(const t of times){
  if(!Number.isFinite(t)||t>now+60000)continue;
  const ago=Math.max(0,Math.floor((now-t)/DAY));
  if(ago<7)days[6-ago]++;else if(ago<14)prior++;
 }
 return {days,total:days.reduce((a,b)=>a+b,0),prior:capped||!priorKnown?null:prior,capped,sources};
}
export function reportTrend(r:DailyReports):number|null {
 return r.prior?Math.round((r.total-r.prior)/r.prior*100):null;
}

async function json(url:string):Promise<any> {
 const res=await fetch(url,{signal:AbortSignal.timeout(25000),credentials:'omit',referrerPolicy:'no-referrer'});
 if(!res.ok)throw new Error();
 return res.json();
}
async function fromGitHub(provider:Provider,now:number):Promise<{times:number[];capped:boolean;complete:boolean}> {
 const times:number[]=[];let capped=false,complete=true;
 for(let page=1;page<=MAX_PAGES;page++){
  const body=await json(githubSearchURL(provider,now,page));
  if(!Array.isArray(body.items))throw new Error();
  if(body.incomplete_results)complete=false;
  for(const item of body.items)times.push(Date.parse(item?.created_at));
  if(times.length>=body.total_count||!body.items.length)break;
  capped=page===MAX_PAGES;
 }
 return {times,capped,complete};
}
async function fromHackerNews(provider:Provider,now:number):Promise<number[]> {
 const results=await Promise.all(HN_QUERIES[provider].map(q=>json(hnSearchURL(q,now))));
 const seen=new Map<string,number>();
 for(const body of results){
  if(!Array.isArray(body.hits))throw new Error();
  for(const hit of body.hits)if(typeof hit?.objectID==='string'&&isLimitTitle(hit.title,provider))seen.set(hit.objectID,hit.created_at_i*1000);
 }
 return [...seen.values()];
}
async function forProvider(provider:Provider,now:number):Promise<DailyReports|null> {
 const [github,hn]=await Promise.allSettled([fromGitHub(provider,now),fromHackerNews(provider,now)]);
 if(github.status==='rejected'&&hn.status==='rejected')return null;
 const sources:ReportSource[]=[...(github.status==='fulfilled'?['GitHub' as const]:[]),...(hn.status==='fulfilled'?['Hacker News' as const]:[])];
 const times=[...(github.status==='fulfilled'?github.value.times:[]),...(hn.status==='fulfilled'?hn.value:[])];
 return bucketReports(times,now,sources,github.status==='fulfilled'&&github.value.capped,github.status!=='fulfilled'||github.value.complete);
}
let recent:{at:number;result:Promise<Record<Provider,DailyReports|null>>}|null=null;
export function loadReports(now=Date.now()):Promise<Record<Provider,DailyReports|null>> {
 if(recent&&now-recent.at<240000)return recent.result;
 const result=Promise.all([forProvider('claude',now),forProvider('codex',now)]).then(([claude,codex])=>{
  if(!claude||!codex)recent=null;
  return {claude,codex};
 });
 recent={at:now,result};
 return result;
}
