// Real GitHub stargazers for the live hero: the newest few people and how many starred in the last 7 days.
// Cached (10 minutes) so the browser never talks to the GitHub API. Nothing here is estimated: when GitHub
// cannot answer, the fields are null or empty and the page shows nothing for them.
const REPO='https://api.github.com/repos/Relay-harness/miso';
const AVATAR=/^https:\/\/avatars\.githubusercontent\.com\//;
const LOGIN=/^[A-Za-z0-9-]{1,39}$/;
const DAY=86400000;
export const EMPTY={schema:1,total:null,weekCount:null,recent:[],source:'github-stargazers'};
export function createStargazers({fetchFn=fetch,clock=()=>Date.now(),ttl=600000,maxPages=3,token=process.env.GITHUB_TOKEN||''}={}){
 let cache={value:EMPTY,at:-Infinity};
 const headers=accept=>({'Accept':accept,'User-Agent':'throttleindex',...(token?{Authorization:`Bearer ${token}`}:{})});
 const getJson=async(url,accept)=>{const r=await fetchFn(url,{headers:headers(accept),signal:AbortSignal.timeout(5000)});if(!r.ok)throw new Error('github '+r.status);return r.json();};
 async function load(){
  const repo=await getJson(REPO,'application/vnd.github+json');
  const total=repo.stargazers_count;if(!Number.isSafeInteger(total)||total<0)throw new Error('no count');
  const last=Math.max(1,Math.ceil(total/100));const now=clock();const cutoff=now-7*DAY;
  let items=[],complete=false;
  // Pages are oldest first, so walk back from the last page until we pass the 7-day line.
  // GitHub requires a token for the stargazer list. Without one, keep the real total and leave the list empty.
  try{
   for(let page=last,n=0;page>=1&&n<maxPages;page--,n++){
    const list=await getJson(`${REPO}/stargazers?per_page=100&page=${page}`,'application/vnd.github.star+json');
    if(!Array.isArray(list))throw new Error('bad list');
    items=[...list,...items];
    const first=Date.parse(items[0]?.starred_at);
    if(page===1||first<cutoff){complete=true;break;}
   }
  }catch{if(!items.length)return {schema:1,total,weekCount:null,recent:[],source:'github-stargazers'};complete=false;}
  const stars=items.map(x=>({login:x?.user?.login,avatar:x?.user?.avatar_url,at:Date.parse(x?.starred_at)})).filter(s=>LOGIN.test(s.login??'')&&AVATAR.test(s.avatar??'')&&Number.isFinite(s.at)&&s.at<=now+60000);
  const weekCount=complete?items.filter(x=>Date.parse(x.starred_at)>=cutoff).length:null;
  const recent=stars.slice(-8).reverse().map(s=>({login:s.login,avatar:s.avatar,starredAt:s.at}));
  return {schema:1,total,weekCount,recent,source:'github-stargazers'};
 }
 return {async get(){
  if(clock()-cache.at<ttl)return cache.value;
  cache={value:cache.value,at:clock()};
  try{cache={value:await load(),at:clock()};}catch{}
  return cache.value;
 }};
}
