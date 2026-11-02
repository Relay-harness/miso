import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {SignalStore} from './store.mjs';
const file=process.argv[2];if(!file)throw new Error('Pass the public synthetic envelope file emitted by build/tests/calibration --emit-envelopes PATH');
const bytes=readFileSync(file);if(bytes.length>8*1024*1024)throw new Error('Fixture too large');
const fixture=JSON.parse(bytes);let now=0;const store=new SignalStore(':memory:',{clock:()=>now});
try{
 assert.equal(fixture.packets.length,60);
 const sorted=[...fixture.packets].sort((a,b)=>JSON.parse(a.raw).sentAt-JSON.parse(b.raw).sentAt);
 for(const packet of sorted){const report=JSON.parse(packet.raw);now=report.sentAt;assert.equal(report.measurement.protocol,'claude-sort-v1');assert.equal(store.acceptAllowance(packet.raw,packet.signature).accepted,true);}
 now=fixture.finalAt;const result=store.aggregateAllowance();assert.equal(result.reportingInstallations,10);assert.equal(result.cohorts.length,1);
 const cohort=result.cohorts[0];assert.equal(cohort.index,50);assert.equal(cohort.status,'decreased');assert.equal(cohort.protocol,'claude-sort-v1');assert.equal(cohort.contributors,10);
 console.log('Verified 60 SYNTHETIC Swift-signed intervals across 10 generated identities in an in-memory collector. Effective-allowance index: 50%; conservative uncertainty: '+cohort.interval.join('–')+'%. No live collector was modified.');
}finally{store.close();}
