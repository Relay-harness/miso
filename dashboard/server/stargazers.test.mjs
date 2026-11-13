import {test} from 'node:test';import assert from 'node:assert/strict';import {createStargazers} from './stargazers.mjs';import {createService} from './index.mjs';
const NOW=Date.parse('2026-05-20T12:00:00Z');const H=3600000;
const star=(login,hoursAgo)=>({starred_at:new Date(NOW-hoursAgo*H).toISOString(),user:{login,avatar_url:`https://avatars.githubusercontent.com/u/${login.length}?v=4`}});
function fake(pages,total){const calls=[];const fn=async(url)=>{calls.push(url);const u=new URL(url);
 if(u.pathname==='/repos/Relay-harness/miso')return {ok:true,json:async()=>({stargazers_count:total})};
 const p=Number(u.searchParams.get('page'));return pages[p]?{ok:true,json:async()=>pages[p]}:{ok:false,status:404};};fn.calls=calls;return fn;}
test('newest stargazers come first and the week count only counts real stars from the last 7 days',async()=>{
 const f=fake({1:[star('old',900),star('mid',300)],2:[star('week',160),star('recent',30),star('newest',2)]},105);
 const s=createStargazers({fetchFn:f,clock:()=>NOW});const v=await s.get();
 assert.equal(v.total,105);assert.equal(v.weekCount,3);assert.deepEqual(v.recent.map(x=>x.login),['newest','recent','week','mid','old']);
 assert.equal(v.recent[0].starredAt,NOW-2*H);assert.match(f.calls[1],/page=2/);
});
test('results are cached for ten minutes and a failed refresh keeps the last good answer',async()=>{
 let t=NOW;const f=fake({1:[star('a',1)]},1);const s=createStargazers({fetchFn:f,clock:()=>t});
 await s.get();const n=f.calls.length;t+=60000;await s.get();assert.equal(f.calls.length,n);
 t+=600000;const bad=createStargazers({fetchFn:async()=>{throw new Error()},clock:()=>t});assert.equal((await bad.get()).total,null);
 const failing=createStargazers({fetchFn:f,clock:()=>t,ttl:1});await failing.get();t+=10;const ok=failing.get;assert.equal((await ok()).recent[0].login,'a');
});
test('week count is null when the pages read do not reach back 7 days, and bad avatars or logins are dropped',async()=>{
 const page=n=>Array.from({length:100},(_,i)=>star('u'+i+'x',1+n*0.01));
 const f=fake({5:page(1),4:page(2),3:page(3),2:page(4)},450);
 const v=await createStargazers({fetchFn:f,clock:()=>NOW,maxPages:3}).get();assert.equal(v.weekCount,null);assert.equal(v.recent.length,8);
 const evil={1:[{starred_at:new Date(NOW-H).toISOString(),user:{login:'x',avatar_url:'https://evil.example/a.png'}},{starred_at:new Date(NOW-H).toISOString(),user:null},star('fine',1)]};
 const w=await createStargazers({fetchFn:fake(evil,3),clock:()=>NOW}).get();assert.deepEqual(w.recent.map(x=>x.login),['fine']);
});
test('the endpoint serves the stargazer summary',async()=>{
 const {server,store}=createService({stargazers:{get:async()=>({schema:1,total:2,weekCount:1,recent:[],source:'github-stargazers'})}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const res=await fetch(`http://127.0.0.1:${server.address().port}/api/stargazers`);assert.equal(res.status,200);assert.equal((await res.json()).weekCount,1);}finally{server.close();store.close();}
});
