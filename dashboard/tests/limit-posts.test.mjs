import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/limit-posts.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {parseLimitPost,rankLimitPosts,limitSearchURL,reportCounts,REPORT_MAX_AGE}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const now=1800000000000;
const hit=(title,other={})=>({objectID:'123',title,author:'participant',created_at_i:(now-60000)/1000,points:0,num_comments:0,...other});
test('requires specific subscription-limit reports, not generic AI news or popularity',()=>{
 for(const title of ['Building with Claude','Claude is amazing','Claude limits are awful','Claude credit limits changed','Claude Pro pricing now $20','OpenAI API rate limits cut from 1000 to 500 requests','OpenAI API Pro weekly usage limits cut from 1000 to 500 requests','Claude context limit reduced from 200000 to 100000 tokens','Show HN: A Claude weekly limit tracker','Show HN: Claude Pro session limit cut from 80 to 20 prompts','When does Claude Pro weekly limit reset after 5 hours?'])assert.equal(parseLimitPost(hit(title,{points:900,num_comments:500}),now),null,title);
});
test('accepts detailed first-hand hits, before/after comparisons and reset changes without inventing verification',()=>{
 for(const title of ['I hit Claude Pro session limit after 20 prompts','Claude Pro session limit reduced from 80 to 20 prompts','Codex Plus weekly quota exhausted after 12 tasks','ChatGPT Plus message limit increased from 40 to 80 prompts','Claude Pro weekly quota reset moved 2 days later']){
  const p=parseLimitPost(hit(title),now);assert.ok(p,title);assert.ok(p.reason);assert.equal('verified' in p,false);assert.ok(p.providers.length);
 }
 assert.ok(parseLimitPost(hit('Claude Code users hit usage limits faster than before',{points:40}),now));
 assert.equal(parseLimitPost(hit('Ask HN: Kimi Code hit its 5-hour limit after $1.37 of API usage',{story_text:'I switched from Claude Pro after hitting the session limit after 20 prompts.'}),now),null);
 const contextual=parseLimitPost(hit('Claude Pro session limits',{story_text:'<p>I used to get 80 prompts but now hit the limit after 20 prompts.</p>'}),now);assert.equal(contextual.reason,'Before/after comparison');
});
test('rejects stale/future or malformed records and preserves linked source attribution safely',()=>{
 for(const other of [{objectID:'javascript:alert(1)'},{created_at_i:NaN},{created_at_i:(now-REPORT_MAX_AGE-1)/1000},{created_at_i:(now+120000)/1000}])assert.equal(parseLimitPost(hit('Claude Pro session limit cut from 80 to 20 prompts',other),now),null);
 const p=parseLimitPost(hit('<b>Claude</b> Pro session limit cut from 80 to 20 prompts',{author:'<script>hidden()</script>real &amp; name',points:Infinity,num_comments:-1}),now);
 assert.equal(p.author,'real & name');assert.equal(p.points,0);assert.equal(p.comments,0);assert.ok(!p.title.includes('<b>'));
});
test('deduplicates and ranks concrete before/after evidence ahead of a newer bare limit hit',()=>{
 const strong=parseLimitPost(hit('Claude Pro session limit reduced from 80 to 20 prompts',{objectID:'1',created_at_i:(now-86400000)/1000}),now);
 const newer=parseLimitPost(hit('I hit Claude Pro session limit after 20 prompts',{objectID:'2'}),now);
 assert.deepEqual(rankLimitPosts([newer,strong,strong],now).map(p=>p.id),['1','2']);
 assert.equal(rankLimitPosts([strong],now+REPORT_MAX_AGE).length,0);
 const url=new URL(limitSearchURL('Claude limit',now));assert.equal(url.searchParams.get('hitsPerPage'),'60');assert.ok(url.searchParams.get('numericFilters').startsWith('created_at_i>'));
});
test('report counts split by provider and week, and only this week can be linked',()=>{
 const DAY=86400000,post=(id,title,ago)=>parseLimitPost(hit(title,{objectID:id,created_at_i:(now-ago*DAY)/1000}),now);
 const posts=[post('1','Claude Pro session limit reduced from 80 to 20 prompts',1),post('2','I hit Claude Pro session limit after 20 prompts',3),post('3','Claude Pro weekly quota exhausted after 12 tasks',9),post('4','Claude Pro session limit cut from 80 to 20 prompts',20),post('5','Codex Plus weekly quota exhausted after 12 tasks',2)];
 const c=reportCounts(posts,'Claude',now);assert.deepEqual([c.thisWeek,c.lastWeek,c.top.id],[2,1,'1']);
 const o=reportCounts(posts,'OpenAI',now);assert.deepEqual([o.thisWeek,o.lastWeek,o.top.id],[1,0,'5']);
 const old=reportCounts([posts[2]],'Claude',now);assert.deepEqual([old.thisWeek,old.lastWeek,old.top],[0,1,null]);
});
