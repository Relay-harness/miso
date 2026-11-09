// What the collector found by reading public posts (server/limit-signal.mjs). What posts say, not a measurement.
export type Provider='claude'|'codex';
export type ProviderSignal={posts:number;stated:number;percent:number;sources:string[]};
export type SignalResponse={schema:1;generatedAt:number;minStated:number;providers:Record<Provider,ProviderSignal|null>};
const count=(n:unknown)=>Number.isSafeInteger(n)&&(n as number)>=0;
const valid=(v:unknown)=>{
 if(v===null)return true;
 const p=v as ProviderSignal;
 return !!p&&count(p.posts)&&count(p.stated)&&p.stated<=p.posts&&Number.isInteger(p.percent)&&p.percent%10===0&&p.percent>=-100&&p.percent<=1000&&Array.isArray(p.sources)&&p.sources.length>0&&p.sources.every(s=>s==='GitHub'||s==='Hacker News');
};
export function isSignalResponse(value:unknown):value is SignalResponse {
 const v=value as SignalResponse;
 return !!v&&typeof v==='object'&&v.schema===1&&Number.isFinite(v.generatedAt)&&!!v.providers&&valid(v.providers.claude)&&valid(v.providers.codex);
}
export type LatestReport={source:'GitHub'|'Hacker News';url:string;title:string;author:string;at:number;comments:number;points:number};
const REPORT_URL=/^https:\/\/(?:github\.com\/(?:anthropics\/claude-code|openai\/codex)\/issues\/\d+|news\.ycombinator\.com\/item\?id=\d+)$/;
const WEEK=7*86400000;
/** The newest reports the collector found this week, newest first. Null means this response carries no list at all. */
export function latestReports(value:unknown,now=Date.now()):LatestReport[]|null {
 const list=(value as {latest?:unknown})?.latest;
 if(!Array.isArray(list))return null;
 return (list as LatestReport[]).filter(r=>!!r&&(r.source==='GitHub'||r.source==='Hacker News')&&typeof r.url==='string'&&REPORT_URL.test(r.url)&&typeof r.title==='string'&&r.title.length>0&&typeof r.author==='string'&&r.author.length>0&&Number.isFinite(r.at)&&now-r.at<WEEK&&r.at<=now+60000&&count(r.comments)&&count(r.points)).sort((a,b)=>b.at-a.at);
}
/** The bar is full at normal or above, and a cut empties it by that share. */
export function signalGauge(label:string,s:ProviderSignal):{figure:string;filled:number;tone:'decreased'|'increased'|'neutral';headline:string;who:string} {
 const who=`${s.posts.toLocaleString()} ${s.posts===1?'post':'posts'} checked this week`;
 if(s.percent<0)return {figure:`−${-s.percent}%`,filled:Math.round((100+s.percent)/2.5),tone:'decreased',headline:`${label} limit decreased by ${-s.percent}%`,who};
 if(s.percent>0)return {figure:`+${s.percent}%`,filled:40,tone:'increased',headline:`${label} limit increased by ${s.percent}%`,who};
 return {figure:'Normal',filled:40,tone:'neutral',headline:`${label} limit is normal`,who};
}
