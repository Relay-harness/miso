import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
let browser;
const url=process.env.DASHBOARD_URL||'http://127.0.0.1:5173';
before(async()=>{browser=await chromium.launch({headless:true});});after(async()=>{await browser?.close();});
async function mock(page,fail=false){
 await page.route('**/api/allowance',r=>r.fulfill({json:{schema:1,method:'paired-controlled-workload-v1',generatedAt:Date.now(),freshnessMinutes:10,minCohort:10,currentDays:1,baselineDays:6,materialChangePercent:15,reportingInstallations:null,cohorts:[],limitations:[]}}));
 await page.route('**/api/reports',r=>r.fulfill({json:{schema:1,generatedAt:Date.now(),providers:{claude:{days:[0,0,0,0,0,0,0],total:0,prior:0,capped:false,sources:['GitHub','Hacker News']},codex:{days:[0,0,0,0,0,0,0],total:0,prior:0,capped:false,sources:['GitHub','Hacker News']}}}}));await page.route('https://hn.algolia.com/**',async route=>{
  if(fail){await route.abort();return;}
  const query=new URL(route.request().url()).searchParams.get('query');const provider=query.startsWith('Claude')?'Claude':query.startsWith('Gemini')?'Gemini':'OpenAI';
  const label=provider==='OpenAI'?'Codex':provider;const offset={Claude:1,OpenAI:2,Gemini:3}[provider];
  const hits=Array.from({length:6},(_,i)=>({objectID:String(offset*100+i),title:i%2===0?`${label} Pro session limit reduced from 80 to ${20+i} prompts`:`I hit ${label} Pro weekly quota after ${20+i} prompts`,author:'neighbor',created_at_i:Math.floor(Date.now()/1000)-offset*10-i,points:9+i,num_comments:i}));
  hits.push({objectID:String(offset*100+99),title:`Building with ${label}: a new launch`,author:'promotion',created_at_i:Math.floor(Date.now()/1000),points:900,num_comments:500});
  await route.fulfill({json:{hits}});
 });
}
test('one core message leads directly into current conversations; filters and pagination work',async()=>{const p=await browser.newPage();p.setDefaultTimeout(10000);await mock(p);await p.goto(url);await p.getByRole('button',{name:'More reports →',exact:true}).click();await p.getByRole('dialog').waitFor();await p.locator('.stories li').first().waitFor();assert.equal(await p.locator('h1').count(),1);assert.equal(await p.locator('.stories li').count(),12);assert.equal(await p.locator('.commons').count(),0);await p.getByRole('button',{name:'More conversations'}).click();assert.equal(await p.locator('.stories li').count(),18);await p.locator('.provider-tabs').getByRole('button',{name:'Gemini',exact:true}).click();assert.equal(await p.locator('.stories li').count(),6);await p.getByRole('checkbox',{name:'Allowance changes only'}).check();assert.equal(await p.locator('.stories li').count(),3);assert.equal(await p.locator('.stories li').filter({hasText:'Building with'}).count(),0);assert.ok((await p.locator('.elsewhere').getByRole('link',{name:'Reddit'}).getAttribute('href')).includes('Gemini'));await p.getByRole('button',{name:'Refresh stories'}).click();await p.getByRole('button',{name:'Refresh stories'}).waitFor({state:'visible'});await p.close();});
test('source failure stays empty and never fabricates a story',async()=>{const p=await browser.newPage();await mock(p,true);await p.goto(url);await p.getByRole('button',{name:'More reports →',exact:true}).click();await p.getByRole('heading',{name:'We couldn’t reach the source.'}).waitFor();assert.equal(await p.locator('.stories li').count(),0);await p.getByText('Sources & coverage',{exact:true}).click();assert.ok(await p.getByText('Reddit and X are search links only.',{exact:false}).isVisible());await p.close();});
test('mobile hierarchy, the single dark theme and external links remain usable',async()=>{const p=await browser.newPage({viewport:{width:390,height:844},colorScheme:'dark'});const errors=[];p.on('pageerror',e=>errors.push(e.message));await mock(p);await p.goto(url);await p.getByRole('button',{name:'More reports →',exact:true}).click();await p.locator('.lead-story').waitFor();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await p.locator('h1').isVisible());assert.ok(await p.getByRole('dialog').isVisible());await p.keyboard.press('Escape');await p.emulateMedia({colorScheme:'light'});await p.waitForTimeout(200);assert.equal(await p.locator('html').getAttribute('data-theme'),'dark');await p.screenshot({path:'/tmp/miso-focused-mobile.png',fullPage:true});await p.setViewportSize({width:1440,height:1000});await p.screenshot({path:'/tmp/miso-focused-desktop.png',fullPage:true});assert.deepEqual(errors,[]);await p.close();});

test('dashboard preview leads with concrete comparisons and excludes popular generic launches',async()=>{
 const p=await browser.newPage();await mock(p);await p.goto(url);await p.locator('.internet-brief li').first().waitFor();
 assert.equal(await p.locator('.internet-brief li').count(),3);
 for(const title of await p.locator('.internet-brief li>a').allTextContents())assert.match(title,/session limit reduced from 80 to/);
 assert.equal(await p.locator('.internet-brief').getByText(/Building with/).count(),0);
 assert.match(await p.locator('.internet-brief li>a').first().getAttribute('title'),/by neighbor · Before\/after comparison/);
 assert.equal(await p.locator('.brief-report-context,.internet-brief .brief-searches').count(),0);
 assert.match(await p.locator('.post-who').first().innerText(),/Hacker News/);assert.equal(await p.locator('.post .avatar').count(),3);
 assert.match(await p.locator('.brief-state').textContent(),/unverified/);assert.ok(await p.getByRole('heading',{name:'What folks are saying'}).isVisible());
 for(const link of await p.locator('.internet-brief li>a').all())assert.match(await link.getAttribute('href'),/^https:\/\/news\.ycombinator\.com\/item\?id=\d+$/);
 await p.close();
});
test('only low-signal source results leave both views empty rather than fill space',async()=>{
 const p=await browser.newPage();await mock(p);
 await p.route('**/api/reports',r=>r.fulfill({json:{schema:1,generatedAt:Date.now(),providers:{claude:{days:[0,0,0,0,0,0,0],total:0,prior:0,capped:false,sources:['GitHub','Hacker News']},codex:{days:[0,0,0,0,0,0,0],total:0,prior:0,capped:false,sources:['GitHub','Hacker News']}}}}));await p.route('https://hn.algolia.com/**',r=>r.fulfill({json:{hits:[{objectID:'9999',title:'Building with Claude: a new launch',author:'promotion',created_at_i:Math.floor(Date.now()/1000),points:999,num_comments:500}]}}));
 await p.goto(url);await p.getByText('No specific quota reports in the last 90 days.',{exact:true}).waitFor();
 assert.equal(await p.locator('.internet-brief li').count(),0);
 await p.getByRole('button',{name:'More reports →',exact:true}).click();await p.getByRole('heading',{name:'No posts match this filter.'}).waitFor();
 assert.equal(await p.locator('.stories li').count(),0);await p.close();
});
