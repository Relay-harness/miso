// Reads public posts about subscription limits and looks for ones that state how much a limit changed.
// The figure is what posts say, not a measurement. Most posts state no figure, so the usual answer is Normal.
const DAY=86400000,WEEK=7*DAY;
export const SIGNAL_TTL=30*60000;
export const MIN_STATED=3;
const RETRY_AFTER=60000,SOURCE_MAX_AGE=DAY,MAX_PAGES=3,PER_PAGE=100,TIMEOUT=25000;
const REPOS={claude:'anthropics/claude-code',codex:'openai/codex'};
const HN_QUERIES={claude:['Claude limit','Claude usage limit'],codex:['Codex limit','ChatGPT limit']};
const NAMES={claude:/\b(?:claude|anthropic)\b/i,codex:/\b(?:codex|chatgpt|openai)\b/i};
const GITHUB_TERMS='"usage limit" OR "rate limit" OR "weekly limit" OR "limit reached" OR "5-hour limit" OR "session limit"';
const ABOUT_LIMITS=/\b(?:limits?|quotas?|allowances?|usage|sessions?|weekly|5.?hours?)\b/i;
const NOT_A_REPORT=/\b(?:if|would|could|planned|cancel\w*|might|maybe|cost|price|pricing|context|api)\b/i;
const UNIT='(?:prompts?|messages?|requests?|hours?|hrs?|h|minutes?|mins?|tasks?|sessions?)';
const STATED_CUT=[/(\d{1,2})\s?%\s*(?:less|fewer|lower|smaller|shorter|reduction|cut|drop|decrease|nerf)\b/i,/\b(?:cut|reduced|dropped|nerfed|lowered|slashed|decreased|shrunk|shrank|down)\b[^.%]{0,30}?\bby\s*(\d{1,2})\s?%/i];
const STATED_RISE=/(\d{1,3})\s?%\s*(?:more|higher|increase|boost|bigger|larger)\b/i;
const FROM_TO=new RegExp(`\\bfrom\\s+(?:~|about\\s+)?(\\d+(?:\\.\\d+)?)\\s*(?:${UNIT})?\\s+(?:down\\s+|up\\s+)?to\\s+(?:~|about\\s+)?(\\d+(?:\\.\\d+)?)\\s*${UNIT}\\b`,'i');
const USED_TO=new RegExp(`\\bused to\\b[^.]{0,50}?(\\d+(?:\\.\\d+)?)\\s*${UNIT}\\b[^.]{0,40}?\\bnow\\b[^.]{0,30}?(\\d+(?:\\.\\d+)?)\\s*${UNIT}\\b`,'i');

/** The first change a post states about a limit, as a signed percent, or null. Questions and what-ifs do not count. */
export function statedChange(text){
 if(typeof text!=='string')return null;
 for(const sentence of text.slice(0,20000).split(/(?<=[.!?\n])\s+/)){
  if(sentence.length>400||sentence.trim().endsWith('?')||!ABOUT_LIMITS.test(sentence)||NOT_A_REPORT.test(sentence))continue;
  for(const pattern of STATED_CUT){const m=pattern.exec(sentence);if(m&&Number(m[1])>0)return -Number(m[1]);}
  const rise=STATED_RISE.exec(sentence);if(rise&&Number(rise[1])>0)return Number(rise[1]);
  const pair=FROM_TO.exec(sentence)||USED_TO.exec(sentence);
  if(pair&&Number(pair[1])>0&&pair[1]!==pair[2])return Math.round((Number(pair[2])-Number(pair[1]))/Number(pair[1])*100);
 }
 return null;
}
const STORY_TOPIC=/\b(?:limits?|quotas?|allowance|meter|usage)\b/i;
const STORY_SIGNAL=/\b(?:drain\w*|exhaust\w*|deplet\w*|gone|consum\w*|burn\w*|faster|reached|drops?|removes?|merg\w*|cuts?|doubl\w*|halv\w*|reduc\w*|raised?|increase[sd]?)\b|\d\s?%|\d(?:-\d+)?\s?[x×](?![a-z])/i;
const NOT_A_STORY=/^\s*\[?(?:feature|docs?|question)\b|feature request|github api|api quota|rate_limit_error|context (?:window|limit)|\bwhen\b.{0,40}\breached\b/i;
export const LATEST_COUNT=12;
const MAX_TITLE=120;
/** A headline fit for the "What folks are saying" list, or null when the title isn't about using up or changing a limit. */
export function storyTitle(raw){
 if(typeof raw!=='string'||NOT_A_STORY.test(raw))return null;
 const title=raw.replace(/^(?:\[[^\]]{1,40}\]\s*)+/,'').replace(/^(?:Ask|Tell) HN:\s*/i,'').replace(/\s+/g,' ').trim();
 if(!title||!STORY_TOPIC.test(title)||!STORY_SIGNAL.test(title))return null;
 return title.length<=MAX_TITLE?title:`${title.slice(0,MAX_TITLE).replace(/\s+\S*$/,'')}…`;
}
const tally=n=>Number.isSafeInteger(n)&&n>=0?n:0;
const median=v=>{const s=[...v].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;};
/** One post, one figure. A change only shows once several separate posts state one, so one post cannot set the bar. */
export function summarize(posts,now,sources){
 const week=posts.filter(p=>Number.isFinite(p.at)&&p.at<=now+60000&&now-p.at<WEEK);
 const figures=week.map(p=>p.change).filter(c=>c!==null);
 const percent=figures.length>=MIN_STATED?Math.round(median(figures)/10)*10+0:0;
 return {posts:week.length,stated:figures.length,percent,sources};
}
const plain=html=>String(html||'').replace(/<[^>]+>/g,' ').replace(/&(?:amp|lt|gt|quot|#x27|#39);/g,' ');
export function githubSearchURL(provider,now,page=1){
 const since=new Date(now-WEEK).toISOString().slice(0,10);
 return 'https://api.github.com/search/issues?'+new URLSearchParams({q:`repo:${REPOS[provider]} is:issue created:>=${since} ${GITHUB_TERMS}`,sort:'created',order:'desc',per_page:String(PER_PAGE),page:String(page)});
}
export function hnSearchURL(query,now){
 return 'https://hn.algolia.com/api/v1/search_by_date?'+new URLSearchParams({query,tags:'story',hitsPerPage:'100',numericFilters:`created_at_i>${Math.floor((now-WEEK)/1000)}`});
}
export function createSignal({fetcher=fetch,clock=()=>Date.now()}={}){
 const json=async(url,headers)=>{const res=await fetcher(url,{headers,signal:AbortSignal.timeout(TIMEOUT)});if(!res.ok)throw new Error(`HTTP ${res.status}`);return res.json();};
 const fromGitHub=async(provider,now)=>{
  const posts=[];
  for(let page=1;page<=MAX_PAGES;page++){
   const body=await json(githubSearchURL(provider,now,page),{Accept:'application/vnd.github+json','User-Agent':'throttleindex'});
   if(!Array.isArray(body.items))throw new Error('Unexpected GitHub response');
   for(const item of body.items){
    const at=Date.parse(item?.created_at),title=item?.user?.type==='Bot'||!Number.isSafeInteger(item?.number)?null:storyTitle(item?.title);
    posts.push({at,change:statedChange(`${item?.title}.\n${item?.body||''}`),story:title&&{source:'GitHub',url:`https://github.com/${REPOS[provider]}/issues/${item.number}`,title,author:String(item?.user?.login||'unknown').slice(0,80),at,comments:tally(item?.comments),points:tally(item?.reactions?.total_count)}});
   }
   if(posts.length>=body.total_count||!body.items.length)break;
  }
  return posts;
 };
 const fromHackerNews=async(provider,now)=>{
  const results=await Promise.all(HN_QUERIES[provider].map(q=>json(hnSearchURL(q,now),{'User-Agent':'throttleindex'})));
  const seen=new Map();
  for(const body of results){
   if(!Array.isArray(body.hits))throw new Error('Unexpected Hacker News response');
   for(const hit of body.hits){
    if(typeof hit?.objectID!=='string'||/^(?:show|launch) hn:/i.test(hit.title||''))continue;
    const text=`${hit.title||''}.\n${plain(hit.story_text)}`;
    if(!NAMES[provider].test(text))continue;
    const at=hit.created_at_i*1000,title=/^\d{1,12}$/.test(hit.objectID)&&NAMES[provider].test(hit.title||'')?storyTitle(hit.title):null;
    seen.set(hit.objectID,{at,change:statedChange(text),story:title&&{source:'Hacker News',url:`https://news.ycombinator.com/item?id=${hit.objectID}`,title,author:String(hit.author||'unknown').slice(0,80),at,comments:tally(hit.num_comments),points:tally(hit.points)}});
   }
  }
  return [...seen.values()];
 };
 // A failed source keeps its last good result for a day, so one slow response never changes the answer.
 const saved={claude:{github:null,hn:null},codex:{github:null,hn:null}};
 let refreshedAt=0,inflight=null;
 const refresh=()=>inflight??=(async()=>{
  const now=clock();let any=false;
  await Promise.all(Object.keys(saved).map(async provider=>{
   const [github,hn]=await Promise.allSettled([fromGitHub(provider,now),fromHackerNews(provider,now)]);
   if(github.status==='fulfilled'){saved[provider].github={posts:github.value,at:now};any=true;}
   if(hn.status==='fulfilled'){saved[provider].hn={posts:hn.value,at:now};any=true;}
  }));
  refreshedAt=any?now:now-SIGNAL_TTL+RETRY_AFTER;
 })().finally(()=>{inflight=null;});
 const view=now=>{
  const providers={},stories=new Map();
  for(const [provider,{github,hn}] of Object.entries(saved)){
   const gh=github&&now-github.at<=SOURCE_MAX_AGE?github:null,news=hn&&now-hn.at<=SOURCE_MAX_AGE?hn:null,posts=[...(gh?.posts??[]),...(news?.posts??[])];
   providers[provider]=gh||news?summarize(posts,now,[...(gh?['GitHub']:[]),...(news?['Hacker News']:[])]):null;
   for(const {story} of posts)if(story&&Number.isFinite(story.at)&&story.at<=now+60000&&now-story.at<WEEK)stories.set(story.url,story);
  }
  const latest=[...stories.values()].sort((a,b)=>b.at-a.at||a.url.localeCompare(b.url)).slice(0,LATEST_COUNT);
  return {schema:1,generatedAt:now,minStated:MIN_STATED,providers,latest};
 };
 return {async get(){const now=clock();if(!refreshedAt)await refresh();else if(now-refreshedAt>=SIGNAL_TTL)void refresh();return view(clock());}};
}
