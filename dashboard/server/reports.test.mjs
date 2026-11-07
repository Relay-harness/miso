import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createReports,bucketReports,isLimitTitle,githubSearchURL,hnSearchURL,REPORT_TTL} from './reports.mjs';
import {createService} from './index.mjs';
const NOW=Date.UTC(2026,10,7,12),DAY=86400000,ago=(d,h=1)=>NOW-d*DAY-h*3600000;
const ok=body=>({ok:true,status:200,json:async()=>body});
const down={ok:false,status:503,json:async()=>({})};
function net({claude=[ago(0),ago(8)],hn=[{objectID:'1',title:'Claude usage limits cut',created_at_i:ago(1)/1000}]}={}){
 const calls=[],state={github:true,hn:true};
 const fetcher=async url=>{
  calls.push(url);
  if(url.includes('api.github.com')){if(!state.github)return down;const items=url.includes('claude-code')?claude.map(t=>({created_at:new Date(t).toISOString()})):[];return ok({total_count:items.length,items,incomplete_results:false});}
  if(!state.hn)return down;return ok({hits:hn});
 };
 return {fetcher,calls,state};
}
test('rolling days put each post in the right bar and separate the two weeks',()=>{
 const r=bucketReports([ago(0),ago(0),ago(1),ago(6),ago(7),ago(13),ago(14)],NOW,['GitHub']);
 assert.deepEqual(r.days,[1,0,0,0,0,1,2]);assert.equal(r.total,4);assert.equal(r.prior,2);
 assert.deepEqual(bucketReports([NOW+3600000,NaN],NOW,['GitHub']).days,[0,0,0,0,0,0,0]);
 assert.equal(bucketReports([ago(1),ago(8)],NOW,['GitHub'],true).prior,null,'capped');
 assert.equal(bucketReports([ago(1),ago(8)],NOW,['GitHub'],false,false).prior,null,'incomplete');
});
test('titles must name the provider and a limit',()=>{
 for(const t of ['Claude usage limits cut','Anthropic quota changes'])assert.equal(isLimitTitle(t,'claude'),true,t);
 for(const t of ['Codex limit hit','ChatGPT rate limited again'])assert.equal(isLimitTitle(t,'codex'),true,t);
 for(const t of ['Building with Claude','Show HN: A Claude limit tracker','Codex limit hit',null])assert.equal(isLimitTitle(t,'claude'),false,String(t));
});
test('searches target the right repo, titles only, and 14 days',()=>{
 assert.match(new URL(githubSearchURL('codex',NOW)).searchParams.get('q'),/repo:openai\/codex is:issue in:title created:>=2026-10-24/);
 assert.match(new URL(githubSearchURL('claude',NOW,2)).search,/page=2/);
 assert.equal(new URL(hnSearchURL('Claude limit',NOW)).searchParams.get('tags'),'story');
});
test('combines both sources and serves the saved result without fetching again',async()=>{
 const n=net();const r=createReports({fetcher:n.fetcher,clock:()=>NOW});
 const a=await r.get();assert.equal(a.providers.claude.total,2);assert.equal(a.providers.claude.prior,1);assert.deepEqual(a.providers.claude.sources,['GitHub','Hacker News']);assert.equal(a.providers.codex.total,0);
 const count=n.calls.length;await r.get();await r.get();assert.equal(n.calls.length,count,'cached');
});
test('a failed source keeps its last good result, so the number does not move',async()=>{
 let now=NOW;const n=net();const r=createReports({fetcher:n.fetcher,clock:()=>now});
 const before=(await r.get()).providers.claude;
 n.state.hn=false;now+=REPORT_TTL;await r.get();await new Promise(s=>setImmediate(s));await new Promise(s=>setTimeout(s,5));
 const after=(await r.get()).providers.claude;assert.equal(after.total,before.total);assert.deepEqual(after.sources,['GitHub','Hacker News']);
});
test('a source that has failed for over a day is dropped and named honestly',async()=>{
 let now=NOW;const n=net();const r=createReports({fetcher:n.fetcher,clock:()=>now});await r.get();
 n.state.hn=false;now+=DAY+1000;await r.get();await new Promise(s=>setTimeout(s,5));
 assert.deepEqual((await r.get()).providers.claude.sources,['GitHub']);
});
test('no data at all stays empty and retries soon',async()=>{
 let now=NOW;const n=net();n.state.github=false;n.state.hn=false;const r=createReports({fetcher:n.fetcher,clock:()=>now});
 assert.deepEqual((await r.get()).providers,{claude:null,codex:null});
 n.state.github=true;n.state.hn=true;now+=61000;await r.get();await new Promise(s=>setTimeout(s,5));
 assert.equal((await r.get()).providers.claude.total,2);
});
test('the endpoint is public, read-only JSON',async()=>{
 const n=net();const {server,store}=createService({reports:createReports({fetcher:n.fetcher,clock:()=>NOW})});
 await new Promise(s=>server.listen(0,'127.0.0.1',s));
 try{
  const base=`http://127.0.0.1:${server.address().port}`;
  const res=await fetch(base+'/api/reports',{headers:{Origin:'https://www.throttleindex.com'}});
  assert.equal(res.status,200);assert.equal(res.headers.get('access-control-allow-origin'),'https://www.throttleindex.com');
  const body=await res.json();assert.equal(body.schema,1);assert.equal(body.providers.claude.days.length,7);
  assert.equal((await fetch(base+'/api/reports',{method:'POST'})).status,404);
 }finally{await new Promise(s=>server.close(s));store.close();}
});
