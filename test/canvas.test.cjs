const {test}=require('node:test'),a=require('node:assert/strict'),{parseIcs,fetchCanvas,fetchCanvasStatus,canvasUrl,windowed}=require('../src/canvas.cjs');
// Synthetic feed in the shape Canvas publishes: assignment UIDs, a bracketed course code, folded lines and escaped text.
const ICS=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Example LMS//EN',
 'BEGIN:VEVENT','UID:event-assignment-1001','DTSTART:20261024T035900Z','DTEND:20261024T035900Z','SUMMARY:Problem set 4\\, part A [COURSE 101 01 (FA26)]',
 'URL;VALUE=URI:https://lms.example.edu/calendar?include_contexts=course_55&month=10&year=2026#assignment_1001','END:VEVENT',
 'BEGIN:VEVENT','UID:event-assignment-override-1002','DTSTART;TZID=America/New_York:20261105T235900','SUMMARY:Essay draft with a very long title that the','  feed folds [COURSE 202]','DESCRIPTION:Write 1\\,000 words.\\nCite three sources.','END:VEVENT',
 'BEGIN:VEVENT','UID:event-calendar-event-77','DTSTART;VALUE=DATE:20261030','DTEND;VALUE=DATE:20261031','SUMMARY:Reading day [COURSE 101 01 (FA26)]','END:VEVENT',
 'BEGIN:VEVENT','UID:event-calendar-event-78','DTSTART;TZID=America/New_York:20261020T100000','DTEND;TZID=America/New_York:20261020T110000','SUMMARY:Section','END:VEVENT',
 'BEGIN:VEVENT','UID:event-floating','DTSTART:20261020T100000','SUMMARY:Floating time','END:VEVENT',
 'BEGIN:VEVENT','UID:event-assignment-1003','DTSTART:20230101T000000Z','SUMMARY:Old work [COURSE 101]','END:VEVENT','END:VCALENDAR'].join('\r\n');
const NOW=Date.parse('2026-10-22T12:00:00Z');

test('ICS parsing keeps Canvas assignment IDs, course codes, zones and all-day dates, and drops floating times',()=>{
 const items=parseIcs(ICS),by=Object.fromEntries(items.map(x=>[x.uid,x]));a.equal(items.length,5);a.equal(by['event-floating'],undefined);
 a.deepEqual(by['event-assignment-1001'],{uid:'event-assignment-1001',kind:'assignment',assignmentId:'1001',courseId:'55',course:'COURSE 101 01 (FA26)',title:'Problem set 4, part A',start:'2026-10-24T03:59:00Z',end:'2026-10-24T03:59:00Z',date:null,url:'https://lms.example.edu/calendar?include_contexts=course_55&month=10&year=2026#assignment_1001'});
 const essay=by['event-assignment-override-1002'];a.equal(essay.assignmentId,'1002');a.equal(essay.title,'Essay draft with a very long title that the feed folds');a.equal(essay.course,'COURSE 202');a.equal(essay.description,'Write 1,000 words.\nCite three sources.');
 a.equal(essay.start,'2026-11-06T04:59:00.000Z','EST after the November change');a.equal(by['event-calendar-event-78'].start,'2026-10-20T14:00:00.000Z','EDT before it');
 a.equal(by['event-calendar-event-77'].kind,'event');a.equal(by['event-calendar-event-77'].date,'2026-10-30');a.equal(by['event-calendar-event-77'].start,null);});

test('the feed is windowed around now and bounded',()=>{const ids=windowed(parseIcs(ICS),NOW).map(x=>x.uid);a.deepEqual(ids,['event-calendar-event-78','event-assignment-1001','event-calendar-event-77','event-assignment-override-1002']);});

test('fetching reports failures without the feed URL and needs https configuration',async()=>{
 const url='https://lms.example.edu/feeds/calendars/user_SECRETTOKEN.ics',ok=text=>async()=>({ok:true,status:200,headers:{get:()=>null},text:async()=>text});
 a.deepEqual(await fetchCanvas('',{now:NOW}),{status:'unconfigured',fetchedAt:'2026-10-22T12:00:00.000Z',items:[]});
 const good=await fetchCanvas(url,{fetch:ok(ICS),now:NOW});a.equal(good.status,'ok');a.equal(good.total,5);a.equal(good.items.length,4);
 for(const [f,msg] of [[async()=>({ok:false,status:401}),/HTTP 401/],[ok('<html>sign in</html>'),/not a calendar/],[async()=>{throw Object.assign(Error('x '+url),{name:'TimeoutError'});},/timed out/],[async()=>{throw Error('getaddrinfo '+url);},/could not be read/]]){
  const r=await fetchCanvas(url,{fetch:f,now:NOW});a.equal(r.status,'failed');a.match(r.error,msg);a.deepEqual(r.items,[]);a.doesNotMatch(JSON.stringify(r),/SECRETTOKEN/);}
 a.equal(canvasUrl(''),'');a.throws(()=>canvasUrl('http://lms.example.edu/feed.ics'),/https/);a.equal(canvasUrl(url),url);});

test('the optional token reads planner flags with GET only, follows same-host pages and never reports the token',async()=>{
 const token='SECRET-CANVAS-TOKEN',calls=[];
 const pages={'/api/v1/planner/items':[[{plannable_type:'assignment',plannable_id:1001,plannable:{points_possible:10},submissions:{submitted:true,excused:false,graded:false,missing:false}},{plannable_type:'quiz',plannable_id:9,plannable:{assignment_id:1002,points_possible:5},submissions:false},{plannable_type:'calendar_event',plannable_id:5,plannable:{}}],'<https://lms.example.edu/api/v1/planner/items?page=2>; rel="next"'],
  '/api/v1/planner/items?page=2':[[{plannable_type:'discussion_topic',plannable_id:3,plannable:{assignment_id:1003,points_possible:null},submissions:{excused:true}}],'<https://evil.example.com/next>; rel="next"']};
 const f=async(url,opts)=>{calls.push({url,opts});const u=new URL(url),k=u.searchParams.has('page')?u.pathname+'?page=2':u.pathname,[body,link]=pages[k];return {ok:true,status:200,headers:{get:h=>h==='link'?link:null},text:async()=>JSON.stringify(body)};};
 const r=await fetchCanvasStatus('https://lms.example.edu',token,{fetch:f,now:NOW});a.equal(r.status,'ok');
 a.deepEqual(r.items,[{assignmentId:'1001',submitted:true,excused:false,graded:false,missing:false,points:10},{assignmentId:'1002',submitted:false,excused:false,graded:false,missing:false,points:5},{assignmentId:'1003',submitted:false,excused:true,graded:false,missing:false,points:null}]);
 a.equal(calls.length,2,'the off-host next page is not followed');a.ok(calls.every(c=>!c.opts.method&&c.opts.headers.Authorization==='Bearer '+token));a.match(calls[0].url,/start_date=2026-10-08&end_date=2027-04-20/);
 a.deepEqual(await fetchCanvasStatus('https://lms.example.edu','',{fetch:f}),{status:'unconfigured'});
 const refused=await fetchCanvasStatus('https://lms.example.edu',token,{fetch:async()=>({ok:false,status:401}),now:NOW});a.equal(refused.status,'failed');a.match(refused.error,/refused the access token/);a.doesNotMatch(JSON.stringify(refused),/SECRET/);
 const ics=['BEGIN:VCALENDAR','BEGIN:VEVENT','UID:event-assignment-1001','DTSTART:20261024T035900Z','SUMMARY:A [C]','END:VEVENT','END:VCALENDAR'].join('\r\n');
 const both=await fetchCanvas('https://lms.example.edu/feeds/calendars/user_X.ics',{token,now:NOW,fetch:async(url,opts)=>/planner/.test(url)?f(url,opts):{ok:true,status:200,headers:{get:()=>null},text:async()=>ics}});
 a.equal(both.submissions.status,'ok');a.equal(both.submissions.items.length,3);a.doesNotMatch(JSON.stringify(both),/SECRET/);
 a.equal((await fetchCanvas('https://lms.example.edu/feeds/calendars/user_X.ics',{now:NOW,fetch:async()=>({ok:true,status:200,headers:{get:()=>null},text:async()=>ics})})).submissions,undefined,'no token, no planner read');});
