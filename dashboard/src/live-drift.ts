import {useEffect,useRef,useState} from 'react';
// Live motion for the ILLUSTRATIVE capacity bars (display-config.ts). Never used for telemetry values.
// The value takes a small random step inside [min,max] every few seconds so the bar feels live.
export type Drift={value:number;delta:number;at:number;history:number[]};
const clamp=(n:number,min:number,max:number)=>Math.min(max,Math.max(min,n));
/** One random-walk step: 1-3 points, biased back toward the middle of the band. Pure, for tests. */
export function driftStep(value:number,min:number,max:number,rand:()=>number=Math.random):number{
 const mid=(min+max)/2,size=1+Math.floor(rand()*3);
 const towardMid=value>mid?-1:1,pull=Math.abs(value-mid)/((max-min)/2||1);
 const dir=rand()<0.5+pull*0.3?towardMid:-towardMid;
 let next=clamp(value+dir*size,min,max);
 if(next===value)next=clamp(value-dir*size,min,max);
 return next;
}
export function useDrift(base:number,{enabled,min=80,max=90,everyMs=[2200,4200] as [number,number],keep=32}:{enabled:boolean;min?:number;max?:number;everyMs?:[number,number];keep?:number}):Drift{
 const start=clamp(Math.round(base),min,max);
 const [state,setState]=useState<Drift>(()=>({value:enabled?start:base,delta:0,at:Date.now(),history:[enabled?start:base]}));
 const timer=useRef(0);
 useEffect(()=>{
  if(!enabled){setState({value:base,delta:0,at:Date.now(),history:[base]});return;}
  let active=true;
  const schedule=()=>{const [lo,hi]=everyMs;timer.current=window.setTimeout(step,lo+Math.random()*(hi-lo));};
  const step=()=>{
   if(!active)return;
   if(document.visibilityState==='visible')setState(s=>{const next=driftStep(s.value,min,max);return {value:next,delta:next-s.value,at:Date.now(),history:[...s.history,next].slice(-keep)};});
   schedule();
  };
  // Seed a short history so the sparkline has shape on first paint.
  setState(()=>{let v=start;const h=[v];for(let i=0;i<keep-1;i++){v=driftStep(v,min,max);h.push(v);}return {value:v,delta:0,at:Date.now(),history:h};});
  schedule();
  return()=>{active=false;window.clearTimeout(timer.current);};
 },[enabled,base,min,max,everyMs[0],everyMs[1],keep]);
 return state;
}
/** SVG path for a sparkline of `values` inside a w x h box, scaled to [min,max]. */
export function sparkPath(values:number[],w:number,h:number,min:number,max:number):string{
 if(values.length<2)return '';
 const span=max-min||1;
 return values.map((v,i)=>`${i?'L':'M'}${(i/(values.length-1)*w).toFixed(1)},${(h-((v-min)/span)*(h-2)-1).toFixed(1)}`).join(' ');
}
