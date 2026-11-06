import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
let browser;const url=process.env.DASHBOARD_URL||'http://127.0.0.1:5173';
before(async()=>{browser=await chromium.launch({headless:true});});after(async()=>{await browser?.close();});
function aggregate({ready=true,stale=false,status='decreased',index=50}={}){
 const cohorts=[];
 for(const provider of ['claude','codex'])for(const kind of ['five_hour','weekly'])cohorts.push({provider,plan:provider==='claude'?'pro':'plus',kind,model:provider==='claude'?'sonnet-4-5':'gpt-5-2-codex',contextBand:'short',protocol:'controlled-v1',status:ready?(kind==='weekly'?'increased':status):'insufficient',index:ready?(kind==='five_hour'?index:125):null,interval:ready?(kind==='five_hour'?[40,60]:[120,135]):null,contributors:ready?20:null,baselineIntervals:ready?80:null,currentIntervals:ready?60:null,latestAt:ready?Date.now()-3600000:null});
 return {schema:1,method:'paired-controlled-workload-v1',generatedAt:Date.now()-(stale?700000:0),freshnessMinutes:10,minCohort:10,currentDays:1,baselineDays:6,materialChangePercent:15,reportingInstallations:ready?20:null,cohorts,limitations:[]};
}
async function setup(page,options={}){await page.route('https://hn.algolia.com/**',r=>r.fulfill({json:{hits:[]}}));await page.route('**/api/allowance',r=>r.fulfill({json:aggregate(options)}));await page.goto(url);}
test('allowance baseline, windows, uncertainty and bar scale do not display quota consumption',async()=>{
 const p=await browser.newPage({viewport:{width:1440,height:1000}});await setup(p);await p.locator('.claude .quota-segment.is-filled').first().waitFor();assert.equal(await p.locator('.claude .gauge-number strong').innerText(),'−50%');assert.equal(await p.locator('.claude .quota-segment.is-filled').count(),20);assert.equal(await p.locator('.claude .quota-segment.is-lost').count(),20);assert.equal((await p.locator('.claude .one-line').innerText()).trim(),'Limit cut · vs past week · 20 Macs');
 assert.match(await p.locator('.claude .pressure-track').getAttribute('aria-label'),/Limit cut by 50%/);assert.match(await p.locator('.claude .pressure-track').getAttribute('title'),/Likely −40 to −60%/);assert.match(await p.locator('.claude .pressure-track').getAttribute('title'),/20 Pro users on Sonnet 4\.5/);
 assert.equal(await p.getByText(/quota used · all plans|Near limit|LIMIT REACHED/).count(),0);
 assert.equal(await p.getByText('Why this exists').count(),0);await p.close();
});
test('insufficient and stale evidence falls back to the last announcement, never usage or sample counts',async()=>{
 const p=await browser.newPage();await setup(p,{ready:false});await p.locator('.claude .one-line').getByText('Announced',{exact:false}).waitFor();assert.deepEqual(await p.locator('.gauge-number strong').allTextContents(),['−17%','+100%']);assert.equal(await p.locator('.checkin-row').count(),0);
 await p.unroute('**/api/allowance');await p.route('**/api/allowance',r=>r.fulfill({json:aggregate({stale:true})}));await p.reload();await p.getByText('Allowance evidence is stale.',{exact:false}).waitFor();assert.equal(await p.locator('.gauge-number strong').first().innerText(),'−17%');await p.close();
});
test('usage-only or malformed API responses cannot become allowance evidence',async()=>{
 const p=await browser.newPage();await setup(p);await p.unroute('**/api/allowance');await p.route('**/api/allowance',r=>r.fulfill({json:{schema:1,generatedAt:Date.now(),minCohort:5,cohorts:[{medianUsed:100}]}}));await p.reload();await p.getByText('Can’t reach the data right now.',{exact:false}).waitFor();assert.deepEqual(await p.locator('.gauge-number strong').allTextContents(),['−17%','+100%']);await p.close();
});
test('plan/model/context groups stay separate and unavailable selection is not silently replaced',async()=>{
 const p=await browser.newPage();const data=aggregate();data.cohorts.push({...data.cohorts[0],plan:'max_5x',model:'opus-4-5',index:100,status:'no_detectable_change',interval:[95,105]});
 await p.route('https://hn.algolia.com/**',r=>r.fulfill({json:{hits:[]}}));await p.route('**/api/allowance',r=>r.fulfill({json:data}));await p.goto(url);await p.getByLabel('Claude evidence group').first().waitFor();await p.getByLabel('Claude evidence group').first().selectOption('max_5x:opus-4-5:short:controlled-v1');assert.equal(await p.locator('.claude .gauge-number strong').innerText(),'Normal');assert.equal(await p.locator('.claude .quota-segment.is-filled').count(),40);await p.close();
});
test('navbar has only the wordmark and a Star on GitHub button',async()=>{
 const p=await browser.newPage();await setup(p,{ready:false});
 const nav=p.getByRole('navigation',{name:'Site'});
 assert.equal(await nav.getByRole('link').count(),2);
 assert.equal(await nav.getByRole('link',{name:'Star on GitHub'}).getAttribute('href'),'https://github.com/Relay-harness/miso');
 assert.equal(await nav.getByText('Download Miso').count(),0);
 await p.close();
});
test('mobile, system theme, feed and collector failures remain usable',async()=>{
 const p=await browser.newPage({viewport:{width:390,height:844},colorScheme:'dark'});const errors=[];p.on('pageerror',e=>errors.push(e.message));await setup(p);await p.locator('.claude .quota-segment.is-filled').first().waitFor();assert.equal(await p.locator('.claude .gauge-number strong').innerText(),'−50%');assert.equal(await p.locator('.claude .quota-segment.is-filled').count(),20);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await p.emulateMedia({colorScheme:'light'});await p.waitForTimeout(200);assert.equal(await p.evaluate(()=>document.documentElement.dataset.theme),'dark');await p.screenshot({path:'/tmp/miso-allowance-mobile.png',fullPage:true});await p.setViewportSize({width:1440,height:1050});await p.screenshot({path:'/tmp/miso-allowance-desktop.png',fullPage:true});
 assert.ok(await p.getByRole('complementary',{name:'Recent internet posts'}).isVisible());await p.unroute('**/api/allowance');await p.route('**/api/allowance',r=>r.fulfill({status:503,json:{error:'offline'}}));await p.reload();await p.getByText('Can’t reach the data right now.',{exact:false}).waitFor();assert.equal(await p.locator('.checkin-row').count(),0);assert.deepEqual(errors,[]);await p.close();
});

test('one dark theme, two font families, and Miso sleeps on the install command',async()=>{
 const p=await browser.newPage({viewport:{width:1440,height:1200},colorScheme:'light'});await setup(p);
 await p.getByRole('heading',{name:'Help make this dashboard more accurate.'}).waitFor();
 assert.equal(await p.evaluate(()=>document.documentElement.dataset.theme),'dark');
 const fonts=await p.evaluate(()=>[...new Set([...document.querySelectorAll('body *')].map(e=>getComputedStyle(e).fontFamily.split(',')[0].replaceAll('"','')))]);
 assert.ok(fonts.length<=3&&fonts.every(f=>['Geist Sans','Geist Mono'].includes(f)),fonts.join());
 assert.equal(await p.getByText('For folks on macOS',{exact:true}).count(),1);
 const cat=p.getByRole('img',{name:'Miso the cat, asleep on your terminal'});assert.ok(await cat.isVisible());
 assert.match(await cat.evaluate(e=>getComputedStyle(e).backgroundImage),/miso-sleeping\.png/);
 assert.equal(await p.evaluate(()=>/[\u2014\u2013]/.test(document.body.innerText)),false);
 await p.close();
});
