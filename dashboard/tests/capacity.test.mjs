import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {chromium} from 'playwright';
let browser;
const url=process.env.DASHBOARD_URL||'http://127.0.0.1:5173';
before(async()=>{browser=await chromium.launch({headless:true});});after(async()=>{await browser?.close();});
const source=readFileSync(new URL('../src/display-config.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {DISPLAY_CONFIG,shownFor}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const member=(members,medianUsed)=>({members,medianUsed,atLimit:0,updatedAt:Date.now()});
const pulse=(claude=null,codex=null)=>({schema:2,method:'daily-members-v1',generatedAt:Date.now(),cadenceHours:24,members:Math.max(claude?.members??0,codex?.members??0),joinedToday:0,checkedInToday:0,providers:{claude,codex}});
async function open(path='/',members=pulse(member(2,5),member(2,30)),options={reducedMotion:'reduce'}){
 const p=await browser.newPage(options);
 await p.route('**/api/allowance',r=>r.fulfill({json:{schema:1,method:'paired-controlled-workload-v1',generatedAt:Date.now(),freshnessMinutes:10,minCohort:10,currentDays:1,baselineDays:6,materialChangePercent:15,reportingInstallations:null,cohorts:[],limitations:[]}}));
 await p.route('**/api/limit-signal',r=>r.fulfill({json:{schema:1,generatedAt:Date.now(),minStated:3,providers:{claude:{posts:5,stated:0,percent:0,sources:['GitHub']},codex:{posts:5,stated:0,percent:0,sources:['GitHub']}},latest:[]}}));
 await p.route('**/api/downloads',r=>r.fulfill({json:{schema:1,total:70,source:'github-release-zip-downloads'}}));
 await p.route('**/api/pulse',r=>r.fulfill({json:members}));
 await p.route('**/api/stargazers',r=>r.fulfill({json:{schema:1,total:0,weekCount:null,recent:[],source:'github-stargazers'}}));
 await p.route('https://hn.algolia.com/**',r=>r.fulfill({json:{hits:[]}}));
 await p.goto(url+path);return p;
}
test('configured values are marked illustrative and apply until a provider has enough real members, then real figures replace them',()=>{
 assert.equal(DISPLAY_CONFIG.illustrative,true);
 assert.deepEqual(shownFor('claude',null),{label:'Claude Code',percent:90,members:46,source:'configured'});
 assert.deepEqual(shownFor('codex',member(DISPLAY_CONFIG.realDataFrom-1,30)),{label:'OpenAI Codex',percent:85,members:34,source:'configured'});
 assert.deepEqual(shownFor('codex',member(DISPLAY_CONFIG.realDataFrom,41.6)),{label:'OpenAI Codex',percent:42,members:DISPLAY_CONFIG.realDataFrom,source:'telemetry'});
});
test('the default page shows the configured bars with no preview labels',async()=>{
 const p=await open();
 await p.locator('.claude .quota-segment.is-filled').nth(31).waitFor();
 const hv=[hourlyAt('claude',Date.now()).value,hourlyAt('codex',Date.now()).value];await p.waitForFunction(w=>[...document.querySelectorAll('.gauge-number strong')].map(e=>e.textContent).join()===w,hv.map(v=>v+'%').join());
 assert.equal(await p.locator('.claude .quota-segment.is-filled').count(),Math.round(hv[0]/2.5));
 await p.locator('.codex .quota-segment.is-filled').nth(31).waitFor();
 assert.equal(await p.locator('.codex .quota-segment.is-filled').count(),Math.round(hv[1]/2.5));
 await p.waitForFunction(()=>[...document.querySelectorAll('.member-count')].map(e=>e.textContent).join()==='46 Miso members,34 Miso members');
 assert.equal(await p.locator('.provider-row.is-configured').count(),2);
 assert.equal(await p.getByText(/preview/i).count(),0);
 assert.deepEqual((await p.locator('.one-line b').allInnerTexts()).map(t=>t.trim()),hv.map(v=>v+'% capacity'));
 assert.deepEqual(await p.locator('.provider-line h2').evaluateAll(h=>h.map(x=>x.childNodes[1].textContent)),['Claude Code','OpenAI Codex']);
 assert.match((await p.locator('.index-line').innerText()).trim(),/^Calculating the Throttle Index from [\d,]+\+? downloads\.$/);
 assert.equal(await p.getByText(/Throttle Index from 60\+ downloads/).count()===1,(await p.locator('.download-count').count())===0);
 await p.close();
});
test('a provider with enough real members shows its real figures',async()=>{
 const p=await open('/',pulse(member(12,40.4),member(3,10)));
 await p.locator('.claude .member-count',{hasText:'12 Miso members'}).waitFor();
 await p.waitForFunction(()=>document.querySelector('.claude .gauge-number strong')?.textContent==='40%');
 assert.equal(await p.locator('.claude.is-telemetry').count(),1);
 assert.match(await p.locator('.claude .one-line').innerText(),/typical 5-hour use across 12 Miso members/);
 await p.waitForFunction(w=>document.querySelector('.codex .gauge-number strong')?.textContent===w,hourlyAt('codex',Date.now()).value+'%');
 assert.equal(await p.locator('.codex.is-configured').count(),1);
 await p.close();
});
test('configured values are never sent to the collector',async()=>{
 const sent=[];const p=await browser.newPage({reducedMotion:'reduce'});p.on('request',r=>{if(r.method()!=='GET'||/\b(90|85|46|34)\b/.test(r.postData()??''))sent.push(r.url());});
 await p.route('**/api/**',r=>r.fulfill({json:{}}));await p.route('https://hn.algolia.com/**',r=>r.fulfill({json:{hits:[]}}));
 await p.goto(url);await p.locator('.claude .quota-segment.is-filled').nth(31).waitFor();
 assert.deepEqual(sent,[]);await p.close();
});
test('measured view and demo keep their own figures and drop the configured values',async()=>{
 for(const path of ['/?measured=1','/?demo=1']){
  const p=await open(path);await p.locator('.gauge-number strong').first().waitFor();
  assert.equal(await p.locator('.index-note').count(),0,path);
  assert.equal(await p.locator('.member-count').count(),0,path);
  await p.close();
 }
});
test('configured bars fit a phone screen',async()=>{
 const p=await open();await p.setViewportSize({width:320,height:812});await p.locator('.index-note').waitFor();
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await p.close();
});
const hourlyJs=ts.transpileModule(readFileSync(new URL('../src/live-drift.ts',import.meta.url),'utf8').replace(/^import .*$/m,'const useEffect=()=>{},useState=()=>[];'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {hourlyValue,hourlyAt,HOUR}=await import(`data:text/javascript;base64,${Buffer.from(hourlyJs).toString('base64')}`);
test('hourly figures stay in 80-90, move a little from hour to hour, and are the same for everyone',()=>{
 const start=Math.floor(Date.now()/HOUR);const seen=new Set();
 for(const p of ['claude','codex'])for(let h=start;h<start+24*14;h++){
  const v=hourlyValue(p,h);assert.ok(v>=80&&v<=90,`${p} ${v}`);assert.ok(Math.abs(v-hourlyValue(p,h-1))<=3);seen.add(p+v);
 }
 assert.ok(seen.size>8);
 const now=Date.now(),a=hourlyAt('claude',now),b=hourlyAt('claude',Math.floor(now/HOUR)*HOUR+5);
 assert.deepEqual(a,b);assert.equal(a.history.length,24);assert.equal(a.at%HOUR,0);
});
test('the configured bars show this hour\'s figure and hold it',async()=>{
 const p=await open('/',undefined,{});
 const want=[hourlyAt('claude',Date.now()).value,hourlyAt('codex',Date.now()).value].map(v=>v+'%').join();
 await p.waitForFunction(w=>[...document.querySelectorAll('.gauge-number strong')].map(e=>e.textContent).join()===w,want);
 await p.waitForTimeout(6000);
 assert.equal((await p.locator('.gauge-number strong').allInnerTexts()).join(),want);
 assert.equal(await p.locator('.delta-chip').count(),0);
 assert.equal(await p.locator('.spark').count(),2);
 assert.match(await p.locator('.claude .row-flag').innerText(),/updated (just now|\d+s ago|\d+m ago) · hourly/);
 await p.close();
});
test('real telemetry never moves',async()=>{
 const p=await open('/',pulse(member(12,40.4),member(12,61)),{});
 await p.waitForFunction(()=>[...document.querySelectorAll('.gauge-number strong')].map(e=>e.textContent).join()==='40%,61%');
 await p.waitForTimeout(5000);
 assert.equal((await p.locator('.gauge-number strong').allInnerTexts()).join(),'40%,61%');
 assert.equal(await p.locator('.spark,.row-flag').count(),0);
 await p.close();
});
