import {test} from 'node:test';
import assert from 'node:assert/strict';
import {aggregateAllowance, DAY, validateMeasurement, authenticateAllowance} from './allowance.mjs';
import {SignalStore, STEP} from './store.mjs';
import {generateKeyPairSync, sign} from 'node:crypto';
const NOW=1800000000000, base=Math.floor(NOW/300000)*300000;
function measurement(endAt, {tasks=20,delta=20,kind='five_hour',model='sonnet-4-5',contextBand='short',resolution=0.1}={}) {
 return {kind,model,contextBand,protocol:'controlled-v1',startAt:endAt-300000,endAt,resetsAt:endAt+3600000,startUsed:10,endUsed:10+delta,resolutionPercent:resolution,exclusive:true,complete:true,workload:{tasks,inputTokens:tasks*1000,outputTokens:tasks*200,cacheReadTokens:0,cacheWriteTokens:0,toolCalls:tasks,contextTokens:8000}};
}
function fixtures({count=20,currentDelta=20,currentTasks=20,kind='five_hour',currentModel,changeShape=false,seriesChange=false,planChange=false}={}) {
 const rows=[];
 for(let id=0;id<count;id++) for(const period of ['baseline','current']) for(let sample=0;sample<3;sample++) {
  const current=period==='current', endAt=base-(current?3600000:2*DAY)+sample*600000;
  const m=measurement(endAt,{tasks:current?currentTasks:20,delta:current?currentDelta:20,kind,model:currentModel&&current?currentModel:'sonnet-4-5'});
  if(current&&changeShape)m.workload.outputTokens*=2;
  rows.push({install:String(id).padStart(4,'0'),provider:'claude',plan:planChange&&current?'max_5x':'pro',series:seriesChange&&current?'changed-account-11':'stable-account-111',measurement:m});
 }
 return rows;
}
const result=options=>aggregateAllowance(fixtures(options),base).cohorts.find(c=>c.plan==='pro')||{status:'insufficient',index:null};
test('detects an effective allowance cut and increase against matched per-install baselines',()=>{
 const cut=result({currentDelta:40});assert.equal(cut.status,'decreased');assert.equal(cut.index,50);assert.ok(cut.interval[1]<85);assert.equal(cut.contributors,20);
 const increase=result({currentDelta:10});assert.equal(increase.status,'increased');assert.equal(increase.index,200);
});
test('unchanged allowance and heavier matched workloads do not become limit cuts',()=>{
 assert.equal(result({}).status,'no_detectable_change');
 const heavier=result({currentTasks:40,currentDelta:40});assert.equal(heavier.index,100);assert.equal(heavier.status,'no_detectable_change');
});
test('weekly and five-hour evidence are independent',()=>{const rows=[...fixtures({kind:'weekly',currentDelta:40}),...fixtures({kind:'five_hour'})];const cohorts=aggregateAllowance(rows,base).cohorts;assert.equal(cohorts.find(c=>c.kind==='weekly').index,50);assert.equal(cohorts.find(c=>c.kind==='five_hour').index,100);});
test('changed model, plan, account scope, context or workload shape cannot prove a cut',()=>{
 for(const options of [{currentModel:'opus-4-5'},{planChange:true},{seriesChange:true},{changeShape:true}])assert.ok(aggregateAllowance(fixtures(options),base).cohorts.every(c=>c.status==='insufficient'));
 const rows=fixtures();for(const r of rows)if(r.measurement.endAt>base-DAY){r.measurement.contextBand='medium';r.measurement.workload.contextTokens=32000;}
 assert.ok(aggregateAllowance(rows,base).cohorts.every(c=>c.status==='insufficient'));
});
test('small cohorts, absent baselines, stale evidence and overlapped samples stay insufficient',()=>{
 assert.equal(result({count:9}).index,null);
 assert.ok(aggregateAllowance(fixtures().filter(r=>r.measurement.endAt>base-DAY),base).cohorts.every(c=>c.status==='insufficient'));
 assert.equal(aggregateAllowance(fixtures(),base+8*DAY).cohorts.length,0);
 const rows=fixtures();rows.push(...rows.filter(r=>r.measurement.endAt>base-DAY));assert.ok(aggregateAllowance(rows,base).cohorts.every(c=>c.status==='insufficient'));
});
test('one noisy installation or extra account series cannot dominate the paired median',()=>{
 const rows=fixtures();for(const r of rows)if(r.install==='0000'&&r.measurement.endAt>base-DAY)r.measurement.endUsed=90;
 assert.equal(aggregateAllowance(rows,base).cohorts[0].index,100);
 rows.push(...fixtures().map(r=>({...r,series:'second-account-111'})));
 assert.equal(aggregateAllowance(rows,base).cohorts[0].contributors,20);
});
test('uncertain or small effects do not get called provider cuts',()=>{
 const small=result({currentDelta:22});assert.equal(small.status,'no_detectable_change');
 const rows=fixtures();for(const r of rows)if(Number(r.install)<10&&r.measurement.endAt>base-DAY)r.measurement.endUsed=50;
 assert.equal(aggregateAllowance(rows,base).cohorts[0].status,'inconclusive');
});
test('quota quantization widens uncertainty rather than creating false precision',()=>{
 const rows=fixtures();for(const r of rows)r.measurement.resolutionPercent=5;
 const c=aggregateAllowance(rows,base).cohorts[0];assert.equal(c.status,'inconclusive');assert.ok(c.interval[0]<85&&c.interval[1]>115);
});
test('rejects incomplete, reset-crossing, clipped, undersized and unrecognized measurements',()=>{
 const valid=measurement(base);assert.equal(validateMeasurement(valid,'claude',base),valid);
 for(const changes of [{exclusive:false},{complete:false},{endUsed:100},{endUsed:15},{resetsAt:base},{model:'unknown'},{protocol:'arbitrary-task'},{startAt:base-2*3600000},{endAt:base-700000}])assert.throws(()=>validateMeasurement({...valid,...changes},'claude',base));
 assert.throws(()=>validateMeasurement({...valid,prompt:'private'},'claude',base),/fields/);
});
function identity(){const k=generateKeyPairSync('ed25519');return {privateKey:k.privateKey,publicKey:k.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64')};}
function signed(key,now,m){const raw=JSON.stringify({version:1,publicKey:key.publicKey,nonce:crypto.randomUUID(),sentAt:now,provider:'claude',plan:'pro',series:'stable-account-111',measurement:m});return {raw,signature:sign(null,Buffer.from(raw),key.privateKey).toString('base64')};}
test('signed calibration ingestion, replay protection, deletion, revocation and seven-day retention',()=>{
 let now=base;const store=new SignalStore(':memory:',{clock:()=>now});const key=identity();
 try {
  const packet=signed(key,now,measurement(now));assert.equal(store.acceptAllowance(packet.raw,packet.signature).accepted,true);
  assert.throws(()=>store.acceptAllowance(packet.raw,packet.signature),/Replay/);
  const overlap=signed(key,now,measurement(now));assert.throws(()=>store.acceptAllowance(overlap.raw,overlap.signature),/Overlapping/);
  const forged=signed(key,now,measurement(now));assert.throws(()=>authenticateAllowance(forged.raw,Buffer.alloc(64).toString('base64'),now),/verify/);
  const aggregate=store.aggregateAllowance();assert.deepEqual(aggregate.cohorts,[]);assert.ok(!JSON.stringify(aggregate).includes(key.publicKey));
  const deletion=JSON.stringify({version:1,publicKey:key.publicKey,nonce:crypto.randomUUID(),sentAt:now,action:'delete'});
  store.remove(deletion,sign(null,Buffer.from(deletion),key.privateKey).toString('base64'));
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM allowance_intervals').get().n,0);
  const revoked=signed(key,now,measurement(now));assert.throws(()=>store.acceptAllowance(revoked.raw,revoked.signature),/revoked/);
  const another=identity(),fresh=signed(another,now,measurement(now));store.acceptAllowance(fresh.raw,fresh.signature);
  now+=3*DAY;store.prune();assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM allowance_intervals').get().n,1);
  now+=5*DAY;store.prune();assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM allowance_intervals').get().n,0);
 } finally {store.close();}
});
test('actual signed baseline/current reports produce a change only after enough independent pairs',()=>{
 let now=base-2*DAY;const store=new SignalStore(':memory:',{clock:()=>now});const keys=Array.from({length:10},identity);
 try {
  for(const period of [0,1])for(let sample=0;sample<3;sample++){
   now=base-(period?3600000:2*DAY)+sample*600000;
   for(const key of keys){const packet=signed(key,now,measurement(now,{delta:period?40:20}));store.acceptAllowance(packet.raw,packet.signature);}
  }
  now=base;const c=store.aggregateAllowance().cohorts[0];assert.equal(c.index,50);assert.equal(c.status,'decreased');assert.equal(c.contributors,10);
 } finally {store.close();}
});

test('participant mix and unequal baseline capacities do not create Simpson-style limit cuts',()=>{
 const rows=fixtures();
 for(const row of rows){const tasks=20*(1+Number(row.install));const m=row.measurement;m.workload.tasks=tasks;m.workload.inputTokens=tasks*1000;m.workload.outputTokens=tasks*200;m.workload.toolCalls=tasks;}
 const newcomers=fixtures({count:100}).filter(r=>r.measurement.endAt>base-DAY).map(r=>({...r,install:'new-'+r.install}));
 const cohort=aggregateAllowance([...rows,...newcomers],base).cohorts[0];assert.equal(cohort.index,100);assert.equal(cohort.contributors,20);assert.equal(cohort.status,'no_detectable_change');
});
test('public suppression never leaks the small matched subgroup size',()=>{
 const data=aggregateAllowance(fixtures({count:9}),base);assert.equal(data.reportingInstallations,null);assert.deepEqual(data.cohorts,[]);
});

test('calibration rejects ambiguous subscription tiers instead of mixing their allowances',()=>{const key=identity();for(const plan of ['max','team','enterprise','unknown']){const payload={version:1,publicKey:key.publicKey,nonce:crypto.randomUUID(),sentAt:base,provider:'claude',plan,series:'stable-account-111',measurement:measurement(base)};const raw=JSON.stringify(payload);assert.throws(()=>authenticateAllowance(raw,sign(null,Buffer.from(raw),key.privateKey).toString('base64'),base),/Known provider and declared plan/);}});

test('native sorting protocol is bounded and never borrows a generic controlled baseline',()=>{
 const native=measurement(base,{tasks:6});native.protocol='claude-sort-v1';native.workload.toolCalls=0;
 assert.equal(validateMeasurement(native,'claude',base),native);
 for(const mutate of [m=>m.model='sonnet-4-6',m=>m.workload.tasks=20,m=>m.workload.toolCalls=1]){const invalid=structuredClone(native);mutate(invalid);assert.throws(()=>validateMeasurement(invalid,'claude',base));}
 const codex=structuredClone(native);codex.model='gpt-5-codex';assert.throws(()=>validateMeasurement(codex,'codex',base));
 const split=fixtures();for(const row of split)if(row.measurement.endAt>base-DAY)row.measurement.protocol='claude-sort-v1';
 assert.equal(aggregateAllowance(split,base).cohorts.length,0);
 const pairs=fixtures();for(const row of pairs){row.measurement.protocol='claude-sort-v1';row.measurement.workload.tasks=6;row.measurement.workload.toolCalls=0;}
 assert.equal(aggregateAllowance(pairs,base).cohorts[0].index,100);
});
