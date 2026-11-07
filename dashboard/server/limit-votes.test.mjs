import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {LimitVotes,VoteError,VOTE_WINDOW,MIN_REPORTS} from './limit-votes.mjs';
import {createService} from './index.mjs';
const NOW=Date.UTC(2026,10,7,12),DAY=86400000;
function setup(){let now=NOW;const db=new DatabaseSync(':memory:');return {db,votes:new LimitVotes(db,()=>now),at:t=>{now=t;}};}
const file=(votes,percent,n,prefix='ip',provider='claude')=>{for(let i=0;i<n;i++)votes.submit({provider,percent},`${prefix}${i}`);};
test('stays normal until enough people report, and always shows the count',()=>{
 const {votes}=setup();assert.deepEqual(votes.summary().providers.claude,{reports:0,percent:0});
 file(votes,-30,MIN_REPORTS-1);assert.deepEqual(votes.summary().providers.claude,{reports:MIN_REPORTS-1,percent:0},'one person cannot set the number');
 votes.submit({provider:'claude',percent:-30},'another');assert.deepEqual(votes.summary().providers.claude,{reports:MIN_REPORTS,percent:-30});
 assert.deepEqual(votes.summary().providers.codex,{reports:0,percent:0},'providers stay separate');
});
test('the bar uses the typical report, so outliers do not move it',()=>{
 const {votes}=setup();file(votes,-20,3,'a');file(votes,-30,1,'b');file(votes,10,1,'c');assert.equal(votes.summary().providers.claude.percent,-20);
 const even=setup();file(even.votes,-30,3,'a');file(even.votes,-20,3,'b');assert.equal(Math.abs(even.votes.summary().providers.claude.percent%10),0,'rounded to 10%');
 const up=setup();file(up.votes,10,5);assert.equal(up.votes.summary().providers.claude.percent,10);
});
test('one network counts once, and its latest report wins',()=>{
 const {votes,at}=setup();for(let i=0;i<9;i++)votes.submit({provider:'claude',percent:-30},'same');assert.equal(votes.summary().providers.claude.reports,1,'same day replaces');
 at(NOW+DAY);votes.submit({provider:'claude',percent:0},'same');const s=votes.summary().providers.claude;assert.equal(s.reports,1,'next day still one person');
 file(votes,-30,4);votes.submit({provider:'claude',percent:-30},'same');assert.equal(votes.summary().providers.claude.percent,-30);
});
test('reports older than 7 days and their hashes are deleted',()=>{
 const {votes,db,at}=setup();file(votes,-30,5);at(NOW+VOTE_WINDOW+1);assert.equal(votes.summary().providers.claude.reports,0);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM limit_votes').get().n,0);
});
test('the IP address is never stored',()=>{
 const {votes,db}=setup();votes.submit({provider:'claude',percent:-30},'203.0.113.9');const row=db.prepare('SELECT * FROM limit_votes').get();assert.doesNotMatch(JSON.stringify(row),/203\.0\.113\.9/);assert.match(row.voter,/^[0-9a-f]{64}$/);
});
test('only known providers and choices are accepted',()=>{
 const {votes}=setup();for(const bad of [null,[],{},{provider:'claude'},{provider:'grok',percent:0},{provider:'claude',percent:-25},{provider:'claude',percent:'-30'},{provider:'claude',percent:-30,extra:1}])assert.throws(()=>votes.submit(bad,'ip'),VoteError);
});
test('the endpoint reads publicly, and only the website can file a report',async()=>{
 const {server,store}=createService({});await new Promise(s=>server.listen(0,'127.0.0.1',s));
 try{
  const url=`http://127.0.0.1:${server.address().port}/api/limit-reports`,site='https://www.throttleindex.com',send=(body,headers={Origin:site,'Content-Type':'application/json'})=>fetch(url,{method:'POST',headers,body:JSON.stringify(body)});
  const read=await fetch(url,{headers:{Origin:site}});assert.equal(read.status,200);assert.equal(read.headers.get('access-control-allow-origin'),site);assert.equal((await read.json()).providers.claude.reports,0);
  const pre=await fetch(url,{method:'OPTIONS',headers:{Origin:site,'Access-Control-Request-Method':'POST'}});assert.equal(pre.status,204);assert.match(pre.headers.get('access-control-allow-methods'),/POST/);
  const good=await send({provider:'claude',percent:-30});assert.equal(good.status,200);assert.equal(good.headers.get('access-control-allow-origin'),site);assert.equal((await good.json()).providers.claude.reports,1);
  assert.equal((await send({provider:'claude',percent:-30},{Origin:'https://evil.example','Content-Type':'application/json'})).status,403);
  assert.equal((await send({provider:'claude',percent:-30},{'Content-Type':'application/json'})).status,403,'no origin');
  assert.equal((await send({provider:'claude',percent:-30},{Origin:site,'Content-Type':'text/plain'})).status,415);
  assert.equal((await send({provider:'claude',percent:-25})).status,400);
  assert.equal((await fetch(url,{method:'POST',headers:{Origin:site,'Content-Type':'application/json'},body:'x'.repeat(2000)})).status,413);
  let limited=0;for(let i=0;i<70;i++)if((await send({provider:'codex',percent:0})).status===429)limited++;assert.ok(limited>0,'rate limited');
 }finally{await new Promise(s=>server.close(s));store.close();}
});
