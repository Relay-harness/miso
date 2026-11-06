import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const js=ts.transpileModule(readFileSync(new URL('../src/limit-change.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {limitChange}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const NOW=Date.UTC(2026,10,7);
const cohort=(status,index,contributors=12)=>({provider:'claude',status,index,contributors});
const notice=(percent,date='2026-11-01')=>({provider:'claude',percent,date,headline:'h',detail:'d',source:'Anthropic',url:'https://www.anthropic.com/news/x'});
test('measured results become a cut, normal, extra or unclear',()=>{
 for(const [percent,index,filled] of [[30,70,28],[20,80,32],[10,90,36]]){const c=limitChange('claude',cohort('decreased',index),NOW,[]);assert.deepEqual([c.state,c.percent,c.filled,c.contributors],['cut',percent,filled,12]);}
 const normal=limitChange('claude',cohort('no_detectable_change',95),NOW,[]);assert.deepEqual([normal.state,normal.percent,normal.filled],['normal',0,40]);
 const extra=limitChange('claude',cohort('increased',125),NOW,[]);assert.deepEqual([extra.state,extra.percent,extra.filled],['extra',25,40]);
 const unclear=limitChange('claude',cohort('inconclusive',80),NOW,[]);assert.deepEqual([unclear.state,unclear.percent,unclear.filled],['unclear',null,0]);
});
test('no evidence stays unknown and never invents a number',()=>{
 for(const c of [undefined,{provider:'claude',status:'insufficient',index:null,contributors:null}]){const r=limitChange('claude',c,NOW,[]);assert.deepEqual([r.state,r.percent,r.filled],['unknown',null,0]);}
});
test('only a change from the past 7 days sets the figure',()=>{
 const up=limitChange('claude',undefined,NOW,[notice(100)]);assert.deepEqual([up.state,up.percent,up.filled,up.announcement.source],['extra',100,40,'Anthropic']);
 const down=limitChange('claude',undefined,NOW,[notice(-20)]);assert.deepEqual([down.state,down.percent,down.filled],['cut',20,32]);
 for(const percent of [null,0])assert.deepEqual([limitChange('claude',undefined,NOW,[notice(percent)]).state,limitChange('claude',undefined,NOW,[notice(percent)]).filled],['changed',40]);
 const edge=limitChange('claude',undefined,NOW,[notice(-20,'2026-10-31')]);assert.equal(edge.state,'quiet','exactly 7 days old is no longer this week');
 const justIn=limitChange('claude',undefined,NOW,[notice(-20,'2026-11-01')]);assert.equal(justIn.state,'cut');
 assert.equal(limitChange('codex',undefined,NOW,[notice(100)]).state,'unknown');
 assert.equal(limitChange('claude',undefined,NOW,[notice(100,'2026-12-01')]).state,'unknown','a future date is not shown yet');
});
test('older changes become the last change, with no figure and an empty bar',()=>{
 const q=limitChange('claude',undefined,NOW,[notice(-17,'2026-09-14'),notice(null,'2026-10-30')]);assert.deepEqual([q.state,q.percent,q.filled,q.announcement.date],['quiet',null,0,'2026-10-30']);
});
test('the shipped list traces to each provider',()=>{
 for(const provider of ['claude','codex']){const a=limitChange(provider,undefined,Date.UTC(2026,10,7)).announcement;assert.ok(a,provider);assert.match(a.url,/^https:\/\/(support\.claude\.com|help\.openai\.com)\//);assert.ok(a.source&&a.headline&&a.detail);}
});
test('a measurement outranks an announcement',()=>{
 const r=limitChange('claude',cohort('no_detectable_change',100),NOW,[notice(100)]);assert.equal(r.state,'normal');assert.equal(r.announcement,null);
});
