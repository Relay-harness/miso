import {useEffect,useState} from 'react';
import {ChatCircle,ArrowFatUp} from '@phosphor-icons/react';
const HUES=['#c96f56','#6f9c86','#8a7fc4','#c49a4a','#5f8fb4','#b5718f'];
const hue=(s:string)=>HUES[[...s].reduce((n,c)=>n+c.charCodeAt(0),0)%HUES.length];
const since=(t:number)=>{const m=Math.max(1,Math.round((Date.now()-t)/60000));return m<60?`${m}m`:m<1440?`${Math.round(m/60)}h`:`${Math.round(m/1440)}d`;};
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
  <h2 className="brief-title">What folks are saying</h2>
  <p className={`brief-state${posts.length?' sr-only':''}`} role="status">{state}</p>
  <ol className="feed">{posts.map(p=><li key={p.id} className="post">
   <header className="post-head"><span className="avatar" style={{background:hue(p.author)}} aria-hidden="true">{p.author.slice(0,1).toUpperCase()}</span><span className="post-who"><b>{p.author}</b><span>Hacker News · {since(p.created)}</span></span></header>
   <a href={`https://news.ycombinator.com/item?id=${p.id}`} target="_blank" rel="noopener noreferrer" title={`${p.title}, by ${p.author} · ${p.reason} · ${p.comments} comments · ${p.points} HN points`}>{p.title.replace(/^(?:Ask|Tell) HN:\s*/i,'')}</a>
   <footer className="brief-meta"><span><ChatCircle size={15} aria-hidden="true"/>{p.comments}<span className="sr-only"> comments</span></span><span><ArrowFatUp size={15} aria-hidden="true"/>{p.points}<span className="sr-only"> points</span></span></footer>
  </li>)}</ol>
  <button className="brief-more" onClick={onOpen}>More reports →</button>
 </aside>;
}
