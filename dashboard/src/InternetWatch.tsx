import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowUpRight, ArrowClockwise, ChatCircle} from '@phosphor-icons/react';
import {LIMIT_SEARCHES,limitSearchURL,parseLimitPost,rankLimitPosts} from './limit-posts';
import type {LimitPost as Post} from './limit-posts';
const names=['Claude','OpenAI','Gemini'];
const official=[{name:'Claude',label:'Plans & pricing',url:'https://www.anthropic.com/pricing',news:'https://www.anthropic.com/news'},{name:'OpenAI',label:'ChatGPT plans',url:'https://openai.com/chatgpt/pricing/',news:'https://openai.com/news/'},{name:'Gemini',label:'Google AI plans',url:'https://one.google.com/about/google-ai-plans/',news:'https://blog.google/products/gemini/'}];
function dateLabel(time:number){return new Date(time).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});}
export function InternetWatch(){
 const [posts,setPosts]=useState<Post[]>([]);
 const [filter,setFilter]=useState('All providers');
 const [topic,setTopic]=useState('All reports');
 const [loading,setLoading]=useState(true);
 const [failed,setFailed]=useState<string[]>([]);
 const [updated,setUpdated]=useState<number|null>(null);
 const [visibleCount,setVisibleCount]=useState(12);
 useEffect(()=>setVisibleCount(12),[filter,topic]);
 const [attempt,setAttempt]=useState(0);
 const busy=useRef(false);
 const request=useRef<AbortController|null>(null);
 const load=useCallback(async()=>{
  if(busy.current)return;busy.current=true;setLoading(true);
  const controller=new AbortController();request.current=controller;
  const timer=window.setTimeout(()=>controller.abort(),12000);
  try{
   const partialProviders=new Set<string>();
   const results=await Promise.allSettled(names.map(async (provider):Promise<Post[]>=>{
    const batches=await Promise.allSettled(LIMIT_SEARCHES.filter(s=>s.provider===provider).map(async search=>{
     const response=await fetch(limitSearchURL(search.query),{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
     if(!response.ok)throw new Error('Source unavailable');
     const body=await response.json();if(!Array.isArray(body.hits))throw new Error('Invalid source response');
     return body.hits.map((hit:unknown)=>parseLimitPost(hit)).filter((p:Post|null):p is Post=>p!==null);
    }));
    if(batches.some(b=>b.status==='rejected'))partialProviders.add(provider);
    if(batches.every(b=>b.status==='rejected'))throw new Error('Source unavailable');
    return rankLimitPosts(batches.flatMap(b=>b.status==='fulfilled'?b.value:[]));
   }));
   if(controller.signal.aborted)return;
   const merged=new Map<string,Post>();results.forEach(result=>{if(result.status==='fulfilled')result.value.forEach(post=>{const previous=merged.get(post.id);if(previous)previous.providers=[...new Set([...previous.providers,...post.providers])];else merged.set(post.id,post);});});
   const broken=names.filter((provider,i)=>results[i].status==='rejected'||partialProviders.has(provider));setFailed(broken);
   if(results.some(result=>result.status==='fulfilled')){setPosts(rankLimitPosts([...merged.values()]).slice(0,90));setUpdated(Date.now());}
  }finally{window.clearTimeout(timer);if(request.current===controller){busy.current=false;setLoading(false);if(controller.signal.aborted)setFailed(names);}}
 },[]);
 useEffect(()=>{void load();const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void load();},300000);return()=>{window.clearInterval(timer);request.current?.abort();busy.current=false;};},[load,attempt]);
 const filtered=rankLimitPosts(posts).filter(p=>(filter==='All providers'||p.providers.includes(filter))&&(topic==='All reports'||p.category!=='limit_hit'));
 const query=filter==='All providers'?'Claude OR OpenAI OR Gemini':filter;
 return <section id="internet-watch" aria-labelledby="feed-heading">
 <div className="feed-toolbar"><div className="provider-tabs" aria-label="Filter by provider">{['All providers',...names].map(p=><button key={p} aria-pressed={filter===p} onClick={()=>setFilter(p)}>{p==='All providers'?'All AI':p}</button>)}</div><div className="feed-tools"><label className="topic-toggle"><input type="checkbox" checked={topic!=='All reports'} onChange={e=>setTopic(e.target.checked?'Allowance changes':'All reports')}/><span>Allowance changes only</span></label><button className="icon-button" disabled={loading} onClick={()=>setAttempt(n=>n+1)} aria-label="Refresh stories"><ArrowClockwise size={18}/></button></div></div>
 <div className="editorial-layout"><div className="story-column"><div className="feed-section-label"><h2 id="feed-heading">Quota & session-limit reports</h2><span>{loading?'Checking…':updated?`Fetched ${new Date(updated).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`:'Source unavailable'}</span></div><p className="source-disclosure">Specific limit hits, allowance comparisons and reset-window reports from Hacker News. Author claims, not verified provider changes.</p>
 <div className="feed-status" role="status">{failed.length?`Source coverage incomplete for ${failed.join(', ')}.${updated?' Showing available reports; some may be from the last successful batch.':' Try refreshing.'}`:loading&&!posts.length?'Loading recent conversations…':''}</div>
 {loading&&!posts.length?<div className="post-skeleton" aria-label="Loading stories"><i/><i/><i/></div>:!filtered.length?<div className="feed-empty"><h3>{failed.length===names.length?'We couldn’t reach the source.':'No posts match this filter.'}</h3><p>{failed.length===names.length?'Refresh to try again. We won’t fill the gap with made-up stories.':'Only specific subscription-limit reports qualify. Try All AI or turn off the changes-only filter. Generic AI posts stay excluded.'}</p></div>:<ol className="stories">{filtered.slice(0,visibleCount).map((p,i)=><li key={p.id} className={i===0?'lead-story':''}><article><div className="story-provider">{p.providers.join(' / ')}<time dateTime={new Date(p.created).toISOString()}>{dateLabel(p.created)}</time></div><h3><a href={`https://news.ycombinator.com/item?id=${p.id}`} target="_blank" rel="noopener noreferrer">{p.title}<ArrowUpRight size={i===0?24:17}/></a></h3><p className="report-reason">{p.reason} · unverified</p><div className="story-meta"><span>by {p.author}</span><a href={`https://news.ycombinator.com/item?id=${p.id}`} target="_blank" rel="noopener noreferrer"><ChatCircle size={13}/>{p.comments} comments</a><span>{p.points} HN points</span></div></article></li>)}</ol>}
 {filtered.length>visibleCount&&<button className="more-stories" onClick={()=>setVisibleCount(n=>n+12)}>More conversations <span>+{Math.min(12,filtered.length-visibleCount)}</span></button>}
 </div><aside className="reading-sidebar"><section><span className="sidebar-label">Before you subscribe</span><h2>Check your plan.</h2><p>Go straight to the provider for current prices and allowances.</p><div className="plan-links">{official.map(p=><a href={p.url} target="_blank" rel="noopener noreferrer" key={p.name}><span>{p.name}</span><ArrowUpRight size={16}/></a>)}</div></section><section className="elsewhere"><h2>Hear more voices.</h2><p>Open the latest searches. These aren’t collected in this feed.</p><a href={`https://www.reddit.com/search/?q=${encodeURIComponent(query+' limits credits')}&sort=new`} target="_blank" rel="noopener noreferrer">Reddit <ArrowUpRight size={15}/></a><a href={`https://x.com/search?q=${encodeURIComponent('('+query+') (limits OR credits OR pricing)')}&f=live`} target="_blank" rel="noopener noreferrer">X / Twitter <ArrowUpRight size={15}/></a></section><div className="house-note"><span className="tiny-cat" aria-hidden="true">/ᐠ. .ᐟ\</span><p>Different plans.<br/>Same side of the screen.</p></div></aside></div>
 <details className="source-receipt"><summary>Sources & coverage</summary><p>Targeted limit and quota searches return up to 60 Hacker News stories per query from the last 90 days. Titles and available story text must describe specific subscription-limit hits, allowance changes, comparisons or reset windows. Generic complaints, pricing-only stories, API throttling and product launches are excluded. Reports are deduplicated and ranked by detail, discussion support and recency, not just newest first. Engagement is not proof. Refreshes every 5 minutes while visible. These are selected author claims, not verified cuts or a representative sample; they never populate the allowance bars.</p><p>Your browser contacts hn.algolia.com, which receives your IP address and the search terms. Local reports are never sent. Reddit and X are search links only. No provider telemetry or global member count is connected.</p></details>
 </section>;
}
