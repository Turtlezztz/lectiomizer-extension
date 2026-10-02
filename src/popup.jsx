import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BookOpen,ArrowUpRight} from 'lucide-react';
import {DEFAULTS,loadSettings,saveSettings} from './settings.js';
function Popup(){
 const [prefs,setPrefs]=useState(DEFAULTS);const [ready,setReady]=useState(false);const [error,setError]=useState('');
 useEffect(()=>{loadSettings().then(p=>{setPrefs(p);setReady(true);});},[]);
 const update=async patch=>{const old=prefs;setPrefs(p=>({...p,...patch}));try{await saveSettings(patch);setError('');}catch{setPrefs(old);setError('Indstillingen kunne ikke gemmes. Prøv igen.');}};
 return <main><header><BookOpen size={22}/><h1>lectiomizer<span>.</span></h1><span className="version">0.5.0</span></header><p className="intro">En roligere hverdag i Lectio.</p><label className="setting"><span><strong>Nyt design</strong><small>Sidebar og Compact-designsystem</small></span><input type="checkbox" role="switch" checked={prefs.enabled} disabled={!ready} onChange={e=>update({enabled:e.target.checked})}/></label><label className="setting"><span><strong>Afstand</strong><small>Vælg hvor tæt indholdet står</small></span><select value={prefs.density} disabled={!ready} onChange={e=>update({density:e.target.value})}><option value="compact">Kompakt</option><option value="comfortable">Luftig</option></select></label><label className="setting"><span><strong>Lille sidepanel</strong><small>Vis kun ikoner på større skærme</small></span><input type="checkbox" role="switch" checked={prefs.collapsed} disabled={!ready} onChange={e=>update({collapsed:e.target.checked})}/></label><p role="status" className="error">{error}</p><a className="open" href="https://www.lectio.dk/" target="_blank" rel="noreferrer">Åbn Lectio <ArrowUpRight size={17}/></a><footer>Kun på lectio.dk. Ingen analyse eller dataindsamling.<br/>Skolens indhold og handlinger kommer fra Lectio.</footer></main>;
}
createRoot(document.getElementById('popup-root')).render(<Popup/>);
