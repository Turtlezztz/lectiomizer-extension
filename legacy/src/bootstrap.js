// Runs before Lectio paints. Release automatically if the main adapter fails.
import {loadSettings} from './settings.js';
const html=document.documentElement;
html.classList.add('lx-preparing');
const release=()=>html.classList.remove('lx-preparing');
const fallback=setTimeout(release,1800);
document.addEventListener('lectiomizer:ready',()=>{clearTimeout(fallback);release();},{once:true});
loadSettings().then(prefs=>{
 html.dataset.lxEnabled=String(prefs.enabled);
 if(!prefs.enabled){clearTimeout(fallback);release();}
});
