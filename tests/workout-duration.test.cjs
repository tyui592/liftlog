const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

// Run the actual app script with a minimal DOM and a controlled wall clock.
// No cloud account or browser storage belonging to the user is accessed.
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/app.html'),'utf8');
const script=[...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
function app(initial,currentTime=new Date(2026,9,28,18).getTime()){
  let now=currentTime,timerId=0;
  const nodes=new Map(),events={},windowEvents={},storage=new Map();
  if(initial)storage.set('liftlog.v1',JSON.stringify(initial));
  const node=selector=>{
    if(!nodes.has(selector))nodes.set(selector,{
      innerHTML:'',textContent:'',value:'',hidden:false,style:{},dataset:{},addEventListener(){},
      classList:{toggle(){},add(){},remove(){}},contains(){return false;},
      querySelector(q){return q==='.actionbar'&&this.innerHTML.includes('class="actionbar"')?{}:null;}
    });
    return nodes.get(selector);
  };
  const document={hidden:false,activeElement:null,body:node('body'),
    querySelector:node,querySelectorAll:()=>[],getElementById:id=>node('#'+id),
    addEventListener:(name,fn)=>(events[name]??=[]).push(fn)};
  const window={scrollY:0,scrollTo(){},addEventListener:(name,fn)=>windowEvents[name]=fn};
  class Clock extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
  const context={document,window,navigator:{},Date:Clock,console,
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    setTimeout:()=>++timerId,clearTimeout(){},setInterval(){}};
  vm.createContext(context);
  const exposed=script.replace('window.__liftlog={','window.__liftlog={normalize,ensureWorkout,addExercises,loadRoutine,loadDay,render,renderSession,renderSettings,workoutDuration,fmtDuration,startSession,pauseSession,flushSave,durationBox,snapshot,V,');
  vm.runInContext(exposed,context);
  const api=window.__liftlog;
  return {api,node,storage,document,
    advance:ms=>now+=ms,now:()=>now,
    click(act){const b={dataset:{act},closest:()=>null};for(const fn of events.click||[])fn({target:{closest:()=>b}});},
    event(name){for(const fn of events[name]||[])fn();},
    pagehide(){windowEvents.pagehide();}};
}
function workout(a){a.api.addExercises(a.api.todayKey(),['ex000']);return a.api.S.workouts[a.api.todayKey()];}
function legacy(start,end){return {version:1,exercises:[],routines:[],settings:{restSec:90,autoTimer:true,sound:true,vibrate:true},workouts:{'2026-10-27':{startedAt:start,finishedAt:end,items:[{exId:'ex000',restSec:120,sets:[{kg:'60',reps:'10',done:true}]}]}}};}

test('preparing exercises, routines, and copied days does not start timing',()=>{
  const a=app(),w=workout(a);assert.equal(w.startedAt,null);assert.equal(a.api.workoutDuration(w),null);
  a.advance(3600000);assert.equal(a.api.workoutDuration(w),null);
  const routine={items:[{exId:'ex001',sets:[{kg:20,reps:10}]}]};
  a.api.loadRoutine(a.api.todayKey(),routine);a.api.loadDay(a.api.todayKey(),{items:[{exId:'ex002',sets:[]}]});
  assert.equal(w.startedAt,null);assert.ok(!('restSec' in w.items[0]));
});
test('pause and resume exclude gaps, finish freezes time, reopening preserves it',()=>{
  const a=app(),w=workout(a);a.click('session-start');a.advance(600000);assert.equal(a.api.workoutDuration(w),600000);
  a.click('session-pause');a.advance(3600000);assert.equal(a.api.workoutDuration(w),600000);
  a.click('session-start');a.advance(300000);a.click('finish');
  assert.equal(w.durationMs,900000);assert.equal(w.resumedAt,null);assert.ok(w.finishedAt);
  a.advance(7200000);a.click('finish');assert.equal(w.finishedAt,null);assert.equal(a.api.workoutDuration(w),900000);
  a.click('session-start');a.advance(10000);a.click('finish');assert.equal(w.durationMs,910000);
});
test('running timestamps survive persistence and reload without lost or doubled time',()=>{
  const a=app(),w=workout(a);a.click('session-start');a.advance(123000);a.api.flushSave();
  const saved=JSON.parse(a.storage.get(a.api.KEY));
  const b=app(saved,a.now()),restored=b.api.S.workouts[b.api.todayKey()];b.advance(456000);
  assert.equal(b.api.workoutDuration(restored),579000);
  b.click('finish');assert.equal(restored.durationMs,579000);
  const c=app(JSON.parse(b.storage.get(b.api.KEY)),b.now());c.advance(900000);
  assert.equal(c.api.workoutDuration(c.api.S.workouts[c.api.todayKey()]),579000);
  assert.equal(a.api.workoutDuration(w),123000);
});
test('midnight does not reset elapsed time and only one date can run',()=>{
  const a=app(),w=workout(a);a.click('session-start');a.advance(8*3600000);
  assert.equal(a.api.workoutDuration(w),8*3600000);
  const other=a.api.ensureWorkout(a.api.todayKey());assert.equal(a.api.startSession(other),false);
  a.click('session-pause');a.click('session-start');assert.ok(w.resumedAt);
  a.api.pauseSession(w);assert.equal(a.api.startSession(other),true);
});
test('legacy completed time migrates; uncompleted or mismatched dates stay unmeasured',()=>{
  const start=new Date(2026,9,27,18).getTime();
  const a=app(legacy(start,start+4200000)),w=a.api.S.workouts['2026-10-27'];
  assert.equal(w.durationMs,4200000);assert.equal(a.api.fmtDuration(w.durationMs),'01:10:00');
  assert.equal(w.items[0].sets[0].kg,'60');assert.equal(w.items[0].sets[0].done,true);
  assert.ok(!('restSec' in w.items[0]));assert.ok(!('restSec' in a.api.S.settings));assert.ok(!('sound' in a.api.S.settings));
  a.api.normalize();assert.equal(w.durationMs,4200000);
  for(const data of [legacy(start,null),legacy(start,start-1),legacy(start+86400000,start+90000000)]){
    const b=app(data);assert.equal(b.api.workoutDuration(b.api.S.workouts['2026-10-27']),null);
  }
});
test('manual input validates and supports historical records, including measured zero',()=>{
  const a=app(),w=workout(a);a.api.durationBox(w);
  a.node('#duration-min').value='70';a.node('#duration-sec').value='30';a.node('#duration-ok').onclick();
  assert.equal(w.durationMs,4230000);assert.equal(w.resumedAt,null);
  a.node('#duration-sec').value='60';a.node('#duration-ok').onclick();assert.equal(w.durationMs,4230000);
  a.node('#duration-min').value='';a.node('#duration-sec').value='0';a.node('#duration-ok').onclick();assert.equal(w.durationMs,4230000);
  a.node('#duration-min').value='0';a.node('#duration-ok').onclick();assert.equal(w.durationMs,0);assert.equal(a.api.fmtDuration(w.durationMs),'00:00');
  assert.ok(!a.api.renderSession(w,'2026-10-27').includes('data-act="session-start"'));
  assert.equal(a.api.snapshot()['w:'+a.api.todayKey()].durationMs,0);
});
test('editing a running duration resets its checkpoint without counting time twice',()=>{
  const a=app(),w=workout(a);a.click('session-start');a.advance(10000);a.api.durationBox(w);
  a.node('#duration-min').value='5';a.node('#duration-sec').value='0';a.node('#duration-ok').onclick();
  a.advance(20000);a.click('finish');assert.equal(w.durationMs,320000);
});
test('background and page exit flush pending set edits to storage',()=>{
  const a=app(),w=workout(a);w.items[0].sets[0].kg='80';a.api.save();a.document.hidden=true;a.event('visibilitychange');
  assert.equal(JSON.parse(a.storage.get(a.api.KEY)).workouts[w.date].items[0].sets[0].kg,'80');
  w.items[0].sets[0].kg='85';a.api.save();a.pagehide();
  assert.equal(JSON.parse(a.storage.get(a.api.KEY)).workouts[w.date].items[0].sets[0].kg,'85');
});
test('removing the final exercise keeps a measured session accessible',()=>{
  const a=app(),w=workout(a);a.click('session-start');w.items=[];a.api.render();
  assert.match(a.node('#app').innerHTML,/id="workout-duration"/);assert.match(a.node('#app').innerHTML,/data-act="finish"/);
});
test('rest controls are absent from both exercise cards and settings',()=>{
  const a=app();workout(a);a.api.render();
  assert.doesNotMatch(a.node('#app').innerHTML,/data-act="rest"|휴식 타이머/);
  assert.doesNotMatch(a.api.renderSettings(),/기본 휴식|알림음|data-k="vibrate"|data-k="autoTimer"/);
});

test('merged monthly calendar, daily note, and completed summary remain intact',()=>{
  const a=app(),w=workout(a);w.note='오늘도 꾸준히';a.click('session-start');a.advance(70000);a.click('finish');
  const html=a.node('#app').innerHTML;
  assert.match(html,/class="cal"/);assert.match(html,/오늘도 꾸준히/);assert.match(html,/수행 운동 정보/);
  assert.match(html,/01:10/);assert.equal((html.match(/id="workout-duration"/g)||[]).length,1);
  assert.doesNotMatch(html,/data-kg="0"/);assert.equal(a.api.S.settings.calView,'month');
  a.click('finish');assert.match(a.node('#app').innerHTML,/data-kg="0"/);
  assert.equal(a.api.workoutDuration(w),70000);
});
test('merged reps-only inputs still ignore weight and legacy unknown time stays unmeasured',()=>{
  const a=app(),w=workout(a);a.api.S.exercises.find(e=>e.id==='ex000').mode='reps';
  Object.assign(w.items[0].sets[0],{kg:'100',reps:'10',done:true});a.api.render();
  assert.doesNotMatch(a.node('#app').innerHTML,/data-kg=/);assert.match(a.node('#app').innerHTML,/data-reps=/);
  const start=new Date(2026,9,27,18).getTime(),b=app(legacy(start,start));
  assert.equal(b.api.workoutDuration(b.api.S.workouts['2026-10-27']),null);
});
