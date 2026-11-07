import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const js=ts.transpileModule(readFileSync(new URL('../src/limit-reports.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {isReportsResponse,reportTrend}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const day=(over={})=>({days:[1,0,0,0,0,1,2],total:4,prior:2,capped:false,sources:['GitHub','Hacker News'],...over});
const body=(claude=day(),codex=null)=>({schema:1,generatedAt:1800000000000,providers:{claude,codex}});
test('accepts collector data, including a provider with no data',()=>{
 assert.equal(isReportsResponse(body()),true);assert.equal(isReportsResponse(body(null,null)),true);assert.equal(isReportsResponse(body(day({prior:null,capped:true}))),true);
});
test('rejects anything that could show a wrong number',()=>{
 for(const bad of [day({total:5}),day({days:[1,2,3]}),day({days:[1,0,0,0,0,1,-2]}),day({prior:-1}),day({sources:[]}),day({sources:['Twitter']})])assert.equal(isReportsResponse(body(bad)),false,JSON.stringify(bad));
 for(const bad of [null,{},{schema:2,generatedAt:1,providers:{claude:null,codex:null}},{schema:1,generatedAt:1}])assert.equal(isReportsResponse(bad),false);
});
test('a trend needs a known earlier week with reports',()=>{
 assert.equal(reportTrend(day()),100);assert.equal(reportTrend(day({total:0,days:[0,0,0,0,0,0,0]})),-100);
 assert.equal(reportTrend(day({prior:0})),null);assert.equal(reportTrend(day({prior:null})),null);
});
