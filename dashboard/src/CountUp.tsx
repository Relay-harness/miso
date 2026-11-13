import {useEffect,useRef,useState} from 'react';
const reduced=()=>typeof window!=='undefined'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Counts to `value` from what is on screen. A later increase is highlighted briefly. Shows the exact value at rest. */
export function CountUp({value,ms=900,format=(n:number)=>n.toLocaleString(),className=''}:{value:number;ms?:number;format?:(n:number)=>string;className?:string}){
 const [shown,setShown]=useState(reduced()?value:0);const [bump,setBump]=useState(false);
 const from=useRef(shown),prev=useRef<number|null>(null);
 useEffect(()=>{
  const before=prev.current;prev.current=value;let timer=0,frame=0;
  if(before!==null&&before>0&&value>before){setBump(true);timer=window.setTimeout(()=>setBump(false),1800);}
  if(reduced()){from.current=value;setShown(value);return()=>window.clearTimeout(timer);}
  const start=performance.now(),a=from.current;
  const step=(t:number)=>{const p=Math.min(1,(t-start)/ms),v=a+(value-a)*(1-Math.pow(1-p,3));from.current=v;setShown(v);if(p<1)frame=requestAnimationFrame(step);};
  frame=requestAnimationFrame(step);
  return()=>{cancelAnimationFrame(frame);window.clearTimeout(timer);};
 },[value,ms]);
 return <span className={`count-up ${bump?'is-bumped':''} ${className}`}>{format(Math.round(shown))}</span>;
}
