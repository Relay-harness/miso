import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const js=ts.transpileModule(readFileSync(new URL('../src/data.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {makeFixtures,summarize,getTrend,rangeMs}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
test('fixture is stable and never contains future observations',()=>{const now=1800000000000;const samples=makeFixtures(now);assert.equal(samples.length,720);assert.deepEqual(samples,makeFixtures(now));assert.ok(samples.every(s=>s.time<=now));assert.equal(new Set(samples.map(s=>s.id)).size,samples.length);});
test('summary measures observation rate, handles empty cohorts and calculates median',()=>{assert.deepEqual(summarize([]),{count:0,limited:0,rate:0,median:0});const sample=[{kind:'429',latency:2000},{kind:'ok',latency:1000},{kind:'ok',latency:4000}];assert.equal(summarize(sample).median,2);assert.ok(Math.abs(summarize(sample).rate-100/3)<1e-10);});
test('trend counts in-window observations without duplicating buckets',()=>{const now=1800000000000;const fixture=makeFixtures(now);for(const range of Object.keys(rangeMs)){const trend=getTrend(fixture,now,range);assert.equal(trend.length,32);assert.equal(trend.reduce((sum,b)=>sum+b.count,0),fixture.filter(s=>s.time>=now-rangeMs[range]&&s.time<now).length);}});
