import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {chromium} from 'playwright';
const js=ts.transpileModule(readFileSync(new URL('../src/pulse-data.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {isPulse,createDemoPulse}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const url=process.env.DASHBOARD_URL||'http://127.0.0.1:5173';let browser;
before(async()=>{browser=await chromium.launch({headless:true});});after(async()=>{await browser?.close();});
test('pulse schema accepts the demo and rejects tiny groups or bad numbers',()=>{
 const d=createDemoPulse(1800000000000);assert.equal(isPulse(d),true);
 for(const mutate of [p=>p.providers.claude.now.installs=0,p=>p.providers.claude.now.atLimit=140,p=>p.providers.codex.buckets.pop(),p=>p.method='quota-used'])
  {const x=structuredClone(d);mutate(x);assert.equal(isPulse(x),false);}
});
async function open(page,pulse){await page.route('https://hn.algolia.com/**',r=>r.fulfill({json:{hits:[]}}));await page.route('**/api/allowance',r=>r.fulfill({json:{schema:1,method:'paired-controlled-workload-v1',generatedAt:Date.now(),freshnessMinutes:10,minCohort:10,currentDays:1,baselineDays:6,materialChangePercent:15,reportingInstallations:null,cohorts:[],limitations:[]}}));await page.route('**/api/pulse',r=>r.fulfill({json:pulse}));await page.goto(url);}
test('live line and tab title show pressure right now with its direction',async()=>{
 const p=await browser.newPage();const d=createDemoPulse(Date.now());await open(p,d);
 const live=p.locator('.claude .live-bit');await live.waitFor();
 assert.match(await live.innerText(),/23% hitting the limit now ↓/);assert.match(await p.locator('.codex .live-bit').innerText(),/9% hitting the limit now ↑/);assert.equal(await p.locator('.day24,.live-stamp').count(),0);
 assert.equal(await p.locator('.now-strip,.dateline,.dev-note,.checkin-row').count(),0);
 assert.match(await p.title(),/^↓ Claude 23% at limit/);await p.close();
});
test('stale or empty pulse never shows numbers',async()=>{
 const p=await browser.newPage();const d=createDemoPulse(Date.now()-20*60000);await open(p,d);
 await p.getByText('No live Miso session connected yet.',{exact:true}).first().waitFor();await p.waitForTimeout(300);assert.equal(await p.locator('.live-bit').count(),0);assert.doesNotMatch(await p.title(),/%/);await p.close();
});
test('install command can be copied',async()=>{
 const ctx=await browser.newContext({permissions:['clipboard-read','clipboard-write']});const p=await ctx.newPage();await open(p,createDemoPulse(Date.now()));
 await p.getByRole('button',{name:'Copy'}).click();await p.getByRole('button',{name:'Copied'}).waitFor();
 assert.equal(await p.evaluate(()=>navigator.clipboard.readText()),'brew install --cask relay-harness/tap/relay-cat');await ctx.close();
});
