// Counts public posts whose titles mention subscription limits, per day. This is how loudly people are talking about
// limits. It is not the size of any limit, so it never becomes a cut or an increase.
// The collector fetches once and serves the saved result, so every visitor sees the same numbers straight away.
const DAY=86400000;
export const REPORT_TTL=30*60000;
const RETRY_AFTER=60000,SOURCE_MAX_AGE=DAY,MAX_PAGES=3,PER_PAGE=100,TIMEOUT=25000;
const REPOS={claude:'anthropics/claude-code',codex:'openai/codex'};
const HN_QUERIES={claude:['Claude limit','Claude usage limit'],codex:['Codex limit','ChatGPT limit']};
const NAMES={claude:/\b(?:claude|anthropic)\b/i,codex:/\b(?:codex|chatgpt|openai)\b/i};
const GITHUB_TERMS='"usage limit" OR "rate limit" OR "weekly limit" OR "limit reached" OR "5-hour limit" OR "session limit"';

export function githubSearchURL(provider,now,page=1){
 const since=new Date(now-14*DAY).toISOString().slice(0,10);
 return 'https://api.github.com/search/issues?'+new URLSearchParams({q:`repo:${REPOS[provider]} is:issue in:title created:>=${since} ${GITHUB_TERMS}`,sort:'created',order:'desc',per_page:String(PER_PAGE),page:String(page)});
}
export function hnSearchURL(query,now){
 return 'https://hn.algolia.com/api/v1/search_by_date?'+new URLSearchParams({query,tags:'story',hitsPerPage:'100',numericFilters:`created_at_i>${Math.floor((now-14*DAY)/1000)}`});
}
export function isLimitTitle(title,provider){
 if(typeof title!=='string'||/^(?:show|launch) hn:/i.test(title))return false;
 return NAMES[provider].test(title)&&/\b(?:limits?|quotas?|rate.?limited)\b/i.test(title);
}
/** days[0] is 6-7 days ago and days[6] is the last 24 hours. Rolling days, so a part day never skews the comparison. */
export function bucketReports(times,now,sources,capped=false,priorKnown=true){
 const days=Array(7).fill(0);let prior=0;
 for(const t of times){
  if(!Number.isFinite(t)||t>now+60000)continue;
  const ago=Math.max(0,Math.floor((now-t)/DAY));
  if(ago<7)days[6-ago]++;else if(ago<14)prior++;
 }
 return {days,total:days.reduce((a,b)=>a+b,0),prior:capped||!priorKnown?null:prior,capped,sources};
}

export function createReports({fetcher=fetch,clock=()=>Date.now()}={}){
 const json=async(url,headers)=>{const res=await fetcher(url,{headers,signal:AbortSignal.timeout(TIMEOUT)});if(!res.ok)throw new Error(`HTTP ${res.status}`);return res.json();};
 const fromGitHub=async(provider,now)=>{
  const times=[];let capped=false,complete=true;
  for(let page=1;page<=MAX_PAGES;page++){
   const body=await json(githubSearchURL(provider,now,page),{Accept:'application/vnd.github+json','User-Agent':'throttleindex'});
   if(!Array.isArray(body.items))throw new Error('Unexpected GitHub response');
   if(body.incomplete_results)complete=false;
   for(const item of body.items)times.push(Date.parse(item?.created_at));
   if(times.length>=body.total_count||!body.items.length)break;
   capped=page===MAX_PAGES;
  }
  return {times,capped,complete};
 };
 const fromHackerNews=async(provider,now)=>{
  const results=await Promise.all(HN_QUERIES[provider].map(q=>json(hnSearchURL(q,now),{'User-Agent':'throttleindex'})));
  const seen=new Map();
  for(const body of results){
   if(!Array.isArray(body.hits))throw new Error('Unexpected Hacker News response');
   for(const hit of body.hits)if(typeof hit?.objectID==='string'&&isLimitTitle(hit.title,provider))seen.set(hit.objectID,hit.created_at_i*1000);
  }
  return {times:[...seen.values()],capped:false,complete:true};
 };
 // A failed source keeps its last good result for a day, so one slow response never changes the number.
 const saved={claude:{github:null,hn:null},codex:{github:null,hn:null}};
 let refreshedAt=0,inflight=null;
 const refresh=()=>inflight??=(async()=>{
  const now=clock();let held=false;
  await Promise.all(Object.keys(saved).map(async provider=>{
   const [github,hn]=await Promise.allSettled([fromGitHub(provider,now),fromHackerNews(provider,now)]);
   if(github.status==='fulfilled')saved[provider].github={...github.value,at:now};
   if(hn.status==='fulfilled')saved[provider].hn={...hn.value,at:now};
  }));
  for(const s of Object.values(saved))if(s.github&&s.hn&&s.github.at===now&&s.hn.at===now)held=true;
  refreshedAt=held?now:now-REPORT_TTL+RETRY_AFTER;
 })().finally(()=>{inflight=null;});
 const view=now=>{
  const providers={};
  for(const [provider,{github,hn}] of Object.entries(saved)){
   const gh=github&&now-github.at<=SOURCE_MAX_AGE?github:null,news=hn&&now-hn.at<=SOURCE_MAX_AGE?hn:null;
   providers[provider]=gh||news?bucketReports([...(gh?.times??[]),...(news?.times??[])],now,[...(gh?['GitHub']:[]),...(news?['Hacker News']:[])],!!gh?.capped,!gh||gh.complete):null;
  }
  return {schema:1,generatedAt:now,providers};
 };
 return {
  async get(){
   const now=clock();
   if(!refreshedAt)await refresh();
   else if(now-refreshedAt>=REPORT_TTL)void refresh();
   return view(clock());
  },
 };
}
