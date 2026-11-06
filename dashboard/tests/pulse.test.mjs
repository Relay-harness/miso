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
const EMPTY_ALLOWANCE=()=>({schema:1,method:'paired-controlled-workload-v1',generatedAt:Date.now(),freshnessMinutes:10,minCohort:10,currentDays:1,baselineDays:6,materialChangePercent:15,reportingInstallations:null,cohorts:[],limitations:[]});
async function open(page,pulse){await page.route('https://api.github.com/**',r=>r.fulfill({json:{total_count:0,items:[],incomplete_results:false}}));await page.route('https://hn.algolia.com/**',r=>r.fulfill({json:{hits:[]}}));await page.route('**/api/allowance',r=>r.fulfill({json:{schema:1,method:'paired-controlled-workload-v1',generatedAt:Date.now(),freshnessMinutes:10,minCohort:10,currentDays:1,baselineDays:6,materialChangePercent:15,reportingInstallations:null,cohorts:[],limitations:[]}}));await page.route('**/api/pulse',r=>r.fulfill({json:pulse}));await page.goto(url);}
test('GitHub downloads show as milestones and usage stays out of the bars',async()=>{
 const p=await browser.newPage();await p.route('**/api/downloads',r=>r.fulfill({json:{schema:1,total:56,source:'github-release-zip-downloads'}}));await open(p,createDemoPulse(Date.now()));
 const count=p.locator('.live-status .download-count');await count.waitFor();assert.equal(await count.innerText(),'50+ downloads on GitHub');assert.equal(await count.getAttribute('href'),'https://github.com/Relay-harness/miso/releases');
 await p.locator('.claude .pressure-track[title*="Typical 5-hour use: 60%"]').waitFor();assert.match((await p.locator('.claude .one-line').innerText()).trim(),/^Last: Ultra plan dropped 5-hour limit · Oct 30(, 2026)? · Anthropic$/);assert.match(await p.locator('.claude .one-line span').getAttribute('title'),/Not measured by Miso/);assert.doesNotMatch(await p.locator('.claude').innerText(),/Typical/);
 assert.match(await p.locator('.claude .gauge-number strong').innerText(),/^0$/);assert.equal(await p.locator('.claude .day-bar').count(),7);assert.match(await p.locator('.claude .gauge-number').innerText(),/limit reports · 7 days/);assert.match(await p.locator('.codex .gauge-number strong').innerText(),/^0$/);assert.equal(await p.locator('.codex .day-bar').count(),7);assert.match((await p.locator('.codex .one-line').innerText()).trim(),/^Last: Pro plans doubled · Oct 29(, 2026)? · OpenAI$/);assert.match(await p.locator('.codex .one-line a').getAttribute('href'),/^https:\/\/help\.openai\.com\//);
 assert.doesNotMatch(await p.locator('.quota-board').innerText(),/\blive\b|\bmembers?\b|at the limit|check-in \d|Refresh now/i);
 assert.doesNotMatch(await p.title(),/%/);
 await p.unroute('**/api/downloads');await p.close();
 for(const [total,label] of [[31,'31 downloads on GitHub'],[64,'60+ downloads on GitHub'],[70,'70+ downloads on GitHub'],[89,'80+ downloads on GitHub'],[100,'100+ downloads on GitHub'],[1250,'1,200+ downloads on GitHub']]){
  const q=await browser.newPage();await q.route('**/api/downloads',r=>r.fulfill({json:{schema:1,total,source:'github-release-zip-downloads'}}));await open(q,createDemoPulse(Date.now()));
  await q.locator('.download-count').waitFor();assert.equal(await q.locator('.download-count').innerText(),label);await q.close();
 }
});
test('three GitHub photos overlap beside the count and link to the stargazers',async()=>{
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/7yMK/gAAAABJRU5ErkJggg==','base64');
 const p=await browser.newPage();await p.route('https://avatars.githubusercontent.com/**',r=>r.fulfill({contentType:'image/png',body:png}));
 await p.route('**/api/downloads',r=>r.fulfill({json:{schema:1,total:56,source:'github-release-zip-downloads'}}));await open(p,createDemoPulse(Date.now()));
 const imgs=p.locator('.face-stack img');await imgs.first().waitFor();assert.equal(await imgs.count(),3);
 assert.ok((await imgs.first().getAttribute('src')).startsWith('https://avatars.githubusercontent.com/u/'));
 assert.equal(await p.locator('.face-stack').getAttribute('href'),'https://github.com/Relay-harness/miso/stargazers');
 const [a,b]=[await imgs.nth(0).boundingBox(),await imgs.nth(1).boundingBox()];assert.ok(b.x<a.x+a.width,'photos overlap');
 assert.ok(await imgs.nth(0).evaluate(i=>getComputedStyle(i).borderRadius==='50%'));await p.close();
});
test('no download count from GitHub means no number, and bars still work',async()=>{
 const p=await browser.newPage();await p.route('**/api/downloads',r=>r.fulfill({json:{schema:1,total:null,source:'github-release-zip-downloads'}}));const d=createDemoPulse(Date.now());d.providers.codex=null;await open(p,d);
 await p.locator('.claude .one-line b').waitFor();assert.equal(await p.locator('.live-status').count(),0);assert.doesNotMatch((await p.locator('.codex .pressure-track').getAttribute('title'))||'',/Typical/);await p.close();
});
test('empty or unreachable data never shows numbers',async()=>{
 const p=await browser.newPage();const d=createDemoPulse(Date.now());d.members=0;d.joinedToday=0;d.checkedInToday=0;d.providers={claude:null,codex:null};await open(p,d);
 await p.locator('.claude .one-line').getByText('Last:',{exact:false}).waitFor();await p.waitForTimeout(300);assert.doesNotMatch((await p.locator('.claude .pressure-track').getAttribute('title'))||'',/Typical/);await p.waitForTimeout(300);assert.equal(await p.locator('.live-bit').count(),0);assert.doesNotMatch(await p.title(),/%/);
 await p.unroute('**/api/pulse');await p.route('**/api/pulse',r=>r.fulfill({status:503,body:'unavailable'}));await p.evaluate(()=>window.dispatchEvent(new Event('online')));
 await p.getByText('Can’t reach the data right now.',{exact:false}).waitFor();await p.close();
});
test('the figure is a live 7-day report count, one bar per day, and survives a failed source',async()=>{
 const t=Date.now(),iso=d=>new Date(t-d*86400000-3600000).toISOString(),unix=d=>Math.floor((t-d*86400000-3600000)/1000);
 const items=[0,0,0,3,9,10].map(d=>({created_at:iso(d)}));
 const hits=[{objectID:'1',title:'Claude usage limits cut',created_at_i:unix(1)},{objectID:'2',title:'Show HN: A Claude limit tracker',created_at_i:unix(1)},{objectID:'3',title:'Building with Claude',created_at_i:unix(1)}];
 const p=await browser.newPage();await p.route('**/api/downloads',r=>r.fulfill({json:{schema:1,total:null,source:'x'}}));await p.route('**/api/pulse',r=>r.fulfill({json:createDemoPulse(Date.now())}));await p.route('**/api/allowance',r=>r.fulfill({json:EMPTY_ALLOWANCE()}));
 await p.route('https://api.github.com/**',r=>r.fulfill({json:r.request().url().includes('claude-code')?{total_count:6,items,incomplete_results:false}:{total_count:0,items:[],incomplete_results:false}}));await p.route('https://hn.algolia.com/**',r=>r.fulfill({json:{hits}}));await p.goto(url);
 await p.locator('.claude .gauge-number strong',{hasText:'5'}).waitFor();
 assert.equal(await p.locator('.claude .day-bar').count(),7);assert.equal(await p.locator('.claude .day-bar:not(.is-zero)').count(),3);
 assert.equal(await p.locator('.claude .report-note').innerText(),'+150% vs last week · GitHub, Hacker News');
 assert.equal(await p.locator('.codex .gauge-number strong').innerText(),'0');assert.equal(await p.locator('.codex .day-bar.is-zero').count(),7);
 assert.doesNotMatch(await p.locator('.quota-board').innerText(),/No change announced/);await p.setViewportSize({width:320,height:700});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'fits a narrow phone');await p.close();
 const q=await browser.newPage();await q.route('**/api/downloads',r=>r.fulfill({json:{schema:1,total:null,source:'x'}}));await q.route('**/api/pulse',r=>r.fulfill({json:createDemoPulse(Date.now())}));await q.route('**/api/allowance',r=>r.fulfill({json:EMPTY_ALLOWANCE()}));
 await q.route('https://api.github.com/**',r=>r.fulfill({status:403,body:'limited'}));await q.route('https://hn.algolia.com/**',r=>r.fulfill({json:{hits}}));await q.goto(url);
 await q.locator('.claude .report-note').waitFor();assert.equal(await q.locator('.claude .report-note').innerText(),'Hacker News');assert.equal(await q.locator('.claude .gauge-number strong').innerText(),'1');await q.close();
 const n=await browser.newPage();await n.route('**/api/downloads',r=>r.fulfill({json:{schema:1,total:null,source:'x'}}));await n.route('**/api/pulse',r=>r.fulfill({json:createDemoPulse(Date.now())}));await n.route('**/api/allowance',r=>r.fulfill({json:EMPTY_ALLOWANCE()}));
 await n.route('https://api.github.com/**',r=>r.fulfill({status:503,body:'down'}));await n.route('https://hn.algolia.com/**',r=>r.fulfill({status:503,body:'down'}));await n.goto(url);
 await n.locator('.claude .one-line').getByText('Last:',{exact:false}).waitFor();await n.waitForTimeout(400);assert.equal(await n.locator('.claude .gauge-number strong').innerText(),'-');assert.equal(await n.locator('.day-bar').count(),0);await n.close();
});
test('install command can be copied',async()=>{
 const ctx=await browser.newContext({permissions:['clipboard-read','clipboard-write']});const p=await ctx.newPage();await open(p,createDemoPulse(Date.now()));
 await p.getByRole('button',{name:'Copy'}).click();await p.getByRole('button',{name:'Copied'}).waitFor();
 assert.equal(await p.evaluate(()=>navigator.clipboard.readText()),'brew install --cask relay-harness/tap/relay-cat');await ctx.close();
});
