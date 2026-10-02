// Local preview behavior. This file never ships with the extension.
let currentPreferences={};
const changes=new Set();
window.browser={storage:{local:{async get(){return{preferences:currentPreferences};},async set({preferences}){const oldValue=currentPreferences;currentPreferences=preferences;for(const listener of changes)listener({preferences:{oldValue,newValue:preferences}},'local');}},onChanged:{addListener(fn){changes.add(fn);},removeListener(fn){changes.delete(fn);}}}};
document.getElementById('aspnetForm')?.addEventListener('submit',e=>e.preventDefault());
document.getElementById('demoSave')?.addEventListener('click',()=>{document.getElementById('demoSaveStatus').textContent='Demokladde gemt — ingen data er sendt.';});
document.getElementById('s_m_ChooseTerm_term')?.addEventListener('change',e=>{document.body.dataset.demoYear=e.target.value;});
document.getElementById('s_m_mastersearchbtn')?.addEventListener('click',e=>{e.preventDefault();alert('Lectios søgehandling er bevaret. Denne lokale demo sender ingen søgning.');});
