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
