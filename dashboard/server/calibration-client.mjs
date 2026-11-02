#!/usr/bin/env node
import {readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {generateKeyPairSync, sign, createPrivateKey} from 'node:crypto';
import {validateMeasurement, CALIBRATION_PLANS} from './allowance.mjs';

// This tool consumes an explicitly supplied aggregate calibration export. It never scans
// provider logs, reads credentials, runs a workload, or converts daily tokens into evidence.
const args=process.argv.slice(2);
const help=`Calibration client (experimental, opt-in)

Validate an instrumented aggregate export without sending or creating an identity:
  node server/calibration-client.mjs --validate PATH

Send a FRESH validated export with separate explicit consent:
  node server/calibration-client.mjs --send PATH --server HTTPS_ROOT --identity KEY_PATH --consent calibration-v1 --confirm-complete-exclusive

Delete this identity's usage AND calibration reports; the key is removed only on success:
  node server/calibration-client.mjs --delete --server HTTPS_ROOT --identity KEY_PATH

Calibration reports are pseudonymous and retained for seven days (legacy usage: 48 hours).
The collector sees your IP. Do not submit unless the workload exporter measures ALL activity
on this account/window and confirms unchanged model/plan, one reset, and the controlled-v1
protocol. The current Mac quota reader alone cannot produce a qualifying export.
No prompts, files, account IDs or provider credentials belong in the export.
`;
function options(values){
 const out={};const flags=new Set(['delete','confirm-complete-exclusive','help']);
 const known=new Set(['validate','send','server','identity','consent',...flags]);
 for(let i=0;i<values.length;i++){
  const key=values[i].startsWith('--')?values[i].slice(2):'';
  if(!known.has(key)||Object.hasOwn(out,key))throw new Error('Unknown or duplicate option');
  if(flags.has(key))out[key]=true;
  else {const value=values[++i];if(!value||value.startsWith('--'))throw new Error('Option requires a value');out[key]=value;}
 }
 return out;
}
function serverRoot(text){
 const url=new URL(text);
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new Error('Use a trusted HTTPS collector root; only loopback HTTP is allowed');
 return url;
}
try {
 const opt=options(args);
 if(opt.help||!args.length){console.log(help);process.exit(0);}
 if([opt.validate,opt.send,opt.delete].filter(Boolean).length!==1)throw new Error('Choose exactly one of --validate, --send or --delete');
 let record;
 if(!opt.delete){
  const bytes=readFileSync(opt.validate||opt.send);if(bytes.length>8192)throw new Error('Export too large');record=JSON.parse(bytes);
  if(!record||Object.keys(record).sort().join(',')!=='measurement,plan,provider,series')throw new Error('Export must contain exactly provider, plan, series and measurement');
  if(!['claude','codex'].includes(record.provider)||typeof record.series!=='string'||!/^[-a-zA-Z0-9]{16,64}$/.test(record.series))throw new Error('Known provider and stable pseudonymous account series required');
  const plans=CALIBRATION_PLANS[record.provider];
  if(!plans.includes(record.plan))throw new Error('Known declared plan required');
  validateMeasurement(record.measurement,record.provider,Date.now());
  if(opt.validate){console.log('Valid aggregate interval. Nothing uploaded; no signing identity created.');process.exit(0);}
  if(opt.consent!=='calibration-v1'||!opt['confirm-complete-exclusive'])throw new Error('Read --help; sending requires separate calibration-v1 consent and complete/exclusive coverage confirmation');
 }
 if(!opt.server||!opt.identity)throw new Error('--server and --identity are required');
 const server=serverRoot(opt.server),path=resolve(opt.identity);
 let identity;
 if(existsSync(path))identity=JSON.parse(readFileSync(path,'utf8'));
 else {
  if(opt.delete)throw new Error('Deletion identity not found; no request sent');
  const keys=generateKeyPairSync('ed25519');identity={publicKey:keys.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64'),privateKey:keys.privateKey.export({format:'pem',type:'pkcs8'}),server:server.origin};
  mkdirSync(dirname(path),{recursive:true,mode:0o700});writeFileSync(path,JSON.stringify(identity),{mode:0o600,flag:'wx'});
 }
 if(identity.server!==server.origin)throw new Error('This key belongs to another server. Delete its old reports before switching.');
 const envelope={version:1,publicKey:identity.publicKey,nonce:crypto.randomUUID(),sentAt:Date.now(),...(opt.delete?{action:'delete'}:record)};
 const raw=JSON.stringify(envelope),signature=sign(null,Buffer.from(raw),createPrivateKey(identity.privateKey)).toString('base64');
 const response=await fetch(new URL(opt.delete?'/v1/reports':'/v1/allowance-reports',server),{method:opt.delete?'DELETE':'POST',headers:{'Content-Type':'application/json','X-Miso-Signature':signature},body:raw,redirect:'error',signal:AbortSignal.timeout(12000)});
 if(response.status!==(opt.delete?200:202))throw new Error(`Collector rejected request (HTTP ${response.status}). Identity retained for retry/deletion.`);
 if(opt.delete){unlinkSync(path);console.log('Reports deleted. Local calibration key removed.');}
 else console.log('Calibration interval accepted. An estimate still needs historical baselines and enough matched installations.');
} catch(error){console.error(error.message);process.exitCode=1;}
