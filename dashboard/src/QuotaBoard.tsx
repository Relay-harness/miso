import {useEffect,useRef,useState} from 'react';
import {Info,OpenAiLogo,Copy,Check} from '@phosphor-icons/react';
import {createDemoAllowance} from './demo';
import {createDemoPulse,isPulse} from './pulse-data';
import type {Pulse} from './pulse-data';
import {isAllowanceCommunity} from './allowance-data';
import type {AllowanceCommunity,AllowanceCohort} from './allowance-data';
import {limitChange} from './limit-change';
import {loadLimitPosts,reportCounts} from './limit-posts';
import type {LimitPost} from './limit-posts';
const plan=(p:string)=>({pro:'Pro',max_5x:'Max 5x',max_20x:'Max 20x',plus:'Plus'} as Record<string,string>)[p]??p;
const model=(m:string)=>m.replace(/^gpt-(\d+)-(\d+)-codex$/,'GPT-$1.$2 Codex').replace(/^gpt-5-codex$/,'GPT-5 Codex').replace(/^(sonnet|opus|haiku)-(\d+)(?:-(\d+))?$/,(_,n,a,b)=>n[0].toUpperCase()+n.slice(1)+' '+a+(b?'.'+b:''));
const ago=(t:number)=>{const m=Math.max(0,Math.round((Date.now()-t)/60000));return m<1?'just now':m<60?`${m}m ago`:`${Math.round(m/60)}h ago`;};
const name=(p:'claude'|'codex')=>p==='claude'?'Claude':'Codex';
const when=(d:string,now:number)=>{const date=new Date(d);return date.toLocaleDateString('en-US',{month:'short',day:'numeric',...(date.getUTCFullYear()===new Date(now).getUTCFullYear()?{}:{year:'numeric' as const}),timeZone:'UTC'});};
const macs=(n:number|null)=>n===null?'':` · ${n} ${n===1?'Mac':'Macs'}`;
const range=(c:AllowanceCohort)=>{const [lo,hi]=c.interval!;const f=(n:number)=>n===0?'0':(n>0?'+':'−')+Math.abs(n);const a=lo-100,b=hi-100;return a===b?f(a)+'%':Math.abs(a)>Math.abs(b)?`${f(b)} to ${f(a)}%`:`${f(a)} to ${f(b)}%`;};
// 56 downloads reads as 50+, 64 as 60+, 85 as 80+. Below 50 the count is exact; from 1,000 it steps by 100.
const downloadLabel=(n:number)=>{if(n<50)return n.toLocaleString();const step=n<1000?10:100;return `${(Math.floor(n/step)*step).toLocaleString()}+`;};
// Public GitHub profile photos of people who starred Miso. GitHub's stargazer list needs a login, so these are listed here.
// To remove someone, delete their line.
const FACES=[
 {login:'arnavsharma2077-a11y',id:260406411},
 {login:'cicada0007',id:101625652},
 {login:'rahulbansal16',id:8466045},
];
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
 const [downloads,setDownloads]=useState<number|null>(null);
 useEffect(()=>{if(demo)return;let active=true;let request:AbortController|null=null;
  async function load(){if(document.visibilityState!=='visible')return;request?.abort();const c=new AbortController();request=c;const timeout=window.setTimeout(()=>c.abort(),8000);
   try{const r=await fetch(API+'/api/downloads',{credentials:'omit',signal:c.signal});const v=r.ok?await r.json():null;if(active&&v&&Number.isSafeInteger(v.total)&&v.total>0)setDownloads(v.total);}catch{}finally{window.clearTimeout(timeout);}}
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
 const [reports,setReports]=useState<LimitPost[]|null>(null);
 // A partial result would undercount, so the line only appears when every search answered.
 useEffect(()=>{if(demo)return;let active=true;
  const load=async()=>{try{const r=await loadLimitPosts();if(active)setReports(r.failures?null:r.posts);}catch{if(active)setReports(null);}};
  void load();const t=window.setInterval(()=>{if(document.visibilityState==='visible')void load();},300000);
  return()=>{active=false;window.clearInterval(t);};
 },[demo]);
 const stale=!!data&&(now-data.generatedAt>data.freshnessMinutes*60000||data.generatedAt>now+60000);
 const available=!!data&&!error&&!stale;
 return <section className="quota-board minimal-quota allowance-board clean" aria-label="Claude and Codex limits">
  {demo&&<aside className="demo-notice" aria-label="Demo data notice"><span>Demo · made-up numbers</span><a href={window.location.pathname}>Exit demo</a></aside>}
  <h1 className="headline">did they just nerf the limits? again!?</h1>
  {!demo&&downloads!==null&&<div className="live-status" role="status"><a className="face-stack" href="https://github.com/Relay-harness/miso/stargazers" rel="noreferrer" title="People who starred Miso on GitHub" aria-label="People who starred Miso on GitHub">{FACES.map(f=><img key={f.login} src={`https://avatars.githubusercontent.com/u/${f.id}?s=64&v=4`} width={28} height={28} alt="" loading="lazy" referrerPolicy="no-referrer" onError={e=>{e.currentTarget.style.display='none';}}/>)}</a><a className="download-count" href="https://github.com/Relay-harness/miso/releases" rel="noreferrer">{downloadLabel(downloads)} {downloads===1?'download':'downloads'} on GitHub</a></div>}
  {(pulseError||error||stale)&&<div className="collector-notice" role="status"><Info size={13}/><span>{stale?'Allowance evidence is stale.':'Can’t reach the data right now.'} <button onClick={()=>setAttempt(v=>v+1)}>Retry</button></span></div>}
  <div className="provider-stack">{(['claude','codex'] as const).map(provider=>{
   const kind='five_hour';
   const groups=available?data.cohorts.filter(c=>c.provider===provider&&c.kind===kind):[];
   const selected=selection[provider]||(groups[0]?key(groups[0]):'');
   const cohort=groups.find(c=>key(c)===selected);
   const usage=!demo?members?.providers[provider]??null:null;
   const change=limitChange(provider,cohort,now);
   const label=provider==='claude'?'Claude':'OpenAI';
   const said=reports?reportCounts(reports,label,now):null;
   const figure=change.state==='cut'?`−${change.percent}%`:change.state==='extra'?`+${change.percent}%`:change.state==='normal'?'Normal':change.state==='unclear'?'Unclear':change.state==='changed'?'Changed':change.state==='quiet'?(change.checked?'No change announced':'Last announced'):'-';
   const tone=change.state==='cut'?'decreased':change.state==='extra'?'increased':'neutral';
   const measured=!change.announcement&&change.state!=='unknown'&&!!cohort?.interval;
   const summary=change.announcement?`${figure}, not measured by Miso. ${change.state==='quiet'?'Last change: ':''}${change.announcement.headline}.`:change.state==='cut'?`Limit cut by ${change.percent}%.`:change.state==='extra'?`Extra limit, ${change.percent}% higher.`:change.state==='normal'?'Limit is normal, no change detected.':change.state==='unclear'?'The measurements disagree, so no change is shown.':'Limit change not measured yet.';
   const announced=change.announcement;
   const source=macs(change.contributors);
   return <article key={provider} className={`quota-gauge provider-row ${provider} ${kind} ${tone==='decreased'?'allowance-decreased':''}`} aria-label={`${label} five-hour limit change`}>
    <div className="provider-line"><h2>{provider==='claude'?<img className="provider-mark" src="/claude-ai-logo.png" width={22} height={22} alt="" aria-hidden="true"/>:<OpenAiLogo className="provider-mark" size={22} aria-hidden="true"/>}{label}</h2><div className={`gauge-number tone-${tone} ${change.percent===null&&change.state!=='unknown'||change.state==='normal'?'is-word':''}`}><strong>{figure}</strong></div></div>
    <div className="provider-reading"><div className={`pressure-track segmented-track ${change.filled?'':'no-readings'}`} role="img" title={[measured?`Likely ${range(cohort!)} · ${cohort!.contributors} ${plan(cohort!.plan)} users on ${model(cohort!.model)} · updated ${ago(cohort!.latestAt!)}`:'',usage?`Typical 5-hour use: ${usage.medianUsed}%`:'',said&&(said.thisWeek||said.lastWeek)?`Unverified reports on Hacker News: ${said.thisWeek} this week, ${said.lastWeek} last week`:''].filter(Boolean).join(' · ')||undefined} aria-label={summary}>
     {Array.from({length:40},(_,i)=><i key={i} aria-hidden="true" className={`quota-segment ${i<change.filled?'is-filled':change.state==='cut'?'is-lost':''}`}/>)}
    </div></div>
    <p className={`one-line tone-${tone}`}>{announced?<span title={announced.detail}><b>{change.state==='quiet'?`Last: ${announced.headline}`:announced.headline}</b> · {change.state==='quiet'?'':'Announced '}{when(announced.date,now)} · <a href={announced.url} target="_blank" rel="noopener noreferrer">{announced.source}</a></span>:loading&&!data&&change.state==='unknown'?'Checking…':change.state==='cut'?<span><b>Limit cut</b> · vs past week{source}</span>:change.state==='extra'?<span><b>Extra limit</b> · vs past week{source}</span>:change.state==='normal'?<span><b>No change</b> · vs past week{source}</span>:change.state==='unclear'?<span><b>Measurements disagree</b>{source}</span>:<span><b>Not measured yet</b></span>}</p>
    {groups.length>1&&<label className="evidence-group"><span className="sr-only">{provider==='claude'?'Claude':'OpenAI'} group</span><select aria-label={`${provider==='claude'?'Claude':'OpenAI'} evidence group`} value={cohort?key(cohort):''} onChange={event=>setSelection(previous=>({...previous,[provider]:event.target.value}))}>{!cohort&&<option value="" disabled>Select a group</option>}{groups.map(c=><option key={key(c)} value={key(c)}>{groupLabel(c)}</option>)}</select></label>}
   </article>;
  })}</div>
  <section className="miso" aria-labelledby="miso-title">
   <p className="kicker">For folks on macOS</p>
   <h2 id="miso-title">Help make this dashboard more accurate.</h2>
   <p className="miso-copy">Download Miso. It shows your session usage on your Mac and warns you before a limit runs out. It also powers this index, with zero prompt tracking.</p>
   <div className="miso-terminal"><span className="sleeping-miso" role="img" aria-label="Miso the cat, asleep on your terminal"/><InstallCommand/></div>
   <p className="miso-note">Apple Silicon, macOS 14+. Miso isn’t Apple-notarized yet: if macOS blocks the first launch, open System Settings → Privacy &amp; Security and click Open Anyway.</p>
   <div className="miso-foot"><p className="join-count join-empty">Install Miso and help measure the limits.</p></div>
  </section>
 </section>;
}
