const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/app.html'),'utf8');
const script=[...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
// The real app runs in isolated storage and a fixed local date; no cloud or user data.
function app(workouts={},exercises=[]){
  const nodes=new Map(),listeners={};
  const node=s=>{if(!nodes.has(s))nodes.set(s,{innerHTML:'',value:'',style:{},dataset:{},classList:{toggle(){},add(){},remove(){}},addEventListener(){},querySelector(){return null;}});return nodes.get(s);};
  const document={body:node('body'),querySelector:node,querySelectorAll:()=>[],getElementById:id=>node('#'+id),addEventListener:(n,f)=>(listeners[n]??=[]).push(f)};
  const window={scrollY:0,scrollTo(){},addEventListener(){}};
  class Clock extends Date{constructor(...args){super(...(args.length?args:[2026,10,3,18]));}static now(){return new Clock().getTime();}}
  const initial={version:1,workouts,exercises,routines:[],settings:{}};
  const context={document,window,Date:Clock,navigator:{},console,localStorage:{getItem:k=>k==='liftlog.v1'?JSON.stringify(initial):null,setItem(){},removeItem(){}},setTimeout(){},clearTimeout(){},setInterval(){}};
  vm.createContext(context);
  // Lexical functions are accessed through the VM, without adding production debug APIs.
  vm.runInContext(script.replace('window.__liftlog={','window.__analysisEval=code=>eval(code);window.__liftlog={'),context);
  return {run:code=>window.__analysisEval(code),node,click(data){const b={dataset:data,closest:()=>null};for(const f of listeners.click||[])f({target:{closest:()=>b}});}};
}
const set=(kg,reps,extra={})=>({kg,reps,done:true,...extra});
const item=(exId,sets)=>({exId,sets});
const day=(items,extra={})=>({items,...extra});
const custom=[{id:'cxreps',name:'테스트 맨몸',part:'등',mode:'reps',custom:true},{id:'cxtime',name:'테스트 달리기',part:'유산소',mode:'time',custom:true}];

test('rolling periods include their boundaries and compare the immediately preceding equal period',()=>{
  const a=app({'2026-10-06':day([item('ex000',[set(10,10)])]),'2026-10-07':day([item('ex000',[set(20,10)])]),'2026-11-03':day([item('ex000',[set(30,10)])]),'2026-11-04':day([item('ex000',[set(999,99)])])});
  assert.equal(a.run('statsReport(28).start'),'2026-10-07');
  assert.equal(a.run('statsReport(28).previousEnd'),'2026-10-06');
  assert.equal(a.run('statsReport(28).current.days'),2);
  assert.equal(a.run('statsReport(28).previous.days'),1);
  assert.equal(a.run('statsReport(28).current.volume'),500);
  assert.equal(a.run('statsReport(7).start'),'2026-10-28');
  assert.equal(a.run('statsReport(84).start'),'2026-08-12');
});

test('only completed valid working sets count; reps ignore legacy kg and timed work uses minutes',()=>{
  const a=app({'2026-11-03':day([item('ex000',[set(50,10),set(500,10,{warm:true}),set(90,10,{done:false}),set('', ''),set(-10,10)]),item('cxreps',[set(999,12)]),item('cxtime',[set(15,'')])]),'2026-11-02':day([item('ex001',[set(50,10,{done:false})])])},custom);
  assert.equal(a.run('statsReport(28).current.days'),1);
  assert.equal(a.run('statsReport(28).current.sets'),2);
  assert.equal(a.run('statsReport(28).current.volume'),500);
  assert.equal(a.run('statsReport(28).current.cardioMinutes'),15);
  assert.equal(a.run('statsReport(28).current.parts["등"]'),1);
  assert.equal(a.run('statsReport(28).current.parts["유산소"]||0'),0);
});

test('unmeasured duration stays unknown and measured zero remains a recorded duration',()=>{
  const a=app({'2026-11-03':day([item('ex000',[set(50,10)])],{durationMs:null}),'2026-11-02':day([item('ex000',[set(50,10)])],{durationMs:0}),'2026-11-01':day([item('ex000',[set(50,10)])],{durationMs:1800000})});
  assert.equal(a.run('statsReport(28).current.measuredDays'),2);
  assert.equal(a.run('statsReport(28).current.durationMs'),1800000);
});

test('exercise sessions combine duplicate items on the same date and respect each recording mode',()=>{
  const a=app({'2026-11-03':day([item('ex000',[set(50,10)]),item('ex000',[set(60,5)]),item('cxreps',[set(800,12),set(999,8)]),item('cxtime',[set(15,''),set(5,9)])])},custom);
  assert.equal(a.run('statsExerciseSessions("ex000",statsReport(28).entries).length'),1);
  assert.equal(a.run('statsExerciseSessions("ex000",statsReport(28).entries)[0].volume'),800);
  assert.equal(a.run('statsExerciseSessions("ex000",statsReport(28).entries)[0].sets'),2);
  assert.equal(a.run('statsExerciseSessions("cxreps",statsReport(28).entries)[0].totalReps'),20);
  assert.equal(a.run('statsExerciseSessions("cxreps",statsReport(28).entries)[0].volume'),0);
  assert.equal(a.run('statsExerciseSessions("cxtime",statsReport(28).entries)[0].minutes'),20);
});

test('all-time and empty reports have safe boundaries and no invented percentage',()=>{
  const a=app();
  assert.equal(a.run('statsReport(0).current.days'),0);
  assert.equal(a.run('statsReport(0).start'),'2026-11-03');
  assert.equal(a.run('statsChange(5,0,"세트")'),'이전 기록 없음');
  assert.equal(a.run('statsChange(0,0,"세트")'),'변화 없음');
  assert.match(a.run('statsChange(5,10,"세트")'),/-50%/);
  assert.match(a.run('renderStats()'),/아직 완료한 기록이 없어요/);
  const b=app({'2024-01-01':day([item('ex000',[set(20,10)])]),'2026-11-04':day([item('ex000',[set(50,10)])])});
  assert.equal(b.run('statsReport(0).start'),'2024-01-01');
  assert.equal(b.run('statsReport(0).current.days'),1);
});

test('trend buckets conserve days, sets and volume and never include the prior period',()=>{
  const a=app({'2026-10-06':day([item('ex000',[set(999,10)])]),'2026-10-07':day([item('ex000',[set(20,10)])]),'2026-11-03':day([item('ex000',[set(30,10)])])});
  assert.equal(a.run('statsReport(28).buckets.length'),4);
  assert.equal(a.run('statsReport(28).buckets.reduce((n,b)=>n+b.volume,0)'),500);
  assert.equal(a.run('statsReport(28).buckets.reduce((n,b)=>n+b.days,0)'),2);
  assert.equal(a.run('statsReport(28).buckets.reduce((n,b)=>n+b.sets,0)'),2);
});

test('analysis controls change the period and metric and history opens the recorded date',()=>{
  const a=app({'2026-11-03':day([item('ex000',[set(50,10)])])});
  a.run('V.tab="stats";render()');
  a.click({act:'stat-range',v:'7'});
  assert.equal(a.run('V.statRange'),7);
  a.click({act:'stat-metric',v:'volume'});
  assert.equal(a.run('V.statMetric'),'volume');
  a.click({act:'stat-day',date:'2026-11-03'});
  assert.equal(a.run('V.tab'),'today');
  assert.equal(a.run('V.date'),'2026-11-03');
});

test('missing or invalid weight is excluded while explicitly entered zero remains a valid record',()=>{
  const a=app({'2026-11-03':day([item('ex000',[set('',10),set('.',10),set('abc',10),set(0,10)])]),'2026-11-02':day([item('ex000',[set('',10)])])});
  assert.equal(a.run('statsReport(28).current.days'),1);
  assert.equal(a.run('statsReport(28).current.sets'),1);
  assert.equal(a.run('statsExerciseSessions("ex000",statsReport(28).entries).length'),1);
});

test('deleted exercise records appear in the other body-part row so the breakdown reconciles',()=>{
  const a=app({'2026-11-03':day([item('cxdeleted',[set(50,10)])])});
  assert.equal(a.run('statsReport(28).current.parts["기타"]'),1);
  assert.match(a.run('renderStats()'),/<strong>기타<\/strong>/);
});


test('starter routines resolve fixed exercise IDs and create independent editable drafts',()=>{
  const a=app();
  assert.equal(a.run('typeof starterRoutine'),'function');
  assert.equal(a.run('STARTER_PLANS.length'),4);
  assert.equal(a.run('STARTER_PLANS.flatMap(p=>p.sessions).length'),8);
  assert.equal(a.run('STARTER_PLANS.every(p=>p.sessions.every((s,i)=>starterRoutine(p.id,i).items.every(it=>S.exercises.some(e=>e.id===it.exId)&&it.sets.every(s=>s.kg===String()&&!s.done&&!s.warm))))'),true);
  a.run("window.draft=starterRoutine('full',0);window.draft.items[0].sets[0].reps='99'");
  assert.equal(a.run("starterRoutine('full',0).items[0].sets[0].reps"),'10');
  assert.equal(a.run('S.routines.length'),0);
  assert.equal(a.run('Object.keys(S.workouts).length'),0);
  assert.equal(a.run("starterRoutine('missing',0)"),null);
  assert.equal(a.run("starterRoutine('full',99)"),null);
});

test('routine muscle preview excludes warmups and combines exercises in the same part',()=>{
  const a=app();
  assert.equal(a.run('typeof routineParts'),'function');
  const result=JSON.parse(a.run(`JSON.stringify(routineParts({items:[{exId:'ex000',sets:[{warm:true},{warm:false},{type:'warm'}]},{exId:'ex001',sets:[{},{}]},{exId:'ex010',sets:[{}]}]}))`));
  assert.deepEqual(result,[{part:'하체',sets:3},{part:'가슴',sets:1}]);
});

test('progression increases load only on full upper-bound success and otherwise increases reps',()=>{
 const a=app({'2026-11-02':day([item('ex000',[set(40,12),set(40,12),set(40,12)])],{finishedAt:1})});
 a.run("S.exercises[0].progression={min:8,max:12,sets:3,step:2.5}");
 assert.equal(a.run("progressionTarget('ex000','2026-11-03').kg"),42.5);
 assert.equal(a.run("progressionTarget('ex000','2026-11-03').reps.join(',')"),'8,8,8');
 a.run("S.workouts['2026-11-02'].items[0].sets[1].reps=9");
 assert.equal(a.run("progressionTarget('ex000','2026-11-03').kg"),40);
 assert.equal(a.run("progressionTarget('ex000','2026-11-03').reps.join(',')"),'12,10,12');
 for(const code of ["sets[0].done=false","sets[0].kg=41","sets[0].type='fail'","sets[0].reps='' "]){
  const b=app({'2026-11-02':day([item('ex000',[set(40,12),set(40,12),set(40,12)])],{finishedAt:1})});
  b.run("S.exercises[0].progression={min:8,max:12,sets:3,step:2.5};S.workouts['2026-11-02'].items[0]."+code);
  assert.ok(b.run("progressionTarget('ex000','2026-11-03').reason"));
 }
});
test('equipment mapping and compound picker filters retain selected IDs',()=>{
 const a=app();
 assert.equal(a.run("equipmentOf(exById('ex059'))"),'machine');
 assert.equal(a.run("equipmentOf(exById('ex113'))"),'other');
 assert.equal(a.run("equipmentOf({custom:true})"),'unknown');
 a.run("openPicker('day');P.part='가슴';P.q='프레스';P.equipment=['dumbbell'];P.selected=['ex000']");
 assert.equal(a.run('pickerExercises().length'),2);
 assert.equal(a.run("P.selected.join(',')"),'ex000');
});

test('progression application preserves warmup and completed sets and supports guarded undo',()=>{
 const a=app({'2026-11-02':day([item('ex000',[set(40,12),set(40,12),set(40,12)])],{finishedAt:1})});
 a.run("S.exercises[0].progression={min:8,max:12,sets:3,step:2.5};window.w=ensureWorkout(todayKey());window.it=makeItem('ex000',[{kg:'20',reps:'10',warm:true,type:'warm',done:true},{kg:'40',reps:'12',done:true},...blankSets(2)]);window.w.items.push(window.it)");
 assert.equal(a.run('applyProgression(window.it,todayKey())'),true);
 assert.equal(a.run("window.it.sets.map(s=>s.kg).join(',')"),'20,40,42.5,42.5');
 assert.equal(a.run('undoProgression(window.it,todayKey())'),true);
 assert.equal(a.run('window.it.sets[2].kg'),'');
 a.run("applyProgression(window.it,todayKey());window.it.sets[2].reps='9'");
 assert.equal(a.run('undoProgression(window.it,todayKey())'),false);
 a.run('window.w.finishedAt=1');assert.equal(a.run('applyProgression(window.it,todayKey())'),false);
 assert.equal(a.run("applyProgression(window.it,'2026-11-02')"),false);
});
test('progression skips duplicates, ignores warmups, and survives normalize and remote round trips',()=>{
 const a=app();
 a.run("S.exercises[0].progression={min:8,max:12,sets:3,step:2.5}");
 assert.ok(a.run("progressionTarget('ex000',todayKey()).reason"));
 a.run("S.workouts['2026-11-02']={finishedAt:1,items:[makeItem('ex000',[{kg:'10',reps:'5',done:true,warm:true},...Array.from({length:3},()=>({kg:'40',reps:'12',done:true}))])]};normalize()");
 assert.equal(a.run("progressionTarget('ex000',todayKey()).kg"),42.5);
 a.run("applyRemote('exercises',JSON.parse(JSON.stringify(S.exercises)));normalize()");
 assert.equal(a.run('S.exercises[0].progression.step'),2.5);
 a.run("S.workouts['2026-11-02'].items.push(makeItem('ex000',blankSets(3)))");
 assert.ok(a.run("progressionTarget('ex000',todayKey()).reason"));
 a.run("S.exercises[0].mode='reps';normalize()");assert.equal(a.run('S.exercises[0].progression'),undefined);
 assert.equal(a.run('Object.values(EQUIPMENT_IDS).flat().length'),120);
 assert.equal(a.run('new Set(Object.values(EQUIPMENT_IDS).flat()).size'),120);
});

test('exercise frequency counts distinct performed dates, excludes invalid warmup future and unfinished sets',()=>{
 const a=app({'2026-11-01':day([item('ex000',[set(40,10)]),item('ex000',[set(40,10)])]),'2026-11-02':day([item('ex000',[set(40,10,{warm:true})]),item('ex001',[set(40,10)])]),'2026-11-03':day([item('ex000',[set('',10)]),item('ex001',[set(40,10,{done:false})]),item('cxreps',[set('',12)]),item('cxtime',[set(15,'')])]),'2026-11-04':day([item('ex000',[set(40,10)])])},custom);
 assert.equal(a.run("exerciseUsage().ex000.count"),1);
 assert.equal(a.run("exerciseUsage().ex000.last"),'2026-11-01');
 assert.equal(a.run("exerciseUsage().cxreps.count"),1);
 assert.equal(a.run("exerciseUsage().cxtime.count"),1);
 a.run("openPicker('day');P.part='전체';P.sort='frequency'");
 assert.equal(a.run("sortedPickerExercises().findIndex(e=>e.id==='ex001')<sortedPickerExercises().findIndex(e=>e.id==='ex000')"),true);
 assert.equal(a.run("sortedPickerExercises().findIndex(e=>e.id==='ex000')<sortedPickerExercises().findIndex(e=>e.id==='ex002')"),true);
});
