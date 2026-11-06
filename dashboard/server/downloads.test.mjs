import {test} from 'node:test';import assert from 'node:assert/strict';import {createService,stargazerFaces} from './index.mjs';
test('download total is a plain number from the server, never an identity',async()=>{process.env.MISO_OFFLINE_DOWNLOADS='31';const {server,store}=createService();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const res=await fetch(`http://127.0.0.1:${server.address().port}/api/downloads`);assert.equal(res.status,200);assert.deepEqual(await res.json(),{schema:1,total:31,faces:[],source:'github-release-zip-downloads'});}
 finally{delete process.env.MISO_OFFLINE_DOWNLOADS;server.close();store.close();}});
test('profile photos are at most three, built only from a numeric id and a valid login',()=>{
 assert.deepEqual(stargazerFaces([{id:7,login:'a-b',avatar_url:'https://evil.example/x.png',email:'x@y.z'},{id:'8',login:'c'},{id:9,login:'bad login'},{id:10,login:'d'},{id:11,login:'e'},{id:12,login:'f'}]),[{login:'a-b',avatar:'https://avatars.githubusercontent.com/u/7?s=64&v=4'},{login:'d',avatar:'https://avatars.githubusercontent.com/u/10?s=64&v=4'},{login:'e',avatar:'https://avatars.githubusercontent.com/u/11?s=64&v=4'}]);
 assert.deepEqual(stargazerFaces(null),[]);assert.deepEqual(stargazerFaces({message:'rate limited'}),[]);
});
