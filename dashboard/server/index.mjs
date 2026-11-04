import http from 'node:http';
import {mkdirSync} from 'node:fs';
import {dirname,resolve,extname,sep} from 'node:path';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {SignalStore,SignalError} from './store.mjs';

// Public download total from GitHub releases (ZIP assets only). Cached; null when GitHub is unreachable.
let downloadsCache={value:null,at:0};
async function releaseDownloads(clock){
 if(clock()-downloadsCache.at<600000)return downloadsCache.value;
 downloadsCache.at=clock();
 try{const r=await fetch('https://api.github.com/repos/Relay-harness/miso/releases?per_page=50',{headers:{'Accept':'application/vnd.github+json','User-Agent':'throttleindex'},signal:AbortSignal.timeout(5000)});
  if(!r.ok)throw new Error();const list=await r.json();
  const total=list.filter(x=>!x.draft).flatMap(x=>x.assets||[]).filter(a=>/\.zip$/.test(a.name)).reduce((n,a)=>n+(Number.isSafeInteger(a.download_count)?a.download_count:0),0);
  downloadsCache.value=total;}catch{}
 return downloadsCache.value;
}
export function createService({path=':memory:',minCohort=5,clock=()=>Date.now(),allowedOrigin='',staticDirectory=null,clientIpHeader=''}={}){
 const store=new SignalStore(path,{minCohort,clock});const rates=new Map();let cached=null;let cachedAt=0;let allowanceCached=null;let allowanceCachedAt=0;let pulseCached=null;let pulseCachedAt=0;
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  // The public dashboard may read aggregate, read-only endpoints directly. Writes never accept browser origins.
  if(req.method==='GET'&&req.headers.origin==='https://www.throttleindex.com')res.setHeader('Access-Control-Allow-Origin','https://www.throttleindex.com');
  const reply=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
  const pathname=req.url?.split('?')[0];
  if(req.method==='GET'&&pathname==='/api/community'){if(!cached||clock()-cachedAt>=15000){cached=store.aggregate();cachedAt=clock();}return reply(200,cached);}
  if(req.method==='GET'&&pathname==='/api/allowance'){if(!allowanceCached||clock()-allowanceCachedAt>=15000){allowanceCached=store.aggregateAllowance();allowanceCachedAt=clock();}return reply(200,allowanceCached);}
  if(req.method==='GET'&&pathname==='/api/pulse'){if(!pulseCached||clock()-pulseCachedAt>=15000){pulseCached=store.pulse();pulseCachedAt=clock();}return reply(200,pulseCached);}
  if(req.method==='GET'&&pathname==='/api/downloads'){const total=process.env.MISO_OFFLINE_DOWNLOADS!==undefined?Number(process.env.MISO_OFFLINE_DOWNLOADS):await releaseDownloads(clock);return reply(200,{schema:1,total:Number.isSafeInteger(total)?total:null,source:'github-release-zip-downloads'});}
  if(req.method==='GET'&&pathname==='/health')return reply(200,{ok:true});
  if(req.method==='GET'&&staticDirectory){
   let decoded;try{decoded=decodeURIComponent(pathname);}catch{return reply(400,{error:'Invalid path'});}
   const root=resolve(staticDirectory),file=resolve(root,decoded==='/'?'index.html':'.'+decoded);
   const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.woff2':'font/woff2','.woff':'font/woff','.svg':'image/svg+xml','.png':'image/png'};
   if(file.startsWith(root+sep)&&types[extname(file)])try{const bytes=await readFile(file);res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self' https://api.throttleindex.com https://hn.algolia.com; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");res.writeHead(200,{'Content-Type':types[extname(file)]});res.end(bytes);return;}catch{}
  }
  if(!((['POST','DELETE'].includes(req.method)&&pathname==='/v1/reports')||(req.method==='POST'&&pathname==='/v1/allowance-reports')))return reply(404,{error:'Not found'});
  // Browser writes are not supported. Native clients do not send Origin.
  if(req.headers.origin&&req.headers.origin!==allowedOrigin)return reply(403,{error:'Browser ingestion is disabled'});
  if(req.headers['content-type']?.split(';')[0]!=='application/json')return reply(415,{error:'JSON required'});
  if(req.headers['content-encoding']&&req.headers['content-encoding']!=='identity')return reply(415,{error:'Compression not accepted'});
  const forwarded=clientIpHeader&&req.headers[clientIpHeader];const now=clock(),ip=(typeof forwarded==='string'&&forwarded.split(',')[0].trim())||req.socket.remoteAddress||'unknown';for(const [key,v] of rates)if(now-v.start>60000)rates.delete(key);
  if(rates.size>10000)return reply(503,{error:'Temporarily busy'});const rate=rates.get(ip)||{start:now,count:0};rate.count++;rates.set(ip,rate);if(rate.count>600)return reply(429,{error:'Slow down'});
  const chunks=[];let size=0;try{for await(const chunk of req){size+=chunk.length;if(size>8192){reply(413,{error:'Body too large'});req.destroy();return;}chunks.push(chunk);}const raw=Buffer.concat(chunks).toString('utf8');const signature=req.headers['x-miso-signature'];if(typeof signature!=='string')return reply(401,{error:'Signature required'});const result=req.method==='DELETE'?store.remove(raw,signature):pathname==='/v1/allowance-reports'?store.acceptAllowance(raw,signature):store.accept(raw,signature);if(req.method==='DELETE'){cached=null;allowanceCached=null;pulseCached=null;}else if(pathname==='/v1/reports')pulseCached=null;else if(pathname==='/v1/allowance-reports')allowanceCached=null;return reply(req.method==='DELETE'?200:202,result);}catch(error){if(!res.headersSent)reply(error instanceof SignalError?error.status:500,{error:error instanceof SignalError?error.message:'Unable to accept signal'});}
 });
 const sweep=setInterval(()=>{const now=clock();for(const [key,value] of rates)if(now-value.start>60000)rates.delete(key);},30000);sweep.unref();server.on('close',()=>clearInterval(sweep));
 server.requestTimeout=15000;server.headersTimeout=10000;server.maxHeadersCount=30;
 return {server,store};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 process.umask(0o077);
 const path=process.env.MISO_DB||'.data/community.sqlite';mkdirSync(dirname(path),{recursive:true,mode:0o700});const minCohort=Number(process.env.MISO_MIN_COHORT||5);
 const {server,store}=createService({path,minCohort,staticDirectory:resolve(process.env.MISO_STATIC_ROOT||'dist'),clientIpHeader:(process.env.MISO_CLIENT_IP_HEADER||'').toLowerCase()});const host=process.env.MISO_HOST||'127.0.0.1',port=Number(process.env.PORT||process.env.MISO_PORT||8787);server.listen(port,host,()=>console.log(`Miso quota collector: http://${host}:${port} (minimum cohort ${minCohort})`));
 const maintenance=setInterval(()=>store.prune(),60000);maintenance.unref();for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>{clearInterval(maintenance);server.close(()=>{store.close();process.exit(0);});});
}
