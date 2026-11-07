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
async function open(page,pulse){await page.route('**/api/limit-reports',r=>r.fulfill({json:{schema:1,generatedAt:Date.now(),windowDays:7,minReports:5,providers:{claude:{reports:0,percent:0},codex:{reports:0,percent:0}}}}));await page.route('https://hn.algolia.com/**',r=>r.fulfill({json:{hits:[]}}));await page.route('**/api/allowance',r=>r.fulfill({json:{schema:1,method:'paired-controlled-workload-v1',generatedAt:Date.now(),freshnessMinutes:10,minCohort:10,currentDays:1,baselineDays:6,materialChangePercent:15,reportingInstallations:null,cohorts:[],limitations:[]}}));await page.route('**/api/pulse',r=>r.fulfill({json:pulse}));await page.goto(url);}
test('GitHub downloads show as milestones and usage stays out of the bars',async()=>{
 const p=await browser.newPage();await p.route('**/api/downloads',r=>r.fulfill({json:{schema:1,total:56,source:'github-release-zip-downloads'}}));await open(p,createDemoPulse(Date.now()));
 const count=p.locator('.live-status .download-count');await count.waitFor();assert.equal(await count.innerText(),'50+ downloads on GitHub');assert.equal(await count.getAttribute('href'),'https://github.com/Relay-harness/miso/releases');
 await p.locator('.claude .pressure-track[title*="Typical 5-hour use: 60%"]').waitFor();assert.equal((await p.locator('.claude .one-line').innerText()).trim(),'Claude limit is normal · 0 people reported this week');assert.doesNotMatch(await p.locator('.claude').innerText(),/Typical/);
 assert.match(await p.locator('.claude .gauge-number strong').innerText(),/^Normal$/);assert.equal(await p.locator('.claude .quota-segment.is-filled').count(),40);assert.match(await p.locator('.codex .gauge-number strong').innerText(),/^Normal$/);
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
 await p.locator('.claude .one-line').getByText('limit is normal',{exact:false}).waitFor();await p.waitForTimeout(300);assert.doesNotMatch((await p.locator('.claude .pressure-track').getAttribute('title'))||'',/Typical/);await p.waitForTimeout(300);assert.equal(await p.locator('.live-bit').count(),0);assert.doesNotMatch(await p.title(),/%/);
 await p.unroute('**/api/pulse');await p.route('**/api/pulse',r=>r.fulfill({status:503,body:'unavailable'}));await p.evaluate(()=>window.dispatchEvent(new Event('online')));
 await p.getByText('Can’t reach the data right now.',{exact:false}).waitFor();await p.close();
});
test('the bar shows what people reported, in plain words, and never invents a number',async()=>{
 const body=(claude,codex={reports:0,percent:0})=>({schema:1,generatedAt:Date.now(),windowDays:7,minReports:5,providers:{claude,codex}});
 const page=async res=>{const p=await browser.newPage();await p.route('**/api/downloads',r=>r.fulfill({json:{schema:1,total:null,source:'x'}}));await p.route('https://hn.algolia.com/**',r=>r.fulfill({json:{hits:[]}}));await p.route('**/api/pulse',r=>r.fulfill({json:createDemoPulse(Date.now())}));await p.route('**/api/allowance',r=>r.fulfill({json:EMPTY_ALLOWANCE()}));await p.route('**/api/limit-reports',r=>typeof res==='number'?r.fulfill({status:res,body:'down'}):r.fulfill({json:res}));await p.goto(url);return p;};
 const p=await page(body({reports:14,percent:-30},{reports:9,percent:10}));
 await p.locator('.claude .gauge-number strong',{hasText:'−30%'}).waitFor();
 assert.equal((await p.locator('.claude .one-line').innerText()).trim(),'Claude limit decreased by 30% · 14 people reported this week');assert.equal(await p.locator('.claude .quota-segment.is-filled').count(),28);assert.equal(await p.locator('.claude .quota-segment.is-lost').count(),12);
 assert.equal(await p.locator('.codex .gauge-number strong').innerText(),'Increased');assert.equal((await p.locator('.codex .one-line').innerText()).trim(),'OpenAI limit increased · 9 people reported this week');assert.equal(await p.locator('.codex .quota-segment.is-filled').count(),40);
 assert.match(await p.locator('.claude .pressure-track').getAttribute('title'),/What people reported, not a measurement/);
 assert.doesNotMatch(await p.locator('.quota-board').innerText(),/No change announced|Complaints|limit reports/);assert.equal(await p.locator('.day-bar').count(),0);
 await p.setViewportSize({width:320,height:700});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'fits a narrow phone');await p.close();
 const one=await page(body({reports:1,percent:0}));await one.locator('.claude .gauge-number strong',{hasText:'Normal'}).waitFor();assert.equal((await one.locator('.claude .one-line').innerText()).trim(),'Claude limit is normal · 1 person reported this week');assert.equal(await one.locator('.claude .quota-segment.is-filled').count(),40);await one.close();
 const none=await page(503);await none.locator('.claude .one-line').getByText('Last:',{exact:false}).waitFor();await none.waitForTimeout(400);assert.equal(await none.locator('.claude .gauge-number strong').innerText(),'-','no data is not normal');assert.equal(await none.locator('.quota-segment.is-filled').count(),0);await none.close();
 const bad=await page({schema:1,generatedAt:Date.now(),windowDays:7,minReports:5,providers:{claude:{reports:9,percent:-99},codex:{reports:0,percent:0}}});await bad.waitForTimeout(400);assert.equal(await bad.locator('.claude .gauge-number strong').innerText(),'-','a malformed response shows no number');await bad.close();
});
test('filing a report takes one tap, updates the bar and remembers the choice',async()=>{
 const p=await browser.newPage();await p.route('**/api/downloads',r=>r.fulfill({json:{schema:1,total:null,source:'x'}}));await p.route('https://hn.algolia.com/**',r=>r.fulfill({json:{hits:[]}}));await p.route('**/api/pulse',r=>r.fulfill({json:createDemoPulse(Date.now())}));await p.route('**/api/allowance',r=>r.fulfill({json:EMPTY_ALLOWANCE()}));
 const posted=[];let fail=false;const summary=(reports,percent)=>({schema:1,generatedAt:Date.now(),windowDays:7,minReports:5,providers:{claude:{reports,percent},codex:{reports:0,percent:0}}});
 await p.route('**/api/limit-reports',r=>{if(r.request().method()==='POST'){if(fail)return r.fulfill({status:503,body:'x'});posted.push(r.request().postDataJSON());return r.fulfill({json:summary(5,-20)});}return r.fulfill({json:summary(4,0)});});await p.goto(url);
 await p.getByText('How is your Claude limit?').waitFor();assert.equal(await p.locator('.claude .limit-report-buttons button').count(),5);assert.deepEqual(await p.locator('.claude .limit-report-buttons button').allInnerTexts(),['−30%','−20%','−10%','Normal','Increased']);
 fail=true;await p.locator('.claude .limit-report-buttons button',{hasText:'−20%'}).click();await p.getByText('Couldn’t send that. Try again.').waitFor();assert.equal(await p.locator('.claude .gauge-number strong').innerText(),'Normal');
 fail=false;await p.locator('.claude .limit-report-buttons button',{hasText:'−20%'}).click();await p.getByText('Thanks. Your report is in.').waitFor();
 assert.deepEqual(posted,[{provider:'claude',percent:-20}]);assert.equal(await p.locator('.claude .gauge-number strong').innerText(),'−20%');assert.equal(await p.locator('.claude .limit-report-buttons button[aria-pressed="true"]').innerText(),'−20%');
 assert.equal(await p.locator('.codex .limit-report-buttons button[aria-pressed="true"]').count(),0);await p.reload();await p.getByText('Thanks. Your report is in.').waitFor();await p.close();
});
test('install command can be copied',async()=>{
 const ctx=await browser.newContext({permissions:['clipboard-read','clipboard-write']});const p=await ctx.newPage();await open(p,createDemoPulse(Date.now()));
 await p.getByRole('button',{name:'Copy'}).click();await p.getByRole('button',{name:'Copied'}).waitFor();
 assert.equal(await p.evaluate(()=>navigator.clipboard.readText()),'brew install --cask relay-harness/tap/relay-cat');await ctx.close();
});
