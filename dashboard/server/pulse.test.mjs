import {test} from 'node:test';
import assert from 'node:assert/strict';
import {computePulse} from './pulse.mjs';
const NOW=Date.UTC(2026,10,3,12,10),H=3600000;
const row=(install,minsAgo,used,provider='claude')=>({install:String(install),provider,kind:'five_hour',observed:NOW-minsAgo*60000,used,reset:NOW-minsAgo*60000+3*H});
test('share at limit now vs previous half hour, one vote per install',()=>{
 const rows=[];for(let i=0;i<10;i++){rows.push(row(i,45,i<6?100:40));rows.push(row(i,10,i<2?100:40));rows.push(row(i,5,i<2?100:50));}
 const c=computePulse(rows,NOW,5).providers.claude;
 assert.deepEqual(c.now,{installs:10,atLimit:20,medianUsed:50,latestAt:NOW-5*60000});assert.equal(c.previous.atLimit,60);assert.equal(c.buckets.length,48);
});
test('small groups stay hidden and Codex is never filled from Claude',()=>{
 const rows=[1,2,3,4].map(i=>row(i,5,100));const p=computePulse(rows,NOW,5);
 assert.equal(p.providers.claude.now,null);assert.ok(p.providers.claude.buckets.every(b=>b.atLimit===null));assert.equal(p.providers.codex.now,null);assert.equal(p.minInstalls,5);
});
test('weekly windows, expired resets and future rows are ignored',()=>{
 const rows=[];for(let i=0;i<6;i++){rows.push({...row(i,5,100),kind:'weekly'});rows.push({...row(i,5,100),reset:NOW-6*60000});rows.push(row(i,-30,100));}
 assert.equal(computePulse(rows,NOW,5).providers.claude.now,null);
});
test('quietest three-hour stretch uses the lowest share at limit',()=>{
 const rows=[];for(let h=0;h<24;h++)for(let i=0;i<6;i++){const t=Date.UTC(2026,10,3,h,15);rows.push({install:String(i),provider:'claude',kind:'five_hour',observed:t-86400000,used:(h>=2&&h<5)?20:(i<3?100:50),reset:t-86400000+H});}
 assert.deepEqual(computePulse(rows,NOW,5).providers.claude.quietest,{startHourUtc:2,hours:3,atLimit:0});
});

test('expired quotas and reports older than ten minutes do not count as current; history remains',()=>{
 const rows=[{...row('reset',5,95),reset:NOW-60000},row('old',11,50),row('fresh',1,35)];
 const p=computePulse(rows,NOW);assert.equal(p.reportingInstallations,1);assert.equal(p.providers.claude.now.medianUsed,35);assert.equal(p.providers.claude.now.installs,1);
 assert.ok(p.providers.claude.buckets.some(b=>b.installs>1));
 assert.equal(computePulse([row('gone',11,50)],NOW).providers.claude.now,null);
});
test('reporting count is distinct union across both providers, never max or sum',()=>{
 const rows=[row('same',1,20),row('same',1,30,'codex'),row('other',1,40,'codex')];
 const p=computePulse(rows,NOW);assert.equal(p.reportingInstallations,2);assert.equal(p.providers.claude.now.installs,1);assert.equal(p.providers.codex.now.installs,2);
 assert.equal(computePulse([row('a',1,20),row('b',1,40,'codex')],NOW).reportingInstallations,2);
});

test('after shutdown TTL, current sample disappears but last-known usage remains labelled historical',()=>{
 const p=computePulse([row('sleeping',11,35)],NOW);assert.equal(p.reportingInstallations,null);
 assert.equal(p.providers.claude.now,null);assert.equal(p.providers.claude.lastKnown.medianUsed,35);assert.equal(p.providers.claude.lastKnown.latestAt,NOW-11*60000);
});
