/* Liftlog: domain. Private implementation; explicit public interface. */
(function(namespace){
'use strict';
function createDomain({getState,save,notify=()=>{}}){
const {PARTS,SEED,EQUIPMENT,equipmentOf,DEFAULTS,SET_TYPES,TYPE_TAG,seedExercises}=namespace.catalog;
function validProgression(p){return !!p&&Number.isInteger(p.min)&&Number.isInteger(p.max)&&p.min>0&&p.max>=p.min&&p.max<=100&&Number.isInteger(p.sets)&&p.sets>0&&p.sets<=20&&Number.isFinite(p.step)&&p.step>0&&p.step<=100;}
function progressionTarget(exId,date){
 const ex=exById(exId),p=ex.progression;
 if(modeOf(ex)!=='weight'||!validProgression(p))return null;
 const dateKey=sortedDates().reverse().find(k=>k<date&&getState().workouts[k].finishedAt&&getState().workouts[k].items.some(it=>it.exId===exId));
 if(!dateKey)return {reason:'완료한 이전 운동 기록이 필요해요'};
 const items=getState().workouts[dateKey].items.filter(it=>it.exId===exId),fail=reason=>({date:dateKey,reason});
 if(items.length!==1)return fail('같은 날 중복된 종목은 목표를 계산하지 않아요');
 const sets=items[0].sets.filter(s=>!s.warm&&s.type!=='warm');
 if(sets.length!==p.sets)return fail('이전 본세트 수가 설정과 달라요');
 if(sets.some(s=>!s.done||s.type||String(s.kg).trim()===''||!Number.isFinite(Number(s.kg))||Number(s.kg)<=0||!Number.isInteger(Number(s.reps))||Number(s.reps)<=0))return fail('완료한 일반 본세트의 무게·횟수를 확인해주세요');
 const kg=Number(sets[0].kg);
 if(sets.some(s=>Number(s.kg)!==kg))return fail('세트마다 무게가 달라 목표를 계산하지 않아요');
 const increase=sets.every(s=>Number(s.reps)>=p.max);
 return {date:dateKey,kg:increase?Math.round((kg+p.step)*1000)/1000:kg,reps:sets.map(s=>increase?p.min:Math.max(p.min,Math.min(p.max,Number(s.reps)+1))),increase,previous:kg};
}
function normalize(state=getState()){
  state.version=1;
  state.settings=Object.assign({},DEFAULTS,state.settings||{});
  ['restSec','autoTimer','sound','vibrate'].forEach(k=>delete state.settings[k]);
  if(!Array.isArray(state.routines))state.routines=[];if(!state.workouts||typeof state.workouts!=='object')state.workouts={};
  Object.keys(state.workouts).forEach(k=>{const w=state.workouts[k];if(!w||!Array.isArray(w.items)){delete state.workouts[k];return;}w.date=k;normalizeDuration(w);w.items.forEach(it=>{delete it.restSec;if(!it.id)it.id=uid();if(!Array.isArray(it.sets))it.sets=[];it.sets.forEach(s=>{if(s.done==null)s.done=false;normSet(s);});if(it.memo==null)it.memo='';});});
  state.routines.forEach(r=>{if(!Array.isArray(r.items))r.items=[];r.items.forEach(ri=>{if(!Array.isArray(ri.sets))ri.sets=[];ri.sets.forEach(normSet);});});
  state.exercises.forEach(e=>{if(!validProgression(e.progression)||modeOf(e)!=='weight')delete e.progression;if(e.custom&&!EQUIPMENT[e.equipment])e.equipment='unknown';});
  // merge any new seed exercises added in later versions
  const have=new Set(state.exercises.map(e=>e.id));
  seedExercises().forEach(e=>{if(!have.has(e.id))state.exercises.push(e);});
}
/* 세트 타입: type ∈ ''(일반)|warm|drop|fail. 예전 데이터의 warm:true 는 type:'warm' 으로 올리고,
   SQL 뷰(liftlog_sets.warmup)와의 호환을 위해 warm 불리언은 type 과 항상 같이 유지한다. */
function normSet(s){
  if(s.type==null||!(s.type in SET_TYPES))s.type=s.warm?'warm':'';
  s.warm=s.type==='warm';
  if(s.rpe!=null&&!(s.rpe>=1&&s.rpe<=10))s.rpe=null;
}
function setType(s,t){s.type=t in SET_TYPES?t:'';s.warm=s.type==='warm';}
function copySet(s,keepDone){const o={kg:s.kg,reps:s.reps,done:!!(keepDone&&s.done),warm:!!s.warm,type:s.type||(s.warm?'warm':'')};return o;}
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
/* ===================== date utils ===================== */
const DOW=['일','월','화','수','목','금','토'];
const pad=n=>String(n).padStart(2,'0');
function dkey(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function parse(k){const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d);}
function todayKey(){return dkey(new Date());}
function addDays(k,n){const d=parse(k);d.setDate(d.getDate()+n);return dkey(d);}
function fmtDay(k){const d=parse(k);return (d.getMonth()+1)+'월 '+d.getDate()+'일 ('+DOW[d.getDay()]+')';}
function fmtShort(k){const d=parse(k);return (d.getMonth()+1)+'/'+d.getDate();}
function fmtTime(ts){const d=new Date(ts);return pad(d.getHours())+':'+pad(d.getMinutes());}
function daysBetween(a,b){return Math.round((parse(b)-parse(a))/86400000);}
function ago(k){const n=daysBetween(k,todayKey());return n===0?'오늘':n===1?'어제':n>1?n+'일 전':(-n)+'일 후';}
function weekStart(k){const d=parse(k);d.setDate(d.getDate()-d.getDay());return dkey(d);}
function monthStart(k){return k.slice(0,7)+'-01';}
function addMonths(k,n){const d=parse(k);return dkey(new Date(d.getFullYear(),d.getMonth()+n,1));}
const exById=id=>getState().exercises.find(e=>e.id===id)||{id,name:'(삭제된 운동)',part:'기타',mode:'weight'};
const num=v=>{const n=parseFloat(v);return isFinite(n)?n:0;};
/* 기록 방식(ex.mode) 기준 — 모든 화면·계산은 이 표를 따른다.
   weight: kg × 회. 볼륨 = kg×회, 1RM·강도·원판·PR(무게) 계산.
   reps  : 회만 기록(맨몸). kg 칸 없음, 데이터의 kg 는 무시. 볼륨 없음, PR·추이는 횟수 기준. 가중 맨몸운동은 weight 로.
   time  : 분 + 강도/거리. 세트의 kg 자리에 분, reps 자리에 강도/거리. 볼륨·1RM·PR 없음. 분석은 총 시간(분) 추이를 제공. */
const MODES={weight:{label:'무게 × 횟수',cols:['kg','회'],ph:['kg','회'],col:['kg','reps']},reps:{label:'횟수(맨몸) 기준',cols:['회'],ph:['회'],col:['reps']},time:{label:'시간(분) 기준',cols:['분','강도/거리'],ph:['분','km·레벨'],col:['min','dist']}};
const modeOf=ex=>MODES[ex.mode]?ex.mode:'weight';
const hasWeightItem=w=>w.items.some(it=>modeOf(exById(it.exId))==='weight');
function setVolume(ex,s){return (!s.done||s.warm||modeOf(ex)!=='weight')?0:num(s.kg)*num(s.reps);}
function itemVolume(it){const ex=exById(it.exId);return it.sets.reduce((a,s)=>a+setVolume(ex,s),0);}
function dayVolume(w){return w.items.reduce((a,it)=>a+itemVolume(it),0);}
function fmtKg(v){return Math.round(v).toLocaleString('ko-KR')+'kg';}
/* 하루 요약에 붙일 볼륨 글자. 무게 운동이 하루도 없으면 빈 문자열(0kg 를 보여주지 않는다) */
function dayVolText(w){return hasWeightItem(w)?fmtKg(dayVolume(w)):'';}
/* 운동 카드 메타의 종목 지표: weight 는 볼륨, reps 는 완료한 본세트 총 횟수, time 은 없음 */
function itemMetric(it){const ex=exById(it.exId),m=modeOf(ex);
  if(m==='weight')return {label:'종목 볼륨',value:fmtKg(itemVolume(it))};
  if(m==='reps')return {label:'완료 횟수',value:it.sets.reduce((a,s)=>a+(s.done&&!s.warm?num(s.reps):0),0)+'회'};
  return null;}
function partsOf(w){const seen=[];w.items.forEach(it=>{const p=exById(it.exId).part;if(!seen.includes(p))seen.push(p);});return seen;}
/* 캘린더용 하루 상태: ''(없음) | has(기록 있음, 미완료) | fin(운동 완료 또는 모든 세트 완료) */
function dayStatus(k){const w=getState().workouts[k];if(!w||!w.items.length)return '';if(w.finishedAt)return 'fin';const sets=w.items.flatMap(it=>it.sets);return sets.length&&sets.every(s=>s.done)?'fin':'has';}
function daySetCount(w){return {total:w.items.reduce((a,it)=>a+it.sets.filter(s=>!s.warm).length,0),done:w.items.reduce((a,it)=>a+it.sets.filter(s=>s.done&&!s.warm).length,0)};}
/* 세트 한 개를 글자로: weight 30×12, reps 12회, time 15분. 비어 있으면 '' */
function setText(mode,s){
  if(mode==='time')return s.kg===''?'':num(s.kg)+'분';
  if(mode==='reps')return s.reps===''?'':num(s.reps)+'회';
  if(s.kg===''&&s.reps==='')return '';
  return (s.warm?'W':'')+num(s.kg)+'×'+num(s.reps);
}
function sortedDates(){return Object.keys(getState().workouts).filter(k=>getState().workouts[k].items.length).sort();}
function lastRecord(exId,beforeKey){
  const ds=sortedDates().reverse();
  for(const k of ds){if(beforeKey&&k>=beforeKey)continue;const it=getState().workouts[k].items.find(i=>i.exId===exId);if(it&&it.sets.length){const done=it.sets.filter(s=>s.done);const src=done.length?done:it.sets;return {date:k,sets:src.map(s=>copySet(s))};}}
  return null;
}
function exerciseUsage(){
  const usage={};
  statsEntries('0000-01-01',todayKey()).forEach(day=>{
    const ids=new Set(day.items.map(({ex})=>ex.id));
    ids.forEach(id=>{const entry=usage[id]||(usage[id]={count:0,last:null});entry.count++;entry.last=day.date;});
  });
  return usage;
}
function lastDoneMap(){const m={};sortedDates().forEach(k=>getState().workouts[k].items.forEach(it=>{if(it.sets.some(s=>s.done))m[it.exId]=k;}));return m;}
function blankSets(n){return Array.from({length:n},()=>({kg:'',reps:'',done:false,warm:false,type:''}));}
function ensureWorkout(k){if(!getState().workouts[k])getState().workouts[k]={date:k,startedAt:null,finishedAt:null,durationMs:null,resumedAt:null,items:[]};return getState().workouts[k];}
function makeItem(exId,sets){return {id:uid(),exId,sets:sets||blankSets(3),memo:''};}
function addExercises(k,ids){const w=ensureWorkout(k);ids.forEach(id=>{const lr=lastRecord(id,k);w.items.push(makeItem(id,lr?lr.sets:blankSets(3)));});save();}
function loadRoutine(k,r){const w=ensureWorkout(k);r.items.forEach(ri=>{const lr=getState().settings.routineFill==='last'?lastRecord(ri.exId,k):null;const sets=lr?lr.sets:ri.sets.map(s=>copySet(s));w.items.push(makeItem(ri.exId,sets.length?sets:blankSets(3)));});r.lastUsed=k;save();}
function loadDay(k,src){const w=ensureWorkout(k);src.items.forEach(it=>w.items.push(makeItem(it.exId,it.sets.map(s=>copySet(s)))));save();}
function e1rm(kg,reps){return reps<=1?kg:kg*(1+reps/30);}
/* 종목 최고 추정 1RM (해당 날짜 이전 기록 기준). 없으면 0 */
function bestE1rm(exId,beforeKey){const s=sessionsOf(exId,beforeKey);return s.length?Math.max(...s.map(x=>x.e1rm)):0;}
/* 바벨 원판 계산: 한쪽에 올릴 원판 목록. 못 맞추는 나머지는 rem 으로 돌려준다 */
const PLATES=[25,20,15,10,5,2.5,1.25];
function platesFor(total,bar){let side=(num(total)-bar)/2;if(side<0)return {plates:[],rem:0,under:true};const out=[];for(const p of PLATES){while(side>=p-1e-9){out.push(p);side-=p;}}return {plates:out,rem:Math.round(side*100)/100,under:false};}
function isItemPR(it,dateKey){
  const mode=modeOf(exById(it.exId));if(mode==='time')return false;
  const prev=sessionsOf(it.exId,dateKey);if(!prev.length)return false;
  const done=it.sets.filter(s=>s.done&&!s.warm&&num(s.reps)>0);if(!done.length)return false;
  const prevMaxKg=mode==='weight'?Math.max(...prev.map(s=>s.maxKg)):0;
  if(prevMaxKg>0)return Math.max(...done.map(s=>num(s.kg)))>prevMaxKg;
  const prevMaxReps=Math.max(...prev.map(s=>s.maxReps));
  return Math.max(...done.map(s=>num(s.reps)))>prevMaxReps;
}
function statsEntries(start,end){
  return sortedDates().filter(date=>date>=start&&date<=end).map(date=>{
    const workout=getState().workouts[date],items=workout.items.map(it=>{
      const ex=exById(it.exId),mode=modeOf(ex);
      // Preserve explicit zero weight, but exclude missing or nonnumeric input.
      const sets=it.sets.filter(s=>s.done&&!s.warm&&(mode==='time'?num(s.kg)>0:num(s.reps)>0&&(mode!=='weight'||(String(s.kg??'').trim()!==''&&Number.isFinite(Number(s.kg))&&Number(s.kg)>=0))));
      return {ex,sets};
    }).filter(it=>it.sets.length);
    return {date,workout,items};
  }).filter(day=>day.items.length);
}
function statsSummary(entries){
  const out={days:entries.length,sets:0,volume:0,weightSets:0,durationMs:0,measuredDays:0,cardioMinutes:0,parts:{},lastParts:{}};
  entries.forEach(day=>{
    const duration=workoutDuration(day.workout);
    if(duration!=null){out.durationMs+=duration;out.measuredDays++;}
    day.items.forEach(({ex,sets})=>{
      const mode=modeOf(ex);
      if(mode==='time'){out.cardioMinutes+=sets.reduce((n,s)=>n+num(s.kg),0);return;}
      out.sets+=sets.length;out.parts[ex.part]=(out.parts[ex.part]||0)+sets.length;out.lastParts[ex.part]=day.date;
      if(mode==='weight'){out.weightSets+=sets.length;out.volume+=sets.reduce((n,s)=>n+num(s.kg)*num(s.reps),0);}
    });
  });
  return out;
}
function statsReport(range=28){
  const end=todayKey(),valid=statsEntries('0000-01-01',end);
  const start=range?addDays(end,1-range):(valid[0]?.date||end),days=daysBetween(start,end)+1;
  const previousEnd=addDays(start,-1),previousStart=addDays(start,-days);
  const entries=valid.filter(d=>d.date>=start),previousEntries=valid.filter(d=>d.date>=previousStart&&d.date<=previousEnd);
  // 7/28/84 days use day/week buckets. Long all-time histories stay legible in at most 12 buckets.
  const bucketDays=days<=7?1:days<=84?7:Math.ceil(days/12/7)*7,buckets=[];
  for(let i=0;i<days;i+=bucketDays){const first=addDays(start,i),last=addDays(start,Math.min(days-1,i+bucketDays-1));buckets.push({start:first,end:last,...statsSummary(entries.filter(d=>d.date>=first&&d.date<=last))});}
  return {start,end,previousStart,previousEnd,entries,current:statsSummary(entries),previous:statsSummary(previousEntries),bucketDays,buckets};
}
function statsExerciseSessions(exId,entries){
  return entries.flatMap(day=>{
    const sets=day.items.filter(it=>it.ex.id===exId).flatMap(it=>it.sets);if(!sets.length)return [];
    const mode=modeOf(exById(exId)),weight=mode==='weight';
    return [{date:day.date,sets:sets.length,maxKg:weight?Math.max(...sets.map(s=>num(s.kg))):0,maxReps:mode!=='time'?Math.max(...sets.map(s=>num(s.reps))):0,totalReps:mode!=='time'?sets.reduce((n,s)=>n+num(s.reps),0):0,
      e1rm:weight?Math.max(...sets.map(s=>e1rm(num(s.kg),num(s.reps)))):0,volume:weight?sets.reduce((n,s)=>n+num(s.kg)*num(s.reps),0):0,minutes:mode==='time'?sets.reduce((n,s)=>n+num(s.kg),0):0}];
  });
}
function statsChange(value,previous,unit){
  if(!previous)return value?'이전 기록 없음':'변화 없음';
  const delta=value-previous;if(!delta)return '변화 없음';
  return `${delta>0?'+':''}${Math.round(delta/previous*100)}% · ${delta>0?'+':''}${Math.round(delta*10)/10}${unit}`;
}
function statsNumber(value){return Number(value.toFixed(1)).toLocaleString('ko-KR');}
function statsDate(date){return date.replaceAll('-','.');}
function statsMetricOptions(mode){return mode==='time'?[['minutes','총 운동 시간','분']]:mode==='reps'?[['maxReps','세트 최고 횟수','회'],['totalReps','총 횟수','회']]:[['maxKg','최고 무게','kg'],['e1rm','추정 1RM','kg'],['volume','볼륨','kg']];}
function sessionsOf(exId,beforeKey){
  const ex=exById(exId),mode=modeOf(ex),out=[];if(mode==='time')return out;
  sortedDates().forEach(k=>{if(beforeKey&&k>=beforeKey)return;const it=getState().workouts[k].items.find(i=>i.exId===exId);if(!it)return;
    const sets=it.sets.filter(s=>s.done&&!s.warm&&num(s.reps)>0);if(!sets.length)return;
    // reps 모드는 데이터에 kg 가 남아 있어도(예전 기록·방식 변경) 무시한다
    const maxKg=mode==='weight'?Math.max(...sets.map(s=>num(s.kg))):0;const maxReps=Math.max(...sets.map(s=>num(s.reps)));const totalReps=sets.reduce((a,s)=>a+num(s.reps),0);
    const e=maxKg>0?Math.max(...sets.map(s=>e1rm(num(s.kg),num(s.reps)))):0;
    const top=maxKg>0?sets.find(s=>num(s.kg)===maxKg):sets.find(s=>num(s.reps)===maxReps);
    const summary=maxKg>0?(sets.length+'세트 · 최고 '+maxKg+'kg×'+num(top.reps)):(sets.length+'세트 · 최고 '+maxReps+'회 (총 '+totalReps+'회)');
    out.push({date:k,maxKg,maxReps,totalReps,e1rm:e,volume:maxKg>0?sets.reduce((a,s)=>a+num(s.kg)*num(s.reps),0):0,summary});});
  return out;
}
function niceStep(raw){if(raw<=0)return 5;const p=Math.pow(10,Math.floor(Math.log10(raw)));const r=raw/p;return (r<=1?1:r<=2?2:r<=5?5:10)*p;}
// durationMs is accumulated time; resumedAt is the current segment's wall-clock start.
// Persist timestamps rather than ticks so reloads and background suspension keep accurate time.
function normalizeDuration(w){
  const validTs=v=>Number.isFinite(v)&&v>0;
  if(!validTs(w.startedAt))w.startedAt=null;
  if(!validTs(w.finishedAt))w.finishedAt=null;
  if(!Object.prototype.hasOwnProperty.call(w,'durationMs')){
    // Old versions started timing when a routine was prepared. Only completed records
    // with timestamps on the workout date can be migrated without inventing a duration.
    w.durationMs=w.startedAt&&w.finishedAt>w.startedAt&&dkey(new Date(w.startedAt))===w.date?w.finishedAt-w.startedAt:null;
    w.resumedAt=null;
    if(!w.finishedAt)w.startedAt=null;
  }
  if(w.durationMs!=null&&(!Number.isFinite(w.durationMs)||w.durationMs<0))w.durationMs=null;
  if(!validTs(w.resumedAt)||w.finishedAt)w.resumedAt=null;
  if(w.resumedAt){if(!w.startedAt)w.startedAt=w.resumedAt;if(w.durationMs==null)w.durationMs=0;}
}
function workoutDuration(w,now=Date.now()){
  if(w.durationMs==null&&!w.resumedAt)return null;
  return (w.durationMs||0)+(w.resumedAt?Math.max(0,now-w.resumedAt):0);
}
function fmtDuration(ms){
  if(ms==null)return '미기록';
  const sec=Math.floor(ms/1000),h=Math.floor(sec/3600);
  return (h?pad(h)+':':'')+pad(Math.floor(sec/60)%60)+':'+pad(sec%60);
}
function startSession(w,now=Date.now()){
  if(w.resumedAt||w.finishedAt)return false;
  const active=Object.values(getState().workouts).find(x=>x!==w&&x.resumedAt);
  if(active){notify(fmtDay(active.date)+' 운동이 진행 중이에요. 먼저 완료하거나 일시정지하세요');return false;}
  if(!w.startedAt)w.startedAt=now;
  if(w.durationMs==null)w.durationMs=0;
  w.resumedAt=now;return true;
}
function pauseSession(w,now=Date.now()){
  if(!w.resumedAt)return;
  w.durationMs=workoutDuration(w,now);w.resumedAt=null;
}

return {validProgression,progressionTarget,normalize,normSet,setType,copySet,uid,DOW,pad,dkey,parse,todayKey,addDays,fmtDay,fmtShort,fmtTime,daysBetween,ago,weekStart,monthStart,addMonths,exById,num,MODES,modeOf,hasWeightItem,setVolume,itemVolume,dayVolume,fmtKg,dayVolText,itemMetric,partsOf,dayStatus,daySetCount,setText,sortedDates,lastRecord,exerciseUsage,lastDoneMap,blankSets,ensureWorkout,makeItem,addExercises,loadRoutine,loadDay,e1rm,bestE1rm,PLATES,platesFor,isItemPR,statsEntries,statsSummary,statsReport,statsExerciseSessions,statsChange,statsNumber,statsDate,statsMetricOptions,sessionsOf,niceStep,normalizeDuration,workoutDuration,fmtDuration,startSession,pauseSession};
}
Object.assign(namespace, {createDomain});
})(window.Liftlog=window.Liftlog||{});
