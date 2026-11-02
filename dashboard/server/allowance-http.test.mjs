import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, sign} from 'node:crypto';
import {createService} from './index.mjs';
const DAY=86400000,STEP=300000;
const identity=()=>{const keys=generateKeyPairSync('ed25519');return {privateKey:keys.privateKey,publicKey:keys.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64')};};
const headers=(raw,key)=>({'Content-Type':'application/json','X-Miso-Signature':sign(null,Buffer.from(raw),key.privateKey).toString('base64')});
test('real HTTP signing-to-aggregation flow detects a controlled cut and deletion removes evidence immediately',async()=>{
 const final=Math.floor(1800000000000/STEP)*STEP;let now=final-2*DAY;
 const {server,store}=createService({clock:()=>now});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const empty=await fetch(base+'/api/allowance').then(r=>r.json());assert.equal(empty.reportingInstallations,null);assert.deepEqual(empty.cohorts,[]);
  assert.equal((await fetch(base+'/v1/allowance-reports',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://browser.example'},body:'{}'})).status,403);
  assert.equal((await fetch(base+'/v1/allowance-reports',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
  const keys=Array.from({length:10},identity);
  for(const current of [false,true])for(let sample=0;sample<3;sample++){
   now=final-(current?3600000:2*DAY)+sample*600000;
   for(const key of keys){
    const raw=JSON.stringify({version:1,publicKey:key.publicKey,nonce:crypto.randomUUID(),sentAt:now,provider:'claude',plan:'pro',series:'http-study-account-1',measurement:{kind:'five_hour',model:'sonnet-4-5',contextBand:'short',protocol:'controlled-v1',startAt:now-STEP,endAt:now,resetsAt:now+3600000,startUsed:10,endUsed:current?50:30,resolutionPercent:0.1,exclusive:true,complete:true,workload:{tasks:20,inputTokens:20000,outputTokens:4000,cacheReadTokens:0,cacheWriteTokens:0,toolCalls:20,contextTokens:8000}}});
    assert.equal((await fetch(base+'/v1/allowance-reports',{method:'POST',headers:headers(raw,key),body:raw})).status,202);
   }
  }
  now=final;const publicData=await fetch(base+'/api/allowance').then(r=>r.json());assert.equal(publicData.cohorts[0].index,50);assert.equal(publicData.cohorts[0].status,'decreased');assert.equal(publicData.reportingInstallations,10);
  const serialized=JSON.stringify(publicData);for(const key of keys)assert.ok(!serialized.includes(key.publicKey));assert.ok(!serialized.includes('http-study-account-1'));assert.ok(!serialized.includes('inputTokens'));
  const key=keys[0],deletion=JSON.stringify({version:1,publicKey:key.publicKey,nonce:crypto.randomUUID(),sentAt:now,action:'delete'});
  assert.equal((await fetch(base+'/v1/reports',{method:'DELETE',headers:headers(deletion,key),body:deletion})).status,200);
  const after=await fetch(base+'/api/allowance').then(r=>r.json());assert.deepEqual(after.cohorts,[]);assert.equal(after.reportingInstallations,null);
 }finally{await new Promise(r=>server.close(r));store.close();}
});
