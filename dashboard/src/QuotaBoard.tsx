import {useEffect,useRef,useState} from 'react';
import {Info,OpenAiLogo,DownloadSimple,Copy,Check} from '@phosphor-icons/react';
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
const INSTALL='brew install --cask relay-harness/tap/relay-cat';
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
 useEffect(()=>{if(demo)return;let active=true;fetch('/api/downloads',{credentials:'omit'}).then(r=>r.ok?r.json():null).then(v=>{if(active&&v&&Number.isSafeInteger(v.total)&&v.total>0)setDownloads(v.total);}).catch(()=>{});return()=>{active=false;};},[demo]);
 useEffect(()=>{let active=true;async function load(){if(demo){setPulse(createDemoPulse());return;}try{const r=await fetch('/api/pulse',{credentials:'omit',cache:'no-store'});if(!r.ok)throw new Error();const v:unknown=await r.json();if(active)setPulse(isPulse(v)?v:null);}catch{if(active)setPulse(null);}}void load();const t=window.setInterval(()=>{if(document.visibilityState==='visible')void load();},30000);return()=>{active=false;window.clearInterval(t);};},[demo,attempt]);
 const livePulse=pulse&&Date.now()-pulse.generatedAt<15*60000?pulse:null;
 useEffect(()=>{const c=livePulse?.providers.claude.now,pr=livePulse?.providers.claude.previous;document.title=c?`${pr?(c.atLimit>pr.atLimit?'↑':c.atLimit<pr.atLimit?'↓':'='):''} Claude ${c.atLimit}% at limit · throttleindex`:'throttleindex · are the limits shrinking?';},[livePulse]);
 useEffect(()=>{
  let active=true;
  async function load(){
   if(demo){if(active){setData(createDemoAllowance());setError(false);setNow(Date.now());setLoading(false);}return;}
   controller.current?.abort();const c=new AbortController();controller.current=c;const timeout=window.setTimeout(()=>c.abort(),10000);setLoading(true);
   try{const response=await fetch('/api/allowance',{signal:c.signal,credentials:'omit',cache:'no-store'});if(!response.ok)throw new Error();const value:unknown=await response.json();if(!isAllowanceCommunity(value))throw new Error();if(active){setData(value);setError(false);setNow(Date.now());}}
   catch{if(active)setError(true);}finally{window.clearTimeout(timeout);if(active)setLoading(false);}
  }
  void load();const interval=window.setInterval(()=>{setNow(Date.now());if(document.visibilityState==='visible')void load();},60000);
  return()=>{active=false;controller.current?.abort();window.clearInterval(interval);};
 },[attempt,demo]);
 const stale=!!data&&(now-data.generatedAt>data.freshnessMinutes*60000||data.generatedAt>now+60000);
 const available=!!data&&!error&&!stale;
 const sources=Math.max(available&&data.reportingInstallations?data.reportingInstallations:0,livePulse?.providers.claude.now?.installs??0,livePulse?.providers.codex.now?.installs??0);
 return <section className="quota-board minimal-quota allowance-board clean" aria-label="Claude and Codex limits">
  {demo&&<aside className="demo-notice" aria-label="Demo data notice"><span>Demo · made-up numbers</span><a href={window.location.pathname}>Exit demo</a></aside>}
  <h1 className="headline">did they just nerf the limits? again!?</h1>
  {(error||stale)&&<div className="collector-notice" role="status"><Info size={13}/><span>{stale?'Data is stale. Hidden until it updates.':'Can’t reach the data right now.'} <button onClick={()=>setAttempt(v=>v+1)}>Retry</button></span></div>}
  <div className="provider-stack">{(['claude','codex'] as const).map(provider=>{
   const kind='five_hour';
   const groups=available?data.cohorts.filter(c=>c.provider===provider&&c.kind===kind):[];
   const selected=selection[provider]||(groups[0]?key(groups[0]):'');
   const cohort=groups.find(c=>key(c)===selected);
   const ready=!!cohort&&cohort.status!=='insufficient'&&cohort.index!==null;
   const index=ready?cohort.index:null;
   const filled=index===null?0:Math.min(40,Math.round(index/2.5));
   const tone=ready?cohort.status:'insufficient';
   const live=livePulse?.providers[provider]??null;
   const d=live?.now&&live.previous?live.now.atLimit-live.previous.atLimit:null;
   return <article key={provider} className={`quota-gauge provider-row ${provider} ${kind} ${tone==='decreased'?'allowance-decreased':''}`} aria-label={`${provider==='claude'?'Claude':'OpenAI'} five-hour allowance`}>
    <div className="provider-line"><h2>{provider==='claude'?<img className="provider-mark" src="/claude-ai-logo.png" width={22} height={22} alt="" aria-hidden="true"/>:<OpenAiLogo className="provider-mark" size={22} aria-hidden="true"/>}{provider==='claude'?'Claude':'OpenAI'}{ready&&delta(cohort)!==0&&<span className={`provider-sub tone-${tone}`}>{`${delta(cohort)>0?'+':'−'}${Math.abs(delta(cohort))}% this week`}</span>}</h2><div className="gauge-number"><strong>{index===null?'-':index}</strong>{index!==null&&<span>%</span>}</div></div>
    <div className="provider-reading"><div className={`pressure-track segmented-track ${ready?'':'no-readings'}`} role="img" title={ready&&cohort.interval?`Likely ${range(cohort)} · ${cohort.contributors} ${plan(cohort.plan)} users on ${model(cohort.model)} · updated ${ago(cohort.latestAt!)}`:undefined} aria-label={index===null?'No data yet':`${index}% of last week's 5-hour allowance. A full bar means no change.`}>
     {Array.from({length:40},(_,i)=><i key={i} aria-hidden="true" className={`quota-segment ${i<filled?'is-filled':ready&&tone==='decreased'?'is-lost':''}`}/>)}
    </div></div>
    <p className={`one-line tone-${tone}`}>{loading&&!data?'Checking…':ready?<span>Your 5-hour window now lasts <b>~{runway(index!)}</b></span>:'No data yet. Needs 10 Macs.'}{live?.now&&<span className="live-bit"><i className="live-dot" aria-hidden="true"/><span>{live.now.atLimit}% hitting the limit now{d!==null&&d!==0&&<em className={d>0?'worse':'better'}>{d>0?' ↑':' ↓'}</em>}</span></span>}</p>
    {groups.length>1&&<label className="evidence-group"><span className="sr-only">{provider==='claude'?'Claude':'OpenAI'} group</span><select aria-label={`${provider==='claude'?'Claude':'OpenAI'} evidence group`} value={cohort?key(cohort):''} onChange={event=>setSelection(previous=>({...previous,[provider]:event.target.value}))}>{!cohort&&<option value="" disabled>Select a group</option>}{groups.map(c=><option key={key(c)} value={key(c)}>{groupLabel(c)}</option>)}</select></label>}
   </article>;
  })}</div>
  <section className="miso" aria-labelledby="miso-title">
   <p className="kicker">For folks on macOS</p>
   <h2 id="miso-title">Help make this dashboard more accurate.</h2>
   <p className="miso-copy">Download Miso. It shows your live session usage on your Mac and warns you before a limit runs out. It also powers this index, with zero prompt tracking.</p>
   <div className="miso-terminal"><span className="sleeping-miso" role="img" aria-label="Miso the cat, asleep on your terminal"/><InstallCommand/></div>
   <div className="miso-foot">{sources>0?<p className="join-count"><strong>{sources.toLocaleString()}</strong> developers share already. Add yours and make it {(sources+1).toLocaleString()}.</p>:<p className="join-count join-empty">{downloads?<><strong>{downloads.toLocaleString()}</strong> downloads so far. Live numbers appear once 5 Macs share.</>:'Be one of the first 10 developers to add a Mac.'}</p>}<a className="join-download" href="https://github.com/Relay-harness/miso/releases/download/v1.9.1/Miso-1.9.1-macos-arm64.zip"><DownloadSimple size={15} aria-hidden="true"/>Or download the app</a></div>
  </section>
 </section>;
}
