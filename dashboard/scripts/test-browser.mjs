// Isolated browser suite: fresh in-memory collector, offline download counter, no local service dependency.
import {createService} from '../server/index.mjs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
process.env.MISO_OFFLINE_DOWNLOADS='0';
const {server,store}=createService({staticDirectory:resolve(root,'dist')});
await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
try{
 const files=(await readdir(resolve(root,'tests'))).filter(f=>f.endsWith('.test.mjs')).map(f=>resolve(root,'tests',f));
 const child=spawn(process.execPath,['--test',...files],{cwd:root,stdio:'inherit',env:{...process.env,DASHBOARD_URL:`http://127.0.0.1:${server.address().port}`}});
 process.exitCode=await new Promise((done,reject)=>{child.once('error',reject);child.once('exit',(code)=>done(code??1));});
}finally{server.closeAllConnections();await new Promise(done=>server.close(done));store.close();}
