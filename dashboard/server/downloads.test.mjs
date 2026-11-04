import {test} from 'node:test';import assert from 'node:assert/strict';import {createService} from './index.mjs';
test('download total is a plain number from the server, never an identity',async()=>{process.env.MISO_OFFLINE_DOWNLOADS='31';const {server,store}=createService();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const res=await fetch(`http://127.0.0.1:${server.address().port}/api/downloads`);assert.equal(res.status,200);assert.deepEqual(await res.json(),{schema:1,total:31,source:'github-release-zip-downloads'});}
 finally{delete process.env.MISO_OFFLINE_DOWNLOADS;server.close();store.close();}});
