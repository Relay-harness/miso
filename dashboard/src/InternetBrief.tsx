import {useEffect,useState} from 'react';
import {ArrowUpRight} from '@phosphor-icons/react';
import {LIMIT_SEARCHES,limitSearchURL,parseLimitPost,rankLimitPosts} from './limit-posts';
import type {LimitPost} from './limit-posts';
export function InternetBrief({onOpen}:{onOpen:()=>void}){
 const [posts,setPosts]=useState<LimitPost[]>([]),[state,setState]=useState('Checking quota reports…');
 useEffect(()=>{
  let active=true,current:AbortController|null=null,busy=false;
  async function load(){
   if(busy)return;busy=true;const c=new AbortController();current=c;const timer=window.setTimeout(()=>c.abort(),10000);
   try{
    const results=await Promise.allSettled(LIMIT_SEARCHES.filter(s=>s.provider!=='Gemini').map(async search=>{
     const res=await fetch(limitSearchURL(search.query),{signal:c.signal,credentials:'omit',referrerPolicy:'no-referrer'});
     if(!res.ok)throw new Error();const body=await res.json();if(!Array.isArray(body.hits))throw new Error();
     return body.hits.map((hit:unknown)=>parseLimitPost(hit)).filter((p:LimitPost|null):p is LimitPost=>p!==null);
    }));
    if(!active)return;
    const selected=rankLimitPosts(results.flatMap(r=>r.status==='fulfilled'?r.value:[])).slice(0,3);
    setPosts(selected);
    const failures=results.filter(r=>r.status==='rejected').length;
    setState(failures===results.length?'Source unavailable.':selected.length?`Quota reports · unverified${failures?' · partial coverage':''}`:failures?'No qualifying reports in available sources.':'No specific quota reports in the last 90 days.');
   }catch{if(active){setPosts([]);setState('Source unavailable.');}}finally{window.clearTimeout(timer);busy=false;}
  }
  void load();const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void load();},300000);
  return()=>{active=false;current?.abort();window.clearInterval(timer);};
 },[]);
 return <aside className="internet-brief" aria-label="Recent internet posts">
  <div className="brief-heading"><h2>Folks that talk</h2><p className="brief-sub">What people are saying about their limits.</p></div>
  <p className={`brief-state${posts.length?' sr-only':''}`} role="status">{state}</p>
  <ol>{posts.map(p=><li key={p.id}>
   <a href={`https://news.ycombinator.com/item?id=${p.id}`} target="_blank" rel="noopener noreferrer" title={`${p.title}, by ${p.author} · ${p.reason} · ${p.comments} comments · ${p.points} HN points`}>
    {p.title.replace(/^(?:Ask|Tell) HN:\s*/i,'')}
   </a>
   <div className="brief-meta"><span>{p.comments} comments on HN</span><span aria-hidden="true">·</span><time dateTime={new Date(p.created).toISOString()}>{new Date(p.created).toLocaleDateString([],{month:'short',day:'numeric',...(new Date(p.created).getFullYear()!==new Date().getFullYear()?{year:'numeric' as const}:{})})}</time></div>
  </li>)}</ol>
  <button className="brief-more" onClick={onOpen}>More reports →</button>
 </aside>;
}
