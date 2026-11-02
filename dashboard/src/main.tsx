import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {X} from '@phosphor-icons/react';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import './style.css';
import {InternetWatch} from './InternetWatch';
import {QuotaBoard} from './QuotaBoard';
import {InternetBrief} from './InternetBrief';
function News({onClose}:{onClose:()=>void}){const ref=useRef<HTMLDialogElement>(null);useEffect(()=>{const previous=document.activeElement as HTMLElement;ref.current?.showModal();return()=>previous?.focus();},[]);return <dialog className="news-dialog" ref={ref} onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}} aria-labelledby="news-title"><div className="modal-head"><h2 id="news-title">Internet signal</h2><button className="icon-button" aria-label="Close internet signal" onClick={onClose}><X size={19}/></button></div><div className="modal-body"><InternetWatch/></div></dialog>;}
function App(){
 const [news,setNews]=useState(false);
 useEffect(()=>{
  const preference=window.matchMedia('(prefers-color-scheme: dark)');
  const applyTheme=()=>{document.documentElement.dataset.theme=preference.matches?'dark':'light';};
  applyTheme();preference.addEventListener('change',applyTheme);
  return()=>preference.removeEventListener('change',applyTheme);
 },[]);
 return <><main className="sketch-layout minimal-layout"><QuotaBoard/><InternetBrief onOpen={()=>setNews(true)}/></main>{news&&<News onClose={()=>setNews(false)}/>}</>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
