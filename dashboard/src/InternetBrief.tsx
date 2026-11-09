import {useEffect,useState} from 'react';
import {ChatCircle,ArrowFatUp} from '@phosphor-icons/react';
import {loadLimitPosts} from './limit-posts';
import {latestReports} from './limit-signal';
import type {LatestReport} from './limit-signal';
const API=['www.throttleindex.com','throttleindex.com'].includes(window.location.hostname)?'https://api.throttleindex.com':'';
const WEEK=7*86400000;
const HUES=['#c96f56','#6f9c86','#8a7fc4','#c49a4a','#5f8fb4','#b5718f'];
const hue=(s:string)=>HUES[[...s].reduce((n,c)=>n+c.charCodeAt(0),0)%HUES.length];
const since=(t:number)=>{const m=Math.max(1,Math.round((Date.now()-t)/60000));return m<60?`${m}m`:m<1440?`${Math.round(m/60)}h`:`${Math.round(m/1440)}d`;};
const NONE='No specific quota reports this week.';
async function fromCollector():Promise<LatestReport[]|null> {
 try{
  const res=await fetch(API+'/api/limit-signal',{signal:AbortSignal.timeout(25000),credentials:'omit',cache:'no-store'});
  return res.ok?latestReports(await res.json()):null;
 }catch{return null;}
}
export function InternetBrief({onOpen}:{onOpen:()=>void}){
 const [posts,setPosts]=useState<LatestReport[]>([]),[state,setState]=useState('Checking quota reports…');
 useEffect(()=>{
  let active=true,busy=false;
  async function load(){
   if(busy)return;busy=true;
   try{
    const latest=await fromCollector();
    if(!active)return;
    if(latest){const selected=latest.slice(0,3);setPosts(selected);setState(selected.length?'Quota reports · unverified':NONE);return;}
    // Without the collector, read Hacker News directly, still only this week.
    const {posts:found,failures,searches}=await loadLimitPosts();
    if(!active)return;
    const selected=found.filter(p=>Date.now()-p.created<WEEK).slice(0,3).map(p=>({source:'Hacker News' as const,url:`https://news.ycombinator.com/item?id=${p.id}`,title:p.title.replace(/^(?:Ask|Tell) HN:\s*/i,''),author:p.author,at:p.created,comments:p.comments,points:p.points}));
    setPosts(selected);
    setState(failures===searches?'Source unavailable.':selected.length?`Quota reports · unverified${failures?' · partial coverage':''}`:failures?'No qualifying reports in available sources.':NONE);
   }catch{if(active){setPosts([]);setState('Source unavailable.');}}finally{busy=false;}
  }
  void load();const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void load();},300000);
  return()=>{active=false;window.clearInterval(timer);};
 },[]);
 return <aside className="internet-brief" aria-label="Recent internet posts">
  <h2 className="brief-title">What folks are saying</h2>
  <p className={`brief-state${posts.length?' sr-only':''}`} role="status">{state}</p>
  <ol className="feed">{posts.map(p=><li key={p.url} className="post">
   <header className="post-head"><span className="avatar" style={{background:hue(p.author)}} aria-hidden="true">{p.author.slice(0,1).toUpperCase()}</span><span className="post-who"><b>{p.author}</b><span>{p.source} · {since(p.at)}</span></span></header>
   <a href={p.url} target="_blank" rel="noopener noreferrer" title={`${p.title}, by ${p.author} on ${p.source} · ${p.comments} comments · ${p.points} ${p.source==='GitHub'?'reactions':'HN points'}`}>{p.title}</a>
   <footer className="brief-meta"><span><ChatCircle size={15} aria-hidden="true"/>{p.comments}<span className="sr-only"> comments</span></span><span><ArrowFatUp size={15} aria-hidden="true"/>{p.points}<span className="sr-only"> {p.source==='GitHub'?'reactions':'points'}</span></span></footer>
  </li>)}</ol>
  <button className="brief-more" onClick={onOpen}>More reports →</button>
 </aside>;
}
