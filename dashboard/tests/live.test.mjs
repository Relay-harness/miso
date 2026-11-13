import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {chromium} from 'playwright';
const url=process.env.DASHBOARD_URL||'http://127.0.0.1:5173';let browser;
before(async()=>{browser=await chromium.launch({headless:true});});after(async()=>{await browser?.close();});
const js=ts.transpileModule(readFileSync(new URL('../src/live.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {isStargazers,starAgo,updatedAgo,smallAvatar}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const AV='https://avatars.githubusercontent.com/u/1?v=4';
const NOW=Date.now();
const stars=(extra={})=>({schema:1,total:12,weekCount:3,recent:[{login:'ada-l',avatar:AV,starredAt:NOW-3*3600000},{login:'bob',avatar:AV,starredAt:NOW-26*3600000}],source:'github-stargazers',...extra});
test('stargazer responses are validated and times are formatted from real timestamps',()=>{
 assert.ok(isStargazers(stars()));assert.ok(isStargazers(stars({total:null,weekCount:null,recent:[]})));
 assert.ok(!isStargazers({}));assert.ok(!isStargazers(stars({weekCount:-1})));
 assert.ok(!isStargazers(stars({recent:[{login:'x',avatar:'https://evil.example/a.png',starredAt:1}]})));
 assert.ok(!isStargazers(stars({recent:[{login:'bad login',avatar:AV,starredAt:1}]})));
 assert.equal(starAgo(NOW-30000,NOW),'just now');assert.equal(starAgo(NOW-3*3600000,NOW),'3h ago');assert.equal(starAgo(NOW-50*3600000,NOW),'2d ago');
 assert.equal(updatedAgo(NOW-2000,NOW),'just now');assert.equal(updatedAgo(NOW-12000,NOW),'12s ago');assert.equal(updatedAgo(NOW-180000,NOW),'3m ago');
 assert.equal(new URL(smallAvatar(AV)).searchParams.get('s'),'64');
});
async function open(s,downloads=()=>70,path='/'){
 const p=await browser.newPage();
 await p.route('**/api/allowance',r=>r.fulfill({json:{schema:1,method:'paired-controlled-workload-v1',generatedAt:Date.now(),freshnessMinutes:10,minCohort:10,currentDays:1,baselineDays:6,materialChangePercent:15,reportingInstallations:null,cohorts:[],limitations:[]}}));
 await p.route('**/api/limit-signal',r=>r.fulfill({json:{schema:1,generatedAt:Date.now(),minStated:3,providers:{claude:{posts:5,stated:0,percent:0,sources:['GitHub']},codex:{posts:5,stated:0,percent:0,sources:['GitHub']}},latest:[]}}));
 await p.route('**/api/downloads',r=>r.fulfill({json:{schema:1,total:downloads(),source:'github-release-zip-downloads'}}));
 await p.route('**/api/pulse',r=>r.fulfill({json:{schema:2,method:'daily-members-v1',generatedAt:Date.now(),cadenceHours:24,members:0,joinedToday:0,checkedInToday:0,providers:{claude:null,codex:null}}}));
 await p.route('**/api/stargazers',r=>r.fulfill({json:s}));
 await p.route('https://hn.algolia.com/**',r=>r.fulfill({json:{hits:[]}}));
 await p.route('https://avatars.githubusercontent.com/**',r=>r.fulfill({status:404,body:''}));
 await p.goto(url+path);return p;
}
test('the hero shows only real stargazers, real week count and a live updated time',async()=>{
 const p=await open(stars());
 await p.locator('.star-tick').waitFor();
 assert.match(await p.locator('.star-tick').innerText(),/@ada-l starred Miso · 3h ago/);
 assert.equal((await p.locator('.week-pill').innerText()).trim(),'+3 stars this week');
 assert.match(await p.locator('.live-flag').innerText(),/Live · updated (just now|\d+s ago)/);
 assert.equal(await p.locator('.face-stack img').count(),2);
 await p.waitForFunction(()=>document.querySelector('.download-count')?.textContent.startsWith('70+'));
 await p.close();
});
test('without stargazer data there is no momentum line and the fixed faces remain',async()=>{
 const p=await open({schema:1,total:null,weekCount:null,recent:[],source:'github-stargazers'});
 await p.locator('.live-flag').waitFor();
 assert.equal(await p.locator('.star-tick,.week-pill').count(),0);assert.equal(await p.locator('.face-stack img').count(),3);
 await p.close();
});
test('a zero week count shows no pill; reduced motion keeps the newest star without animation',async()=>{
 const p=await browser.newPage({reducedMotion:'reduce'});
 await p.route('**/api/**',r=>r.fulfill({json:/stargazers/.test(r.request().url())?stars({weekCount:0}):/downloads/.test(r.request().url())?{schema:1,total:70}:{}}));
 await p.route('https://hn.algolia.com/**',r=>r.fulfill({json:{hits:[]}}));await p.route('https://avatars.githubusercontent.com/**',r=>r.fulfill({status:404,body:''}));
 await p.goto(url);await p.locator('.star-tick').waitFor();
 assert.equal(await p.locator('.week-pill').count(),0);
 await p.locator('.claude .quota-segment.is-filled').nth(35).waitFor();
 assert.equal(await p.locator('.gauge-number strong').first().innerText(),'90%');
 assert.equal(await p.locator('.star-tick').evaluate(e=>getComputedStyle(e).animationName),'none');
 await p.close();
});
test('a higher download total from a later poll is highlighted; measured view has no live line',async()=>{
 let n=70;const p=await open(stars(),()=>n);
 await p.waitForFunction(()=>document.querySelector('.download-count')?.textContent.startsWith('70+'));
 n=130;await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
 await p.locator('.download-count .is-bumped').waitFor();await p.waitForFunction(()=>document.querySelector('.download-count')?.textContent.startsWith('130+'));
 await p.close();
 const m=await open(stars(),()=>70,'/?measured=1');await m.locator('.provider-row').first().waitFor();assert.equal(await m.locator('.live-meta,.star-tick,.week-pill').count(),0);await m.close();
});
