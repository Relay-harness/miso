// Real-data helpers for the live hero. Nothing here invents a number: it only validates and formats what the API returned.
export type Star={login:string;avatar:string;starredAt:number};
export type Stargazers={schema:1;total:number|null;weekCount:number|null;recent:Star[];source:string};
const count=(n:unknown)=>Number.isSafeInteger(n)&&(n as number)>=0;
export function isStargazers(v:unknown):v is Stargazers{
 if(!v||typeof v!=='object')return false;const s=v as Stargazers;
 if(s.schema!==1||!(s.total===null||count(s.total))||!(s.weekCount===null||count(s.weekCount))||!Array.isArray(s.recent))return false;
 return s.recent.every(x=>!!x&&/^[A-Za-z0-9-]{1,39}$/.test(x.login)&&typeof x.avatar==='string'&&x.avatar.startsWith('https://avatars.githubusercontent.com/')&&Number.isFinite(x.starredAt));
}
/** "3h ago" for a real star time. */
export function starAgo(at:number,now:number){const m=Math.max(0,Math.floor((now-at)/60000));return m<1?'just now':m<60?`${m}m ago`:m<1440?`${Math.floor(m/60)}h ago`:`${Math.floor(m/1440)}d ago`;}
/** "12s ago" from the time of the last successful fetch. */
export function updatedAgo(at:number,now:number){const s=Math.max(0,Math.floor((now-at)/1000));return s<5?'just now':s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:`${Math.floor(s/3600)}h ago`;}
/** The avatar at a small size. */
export function smallAvatar(url:string){const u=new URL(url);u.searchParams.set('s','64');return u.toString();}
