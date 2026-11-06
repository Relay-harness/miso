import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const js=ts.transpileModule(readFileSync(new URL('../src/limit-change.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {limitChange,ANNOUNCEMENTS}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
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
 assert.equal(limitChange('claude',undefined,NOW,[notice(0)]).state,'unknown');
});
test('the newest past announcement fills the gap and names its source',()=>{
 const up=limitChange('claude',undefined,NOW,[notice(100)]);assert.deepEqual([up.state,up.percent,up.filled,up.announcement.source],['extra',100,40,'Anthropic']);
 const down=limitChange('claude',undefined,NOW,[notice(-20)]);assert.deepEqual([down.state,down.percent,down.filled],['cut',20,32]);
 assert.equal(limitChange('codex',undefined,NOW,[notice(100)]).state,'unknown');
 assert.equal(limitChange('claude',undefined,NOW,[notice(100,'2026-12-01')]).state,'unknown','a future date is not shown yet');
 const newest=limitChange('claude',undefined,NOW,[notice(100,'2026-05-06'),notice(-17,'2026-09-14')]);assert.deepEqual([newest.state,newest.percent,newest.filled],['cut',17,33]);
 for(const provider of ['claude','codex']){const a=limitChange(provider,undefined,NOW).announcement;assert.ok(a,provider);assert.match(a.url,/^https:\/\//);assert.ok(a.source&&a.headline&&a.detail);assert.ok(Date.parse(a.date)<=NOW);}
});
test('a measurement outranks an announcement',()=>{
 const r=limitChange('claude',cohort('no_detectable_change',100),NOW,[notice(100)]);assert.equal(r.state,'normal');assert.equal(r.announcement,null);
});
