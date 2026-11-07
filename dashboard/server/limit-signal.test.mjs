import {test} from 'node:test';
import assert from 'node:assert/strict';
import {statedChange,summarize,createSignal,SIGNAL_TTL,MIN_STATED,githubSearchURL} from './limit-signal.mjs';
import {createService} from './index.mjs';
const NOW=Date.UTC(2026,10,7,12),DAY=86400000,ago=d=>NOW-d*DAY-3600000;
const ok=body=>({ok:true,status:200,json:async()=>body});
const down={ok:false,status:503,json:async()=>({})};
test('reads stated cuts and increases from plain sentences',()=>{
 for(const [text,want] of [['My weekly limit feels 30% lower now.',-30],['The usage limit was cut by 20% this week.',-20],['My session limit went from 80 to 20 prompts.',-75],['I used to get 40 messages per session and now only get 30 messages.',-25],['Weekly limit is 50% higher this month.',50],['This has a 50% decrease in the 5-hour limit.',-50]])assert.equal(statedChange(text),want,text);
});
test('does not treat usage, questions or what-ifs as a limit change',()=>{
 for(const text of ['I hit my weekly limit.','I used 61 percent of my weekly limit.','Weekly meter at 87% with zero requests.','Is the usage limit 30% lower now?','If they cut limits by 30% I would leave.','OpenAI planned a 50% cut to usage limits.','API rate limit cut by 50%.','The price is 20% lower for this plan.','Performance is 30% lower today.',null])assert.equal(statedChange(text),null,String(text));
});
test('a change needs several posts, uses the typical one and is rounded to 10%',()=>{
 const post=(change,d=1)=>({at:ago(d),change});
 assert.deepEqual(summarize([post(null),post(null)],NOW,['GitHub']),{posts:2,stated:0,percent:0,sources:['GitHub']});
 assert.equal(summarize([post(-50),post(-50)],NOW,['GitHub']).percent,0,`under ${MIN_STATED} posts stays normal`);
 assert.equal(summarize([post(-30),post(-20),post(-20),post(90),post(null)],NOW,['GitHub']).percent,-20);
 assert.equal(summarize([post(40),post(40),post(40)],NOW,['GitHub']).percent,40);
 const old=summarize([post(-30,8),post(-30,8),post(-30,8),post(null)],NOW,['GitHub']);assert.deepEqual([old.posts,old.percent],[1,0],'older than 7 days does not count');
 assert.ok(Object.is(summarize([post(-1),post(-1),post(-1)],NOW,['GitHub']).percent,0),'never shows negative zero');
});
function net(items=[{created_at:new Date(ago(1)).toISOString(),title:'Limit',body:'My weekly limit feels 30% lower now.'}]){
 const state={github:true,hn:true},calls=[];
 return {state,calls,fetcher:async url=>{calls.push(url);
  if(url.includes('api.github.com')){if(!state.github)return down;const list=url.includes('claude-code')?items:[];return ok({total_count:list.length,items:list});}
  if(!state.hn)return down;return ok({hits:url.includes('Claude')?[{objectID:'1',title:'Claude usage limits cut',story_text:'<p>Weekly limit is 30% lower.</p>',created_at_i:ago(1)/1000},{objectID:'2',title:'Show HN: A Claude tracker',created_at_i:ago(1)/1000},{objectID:'3',title:'Unrelated limit post',created_at_i:ago(1)/1000}]:[]});
 }};
}
test('reads both sources, then serves the saved answer',async()=>{
 const n=net();const s=createSignal({fetcher:n.fetcher,clock:()=>NOW});
 const a=await s.get();assert.deepEqual(a.providers.claude,{posts:2,stated:2,percent:0,sources:['GitHub','Hacker News']});assert.deepEqual(a.providers.codex,{posts:0,stated:0,percent:0,sources:['GitHub','Hacker News']});
 const count=n.calls.length;await s.get();assert.equal(n.calls.length,count,'cached');assert.match(new URL(githubSearchURL('codex',NOW)).searchParams.get('q'),/repo:openai\/codex is:issue created:>=2026-10-31/);
});
test('a slow or failed source never moves the answer, until it has been gone a day',async()=>{
 let now=NOW;const n=net();const s=createSignal({fetcher:n.fetcher,clock:()=>now});const before=(await s.get()).providers.claude;
 n.state.hn=false;now+=SIGNAL_TTL;await s.get();await new Promise(r=>setTimeout(r,5));assert.deepEqual((await s.get()).providers.claude.sources,before.sources);
 now+=DAY;await s.get();await new Promise(r=>setTimeout(r,5));assert.deepEqual((await s.get()).providers.claude.sources,['GitHub']);
});
test('no data stays empty, not Normal, and retries soon',async()=>{
 let now=NOW;const n=net();n.state.github=false;n.state.hn=false;const s=createSignal({fetcher:n.fetcher,clock:()=>now});assert.deepEqual((await s.get()).providers,{claude:null,codex:null});
 n.state.github=true;now+=61000;await s.get();await new Promise(r=>setTimeout(r,5));assert.equal((await s.get()).providers.claude.posts,1);
});
test('the endpoint is public read-only JSON, and old limit reports are deleted',async()=>{
 const n=net();const {server,store}=createService({signal:createSignal({fetcher:n.fetcher,clock:()=>NOW})});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const base=`http://127.0.0.1:${server.address().port}`,res=await fetch(base+'/api/limit-signal',{headers:{Origin:'https://www.throttleindex.com'}});
  assert.equal(res.status,200);assert.equal(res.headers.get('access-control-allow-origin'),'https://www.throttleindex.com');assert.equal((await res.json()).providers.claude.posts,2);
  assert.equal((await fetch(base+'/api/limit-signal',{method:'POST'})).status,404);assert.equal((await fetch(base+'/api/limit-reports')).status,404);
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('limit_votes','limit_vote_meta')").get().n,0);
 }finally{await new Promise(r=>server.close(r));store.close();}
});
