// The background side of Sign in with ChatGPT and the streaming proxy,
// against a fake browser API and a fake OpenAI.
import test from 'node:test';
import assert from 'node:assert/strict';

const local={},session={};
const tabs={created:[],removed:[],updated:[]};
const area=store=>({get:async key=>Object.fromEntries([].concat(key).map(k=>[k,store[k]])),set:async values=>{Object.assign(store,structuredClone(values));},remove:async key=>{for(const k of [].concat(key))delete store[k];}});
globalThis.browser={
 storage:{local:area(local),session:area(session),onChanged:{addListener(){},removeListener(){}}},
 permissions:{contains:async()=>true},
 tabs:{create:async({url})=>{tabs.created.push(url);return {id:7};},remove:async id=>{tabs.removed.push(id);},update:async(id,patch)=>{tabs.updated.push([id,patch]);}},
};
// settings.js reads the browser global when it loads.
const {startSignIn,onCallbackRequest,onTabUpdated,pasteCallback,responses,signOut,retry}=await import('../src/chat/session.js');
retry.delays=[0,0,0];

const {publicKey,privateKey}=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',publicKey),kid:'k1'};
const b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
async function idToken(claims){const head=`${b64({alg:'RS256',kid:'k1'})}.${b64(claims)}`;const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',privateKey,new TextEncoder().encode(head));return `${head}.${Buffer.from(sig).toString('base64url')}`;}

const requests=[];
let responsesStatus=[200];
const sse=events=>new ReadableStream({start(c){for(const e of events)c.enqueue(new TextEncoder().encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`));c.close();}});
globalThis.fetch=async(url,init={})=>{
 requests.push([url,init]);
 const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
 if(url==='https://auth.openai.com/.well-known/openid-configuration')return json({jwks_uri:'https://auth.openai.com/jwks',revocation_endpoint:'https://auth.openai.com/revoke'});
 if(url==='https://auth.openai.com/jwks')return json({keys:[jwk]});
 if(url==='https://auth.openai.com/revoke')return new Response('',{status:200});
 if(url==='https://auth.openai.com/api/accounts/oauth/token'){
  const form=Object.fromEntries(init.body);
  const nonce=local.lastNonce;
  if(form.grant_type==='refresh_token')return json({access_token:'access-2',refresh_token:'refresh-2',expires_in:3600,scope:'openid email offline_access resource.invoke chatgpt.tokens.use.direct'});
  return json({access_token:'access-1',refresh_token:'refresh-1',id_token:await idToken({iss:'https://auth.openai.com',aud:form.client_id,sub:'user-1',email:'elev@example.com',nonce,exp:Math.floor(Date.now()/1000)+600}),expires_in:3600,scope:'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'});
 }
 if(url==='https://api.openai.com/v1/models')return json({models:[{slug:'gpt-a',display_name:'GPT A',visibility:'list'},{slug:'hidden',visibility:'hide'}]});
 if(url==='https://api.openai.com/v1/responses'){
  const status=responsesStatus.shift()??200;
  const overloaded={type:'error',code:'server_is_overloaded',message:'Our servers are currently overloaded. Please try again later.',param:null};
  if(status==='overloaded')return new Response(sse([{type:'response.created',response:{}},overloaded]),{status:200,headers:{'content-type':'text/event-stream'}});
  if(status==='overloaded-late')return new Response(sse([{type:'response.output_item.added',item:{type:'message',id:'m'}},{type:'response.output_text.delta',item_id:'m',delta:'Hal'},overloaded]),{status:200,headers:{'content-type':'text/event-stream'}});
  if(status==='fail')return new Response(sse([{type:'response.created',response:{}},{type:'error',error:{type:'invalid_request_error',code:'model_not_found',message:'The model gpt-a does not exist.'}}]),{status:200,headers:{'content-type':'text/event-stream','x-request-id':'req_123'}});
  if(status!==200)return json({detail:'expired'},status);
  return new Response(sse([{type:'response.output_item.added',item:{type:'message',id:'m'}},{type:'response.output_text.delta',item_id:'m',delta:'Hej'},{type:'response.reasoning_summary_text.delta',delta:'x'},{type:'response.completed',response:{usage:{total_tokens:5},output:[]}}]),{status:200,headers:{'content-type':'text/event-stream'}});
 }
 return new Response('not found',{status:404});
};
const until=async check=>{for(let i=0;i<200;i++){if(await check())return;await new Promise(r=>setTimeout(r,5));}throw new Error('timed out');};

const attempt=state=>session.chatgptAttempts?.[state];
const latest=()=>attempt(new URL(tabs.created.at(-1)).searchParams.get('state'));

test('sign-in registers, catches the loopback callback, verifies the identity and saves the plan',async()=>{
 await startSignIn({openerTabId:3});
 const auth=new URL(tabs.created[0]);
 assert.equal(auth.searchParams.get('client_id'),'dynamic_agent_client');
 const pending=latest();
 assert.equal(pending.tabId,7);
 assert.equal(auth.searchParams.get('redirect_uri'),pending.redirectUri);
 assert.equal(auth.searchParams.get('ext_agent_host_id'),local.chatgptHost);
 assert.match(local.chatgptHost,/^urn:uuid:[0-9a-f-]{36}$/);
 assert.equal(local.chatAccount.pending,true);
 // Other loopback pages, and callbacks on another port, are left alone.
 assert.deepEqual(await onCallbackRequest({url:'http://127.0.0.1:3000/',tabId:9}),{});
 assert.deepEqual(await onCallbackRequest({url:'http://127.0.0.1:1/auth/callback?code=x&state='+pending.state,tabId:9}),{});
 local.lastNonce=pending.nonce;
 const result=await onCallbackRequest({url:`${pending.redirectUri}?code=k&state=${pending.state}&client_id=oaiapp_1&scope=openid`,tabId:7});
 assert.deepEqual(result,{cancel:true});
 assert.deepEqual(tabs.removed,[7]);assert.deepEqual(tabs.updated,[[3,{active:true}]]);
 await until(()=>local.chatAccount?.connected);
 assert.deepEqual(local.chatAccount.models,[{slug:'gpt-a',name:'GPT A'}]);
 assert.equal(local.chatAccount.planEnabled,true);assert.equal(local.chatAccount.email,'elev@example.com');
 assert.equal(local.chatgptRegistration.clientId,'oaiapp_1');assert.equal(local.chatgptRegistration.refreshToken,'refresh-1');
 assert.equal(session.chatgptAccess.token,'access-1');assert.equal(attempt(pending.state),undefined);
 // The same code can't be used twice.
 assert.deepEqual(await onCallbackRequest({url:`${pending.redirectUri}?code=k&state=${pending.state}&client_id=oaiapp_1`,tabId:7}),{});
 // The second sign-in reuses the issued client and hints the account.
 await startSignIn({});
 const again=new URL(tabs.created[1]).searchParams;
 assert.deepEqual([again.get('client_id'),again.get('agent_name_hint'),again.get('login_hint')],['oaiapp_1',null,'elev@example.com']);
 assert.ok(again.get('id_token_hint'));
});

test('when Firefox hides the request, the tab address or a pasted address finishes sign-in',async()=>{
 // Two attempts: an extra click must not void the first tab.
 await startSignIn({});const first=latest();
 await startSignIn({});const second=latest();
 assert.notEqual(first.state,second.state);
 assert.ok(attempt(first.state)&&attempt(second.state));
 local.lastNonce=first.nonce;
 tabs.removed.length=0;
 await onTabUpdated(7,{url:`${first.redirectUri}?code=k1&state=${first.state}`});
 assert.deepEqual(tabs.removed,[7]);
 await until(()=>local.chatAccount.connected&&!local.chatAccount.pending&&session.chatgptAttempts===undefined);
 assert.equal(attempt(second.state),undefined); // Signed in: the other attempt is dropped.
 await onTabUpdated(7,{status:'complete'}); // No address, nothing to do.

 await startSignIn({});const third=latest();
 assert.equal((await pasteCallback('http://127.0.0.1:1/auth/callback?code=x&state='+third.state)).ok,false); // Wrong port.
 assert.match((await pasteCallback('noget andet')).message,/passer ikke/);
 local.lastNonce=third.nonce;
 assert.deepEqual(await pasteCallback(` ${third.redirectUri}?code=k2&state=${third.state} `),{ok:true});
 assert.equal(session.chatgptAttempts,undefined);
 assert.equal(local.chatAccount.connected,true);
});

// Collects a responses() stream: the event types, and the error it ended with.
async function collect(request){
 const types=[];
 try{for await(const event of responses(request))types.push(event.type);return {types};}
 catch(error){return {types,error};}
}

test('chat requests stream from the background with the token, renewing it once on 401',async()=>{
 responsesStatus=[401,200];
 const before=requests.length;
 const {types,error}=await collect({model:'gpt-a',instructions:'i',input:[{role:'user',content:'Hej'}],tools:[],effort:'',temperature:1});
 assert.equal(error,undefined);
 assert.deepEqual(types,['response.output_item.added','response.output_text.delta','response.completed']);
 const calls=requests.slice(before).filter(([url])=>url==='https://api.openai.com/v1/responses');
 assert.deepEqual(calls.map(([,init])=>init.headers.Authorization),['Bearer access-1','Bearer access-2']);
 const body=JSON.parse(calls[1][1].body);
 assert.deepEqual([body.store,body.stream,body.temperature,body.reasoning],[false,true,undefined,undefined]);
 assert.equal(local.chatgptRegistration.refreshToken,'refresh-2'); // Rotated.
});

test('an error inside the stream keeps the server\'s message and request id',async()=>{
 responsesStatus=['fail'];
 const warn=console.warn;console.warn=()=>{};
 let error;
 try{({error}=await collect({model:'gpt-a',input:[{role:'user',content:'Hej'}]}));}finally{console.warn=warn;}
 assert.equal(error.message,'ChatGPT svarede: The model gpt-a does not exist.');
 assert.deepEqual([error.code,error.requestId,error.kind],['model_not_found','req_123','other']);
});

test('busy servers are retried while nothing has been shown, never after',async()=>{
 const warn=console.warn;console.warn=()=>{};
 try{
  responsesStatus=['overloaded','overloaded',200];
  const ok=await collect({model:'gpt-a',input:[{role:'user',content:'Hej'}]});
  assert.deepEqual(ok.types,['lx.retrying','lx.retrying','response.output_item.added','response.output_text.delta','response.completed']);

  responsesStatus=['overloaded-late',200];
  const late=await collect({model:'gpt-a',input:[{role:'user',content:'Hej'}]});
  assert.deepEqual(late.types,['response.output_item.added','response.output_text.delta']);
  assert.deepEqual([late.error.kind,late.error.code],['retry','server_is_overloaded']);
  assert.match(late.error.message,/ChatGPT har travlt/);

  responsesStatus=['overloaded','overloaded','overloaded','overloaded'];
  const gaveUp=await collect({model:'gpt-a',input:[]});
  assert.equal(gaveUp.types.filter(t=>t==='lx.retrying').length,3);
  assert.equal(gaveUp.error.code,'server_is_overloaded');
 }finally{console.warn=warn;responsesStatus=[200];}
});

test('stopping ends a stream that is waiting for more',async()=>{
 const controller=new AbortController();
 const stalled=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: {"type":"response.output_text.delta","delta":"Hal"}\n\n'));}});
 const realFetch=globalThis.fetch;
 globalThis.fetch=async(url,init)=>url==='https://api.openai.com/v1/responses'?new Response(stalled,{status:200}):realFetch(url,init);
 try{
  const seen=[];
  const run=(async()=>{for await(const event of responses({model:'gpt-a',input:[]},controller.signal))seen.push(event.type);})();
  await until(()=>seen.length===1);
  controller.abort();
  await assert.rejects(run,{name:'AbortError'});
 }finally{globalThis.fetch=realFetch;}
});

test('signing out revokes the refresh token and keeps the client registration',async()=>{
 await signOut();
 const revoke=requests.find(([url])=>url==='https://auth.openai.com/revoke');
 assert.deepEqual(Object.fromEntries(revoke[1].body),{token:'refresh-2',token_type_hint:'refresh_token',client_id:'oaiapp_1'});
 assert.deepEqual(Object.keys(local.chatgptRegistration).sort(),['clientId','email','subject']);
 assert.equal(session.chatgptAccess,undefined);
 assert.equal(local.chatAccount.connected,false);
 const {error}=await collect({model:'gpt-a',input:[]});
 assert.equal(error.kind,'reconnect');
});
