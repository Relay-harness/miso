import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const js=ts.transpileModule(readFileSync(new URL('../src/limit-reports.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {bucketReports,reportTrend,isLimitTitle,githubSearchURL,hnSearchURL}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const NOW=Date.UTC(2026,10,7,12),DAY=86400000,ago=(d,h=1)=>NOW-d*DAY-h*3600000;
test('rolling days put each post in the right bar and separate the two weeks',()=>{
 const r=bucketReports([ago(0),ago(0),ago(1),ago(6),ago(7),ago(13),ago(14)],NOW,['GitHub']);
 assert.deepEqual(r.days,[1,0,0,0,0,1,2]);assert.equal(r.total,4);assert.equal(r.prior,2);assert.equal(reportTrend(r),100);
 assert.deepEqual(bucketReports([NOW+3600000,NaN],NOW,['GitHub']).days,[0,0,0,0,0,0,0]);
});
test('no trend without a known earlier week',()=>{
 assert.equal(reportTrend(bucketReports([ago(1)],NOW,['GitHub'])),null,'nothing to compare with');
 const capped=bucketReports([ago(1),ago(8)],NOW,['GitHub'],true);assert.equal(capped.prior,null);assert.equal(capped.capped,true);assert.equal(reportTrend(capped),null);
 assert.equal(bucketReports([ago(1),ago(8)],NOW,['GitHub'],false,false).prior,null,'incomplete search');
 assert.equal(reportTrend(bucketReports([ago(8),ago(9)],NOW,['GitHub'])),-100);
});
test('titles must name the provider and a limit',()=>{
 for(const t of ['Claude usage limits cut','Anthropic quota changes'])assert.equal(isLimitTitle(t,'claude'),true,t);
 for(const t of ['Codex limit hit','ChatGPT rate limited again'])assert.equal(isLimitTitle(t,'codex'),true,t);
 for(const t of ['Building with Claude','Show HN: A Claude limit tracker','Codex limit hit',null])assert.equal(isLimitTitle(t,'claude'),false,String(t));
});
test('searches target the right repo, titles only, and 14 days',()=>{
 const g=new URL(githubSearchURL('codex',NOW)).searchParams.get('q');assert.match(g,/repo:openai\/codex is:issue in:title created:>=2026-10-24/);
 assert.match(new URL(githubSearchURL('claude',NOW,2)).search,/page=2/);assert.match(new URL(githubSearchURL('claude',NOW)).searchParams.get('q'),/repo:anthropics\/claude-code/);
 assert.equal(new URL(hnSearchURL('Claude limit',NOW)).searchParams.get('tags'),'story');
});
