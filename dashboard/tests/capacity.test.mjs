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
 await p.locator('.claude .quota-segment.is-filled').nth(35).waitFor();
 await p.waitForFunction(()=>[...document.querySelectorAll('.gauge-number strong')].map(e=>e.textContent).join()==='90%,85%');
 assert.equal(await p.locator('.claude .quota-segment.is-filled').count(),36);
 await p.locator('.codex .quota-segment.is-filled').nth(33).waitFor();
 assert.equal(await p.locator('.codex .quota-segment.is-filled').count(),34);
 await p.waitForFunction(()=>[...document.querySelectorAll('.member-count')].map(e=>e.textContent).join()==='46 Miso members,34 Miso members');
 assert.equal(await p.locator('.provider-row.is-configured').count(),2);
 assert.equal(await p.getByText(/preview/i).count(),0);
 assert.deepEqual((await p.locator('.one-line').allInnerTexts()).map(t=>t.trim()),['90% capacity','85% capacity']);
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
 await p.waitForFunction(()=>document.querySelector('.codex .gauge-number strong')?.textContent==='85%');
 assert.equal(await p.locator('.codex.is-configured').count(),1);
 await p.close();
});
test('configured values are never sent to the collector',async()=>{
 const sent=[];const p=await browser.newPage({reducedMotion:'reduce'});p.on('request',r=>{if(r.method()!=='GET'||/\b(90|85|46|34)\b/.test(r.postData()??''))sent.push(r.url());});
 await p.route('**/api/**',r=>r.fulfill({json:{}}));await p.route('https://hn.algolia.com/**',r=>r.fulfill({json:{hits:[]}}));
 await p.goto(url);await p.locator('.claude .quota-segment.is-filled').nth(35).waitFor();
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
test('with motion on, configured bars update live inside the 80-90% band',async()=>{
 const p=await open('/',undefined,{});
 await p.locator('.codex.is-settled').waitFor();await p.locator('.claude.is-settled').waitFor();await p.waitForTimeout(700);
 const seen=new Set();
 for(let i=0;i<14;i++){
  const v=await p.locator('.gauge-number strong').allInnerTexts();
  for(const x of v){const n=Number(x.replace('%',''));if(x.endsWith('%')&&n>0){assert.ok(n>=80&&n<=90,x);seen.add(x);}}
  await p.waitForTimeout(700);
 }
 assert.ok(seen.size>2,`expected changing values, saw ${[...seen]}`);
 assert.equal(await p.locator('.spark').count(),2);
 assert.equal(await p.locator('.provider-row.is-configured').count(),2);
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
