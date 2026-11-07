import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.DASHBOARD_URL||'http://127.0.0.1:5173';let browser;
before(async()=>{browser=await chromium.launch({headless:true});});after(async()=>{await browser?.close();});
const allowance=response=>new URL(response.url()).pathname==='/api/allowance';
async function prepare(page){await page.clock.install();await page.route('**/api/limit-signal',r=>r.fulfill({json:{schema:1,generatedAt:Date.now(),minStated:3,providers:{claude:{posts:0,stated:0,percent:0,sources:['GitHub','Hacker News']},codex:{posts:0,stated:0,percent:0,sources:['GitHub','Hacker News']}}}}));await page.route('https://hn.algolia.com/**',r=>r.fulfill({json:{hits:[]}}));}
test('live page polls the real read-only allowance API automatically after one minute',async()=>{
 const page=await browser.newPage();await prepare(page);let count=0;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/allowance')count++;});
 const first=page.waitForResponse(allowance);await page.goto(url);const firstResponse=await first;assert.equal(firstResponse.status(),200);assert.equal((await firstResponse.json()).method,'paired-controlled-workload-v1');
 await page.waitForFunction(()=>!document.querySelector('.status-label')?.textContent.includes('Updating'));
 const before=count,next=page.waitForResponse(allowance);await page.clock.fastForward(60000);const nextResponse=await next;assert.equal(nextResponse.status(),200);assert.ok(count>before);assert.equal((await nextResponse.json()).schema,1);assert.equal(await page.getByLabel('Demo data notice').count(),0);
 await page.close();
});
test('new results replace old bars on automatic refresh, without reloading the page',async()=>{
 const page=await browser.newPage();await prepare(page);let index=50;
 await page.route('**/api/allowance',route=>{const now=Date.now();return route.fulfill({json:{schema:1,method:'paired-controlled-workload-v1',generatedAt:now,freshnessMinutes:10,minCohort:10,currentDays:1,baselineDays:6,materialChangePercent:15,reportingInstallations:20,cohorts:[{provider:'claude',plan:'pro',kind:'five_hour',model:'sonnet-4-5',contextBand:'short',protocol:'controlled-v1',status:index===50?'decreased':'no_detectable_change',index,interval:index===50?[40,60]:[95,105],contributors:20,baselineIntervals:80,currentIntervals:60,latestAt:now-3600000}],limitations:[]}});});
 await page.goto(url);await page.locator('.claude .quota-segment.is-filled').first().waitFor();assert.equal(await page.locator('.claude .gauge-number strong').innerText(),'−50%');assert.equal(await page.locator('.claude .quota-segment.is-filled').count(),20);
 index=100;const next=page.waitForResponse(allowance);await page.clock.fastForward(60000);await next;await page.waitForFunction(()=>document.querySelector('.claude .gauge-number strong')?.textContent==='Normal');assert.equal(await page.locator('.claude .quota-segment.is-filled').count(),40);assert.match(await page.locator('.claude .one-line').innerText(),/No change · vs past week/);await page.close();
});
