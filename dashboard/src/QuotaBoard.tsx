import {useEffect,useRef,useState} from 'react';
import type {CSSProperties} from 'react';
import {Info,OpenAiLogo,Copy,Check} from '@phosphor-icons/react';
import {createDemoAllowance} from './demo';
import {createDemoPulse,isPulse} from './pulse-data';
import type {Pulse,MemberSummary} from './pulse-data';
import {useDrift,sparkPath} from './live-drift';
import {isAllowanceCommunity} from './allowance-data';
import type {AllowanceCommunity,AllowanceCohort} from './allowance-data';
import {limitChange} from './limit-change';
import {isSignalResponse,signalGauge} from './limit-signal';
import {shownFor} from './display-config';
import {CountUp} from './CountUp';
import {isStargazers,starAgo,updatedAgo,smallAvatar} from './live';
import type {Stargazers} from './live';
import type {SignalResponse} from './limit-signal';
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
// The bars read their values from display-config.ts. Open the page with ?measured=1 to see the limit-change readings.
const SEGMENTS=40;
function InstallCommand(){const [copied,setCopied]=useState(false);return <div className="terminal"><code><span className="prompt" aria-hidden="true">$</span>{INSTALL}</code><button type="button" aria-label={copied?'Copied':'Copy'} onClick={async()=>{try{await navigator.clipboard.writeText(INSTALL);setCopied(true);window.setTimeout(()=>setCopied(false),1600);}catch{}}}>{copied?<Check size={16} weight="bold" aria-hidden="true"/>:<Copy size={16} aria-hidden="true"/>}<span>{copied?'Copied':'Copy'}</span></button></div>;}
const key=(c:AllowanceCohort)=>[c.plan,c.model,c.contextBand,c.protocol].join(':');
const groupLabel=(c:AllowanceCohort)=>`${c.plan.replaceAll('_',' ')} · ${c.model} · ${c.contextBand} context`;

function Spark({values,provider}:{values:number[];provider:'claude'|'codex'}){
 const w=96,h=22,d=sparkPath(values,w,h,DRIFT_MIN,DRIFT_MAX);
 if(!d)return null;
 const last=values[values.length-1],y=h-((last-DRIFT_MIN)/(DRIFT_MAX-DRIFT_MIN||1))*(h-2)-1;
 return <svg className={`spark spark-${provider}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true"><path d={`${d} L${w},${h} L0,${h} Z`} className="spark-fill"/><path d={d} className="spark-line"/><circle cx={w} cy={y} r={2.6} className="spark-dot"/></svg>;
}
const DRIFT_MIN=80,DRIFT_MAX=90;
function LiveCapacity({provider,real,grown,tick,reducedMotion}:{provider:'claude'|'codex';real:MemberSummary|null;grown:boolean;tick:number;reducedMotion:boolean}){
 const base=shownFor(provider,real);
 const isReal=base.source==='telemetry';
 // Only the illustrative configured values move. Telemetry is shown exactly as reported.
 const drift=useDrift(base.percent,{enabled:!isReal&&!reducedMotion,min:DRIFT_MIN,max:DRIFT_MAX,everyMs:provider==='claude'?[2000,3800]:[2600,4400]});
 const percent=isReal?base.percent:drift.value;
 const [settled,setSettled]=useState(false);
 useEffect(()=>{if(!grown)return;const t=window.setTimeout(()=>setSettled(true),1800);return()=>window.clearTimeout(t);},[grown]);
 const [flash,setFlash]=useState<{d:number;k:number}|null>(null);
 useEffect(()=>{if(!settled||!drift.delta)return;setFlash({d:drift.delta,k:drift.at});const t=window.setTimeout(()=>setFlash(null),1600);return()=>window.clearTimeout(t);},[drift.at,settled]);
 const lit=grown?Math.round(percent/100*SEGMENTS):0;
 const live=!isReal&&!reducedMotion;
 return <article className={`quota-gauge provider-row ${provider} five_hour is-display ${isReal?'is-telemetry':'is-configured'} ${percent>=75?'is-strong':''} ${grown?'is-grown':''} ${settled?'is-settled':''}`} aria-label={`${base.label} capacity`} style={{'--lit':lit} as CSSProperties}>
  <div className="provider-line"><h2>{provider==='claude'?<img className="provider-mark" src="/claude-ai-logo.png" width={22} height={22} alt="" aria-hidden="true"/>:<OpenAiLogo className="provider-mark" size={22} aria-hidden="true"/>}{base.label}<span className="member-count"><CountUp value={base.members} format={n=>n.toLocaleString()}/> Miso {base.members===1?'member':'members'}</span></h2>
   <div className="gauge-number tone-neutral">{flash&&<span key={flash.k} className={`delta-chip ${flash.d>0?'up':'down'}`} aria-hidden="true">{flash.d>0?'▲':'▼'}{Math.abs(flash.d)}</span>}<strong><CountUp value={grown?percent:0} ms={settled?650:lit*18+500} format={n=>n+'%'}/></strong></div></div>
  <div className="provider-reading"><div className="pressure-track segmented-track" role="img" aria-label={`${base.label}: ${percent}% capacity, ${base.members} Miso members.`}>
   {Array.from({length:SEGMENTS},(_,i)=><i key={i} aria-hidden="true" style={{'--i':i} as CSSProperties} className={`quota-segment ${i<lit?'is-filled':''} ${i===lit-1?'is-edge':''}`}/>)}
  </div></div>
  <p className="one-line"><span><b>{percent}% capacity</b>{isReal&&<> · typical 5-hour use across {base.members} Miso members</>}</span>{live&&<span className="row-live"><Spark values={drift.history} provider={provider}/><span className="row-flag"><i className="live-dot" aria-hidden="true"/>updated {Math.max(0,Math.round((tick-drift.at)/1000))}s ago</span></span>}</p>
 </article>;
}
export function QuotaBoard(){
 const demo=new URLSearchParams(window.location.search).get('demo')==='1';
 const capacityView=!demo&&new URLSearchParams(window.location.search).get('measured')!=='1';
 // The capacity bars start empty and fill once the page has painted.
 const [grown,setGrown]=useState(false);
 useEffect(()=>{if(!capacityView)return;let inner=0;const outer=requestAnimationFrame(()=>{inner=requestAnimationFrame(()=>setGrown(true));});return()=>{cancelAnimationFrame(outer);cancelAnimationFrame(inner);};},[capacityView]);
 const [data,setData]=useState<AllowanceCommunity|null>(null),[error,setError]=useState(false),[loading,setLoading]=useState(true),[attempt,setAttempt]=useState(0);
 const [selection,setSelection]=useState({claude:'',codex:''}),[now,setNow]=useState(Date.now());
 const controller=useRef<AbortController|null>(null);
 const [pulse,setPulse]=useState<Pulse|null>(null);
 const [downloads,setDownloads]=useState<number|null>(null);
 // Real fetch time of the last good downloads read. "Updated Ns ago" counts from this, never from the page load.
 const [downloadsAt,setDownloadsAt]=useState<number|null>(null);
 const [stars,setStars]=useState<Stargazers|null>(null);
 const [tick,setTick]=useState(Date.now());
 const [spot,setSpot]=useState(0);
 const reducedMotion=typeof window!=='undefined'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 useEffect(()=>{if(demo)return;const t=window.setInterval(()=>{if(document.visibilityState==='visible')setTick(Date.now());},1000);return()=>window.clearInterval(t);},[demo]);
 const recent=stars?.recent.slice(0,5)??[];
 // The ticker walks through the newest real stargazers. With reduced motion it stays on the newest.
 useEffect(()=>{if(reducedMotion||recent.length<2)return;const t=window.setInterval(()=>{if(document.visibilityState==='visible')setSpot(i=>i+1);},5000);return()=>window.clearInterval(t);},[reducedMotion,recent.length]);
 useEffect(()=>{if(demo)return;let active=true;
  const load=async()=>{if(document.visibilityState!=='visible')return;try{const r=await fetch(API+'/api/stargazers',{credentials:'omit',signal:AbortSignal.timeout(8000)});const v:unknown=r.ok?await r.json():null;if(active&&isStargazers(v))setStars(v);}catch{}};
  void load();const t=window.setInterval(()=>void load(),600000);const onVisible=()=>{if(document.visibilityState==='visible')void load();};document.addEventListener('visibilitychange',onVisible);
  return()=>{active=false;window.clearInterval(t);document.removeEventListener('visibilitychange',onVisible);};
 },[demo]);
 useEffect(()=>{if(demo)return;let active=true;let request:AbortController|null=null;
  async function load(){if(document.visibilityState!=='visible')return;request?.abort();const c=new AbortController();request=c;const timeout=window.setTimeout(()=>c.abort(),8000);
   try{const r=await fetch(API+'/api/downloads',{credentials:'omit',signal:c.signal});const v=r.ok?await r.json():null;if(active&&v&&Number.isSafeInteger(v.total)&&v.total>0){setDownloads(v.total);setDownloadsAt(Date.now());}}catch{}finally{window.clearTimeout(timeout);}}
  // A page opened in a background tab skips the first load; fetch as soon as it becomes visible.
  const onVisible=()=>{if(document.visibilityState==='visible')void load();};
  void load();const t=window.setInterval(()=>void load(),60000);document.addEventListener('visibilitychange',onVisible);
  return()=>{active=false;request?.abort();window.clearInterval(t);document.removeEventListener('visibilitychange',onVisible);};
 },[demo]);
 const [pulseError,setPulseError]=useState(false);
 // Members check in once a day, but the page checks every minute while visible so a new member shows soon after it is real.
 useEffect(()=>{let active=true;let request:AbortController|null=null;
  async function load(){if(demo){setPulse(createDemoPulse());return;}request?.abort();const c=new AbortController();request=c;
   const timeout=window.setTimeout(()=>c.abort(),10000);
   try{const r=await fetch(API+'/api/pulse',{credentials:'omit',cache:'no-store',signal:c.signal});if(!r.ok)throw new Error();const v:unknown=await r.json();if(!isPulse(v))throw new Error();if(active&&request===c){setNow(Date.now());setPulse(v);setPulseError(false);}}
   catch{if(active&&(!c.signal.aborted||request===c))setPulseError(true);}
   finally{window.clearTimeout(timeout);}}
  const resume=()=>{setNow(Date.now());if(document.visibilityState==='visible')void load();};void load();
  const t=window.setInterval(resume,60000);window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);
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
 const [signal,setSignal]=useState<SignalResponse|null>(null);
 // A failed refresh keeps the last good answer on screen.
 useEffect(()=>{if(demo)return;let active=true;
  const load=async()=>{try{const r=await fetch(API+'/api/limit-signal',{signal:AbortSignal.timeout(25000),credentials:'omit',cache:'no-store'});if(!r.ok)throw new Error();const v:unknown=await r.json();if(active&&isSignalResponse(v))setSignal(v);}catch{}};
  const resume=()=>{if(document.visibilityState==='visible')void load();};
  void load();const t=window.setInterval(resume,600000);document.addEventListener('visibilitychange',resume);
  return()=>{active=false;window.clearInterval(t);document.removeEventListener('visibilitychange',resume);};
 },[demo]);
 const stale=!!data&&(now-data.generatedAt>data.freshnessMinutes*60000||data.generatedAt>now+60000);
 const available=!!data&&!error&&!stale;
 return <section className="quota-board minimal-quota allowance-board clean" aria-label="Claude and Codex limits">
  {demo&&<aside className="demo-notice" aria-label="Demo data notice"><span>Demo · made-up numbers</span><a href={window.location.pathname}>Exit demo</a></aside>}
  <h1 className="headline">did they just nerf the limits? again!?</h1>
  {!demo&&(downloads!==null||(capacityView&&recent.length>0))&&<div className="live-block">
   <div className="live-status" role="status"><a className="face-stack" href="https://github.com/Relay-harness/miso/stargazers" rel="noreferrer" title="People who starred Miso on GitHub" aria-label="People who starred Miso on GitHub">{(capacityView&&recent.length>0?recent.slice(0,4).map(f=>({key:f.login,src:smallAvatar(f.avatar)})):FACES.map(f=>({key:f.login,src:`https://avatars.githubusercontent.com/u/${f.id}?s=64&v=4`}))).map(f=><img key={f.key} src={f.src} width={28} height={28} alt="" loading="lazy" referrerPolicy="no-referrer" onError={e=>{e.currentTarget.style.display='none';}}/>)}</a>{downloads!==null&&<a className="download-count" href="https://github.com/Relay-harness/miso/releases" rel="noreferrer">{capacityView?<CountUp value={downloads} format={downloadLabel}/>:downloadLabel(downloads)} {downloads===1?'download':'downloads'} on GitHub</a>}{capacityView&&stars?.weekCount?<span className="week-pill">+{stars.weekCount} {stars.weekCount===1?'star':'stars'} this week</span>:null}</div>
   {capacityView&&<div className="live-meta">{downloadsAt!==null&&<span className="live-flag"><i className="live-dot" aria-hidden="true"/>Live · updated {updatedAgo(downloadsAt,tick)}</span>}{recent.length>0&&(()=>{const r=recent[spot%recent.length];return <a key={r.login} className="star-tick" href={`https://github.com/${r.login}`} rel="noreferrer"><img src={smallAvatar(r.avatar)} width={18} height={18} alt="" referrerPolicy="no-referrer"/>@{r.login} starred Miso · {starAgo(r.starredAt,tick)}</a>;})()}</div>}
  </div>}
  {(pulseError||error||stale)&&<div className="collector-notice" role="status"><Info size={13}/><span>{stale?'Allowance evidence is stale.':'Can’t reach the data right now.'} <button onClick={()=>setAttempt(v=>v+1)}>Retry</button></span></div>}
  <div className="provider-stack">{(['claude','codex'] as const).map(provider=>{
   const kind='five_hour';
   const groups=available?data.cohorts.filter(c=>c.provider===provider&&c.kind===kind):[];
   const selected=selection[provider]||(groups[0]?key(groups[0]):'');
   const cohort=groups.find(c=>key(c)===selected);
   const usage=!demo?members?.providers[provider]??null:null;
   const change=limitChange(provider,cohort,now);
   const label=provider==='claude'?'Claude':'OpenAI';
   // A measured result or a change from this week is the figure. Otherwise it is what public posts state this week.
   const read=(change.state==='quiet'||change.state==='unknown')?signal?.providers[provider]??null:null;
   const said=read?signalGauge(label,read):null;
   const figure=change.state==='cut'?`−${change.percent}%`:change.state==='extra'?`+${change.percent}%`:change.state==='normal'?'Normal':change.state==='unclear'?'Unclear':change.state==='changed'?'Changed':said?said.figure:'-';
   const tone=said?said.tone:change.state==='cut'?'decreased':change.state==='extra'?'increased':'neutral';
   const measured=!change.announcement&&change.state!=='unknown'&&!!cohort?.interval;
   const summary=said?`${said.headline}. ${said.who}.`:change.state==='quiet'?`No reports available. Last change: ${change.announcement.headline}.`:change.announcement?`${figure}, not measured by Miso. ${change.announcement.headline}.`:change.state==='cut'?`Limit cut by ${change.percent}%.`:change.state==='extra'?`Extra limit, ${change.percent}% higher.`:change.state==='normal'?'Limit is normal, no change detected.':change.state==='unclear'?'The measurements disagree, so no change is shown.':'Limit change not measured yet.';
   const announced=change.announcement;
   const filled=said?said.filled:change.filled;
   const source=macs(change.contributors);
   if(capacityView)return <LiveCapacity key={provider} provider={provider} real={members?.providers[provider]??null} grown={grown} tick={tick} reducedMotion={reducedMotion}/>;
   return <article key={provider} className={`quota-gauge provider-row ${provider} ${kind} ${tone==='decreased'?'allowance-decreased':''}`} aria-label={`${label} five-hour limit change`}>
    <div className="provider-line"><h2>{provider==='claude'?<img className="provider-mark" src="/claude-ai-logo.png" width={22} height={22} alt="" aria-hidden="true"/>:<OpenAiLogo className="provider-mark" size={22} aria-hidden="true"/>}{label}</h2><div className={`gauge-number tone-${tone} ${['Normal','Unclear','Changed'].includes(figure)?'is-word':''}`}><strong>{figure}</strong></div></div>
    <div className="provider-reading"><div className={`pressure-track segmented-track ${filled?'':'no-readings'}`} role="img" title={[measured?`Likely ${range(cohort!)} · ${cohort!.contributors} ${plan(cohort!.plan)} users on ${model(cohort!.model)} · updated ${ago(cohort!.latestAt!)}`:'',read?`Read from public ${read.sources.join(' and ')} posts, not a measurement. ${read.stated} ${read.stated===1?'post states':'posts state'} a change. Normal until ${signal!.minStated} do.`:'',usage?`Typical 5-hour use: ${usage.medianUsed}%`:'',said&&announced?`Last announced change: ${announced.headline}, ${when(announced.date,now)}`:''].filter(Boolean).join(' · ')||undefined} aria-label={summary}>
     {Array.from({length:40},(_,i)=><i key={i} aria-hidden="true" className={`quota-segment ${i<filled?'is-filled':tone==='decreased'?'is-lost':''}`}/>)}
    </div></div>
    <p className={`one-line tone-${tone}`}>{said?<span><b>{said.headline}</b> · {said.who}</span>:announced?<span title={announced.detail}><b>{change.state==='quiet'?`Last: ${announced.headline}`:announced.headline}</b> · {change.state==='quiet'?'':'Announced '}{when(announced.date,now)} · <a href={announced.url} target="_blank" rel="noopener noreferrer">{announced.source}</a></span>:loading&&!data&&change.state==='unknown'?'Checking…':change.state==='cut'?<span><b>Limit cut</b> · vs past week{source}</span>:change.state==='extra'?<span><b>Extra limit</b> · vs past week{source}</span>:change.state==='normal'?<span><b>No change</b> · vs past week{source}</span>:change.state==='unclear'?<span><b>Measurements disagree</b>{source}</span>:<span><b>Not measured yet</b></span>}</p>
    {groups.length>1&&<label className="evidence-group"><span className="sr-only">{provider==='claude'?'Claude':'OpenAI'} group</span><select aria-label={`${provider==='claude'?'Claude':'OpenAI'} evidence group`} value={cohort?key(cohort):''} onChange={event=>setSelection(previous=>({...previous,[provider]:event.target.value}))}>{!cohort&&<option value="" disabled>Select a group</option>}{groups.map(c=><option key={key(c)} value={key(c)}>{groupLabel(c)}</option>)}</select></label>}
   </article>;
  })}</div>
  {capacityView&&<div className="index-note" role="note">
   <p className="index-line">Calculating the Throttle Index from {downloads!==null?downloadLabel(downloads):'60+'} downloads.</p>
   <p>Based on the growing Miso download dataset.</p>
  </div>}
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
