// Relevance rules are selection heuristics, not verification of an author's claim.
export const REPORT_MAX_AGE = 90 * 86400000;
export const LIMIT_SEARCHES = [
 {provider:'Claude',query:'Claude limit'}, {provider:'Claude',query:'Claude quota'},
 {provider:'OpenAI',query:'Codex limit'}, {provider:'OpenAI',query:'ChatGPT limit'},
 {provider:'OpenAI',query:'OpenAI quota'}, {provider:'Gemini',query:'Gemini limit'},
];
export type LimitPost = {id:string;title:string;author:string;created:number;points:number;comments:number;providers:string[];reason:string;category:'change'|'limit_hit'|'reset_change';score:number};
function plain(value:unknown,max:number):string {
 if(typeof value!=='string')return '';
 return value.slice(0,max*3).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi,entity=>{
  const named:Record<string,string>={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '};
  if(named[entity])return named[entity];
  const n=entity.toLowerCase().startsWith('&#x')?parseInt(entity.slice(3,-1),16):parseInt(entity.slice(2,-1),10);
  return Number.isInteger(n)&&n>0&&n<=0x10ffff?String.fromCodePoint(n):' ';
 }).replace(/\s+/g,' ').trim().slice(0,max);
}
export function parseLimitPost(value:unknown,now=Date.now()):LimitPost|null {
 if(!value||typeof value!=='object')return null;
 const h=value as Record<string,unknown>;
 if(typeof h.objectID!=='string'||!/^\d{1,12}$/.test(h.objectID)||typeof h.created_at_i!=='number'||!Number.isFinite(h.created_at_i))return null;
 const created=h.created_at_i*1000;
 if(created<now-REPORT_MAX_AGE||created>now+60000)return null;
 const title=plain(h.title,500), text=title+' '+plain(h.story_text,4000);
 if(!title||/^(?:show hn|launch hn):/i.test(title))return null;
 const providers=[];
 if(/\b(?:claude|anthropic)\b/i.test(title))providers.push('Claude');
 if(/\b(?:codex|chatgpt|openai)\b/i.test(title))providers.push('OpenAI');
 if(/\b(?:gemini|google ai)\b/i.test(title))providers.push('Gemini');
 if(!providers.length)return null;
 const subscription=/\b(?:subscription|chatgpt|claude code|codex)\b/i.test(text);
 // API throttling, context length and prices are not subscription allowance evidence.
 if(/\bapi\b/i.test(text)&&!subscription)return null;
 const quota=/\b(?:session|weekly|daily|usage|message|subscription|plan|five.hour|5.hour)\s+(?:rate[ -]?)?(?:limits?|caps?|allowances?|quotas?)\b|\b(?:limits?|quotas?|allowances?|caps?)\b.{0,65}\b(?:session|weekly|daily|pro|max|plus|subscription|chatgpt|claude code|codex)\b|\b(?:pro|max|plus|subscription|chatgpt|claude code|codex)\b.{0,65}\b(?:limits?|quotas?|allowances?|caps?)\b/i.test(text);
 if(!quota)return null;
 const change=/\b(?:reduc(?:e[ds]?|ing|tion)|lowered|cuts?|slashed|tightened|halved|doubled|increas(?:e[ds]?|ing)|decreas(?:e[ds]?|ing)|introduc(?:ed|es|ing)|shorter|earlier|faster|used to|previously)\b|\bfrom\s+\d+.{0,35}\bto\s+\d+/i.test(text);
 const hit=/\b(?:hit|hitting|reach(?:ed|ing)?|exhaust(?:ed|ing)?|ran out|run out|locked out)\b.{0,80}\b(?:limits?|quotas?|caps?|messages?|prompts?)\b|\b(?:limits?|quotas?|caps?)\b.{0,35}\b(?:hit|reached|exhausted)\b/i.test(text);
 const reset=/\bresets?\b.{0,70}\b(?:changed|moved|later|earlier|delayed|hours?|days?|utc|am|pm)\b|\b(?:changed|moved|delayed)\b.{0,40}\bresets?\b/i.test(text);
 const quantity=/\b\d+(?:\.\d+)?\s*(?:messages?|prompts?|requests?|tasks?|hours?|hrs?|minutes?|mins?|days?|times)\b|\b\d+(?:\.\d+)?\s*%|\bfrom\s+\d+.{0,35}\bto\s+\d+/i.test(text);
 const comparison=/\b(?:used to|previously|before)\b.{0,120}\b(?:now|but|instead)\b|\bfrom\s+\d+.{0,35}\bto\s+\d+|\bcompared (?:with|to)\b.{0,50}\d/i.test(text);
 const plan=/\b(?:pro|max(?:\s*(?:5|20)x)?|plus)\b/i.test(text);
 const window=/\b(?:weekly|session|five.hour|5.hour|daily)\b/i.test(text);
 const count=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=10000000?v:0;
 const points=count(h.points),comments=count(h.num_comments);
 const discussion=points>=10||comments>=5;
 // A bare complaint or a generic 'limits changed' headline is never enough.
 if(/^(?:ask hn:\s*)?(?:when|how|what|where|can|does|is)\b/i.test(title)&&!change&&!comparison)return null;
 if(!(change||hit||reset)||!(quantity||comparison||(discussion&&plan)||(points>=20&&(window||change&&/\b(?:claude code|codex|chatgpt)\b/i.test(text)))))return null;
 if(!quantity&&!comparison&&!discussion)return null;
 const category=reset?'reset_change':change?'change':'limit_hit';
 const reason=reset?'Reset-window report':comparison?'Before/after comparison':change?'Allowance-change report':'Concrete limit-hit report';
 const score=(change?8:0)+(comparison?8:0)+(quantity?5:0)+(plan?3:0)+(window?2:0)+(reset?3:0)+Math.min(6,Math.log2(1+comments+points/4));
 return {id:h.objectID,title,author:plain(h.author,80)||'unknown',created,points,comments,providers,reason,category,score};
}
export function rankLimitPosts(posts:LimitPost[],now=Date.now()):LimitPost[] {
 const unique=new Map<string,LimitPost>();
 for(const post of posts)if(post.created>=now-REPORT_MAX_AGE&&post.created<=now+60000){
  const old=unique.get(post.id);
  if(!old||post.score>old.score)unique.set(post.id,post);
 }
 const priority=(p:LimitPost)=>p.score-Math.max(0,now-p.created)/(14*86400000);
 return [...unique.values()].sort((a,b)=>priority(b)-priority(a)||b.created-a.created||a.id.localeCompare(b.id));
}
export function limitSearchURL(query:string,now=Date.now()):string {
 const params=new URLSearchParams({query,tags:'story',hitsPerPage:'60',numericFilters:`created_at_i>${Math.floor((now-REPORT_MAX_AGE)/1000)}`});
 return 'https://hn.algolia.com/api/v1/search_by_date?'+params;
}
const WEEK=7*86400000;
export type ReportCounts={thisWeek:number;lastWeek:number;top:LimitPost|null};
// Counts posts that pass parseLimitPost. They are unverified reports and never become a limit-change figure.
export function reportCounts(posts:LimitPost[],provider:'Claude'|'OpenAI',now=Date.now()):ReportCounts {
 const mine=rankLimitPosts(posts.filter(p=>p.providers.includes(provider)),now);
 const recent=mine.filter(p=>p.created>=now-WEEK);
 return {thisWeek:recent.length,lastWeek:mine.filter(p=>p.created<now-WEEK&&p.created>=now-2*WEEK).length,top:recent[0]??null};
}
export type LimitPostResult={posts:LimitPost[];failures:number;searches:number};
let recentLoad:{at:number;result:Promise<LimitPostResult>}|null=null;
// The side panel and the bars share one set of requests.
export function loadLimitPosts(now=Date.now()):Promise<LimitPostResult> {
 if(recentLoad&&now-recentLoad.at<240000)return recentLoad.result;
 const searches=LIMIT_SEARCHES.filter(s=>s.provider!=='Gemini');
 const result=Promise.allSettled(searches.map(async search=>{
  const res=await fetch(limitSearchURL(search.query,now),{signal:AbortSignal.timeout(10000),credentials:'omit',referrerPolicy:'no-referrer'});
  if(!res.ok)throw new Error();const body=await res.json();if(!Array.isArray(body.hits))throw new Error();
  return body.hits.map((hit:unknown)=>parseLimitPost(hit,now)).filter((p:LimitPost|null):p is LimitPost=>p!==null) as LimitPost[];
 })).then(results=>{
  const failures=results.filter(r=>r.status==='rejected').length;
  if(failures)recentLoad=null;
  return {posts:rankLimitPosts(results.flatMap(r=>r.status==='fulfilled'?r.value:[]),now),failures,searches:searches.length};
 });
 recentLoad={at:now,result};
 return result;
}
