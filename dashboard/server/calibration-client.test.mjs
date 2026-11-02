import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtempSync, writeFileSync, existsSync, statSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createService} from './index.mjs';
const exec=promisify(execFile),cli=fileURLToPath(new URL('./calibration-client.mjs',import.meta.url));
test('calibration client validates offline, requires new consent, signs uploads and deletes its identity',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'miso-calibration-')),file=join(directory,'interval.json'),key=join(directory,'identity.json');
 const endAt=Math.floor(Date.now()/300000)*300000;
 writeFileSync(file,JSON.stringify({provider:'claude',plan:'pro',series:'client-study-account-1',measurement:{kind:'five_hour',model:'sonnet-4-5',contextBand:'short',protocol:'controlled-v1',startAt:endAt-300000,endAt,resetsAt:endAt+3600000,startUsed:10,endUsed:30,resolutionPercent:0.1,exclusive:true,complete:true,workload:{tasks:20,inputTokens:20000,outputTokens:4000,cacheReadTokens:0,cacheWriteTokens:0,toolCalls:20,contextTokens:8000}}}));
 const {server,store}=createService();await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;
 try{
  const valid=await exec(process.execPath,[cli,'--validate',file]);assert.ok(valid.stdout.includes('Nothing uploaded'));assert.equal(existsSync(key),false);assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM allowance_intervals').get().n,0);
  await assert.rejects(exec(process.execPath,[cli,'--send',file,'--server',root,'--identity',key]),error=>{assert.ok(error.stderr.includes('separate calibration-v1 consent'));return true;});assert.equal(existsSync(key),false);
  const accepted=await exec(process.execPath,[cli,'--send',file,'--server',root,'--identity',key,'--consent','calibration-v1','--confirm-complete-exclusive']);assert.ok(accepted.stdout.includes('accepted'));assert.equal(existsSync(key),true);if(process.platform!=='win32')assert.equal(statSync(key).mode&0o777,0o600);assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM allowance_intervals').get().n,1);
  const deleted=await exec(process.execPath,[cli,'--delete','--server',root,'--identity',key]);assert.ok(deleted.stdout.includes('deleted'));assert.equal(existsSync(key),false);assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM allowance_intervals').get().n,0);
 }finally{await new Promise(r=>server.close(r));store.close();rmSync(directory,{recursive:true,force:true});}
});
