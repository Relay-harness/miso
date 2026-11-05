import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {chromium} from 'playwright';
const js=ts.transpileModule(readFileSync(new URL('../src/pulse-data.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {isPulse,createDemoPulse}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const url=process.env.DASHBOARD_URL||'http://127.0.0.1:5173';let browser;
before(async()=>{browser=await chromium.launch({headless:true});});after(async()=>{await browser?.close();});
test('member schema accepts the demo and rejects bad counts or numbers',()=>{
 const d=createDemoPulse(1800000000000);assert.equal(isPulse(d),true);
 for(const mutate of [p=>p.providers.claude.members=0,p=>p.providers.claude.atLimit=140,p=>p.members=-1,p=>p.joinedToday=p.members+1,p=>p.providers.codex.members=p.members+1,p=>p.method='quota-used',p=>p.schema=1,p=>p.cadenceHours=0.5])
  {const x=structuredClone(d);mutate(x);assert.equal(isPulse(x),false);}
 const empty=structuredClone(d);empty.members=0;empty.joinedToday=0;empty.checkedInToday=0;empty.providers={claude:null,codex:null};assert.equal(isPulse(empty),true);
});
async function open(page,pulse){await page.route('https://hn.algolia.com/**',r=>r.fulfill({json:{hits:[]}}));await page.route('**/api/allowance',r=>r.fulfill({json:{schema:1,method:'paired-controlled-workload-v1',generatedAt:Date.now(),freshnessMinutes:10,minCohort:10,currentDays:1,baselineDays:6,materialChangePercent:15,reportingInstallations:null,cohorts:[],limitations:[]}}));await page.route('**/api/pulse',r=>r.fulfill({json:pulse}));await page.goto(url);}
test('every member is counted, with daily wording and no live claims',async()=>{
 const p=await browser.newPage();await open(p,createDemoPulse(Date.now()));
 await p.locator('.claude .live-bit').waitFor();
 assert.match(await p.locator('.claude .one-line').innerText(),/Typical 5-hour usage: 60% used · 131 members/);
 assert.match(await p.locator('.claude .live-bit').innerText(),/23% of members at the limit/);
 assert.match(await p.locator('.live-status').innerText(),/142 Miso members · each Mac checks in once a day · 9 new today/);
 assert.equal(await p.locator('.join-count strong').innerText(),'142');assert.match(await p.locator('.join-count').innerText(),/Add yours and make it 143/);
 assert.doesNotMatch(await p.locator('.quota-board').innerText(),/\blive\b|right now|hitting the limit now|Refresh now|every 30s/i);
 assert.match(await p.title(),/^Claude 23% at limit/);await p.close();
});
test('members stay counted when nobody checked in today',async()=>{
 const p=await browser.newPage();const d=createDemoPulse(Date.now());d.members=70;d.joinedToday=0;d.checkedInToday=0;
 d.providers.claude={members:70,medianUsed:40,atLimit:0,updatedAt:Date.now()-30*3600000};d.providers.codex=null;
 await open(p,d);await p.getByText('70 members',{exact:false}).first().waitFor();
 assert.equal(await p.locator('.claude .gauge-number strong').innerText(),'40');assert.equal(await p.locator('.claude .quota-segment.is-filled').count(),16);
 assert.match(await p.locator('.claude .one-line').innerText(),/latest check-in 1d ago|latest check-in 30h ago/);
 assert.equal(await p.locator('.codex .gauge-number strong').innerText(),'-');await p.close();
});
test('empty or unreachable data never shows numbers',async()=>{
 const p=await browser.newPage();const d=createDemoPulse(Date.now());d.members=0;d.joinedToday=0;d.checkedInToday=0;d.providers={claude:null,codex:null};await open(p,d);
 await p.getByText('Waiting for the first Miso check-in.',{exact:true}).first().waitFor();await p.waitForTimeout(300);assert.equal(await p.locator('.live-bit').count(),0);assert.doesNotMatch(await p.title(),/%/);
 await p.unroute('**/api/pulse');await p.route('**/api/pulse',r=>r.fulfill({status:503,body:'unavailable'}));await p.evaluate(()=>window.dispatchEvent(new Event('online')));
 await p.getByText('Can’t reach the data right now.',{exact:false}).waitFor();await p.close();
});
test('install command can be copied',async()=>{
 const ctx=await browser.newContext({permissions:['clipboard-read','clipboard-write']});const p=await ctx.newPage();await open(p,createDemoPulse(Date.now()));
 await p.getByRole('button',{name:'Copy'}).click();await p.getByRole('button',{name:'Copied'}).waitFor();
 assert.equal(await p.evaluate(()=>navigator.clipboard.readText()),'brew install --cask relay-harness/tap/relay-cat');await ctx.close();
});
