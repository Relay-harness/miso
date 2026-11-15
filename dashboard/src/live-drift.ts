import {useEffect,useState} from 'react';
// Hourly motion for the ILLUSTRATIVE capacity bars (display-config.ts). Never used for telemetry values.
// The value is a pure function of the clock hour, so every visitor sees the same figure and it changes once an hour.
export const HOUR=3600000;
export type Hourly={value:number;delta:number;at:number;history:number[]};
const SEEDS={claude:[0.7,2.3,5.1],codex:[1.9,4.4,0.6]} as const;
/** The figure for one provider in one clock hour (hours since the epoch). Smooth: neighbouring hours differ by a few points. */
export function hourlyValue(provider:'claude'|'codex',hour:number,min=80,max=90):number{
 const [a,b,c]=SEEDS[provider],mid=(min+max)/2,amp=(max-min)/2;
 const wave=0.55*Math.sin(2*Math.PI*hour/26+a)+0.3*Math.sin(2*Math.PI*hour/9.5+b)+0.15*Math.sin(2*Math.PI*hour/4.2+c);
 return Math.min(max,Math.max(min,Math.round(mid+amp*wave)));
}
/** Current hour's figure, the change from the previous hour, when this hour started, and the last `keep` hours. */
export function hourlyAt(provider:'claude'|'codex',now:number,{min=80,max=90,keep=24}={}):Hourly{
 const hour=Math.floor(now/HOUR);
 const history=Array.from({length:keep},(_,i)=>hourlyValue(provider,hour-keep+1+i,min,max));
 const value=history[history.length-1];
 return {value,delta:value-hourlyValue(provider,hour-1,min,max),at:hour*HOUR,history};
}
/** Re-reads at the top of every hour while the page is open. */
export function useHourly(provider:'claude'|'codex',{enabled,min=80,max=90}:{enabled:boolean;min?:number;max?:number}):Hourly|null{
 const [state,setState]=useState<Hourly|null>(()=>enabled?hourlyAt(provider,Date.now(),{min,max}):null);
 useEffect(()=>{
  if(!enabled){setState(null);return;}
  let timer=0;
  const read=()=>{setState(hourlyAt(provider,Date.now(),{min,max}));timer=window.setTimeout(read,HOUR-Date.now()%HOUR+500);};
  read();
  const onVisible=()=>{if(document.visibilityState==='visible')setState(s=>{const n=hourlyAt(provider,Date.now(),{min,max});return s&&s.at===n.at?s:n;});};
  document.addEventListener('visibilitychange',onVisible);
  return()=>{window.clearTimeout(timer);document.removeEventListener('visibilitychange',onVisible);};
 },[enabled,provider,min,max]);
 return state;
}
/** SVG path for a sparkline of `values` inside a w x h box, scaled to [min,max]. */
export function sparkPath(values:number[],w:number,h:number,min:number,max:number):string{
 if(values.length<2)return '';
 const span=max-min||1;
 return values.map((v,i)=>`${i?'L':'M'}${(i/(values.length-1)*w).toFixed(1)},${(h-((v-min)/span)*(h-2)-1).toFixed(1)}`).join(' ');
}
