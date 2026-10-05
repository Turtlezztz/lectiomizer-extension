import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {assignmentsPage,assignmentPage,activityPage,messagesPage} from '../demo/views-fixtures.mjs';
import {schedulePage} from '../demo/schedule-fixture.mjs';
import {
 DYNAMIC_CLIENT,PLAN_SCOPE,ChatGPTError,authorizeUrl,callbackUri,errorFromBody,exchangeCode,pkceChallenge,readCallback,readEvents,refreshTokens,requestBody,verifyIdToken,
} from '../src/chat/openai.js';
import {formatPage,htmlToMarkdown,shortUrl,PAGE_LIMIT} from '../src/chat/format.js';
import {TOOLS,createTools,instructions,resolveUrl} from '../src/chat/tools.js';
import {ChatError,inputFromTurns,runTurn,savedParts,withoutFiles} from '../src/chat/agent.js';
import {parseBlocks} from '../src/chat/markdown.js';

globalThis.DOMParser=new JSDOM('').window.DOMParser;
const root='https://www.lectio.dk/lectio/123/';
const page=(html,url=root+'x.aspx')=>new JSDOM(`<!doctype html><html><head><title>Eleven Demo Elev - Lectio</title></head><body><div id="contenttable">${html}</div></body></html>`,{url}).window.document;

test('first sign-in registers Lectiomizer as a dynamic agent; later ones reuse the issued client',async()=>{
 const common={hostId:'urn:uuid:1',redirectUri:callbackUri(50000),state:'s',nonce:'n',challenge:'c'};
 const first=new URL(authorizeUrl({...common,clientId:'',idTokenHint:'old',loginHint:'a@b.dk'}));
 const p=first.searchParams;
 assert.equal(first.origin+first.pathname,'https://auth.openai.com/api/accounts/authorize');
 assert.deepEqual([p.get('client_id'),p.get('agent_name_hint'),p.get('ext_agent_host_id'),p.get('response_type'),p.get('code_challenge_method'),p.get('resource')],[DYNAMIC_CLIENT,'Lectiomizer','urn:uuid:1','code','S256','https://api.openai.com/v1']);
 assert.equal(p.get('redirect_uri'),'http://127.0.0.1:50000/auth/callback');
 assert.deepEqual(p.get('scope').split(' ').sort(),['chatgpt.tokens.use.direct','email','offline_access','openid','profile','resource.invoke']);
 assert.equal(p.get('id_token_hint'),null); // Only for returning registrations.
 const again=new URL(authorizeUrl({...common,clientId:'oaiapp_1',idTokenHint:'old',loginHint:'a@b.dk'})).searchParams;
 assert.deepEqual([again.get('client_id'),again.get('agent_name_hint'),again.get('id_token_hint'),again.get('login_hint')],['oaiapp_1',null,'old','a@b.dk']);
 // RFC 7636 appendix B.
 assert.equal(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('callbacks are checked against the pending attempt before any code is used',()=>{
 const cb=q=>`http://127.0.0.1:50000/auth/callback?${new URLSearchParams(q)}`;
 assert.deepEqual(readCallback(cb({code:'k',state:'s',client_id:'oaiapp_9'}),{state:'s',clientId:''}),{code:'k',clientId:'oaiapp_9'});
 assert.deepEqual(readCallback(cb({code:'k',state:'s'}),{state:'s',clientId:'oaiapp_1'}),{code:'k',clientId:'oaiapp_1'});
 assert.throws(()=>readCallback(cb({code:'k',state:'other',client_id:'x'}),{state:'s',clientId:''}),/passede ikke/);
 assert.throws(()=>readCallback(cb({code:'k',state:'s'}),{state:'s',clientId:''}),/Registreringen/); // New registration without an issued id.
 assert.throws(()=>readCallback(cb({code:'k',state:'s',client_id:'oaiapp_2'}),{state:'s',clientId:'oaiapp_1'}),/anden registrering/);
 assert.throws(()=>readCallback(cb({error:'access_denied',state:'s'}),{state:'s',clientId:''}),/afviste/);
});

test('code exchange and refresh send the issued client and resource; unusable tokens ask for a new sign-in',async()=>{
 const sent=[];
 const fetch=async(url,init)=>{sent.push([url,Object.fromEntries(init.body)]);return new Response(JSON.stringify({access_token:'a',refresh_token:'r2',id_token:'i',expires_in:3600,scope:`openid email ${PLAN_SCOPE}`}),{status:200});};
 const tokens=await exchangeCode({fetch,clientId:'oaiapp_1',code:'k',verifier:'v',redirectUri:callbackUri(50000)});
 assert.equal(sent[0][0],'https://auth.openai.com/api/accounts/oauth/token');
 assert.deepEqual(sent[0][1],{grant_type:'authorization_code',client_id:'oaiapp_1',code:'k',code_verifier:'v',redirect_uri:'http://127.0.0.1:50000/auth/callback',resource:'https://api.openai.com/v1'});
 assert.ok(tokens.scopes.includes(PLAN_SCOPE)&&tokens.expiresAt>Date.now());
 await refreshTokens({fetch,clientId:'oaiapp_1',refreshToken:'r1'});
 assert.deepEqual(sent[1][1],{grant_type:'refresh_token',client_id:'oaiapp_1',refresh_token:'r1',resource:'https://api.openai.com/v1'});
 const denied=async()=>new Response(JSON.stringify({error:'refresh_token_reused'}),{status:400});
 await assert.rejects(refreshTokens({fetch:denied,clientId:'oaiapp_1',refreshToken:'r1'}),e=>e instanceof ChatGPTError&&e.kind==='reconnect');
});

test('ID tokens are verified against the signing key, client, expiry and nonce',async()=>{
 const {publicKey,privateKey}=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk={...await crypto.subtle.exportKey('jwk',publicKey),kid:'k1'};
 const b64=v=>Buffer.from(typeof v==='string'?v:JSON.stringify(v)).toString('base64url');
 const sign=async claims=>{const head=`${b64({alg:'RS256',kid:'k1'})}.${b64(claims)}`;const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',privateKey,new TextEncoder().encode(head));return `${head}.${Buffer.from(sig).toString('base64url')}`;};
 const claims={iss:'https://auth.openai.com',aud:'oaiapp_1',sub:'user-1',email:'elev@example.com',nonce:'n',exp:Math.floor(Date.now()/1000)+600};
 const ok=await verifyIdToken(await sign(claims),{clientId:'oaiapp_1',nonce:'n',keys:[jwk]});
 assert.equal(ok.sub,'user-1');
 await assert.rejects(verifyIdToken(await sign(claims),{clientId:'oaiapp_1',nonce:'other',keys:[jwk]}),/nonce/);
 await assert.rejects(verifyIdToken(await sign({...claims,aud:'oaiapp_2'}),{clientId:'oaiapp_1',nonce:'n',keys:[jwk]}),/modtager/);
 await assert.rejects(verifyIdToken(await sign({...claims,exp:1}),{clientId:'oaiapp_1',nonce:'n',keys:[jwk]}),/udløbet/);
 const forged=(await sign(claims)).replace(/\.[^.]+\./,`.${b64({...claims,sub:'someone-else'})}.`);
 await assert.rejects(verifyIdToken(forged,{clientId:'oaiapp_1',nonce:'n',keys:[jwk]}),/signatur/);
});

test('requests follow the plan-usage rules and errors map to what the student can do',async()=>{
 const body=requestBody({model:'m',instructions:'i',input:[],tools:TOOLS,effort:'low'});
 assert.deepEqual([body.store,body.stream,body.reasoning],[false,true,{effort:'low'}]);
 assert.equal(requestBody({model:'m',input:[],effort:''}).reasoning,undefined);
 assert.equal(TOOLS[0].type,'namespace'); // Function tools must sit in a namespace on this route.
 assert.equal(errorFromBody(429,{error:{code:'subscription_sharing_usage_limit_exceeded'}}).kind,'limit');
 assert.equal(errorFromBody(0,{response:{error:{code:'subscription_sharing_usage_limit_exceeded'}}}).kind,'limit');
 assert.equal(errorFromBody(401,{detail:'nope'}).kind,'reconnect');
 assert.equal(errorFromBody(400,{error:{code:'subscription_sharing_unsupported_capability',param:'input[3]'}}).param,'input[3]');
 assert.match(errorFromBody(403,{detail:'Region not supported'}).message,/Region/);
 // Stream errors: fields at the top, nested under `error`, or a failure without an error object.
 assert.match(errorFromBody(0,{type:'error',code:null,message:'Model not found',param:'model'}).message,/ChatGPT svarede: Model not found/);
 const nested=errorFromBody(0,{type:'error',error:{type:'invalid_request_error',code:'subscription_sharing_usage_limit_exceeded',message:'Limit'}});
 assert.deepEqual([nested.kind,nested.code,nested.detail],['limit','subscription_sharing_usage_limit_exceeded','Limit']);
 assert.match(errorFromBody(0,{type:'response.failed',response:{status:'failed',error:null}}).message,/uden forklaring/);
 assert.match(errorFromBody(400,{error:{code:'subscription_sharing_unsupported_capability',param:'tools[0]',message:'Namespaces are not supported'}}).message,/\(tools\[0\]: Namespaces are not supported\)/);
 assert.match(errorFromBody(422,{detail:[{msg:'field required'}]}).message,/field required/);
 // Server-sent events split across chunks.
 const chunks=['event: x\ndata: {"type":"a","n":1}\n\nda','ta: {"type":"b"}\n\n','data: [DONE]\n\n'];
 const stream=new ReadableStream({start(c){for(const s of chunks)c.enqueue(new TextEncoder().encode(s));c.close();}});
 const events=[];for await(const e of readEvents(stream))events.push(e.type);
 assert.deepEqual(events,['a','b']);
});

test('assignment pages become compact Markdown with links relative to the school',()=>{
 const list=formatPage(page(assignmentsPage(),root+'OpgaverElev.aspx'),root+'OpgaverElev.aspx');
 assert.equal(list.title,'Eleven Demo Elev'); // No section in this fixture's title.
 assert.match(list.markdown,/Adresse: OpgaverElev\.aspx/);
 assert.match(list.markdown,/\[Novelleanalyse\]\(ElevAflevering\.aspx\?[^)]+\) · hold 3a Da · frist [^·]+ · status Venter · elevtid 4,00/);
 assert.match(list.markdown,/Filtre: Vis kun aktuelle: til/);
 const detail=formatPage(page(assignmentPage(),root+'ElevAflevering.aspx?exerciseid=1'),root+'ElevAflevering.aspx?exerciseid=1').markdown;
 assert.match(detail,/### Opgavebeskrivelsens dokumenter \(læs dem med read_document\)\n- \[Novelleanalyse\.docx \(ma 5\/10\)\]\(ExerciseFileGet\.aspx\?type=opgavedef&exercisefileid=1\)/);
 assert.match(detail,/\*\*Ansvarlig:\*\* Lene Madsen \(lm\)/);
 assert.match(detail,/Dokument: \[[^\]]+\]\(ExerciseFileGet\.aspx\?type=elevopgave&entryid=1\)/);
 assert.match(detail,/Afleveringen er åben/);
});

test('lesson pages keep teacher content, materials and safe links only',()=>{
 const md=formatPage(page(activityPage(),root+'aktivitet/aktivitetforside2.aspx?absid=1'),root+'aktivitet/aktivitetforside2.aspx?absid=1').markdown;
 assert.match(md,/### Lektier/);
 assert.match(md,/\]\(lc\/1\/res\/2\/Analysemodel\.pdf\)/); // Lesson material, readable with read_document.
 assert.match(md,/\]\(https:\/\/example\.org\/tekst\)/); // External links stay absolute.
 assert.doesNotMatch(md,/javascript:|ls-fonticon|keyboard_arrow/);
 assert.match(md,/\*\*Note til lektionen:\*\* Husk computer/);
 const messages=formatPage(page(messagesPage(),root+'beskeder2.aspx'),root+'beskeder2.aspx').markdown;
 assert.match(messages,/kan ikke hentes herfra/);
});

test('other pages are converted from HTML: data tables, headings and hidden parts',()=>{
 const doc=page(`<h2>Bøger</h2><span class="ls-fonticon">search</span><p style="display:none">skjult</p><table><tr><th>Titel</th><th>Frist</th></tr><tr><td>Dansk | litteratur</td><td>30/6</td></tr></table><table><tr><td>Layout</td><td><a href="javascript:void(0)">Klik</a></td></tr></table>`);
 const md=htmlToMarkdown(doc.querySelector('#contenttable'));
 assert.match(md,/### Bøger/);
 assert.match(md,/\| Titel \| Frist \|\n\| --- \| --- \|\n\| Dansk \\\| litteratur \| 30\/6 \|/);
 assert.match(md,/Layout · Klik/);
 assert.doesNotMatch(md,/skjult|search/);
 assert.equal(shortUrl('https://www.lectio.dk/lectio/123/grades/grade_report.aspx',root+'subnav/x.aspx'),'grades/grade_report.aspx');
 const long=formatPage(page(`<p>${'ord '.repeat(20000)}</p>`),root+'x.aspx');
 assert.ok(long.truncated&&long.markdown.length<PAGE_LIMIT+100);
});

// A fake Lectio for the tools: path → response.
function lectio(routes){
 const calls=[];
 const fetch=async url=>{calls.push(url);const route=routes[new URL(url).pathname.replace('/lectio/123/','')+new URL(url).search]??routes[new URL(url).pathname.replace('/lectio/123/','')];
  if(!route)return new Response('missing',{status:404});
  const {body,type='text/html; charset=utf-8',headers={},url:final=url}=typeof route==='string'?{body:route}:route;
  const response=new Response(body,{status:200,headers:{'content-type':type,...headers}});Object.defineProperty(response,'url',{value:final});return response;};
 return {fetch,calls};
}
const html=content=>`<!doctype html><html><head><title>Eleven Demo Elev, 3a - Opgaver - Lectio</title></head><body><div id="contenttable">${content}</div></body></html>`;

test('tools read only the student\'s own school and never sign out',()=>{
 assert.equal(resolveUrl('OpgaverElev.aspx',root).href,root+'OpgaverElev.aspx');
 assert.throws(()=>resolveUrl('https://evil.example/lectio/123/x.aspx',root),/din skoles/);
 assert.throws(()=>resolveUrl('/lectio/999/forside.aspx',root),/din skoles/);
 assert.throws(()=>resolveUrl('logout.aspx',root),/kan ikke læses/);
 assert.equal(resolveUrl('kataloginfo.aspx',root).pathname,'/lectio/123/kataloginfo.aspx');
});

test('read_page, read_document and get_schedule return Markdown or files for the model',async()=>{
 const pdf=new Uint8Array([37,80,68,70,45,49,46,55]);
 const {fetch,calls}=lectio({
  'OpgaverElev.aspx':html(assignmentsPage()),
  'ExerciseFileGet.aspx':{body:pdf,type:'application/octet-stream',headers:{'content-disposition':'attachment; filename*=UTF-8\'\'Novelleanalyse%20opgave.pdf'}},
  'lc/1/res/2/Analysemodel.docx':{body:new Uint8Array([80,75,3,4]),type:'application/octet-stream'},
  'lc/1/res/2/data.csv':{body:'navn;tal\nA;1',type:'text/csv'},
  'lc/1/res/2/film.mp4':{body:new Uint8Array([0,0]),type:'video/mp4'},
  'SkemaNy.aspx?week=412026':html(schedulePage()),
  'forside.aspx':{body:html('<input type="password">'),url:root+'login.aspx'},
 });
 const tools=createTools({root,scheduleHref:root+'SkemaNy.aspx',fetch,now:()=>new Date(2026,9,5,9)});
 const call=(name,args)=>tools.run({name,arguments:JSON.stringify(args)});

 const opgaver=await call('read_page',{url:'OpgaverElev.aspx'});
 assert.equal(opgaver.ok,true);assert.equal(opgaver.label,'Læste Opgaver');assert.match(opgaver.output,/Novelleanalyse/);

 const doc=await call('read_document',{url:'ExerciseFileGet.aspx?type=opgavedef&exercisefileid=1'});
 const file=doc.output.find(p=>p.type==='input_file');
 assert.equal(doc.label,'Hentede Novelleanalyse opgave.pdf');
 assert.equal(file.filename,'Novelleanalyse opgave.pdf');
 assert.equal(file.file_data,`data:application/pdf;base64,${Buffer.from(pdf).toString('base64')}`);
 assert.match((await call('read_document',{url:'lc/1/res/2/Analysemodel.docx'})).output[1].file_data,/^data:application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document;base64,/);
 assert.match((await call('read_document',{url:'lc/1/res/2/data.csv'})).output,/navn;tal\nA;1/);
 const video=await call('read_document',{url:'lc/1/res/2/film.mp4'});
 assert.equal(video.ok,false);assert.match(video.output,/filtype, der ikke kan læses/);

 const skema=await call('get_schedule',{start:'2026-10-05',days:2});
 assert.match(skema.output,/# Skema 2026-10-05 til 2026-10-06/);
 assert.match(skema.output,/08:15–09:45 \[3a Da\]\(aktivitet\/aktivitetforside2\.aspx\?absid=101[^)]*\) · lærer [^\n]+ · lokale A12\n  Lektier:\n  - Læs novellen side 12-30/);
 assert.match(skema.output,/\(AFLYST\)/);
 assert.doesNotMatch(skema.output,/Lab 2/); // 7/10 is outside the two days.
 assert.equal(skema.label,'Læste skemaet 5.10–6.10');

 const expired=await call('read_page',{url:'forside.aspx'});
 assert.match(expired.output,/sessionen er udløbet/);
 const outside=await call('read_page',{url:'https://www.lectio.dk/lectio/999/forside.aspx'});
 assert.equal(outside.ok,false);
 assert.ok(!calls.some(u=>u.includes('/999/')));
 assert.match(instructions({name:'Demo Elev',school:'Demo Gymnasium',pages:[{label:'Opgaver',url:'OpgaverElev.aspx'}],now:new Date(2026,9,5,9)}),/- Opgaver: OpgaverElev\.aspx/);
});

// Scripted model: each round is a list of stream events.
function script(rounds){
 const seen=[];
 const stream=async function*(input){seen.push(structuredClone(input));const round=rounds.shift();if(round instanceof Error)throw round;for(const e of round)yield e;};
 return {stream,seen};
}
const message=(id,text,phase='final_answer')=>[{type:'response.output_item.added',item:{type:'message',id,phase}},...text.match(/.{1,5}/g).map(delta=>({type:'response.output_text.delta',item_id:id,delta})),{type:'response.output_item.done',item:{type:'message',id,role:'assistant',phase,created_by:'x',content:[{type:'output_text',text}]}}];
const fnCall=(id,name,args)=>[{type:'response.output_item.added',item:{type:'function_call',id,name,namespace:'lectio'}},{type:'response.output_item.done',item:{type:'function_call',id,call_id:'c'+id,name,namespace:'lectio',arguments:JSON.stringify(args)}}];

test('a turn runs tool calls and feeds the results back until the model answers',async()=>{
 const {stream,seen}=script([[{type:'response.output_item.done',item:{type:'reasoning',id:'r1',encrypted_content:'enc'}},...fnCall('1','read_page',{url:'OpgaverElev.aspx'})],message('m1','Du har to opgaver.')]);
 const tools={runningLabel:()=>'Læser side',run:async call=>({output:`# Opgaver for ${JSON.parse(call.arguments).url}`,label:'Læste Opgaver',href:root+'OpgaverElev.aspx',ok:true})};
 const updates=[];
 const input=[{role:'user',content:'Hvilke opgaver?'}];
 const parts=await runTurn({input,stream,tools,onUpdate:(p,s)=>updates.push(s)});
 assert.deepEqual(parts.map(p=>[p.type,p.label||p.text]),[['tool','Læste Opgaver'],['text','Du har to opgaver.']]);
 assert.deepEqual(input.map(i=>i.type||i.role),['user','reasoning','function_call','function_call_output','message']);
 assert.equal(input[3].call_id,'c1');assert.equal(input[4].created_by,undefined);
 assert.equal(seen[1].length,4); // The second request carries the reasoning, call and result.
 assert.ok(updates.includes('Læser side…'));
 assert.deepEqual(savedParts(parts),[{type:'tool',name:'read_page',label:'Læste Opgaver',href:root+'OpgaverElev.aspx',status:'done'},{type:'text',text:'Du har to opgaver.',phase:'final_answer'}]);
});

test('a file ChatGPT rejects is dropped once, and stopping keeps what was shown',async()=>{
 const input=[{role:'user',content:'Læs'},{type:'function_call',call_id:'c1',name:'read_document',arguments:'{}'},{type:'function_call_output',call_id:'c1',output:[{type:'input_text',text:'Dokument: a.pdf'},{type:'input_file',filename:'a.pdf',file_data:'data:application/pdf;base64,AA=='}]}];
 const {stream}=script([new ChatError({message:'nej',kind:'unsupported',status:400}),message('m1','Filen kunne ikke læses.')]);
 const parts=await runTurn({input,stream,tools:{runningLabel:()=>'',run:async()=>({})}});
 assert.equal(parts.at(-1).text,'Filen kunne ikke læses.');
 assert.match(input[2].output,/Dokument: a\.pdf\n\(Filens indhold kunne ikke sendes til ChatGPT\.\)/);
 assert.equal(withoutFiles(input),false);

 const controller=new AbortController();
 const halted=[];
 const stopping=async function*(){yield {type:'response.output_item.added',item:{type:'message',id:'m',phase:'final_answer'}};yield {type:'response.output_text.delta',item_id:'m',delta:'Halvt svar'};controller.abort();throw new DOMException('Stoppet','AbortError');};
 await assert.rejects(runTurn({input:halted,stream:stopping,tools:{runningLabel:()=>''},signal:controller.signal}),{name:'AbortError'});
 assert.deepEqual(halted,[{role:'assistant',content:'Halvt svar'}]);
});

test('retry notices from a busy server show as the turn\'s status',async()=>{
 const {stream}=script([[{type:'lx.retrying',attempt:1},...message('m1','Svar.')]]);
 const statuses=[];
 const parts=await runTurn({input:[{role:'user',content:'Hej'}],stream,tools:{runningLabel:()=>''},onUpdate:(p,s)=>statuses.push(s)});
 assert.equal(parts.at(-1).text,'Svar.');
 assert.ok(statuses.includes('ChatGPT har travlt – prøver igen…'));
});

test('saved conversations rebuild a text-only history',()=>{
 const turns=[{role:'user',text:'Hej'},{role:'assistant',parts:[{type:'text',text:'Jeg kigger.',phase:'commentary'},{type:'tool',label:'Læste Opgaver'},{type:'text',text:'Svar',phase:'final_answer'}]}];
 assert.deepEqual(inputFromTurns(turns),[{role:'user',content:'Hej'},{role:'assistant',content:'Jeg kigger.',phase:'commentary'},{role:'assistant',content:'Svar',phase:'final_answer'}]);
});

test('Markdown blocks: headings, nested lists, tables, quotes and code',()=>{
 const blocks=parseBlocks('## Uge 41\n\n- Mandag\n  - Dansk\n- Tirsdag\n\n1. En\n2. To\n\n| Fag | Frist |\n| --- | --- |\n| Dansk | fre |\n\n> Note\n\n```\nkode\n```\nLinje et\nlinje to');
 assert.deepEqual(blocks.map(b=>b.type),['heading','list','list','table','quote','code','paragraph']);
 assert.deepEqual(blocks[1].items[0].map(b=>b.type),['paragraph','list']);
 assert.equal(blocks[2].ordered,true);
 assert.deepEqual(blocks[3].rows,[['Dansk','fre']]);
 assert.equal(blocks[6].text,'Linje et\nlinje to');
});
