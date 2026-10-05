// Local preview behavior. This file never ships with the extension.
// A fake extension API: storage, and for the Chat page a pretend ChatGPT
// sign-in and a scripted "demo model" that really calls the chat tools, so
// the preview reads the fixture pages exactly like the extension would.
// Storage lasts for the browser tab, so the preview remembers chats across pages.
const store=(()=>{try{return JSON.parse(sessionStorage.getItem('lectiomizer-demo-store'))||{};}catch{return {};}})();
const changes=new Set();
const set=values=>{const diff={};for(const [key,value] of Object.entries(values)){diff[key]={oldValue:store[key],newValue:value};if(value===undefined)delete store[key];else store[key]=value;}try{sessionStorage.setItem('lectiomizer-demo-store',JSON.stringify(store));}catch{}for(const listener of changes)listener(diff,'local');};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const account=patch=>set({chatAccount:{...store.chatAccount,...patch}});
const demoModels=[{slug:'demo',name:'Demo-model (ingen AI)'}];


// The demo model picks a page from keywords, then quotes what the tool read.
function plan(question,output){
 if(output!==undefined){
  const text=typeof output==='string'?output:output.filter(p=>p.type==='input_text').map(p=>p.text).join('\n');
  const lines=text.split('\n').filter(Boolean).slice(2,16).join('\n');
  return {say:`*(Demo-model: et rigtigt svar kommer fra ChatGPT.)* Her er, hvad jeg læste i Lectio:\n\n${lines}\n\nSe hele siden: [åbn i Lectio](${text.match(/^Adresse: (.+)$/m)?.[1]||'forside.aspx'})`};
 }
 const q=question.toLowerCase();
 const page=/fravær/.test(q)?'subnav/fravaerelev_fravaersaarsager.aspx':/karakter/.test(q)?'grades/grade_report.aspx':/opgavebeskrivelse/.test(q)?'ElevAflevering.aspx':/opgave|aflever/.test(q)?'OpgaverElev.aspx':/besked/.test(q)?'beskeder2.aspx':/skema|i morgen|i dag|lektion/.test(q)?'forside.aspx':null;
 if(page)return {call:{name:'read_page',arguments:JSON.stringify({url:page})}};
 return {say:'*(Demo-model.)* Spørg fx om **opgaver**, **fravær**, **karakterer** eller **skemaet**, så læser jeg den side i Lectio.\n\n| Spørg om | Side |\n| --- | --- |\n| Opgaver | [Opgaver](OpgaverElev.aspx) |\n| Fravær | [Fravær](subnav/fravaerelev_fravaersaarsager.aspx) |'};
}

// A pretend background script: answers run here and are shown to watching
// Chat pages, and tool calls go to the page's own content script, like the
// extension's background does. Unlike the extension, an answer stops when the
// page is left: this "background" lives in the page.
const contentListeners=new Set();
const watchers=new Set();
const jobs=new Map();
const broadcast=id=>{const job=jobs.get(id);for(const port of watchers)port.deliver({type:'job',id,running:!!job,parts:job?.parts||[],status:job?.status||''});};
const conversations=()=>store.chatConversations||[];
const saveConversation=c=>set({chatConversations:[c,...conversations().filter(x=>x.id!==c.id)]});
async function runTool(call,context){
 for(const fn of contentListeners){const result=fn({type:'chat:tool',call,root:context.root,scheduleHref:context.scheduleHref});if(result!==undefined)return await result;}
 return {output:'Fejl: ingen Lectio-side.',label:'Kunne ikke læse Lectio',ok:false};
}
async function answer(id,question,context){
 const job={parts:[],status:'Tænker…',stopped:false};
 jobs.set(id,job);set({chatActivity:{running:[id],unread:[]}});broadcast(id);
 await wait(500);
 let next=plan(question);
 if(next.call&&!job.stopped){
  job.parts=[{type:'tool',name:next.call.name,label:'Læser side…',status:'running'}];job.status='Læser side…';broadcast(id);
  const result=await runTool(next.call,context);
  job.parts=[{type:'tool',name:next.call.name,label:result.label,href:result.href||null,status:result.ok?'done':'error'}];job.status='Tænker…';broadcast(id);
  await wait(300);
  next=plan(question,result.output);
 }
 const text={type:'text',text:'',phase:'final_answer'};job.parts=[...job.parts,text];job.status='';
 for(const piece of next.say.match(/[\s\S]{1,24}/g)){if(job.stopped)break;await wait(25);text.text+=piece;job.parts=[...job.parts];broadcast(id);}
 jobs.delete(id);
 const latest=conversations().find(c=>c.id===id);
 if(latest)saveConversation({...latest,turns:[...latest.turns,{role:'assistant',parts:job.parts,...(job.stopped?{stopped:true}:{})}],updated:Date.now()});
 set({chatActivity:{running:[],unread:[]}});broadcast(id);
}

async function message(m){
 switch(m?.type){
  case 'chat:connect':account({pending:true,message:''});await wait(900);account({pending:false,connected:true,planEnabled:true,email:'demo.elev@example.com',models:demoModels,modelsAt:Date.now()});return {ok:true,started:true};
  case 'chat:cancel':account({pending:false});return {ok:true};
  case 'chat:disconnect':account({connected:false,planEnabled:false,email:'',models:[]});return {ok:true};
  case 'chat:models':account({models:demoModels,modelsAt:Date.now()});return {ok:true};
  case 'chat:send':{
   const saved=conversations().find(c=>c.id===m.id)||{id:m.id,title:m.title,created:Date.now(),turns:[]};
   saveConversation({...saved,turns:[...saved.turns,{role:'user',text:m.question}],updated:Date.now()});
   answer(m.id,m.question,m.context);return {ok:true};
  }
  case 'chat:retry':{
   const saved=conversations().find(c=>c.id===m.id);if(!saved)return {ok:false};
   const turns=saved.turns.at(-1)?.role==='assistant'?saved.turns.slice(0,-1):saved.turns;
   saveConversation({...saved,turns});answer(m.id,turns.at(-1).text,m.context);return {ok:true};
  }
  case 'chat:stop':{const job=jobs.get(m.id);if(job)job.stopped=true;return {ok:true};}
  default:return {ok:false,message:'Ikke tilgængelig i den lokale demo.'};
 }
}

function connect(){
 const listeners=new Set();
 const port={deliver:m=>setTimeout(()=>{for(const fn of listeners)fn(m);}),onMessage:{addListener:fn=>listeners.add(fn)},onDisconnect:{addListener(){}},postMessage(){},disconnect(){watchers.delete(port);}};
 watchers.add(port);
 for(const id of jobs.keys())broadcast(id);
 return port;
}

window.browser={
 storage:{local:{async get(key){return Object.fromEntries([].concat(key).map(k=>[k,store[k]]));},async set(values){set(values);},async remove(key){set(Object.fromEntries([].concat(key).map(k=>[k,undefined])));}},onChanged:{addListener(fn){changes.add(fn);},removeListener(fn){changes.delete(fn);}}},
 runtime:{sendMessage:message,onMessage:{addListener(fn){contentListeners.add(fn);}},connect},
};
document.getElementById('aspnetForm')?.addEventListener('submit',e=>e.preventDefault());
document.getElementById('demoSave')?.addEventListener('click',()=>{document.getElementById('demoSaveStatus').textContent='Demokladde gemt — ingen data er sendt.';});
document.getElementById('s_m_ChooseTerm_term')?.addEventListener('change',e=>{document.body.dataset.demoYear=e.target.value;});
document.getElementById('s_m_mastersearchbtn')?.addEventListener('click',e=>{e.preventDefault();alert('Lectios søgehandling er bevaret. Denne lokale demo sender ingen søgning.');});

// Lectio's postbacks go to the server; the preview fakes the few the message
// pages use, so a thread can be opened, flagged and answered without a server.
const demoPage=query=>{location.href=location.pathname+'?mappeid=-70'+query;};
document.querySelector('[id$="NewMessageLnk"]')?.addEventListener('click',e=>{e.preventDefault();demoPage('&demo=ny');});
window.__doPostBack=window.__doPostBack||((target='',argument='')=>{
 if(/\$LB2\$_MC_\$_/.test(argument)){demoPage('&demo=traad');return;}
 if(/NewMessageSameReceivers/.test(target)){demoPage('&demo=ny&til=T200001,S300001,S300003');return;}
 if(/ReplyInNewThread/.test(target)){demoPage('&demo=ny&til=T200001');return;}
 if(/BackMessageBtn$/.test(target)){demoPage('');return;}
 // A new message: the recipient list changes in place, like Lectio's answer would.
 const recipients=document.querySelector('[id$="ThreadRecipientsGV"]');
 const renumber=()=>{const rows=Array.from(recipients.rows).slice(1).filter(r=>!r.querySelector('.noRecord'));rows.forEach((r,i)=>r.querySelector('a').setAttribute('onclick',`javascript:__doPostBack('s$m$Content$Content$MessageThreadCtrl$ThreadRecipientsGV','DEL$${i}'); return false;`));if(!rows.length&&!recipients.querySelector('.noRecord'))recipients.insertAdjacentHTML('beforeend','<tr><td colspan="2" class="noRecord">Ingen modtagere...</td></tr>');};
 if(/AddRecipientBtn$/.test(target)){
  const input=document.querySelector('[id$="addRecipientDD_inp"]');const id=document.querySelector('[id$="addRecipientDD_inpid"]');
  setTimeout(()=>{recipients.querySelector('.noRecord')?.closest('tr').remove();recipients.insertAdjacentHTML('beforeend',`<tr><td>${input.value}</td><td><a href="#">Fjern</a></td></tr>`);input.value='';id.value='';renumber();},500);
  return;
 }
 if(/ThreadRecipientsGV$/.test(target)){setTimeout(()=>{Array.from(recipients.rows).slice(1)[+argument.split('$')[1]]?.remove();renumber();},400);return;}
 if(/SendMessageBtn$/.test(target)&&!document.querySelector('.message-thread-message-sender')){setTimeout(()=>demoPage(''),700);return;}
 if(/FlagThread/.test(target)){
  const button=document.querySelector('[id$="FlagThreadHeaderOutsideBtn"]');const icon=button.querySelector('.ls-fonticon').cloneNode(true);
  icon.classList.toggle('md-fill');button.replaceChildren(icon);return;
 }
 if(/SendMessageBtn$/.test(target)){
  const body=document.querySelector('[id$="EditModeContentBBTB_TbxNAME_tb"]');
  const rows=Array.from(document.querySelectorAll('[id$="MessagesGV"] [id="GridRowMessage"]')).filter(r=>r.querySelector('.message-thread-message-sender'));
  const own=rows.filter(r=>r.querySelector('[data-lectiocontextcard="U100004"]')).at(-1)||rows.at(-1);
  const row=own.closest('tr').cloneNode(true);const now=new Date();const pad=n=>String(n).padStart(2,'0');
  row.querySelector('.message-thread-message-sender').innerHTML=`<span data-lectioContextCard='U100004'>Demo Elev (3a 07)</span>, ${pad(now.getDate())}-${pad(now.getMonth()+1)}-${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  row.querySelector('.message-thread-message-header').textContent=document.querySelector('[id$="EditModeHeaderTitleTB_tb"]').value;
  const content=row.querySelector('.message-thread-message-content');content.replaceChildren();
  body.value.split('\n').forEach((line,i)=>{if(i)content.append(document.createElement('br'));content.append(line);});
  // Lectio answers after a moment; the demo appends the message like its reply would.
  setTimeout(()=>{body.value='';body.closest('tr').before(row);},700);
  return;
 }
 console.info('Lectiomizer-demo: postback ikke tilgængelig i demoen',target,argument);
});
