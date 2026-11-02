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
 const p=await browser.newPage({viewport:{width:1440,height:1000}});await setup(p);await p.locator('.claude .quota-segment.is-filled').first().waitFor();
 assert.equal(await p.locator('.claude .gauge-number strong').innerText(),'50');assert.equal(await p.locator('.claude .quota-segment.is-filled').count(),10);
 assert.equal(await p.locator('.baseline-marker').count(),2);assert.equal(await p.getByText('100% = baseline',{exact:true}).count(),2);
 assert.ok(await p.getByText('Experimental allowance estimate.',{exact:false}).isVisible());assert.ok(await p.locator('.claude').getByText('Estimated decrease',{exact:true}).isVisible());assert.ok(await p.locator('.claude .allowance-evidence').getByText('20 matched installs · uncertainty 40–60%',{exact:false}).isVisible());
 assert.equal(await p.getByText(/quota used · all plans|Near limit|LIMIT REACHED/).count(),0);
 await p.getByRole('button',{name:'Weekly',exact:true}).click();assert.equal(await p.locator('.claude .gauge-number strong').innerText(),'125');assert.equal(await p.locator('.claude .quota-segment.is-filled').count(),25);
 await p.getByText('How this is measured',{exact:true}).click();assert.ok(await p.getByText('The updated Mac app offers optional',{exact:false}).isVisible());await p.close();
});
test('insufficient and stale evidence never falls back to usage percentages or sample counts',async()=>{
 const p=await browser.newPage();await setup(p,{ready:false});await p.getByText('Insufficient evidence',{exact:true}).first().waitFor();assert.deepEqual(await p.locator('.gauge-number strong').allTextContents(),['—','—']);assert.equal(await p.locator('.checkin-row,.baseline-marker,.quota-segment.is-filled').count(),0);
 await p.unroute('**/api/allowance');await p.route('**/api/allowance',r=>r.fulfill({json:aggregate({stale:true})}));await p.getByRole('button',{name:'Refresh allowance evidence'}).click();await p.getByText('Evidence stale. Estimates hidden.',{exact:false}).waitFor();assert.equal(await p.locator('.gauge-number strong').first().innerText(),'—');await p.close();
});
test('usage-only or malformed API responses cannot become allowance evidence',async()=>{
 const p=await browser.newPage();await setup(p);await p.unroute('**/api/allowance');await p.route('**/api/allowance',r=>r.fulfill({json:{schema:1,generatedAt:Date.now(),minCohort:5,cohorts:[{medianUsed:100}]}}));await p.getByRole('button',{name:'Refresh allowance evidence'}).click();await p.getByText('Collector unavailable. No estimates.',{exact:false}).waitFor();assert.deepEqual(await p.locator('.gauge-number strong').allTextContents(),['—','—']);await p.close();
});
test('plan/model/context groups stay separate and unavailable selection is not silently replaced',async()=>{
 const p=await browser.newPage();const data=aggregate();data.cohorts.push({...data.cohorts[0],plan:'max_5x',model:'opus-4-5',index:100,status:'no_detectable_change',interval:[95,105]});
 await p.route('https://hn.algolia.com/**',r=>r.fulfill({json:{hits:[]}}));await p.route('**/api/allowance',r=>r.fulfill({json:data}));await p.goto(url);await p.getByLabel('Claude evidence group').waitFor();await p.getByLabel('Claude evidence group').selectOption('max_5x:opus-4-5:short:controlled-v1');assert.equal(await p.locator('.claude .gauge-number strong').innerText(),'100');
 await p.getByRole('button',{name:'Weekly',exact:true}).click();assert.equal(await p.locator('.claude .gauge-number strong').innerText(),'—');await p.close();
});
test('minimal connection link opens GitHub, not a provider login or automatic opt-in',async()=>{
 const p=await browser.newPage();await setup(p,{ready:false});const link=p.getByRole('link',{name:'Connect your cat',exact:true});assert.equal(await link.getAttribute('href'),'https://github.com/Relay-harness/miso');assert.equal(await p.locator('.site-header,.brand,.record-mark').count(),0);
 await p.route('https://github.com/Relay-harness/miso',r=>r.fulfill({contentType:'text/html',body:'<h1>Relay Cat</h1>'}));await link.click();await p.waitForURL('https://github.com/Relay-harness/miso');await p.close();
});
test('mobile, system theme, feed and collector failures remain usable',async()=>{
 const p=await browser.newPage({viewport:{width:390,height:844},colorScheme:'dark'});const errors=[];p.on('pageerror',e=>errors.push(e.message));await setup(p);await p.locator('.claude .quota-segment.is-filled').first().waitFor();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await p.emulateMedia({colorScheme:'light'});await p.waitForFunction(()=>document.documentElement.dataset.theme==='light');await p.screenshot({path:'/tmp/miso-allowance-mobile.png',fullPage:true});await p.setViewportSize({width:1440,height:1050});await p.screenshot({path:'/tmp/miso-allowance-desktop.png',fullPage:true});
 assert.ok(await p.getByRole('complementary',{name:'Recent internet posts'}).isVisible());await p.unroute('**/api/allowance');await p.route('**/api/allowance',r=>r.fulfill({status:503,json:{error:'offline'}}));await p.getByRole('button',{name:'Refresh allowance evidence'}).click();await p.getByText('Collector unavailable. No estimates.',{exact:false}).waitFor();assert.equal(await p.locator('.checkin-row').count(),0);assert.deepEqual(errors,[]);await p.close();
});
