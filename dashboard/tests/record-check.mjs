import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1050},colorScheme:'light'});
 await page.route('**/api/limit-reports',r=>r.fulfill({json:{schema:1,generatedAt:Date.now(),windowDays:7,minReports:5,providers:{claude:{reports:0,percent:0},codex:{reports:0,percent:0}}}}));await page.route('https://hn.algolia.com/**',r=>r.fulfill({json:{hits:[]}}));
 const base=process.env.DASHBOARD_URL||'http://127.0.0.1:8787';
 await page.goto(base);await page.waitForFunction(()=>!document.querySelector('.status-label')?.textContent.includes('Updating'));
 await page.screenshot({path:'/tmp/miso-allowance-live-desktop.png',fullPage:true});
 await page.goto(`${base}/?demo=1`);await page.locator('.quota-segment.is-filled').first().waitFor();await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:'/tmp/miso-allowance-demo-desktop.png',fullPage:true});
 for(const width of [320,360,390,768,1024,1440]){await page.setViewportSize({width,height:1000});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error(`Overflow at ${width}`);}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/miso-allowance-demo-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1050});await page.emulateMedia({colorScheme:'dark'});await page.screenshot({path:'/tmp/miso-allowance-demo-dark.png',fullPage:true});
 console.log('Actual live API and isolated allowance demo checked. Six viewport widths passed.');
}finally{await browser.close();}
