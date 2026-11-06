import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1050},colorScheme:'light'});
 await page.route('https://api.github.com/**',r=>r.fulfill({json:{total_count:0,items:[],incomplete_results:false}}));await page.route('https://hn.algolia.com/**',r=>r.fulfill({json:{hits:[]}}));
 await page.goto(process.env.DASHBOARD_URL||'http://127.0.0.1:8787');
 await page.waitForFunction(()=>!document.querySelector('.status-label')?.textContent.includes('Updating'));
 console.log('LIVE ALLOWANCE:',await page.locator('.quota-board').innerText());
 await page.screenshot({path:'/tmp/miso-allowance-live-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/miso-allowance-live-mobile.png',fullPage:true});
}finally{await browser.close();}
