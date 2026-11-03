import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {X,GithubLogo} from '@phosphor-icons/react';
import '@fontsource/geist-sans/latin-400.css';
import '@fontsource/geist-sans/latin-500.css';
import '@fontsource/geist-sans/latin-600.css';
import '@fontsource/geist-sans/latin-700.css';
import '@fontsource/geist-mono/latin-400.css';
import '@fontsource/geist-mono/latin-500.css';
import './style.css';
import {InternetWatch} from './InternetWatch';
import {QuotaBoard} from './QuotaBoard';
import {InternetBrief} from './InternetBrief';
function News({onClose}:{onClose:()=>void}){const ref=useRef<HTMLDialogElement>(null);useEffect(()=>{const previous=document.activeElement as HTMLElement;ref.current?.showModal();return()=>previous?.focus();},[]);return <dialog className="news-dialog" ref={ref} onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}} aria-labelledby="news-title"><div className="modal-head"><h2 id="news-title">Internet signal</h2><button className="icon-button" aria-label="Close internet signal" onClick={onClose}><X size={19}/></button></div><div className="modal-body"><InternetWatch/></div></dialog>;}
function App(){
 const [news,setNews]=useState(false);
 useEffect(()=>{document.documentElement.dataset.theme='dark';},[]);
 return <><nav className="top-nav" aria-label="Site"><a className="wordmark" href="/" aria-label="throttleindex home"><span className="logo-mark" aria-hidden="true"><i/><i/><i/><i/><i/></span>throttleindex</a><div className="nav-actions"><a className="star-button" aria-label="Star on GitHub" href="https://github.com/Relay-harness/miso" target="_blank" rel="noopener noreferrer"><GithubLogo size={16} aria-hidden="true"/><span className="star-text">Star on GitHub</span></a></div></nav><main className="sketch-layout minimal-layout"><QuotaBoard/><InternetBrief onOpen={()=>setNews(true)}/></main>{news&&<News onClose={()=>setNews(false)}/>}</>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
