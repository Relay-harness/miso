import {useEffect,useRef,useState} from 'react';
import {ArrowClockwise,ArrowUpRight,Info,OpenAiLogo} from '@phosphor-icons/react';
import {createDemoAllowance} from './demo';
import {isAllowanceCommunity} from './allowance-data';
import type {AllowanceCommunity,AllowanceCohort,WindowKind} from './allowance-data';
const labels={decreased:'Estimated decrease',increased:'Estimated increase',no_detectable_change:'No detectable change',inconclusive:'Evidence inconclusive',insufficient:'Insufficient evidence'};
const key=(c:AllowanceCohort)=>[c.plan,c.model,c.contextBand,c.protocol].join(':');
const groupLabel=(c:AllowanceCohort)=>`${c.plan.replaceAll('_',' ')} · ${c.model} · ${c.contextBand} context`;
export function QuotaBoard(){
 const demo=new URLSearchParams(window.location.search).get('demo')==='1';
 const [data,setData]=useState<AllowanceCommunity|null>(null),[error,setError]=useState(false),[loading,setLoading]=useState(true),[attempt,setAttempt]=useState(0);
 const [selection,setSelection]=useState({claude:'',codex:''}),[now,setNow]=useState(Date.now()),[kind,setKind]=useState<WindowKind>('five_hour');
 const controller=useRef<AbortController|null>(null);
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
 return <section className="quota-board minimal-quota allowance-board" aria-label="Community allowance changes">
  <h1 className="sr-only">Claude and OpenAI allowance changes</h1>
  <div className="quota-toolbar"><a className="cat-link" href="https://github.com/Relay-harness/relay-cat">Connect your cat <ArrowUpRight size={15} aria-hidden="true"/></a><div className="window-switch" aria-label="Allowance window"><button aria-pressed={kind==='five_hour'} onClick={()=>setKind('five_hour')}>5-hour</button><button aria-pressed={kind==='weekly'} onClick={()=>setKind('weekly')}>Weekly</button><button className="icon-button" aria-label="Refresh allowance evidence" disabled={loading} onClick={()=>setAttempt(v=>v+1)}><ArrowClockwise size={14}/></button></div></div>
  {demo&&<aside className="demo-notice" aria-label="Demo data notice"><span>Demo · hypothetical changes</span><a href={window.location.pathname}>Exit demo</a></aside>}
  <p className="allowance-disclaimer">Experimental allowance estimate. Not quota used or official provider limits.</p>
  {(error||stale)&&<div className="collector-notice" role="status"><Info size={13}/><span>{stale?'Evidence stale. Estimates hidden.':'Collector unavailable. No estimates.'} <button onClick={()=>setAttempt(v=>v+1)}>Retry</button></span></div>}
  <div className="provider-stack">{(['claude','codex'] as const).map(provider=>{
   const groups=available?data.cohorts.filter(c=>c.provider===provider&&c.kind===kind):[];
   const selected=selection[provider]|| (groups[0]?key(groups[0]):'');
   const cohort=groups.find(c=>key(c)===selected);
   const ready=!!cohort&&cohort.status!=='insufficient'&&cohort.index!==null;
   const index=ready?cohort.index:null;
   const filled=index===null?0:Math.floor(Math.min(200,index)/5);
   return <article key={provider} className={`quota-gauge provider-row ${provider} ${ready&&cohort.status==='decreased'?'allowance-decreased':''}`} aria-label={`${provider==='claude'?'Claude':'OpenAI'} ${kind==='five_hour'?'five-hour':'weekly'} allowance`}>
    <div className="provider-line"><h2>{provider==='claude'?<img className="provider-mark" src="/claude-ai-logo.png" width={36} height={36} alt="" aria-hidden="true"/>:<OpenAiLogo className="provider-mark" size={31} aria-hidden="true"/>}{provider==='claude'?'Claude':'OpenAI'}</h2><div className="gauge-number"><strong>{index===null?'—':index===0?'<5':index}</strong>{index!==null&&<span>%</span>}</div></div>
    <div className="provider-reading"><div className={`pressure-track segmented-track ${ready?'':'no-readings'}`} role="img" aria-label={index===null?'Insufficient matched evidence':`${index===0?'Less than 5':index}% of baseline effective allowance. Scale zero to 200%; baseline is 100%.`}>
     {Array.from({length:40},(_,i)=><i key={i} aria-hidden="true" className={`quota-segment ${i<filled?'is-filled':''}`}/>)}
     {ready&&<span className="baseline-marker" aria-hidden="true"/>}
    </div></div>
    <div className="provider-status"><span className="status-label">{loading?'Updating…':ready?labels[cohort.status]:'Insufficient evidence'}</span><span className="quota-caption">100% = baseline</span></div>
    {groups.length>1||(groups.length===1&&!cohort)?<label className="evidence-group"><span className="sr-only">{provider==='claude'?'Claude':'OpenAI'} evidence group</span><select aria-label={`${provider==='claude'?'Claude':'OpenAI'} evidence group`} value={cohort?key(cohort):''} onChange={event=>setSelection(previous=>({...previous,[provider]:event.target.value}))}>{!cohort&&<option value="" disabled>Select a matching group</option>}{groups.map(c=><option key={key(c)} value={key(c)}>{groupLabel(c)}</option>)}</select></label>:cohort&&<p className="evidence-group">{groupLabel(cohort)}</p>}
    {ready&&cohort.interval&&<p className="allowance-evidence">{cohort.contributors} matched installs · uncertainty {cohort.interval[0]}–{cohort.interval[1]}%<span>Last observation {new Date(cohort.latestAt!).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span></p>}
   </article>;
  })}</div>
  {available&&data.reportingInstallations!==null&&<div className="checkin-row" aria-label="Matched reporting installations" title="Pseudonymous installations, not verified unique people. Circles are decorative."><div className="checkin-avatars" aria-hidden="true">{['m','i','s','o'].map(initial=><span key={initial}>{initial}</span>)}</div><p>{data.reportingInstallations.toLocaleString()} installs compared.{demo&&<span className="checkin-sample">Hypothetical sample · Miso Cat</span>}</p></div>}
  {available&&data.reportingInstallations===null&&<p className="allowance-empty">Waiting for matched calibrations. The updated Mac app offers optional, user-started Claude sessions; ordinary quota reads are not evidence.</p>}
  <details className="allowance-method"><summary>How this is measured</summary><p>Comparable work per quota point, not quota used. The most recent 24 hours are compared with the preceding six days within the same installation, account series, plan, model, context band and controlled task protocol. Each installation needs at least three non-overlapping intervals in each period. At least {data?.minCohort||10} matched installations are required.</p><p>100% means baseline effective allowance; 50% means half the baseline, and 150% means one and a half times the baseline. The bars run from 0 to 200%, with a marker at 100%. Values above 200% retain their number but fill the visual scale.</p><p>A decrease or increase requires the conservative uncertainty interval to fall entirely below 85% or above 115%. Uncertainty combines an installation-level bootstrap with quota-resolution bounds. It does not eliminate confounding, inaccurate client reports or fake installations. These are experimental effective-allowance estimates, not proof of an official quota change.</p><p>The updated Mac app offers optional, user-started Claude Sonnet 4.5 calibration sessions. These consume subscription quota and require exclusive-account confirmation before and after a bounded fixed workload. Ordinary quota reports, daily token totals and uninstrumented Codex activity cannot populate these bars. Unknown or incomplete evidence stays unavailable.</p></details>
 </section>;
}
