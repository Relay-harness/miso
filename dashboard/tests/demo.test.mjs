import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.DASHBOARD_URL||'http://127.0.0.1:5173';let browser;
before(async()=>{browser=await chromium.launch({headless:true});});after(async()=>{await browser?.close();});
async function prepare(page,downloads=null){await page.route('**/api/downloads',r=>r.fulfill({json:{schema:1,total:downloads,source:'github-release-zip-downloads'}}));await page.route('https://hn.algolia.com/**',r=>r.fulfill({json:{hits:[]}}));await page.route('**/api/allowance',r=>r.fulfill({json:{schema:1,method:'paired-controlled-workload-v1',generatedAt:Date.now(),freshnessMinutes:10,minCohort:10,currentDays:1,baselineDays:6,materialChangePercent:15,reportingInstallations:null,cohorts:[],limitations:[]}}));}
test('hypothetical allowance demo is isolated from ingestion and live API',async()=>{
 const page=await browser.newPage();const requests=[];page.on('request',r=>{const path=new URL(r.url()).pathname;if(path==='/api/allowance'||path==='/api/community'||path.startsWith('/v1/'))requests.push(r.url());});await prepare(page);await page.goto(`${url}/?demo=1`);await page.getByLabel('Demo data notice').waitFor();await page.locator('.claude .quota-segment.is-filled').first().waitFor();
 assert.equal(await page.locator('.claude .gauge-number strong').innerText(),'65');assert.equal(await page.locator('.claude .quota-segment.is-filled').count(),26);assert.match(await page.locator('.claude .one-line').innerText(),/~3h 15m/);assert.equal(await page.locator('.codex .gauge-number strong').innerText(),'100');assert.equal(await page.locator('.day24,.live-stamp').count(),0);assert.equal(await page.locator('.checkin-row').count(),0);assert.ok(await page.getByText('Demo · made-up numbers',{exact:true}).isVisible());assert.equal(await page.locator('.join-count strong').innerText(),'200');assert.match(await page.locator('.join-count').innerText(),/make it 201/);assert.deepEqual(requests,[]);
 await page.getByRole('link',{name:'Exit demo'}).click();await page.getByText('No live Miso session connected yet.',{exact:true}).first().waitFor();assert.equal(await page.getByLabel('Demo data notice').count(),0);assert.ok(requests.length>0);await page.close();
});
test('live empty collector has no fictional results and demo fits narrow screens',async()=>{
 const page=await browser.newPage({viewport:{width:320,height:844}});await prepare(page);await page.goto(url);await page.getByText('No live Miso session connected yet.',{exact:true}).first().waitFor();assert.deepEqual(await page.locator('.gauge-number strong').allTextContents(),['-','-']);assert.equal(await page.locator('.checkin-row').count(),0);await page.getByText('Be one of the first 10 developers to add a Mac.').waitFor();
 await page.goto(`${url}/?demo=1`);await page.getByLabel('Demo data notice').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.close();
});

test('before anyone shares, the real download count is shown instead of an empty promise',async()=>{
 const page=await browser.newPage();await prepare(page,31);await page.goto(url);
 await page.getByText('downloads so far',{exact:false}).waitFor();
 assert.equal(await page.locator('.join-count strong').innerText(),'31');
 assert.match(await page.locator('.join-count').innerText(),/Live numbers appear once 1 Mac shares\./);
 await page.close();
});
