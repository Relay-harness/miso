import {test} from 'node:test';
import assert from 'node:assert/strict';
import {computeMembers,DAY} from './pulse.mjs';
const NOW=Date.UTC(2026,10,3,12,10),H=3600000;
const member=(install,firstAgoH,lastAgoH=firstAgoH)=>({install:String(install),first_seen:NOW-firstAgoH*H,last_seen:NOW-lastAgoH*H});
const reading=(install,agoH,used,provider='claude',kind='five_hour')=>({install:String(install),provider,kind,used,observed:NOW-agoH*H});

test('every member counts, including Macs that are asleep or off today',()=>{
 const members=[...Array(40)].map((_,i)=>member(i,72,48)).concat([...Array(30)].map((_,i)=>member('new'+i,3)));
 const latest=members.map((m,i)=>reading(m.install,i<40?48:3,i<40?40:60));
 const p=computeMembers(members,latest,NOW);
 assert.equal(p.members,70);assert.equal(p.joinedToday,30);assert.equal(p.checkedInToday,30);
 assert.equal(p.providers.claude.members,70);assert.equal(p.providers.claude.medianUsed,40);assert.equal(p.cadenceHours,24);
});
test('one vote per member, rounded down to 5%, and share at the limit',()=>{
 const members=[1,2,3,4].map(i=>member(i,1));
 const latest=[reading(1,1,100),reading(2,1,100),reading(3,1,12),reading(4,1,33)];
 const c=computeMembers(members,latest,NOW).providers.claude;
 assert.deepEqual(c,{members:4,medianUsed:65,atLimit:50,updatedAt:NOW-H});
});
test('weekly windows and future rows are ignored; Codex is never filled from Claude',()=>{
 const p=computeMembers([member(1,1)],[reading(1,1,90,'claude','weekly'),reading(1,-5,90)],NOW);
 assert.equal(p.providers.claude,null);assert.equal(p.providers.codex,null);assert.equal(p.members,1);
});
test('members per provider are counted separately, total is the distinct union',()=>{
 const members=[member('a',1),member('b',1),member('c',30)];
 const p=computeMembers(members,[reading('a',1,20),reading('a',1,30,'codex'),reading('b',1,40,'codex')],NOW);
 assert.equal(p.members,3);assert.equal(p.providers.claude.members,1);assert.equal(p.providers.codex.members,2);
 assert.equal(computeMembers([],[],NOW).members,0);assert.equal(DAY,24*H);
});
