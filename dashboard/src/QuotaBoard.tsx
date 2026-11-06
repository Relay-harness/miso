import {useEffect,useRef,useState} from 'react';
import {Info,OpenAiLogo,Copy,Check} from '@phosphor-icons/react';
import {createDemoAllowance} from './demo';
import {createDemoPulse,isPulse} from './pulse-data';
import type {Pulse} from './pulse-data';
import {isAllowanceCommunity} from './allowance-data';
import type {AllowanceCommunity,AllowanceCohort} from './allowance-data';
const plan=(p:string)=>({pro:'Pro',max_5x:'Max 5x',max_20x:'Max 20x',plus:'Plus'} as Record<string,string>)[p]??p;
const model=(m:string)=>m.replace(/^gpt-(\d+)-(\d+)-codex$/,'GPT-$1.$2 Codex').replace(/^gpt-5-codex$/,'GPT-5 Codex').replace(/^(sonnet|opus|haiku)-(\d+)(?:-(\d+))?$/,(_,n,a,b)=>n[0].toUpperCase()+n.slice(1)+' '+a+(b?'.'+b:''));
const ago=(t:number)=>{const m=Math.max(0,Math.round((Date.now()-t)/60000));return m<1?'just now':m<60?`${m}m ago`:`${Math.round(m/60)}h ago`;};
const name=(p:'claude'|'codex')=>p==='claude'?'Claude':'Codex';
const runway=(index:number)=>{const m=Math.round(300*index/100/5)*5;const h=Math.floor(m/60),r=m%60;return h&&r?`${h}h ${r}m`:h?`${h}h`:`${r}m`;};
const delta=(c:AllowanceCohort)=>Math.round((c.index??100)-100);
const range=(c:AllowanceCohort)=>{const [lo,hi]=c.interval!;const f=(n:number)=>n===0?'0':(n>0?'+':'−')+Math.abs(n);const a=lo-100,b=hi-100;return a===b?f(a)+'%':Math.abs(a)>Math.abs(b)?`${f(b)} to ${f(a)}%`:`${f(a)} to ${f(b)}%`;};
// 56 downloads reads as 50+, 64 as 60+, 85 as 80+. Below 50 the count is exact; from 1,000 it steps by 100.
const downloadLabel=(n:number)=>{if(n<50)return n.toLocaleString();const step=n<1000?10:100;return `${(Math.floor(n/step)*step).toLocaleString()}+`;};
type Face={login:string;avatar:string};
const isFace=(f:unknown):f is Face=>!!f&&typeof (f as Face).login==='string'&&typeof (f as Face).avatar==='string'&&/^https:\/\/avatars\.githubusercontent\.com\/u\/\d+\?s=64&v=4$/.test((f as Face).avatar);
const INSTALL='brew install --cask relay-harness/tap/relay-cat';
// Avoid the Vercel rewrite for browser reads; the collector permits this read-only origin.
const API=['www.throttleindex.com','throttleindex.com'].includes(window.location.hostname)?'https://api.throttleindex.com':'';
function InstallCommand(){const [copied,setCopied]=useState(false);return <div className="terminal"><code><span className="prompt" aria-hidden="true">$</span>{INSTALL}</code><button type="button" aria-label={copied?'Copied':'Copy'} onClick={async()=>{try{await navigator.clipboard.writeText(INSTALL);setCopied(true);window.setTimeout(()=>setCopied(false),1600);}catch{}}}>{copied?<Check size={16} weight="bold" aria-hidden="true"/>:<Copy size={16} aria-hidden="true"/>}<span>{copied?'Copied':'Copy'}</span></button></div>;}
const key=(c:AllowanceCohort)=>[c.plan,c.model,c.contextBand,c.protocol].join(':');
const groupLabel=(c:AllowanceCohort)=>`${c.plan.replaceAll('_',' ')} · ${c.model} · ${c.contextBand} context`;
export function QuotaBoard(){
 const demo=new URLSearchParams(window.location.search).get('demo')==='1';
 const [data,setData]=useState<AllowanceCommunity|null>(null),[error,setError]=useState(false),[loading,setLoading]=useState(true),[attempt,setAttempt]=useState(0);
 const [selection,setSelection]=useState({claude:'',codex:''}),[now,setNow]=useState(Date.now());
 const controller=useRef<AbortController|null>(null);
 const [pulse,setPulse]=useState<Pulse|null>(null);
 const [downloads,setDownloads]=useState<number|null>(null),[faces,setFaces]=useState<Face[]>([]);
 useEffect(()=>{if(demo)return;let active=true;let request:AbortController|null=null;
  async function load(){if(document.visibilityState!=='visible')return;request?.abort();const c=new AbortController();request=c;const timeout=window.setTimeout(()=>c.abort(),8000);
   try{const r=await fetch(API+'/api/downloads',{credentials:'omit',signal:c.signal});const v=r.ok?await r.json():null;if(active&&v&&Number.isSafeInteger(v.total)&&v.total>0){setDownloads(v.total);setFaces(Array.isArray(v.faces)?v.faces.filter(isFace).slice(0,3):[]);}}catch{}finally{window.clearTimeout(timeout);}}
  // A page opened in a background tab skips the first load; fetch as soon as it becomes visible.
  const onVisible=()=>{if(document.visibilityState==='visible')void load();};
  void load();const t=window.setInterval(()=>void load(),600000);document.addEventListener('visibilitychange',onVisible);
  return()=>{active=false;request?.abort();window.clearInterval(t);document.removeEventListener('visibilitychange',onVisible);};
 },[demo]);
 const [pulseError,setPulseError]=useState(false);
 // Members check in once a day, so the page only needs an occasional refresh: on load, on tab focus and every 10 minutes.
 useEffect(()=>{let active=true;let request:AbortController|null=null;
  async function load(){if(demo){setPulse(createDemoPulse());return;}request?.abort();const c=new AbortController();request=c;
   const timeout=window.setTimeout(()=>c.abort(),10000);
   try{const r=await fetch(API+'/api/pulse',{credentials:'omit',cache:'no-store',signal:c.signal});if(!r.ok)throw new Error();const v:unknown=await r.json();if(!isPulse(v))throw new Error();if(active&&request===c){setNow(Date.now());setPulse(v);setPulseError(false);}}
   catch{if(active&&(!c.signal.aborted||request===c))setPulseError(true);}
   finally{window.clearTimeout(timeout);}}
  const resume=()=>{setNow(Date.now());if(document.visibilityState==='visible')void load();};void load();
  const t=window.setInterval(resume,600000);window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);
  return()=>{active=false;request?.abort();window.clearInterval(t);window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);};
 },[demo,attempt]);
 const members=pulse&&pulse.generatedAt<=now+120000?pulse:null;
 useEffect(()=>{const c=members?.providers.claude;document.title=c?`Claude ${c.medianUsed}% used · throttleindex`:'throttleindex · are the limits shrinking?';},[members]);
 useEffect(()=>{
  let active=true;
  async function load(){
   if(demo){if(active){setData(createDemoAllowance());setError(false);setNow(Date.now());setLoading(false);}return;}
   controller.current?.abort();const c=new AbortController();controller.current=c;const timeout=window.setTimeout(()=>c.abort(),10000);setLoading(true);
   try{const response=await fetch(API+'/api/allowance',{signal:c.signal,credentials:'omit',cache:'no-store'});if(!response.ok)throw new Error();const value:unknown=await response.json();if(!isAllowanceCommunity(value))throw new Error();if(active){setData(value);setError(false);setNow(Date.now());}}
   catch{if(active&&(!c.signal.aborted||controller.current===c))setError(true);}finally{window.clearTimeout(timeout);if(active)setLoading(false);}
  }
  void load();const interval=window.setInterval(()=>{setNow(Date.now());if(document.visibilityState==='visible')void load();},60000);
  return()=>{active=false;controller.current?.abort();window.clearInterval(interval);};
 },[attempt,demo]);
 const stale=!!data&&(now-data.generatedAt>data.freshnessMinutes*60000||data.generatedAt>now+60000);
 const available=!!data&&!error&&!stale;
 return <section className="quota-board minimal-quota allowance-board clean" aria-label="Claude and Codex limits">
  {demo&&<aside className="demo-notice" aria-label="Demo data notice"><span>Demo · made-up numbers</span><a href={window.location.pathname}>Exit demo</a></aside>}
  <h1 className="headline">did they just nerf the limits? again!?</h1>
  {!demo&&downloads!==null&&<div className="live-status" role="status">{faces.length>0&&<a className="face-stack" href="https://github.com/Relay-harness/miso/stargazers" rel="noreferrer" title="People who starred Miso on GitHub" aria-label="People who starred Miso on GitHub">{faces.map(f=><img key={f.login} src={f.avatar} width={28} height={28} alt="" loading="lazy" referrerPolicy="no-referrer" onError={e=>{e.currentTarget.style.display='none';}}/>)}</a>}<a className="download-count" href="https://github.com/Relay-harness/miso/releases" rel="noreferrer">{downloadLabel(downloads)} {downloads===1?'download':'downloads'} on GitHub</a></div>}
  {(pulseError||((error||stale)&&!members?.providers.claude&&!members?.providers.codex))&&<div className="collector-notice" role="status"><Info size={13}/><span>{stale?'Allowance evidence is stale.':'Can’t reach the data right now.'} <button onClick={()=>setAttempt(v=>v+1)}>Retry</button></span></div>}
  <div className="provider-stack">{(['claude','codex'] as const).map(provider=>{
   const kind='five_hour';
   const groups=available?data.cohorts.filter(c=>c.provider===provider&&c.kind===kind):[];
   const selected=selection[provider]||(groups[0]?key(groups[0]):'');
   const cohort=groups.find(c=>key(c)===selected);
   const allowanceReady=!!cohort&&cohort.status!=='insufficient'&&cohort.index!==null;
   const usage=members?.providers[provider]??null;
   // Every member's latest daily check-in is the first signal. The slower allowance comparison only replaces it
   // once its matched cohort is ready.
   const showingMembers=!demo&&!!usage;
   const ready=showingMembers||allowanceReady;
   const index=showingMembers?usage!.medianUsed:(allowanceReady?cohort!.index:null);
   const filled=index===null?0:Math.min(40,Math.round(index/2.5));
   const tone=!showingMembers&&allowanceReady?cohort!.status:'insufficient';
   return <article key={provider} className={`quota-gauge provider-row ${provider} ${kind} ${tone==='decreased'?'allowance-decreased':''}`} aria-label={`${provider==='claude'?'Claude':'OpenAI'} five-hour ${showingMembers?'usage':'allowance'}`}>
    <div className="provider-line"><h2>{provider==='claude'?<img className="provider-mark" src="/claude-ai-logo.png" width={22} height={22} alt="" aria-hidden="true"/>:<OpenAiLogo className="provider-mark" size={22} aria-hidden="true"/>}{provider==='claude'?'Claude':'OpenAI'}{!showingMembers&&allowanceReady&&delta(cohort!)!==0&&<span className={`provider-sub tone-${tone}`}>{`${delta(cohort!)>0?'+':'−'}${Math.abs(delta(cohort!))}% this week`}</span>}</h2><div className="gauge-number"><strong>{index===null?'-':index}</strong>{index!==null&&<span>%</span>}</div></div>
    <div className="provider-reading"><div className={`pressure-track segmented-track ${ready?'':'no-readings'}`} role="img" title={showingMembers?'Typical five-hour usage':allowanceReady&&cohort!.interval?`Likely ${range(cohort!)} · ${cohort!.contributors} ${plan(cohort!.plan)} users on ${model(cohort!.model)} · updated ${ago(cohort!.latestAt!)}`:undefined} aria-label={index===null?'No data yet':showingMembers?`${index}% typical five-hour usage.`:`${index}% of last week's 5-hour allowance. A full bar means no change.`}>
     {Array.from({length:40},(_,i)=><i key={i} aria-hidden="true" className={`quota-segment ${i<filled?'is-filled':ready&&tone==='decreased'?'is-lost':''}`}/>)}
    </div></div>
    <p className={`one-line tone-${tone}`}>{loading&&!data&&!showingMembers?'Checking…':showingMembers?<span>Typical 5-hour usage: <b>{index}% used</b></span>:allowanceReady?<span>Your 5-hour window now lasts <b>~{runway(index!)}</b></span>:'Waiting for the first Miso check-in.'}</p>
    {groups.length>1&&<label className="evidence-group"><span className="sr-only">{provider==='claude'?'Claude':'OpenAI'} group</span><select aria-label={`${provider==='claude'?'Claude':'OpenAI'} evidence group`} value={cohort?key(cohort):''} onChange={event=>setSelection(previous=>({...previous,[provider]:event.target.value}))}>{!cohort&&<option value="" disabled>Select a group</option>}{groups.map(c=><option key={key(c)} value={key(c)}>{groupLabel(c)}</option>)}</select></label>}
   </article>;
  })}</div>
  <section className="miso" aria-labelledby="miso-title">
   <p className="kicker">For folks on macOS</p>
   <h2 id="miso-title">Help make this dashboard more accurate.</h2>
   <p className="miso-copy">Download Miso. It shows your session usage on your Mac and warns you before a limit runs out. It also powers this index, with zero prompt tracking.</p>
   <div className="miso-terminal"><span className="sleeping-miso" role="img" aria-label="Miso the cat, asleep on your terminal"/><InstallCommand/></div>
   <p className="miso-note">Apple Silicon, macOS 14+. Miso isn’t Apple-notarized yet: if macOS blocks the first launch, open System Settings → Privacy &amp; Security and click Open Anyway.</p>
   <div className="miso-foot"><p className="join-count join-empty">Install Miso and add your usage to the bars.</p></div>
  </section>
 </section>;
}
