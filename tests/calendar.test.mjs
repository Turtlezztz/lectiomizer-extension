import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {schedulePage,weekLessons} from '../demo/schedule-fixture.mjs';
import {readSchedule,parseTooltip,isoWeek,weeksFrom,weekUrl} from '../src/readers/schedule.js';
import {lessonToEvent,planSync} from '../src/calendar/events.js';
import {GoogleError,authorize,createClient,ensureCalendar,syncCalendar,CALENDAR_SCOPE} from '../src/calendar/google.js';
import {ReaderError} from '../src/readers/util.js';

// settings.js reads the browser global when it loads, so scrape.js is imported after the fake exists.
const store={};
globalThis.browser={storage:{local:{get:async key=>({[key]:store[key]}),set:async values=>Object.assign(store,values)}}};
const {syncSchedule}=await import('../src/calendar/scrape.js');

const url='https://www.lectio.dk/lectio/123/SkemaNy.aspx?type=elev&elevid=9';
const page=(html=schedulePage(),at=url)=>new JSDOM(`<div id="contenttable">${html}</div>`,{url:at}).window.document;
const week41=isoWeek(new Date(2026,9,5));

test('ISO weeks and Lectio week links survive the turn of the year',()=>{
 assert.deepEqual([week41.week,week41.year,week41.dates[0],week41.dates[6]],[41,2026,'2026-10-05','2026-10-11']);
 assert.deepEqual([isoWeek(new Date(2026,9,11)).week,isoWeek(new Date(2026,9,12)).week],[41,42]);
 assert.deepEqual([isoWeek(new Date(2025,11,29)).week,isoWeek(new Date(2025,11,29)).year],[1,2026]);
 assert.deepEqual([isoWeek(new Date(2027,0,1)).week,isoWeek(new Date(2027,0,1)).year],[53,2026]);
 assert.deepEqual(weeksFrom(new Date(2026,11,28),2).map(w=>[w.week,w.year]),[[53,2026],[1,2027]]);
 assert.equal(weekUrl(url,{week:5,year:2027}),url+'&week=052027');
});

test('tooltips give times, status, title, people and the lesson text',()=>{
 const tip=parseTooltip('Ændret!\nPrøve\n5/10-2026 10:00 til 11:30\nHold: 3a Ma\nLærere: A (a), B (b)\nLokaler: B21, B22\n\nLektier:\n- Side 4');
 assert.deepEqual([tip.start,tip.end,tip.status,tip.title],['2026-10-05T10:00','2026-10-05T11:30','changed','Prøve']);
 assert.deepEqual(tip.fields,{holds:'3a Ma',teachers:'A (a), B (b)',rooms:'B21, B22'});
 assert.equal(tip.details,'Lektier:\n- Side 4');
 assert.deepEqual([parseTooltip('30/9-2026 08:00 til 2/10-2026 16:00').end],['2026-10-02T16:00']);
 assert.equal(parseTooltip('Lektiecafé'),null);
});

test('a Skema week reads into unique lessons keyed by Lectio\'s lesson id',()=>{
 const lessons=readSchedule(page());
 assert.deepEqual(lessons.map(l=>l.id),['absid:101','absid:102','absid:103','absid:104']);
 const [danish,maths,english]=lessons;
 assert.deepEqual([danish.start,danish.end,danish.holds,danish.teachers,danish.rooms,danish.status],['2026-10-05T08:15','2026-10-05T09:45',['3a Da'],['Lene Madsen (lm)'],['A12'],'normal']);
 assert.equal(danish.details,'Lektier:\n- Læs novellen side 12-30');
 assert.match(danish.href,/^https:\/\/www\.lectio\.dk\/lectio\/123\/aktivitet\/aktivitetforside2\.aspx\?absid=101/);
 assert.deepEqual([maths.status,maths.title],['changed','Prøve']);
 assert.deepEqual([english.status,english.teachers,english.rooms],['cancelled',['Mette Skov (ms)','Lars Holm (lh)'],['C03','C04']]);
 assert.deepEqual(readSchedule(page(schedulePage([]))),[]);
 assert.throws(()=>readSchedule(page('<form>Log ind</form>')),ReaderError);
});

test('lessons become calendar events that show Lectio\'s status',()=>{
 const [danish,maths,english]=readSchedule(page()).map(lessonToEvent);
 assert.deepEqual([danish.body.summary,danish.body.location,danish.body.start,danish.body.colorId],['3a Da','A12',{dateTime:'2026-10-05T08:15:00',timeZone:'Europe/Copenhagen'},undefined]);
 assert.match(danish.body.description,/^Lærer: Lene Madsen \(lm\)\n\nLektier:\n- Læs novellen side 12-30\n\nÅbn i Lectio: https:/);
 assert.equal(danish.body.source.title,'Lectio');
 assert.deepEqual([maths.body.summary,maths.body.colorId],['3a Ma · Prøve','10']);
 assert.match(maths.body.description,/^Ændret i Lectio\./);
 assert.deepEqual([english.body.summary,english.body.colorId,english.body.transparency],['Aflyst: 3a En','11','transparent']);
 assert.equal(english.body.extendedProperties.private.lxId,'absid:103');
 assert.notEqual(danish.hash,lessonToEvent({...readSchedule(page())[0],rooms:['A14']}).hash);
 assert.equal(lessonToEvent({id:'x',start:'5/10',end:'6/10'}),null);
 assert.equal(lessonToEvent({id:'x',start:'2026-10-05T08:00',end:'2026-10-05T09:00',href:'https://evil.example/'}).body.source,undefined);
});

test('the sync plan only touches its own events on the days that were read',()=>{
 const own=(id,lxId,date,lxHash='old')=>({id,start:{dateTime:`${date}T08:00:00+02:00`},extendedProperties:{private:{lxSource:'lectiomizer',lxId,lxHash}}});
 const desired=readSchedule(page()).map(lessonToEvent);
 const existing=[own('e1','absid:101','2026-10-05',desired[0].hash),own('e2','absid:102','2026-10-05'),own('e2b','absid:102','2026-10-05'),own('e9','absid:999','2026-10-06'),own('e8','absid:888','2026-10-20'),{id:'mine',start:{dateTime:'2026-10-05T12:00:00+02:00'}}];
 const plan=planSync(desired,existing,new Set(week41.dates));
 assert.deepEqual(plan.insert.map(e=>e.id),['absid:103','absid:104']);
 assert.deepEqual(plan.update.map(e=>[e.id,e.eventId]),[['absid:102','e2']]);
 assert.deepEqual(plan.remove,['e2b','e9']);
});

// A small in-memory Calendar API: enough of calendars and events for a sync.
function fakeGoogle(){
 const calendars=new Set();const events=new Map();let next=1;const calls=[];let failures=[];
 const reply=(status,body)=>({ok:status<300,status,json:async()=>body});
 async function fetch(href,{method,headers,body}){
  const u=new URL(href);const path=u.pathname.replace('/calendar/v3','');calls.push([method,path,headers.Authorization]);
  if(failures.length)return reply(...failures.shift());
  let m;
  if(method==='POST'&&path==='/calendars'){const id=`cal${next++}`;calendars.add(id);return reply(200,{id});}
  if((m=path.match(/^\/calendars\/([^/]+)$/)))return calendars.has(decodeURIComponent(m[1]))?reply(200,{id:m[1]}):reply(404,{error:{message:'Not Found'}});
  if((m=path.match(/^\/calendars\/([^/]+)\/events(?:\/(.+))?$/))){
   if(method==='GET'){const [key,value]=u.searchParams.get('privateExtendedProperty').split('=');return reply(200,{items:[...events.values()].filter(e=>e.extendedProperties?.private?.[key]===value)});}
   if(method==='POST'){const id=`ev${next++}`;events.set(id,{...JSON.parse(body),id});return reply(200,{id});}
   if(method==='PUT'){events.set(m[2],{...JSON.parse(body),id:m[2]});return reply(200,{id:m[2]});}
   if(method==='DELETE'){return events.delete(m[2])?reply(204):reply(410,{error:{message:'Gone'}});}
  }
  return reply(400,{error:{message:'unexpected '+method+' '+path}});
 }
 return {fetch,calendars,events,calls,fail:(...list)=>{failures=list;}};
}

test('syncing twice is a no-op, and changes in Lectio update the calendar',async()=>{
 const google=fakeGoogle();
 const client=createClient({getToken:async()=>'t',fetch:google.fetch,wait:async()=>{}});
 const calendarId=await ensureCalendar(client,'');
 google.events.set('mine',{id:'mine',summary:'Fødselsdag',start:{dateTime:'2026-10-05T18:00:00'}});
 const weeks=lessons=>[{dates:week41.dates,lessons}];
 const lessons=readSchedule(page());
 assert.deepEqual(await syncCalendar(client,{calendarId,weeks:weeks(lessons)}),{lessons:4,added:4,updated:0,removed:0});
 assert.deepEqual(await syncCalendar(client,{calendarId,weeks:weeks(lessons)}),{lessons:4,added:0,updated:0,removed:0});
 const moved=[{...lessons[0],rooms:['A14']},lessons[1],lessons[2]];
 assert.deepEqual(await syncCalendar(client,{calendarId,weeks:weeks(moved)}),{lessons:3,added:0,updated:1,removed:1});
 assert.deepEqual(await syncCalendar(client,{calendarId,weeks:weeks(moved),cancelled:false}),{lessons:2,added:0,updated:0,removed:1});
 assert.deepEqual([...google.events.values()].map(e=>e.summary).sort(),['3a Da','3a Ma · Prøve','Fødselsdag']);
 assert.equal(await ensureCalendar(client,calendarId),calendarId);
 assert.notEqual(await ensureCalendar(client,'deleted-calendar'),'deleted-calendar');
});

test('the client renews an expired token once and backs off when rate limited',async()=>{
 const google=fakeGoogle();const refreshes=[];
 const client=createClient({getToken:async({refresh})=>{refreshes.push(refresh);return refresh?'new':'old';},fetch:google.fetch,wait:async()=>{}});
 google.fail([401,{error:{message:'Invalid Credentials'}}],[429,{error:{errors:[{reason:'rateLimitExceeded'}]}}]);
 assert.ok((await client.request('POST','/calendars',{body:{summary:'Lectio'}})).id);
 assert.deepEqual(refreshes,[false,true,false]);
 google.fail([403,{error:{message:'Forbidden',errors:[{reason:'forbidden'}]}}]);
 await assert.rejects(client.request('GET','/calendars/x'),e=>e instanceof GoogleError&&e.status===403);
});

test('Google sign-in asks for the calendar scope and refuses a partial grant',async()=>{
 const flows=[];
 const identity=redirect=>({getRedirectURL:()=>'https://abc.extensions.allizom.org/',launchWebAuthFlow:async options=>{flows.push(options);if(redirect instanceof Error)throw redirect;return redirect;}});
 const scope=encodeURIComponent(`email ${CALENDAR_SCOPE}`);
 const auth=await authorize(identity(`https://abc.extensions.allizom.org/#access_token=tok&expires_in=3599&scope=${scope}`),'client',{interactive:true});
 assert.equal(auth.token,'tok');assert.ok(auth.expires>Date.now()+3500000);
 const asked=new URL(flows[0].url).searchParams;
 assert.deepEqual([asked.get('response_type'),asked.get('prompt'),asked.get('scope')],['token',null,`${CALENDAR_SCOPE} email`]);
 await authorize(identity(`https://abc.extensions.allizom.org/#access_token=tok&scope=${scope}`),'client',{interactive:false,hint:'elev@example.com'});
 assert.deepEqual([new URL(flows[1].url).searchParams.get('prompt'),new URL(flows[1].url).searchParams.get('login_hint'),flows[1].interactive],['none','elev@example.com',false]);
 await assert.rejects(authorize(identity('https://abc.extensions.allizom.org/#access_token=tok&scope=email'),'client',{interactive:true}),e=>e.reason==='scope');
 await assert.rejects(authorize(identity('https://abc.extensions.allizom.org/#error=access_denied'),'client',{interactive:true}),/afviste/);
 await assert.rejects(authorize(identity(new Error('Requires user interaction')),'client',{interactive:false}),e=>e.reconnect===true);
});

test('the content script reads the coming weeks once an hour and skips weeks it cannot read',async()=>{
 const now=new Date(2026,9,5,12).getTime();const sent=[];const loaded=[];
 const load=async href=>{loaded.push(new URL(href).searchParams.get('week'));if(href.includes('week=422026'))throw new Error('Lectio svarede 500');return page(schedulePage(),href);};
 const send=async message=>{sent.push(message);return {ok:true};};
 assert.deepEqual(await syncSchedule({scheduleHref:url,now,load,send}),{started:false});
 store.calendar={connected:true,weeks:3};
 const result=await syncSchedule({scheduleHref:url,now,load,send});
 assert.deepEqual([result.started,result.ok],[true,true]);
 assert.deepEqual(loaded.sort(),['412026','422026','432026']);
 // Week 43 got week 41's page back, so only week 41 is synced.
 assert.deepEqual([sent[0].weeks.length,sent[0].unread,sent[0].weeks[0].lessons.length],[1,2,4]);
 assert.equal(store.calendarStatus.state,'syncing');
 assert.deepEqual(await syncSchedule({scheduleHref:url,now:now+1000,load,send}),{started:false,busy:true});
 store.calendarStatus={state:'ok',checkedAt:now};
 assert.deepEqual(await syncSchedule({scheduleHref:url,now:now+60000,load,send}),{started:false});
 assert.equal((await syncSchedule({scheduleHref:url,now:now+60000,load,send,force:true})).started,true);
 store.calendarStatus={};
 const failed=await syncSchedule({scheduleHref:url,now,load:async()=>page('<form>Log ind</form>'),send});
 assert.deepEqual([failed.ok,store.calendarStatus.state,store.calendarStatus.checkedAt],[false,'error',now]);
});
