import {useEffect,useRef,useState} from 'react';
import {Circle,Warning,Info,OpenAiLogo,DownloadSimple,Copy,Check} from '@phosphor-icons/react';
import {createDemoAllowance} from './demo';
import {createDemoPulse,isPulse} from './pulse-data';
import type {Pulse,PulseProvider} from './pulse-data';
import {isAllowanceCommunity} from './allowance-data';
import type {AllowanceCommunity,AllowanceCohort,WindowKind} from './allowance-data';
const labels={decreased:'Estimated decrease',increased:'Estimated increase',no_detectable_change:'No detectable change',inconclusive:'Evidence inconclusive',insufficient:'Insufficient evidence'};
const note=(c:AllowanceCohort)=>{const i=Math.round(c.index??100);return c.status==='decreased'?`Same work gets about ${i}% of last week's 5-hour allowance.`:c.status==='increased'?`Same work gets about ${i}% of last week's 5-hour allowance.`:c.status==='no_detectable_change'?`The 5-hour allowance matches last week.`:`Signal is too noisy to call yet.`;};
const line=(c:AllowanceCohort)=>{const d=Math.abs(Math.round((c.index??100)-100));return c.status==='decreased'?<><b>{d}% less</b> than last week</>:c.status==='increased'?<><b>{d}% more</b> than last week</>:c.status==='no_detectable_change'?<><b>Unchanged</b> from last week</>:<><b>Too close to call</b> this week</>;};
const plan=(p:string)=>({pro:'Pro',max_5x:'Max 5x',max_20x:'Max 20x',plus:'Plus'} as Record<string,string>)[p]??p;
const model=(m:string)=>m.replace(/^gpt-(\d+)-(\d+)-codex$/,'GPT-$1.$2 Codex').replace(/^gpt-5-codex$/,'GPT-5 Codex').replace(/^(sonnet|opus|haiku)-(\d+)(?:-(\d+))?$/,(_,n,a,b)=>n[0].toUpperCase()+n.slice(1)+' '+a+(b?'.'+b:''));
const ago=(t:number)=>{const m=Math.max(0,Math.round((Date.now()-t)/60000));return m<1?'just now':m<60?`${m}m ago`:`${Math.round(m/60)}h ago`;};
const name=(p:'claude'|'codex')=>p==='claude'?'Claude':'Codex';
const runway=(index:number)=>{const m=Math.round(300*index/100/5)*5;const h=Math.floor(m/60),r=m%60;return h&&r?`${h}h ${r}m`:h?`${h}h`:`${r}m`;};
const delta=(c:AllowanceCohort)=>Math.round((c.index??100)-100);
const explain=(c:AllowanceCohort,p:'claude'|'codex')=>{const i=c.index??100,[lo,hi]=c.interval??[i,i];
 if(c.status==='decreased')return <>Same work, less runway. A 5-hour {name(p)} window now runs out in about <b>{runway(i)}</b> at the same pace. Likely {100-hi}-{100-lo}% less than last week.</>;
 if(c.status==='increased')return <>Same work, more runway. A 5-hour {name(p)} window now lasts about <b>{runway(i)}</b> of work at last week's pace. Likely {lo-100}-{hi-100}% more.</>;
 if(c.status==='no_detectable_change')return <>Same work, same runway. A 5-hour {name(p)} window still lasts about <b>5 hours</b>.</>;
 return <>Somewhere between {lo}% and {hi}% of last week. Too wide to call yet.</>;};
const range=(c:AllowanceCohort)=>{const [lo,hi]=c.interval!;const f=(n:number)=>n===0?'0':(n>0?'+':'−')+Math.abs(n);const a=lo-100,b=hi-100;return a===b?f(a)+'%':Math.abs(a)>Math.abs(b)?`${f(b)} to ${f(a)}%`:`${f(a)} to ${f(b)}%`;};
const hourLabel=(h:number)=>{const d=new Date();d.setUTCHours(h,0,0,0);return d.toLocaleTimeString([],{hour:'numeric'});};
const heat=(v:number|null)=>v===null?'none':v<10?'h0':v<20?'h1':v<35?'h2':v<50?'h3':'h4';
function NowLine({provider,p}:{provider:'claude'|'codex';p:PulseProvider|null}){
 const label=provider==='claude'?'Claude':'Codex';
 if(!p?.now)return <li className="now-row"><span className="now-name">{label}</span><span className="now-empty">waiting for live readings</span></li>;
 const d=p.previous?p.now.atLimit-p.previous.atLimit:null;
 return <li className="now-row"><span className="now-name">{label}</span><strong className={`now-value ${heat(p.now.atLimit)}`}>{p.now.atLimit}%</strong><span className="now-text">hit their 5-hour limit in the last 30 min</span>{d!==null&&<span className={`now-delta ${d>0?'worse':d<0?'better':''}`}>{d===0?'= same as before':d>0?`↑ from ${p.previous!.atLimit}%`:`↓ from ${p.previous!.atLimit}%`}</span>}</li>;
}
function PulseStrip({p}:{p:PulseProvider|null}){
 const b=p?.buckets??[];
 return <div className="pulse"><div className="pulse-head"><span>Last 24 hours · share hitting the limit</span>{p?.quietest&&<span>Quietest: {hourLabel(p.quietest.startHourUtc)}-{hourLabel((p.quietest.startHourUtc+3)%24)}</span>}</div>
  <div className="pulse-cells" role="img" aria-label={b.some(x=>x.atLimit!==null)?`Half-hourly share of users at their limit over 24 hours. Latest ${p?.now?.atLimit??'unknown'}%.`:'No live readings yet'}>{(b.length?b:Array.from({length:48},()=>null)).map((x,i)=><i key={i} className={`cell ${heat(x?.atLimit??null)}`} title={x&&x.atLimit!==null?`${new Date(x.start).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})} · ${x.atLimit}% at limit · ${x.installs} Macs`:undefined}/>)}</div>
  <div className="pulse-axis" aria-hidden="true"><span>24h ago</span><span>12h</span><span>now</span></div></div>;
}
const INSTALL='brew install --cask relay-harness/tap/relay-cat';
function InstallCommand(){const [copied,setCopied]=useState(false);return <div className="terminal"><code><span className="prompt" aria-hidden="true">$</span>{INSTALL}</code><button type="button" aria-label={copied?'Copied':'Copy'} onClick={async()=>{try{await navigator.clipboard.writeText(INSTALL);setCopied(true);window.setTimeout(()=>setCopied(false),1600);}catch{}}}>{copied?<Check size={16} weight="bold" aria-hidden="true"/>:<Copy size={16} aria-hidden="true"/>}<span>{copied?'Copied':'Copy'}</span></button></div>;}
const clock=(t:number)=>new Date(t).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
const peakText=(p:PulseProvider)=>{const xs=p.buckets.filter(b=>b.atLimit!==null);if(xs.length<2)return null;const hi=xs.reduce((m,b)=>b.atLimit!>m.atLimit!?b:m),lo=xs.reduce((m,b)=>b.atLimit!<m.atLimit!?b:m);return <span>Worst <b>{hi.atLimit}%</b> at {clock(hi.start)} · calmest {lo.atLimit}% at {clock(lo.start)}</span>;};
function Day24({p}:{p:PulseProvider|null}){
 const b=p?.buckets??Array.from({length:48},()=>null);const top=Math.max(40,...b.map(x=>x?.atLimit??0));
 return <div className="day24"><div className="day24-bars" role="img" aria-label={p?.now?`Share of Macs at their 5-hour limit, every 30 minutes for the last 24 hours. Now ${p.now.atLimit}%.`:'No live readings in the last 24 hours'}>{b.map((x,i)=>{const v=x?.atLimit??null;return <i key={i} className={`col ${v===null?'none':heat(v)}${i===b.length-1?' is-now':''}`} style={v===null?undefined:{height:`${Math.max(6,v/top*100)}%`}} title={x&&v!==null?`${clock(x.start)} · ${v}% at limit · ${x.installs} Macs`:undefined}/>;})}</div><div className="day24-axis" aria-hidden="true"><span>24h ago</span><span>12h ago</span><span>now</span></div></div>;
}
const verdict={decreased:'Lower than usual',increased:'Higher than usual',no_detectable_change:'Same as usual',inconclusive:'Unclear',insufficient:'Not enough data yet'};
const key=(c:AllowanceCohort)=>[c.plan,c.model,c.contextBand,c.protocol].join(':');
const groupLabel=(c:AllowanceCohort)=>`${c.plan.replaceAll('_',' ')} · ${c.model} · ${c.contextBand} context`;
export function QuotaBoard(){
 const demo=new URLSearchParams(window.location.search).get('demo')==='1';
 const [data,setData]=useState<AllowanceCommunity|null>(null),[error,setError]=useState(false),[loading,setLoading]=useState(true),[attempt,setAttempt]=useState(0);
 const [selection,setSelection]=useState({claude:'',codex:''}),[now,setNow]=useState(Date.now());;
 const controller=useRef<AbortController|null>(null);
 const [pulse,setPulse]=useState<Pulse|null>(null);
 useEffect(()=>{let active=true;async function load(){if(demo){setPulse(createDemoPulse());return;}try{const r=await fetch('/api/pulse',{credentials:'omit',cache:'no-store'});if(!r.ok)throw new Error();const v:unknown=await r.json();if(active)setPulse(isPulse(v)?v:null);}catch{if(active)setPulse(null);}}void load();const t=window.setInterval(()=>{if(document.visibilityState==='visible')void load();},30000);return()=>{active=false;window.clearInterval(t);};},[demo,attempt]);
 const [tick,setTick]=useState(Date.now());useEffect(()=>{const t=window.setInterval(()=>setTick(Date.now()),1000);return()=>window.clearInterval(t);},[]);
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
  <section className="join" aria-label="Add your Mac">
   {sources>0?<p className="join-count"><strong>{sources.toLocaleString()}</strong><span>developers are sourcing these numbers. Add your Mac and make it {(sources+1).toLocaleString()}.</span></p>:<p className="join-count"><span className="join-empty">Be one of the first 10 developers to add a Mac.</span></p>}
   <InstallCommand/>
   <a className="join-download" href="https://github.com/Relay-harness/miso/releases/download/v1.8.0/Miso-1.8.0-macos-arm64.zip"><DownloadSimple size={15} aria-hidden="true"/>Or download the Mac app</a>
  </section>
 </section>;
}
