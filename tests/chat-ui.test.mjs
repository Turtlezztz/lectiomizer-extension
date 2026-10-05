// The Chat page in the built content script (JSDOM) with the real background
// job runner (src/chat/jobs.js), joined by a fake extension API: one storage,
// runtime messages and ports between them, and tabs.sendMessage into the page.
// OpenAI is a scripted stream; Lectio pages come from the fixtures.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import {fixture} from '../demo/fixtures.mjs';
import {assignmentsPage} from '../demo/views-fixtures.mjs';

const delay=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(check,ms=3000)=>{for(let t=0;t<ms;t+=10){if(check())return;await delay(10);}throw new Error('timed out');};
const root='https://www.lectio.dk/lectio/123/';

// One extension: storage shared by both sides, and the tab the content script runs in.
const hub={store:{},session:{},changes:new Set(),tab:{id:1,url:'',listeners:new Set()}};
function area(store,notify){
 return {
  get:async key=>Object.fromEntries([].concat(key).map(k=>[k,structuredClone(store[k])])),
  set:async values=>{const diff={};for(const [k,v] of Object.entries(values)){diff[k]={oldValue:store[k],newValue:structuredClone(v)};store[k]=structuredClone(v);}if(notify)for(const fn of hub.changes)fn(structuredClone(diff),'local');},
  remove:async key=>{const diff={};for(const k of [].concat(key)){diff[k]={oldValue:store[k],newValue:undefined};delete store[k];}if(notify)for(const fn of hub.changes)fn(diff,'local');},
 };
}
const storage={local:area(hub.store,true),session:area(hub.session,false),onChanged:{addListener:fn=>hub.changes.add(fn),removeListener:fn=>hub.changes.delete(fn)}};

globalThis.browser={
 storage,
 permissions:{contains:async()=>true},
 runtime:{getPlatformInfo:async()=>({})},
 tabs:{
  query:async()=>hub.tab.url?[{id:hub.tab.id,url:hub.tab.url,active:true}]:[],
  sendMessage:async(tabId,message)=>{for(const fn of hub.tab.listeners){const result=fn(structuredClone(message),{id:'lx'});if(result!==undefined)return structuredClone(await result);}throw new Error('No content script');},
 },
};
// settings.js reads the browser global when it loads.
const {send,retryAnswer,stop,watch}=await import('../src/chat/jobs.js');
const {retry}=await import('../src/chat/session.js');
retry.delays=[0,0,0];

// Scripted OpenAI: each request takes the next round (events, or a function
// that streams them itself).
const rounds=[];const bodies=[];
const sse=events=>events.map(e=>`data: ${JSON.stringify(e)}\n\n`).join('');
globalThis.fetch=async(url,init)=>{
 if(url!=='https://api.openai.com/v1/responses')return new Response('{}',{status:404});
 bodies.push(JSON.parse(init.body));
 const round=rounds.shift();
 return new Response(typeof round==='function'?round():sse(round),{status:200,headers:{'content-type':'text/event-stream'}});
};
const answer=(id,text)=>[{type:'response.output_item.added',item:{type:'message',id,phase:'final_answer'}},{type:'response.output_text.delta',item_id:id,delta:text},{type:'response.output_item.done',item:{type:'message',id,role:'assistant',phase:'final_answer',content:[{type:'output_text',text}]}},{type:'response.completed',response:{}}];
// A stream that sends `first`, then waits for open() before sending `rest`.
function gated(first,rest){
 let open;const gate=new Promise(r=>{open=r;});
 const round=()=>new ReadableStream({async start(c){const enc=new TextEncoder();c.enqueue(enc.encode(sse(first)));await gate;c.enqueue(enc.encode(sse(rest)));c.close();}});
 return {round,open};
}

// The chat cases of background.js's message switch.
function route(message,sender){
 switch(message?.type){
  case 'chat:send':return send(message,sender);
  case 'chat:retry':return retryAnswer(message,sender);
  case 'chat:stop':return stop(message);
  default:return Promise.resolve({ok:true});
 }
}

const opened=new Set();
after(()=>{for(const dom of opened)dom.window.close();});
const signedIn=()=>({chatAccount:{connected:true,planEnabled:true,email:'elev@example.com',models:[{slug:'gpt-test',name:'GPT Test'}],modelsAt:Date.now(),model:'',effort:'',welcomed:true}});
function reset(store={}){
 for(const k of Object.keys(hub.store))delete hub.store[k];
 Object.assign(hub.store,structuredClone(store));
 hub.session.chatgptAccess={token:'t',expiresAt:Date.now()+3600000};
 rounds.length=0;bodies.length=0;
}

// Loads a Lectio page in the tab, replacing the one before, as navigating does.
// sessionStorage belongs to the tab and carries over, unless `newTab`.
async function visit(path,{newTab=false}={}){
 let tabSession={};
 for(const dom of opened){if(!newTab)tabSession={...dom.window.sessionStorage};dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close();opened.delete(dom);}
 hub.changes.clear();hub.tab.listeners.clear();
 const dom=new JSDOM(fixture(path.split('#')[0],false),{url:'https://www.lectio.dk'+path,runScripts:'outside-only',pretendToBeVisual:true});
 opened.add(dom);
 const {window}=dom;
 hub.tab.url=window.location.href;
 for(const [k,value] of Object.entries(tabSession))window.sessionStorage.setItem(k,value);
 window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 window.scrollTo=()=>{};
 window.fetch=async url=>{
  const page=new URL(url).pathname.replace('/lectio/123/','');
  const body=page==='OpgaverElev.aspx'?`<!doctype html><html><head><title>Opgaver - Lectio</title></head><body><div id="contenttable">${assignmentsPage()}</div></body></html>`:null;
  return {ok:!!body,status:body?200:404,url,headers:{get:k=>k==='content-type'?'text/html; charset=utf-8':null},text:async()=>body};
 };
 const sender={tab:{id:hub.tab.id},url:window.location.href};
 window.browser={
  storage,
  runtime:{
   onMessage:{addListener:fn=>hub.tab.listeners.add(fn)},
   sendMessage:async message=>structuredClone(await route(structuredClone(message),sender)),
   connect:()=>{
    const toPage=new Set(),toBack=new Set(),pageGone=new Set(),backGone=new Set();
    let closed=false;
    const close=listeners=>{if(closed)return;closed=true;for(const fn of listeners)fn();};
    const page={onMessage:{addListener:fn=>toPage.add(fn)},onDisconnect:{addListener:fn=>pageGone.add(fn)},postMessage:m=>{if(closed)throw new Error('closed');for(const fn of toBack)fn(structuredClone(m));},disconnect:()=>close(backGone)};
    const back={sender,onMessage:{addListener:fn=>toBack.add(fn)},onDisconnect:{addListener:fn=>backGone.add(fn)},postMessage:m=>{if(closed)throw new Error('closed');setTimeout(()=>{if(!closed)for(const fn of toPage)fn(structuredClone(m));});},disconnect:()=>close(pageGone)};
    window.addEventListener('pagehide',()=>close(backGone));
    watch(back);
    return page;
   },
  },
 };
 window.eval(await readFile('dist/content.js','utf8'));
 for(let i=0;i<50&&!window.document.querySelector('.lx-topbar');i++)await delay(10);
 await delay(30);
 return {window,doc:window.document};
}
const chatLink=doc=>doc.querySelector('.lx-navigation a[href="#lectiomizer-chat"]');
const clickSuggestion=(doc,pattern)=>Array.from(doc.querySelectorAll('.lx-chat-suggestions button')).find(b=>pattern.test(b.textContent)).click();
const assistantText=(doc,i=0)=>doc.querySelectorAll('.lx-chat-assistant')[i]?.textContent||'';

test('the Chat page answers with Lectio data the model read through a tool in the tab',async()=>{
 reset(signedIn());
 rounds.push(
  [{type:'response.output_item.added',item:{type:'function_call',id:'f1',name:'read_page'}},{type:'response.output_item.done',item:{type:'function_call',id:'f1',call_id:'c1',name:'read_page',namespace:'lectio',arguments:'{"url":"OpgaverElev.aspx"}'}},{type:'response.completed',response:{}}],
  answer('m1','Du har **to** opgaver. Den første er [Novelleanalyse](ElevAflevering.aspx?exerciseid=1). ![spor](https://evil.example/p.png?d=1)'),
 );
 const {window,doc}=await visit('/lectio/123/SkemaNy.aspx#lectiomizer-chat');
 assert.equal(chatLink(doc).getAttribute('aria-current'),'page');
 assert.equal(doc.querySelector('.lx-topbar h1').textContent,'Chat');
 assert.equal(doc.getElementById('masterContent').inert,true);

 clickSuggestion(doc,/opgaver/);
 await until(()=>doc.querySelector('.lx-chat-assistant .lx-md')&&!doc.querySelector('.lx-chat-stop'));
 assert.equal(bodies[0].model,'gpt-test');
 assert.equal(bodies[0].tools[0].type,'namespace');
 assert.match(bodies[0].instructions,/- Opgaver: OpgaverElev\.aspx/);
 assert.deepEqual(bodies[0].input.at(-1),{role:'user',content:'Hvilke opgaver skal jeg aflevere de næste to uger?'});
 const result=bodies[1].input.find(i=>i.type==='function_call_output');
 assert.equal(result.call_id,'c1');
 assert.match(result.output,/\[Novelleanalyse\]\(ElevAflevering\.aspx\?[^)]+\) · hold 3a Da/);

 assert.equal(doc.querySelector('.lx-chat-user').textContent,'Hvilke opgaver skal jeg aflevere de næste to uger?');
 assert.equal(doc.querySelector('.lx-chat-tool a').textContent,'Læste Opgaver');
 const md=doc.querySelector('.lx-chat-assistant .lx-md');
 assert.equal(md.querySelector('strong').textContent,'to');
 assert.equal(md.querySelector('a').href,root+'ElevAflevering.aspx?exerciseid=1');
 assert.ok(md.textContent.includes('spor')&&!md.innerHTML.includes('evil.example')); // Images are never loaded.

 const saved=hub.store.chatConversations[0];
 assert.equal(saved.title,'Hvilke opgaver skal jeg aflevere de næste to uger?');
 assert.deepEqual(saved.turns.map(t=>t.role),['user','assistant']);
 assert.deepEqual(saved.turns[1].parts.map(p=>p.type),['tool','text']);
 assert.ok(!JSON.stringify(saved).includes('Opgavesæt 3')); // The page itself is not saved.
 assert.equal(window.sessionStorage.getItem('lectiomizer-chat-open'),saved.id);
 assert.equal(doc.querySelector('.lx-chat-list .lx-current span').textContent,saved.title);

 window.location.hash='';
 window.dispatchEvent(new window.HashChangeEvent('hashchange'));
 await until(()=>!doc.querySelector('.lx-chat'));
 assert.equal(doc.getElementById('masterContent').inert,false);
});

test('an answer keeps running while the student browses Lectio, and is there when they come back',async()=>{
 reset(signedIn());
 const slow=gated(
  [{type:'response.output_item.added',item:{type:'message',id:'m',phase:'final_answer'}},{type:'response.output_text.delta',item_id:'m',delta:'Først det ene. '}],
  [{type:'response.output_text.delta',item_id:'m',delta:'Så det andet.'},{type:'response.output_item.done',item:{type:'message',id:'m',role:'assistant',phase:'final_answer',content:[{type:'output_text',text:'Først det ene. Så det andet.'}]}},{type:'response.completed',response:{}}],
 );
 rounds.push(slow.round);
 let {doc}=await visit('/lectio/123/forside.aspx#lectiomizer-chat');
 clickSuggestion(doc,/i morgen/);
 await until(()=>/Først det ene/.test(assistantText(doc)));

 // Off to Opgaver: the Chat page is gone, the answer is not.
 ({doc}=await visit('/lectio/123/OpgaverElev.aspx'));
 assert.equal(doc.querySelector('.lx-chat'),null);
 await until(()=>chatLink(doc).querySelector('.lx-chat-dot-running'));

 // Back to the chat while it is still answering: the answer so far, live.
 ({doc}=await visit('/lectio/123/SkemaNy.aspx#lectiomizer-chat'));
 await until(()=>/Først det ene/.test(assistantText(doc)));
 assert.ok(doc.querySelector('.lx-chat-stop'));
 slow.open();
 await until(()=>/Så det andet/.test(assistantText(doc))&&!doc.querySelector('.lx-chat-stop'));
 assert.equal(doc.querySelectorAll('.lx-chat-assistant').length,1);
 assert.deepEqual(hub.store.chatConversations[0].turns.map(t=>t.role),['user','assistant']);
 assert.equal(hub.store.chatConversations[0].turns[1].parts[0].text,'Først det ene. Så det andet.');
 await until(()=>!chatLink(doc).querySelector('.lx-chat-dot'));
 assert.deepEqual(hub.store.chatActivity,{running:[],unread:[]}); // Seen as it finished.
});

test('an answer that finishes elsewhere is marked new until the student opens it',async()=>{
 reset(signedIn());
 const slow=gated([{type:'response.output_item.added',item:{type:'message',id:'m',phase:'final_answer'}}],answer('m','Færdig.').slice(1));
 rounds.push(slow.round);
 let {doc}=await visit('/lectio/123/forside.aspx#lectiomizer-chat');
 clickSuggestion(doc,/fravær/);
 await until(()=>doc.querySelector('.lx-chat-stop'));
 ({doc}=await visit('/lectio/123/OpgaverElev.aspx'));
 slow.open();
 await until(()=>hub.store.chatActivity?.unread?.length===1);
 await until(()=>chatLink(doc).querySelector('.lx-chat-dot:not(.lx-chat-dot-running)'));
 // In a new tab nothing is remembered; the unread answer opens by itself.
 ({doc}=await visit('/lectio/123/OpgaverElev.aspx#lectiomizer-chat',{newTab:true}));
 await until(()=>/Færdig/.test(assistantText(doc)));
 await until(()=>hub.store.chatActivity.unread.length===0);
 await until(()=>!chatLink(doc).querySelector('.lx-chat-dot'));
});

test('a failed answer offers Prøv igen, which asks again and replaces it',async()=>{
 reset(signedIn());
 rounds.push([{type:'error',code:'invalid_prompt',message:'Something went wrong with the prompt.',param:null}],answer('m','Nu virker det.'));
 const warn=console.warn;console.warn=()=>{};
 try{
  const {doc}=await visit('/lectio/123/forside.aspx#lectiomizer-chat');
  clickSuggestion(doc,/i morgen/);
  await until(()=>doc.querySelector('.lx-chat-error'));
  assert.match(doc.querySelector('.lx-chat-error').textContent,/ChatGPT svarede: Something went wrong/);
  assert.equal(doc.querySelector('.lx-chat-error-info').textContent,'kode invalid_prompt');
  Array.from(doc.querySelectorAll('.lx-chat-error button')).find(b=>/Prøv igen/.test(b.textContent)).click();
  await until(()=>/Nu virker det/.test(assistantText(doc))&&!doc.querySelector('.lx-chat-stop'));
  assert.equal(doc.querySelectorAll('.lx-chat-assistant').length,1);
  assert.equal(doc.querySelector('.lx-chat-error'),null);
  assert.deepEqual(bodies[1].input,bodies[0].input); // The same question, asked again.
  assert.deepEqual(hub.store.chatConversations[0].turns.map(t=>t.role),['user','assistant']);
 }finally{console.warn=warn;}
});

test('a saved conversation continues with its text history, and stopping keeps what was shown',async()=>{
 reset({...signedIn(),chatConversations:[{id:'c-1',title:'Skema',created:1,updated:2,turns:[{role:'user',text:'Hvad har jeg i dag?'},{role:'assistant',parts:[{type:'tool',name:'get_schedule',label:'Læste skemaet 5.10–5.10',href:root+'SkemaNy.aspx',status:'done'},{type:'text',text:'Dansk kl. 8:15.',phase:'final_answer'}]}]}]});
 const slow=gated([{type:'response.output_item.added',item:{type:'message',id:'m',phase:'final_answer'}},{type:'response.output_text.delta',item_id:'m',delta:'Lokale A1'}],[]);
 rounds.push(slow.round);
 const {window,doc}=await visit('/lectio/123/SkemaNy.aspx#lectiomizer-chat');
 assert.equal(doc.querySelector('.lx-chat-title').textContent,'Ny samtale');
 doc.querySelector('.lx-chat-list-open').click();
 await until(()=>doc.querySelector('.lx-chat-title').textContent==='Skema');
 assert.equal(doc.querySelector('.lx-chat-tool a').textContent,'Læste skemaet 5.10–5.10');
 const textarea=doc.querySelector('.lx-chat-field textarea');
 Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(textarea,'Hvilket lokale?');
 textarea.dispatchEvent(new window.Event('input',{bubbles:true}));
 await delay(10);
 textarea.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
 await until(()=>/Lokale A1/.test(assistantText(doc,1)));
 assert.deepEqual(bodies[0].input,[{role:'user',content:'Hvad har jeg i dag?'},{role:'assistant',content:'Dansk kl. 8:15.',phase:'final_answer'},{role:'user',content:'Hvilket lokale?'}]);
 doc.querySelector('.lx-chat-stop').click();
 await until(()=>hub.store.chatConversations[0].turns.length===4);
 const stopped=hub.store.chatConversations[0].turns[3];
 assert.equal(stopped.stopped,true);assert.equal(stopped.parts[0].text,'Lokale A1');
 await until(()=>/Stoppet/.test(assistantText(doc,1)));
 slow.open();
});

test('signed out, the Chat page offers Continue with ChatGPT',async()=>{
 reset({});
 const {doc}=await visit('/lectio/123/SkemaNy.aspx#lectiomizer-chat');
 const button=Array.from(doc.querySelectorAll('.lx-chat-signin button')).find(b=>b.textContent==='Fortsæt med ChatGPT');
 assert.ok(button);
 assert.equal(doc.querySelector('.lx-chat-composer'),null);
 button.click();
 // No sign-in tab started here: the background opened the consent window instead.
 await until(()=>/vinduet, der åbnede/.test(doc.querySelector('.lx-chat-signin-notice')?.textContent||''));
});
