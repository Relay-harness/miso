// Limit reports filed by visitors, summarized by the collector (server/limit-votes.mjs). What people say, not a measurement.
export type Provider='claude'|'codex';
export type ProviderVotes={reports:number;percent:number};
export type VoteSummary={schema:1;generatedAt:number;windowDays:7;minReports:number;providers:Record<Provider,ProviderVotes>};
export const VOTE_BUTTONS:{percent:number;label:string}[]=[{percent:-30,label:'−30%'},{percent:-20,label:'−20%'},{percent:-10,label:'−10%'},{percent:0,label:'Normal'},{percent:10,label:'Increased'}];
const valid=(v:unknown)=>{const p=v as ProviderVotes;return !!p&&Number.isSafeInteger(p.reports)&&p.reports>=0&&Number.isInteger(p.percent)&&p.percent>=-30&&p.percent<=10&&p.percent%10===0;};
export function isVoteSummary(value:unknown):value is VoteSummary {
 const v=value as VoteSummary;
 return !!v&&typeof v==='object'&&v.schema===1&&Number.isFinite(v.generatedAt)&&v.windowDays===7&&Number.isInteger(v.minReports)&&!!v.providers&&valid(v.providers.claude)&&valid(v.providers.codex);
}
/** The bar is full at normal, and a cut empties it by that share. */
export function voteGauge(label:string,v:ProviderVotes):{figure:string;filled:number;tone:'decreased'|'increased'|'neutral';headline:string;who:string} {
 const who=`${v.reports.toLocaleString()} ${v.reports===1?'person':'people'} reported this week`;
 if(v.percent<0)return {figure:`−${-v.percent}%`,filled:Math.round((100+v.percent)/2.5),tone:'decreased',headline:`${label} limit decreased by ${-v.percent}%`,who};
 if(v.percent>0)return {figure:'Increased',filled:40,tone:'increased',headline:`${label} limit increased`,who};
 return {figure:'Normal',filled:40,tone:'neutral',headline:`${label} limit is normal`,who};
}
