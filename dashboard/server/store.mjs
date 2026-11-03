import {DatabaseSync} from 'node:sqlite';
import {createHash,createPublicKey,verify} from 'node:crypto';
import {computePulse} from './pulse.mjs';
import {authenticateAllowance, aggregateAllowance, ALLOWANCE_RETENTION, AllowanceError} from './allowance.mjs';
export const STEP=300000, FRESH=600000, RETENTION=2*86400000;
export const providers=['claude','codex'];
export const durations={five_hour:300*60000,weekly:10080*60000};
export const plans={claude:['unknown','pro','max','team','enterprise'],codex:['unknown','plus','pro','team','enterprise']};
export class SignalError extends Error{constructor(status,message){super(message);this.status=status;}}
const reject=(message,status=400)=>{throw new SignalError(status,message);};
function exact(object,keys){if(!object||typeof object!=='object'||Array.isArray(object)||Object.keys(object).some(k=>!keys.includes(k)))reject('Unexpected fields');}
function canonical64(value,length){if(typeof value!=='string'||Buffer.from(value,'base64').length!==length||Buffer.from(value,'base64').toString('base64')!==value)reject('Invalid signing material');return Buffer.from(value,'base64');}
export function authenticate(raw,signature,now,method='report'){
 let data;try{data=JSON.parse(raw);}catch{reject('Invalid JSON');}
 exact(data,method==='delete'?['version','publicKey','nonce','sentAt','action']:['version','publicKey','nonce','sentAt','provider','plan','series','observedAt','windows']);
 if(data.version!==1||typeof data.nonce!=='string'||!/^[-a-zA-Z0-9]{16,64}$/.test(data.nonce)||!Number.isSafeInteger(data.sentAt)||Math.abs(data.sentAt-now)>120000)reject('Invalid version, nonce or request time');
 if(method==='delete'&&data.action!=='delete')reject('Delete action required');
 const key=canonical64(data.publicKey,32),sig=canonical64(signature,64);
 const publicKey=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),key]),format:'der',type:'spki'});
 if(!verify(null,Buffer.from(raw),publicKey,sig))reject('Signature did not verify',401);
 const install=createHash('sha256').update(key).digest('hex');
 if(method==='delete')return {data,install};
 if(typeof data.series!=='string'||!/^[-a-zA-Z0-9]{16,64}$/.test(data.series))reject('Invalid measurement series');
 if(!providers.includes(data.provider)||!plans[data.provider].includes(data.plan))reject('Unsupported provider or plan');
 if(!Number.isSafeInteger(data.observedAt)||data.observedAt%STEP!==0||data.observedAt>now+60000||now-data.observedAt>FRESH)reject('Stale or invalid observation');
 if(!Array.isArray(data.windows)||!data.windows.length||data.windows.length>2)reject('One or two standard quota windows required');
 const kinds=new Set();
 for(const window of data.windows){exact(window,['kind','usedPercent','resetsAt']);if(typeof window.kind!=='string'||!Object.hasOwn(durations,window.kind)||kinds.has(window.kind))reject('Unknown or duplicate window');kinds.add(window.kind);
  if(!Number.isInteger(window.usedPercent)||window.usedPercent<0||window.usedPercent>100||window.usedPercent%5!==0)reject('Usage must be coarse percentage used');
  if(!Number.isSafeInteger(window.resetsAt)||window.resetsAt%STEP!==0||window.resetsAt<=now||window.resetsAt>data.observedAt+durations[window.kind]+STEP*2)reject('Invalid reset boundary');
 }
 return {data,install};
}
function quantile(values,q){if(!values.length)return null;const v=[...values].sort((a,b)=>a-b);const index=(v.length-1)*q,lo=Math.floor(index),hi=Math.ceil(index);return v[lo]+(v[hi]-v[lo])*(index-lo);}
function coarse(value){return value===null?null:Math.floor(value/5)*5;}
function protectedShare(count,total,min){if(count>0&&count<min||total-count>0&&total-count<min)return null;if(count===0)return 0;if(count===total)return 100;const rounded=Math.round(count/total*20)*5;return rounded===0?'<5':rounded===100?'>95':rounded;}
export function estimateHours(rows,now){
 if(rows.length<3)return null;const sorted=[...rows].sort((a,b)=>a.observed-b.observed);const latest=sorted.at(-1);const same=sorted.filter(r=>r.reset===latest.reset&&r.observed>=now-3600000);if(same.length<3||same.at(-1).observed-same[0].observed<600000)return null;
 if(same.some((r,i)=>i>0&&r.used<same[i-1].used))return null;
 const slopes=[];for(let i=0;i<same.length;i++)for(let j=i+1;j<same.length;j++)if(same[j].observed-same[i].observed>=300000)slopes.push((same[j].used-same[i].used)/((same[j].observed-same[i].observed)/3600000));
 const slope=quantile(slopes,.5);if(!slope||slope<=0||latest.used>=100)return null;const hours=(100-latest.used)/slope;
 return hours>0&&now+hours*3600000<latest.reset?hours:null;
}
export class SignalStore{
 constructor(path,{minCohort=5,clock=()=>Date.now()}={}){if(!Number.isInteger(minCohort)||minCohort<5)throw new Error('Minimum cohort must be at least 5');this.min=minCohort;this.clock=clock;this.db=new DatabaseSync(path);this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON; CREATE TABLE IF NOT EXISTS observations(install TEXT NOT NULL,provider TEXT NOT NULL,plan TEXT NOT NULL,kind TEXT NOT NULL,observed INTEGER NOT NULL,used INTEGER NOT NULL,reset INTEGER NOT NULL,received INTEGER NOT NULL,series TEXT NOT NULL,PRIMARY KEY(install,provider,kind,observed)); CREATE INDEX IF NOT EXISTS fresh ON observations(observed);CREATE TABLE IF NOT EXISTS nonces(install TEXT NOT NULL,nonce TEXT NOT NULL,received INTEGER NOT NULL,PRIMARY KEY(install,nonce));CREATE TABLE IF NOT EXISTS revoked(install TEXT PRIMARY KEY,until_time INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS allowance_intervals(install TEXT NOT NULL,provider TEXT NOT NULL,kind TEXT NOT NULL,start_at INTEGER NOT NULL,end_at INTEGER NOT NULL,received INTEGER NOT NULL,document TEXT NOT NULL,PRIMARY KEY(install,provider,kind,start_at));CREATE INDEX IF NOT EXISTS allowance_recent ON allowance_intervals(end_at);`);this.lastPruned=0;}
 close(){this.db.close();}
 prune(){const now=this.clock();if(now-this.lastPruned<60000)return;this.db.prepare('DELETE FROM observations WHERE observed < ?').run(now-RETENTION);this.db.prepare('DELETE FROM allowance_intervals WHERE end_at < ?').run(now-ALLOWANCE_RETENTION);this.db.prepare('DELETE FROM nonces WHERE received < ?').run(now-RETENTION);this.db.prepare('DELETE FROM revoked WHERE until_time < ?').run(now);this.lastPruned=now;}
 accept(raw,signature){this.prune();const now=this.clock();const {data,install}=authenticate(raw,signature,now);if(this.db.prepare('SELECT 1 FROM revoked WHERE install=?').get(install))reject('Sharing identity revoked',403);
 if(this.db.prepare('SELECT 1 FROM nonces WHERE install=? AND nonce=?').get(install,data.nonce))reject('Replay rejected',409);
 const previous=this.db.prepare('SELECT MAX(observed) AS latest FROM observations WHERE install=? AND provider=?').get(install,data.provider)?.latest;
 if(previous!==null&&previous!==undefined&&data.observedAt<=previous)reject('Duplicate or out-of-order observation',409);
 // At most one reading per install/provider per five-minute bucket, irrespective of refresh frequency.
 this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('INSERT INTO nonces VALUES(?,?,?)').run(install,data.nonce,now);const insert=this.db.prepare('INSERT INTO observations VALUES(?,?,?,?,?,?,?,?,?)');for(const w of data.windows)insert.run(install,data.provider,data.plan,w.kind,data.observedAt,w.usedPercent,w.resetsAt,now,data.series);this.db.exec('COMMIT');}catch(error){this.db.exec('ROLLBACK');throw error;}
 return {accepted:true,windows:data.windows.length};}
 remove(raw,signature){this.prune();const now=this.clock();const {install}=authenticate(raw,signature,now,'delete');this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('DELETE FROM observations WHERE install=?').run(install);this.db.prepare('DELETE FROM allowance_intervals WHERE install=?').run(install);this.db.prepare('DELETE FROM nonces WHERE install=?').run(install);this.db.prepare('INSERT OR REPLACE INTO revoked VALUES(?,?)').run(install,now+RETENTION);this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');return {deleted:true};}
 acceptAllowance(raw, signature) {
  this.prune(); const now=this.clock(); let report,install;
  try { ({report,install}=authenticateAllowance(raw,signature,now)); }
  catch(error) { if(error instanceof AllowanceError) throw new SignalError(error.status,error.message); throw error; }
  if(this.db.prepare('SELECT 1 FROM revoked WHERE install=?').get(install)) reject('Sharing identity revoked',403);
  if(this.db.prepare('SELECT 1 FROM nonces WHERE install=? AND nonce=?').get(install,report.nonce)) reject('Replay rejected',409);
  const m=report.measurement;
  if(this.db.prepare('SELECT 1 FROM allowance_intervals WHERE install=? AND provider=? AND kind=? AND start_at < ? AND end_at > ?').get(install,report.provider,m.kind,m.endAt,m.startAt)) reject('Overlapping calibration interval',409);
  const document=JSON.stringify({provider:report.provider,plan:report.plan,series:report.series,measurement:m});
  this.db.exec('BEGIN IMMEDIATE');
  try {
   this.db.prepare('INSERT INTO nonces VALUES(?,?,?)').run(install,report.nonce,now);
   this.db.prepare('INSERT INTO allowance_intervals VALUES(?,?,?,?,?,?,?)').run(install,report.provider,m.kind,m.startAt,m.endAt,now,document);
   this.db.exec('COMMIT');
  } catch(error) {this.db.exec('ROLLBACK');throw error;}
  return {accepted:true,method:'paired-controlled-workload-v1'};
 }
 pulse(){this.prune();const now=this.clock();return computePulse(this.db.prepare("SELECT install,provider,kind,observed,used,reset FROM observations WHERE kind='five_hour' AND observed >= ?").all(now-RETENTION),now,this.min);}
 aggregateAllowance() {
  this.prune(); const now=this.clock();
  const rows=this.db.prepare('SELECT install,document FROM allowance_intervals WHERE start_at >= ? ORDER BY install,start_at').all(now-ALLOWANCE_RETENTION).map(row=>({install:row.install,...JSON.parse(row.document)}));
  return aggregateAllowance(rows,now,this.min);
 }
 aggregate(){this.prune();const now=this.clock();const recent=this.db.prepare('SELECT * FROM observations WHERE observed >= ? AND reset > ? ORDER BY observed DESC').all(now-FRESH,now);
 const latest=new Map();for(const r of recent){const k=[r.install,r.provider,r.kind].join(':');if(!latest.has(k))latest.set(k,r);}
 const fresh=[...latest.values()];const ids=new Set(fresh.map(r=>r.install));
 const allHistory=this.db.prepare('SELECT * FROM observations WHERE observed >= ? ORDER BY observed').all(now-86400000);
 const seriesIndex=new Map(),hourly=new Map();
 for(const r of allHistory){
  if(r.observed>=now-3600000){const key=[r.install,r.provider,r.kind,r.plan,r.series].join(':');if(!seriesIndex.has(key))seriesIndex.set(key,[]);seriesIndex.get(key).push(r);}
  const hour=Math.floor(r.observed/3600000)*3600000;
  for(const p of new Set(['all',r.plan])){const key=[r.provider,p,r.kind,hour].join(':');if(!hourly.has(key))hourly.set(key,new Map());hourly.get(key).set(r.install,r);}
 }
 const cohorts=[];
 for(const provider of providers)for(const plan of ['all',...plans[provider]])for(const kind of Object.keys(durations)){
  const members=fresh.filter(r=>r.provider===provider&&r.kind===kind&&(plan==='all'||r.plan===plan));const n=members.length;
  if(n<this.min){cohorts.push({provider,plan,kind,status:'insufficient',contributors:null,medianUsed:null,nearLimitPercent:null,atLimitPercent:null,medianResetInHours:null,forecastHours:null,forecastContributors:null,confidence:'insufficient',history:[]});continue;}
  const estimates=members.flatMap(r=>{const series=seriesIndex.get([r.install,provider,kind,r.plan,r.series].join(':'))||[];const value=estimateHours(series,now);return value===null?[]:[value];});
  const history=[];for(let hour=23;hour>=0;hour--){const start=Math.floor(now/3600000)*3600000-hour*3600000;const rows=[...(hourly.get([provider,plan,kind,start].join(':'))?.values()||[])];history.push({at:start,medianUsed:rows.length>=this.min?coarse(quantile(rows.map(r=>r.used),.5)):null,contributors:rows.length>=this.min?rows.length:null});}
  cohorts.push({provider,plan,kind,status:'available',contributors:n,medianUsed:coarse(quantile(members.map(r=>r.used),.5)),nearLimitPercent:protectedShare(members.filter(r=>r.used>=90).length,n,this.min),atLimitPercent:protectedShare(members.filter(r=>r.used===100).length,n,this.min),medianResetInHours:Math.round(quantile(members.map(r=>(r.reset-now)/3600000),.5)*2)/2,forecastHours:estimates.length>=this.min?Math.round(quantile(estimates,.5)*2)/2:null,forecastContributors:estimates.length>=this.min?estimates.length:null,confidence:n>=100?'larger cohort':n>=20?'moderate cohort':'small cohort',history});
 }
 return {schema:1,generatedAt:now,freshnessMinutes:10,minCohort:this.min,reportingInstallations:ids.size>=this.min?ids.size:null,cohorts,method:'signed-installation-reports',limitations:['Installation signatures do not attest provider truth or unique people.','Plans are self-declared; all-plan aggregates mix allowances.','Quota used is not provider capacity, context length or task-level 429 evidence.']};}
}
