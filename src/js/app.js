(function(){
'use strict';
const {PARTS,SEED,EQUIPMENT,equipmentOf,DEFAULTS,SET_TYPES,TYPE_TAG,seedExercises}=window.Liftlog.catalog;
const {EX_ART,ART_META}=window.Liftlog.artwork;
const domain=window.Liftlog.createDomain({getState:()=>S,save,notify:toast});
const {validProgression,progressionTarget,normalize,normSet,setType,copySet,uid,DOW,pad,dkey,parse,todayKey,addDays,fmtDay,fmtShort,fmtTime,daysBetween,ago,weekStart,monthStart,addMonths,exById,num,MODES,modeOf,hasWeightItem,setVolume,itemVolume,dayVolume,fmtKg,dayVolText,itemMetric,partsOf,dayStatus,daySetCount,setText,sortedDates,lastRecord,exerciseUsage,lastDoneMap,blankSets,ensureWorkout,makeItem,addExercises,loadRoutine,loadDay,e1rm,bestE1rm,PLATES,platesFor,isItemPR,statsEntries,statsSummary,statsReport,statsExerciseSessions,statsChange,statsNumber,statsDate,statsMetricOptions,sessionsOf,niceStep,normalizeDuration,workoutDuration,fmtDuration,startSession,pauseSession}=domain;
const storage=window.Liftlog.createStorage({storage:{getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)},key:'liftlog.v1'});
const cloud=window.Liftlog.createSync({getState:()=>S,storage,normalize,persist,flushLocal:flushSave,commitRemote,notify:toast,onStatus:()=>{if(V.tab==='settings')render();else renderTabbar();},onData:render,getConfig:()=>window.LIFTLOG_SUPABASE,getSDK:()=>window.supabase});
const {C,loadSync,saveSync,snapshot,markLocalChanges,applyRemote,initClient,sync}=cloud;
/* ===================== data ===================== */
const KEY='liftlog.v1';
let progressionUndo=null;
function progressionApplicable(it,k){
 const w=S.workouts[k],p=exById(it.exId).progression,sets=it.sets.filter(s=>!s.warm&&s.type!=='warm');
 return k>=todayKey()&&w&&!w.finishedAt&&validProgression(p)&&w.items.filter(x=>x.exId===it.exId).length===1&&sets.length===p.sets&&sets.every(s=>!s.type)&&sets.some(s=>!s.done);
}
function applyProgression(it,k){
 const t=progressionTarget(it.exId,k);if(!t||t.reason||!progressionApplicable(it,k))return false;
 const before=JSON.stringify(it.sets);let i=0;
 it.sets.forEach(s=>{if(s.warm||s.type==='warm')return;const reps=t.reps[i++];if(!s.done){s.kg=String(t.kg);s.reps=String(reps);}});
 progressionUndo={date:k,id:it.id,before,after:JSON.stringify(it.sets)};save();return true;
}
function undoProgression(it,k){
 const u=progressionUndo;if(!u||u.date!==k||u.id!==it.id||u.after!==JSON.stringify(it.sets)||S.workouts[k].finishedAt)return false;
 it.sets=JSON.parse(u.before);progressionUndo=null;save();return true;
}
function progressionHtml(it){
 const t=progressionTarget(it.exId,V.date);if(!t)return '';
 const u=progressionUndo,undo=u&&u.date===V.date&&u.id===it.id&&u.after===JSON.stringify(it.sets);
 return `<div class="progression"><b>다음 운동 목표</b><p>${t.date?fmtShort(t.date)+' 기록 기준 · ':''}${t.reason?esc(t.reason):`${t.increase?'상한 횟수 달성 · 증량':'같은 무게로 횟수 늘리기'}<br>${t.previous} → ${t.kg}kg · ${t.reps.join(' / ')}회`}</p>${!t.reason&&progressionApplicable(it,V.date)?'<button class="btn sm" data-act="progression-apply">미완료 세트에 적용</button>':''}${undo?'<button class="btn sm" data-act="progression-undo">적용 되돌리기</button>':''}</div>`;
}
function progressionBox(ex){
 const p=ex.progression||{min:8,max:12,sets:3,step:2.5};
 modal(`<h3>다음 운동 목표 설정</h3><p>${esc(ex.name)} · 모든 본세트가 상한 횟수에 도달하면 증량을 제안해요. 자동 적용하지 않습니다.</p>${[['min','최소 횟수'],['max','최대 횟수'],['sets','본세트 수'],['step','증량 단위 (kg)']].map(([k,label])=>`<div class="field"><label for="pg-${k}">${label}</label><input id="pg-${k}" type="number" min="0" step="${k==='step'?'0.001':'1'}" value="${p[k]}"></div>`).join('')}<p id="pg-error" role="alert"></p><div class="acts"><button class="btn" id="pg-off">끄기</button><button class="btn primary" id="pg-save">저장·활성화</button></div><button class="btn" data-act="modal-close">취소</button>`);
 $('#pg-save').onclick=()=>{const v=Object.fromEntries(['min','max','sets','step'].map(k=>[k,Number($('#pg-'+k).value)]));if(!validProgression(v)){$('#pg-error').textContent='횟수 1~100, 본세트 1~20, 증량 0 초과~100kg, 최소 ≤ 최대를 확인하세요';return;}ex.progression=v;save();closeModal();render();};
 $('#pg-off').onclick=()=>{delete ex.progression;save();closeModal();render();};
}
function pickerExercises(){
 const q=P.q.trim().toLowerCase();return S.exercises.filter(e=>(!q||e.name.toLowerCase().includes(q)||e.part.includes(q))&&(P.part==='전체'||(P.part==='북마크'?e.bookmark:e.part===P.part))&&(!P.equipment.length||P.equipment.includes(equipmentOf(e))));
}

let S=null;

let storageIssue='',dirty=false;
function emptyState(){return {version:1,exercises:seedExercises(),routines:[],workouts:{},settings:{...DEFAULTS}};}
function storageError(error){storageIssue=error.message||String(error);renderStorageAlert();}
function renderStorageAlert(){
  const el=$('#storage-alert');if(!el)return;
  el.hidden=!storageIssue;
  el.innerHTML=storageIssue?`<b>기록 저장을 확인해주세요</b><p>${esc(storageIssue)}</p><div><button class="btn sm" data-act="export">현재 내용 내보내기</button> <button class="btn sm" data-act="storage-raw">저장 원본 확인</button> <button class="btn sm" data-act="storage-retry">다시 저장</button> <button class="btn sm" data-tab="settings">복구 사본 확인</button></div>`:'';
}
function load(){
  try{S=storage.load()||emptyState();storageIssue='';}
  catch(e){S=emptyState();storageError(e);}
  normalize();
}
let saveT=null;
function persist(options){
  try{storage.save(S,options);storageIssue='';renderStorageAlert();return true;}
  catch(e){storageError(e);return false;}
}
function flushSave(){
  clearTimeout(saveT);saveT=null;
  if(!persist()){dirty=true;return false;}
  try{markLocalChanges();dirty=false;return true;}
  catch(e){storageError(e);dirty=true;return false;}
}
function save(){dirty=true;clearTimeout(saveT);saveT=setTimeout(flushSave,150);}
function replaceState(next){
  try{
    window.Liftlog.validateState(next);normalize(next);
    storage.replace(next);S=next;storageIssue='';renderStorageAlert();
    dirty=true;return flushSave();
  }catch(e){storageError(e);return false;}
}
// Keep unchanged targets alive for open editors when an unrelated cloud key changes.
function retainUnchanged(previous,next){
  if(previous===next)return previous;
  if(!previous||!next||typeof previous!=='object'||typeof next!=='object'||Array.isArray(previous)!==Array.isArray(next))return next;
  const keys=Object.keys(next);let same=keys.length===Object.keys(previous).length;
  const byId=Array.isArray(previous)?new Map(previous.filter(item=>item&&item.id).map(item=>[item.id,item])):null;
  for(const key of keys){
    const old=byId&&next[key]&&next[key].id?byId.get(next[key].id):previous[key];
    next[key]=retainUnchanged(old,next[key]);
    if(!Object.prototype.hasOwnProperty.call(previous,key)||next[key]!==previous[key])same=false;
  }
  return same?previous:next;
}
function commitRemote(next){
  normalize(next);
  try{storage.save(next,{checkpoint:true});}
  catch(e){storageError(e);throw e;}
  S=retainUnchanged(S,next);storageIssue='';renderStorageAlert();
}
function cleanNum(v){const s=String(v==null?'':v).replace(/[^0-9.]/g,'');const p=s.split('.');return p.length>2?p[0]+'.'+p.slice(1).join(''):s;}


/* ===================== domain helpers ===================== */

// Source-only artwork: fixed seed IDs resolve to motion + equipment, including old backups.
const seedOf=ex=>!ex.custom&&/^ex\d{3}$/.test(ex.id)?SEED[Number(ex.id.slice(2))]:null;
const hasImg=ex=>!!seedOf(ex)&&Number(ex.id.slice(2))<57;
function exerciseIcon(ex){
  const info=artworkInfo(ex);
  if(info.kind==='illustration')return `<svg class="ex-icon illustrated art-${info.source}" data-art-kind="illustration" data-art-source="${info.key}" viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">${EX_ART[info.key]}</svg>`;
  const equipment=info.equipment||'운동';
  const gear=equipment==='케이블'?'<path d="M15 10h31v26M42 10v18l-9 7M13 18h10v18H13z"/>':equipment==='러닝머신'?'<path d="M12 36h40l-3-7H17zM44 29V12H32M35 12v6h13"/>':equipment==='맨몸'||equipment==='야외'?'<path d="M14 29c10-13 25-13 36 0M14 34h36M24 13h16"/>':'<path d="M14 22h36M14 16v12M20 13v18M44 13v18M50 16v12"/>';
  return `<svg class="ex-icon art-fallback" data-art-kind="fallback" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${gear}<text x="32" y="51" text-anchor="middle" fill="currentColor" stroke="none" font-size="10" font-family="sans-serif">${esc(ex.part||'운동')}</text></svg>`;
}
function artworkInfo(ex){return seedOf(ex)&&ART_META[ex.id]||{kind:'fallback',equipment:'맨몸',note:'동작 일러스트 미제공 · 부위·기구 대체 타일'};}
function thumb(ex,cls){return `<span class="thumb ${cls||''} tap" data-act="ex-info" data-id="${esc(ex.id)}" role="button" tabindex="0" aria-label="${esc(ex.name)} 운동 정보">${exerciseIcon(ex)}</span>`;}
function sortedPickerExercises(usage=exerciseUsage()){
  const list=pickerExercises(),byName=(a,b)=>PARTS.indexOf(a.part)-PARTS.indexOf(b.part)||a.name.localeCompare(b.name,'ko')||a.id.localeCompare(b.id);
  const byRecent=(a,b)=>(usage[b.id]?.last||'').localeCompare(usage[a.id]?.last||'');
  return list.sort((a,b)=>P.sort==='frequency'?(usage[b.id]?.count||0)-(usage[a.id]?.count||0)||byRecent(a,b)||byName(a,b):P.sort==='recent'?byRecent(a,b)||byName(a,b):byName(a,b));
}

/* ===================== view state ===================== */
const V={tab:'today',date:todayKey(),weekAnchor:todayKey(),calMonth:monthStart(todayKey()),openMenu:null};
/* 날짜 이동은 항상 이걸로: 주간 스트립과 월 그리드가 선택한 날을 따라가게 */
function goDate(k){V.date=k;V.weekAnchor=k;V.calMonth=monthStart(k);}
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const I={
  back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  chev:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  prev:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 6l-6 6 6 6"/></svg>',
  next:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6l6 6-6 6"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  more:'<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  minus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg>',
  star:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>',
  search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  up:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  down:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
  swap:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h13l-3-3M20 17H7l3 3"/></svg>',
  trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>',
  info:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  reload:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v5h5"/></svg>',
  keyboard:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/></svg>',
  kpHide:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="12" rx="2"/><path d="M7 7h.01M11 7h.01M15 7h.01M7 11h10M9 19l3 3 3-3"/></svg>',
  backspace:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 6H8l-5 6 5 6h13a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1z"/><path d="M12 9l6 6M18 9l-6 6"/></svg>',
  clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  plate:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10v4M21 10v4M6 7v10M18 7v10M9 5v14M15 5v14M9 12h6"/></svg>',
  dumbbell:'<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="24" width="8" height="16" rx="2"/><rect x="12" y="18" width="8" height="28" rx="2"/><rect x="44" y="18" width="8" height="28" rx="2"/><rect x="52" y="24" width="8" height="16" rx="2"/><path d="M20 32h24"/></svg>',
  tabToday:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  tabRoutine:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  tabStats:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V11M10 19V5M16 19v-8M22 19H2"/></svg>',
  tabSet:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>'
};

function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),1800);}

/* ===================== rendering ===================== */
let renderedTab=null;
function render(){
  const app=$('#app');const y=renderedTab===V.tab?window.scrollY:0;
  const ae=document.activeElement;
  const focusId=ae&&app.contains(ae)&&ae.id?ae.id:null;
  const focusMemo=ae&&app.contains(ae)&&ae.dataset&&ae.dataset.memo?ae.dataset.memo:null;
  const selS=ae&&typeof ae.selectionStart==='number'?ae.selectionStart:null;
  const selE=ae&&typeof ae.selectionEnd==='number'?ae.selectionEnd:null;
  if(V.tab==='today')app.innerHTML=renderToday();
  else if(V.tab==='routines')app.innerHTML=renderRoutines();
  else if(V.tab==='stats')app.innerHTML=renderStats();
  else app.innerHTML=renderSettings();
  renderTabbar();
  document.body.classList.toggle('has-actionbar',!!app.querySelector('.actionbar'));
  renderedTab=V.tab;
  document.querySelectorAll('.memo,.dnote').forEach(t=>{if(t.value){t.style.height='auto';t.style.height=t.scrollHeight+'px';}});
  if(focusId||focusMemo){
    const nel=focusId?document.getElementById(focusId):document.querySelector(`[data-memo="${focusMemo}"]`);
    if(nel){nel.focus({preventScroll:true});try{if(selS!=null)nel.setSelectionRange(selS,selE);}catch(e){}}
  }
  window.scrollTo(0,y);
  updateWakeLock();
}
function renderTabbar(){
  const t=[['today','오늘',I.tabToday],['routines','루틴',I.tabRoutine],['stats','분석',I.tabStats],['settings','설정',I.tabSet]];
  $('#tabbar').innerHTML=t.map(x=>`<button data-tab="${x[0]}" class="${V.tab===x[0]?'on':''} ${x[0]==='settings'&&C.status==='error'?'err':''}">${x[2]}<span>${x[1]}</span></button>`).join('');
}
function topbar(title,left,right){
  return `<header class="topbar"><span class="topbar-s">${left||''}</span><h1>${title}</h1><span class="topbar-s r">${right||''}</span></header>`;
}

/* ---- today ---- */
function renderToday(){
  const k=V.date,w=S.workouts[k],hasItems=w&&(w.items.length||workoutDuration(w)!=null);
  const left=`<button class="iconbtn" data-act="day-prev" aria-label="이전 날">${I.prev}</button>`;
  const right=`<button class="iconbtn" data-act="day-next" aria-label="다음 날">${I.next}</button>`+(hasItems?`<button class="iconbtn" data-act="day-menu" aria-label="메뉴">${I.more}</button>`:'');
  const titleHtml=`<button class="date-btn" data-act="open-cal" aria-label="달력 펼치기/접기"><span>${fmtDay(k)}</span>${I.chev}</button>`+(k===todayKey()?'':`<button class="badge tap" data-act="go-today" title="오늘로 이동">${ago(k)} · 오늘로</button>`);
  let html=topbar(titleHtml,left,right);
  html+='<div class="page">'+renderCal();
  const active=Object.values(S.workouts).find(x=>x.resumedAt&&x.date!==k);
  if(active)html+=`<button class="btn block" data-act="pick-day" data-date="${active.date}">${fmtDay(active.date)} 운동 진행 중 · 돌아가기</button>`;
  if(!hasItems){
    const last=sortedDates().filter(d=>d<k).pop(),isToday=k===todayKey(),past=k<todayKey();
    html+=`<div class="empty">${I.dumbbell}<h2>${isToday?'오늘 운동을 시작해 볼까요?':past?fmtDay(k)+'은 쉬었어요':fmtDay(k)+' 운동을 미리 짜 둘까요?'}</h2>
      ${last?`<p>${['마지막 운동 '+fmtDay(last),partsOf(S.workouts[last]).join(' · '),dayVolText(S.workouts[last])].filter(Boolean).join(' · ')}</p>`:'<p>운동을 추가하면 세트별 무게와 횟수를 기록할 수 있어요.</p>'}
      <button class="btn primary" data-act="open-picker" style="min-width:220px">운동 추가하기</button>
      ${S.routines.length||sortedDates().length?`<div class="quick">${S.routines.length?`<button class="btn sm" data-act="open-picker" data-v="routine">${I.tabRoutine} 루틴 불러오기</button>`:''}${sortedDates().length?`<button class="btn sm" data-act="open-picker" data-v="past">${I.reload} 지난 운동 불러오기</button>`:''}</div>`:''}
      <div class="quick"><button class="btn sm" data-act="routine-starters">시작용 루틴 둘러보기</button></div>
      ${sortedDates().length?'':'<button class="btn ghost sm" data-act="sample">샘플 데이터로 둘러보기</button>'}
    </div>`;
  }else{
    html+=renderDaySummary(w,k);
    if(!w.finishedAt)html+=w.items.map((it,i)=>renderItem(it,i)).join('');
    html+=`<div style="height:64px"></div></div>
      <div class="actionbar"><button class="btn" data-act="open-picker">${I.plus} 운동 추가</button>
      <button class="btn ${w.finishedAt?'':'good'}" data-act="finish">${w.finishedAt?'운동 완료됨 · 다시 열기':'운동 완료'}</button></div>`;
    return html;
  }
  return html+'</div>';
}
/* 캘린더: 설정 calView 가 month 면 월 그리드, 아니면 주간 스트립. 헤더의 ‹ › 는 월/주 단위 이동, ⌄ 는 전환.
   하단에는 보이는 기간(이 달/이 주)의 운동 일수·볼륨과 범례 */
function renderCal(){
  const t=todayKey(),month=S.settings.calView==='month';
  let keys=[],title;
  if(month){
    const d=parse(V.calMonth),y=d.getFullYear(),m=d.getMonth(),first=dkey(new Date(y,m,1)),nDays=new Date(y,m+1,0).getDate();
    const start=addDays(first,-parse(first).getDay()),rows=Math.ceil((parse(first).getDay()+nDays)/7);
    for(let i=0;i<rows*7;i++)keys.push(addDays(start,i));
    title=y+'년 '+(m+1)+'월';
  }else{
    const ws=weekStart(V.weekAnchor);for(let i=0;i<7;i++)keys.push(addDays(ws,i));
    const d=parse(V.weekAnchor);title=d.getFullYear()+'년 '+(d.getMonth()+1)+'월';
  }
  const curM=month?V.calMonth.slice(0,7):null;
  let h=`<div class="cal"><div class="cal-h"><button class="iconbtn" data-act="cal-prev" aria-label="${month?'이전 달':'이전 주'}">${I.prev}</button><span class="m num">${title}</span><button class="iconbtn" data-act="cal-next" aria-label="${month?'다음 달':'다음 주'}">${I.next}</button><button class="iconbtn tog ${month?'open':''}" data-act="cal-toggle" aria-label="${month?'주간으로 접기':'월간으로 펼치기'}">${I.chev}</button></div><div class="cal-g">`;
  h+=DOW.map((w,i)=>`<span class="dow ${i===0?'su':i===6?'sa':''}">${w}</span>`).join('');
  keys.forEach(k=>{const st=dayStatus(k),out=curM&&k.slice(0,7)!==curM;
    h+=`<button data-act="pick-day" data-date="${k}" class="${k===V.date?'sel':''} ${k===t?'today':''} ${st} ${out?'out':''} ${k>t?'future':''}" aria-label="${fmtDay(k)}${st==='fin'?' 운동 완료':st?' 기록 있음':''}"><span class="dn num">${parse(k).getDate()}</span><span class="bar"></span></button>`;});
  // range stats (이 달은 달력에 보이는 다른 달 날짜를 빼고 센다)
  const inRange=keys.filter(k=>!curM||k.slice(0,7)===curM).filter(k=>S.workouts[k]&&S.workouts[k].items.length);
  const vol=inRange.reduce((a,k)=>a+dayVolume(S.workouts[k]),0);
  h+=`</div><div class="cal-f"><span>${month?'이 달':'이 주'} 운동 <b class="num">${inRange.length}</b>일${vol?' · <b class="num">'+fmtKg(vol)+'</b>':''}</span><span class="leg"><span><i></i>완료</span><span><i class="p"></i>미완료</span></span></div></div>`;
  return h;
}
/* 하루 요약 카드: 2×2 타일(운동 시간 · 운동 개수 · 전체 볼륨 · 세트 완료) + 하루 메모.
   운동을 완료한 날은 카드를 접고 여기에 수행 운동 정보(종목별 세트·볼륨)를 읽기 전용으로 보여준다 */
function renderDaySummary(w,k){
  const sc=daySetCount(w),dur=workoutDuration(w),live=!!w.resumedAt;
  const prs=w.items.filter(it=>isItemPR(it,k)).length;
  let h=`<div class="card"><div class="sum-h"><h2>${w.finishedAt?'운동 요약':'오늘의 운동'}${prs?` <span class="badge pr" style="margin-left:4px">PR ${prs}</span>`:''}${w.sample?' <span class="badge">샘플</span>':''}</h2><span class="p">${partsOf(w).join(' · ')}</span></div>
    <div class="tiles">
      <div class="tile c1">${I.clock}<div><div class="v num" id="workout-duration" role="timer" aria-label="전체 운동 시간">${fmtDuration(dur)}</div><div class="l">${live?'운동 중':'전체 운동 시간'}</div></div></div>
      <div class="tile c2">${I.dumbbell}<div><div class="v num">${w.items.length}<small>개</small></div><div class="l">운동 개수</div></div></div>
      <div class="tile c3">${I.plate}<div><div class="v num" id="dayvol">${dayVolText(w)||'–'}</div><div class="l">전체 볼륨</div></div></div>
      <div class="tile c4">${I.check}<div><div class="v num"><span id="daysets">${sc.done}/${sc.total}</span></div><div class="l">본세트 완료</div></div></div>
    </div>
    ${renderSession(w,k)}
    <textarea class="dnote" rows="1" placeholder="오늘 운동 후기를 남겨보세요" data-dnote="${k}">${esc(w.note)}</textarea>`;
  if(w.finishedAt){
    h+=`<div class="sec-h" style="margin-top:14px">수행 운동 정보</div><div class="sl">`+w.items.map((it,i)=>{
      const ex=exById(it.exId),m=modeOf(ex),met=itemMetric(it),all=it.sets.length>0&&it.sets.every(s=>s.done);
      const sets=it.sets.map(s=>{const t=setText(m,s);return t?(s.done?t:`<span class="nd">${t}</span>`):'';}).filter(Boolean).join(', ');
      return `<div class="r"><span class="n">${i+1}</span><div class="grow"><div class="t"><span class="part">${esc(ex.part)}</span>${esc(ex.name)}<span class="cnt">${it.sets.length}세트</span>${isItemPR(it,k)?'<span class="badge pr">PR</span>':''}</div><div class="s">${sets||'–'}${it.memo?` · <span style="font-family:var(--font-body)">${esc(it.memo)}</span>`:''}</div></div>${met?`<span class="vol">${met.value}</span>`:''}<span class="ok ${all?'':'no'}" aria-label="${all?'모든 세트 완료':'미완료 세트 있음'}">${I.check}</span></div>`;}).join('')+'</div>';
  }
  return h+'</div>';
}
/* 세트 번호 칸: W/D/F 는 글자 배지, 본세트만 번호를 센다. 탭하면 세트 옵션 시트 */
function setCell(s,n,attr,extra){
  const t=s.type||'',lbl=t==='warm'?'W':n,tag=t&&t!=='warm'?`<i class="tg">${TYPE_TAG[t]}</i>`:'';
  const rpe=s.rpe!=null?`<i class="rp">@${s.rpe}</i>`:'';
  return `<button type="button" class="sn ${t} ${extra||''}" ${attr} aria-label="세트 옵션 (${SET_TYPES[t]}${s.rpe!=null?' · RPE '+s.rpe:''})">${lbl}${tag}${rpe}</button>`;
}
const inputMode=()=>S.settings.keypad?'none':'decimal';
/* 세트 입력칸. M=MODES[mode]. reps 모드는 kg 칸을 아예 그리지 않는다(세트 데이터의 kg 는 무시). kgAttr/rpAttr 에 id·data-* 를 넘긴다 */
function setInputs(M,s,im,kgAttr,rpAttr,j,cls){
  const inp=(attr,col,ph,val,lbl)=>`<input type="text" inputmode="${im}" enterkeyhint="next" placeholder="${ph}" class="${cls||''}" ${attr} value="${esc(val)}" data-col="${col}" aria-label="${j+1}세트 ${lbl}">`;
  if(M.col.length===1)return inp(rpAttr,M.col[0],M.ph[0],s.reps,M.cols[0]);
  return inp(kgAttr,M.col[0],M.ph[0],s.kg,M.cols[0])+inp(rpAttr,M.col[1],M.ph[1],s.reps,M.cols[1]);
}
function renderItem(it,i){
  const ex=exById(it.exId),mode=modeOf(ex),M=MODES[mode],prevRec=lastRecord(it.exId,V.date),im=inputMode(),met=itemMetric(it);
  let h=`<section class="card ex" data-item="${it.id}"><div class="ex-head"><span class="ex-idx">${i+1}</span>${thumb(ex,'sm')}
    <div class="grow ex-title"><span class="part">${esc(ex.part)}</span><span>${esc(ex.name)}</span><span class="badge pr" data-pr="${it.id}" ${isItemPR(it,V.date)?'':'hidden'}>PR</span></div>
    <button class="iconbtn" data-act="ex-info" data-id="${ex.id}" aria-label="운동 정보">${I.info}</button><button class="iconbtn" data-act="item-menu" aria-label="운동 메뉴">${I.more}</button></div>
    <div class="ex-meta">${met?`<span>${met.label} <b class="num" data-vol="${it.id}">${met.value}</b></span>`:''}
    ${prevRec?`${met?'<span class="sep"></span>':''}<span>지난번 <b class="num">${lastSummary(it.exId,V.date).replace(/^\d+세트 · /,'')}</b> <span class="muted">(${ago(prevRec.date)})</span></span>`:''}</div>
    <textarea class="memo" rows="1" placeholder="메모" data-memo="${it.id}">${esc(it.memo)}</textarea>
    <div class="ex-tools"><button data-act="item-load-last" ${prevRec?'':'disabled'}>${I.reload}지난 기록 불러오기</button></div>
    <div data-progression="${it.id}">${progressionHtml(it)}</div><div class="sets ${mode}"><span class="h">세트</span>${M.cols.map(c=>`<span class="h">${c}</span>`).join('')}<span class="h">완료</span>`;
  let wIdx=0;
  it.sets.forEach((s,j)=>{
    const n=s.type==='warm'?0:(++wIdx);
    h+=setCell(s,n,`data-setopt="${j}"`,s.done?'r-done':'')+setInputs(M,s,im,`id="kg-${it.id}-${j}" data-kg="${j}"`,`id="rp-${it.id}-${j}" data-reps="${j}"`,j,s.done?'in-done':'')+`
      <button class="done ${s.done?'on':''}" data-done="${j}" aria-label="${j+1}세트 완료">${I.check}</button>`;
  });
  h+=`</div><div class="set-actions"><button data-act="set-del">${I.minus}세트삭제</button><button class="add" data-act="set-add">${I.plus}세트추가</button></div></section>`;
  return h;
}
function refreshVolumes(){
  const w=S.workouts[V.date];if(!w)return;
  const dv=$('#dayvol');if(dv)dv.textContent=dayVolText(w)||'–';
  w.items.forEach(it=>{
    const pg=document.querySelector(`[data-progression="${it.id}"]`);if(pg)pg.innerHTML=progressionHtml(it);
    const el=document.querySelector(`[data-vol="${it.id}"]`);if(el){const met=itemMetric(it);if(met)el.textContent=met.value;}
    const pr=document.querySelector(`[data-pr="${it.id}"]`);if(pr)pr.hidden=!isItemPR(it,V.date);
  });
  const ds=$('#daysets');if(ds){const total=w.items.reduce((a,it)=>a+it.sets.filter(s=>!s.warm).length,0),done=w.items.reduce((a,it)=>a+it.sets.filter(s=>s.done&&!s.warm).length,0);ds.textContent=done+'/'+total;}
}

/* ---- routines ---- */
/* Editable starting points, authored for Liftlog; no program schedules or loads are imposed. */
const STARTER_PLANS=[
  {id:'full',name:'전신',desc:'한 번에 주요 부위를 골고루 · 머신 중심',sessions:[
    {name:'전신 기본',moves:[[1,3,10],[14,3,10],[19,3,10],[30,2,10],[3,2,12]]}]},
  {id:'split',name:'상체 / 하체',desc:'상체와 하체를 나눠 구성',sessions:[
    {name:'상체',moves:[[10,3,10],[19,3,10],[20,3,10],[30,2,10],[37,2,12],[41,2,12]]},
    {name:'하체',moves:[[0,3,8],[6,3,10],[1,3,10],[3,2,12],[8,3,15]]}]},
  {id:'ppl',name:'푸시 / 풀 / 하체',desc:'미는 운동 · 당기는 운동 · 하체',sessions:[
    {name:'푸시',moves:[[10,3,10],[13,3,10],[30,3,10],[31,2,12],[41,3,12]]},
    {name:'풀',moves:[[19,3,10],[20,3,10],[22,3,10],[27,2,12],[37,3,12]]},
    {name:'하체',moves:[[0,3,8],[6,3,10],[2,3,12],[3,3,12],[8,3,15]]}]},
  {id:'five',name:'5 × 5',desc:'바벨 기본 동작 · A/B 두 세션',sessions:[
    {name:'5×5 A',moves:[[0,5,5],[10,5,5],[21,5,5]]},
    {name:'5×5 B',moves:[[0,5,5],[29,5,5],[26,1,5]]}]}
];
function starterRoutine(planId,index){
  const plan=STARTER_PLANS.find(p=>p.id===planId),session=plan&&plan.sessions[index];
  if(!session)return null;
  return {id:uid(),name:plan.id==='five'||plan.id==='full'?session.name:plan.name+' · '+session.name,createdAt:Date.now(),lastUsed:null,
    items:session.moves.map(([n,count,reps])=>({exId:'ex'+String(n).padStart(3,'0'),sets:blankSets(count).map(s=>({...s,reps:String(reps)}))}))};
}
function routineParts(r){
  const counts=new Map();
  r.items.forEach(it=>{const count=it.sets.filter(s=>!s.warm&&s.type!=='warm').length,part=exById(it.exId).part||'기타';if(count)counts.set(part,(counts.get(part)||0)+count);});
  return [...counts].map(([part,sets])=>({part,sets}));
}
function routineCoverage(r){
  const parts=routineParts(r);
  return parts.length?`<div class="routine-coverage" aria-label="주요 부위별 계획 본세트">${parts.map(p=>`<span class="badge">${esc(p.part)} <b class="num">${p.sets}</b>세트</span>`).join('')}</div>`:'';
}
function starterBox(){
  modal(`<h3>시작용 루틴</h3><p class="muted">세션을 선택하면 편집 화면에서 확인할 수 있어요. 무게는 비워 두었으니 자신에게 맞게 입력하세요.</p>${STARTER_PLANS.map(p=>`<section class="starter-plan"><h4>${esc(p.name)}</h4><p class="muted">${esc(p.desc)}</p><div class="starter-actions">${p.sessions.map((s,i)=>`<button class="btn sm" data-act="starter-preview" data-plan="${p.id}" data-index="${i}">${esc(s.name)} · ${s.moves.length}종목</button>`).join('')}</div></section>`).join('')}<p class="muted">각 세션은 별도 루틴으로 저장돼요. 종목·횟수·세트는 자유롭게 수정할 수 있습니다.</p><button class="btn block" data-act="modal-close">닫기</button>`);
}

function renderRoutines(){
  let h=topbar('내 루틴',null,`<button class="iconbtn" data-act="routine-new" aria-label="새 루틴">${I.plus}</button>`)+'<div class="page">';
  h+=`<div class="card starter-intro"><span class="badge">QUICK START</span><h2>빈칸부터 만들 필요 없어요</h2><p class="muted">전신부터 분할까지, 기본 구성을 골라 나만의 루틴으로 바꿔보세요.</p><button class="btn primary" data-act="routine-starters">시작용 루틴 둘러보기</button></div>`;
  if(!S.routines.length)h+=`<div class="empty">${I.tabRoutine}<h2>저장된 루틴이 없어요</h2><p>자주 하는 운동 묶음을 루틴으로 만들어 두면 한 번에 불러올 수 있어요.</p><button class="btn primary" data-act="routine-new">새 루틴 만들기</button></div>`;
  S.routines.forEach(r=>{
    h+=`<div class="card rt" data-routine="${r.id}"><div class="t"><h3>${esc(r.name)}</h3><button class="iconbtn" data-act="routine-menu" aria-label="루틴 메뉴">${I.more}</button></div>
      ${routineCoverage(r)}
      ${avatars(r)}
      <div class="exs">${r.items.map(i=>esc(exById(i.exId).name)+' <span class="num">'+i.sets.length+'세트</span>').join(' · ')}</div>
      <div class="last">${r.lastUsed?'마지막 운동일 '+fmtDay(r.lastUsed):'수행 기록 없음'}</div>
      <div class="acts"><button class="btn sm primary" data-act="routine-load">${fmtDay(V.date)}에 불러오기</button><button class="btn sm" data-act="routine-edit">편집</button></div></div>`;
  });
  return h+'</div>';
}

function avatars(r){const exs=r.items.map(i=>exById(i.exId));if(!exs.length)return '';const show=exs.slice(0,5);
  return '<div class="avatars">'+show.map(e=>thumb(e,'xs')).join('')+(exs.length>5?`<span class="thumb xs more">+${exs.length-5}</span>`:'')+'</div>';}
/* ---- stats: completed working sets, shared rolling date range ---- */
function statsSegments(options,act,value){
  return `<div class="stats-segments" role="group" aria-label="${act==='stat-range'?'분석 기간':act==='stat-trend'?'운동량 지표':'종목 지표'}">${options.map(([v,label])=>`<button data-act="${act}" data-v="${v}" aria-pressed="${String(v)===String(value)}" class="${String(v)===String(value)?'on':''}">${label}</button>`).join('')}</div>`;
}
function renderStats(){
  const range=V.statRange??28,r=statsReport(range),c=r.current,p=r.previous;
  let h=topbar('분석')+'<div class="page stats-page">';
  h+=statsSegments([[7,'7일'],[28,'4주'],[84,'12주'],[0,'전체']],'stat-range',range);
  h+=`<div class="stats-period"><strong>${statsDate(r.start)} — ${statsDate(r.end)}</strong><span>${range?'직전 같은 기간과 비교':'전체 누적 기록'}</span></div>`;
  if(!statsEntries('0000-01-01',r.end).length)return h+`<div class="empty">${I.tabStats}<h2>아직 완료한 기록이 없어요</h2><p>세트에 값을 입력하고 완료 체크하면<br>운동량과 종목별 성장을 볼 수 있어요.</p><button class="btn primary" data-tab="today">운동 기록하기</button></div></div>`;
  const tiles=[['운동한 날',c.days,'일',p.days,'일'],['완료 본세트',c.sets,'세트',p.sets,'세트'],['무게 볼륨',c.weightSets?statsNumber(c.volume):'—',c.weightSets?'kg':'',p.volume,'kg'],['기록된 운동 시간',c.measuredDays?statsNumber(c.durationMs/60000):'—',c.measuredDays?'분':'',p.durationMs/60000,'분']];
  h+='<div class="stats-overview">'+tiles.map(([label,value,unit,prev,deltaUnit],i)=>{
    const comparable=i===3?c.measuredDays&&p.measuredDays:i===2?c.weightSets||p.weightSets:true;
    const raw=i===3?c.durationMs/60000:i===2?c.volume:Number(value);
    return `<div class="stat"><div class="l">${label}</div><div class="v num">${value}<small>${unit}</small></div><div class="stats-change">${!range?'누적 기록':!comparable?'비교할 기록 없음':statsChange(raw,prev,deltaUnit)}</div></div>`;
  }).join('')+'</div>';
  h+=`<p class="stats-note">시간 기록 ${c.measuredDays}/${c.days}일${c.cardioMinutes?` · 시간형 운동 ${statsNumber(c.cardioMinutes)}분`:''} · 체크한 본세트만 반영</p>`;
  if(!c.days)h+=`<div class="card stats-empty"><h2>이 기간에는 완료한 본세트가 없어요</h2><p class="muted">기간을 늘려 지난 기록을 확인하세요.</p><button class="btn" data-act="stat-range" data-v="0">전체 기록 보기</button></div>`;
  const trend=V.statTrend||'sets',trendOptions=[['sets','본세트'],['volume','볼륨'],['days','운동일']],trendUnit=trend==='volume'?'kg':trend==='days'?'일':'세트';
  h+=`<section class="card stats-section" aria-labelledby="stats-trend-title"><div class="stats-heading"><div><h2 id="stats-trend-title">운동량 흐름</h2><p>${r.bucketDays===1?'하루':r.bucketDays===7?'7일':r.bucketDays+'일'} 단위 · ${trendUnit}</p></div></div>${statsSegments(trendOptions,'stat-trend',trend)}${statsBarChart(r.buckets,trend,trendUnit)}<p class="stats-note">${trend==='volume'?'무게 × 횟수의 합계. 맨몸·시간형 운동은 제외합니다.':'웜업·미완료·값 없는 세트는 제외합니다.'}</p></section>`;
  const parts=[...new Set([...PARTS,...Object.keys(c.parts),...Object.keys(p.parts)])].filter(part=>part!=='유산소'||c.parts[part]||p.parts[part]);
  const max=Math.max(1,...parts.map(part=>Math.max(c.parts[part]||0,range?p.parts[part]||0:0)));
  h+=`<section class="card stats-section" aria-labelledby="stats-parts-title"><div class="stats-heading"><div><h2 id="stats-parts-title">부위별 본세트</h2><p>운동에 지정된 부위 기준 · 시간형 제외</p></div></div><div class="stats-part-legend"><span><i></i>선택 기간</span>${range?'<span><i class="previous"></i>이전 기간</span>':''}</div>`;
  h+=parts.map(part=>`<div class="stats-part"><div class="stats-part-label"><strong>${esc(part)}</strong><span class="num">${c.parts[part]||0}세트${range?` <small>이전 ${p.parts[part]||0}</small>`:''}</span></div><div class="stats-part-track"><i class="previous" style="width:${range?(p.parts[part]||0)/max*100:0}%"></i><i style="width:${(c.parts[part]||0)/max*100}%"></i></div><div class="stats-part-last">${c.lastParts[part]?'마지막 수행 '+statsDate(c.lastParts[part]):'이 기간 기록 없음'}</div></div>`).join('');
  h+='<p class="stats-note">보조 근육의 자극이나 회복 상태를 추정한 수치는 아닙니다.</p></section>';
  const ids=[...new Set(r.entries.slice().reverse().flatMap(d=>d.items.map(it=>it.ex.id)))];
  if(ids.length){
    if(!ids.includes(V.statEx)){V.statEx=ids[0];V.statMetric=null;}
    const ex=exById(V.statEx),mode=modeOf(ex),options=statsMetricOptions(mode);
    if(!options.some(o=>o[0]===V.statMetric))V.statMetric=options[0][0];
    const metric=V.statMetric,[,label,unit]=options.find(o=>o[0]===metric),sessions=statsExerciseSessions(V.statEx,r.entries),latest=sessions.at(-1),previous=sessions.at(-2),best=Math.max(...sessions.map(s=>s[metric]));
    h+=`<section class="card stats-section" aria-labelledby="stats-ex-title"><div class="stats-heading"><div><h2 id="stats-ex-title">종목별 성장</h2><p>기록한 종목 ${ids.length}개 · 최근 수행 순</p></div></div><label class="stats-search-label" for="statSearch">종목 검색</label><input id="statSearch" class="stats-search" type="search" placeholder="종목 이름 또는 부위 검색" autocomplete="off" data-act="stat-search"><div id="statSearchStatus" class="stats-note" aria-live="polite"></div><label class="stats-search-label" for="statEx">분석할 종목</label><select id="statEx" class="stats-ex-select" data-act="stat-ex">${ids.map(id=>`<option value="${esc(id)}" ${id===V.statEx?'selected':''}>${esc(exById(id).part+' · '+exById(id).name)}</option>`).join('')}</select>`;
    h+=statsSegments(options,'stat-metric',metric);
    h+=`<div class="stats-ex-summary"><div><span>최근 ${label}</span><strong class="num">${statsNumber(latest[metric])}<small>${unit}</small></strong><span>${statsDate(latest.date)}</span></div><div><span>기간 최고</span><strong class="num">${statsNumber(best)}<small>${unit}</small></strong><span>${sessions.length}일 수행</span></div></div>`;
    h+=`<div class="stats-insight">${previous?`직전 수행 대비 ${statsChange(latest[metric],previous[metric],unit)}`:'첫 기록이에요. 다음 기록부터 변화를 비교할 수 있어요.'}</div>`;
    h+=statsLineChart(sessions,metric,label,unit);
    h+=`<p class="stats-note">${metric==='e1rm'?'Epley 추정치입니다. 실제 1RM 측정값이 아니며 고반복에서는 오차가 커집니다.':mode==='time'?'분 단위로 입력한 시간을 합산합니다. 강도·거리는 합산하지 않습니다.':metric==='volume'?'같은 날 완료한 이 종목의 무게 × 횟수를 모두 합산합니다.':'같은 날 중복 추가한 종목도 하나의 기록으로 합칩니다.'}</p>`;
    h+=`<div class="stats-history-heading"><h3>수행 기록</h3><span>날짜를 눌러 상세 보기</span></div><div class="stats-history">${sessions.slice(-5).reverse().map(s=>statsHistoryRow(s,mode,metric,unit)).join('')}</div>`;
    if(sessions.length>5)h+=`<details class="stats-more"><summary>이전 기록 ${sessions.length-5}일 더 보기</summary><div class="stats-history">${sessions.slice(0,-5).reverse().map(s=>statsHistoryRow(s,mode,metric,unit)).join('')}</div></details>`;
    h+='</section>';
  }
  return h+`<details class="card stats-method"><summary>집계 기준과 비교 기간</summary><p>완료 체크한 유효 본세트가 있는 날을 운동일로 셉니다. 세트 수와 무게 볼륨은 시간형 운동을 제외하며, 웜업은 모든 분석에서 제외합니다. 진행 중 운동도 체크한 본세트는 반영합니다.</p><p>운동 시간은 직접 입력하거나 측정한 전체 세션 시간입니다. 미기록은 0분으로 바꾸지 않으며, 진행 중이면 현재 경과 시간이 포함됩니다.</p>${range?`<p>비교 기간: ${statsDate(r.previousStart)} — ${statsDate(r.previousEnd)}. 두 기간 모두 ${range}일입니다. 이전 값이 0이면 증가율을 표시하지 않습니다.</p>`:''}</details></div>`;
}
function statsHistoryRow(s,mode,metric,unit){
  const summary=mode==='time'?`총 ${statsNumber(s.minutes)}분`:mode==='reps'?`${s.sets}세트 · 총 ${statsNumber(s.totalReps)}회`:`${s.sets}세트 · ${statsNumber(s.volume)}kg 볼륨`;
  return `<button class="stats-history-row" data-act="stat-day" data-date="${s.date}" aria-label="${statsDate(s.date)} 운동 기록 보기"><span><strong>${statsDate(s.date)}</strong><small>${summary}</small></span><span class="num">${statsNumber(s[metric])}<small>${unit}</small><span aria-hidden="true"> ›</span></span></button>`;
}
function statsBarChart(buckets,metric,unit){
  const max=Math.max(1,...buckets.map(b=>b[metric])),dense=buckets.length>8;
  return `<div class="stats-bars" role="list" aria-label="기간별 ${unit} 운동량">${buckets.map((b,i)=>{
    const show=!dense||i===buckets.length-1||(i%2===0&&i!==buckets.length-2),value=metric==='volume'&&b[metric]>=1000?statsNumber(b[metric]/1000)+'k':statsNumber(b[metric]);
    return `<div class="stats-bar-column" role="listitem" aria-label="${statsDate(b.start)}부터 ${statsDate(b.end)}: ${statsNumber(b[metric])}${unit}" title="${statsDate(b.start)} — ${statsDate(b.end)} · ${statsNumber(b[metric])}${unit}"><span class="num" aria-hidden="true">${show?value:'&nbsp;'}</span><div class="stats-bar-space"><i style="height:${b[metric]/max*100}%"></i></div><small class="num" aria-hidden="true">${show?fmtShort(b.start):'&nbsp;'}</small></div>`;
  }).join('')}</div>`;
}
function statsLineChart(sessions,metric,label,unit){
  const W=360,H=185,L=50,R=18,T=22,B=28,values=sessions.map(s=>s[metric]);
  let lo=Math.min(...values),hi=Math.max(...values);const padY=Math.max((hi-lo)*.15,hi*.04,1);lo=Math.max(0,lo-padY);hi+=padY;
  const step=niceStep((hi-lo)/3);lo=Math.floor(lo/step)*step;hi=Math.ceil(hi/step)*step;
  const first=parse(sessions[0].date).getTime(),last=parse(sessions.at(-1).date).getTime();
  const x=s=>first===last?(L+W-R)/2:L+(W-L-R)*(parse(s.date).getTime()-first)/(last-first),y=v=>T+(H-T-B)*(1-(v-lo)/(hi-lo));
  let h=`<svg class="chart stats-line" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)} 추이 (${unit}). ${sessions.length}일 기록. 최근 ${statsNumber(values.at(-1))}${unit}. 날짜별 수치는 아래 수행 기록에서 확인할 수 있습니다.">`;
  for(let v=lo;v<=hi+1e-9;v+=step)h+=`<line class="grid" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L-7}" y="${y(v)+4}" text-anchor="end">${v>=10000?statsNumber(v/1000)+'k':statsNumber(v)}</text>`;
  if(sessions.length>1)h+=`<polyline class="l1" points="${sessions.map(s=>`${x(s)},${y(s[metric])}`).join(' ')}"/>`;
  sessions.forEach(s=>{h+=`<circle class="p1" cx="${x(s)}" cy="${y(s[metric])}" r="${s===sessions.at(-1)?4:2.5}"><title>${statsDate(s.date)} · ${statsNumber(s[metric])}${unit}</title></circle>`;});
  const marks=[0,Math.floor((sessions.length-1)/2),sessions.length-1];
  [...new Set(marks)].forEach((i,j)=>{const s=sessions[i];h+=`<text x="${x(s)}" y="${H-7}" text-anchor="${sessions.length===1?'middle':j===0?'start':i===sessions.length-1?'end':'middle'}">${fmtShort(s.date)}</text>`;});
  return h+'</svg>';
}
/* ---- settings ---- */
function renderSettings(){
  const s=S.settings,customs=S.exercises.filter(e=>e.custom),hasSample=Object.values(S.workouts).some(w=>w.sample);
  let h=topbar('설정')+'<div class="page">';
  h+=`<div class="card"><div class="field"><label>화면</label></div>
    <div class="set-row"><div><div class="t">운동 중 화면 켜짐 유지</div><div class="d">운동 시간을 측정하는 동안 화면이 자동으로 꺼지지 않게 함</div></div><button class="switch ${s.wakeLock?'on':''}" data-act="toggle" data-k="wakeLock" role="switch" aria-checked="${s.wakeLock}"></button></div></div>`;
  h+=`<div class="card"><div class="field"><label>세트 입력</label></div>
    <div class="set-row"><div><div class="t">앱 키패드로 입력</div><div class="d">±버튼·이전/다음이 있는 큰 키패드. 끄면 기기 키보드 사용</div></div><button class="switch ${s.keypad?'on':''}" data-act="toggle" data-k="keypad" role="switch" aria-checked="${s.keypad}"></button></div>
    <div class="set-row"><div><div class="t">바벨 봉 무게</div><div class="d">세트 옵션의 원판 계산에 사용</div></div><span class="seg">${[20,15,10].map(v=>`<button data-act="set-bar" data-v="${v}" class="${s.barKg===v?'on':''}">${v}kg</button>`).join('')}</span></div></div>`;
  h+=`<div class="card"><div class="field"><label>루틴</label></div>
    <div class="set-row"><div><div class="t">루틴 불러올 때 무게·횟수</div><div class="d">마지막 기록이 있으면 그 값으로 채울지</div></div><span class="seg"><button data-act="set-fill" data-v="last" class="${s.routineFill==='last'?'on':''}">마지막 기록</button><button data-act="set-fill" data-v="routine" class="${s.routineFill==='routine'?'on':''}">루틴 값</button></span></div></div>`;
  h+=`<div class="card"><div class="field"><label>사용자 정의 운동 · ${customs.length}개</label></div>
    ${customs.map(e=>`<div class="set-row"><div><div class="t"><span class="muted">${esc(e.part)}</span> ${esc(e.name)}</div><div class="d">${MODES[modeOf(e)].label}</div></div><div style="display:flex;gap:6px"><button class="btn sm" data-act="custom-edit" data-id="${e.id}">수정</button><button class="btn sm danger" data-act="custom-del" data-id="${e.id}">삭제</button></div></div>`).join('')}
    <div style="margin-top:10px"><button class="btn sm block" data-act="custom-new">${I.plus} 운동 추가</button></div></div>`;
  h+=renderSyncCard();
  h+=`<div class="card"><div class="field"><label>기록 복구</label></div><p class="muted">첫 저장과 가져오기·동기화 교체·전체 삭제 직전의 기록 중 가장 최근 사본을 이 기기에 보관합니다. 사본을 먼저 내보내 확인하세요. 브라우저 데이터 삭제에 대비하려면 별도 파일 백업이 필요합니다.</p><div class="row"><button class="btn sm" data-act="storage-backup">사본 내보내기</button><button class="btn sm" data-act="storage-recover">사본으로 복원</button></div></div>`;
  h+=`<div class="card"><div class="field"><label>데이터</label></div>
    <div class="set-row"><div><div class="t">내보내기</div><div class="d">전체 기록을 JSON으로 복사·저장</div></div><button class="btn sm" data-act="export">내보내기</button></div>
    <div class="set-row"><div><div class="t">가져오기</div><div class="d">내보낸 JSON으로 복원 (현재 데이터 교체)</div></div><button class="btn sm" data-act="import">가져오기</button></div>
    ${hasSample?`<div class="set-row"><div><div class="t">샘플 데이터 삭제</div><div class="d">둘러보기용 기록만 지웁니다</div></div><button class="btn sm danger" data-act="sample-del">삭제</button></div>`:''}
    <div class="set-row"><div><div class="t">모든 기록 삭제</div><div class="d">운동 기록·루틴·사용자 운동 전체${cloud.syncUser?' · 서버 기록도 함께 삭제':''}</div></div><button class="btn sm danger" data-act="wipe">전체 삭제</button></div></div>`;
  h+=`<div class="card"><div class="field"><label>이 앱</label></div><p class="muted" style="margin:0;font-size:13px;line-height:1.6">기록은 이 브라우저에 저장되고, 로그인하면 Supabase 서버에도 동기화됩니다. 아이폰에서는 Safari 공유 버튼 → <b>홈 화면에 추가</b>로 설치하면 전체화면 앱처럼 쓸 수 있어요. 기기를 바꾸기 전에는 꼭 내보내기로 백업하세요.</p></div>`;
  h+=`<div class="card"><div class="field"><label>일러스트 출처</label></div><p class="artwork-note">Everkinetic 및 Workout Guide / Bryl Lim · CC BY-SA 4.0. 원본 배경 제거·크기 정규화·테마 색상·작은 썸네일 윤곽선 보강을 적용했습니다. 그림의 변경본도 같은 라이선스로 제공합니다.</p><button class="btn sm" data-act="art-credits">출처와 이용 조건</button></div>`;
  return h+'</div>';
}

/* ===================== picker sheet ===================== */
let P=null;
function openPicker(mode,opt){
  if(RE&&!P){const body=$('.sheet .body');routineScroll=body?body.scrollTop:0;}
  const hasBm=S.exercises.some(e=>e.bookmark);
  P=Object.assign({mode:mode||'day',tab:'add',q:'',part:hasBm?'북마크':'전체',sort:'recent',equipment:[],selected:[],expanded:null},opt||{});
  P.isReplace=P.mode==='replace'||P.mode==='rreplace';
  if(P.mode!=='day')P.tab='add';
  renderPicker();
  syncHistory();
}
function closePicker(){P=null;if(RE)renderRoutineEditor();else $('#overlay').innerHTML='';syncHistory();}
function renderPicker(){
  if(!P)return;
  const title=P.mode==='replace'||P.mode==='rreplace'?'운동 교체':P.mode==='routine'?'루틴에 운동 추가':fmtDay(V.date);
  let h=`<div class="sheet"><header class="topbar"><span class="topbar-s"><button class="iconbtn" data-act="picker-close" aria-label="닫기">${I.back}</button></span><h1>${title}</h1><span class="topbar-s r"></span></header>`;
  if(P.mode==='day')h+=`<div class="tabs">${[['add','직접 추가'],['routine','내 루틴'],['past','불러오기']].map(t=>`<button data-act="picker-tab" data-v="${t[0]}" class="${P.tab===t[0]?'on':''}">${t[1]}</button>`).join('')}</div>`;
  h+='<div class="body">';
  if(P.tab==='add')h+=pickerAdd();else if(P.tab==='routine')h+=pickerRoutine();else h+=pickerPast();
  h+='</div>';
  if(P.tab==='add'){const n=P.selected.length;
    h+=`<div class="foot"><button class="btn" style="flex:0 0 56px" data-act="custom-new" aria-label="사용자 정의 운동 추가">${I.plus}</button><button class="btn primary" data-act="picker-confirm" ${n?'':'disabled'}>${n?(P.isReplace?'이 운동으로 교체':n+'개 추가'):'운동을 선택해주세요'}</button></div>`;}
  const prev=$('.sheet .body');const st=prev&&P.renderedTab===P.tab?prev.scrollTop:0;
  $('#overlay').innerHTML=h+'</div>';
  const body=$('.sheet .body');if(body&&st)body.scrollTop=st;P.renderedTab=P.tab;
  const q=$('#pq');if(q&&P.focusQ){q.focus();q.setSelectionRange(q.value.length,q.value.length);P.focusQ=false;}
}
/* 선택 토글은 전체를 다시 그리지 않고 해당 행과 하단 버튼만 갱신 (스크롤 유지) */
function updatePickerSelection(){
  document.querySelectorAll('.item[data-act="picker-sel"]').forEach(el=>{const on=P.selected.includes(el.dataset.id);el.classList.toggle('sel',on);el.querySelector('.cb').innerHTML=on?I.check:'';});
  const btn=$('[data-act="picker-confirm"]');if(!btn)return;const n=P.selected.length;btn.disabled=!n;
  btn.textContent=n?(P.isReplace?'이 운동으로 교체':n+'개 추가'):'운동을 선택해주세요';
}
function pickerAdd(){
  let h=`<div class="search">${I.search}<input id="pq" type="search" placeholder="찾으시는 운동을 검색해보세요" value="${esc(P.q)}" data-act="picker-q" autocomplete="off"></div>`;
  h+=`<div class="chips">${['북마크','전체',...PARTS].map(p=>`<button class="pill ${P.part===p?'on':''}" data-act="picker-part" data-v="${p}">${p==='북마크'?I.star:p}</button>`).join('')}</div>`;
  h+=`<div class="chips" aria-label="기구 필터">${[['all','전체 기구'],...Object.entries(EQUIPMENT)].map(([k,label])=>`<button class="pill ${(k==='all'?!P.equipment.length:P.equipment.includes(k))?'on':''}" data-act="picker-equipment" data-v="${k}" aria-pressed="${k==='all'?!P.equipment.length:P.equipment.includes(k)}">${label}</button>`).join('')}</div>`;
  h+=`<div class="picker-sort"><span class="seg">${[['recent','최근순'],['frequency','빈도순'],['name','이름순']].map(([v,label])=>`<button data-act="picker-sort" data-v="${v}" class="${P.sort===v?'on':''}" aria-pressed="${P.sort===v}">${label}</button>`).join('')}</span><small class="muted">누적 횟수는 완료한 본세트가 있는 날짜 기준</small></div>`;
  h+=`<div id="picker-list">${pickerAddList()}</div>`;
  return h;
}
function pickerAddList(){
  const usage=exerciseUsage(),q=P.q.trim().toLowerCase(),list=sortedPickerExercises(usage);
  if(!list.length)return `<div class="empty" style="padding-top:20px"><p>${P.part==='북마크'&&!q?'북마크한 운동이 없어요. 운동 목록에서 책갈피를 눌러 추가하세요.':'검색 결과가 없어요. 아래 + 버튼으로 직접 추가할 수 있어요.'}</p><button class="btn sm" data-act="picker-reset">필터 초기화</button></div>`;
  return '<div class="list">'+list.map(e=>{const sel=P.selected.includes(e.id);
    return `<div class="item ${sel?'sel':''}" data-act="picker-sel" data-id="${e.id}"><span class="cb">${sel?I.check:''}</span>${thumb(e)}<div class="grow"><div class="name"><span class="part">${esc(e.part)}</span>${esc(e.name)}${e.custom?' <span class="badge">내 운동</span>':''}</div><div class="sub">누적 <b class="num">${usage[e.id]?.count||0}</b>회${usage[e.id]?.last?' · 마지막 '+ago(usage[e.id].last):' · 수행 기록 없음'}</div></div><button class="star ${e.bookmark?'on':''}" data-act="bookmark" data-id="${e.id}" aria-label="북마크">${I.star}</button></div>`;}).join('')+'</div>';
}
function lastSummary(exId,beforeKey){
  const lr=lastRecord(exId,beforeKey);if(!lr)return '';const ex=exById(exId);
  const mode=modeOf(ex),s=lr.sets.filter(x=>!x.warm&&(mode==='reps'?x.reps!=='':(x.kg!==''||x.reps!=='')));if(!s.length)return '';
  if(mode==='time'){const top=s.reduce((a,x)=>num(x.kg)>num(a.kg)?x:a,s[0]);return s.length+'세트 · '+num(top.kg)+'분';}
  const maxKg=mode==='weight'?Math.max(...s.map(x=>num(x.kg))):0;
  if(maxKg>0){const top=s.find(x=>num(x.kg)===maxKg);return s.length+'세트 · '+maxKg+'kg×'+num(top.reps);}
  const maxReps=Math.max(...s.map(x=>num(x.reps)));return s.length+'세트 · 최고 '+maxReps+'회';
}
function pickerRoutine(){
  if(!S.routines.length)return `<div class="empty">${I.tabRoutine}<h2>저장된 루틴이 없어요</h2><p>루틴 탭에서 만들거나, 오늘 운동을 마친 뒤 루틴으로 저장하세요.</p></div>`;
  return S.routines.map(r=>`<div class="card rt"><div class="t"><h3>${esc(r.name)}</h3></div>${routineCoverage(r)}${avatars(r)}<div class="exs">${r.items.map(i=>esc(exById(i.exId).name)+' <span class="num">'+i.sets.length+'세트</span>').join(' · ')}</div><div class="last">${r.lastUsed?'마지막 운동일 '+fmtDay(r.lastUsed):'수행 기록 없음'}</div><div class="acts"><button class="btn sm primary" data-act="picker-routine" data-id="${r.id}">불러오기</button></div></div>`).join('');
}
function pickerPast(){
  const ds=sortedDates().filter(k=>k!==V.date).reverse().slice(0,40);
  if(!ds.length)return `<div class="empty">${I.tabToday}<h2>이전 운동 기록이 없어요</h2><p>기록이 쌓이면 지난 운동을 그대로 불러올 수 있어요.</p></div>`;
  return '<p class="muted" style="margin:4px 0 0;font-size:14px;font-weight:600">이전 운동 기록을 선택해주세요.</p>'+ds.map(k=>{const w=S.workouts[k],open=P.expanded===k;
    return `<div class="exp ${open?'open':''}"><div class="exp-h" data-act="picker-expand" data-v="${k}"><div><div class="d">${fmtDay(k)}</div><div class="p">${[partsOf(w).join(' · '),w.items.length+'종목',dayVolText(w)].filter(Boolean).join(' · ')}</div></div>${I.chev}</div>
      ${open?`<div class="exp-b">${w.items.map(it=>{const ex=exById(it.exId);const m=modeOf(ex),s=it.sets.filter(x=>m==='reps'?x.reps!=='':(x.kg!==''||x.reps!==''));return `<div class="li"><span>${esc(ex.name)}</span><span class="s">${s.map(x=>m==='time'?num(x.kg)+'분':(m==='weight'&&num(x.kg)>0)?num(x.kg)+'×'+num(x.reps):num(x.reps)+'회').join(', ')||'-'}</span></div>`;}).join('')}<div style="margin-top:10px"><button class="btn primary block" data-act="picker-past" data-v="${k}">이 날 운동 불러오기</button></div></div>`:''}</div>`;}).join('');
}

/* ===================== routine editor ===================== */
let RE=null,routineScroll=0;
function openRoutineEditor(r){routineScroll=0;RE=r?JSON.parse(JSON.stringify(r)):{id:uid(),name:'',items:[],createdAt:Date.now(),lastUsed:null};RE.isNew=!r;renderRoutineEditor();syncHistory();}
function renderRoutineEditor(){
  if(!RE)return;
  let h=`<div class="sheet"><header class="topbar"><span class="topbar-s"><button class="iconbtn" data-act="re-close" aria-label="닫기">${I.back}</button></span><h1>${RE.isNew?'새 루틴':'루틴 편집'}</h1><span class="topbar-s r"></span></header><div class="body">`;
  h+=`<div class="card"><div class="field"><label>루틴 이름</label><input type="text" id="re-name" value="${esc(RE.name)}" placeholder="예: 등·이두 (월)" data-act="re-name"></div></div>`;
  h+=routineCoverage(RE)+`<p class="muted routine-hint">주요 부위 기준 · 준비 세트 제외 · 보조근 중복 계산 없음</p>`;
  const im=inputMode();
  RE.items.forEach((it,i)=>{const ex=exById(it.exId),mode=modeOf(ex),M=MODES[mode];
    h+=`<section class="card ex" data-ri="${i}"><div class="ex-head"><span class="ex-idx">${i+1}</span>${thumb(ex,'sm')}<div class="grow ex-title"><span class="part">${esc(ex.part)}</span><span>${esc(ex.name)}</span></div>
      <button class="iconbtn" data-act="re-menu" aria-label="운동 메뉴">${I.more}</button></div>
      <div class="sets noDone ${mode}"><span class="h">세트</span>${M.cols.map(c=>`<span class="h">${c}</span>`).join('')}`;
    let wIdx=0;
    it.sets.forEach((s,j)=>{const n=s.type==='warm'?0:(++wIdx);h+=setCell(s,n,`data-rsetopt="${j}"`)+setInputs(M,s,im,`id="rkg-${i}-${j}" data-rkg="${j}"`,`id="rrp-${i}-${j}" data-rreps="${j}"`,j,'');});
    h+=`</div><div class="set-actions"><button data-act="re-set-del">${I.minus}세트삭제</button><button class="add" data-act="re-set-add">${I.plus}세트추가</button></div></section>`;});
  h+=`<button class="btn block" data-act="re-add">${I.plus} 운동 추가</button></div>`;
  h+=`<div class="foot"><button class="btn primary" data-act="re-save">저장</button></div></div>`;
  const prev=$('.sheet .body');const st=prev&&$('#re-name')?prev.scrollTop:routineScroll;
  $('#overlay').innerHTML=h;
  const body=$('.sheet .body');if(!body)return;
  if(RE.scrollTo!=null){const el=document.querySelector(`[data-ri="${RE.scrollTo}"]`);RE.scrollTo=null;if(el)el.scrollIntoView({block:'start'});}
  else body.scrollTop=st;
  routineScroll=body.scrollTop;
}

/* ===================== modal & history ===================== */
let historyPushed=false,closingFromPop=false;
function syncHistory(){
  const open=!!($('#modal').innerHTML||$('#overlay').innerHTML);
  if(open&&!historyPushed){try{history.pushState({liftlogOverlay:true},'');historyPushed=true;}catch(e){}}
  else if(!open&&historyPushed&&!closingFromPop){historyPushed=false;try{history.back();}catch(e){}}
}
window.addEventListener('popstate',()=>{
  if($('#modal').innerHTML){closingFromPop=true;closeModal();closingFromPop=false;if($('#overlay').innerHTML){try{history.pushState({liftlogOverlay:true},'');historyPushed=true;}catch(e){}}else historyPushed=false;}
  else if(P){closingFromPop=true;closePicker();closingFromPop=false;if(RE){try{history.pushState({liftlogOverlay:true},'');historyPushed=true;}catch(e){}}else historyPushed=false;}
  else if(RE){closingFromPop=true;RE=null;$('#overlay').innerHTML='';closingFromPop=false;historyPushed=false;}
  else historyPushed=false;
});
function modal(html){$('#modal').innerHTML=`<div class="modal-bg" data-act="modal-bg"><div class="modal">${html}</div></div>`;syncHistory();}
function closeModal(){$('#modal').innerHTML='';syncHistory();}
function confirmBox(title,desc,okLabel,onOk,danger){
  modal(`<h3>${title}</h3>${desc?`<p>${desc}</p>`:''}<div class="acts"><button class="btn" data-act="modal-close">취소</button><button class="btn ${danger?'danger':'primary'}" id="m-ok">${okLabel}</button></div>`);
  $('#m-ok').onclick=()=>{$('#modal').innerHTML='';onOk();syncHistory();};
}
function menuBox(title,items){
  modal(`<h3>${title}</h3><div class="menu">${items.map((it,i)=>`<button data-mi="${i}" class="${it.danger?'danger':''}">${it.icon||''}${it.label}</button>`).join('')}</div>`);
  document.querySelectorAll('[data-mi]').forEach(b=>{b.onclick=()=>{
    // 히스토리를 건드리지 않고 비운 뒤 실행 → 다음 동작이 모달을 열면 history.back()의 popstate가 새 모달을 닫아버리는 문제 방지
    $('#modal').innerHTML='';items[+b.dataset.mi].fn();syncHistory();};});
}
/* 세트 옵션 시트: 세트 타입(일반/웜업/드롭/실패), 운동 강도(세트·종목 1RM), RPE, 바벨 원판 계산.
   ctx={ex,sets,j,full,beforeKey,onChange}. full=false(루틴 편집)면 타입만. 바뀔 때마다 onChange 호출 */
function setOptionsBox(ctx){
  const {ex,sets,j,full}=ctx,s=sets[j],weight=modeOf(ex)==='weight',kg=num(s.kg),reps=num(s.reps);
  let h=`<div class="row"><h3 class="grow">${j+1}세트 <span class="muted" style="font-weight:600;font-size:14px">${esc(ex.name)}</span></h3><button class="iconbtn" data-act="modal-close" aria-label="닫기" style="margin:-8px -8px -8px 0">${I.plus.replace('<svg','<svg style="transform:rotate(45deg)"')}</button></div>`;
  if(full&&weight){
    const setRm=kg>0&&reps>0?e1rm(kg,reps):0,best=Math.max(bestE1rm(ex.id,ctx.beforeKey),...sets.filter((x,i)=>i!==j&&x.done&&!x.warm&&num(x.reps)>0).map(x=>e1rm(num(x.kg),num(x.reps))));
    const pct=best>0&&kg>0?Math.round(kg/best*100):0;
    const stage=pct>=100?'최대':pct>=90?'매우 높음':pct>=80?'높음':pct>=65?'보통':pct>0?'가벼움':'';
    h+=`<div><div class="sec-h">운동 강도 <span class="muted">종목 최고 1RM 대비</span></div>
      <div class="kv" style="margin-top:8px"><span class="k">강도</span><span class="v big">${pct?pct+'%':'–'}</span><span class="k">${stage?stage+' · ':''}세트 추정 1RM</span><span class="v">${setRm?Math.round(setRm)+'kg':'–'}</span><span class="k">종목 최고 1RM</span><span class="v">${best?Math.round(best)+'kg':'기록 없음'}</span></div>
      ${setRm||best?'':'<p class="muted" style="font-size:12px;margin:8px 0 0">무게와 횟수를 입력하면 Epley 공식으로 추정해요.</p>'}</div>`;
  }
  h+=`<div><div class="sec-h">세트 타입</div><div class="types" style="margin-top:8px">${Object.keys(SET_TYPES).map(t=>`<button data-t="${t}" class="${(s.type||'')===t?'on':''}">${t?`<b>${TYPE_TAG[t]}</b>`:''}${SET_TYPES[t]}</button>`).join('')}</div>
    <p class="muted" style="font-size:12px;margin:8px 0 0">웜업 세트는 볼륨·1RM·PR 계산에서 빠져요. 드롭·실패 세트는 본세트로 계산돼요.</p></div>`;
  if(full){
    h+=`<div><div class="sec-h">운동 자각도 (RPE) <button class="muted" data-rpe="" style="font-weight:600">${s.rpe!=null?'지우기':''}</button></div>
      <p class="muted" style="font-size:12px;margin:4px 0 8px">이 세트가 얼마나 힘들었는지. 10 = 더는 한 개도 못 함</p>
      <div class="rpe">${[6,6.5,7,7.5,8,8.5,9,9.5,10].map(v=>`<button data-rpe="${v}" class="${s.rpe===v?'on':''}">${v}</button>`).join('')}</div></div>`;
  }
  if(full&&weight){
    const bar=S.settings.barKg,r=platesFor(kg,bar);
    h+=`<div><div class="sec-h">바벨 원판 계산 <span class="seg">${[20,15,10].map(b=>`<button data-bar="${b}" class="${bar===b?'on':''}">${b}kg 봉</button>`).join('')}</span></div>
      <div class="plates" style="margin-top:8px">${kg<=0?'<span class="muted" style="font-size:13px">무게를 입력하면 한쪽에 끼울 원판을 계산해요.</span>':r.under?`<span class="muted" style="font-size:13px">봉 무게(${bar}kg)보다 가벼워요.</span>`:(r.plates.length?r.plates.map(p=>`<span class="pl ${p<5?'s':''}">${p}</span>`).join(''):'<span class="muted" style="font-size:13px">빈 봉</span>')+(r.rem?`<span class="pl x">+${r.rem}</span>`:'')}</div>
      ${kg>bar?`<p class="muted" style="font-size:12px;margin:6px 0 0">한쪽 기준 · ${kg}kg = 봉 ${bar}kg + 양쪽 ${Math.round((kg-bar)/2*100)/100}kg${r.rem?' · '+r.rem+'kg은 원판으로 못 맞춰요':''}</p>`:''}</div>`;
  }
  modal(h);
  const m=$('#modal');
  m.querySelectorAll('[data-t]').forEach(b=>{b.onclick=()=>{setType(s,b.dataset.t);ctx.onChange();setOptionsBox(ctx);};});
  m.querySelectorAll('[data-rpe]').forEach(b=>{b.onclick=()=>{const v=b.dataset.rpe===''?null:+b.dataset.rpe;s.rpe=s.rpe===v?null:v;ctx.onChange();setOptionsBox(ctx);};});
  m.querySelectorAll('[data-bar]').forEach(b=>{b.onclick=()=>{S.settings.barKg=+b.dataset.bar;save();setOptionsBox(ctx);};});
}
function exInfoBox(ex){
  const info=artworkInfo(ex),mode=modeOf(ex),record=mode==='reps'?'횟수 기록':mode==='time'?'시간(분) · 강도/거리 기록':'무게(kg) × 횟수 기록';
  modal(`<h3><span class="muted" style="font-weight:600;font-size:14px;margin-right:6px">${esc(ex.part)}</span>${esc(ex.name)}</h3>
    <div class="ex-art-preview">${exerciseIcon(ex)}</div><p class="muted">${record}</p>
    <p class="artwork-note">${info.kind==='illustration'?`일러스트: <a href="${info.url}" target="_blank" rel="noopener noreferrer">${esc(info.creator)}</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>`:'동작 일러스트 미제공 · 부위·기구 대체 타일'}${info.note?'<br>'+esc(info.note):''}</p>
    ${hasImg(ex)?`<div class="frames"><figure><img src="img/${ex.id}-0.webp" alt="${esc(ex.name)} 시작 자세"><figcaption>시작</figcaption></figure><figure><img src="img/${ex.id}-1.webp" alt="${esc(ex.name)} 끝 자세"><figcaption>끝</figcaption></figure></div><p class="muted" style="font-size:11px">자세 참고 사진: free-exercise-db (퍼블릭 도메인)</p>`:'<p class="muted">일러스트는 종목 식별을 위한 그림입니다. 운동 자세 지도를 대신하지 않습니다.</p>'}
    <button class="btn block" data-act="modal-close">닫기</button>`);
}
function customExBox(edit){
  // edit: 기존 사용자 정의 운동 객체를 주면 수정 모드 (같은 ID 유지 → 기존 기록·루틴에 바로 반영)
  const sel=(v,cur)=>v===cur?' selected':'';const mode=edit?edit.mode||'weight':'weight';
  modal(`<h3>${edit?'운동 정보 수정':'사용자 정의 운동'}</h3><div class="field"><label>이름</label><input type="text" id="cx-name" placeholder="예: 스미스 머신 스쿼트" maxlength="40" value="${edit?esc(edit.name):''}"></div>
    <div class="field"><label>부위</label><select id="cx-part">${PARTS.map(p=>`<option value="${p}"${sel(p,edit&&edit.part)}>${p}</option>`).join('')}</select></div>
    <div class="field"><label for="cx-equipment">기구</label><select id="cx-equipment">${Object.entries(EQUIPMENT).map(([k,label])=>`<option value="${k}"${sel(k,edit?equipmentOf(edit):'unknown')}>${label}</option>`).join('')}</select></div>
    <div class="field"><label>기록 방식</label><select id="cx-mode">${Object.keys(MODES).map(m=>`<option value="${m}"${sel(m,mode)}>${MODES[m].label}</option>`).join('')}</select></div>
    <p class="muted" style="font-size:12px">무게 × 횟수: kg·회 입력, 볼륨·1RM 계산 (가중 풀업·딥스도 여기) / 횟수 기준: 회만 입력 / 시간 기준: 분·강도/거리 입력${edit?'<br>바꾸면 기존 기록에도 바로 적용돼요. 횟수 기준으로 바꾸면 이미 적은 kg 는 숨겨지고 계산에서 빠져요.':''}</p>
    <div class="acts"><button class="btn" data-act="modal-close">취소</button><button class="btn primary" id="cx-ok">${edit?'저장':'추가'}</button></div>`);
  setTimeout(()=>{const x=$('#cx-name');if(x)x.focus();},50);
  $('#cx-ok').onclick=()=>{const name=$('#cx-name').value.trim();if(!name){toast('이름을 입력하세요');return;}
    const part=$('#cx-part').value,md=$('#cx-mode').value,equipment=$('#cx-equipment').value;
    if(edit){Object.assign(edit,{name,part,mode:md,equipment});if(md!=='weight')delete edit.progression;save();closeModal();if(P)renderPicker();else render();toast('운동 정보를 바꿨어요');return;}
    const dup=S.exercises.find(x=>x.custom&&x.name===name);
    if(dup){confirmBox('같은 이름의 운동','"'+esc(name)+'"이(가) 이미 있어요. 새로 만들지 않고 기존 운동의 부위·기록 방식을 바꿀까요? 기존 기록에도 바로 반영돼요.','기존 운동 수정',()=>{Object.assign(dup,{part,mode:md,equipment});if(md!=='weight')delete dup.progression;save();if(P)renderPicker();else render();toast('운동 정보를 바꿨어요');});return;}
    const e={id:'cx'+uid(),name,part,mode:md,equipment,custom:true,bookmark:true};S.exercises.push(e);save();closeModal();
    if(P){P.selected.push(e.id);P.q='';P.part='북마크';P.equipment=[];renderPicker();}else render();toast('운동을 추가했어요');};
}
function saveRoutineBox(w){
  modal(`<h3>오늘 운동을 루틴으로 저장</h3><p>${w.items.length}개 종목의 세트 구성(무게·횟수)이 함께 저장돼요.</p><div class="field"><label>루틴 이름</label><input type="text" id="sr-name" placeholder="예: 등·이두" maxlength="40"></div>
    <div class="acts"><button class="btn" data-act="modal-close">취소</button><button class="btn primary" id="sr-ok">저장</button></div>`);
  setTimeout(()=>$('#sr-name').focus(),50);
  $('#sr-ok').onclick=()=>{const name=$('#sr-name').value.trim()||fmtDay(V.date)+' 루틴';
    S.routines.unshift({id:uid(),name,createdAt:Date.now(),lastUsed:V.date,items:w.items.map(it=>({exId:it.exId,sets:it.sets.map(s=>{const c=copySet(s);delete c.done;return c;})}))});save();closeModal();toast('루틴으로 저장했어요');};
}
function exportBox(json=JSON.stringify(S)){
  modal(`<h3>데이터 내보내기</h3><p>아래 내용을 복사해 메모 앱 등에 붙여 두거나, 파일로 저장하세요. (${(json.length/1024).toFixed(1)} KB)</p>
    <div class="field"><textarea id="ex-json" readonly>${esc(json)}</textarea></div>
    <div class="acts"><button class="btn" id="ex-copy">복사</button><button class="btn primary" id="ex-dl">파일로 저장</button></div><button class="btn ghost" data-act="modal-close">닫기</button>`);
  $('#ex-copy').onclick=()=>{const ta=$('#ex-json');const ok=()=>toast('복사했어요');const fb=()=>{ta.focus();ta.select();try{document.execCommand('copy');ok();}catch(e){toast('길게 눌러 직접 복사해주세요');}};
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(json).then(ok,fb);else fb();};
  $('#ex-dl').onclick=()=>{try{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([json],{type:'application/json'}));a.download='liftlog-'+todayKey()+'.json';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);toast('다운로드가 막혀 있으면 복사를 이용하세요');}catch(e){toast('이 환경에서는 저장이 안 돼요. 복사를 이용하세요');}};
}
function importBox(){
  modal(`<h3>데이터 가져오기</h3><p>내보내기로 만든 JSON을 붙여넣거나 파일을 선택하세요. <b>현재 데이터는 모두 교체</b>됩니다.</p>
    <div class="field"><label>파일</label><input type="file" id="im-file" accept=".json,application/json"></div>
    <div class="field"><label>또는 붙여넣기</label><textarea id="im-json" placeholder='{"version":1,...}'></textarea></div>
    <div class="acts"><button class="btn" data-act="modal-close">취소</button><button class="btn danger" id="im-ok">교체하고 가져오기</button></div>`);
  $('#im-file').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{$('#im-json').value=r.result;};r.readAsText(f);};
  $('#im-ok').onclick=()=>{let d;try{d=JSON.parse($('#im-json').value);}catch(e){toast('JSON 형식이 올바르지 않아요');return;}
    if(!replaceState(d))return;closeModal();V.tab='today';render();toast('가져왔어요');};
}

/* ===================== workout duration & wake lock ===================== */
function renderSession(w,k){
  const running=!!w.resumedAt,measured=workoutDuration(w)!=null,canStart=k===todayKey()||!!w.startedAt;
  const status=w.finishedAt?'완료':running?'진행 중':measured?'일시정지':'시작 전';
  return `<div class="session"><div class="session-foot"><span class="hint">${status}</span><span class="session-controls"><button class="btn ghost sm" data-act="duration-edit">${measured?'시간 수정':'직접 입력'}</button>
    ${w.finishedAt?'':running?'<button class="btn sm" data-act="session-pause">일시정지</button>':canStart?`<button class="btn primary sm" data-act="session-start">${measured?'계속하기':'운동 시작'}</button>`:''}</span></div></div>`;
}
function refreshDuration(){
  const w=S.workouts[V.date],el=$('#workout-duration');
  if(el&&w)el.textContent=fmtDuration(workoutDuration(w));
}
function durationBox(w){
  const total=Math.floor((workoutDuration(w)||0)/1000);
  modal(`<h3>전체 운동 시간</h3><p>운동한 총 시간을 입력하세요. 1시간 10분은 70분으로 입력하면 돼요. 일시정지한 시간은 제외합니다.</p>
    <div class="row"><div class="field grow"><label for="duration-min">분</label><input id="duration-min" type="number" inputmode="numeric" min="0" step="1" value="${Math.floor(total/60)}"></div><div class="field grow"><label for="duration-sec">초</label><input id="duration-sec" type="number" inputmode="numeric" min="0" max="59" step="1" value="${total%60}"></div></div>
    <div class="acts"><button class="btn" data-act="modal-close">취소</button><button class="btn primary" id="duration-ok">저장</button></div>`);
  $('#duration-ok').onclick=()=>{
    const m=$('#duration-min').value.trim(),s=$('#duration-sec').value.trim(),minutes=Number(m),seconds=Number(s);
    if(!m||!s||!Number.isSafeInteger(minutes)||minutes<0||!Number.isInteger(seconds)||seconds<0||seconds>59||!Number.isSafeInteger((minutes*60+seconds)*1000)){toast('분은 0 이상의 정수, 초는 0~59로 입력하세요');return;}
    w.durationMs=(minutes*60+seconds)*1000;
    if(w.resumedAt)w.resumedAt=Date.now();
    flushSave();closeModal();render();toast('운동 시간을 저장했어요');
  };
}
let wakeLock=null;
async function updateWakeLock(){
  if(!('wakeLock' in navigator))return;
  const want=!!(S&&S.settings&&S.settings.wakeLock&&V.tab==='today'&&S.workouts[V.date]?.resumedAt&&!document.hidden);
  try{
    if(want&&!wakeLock){wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener('release',()=>{wakeLock=null;});}
    else if(!want&&wakeLock){await wakeLock.release();wakeLock=null;}
  }catch(e){}
}
setInterval(()=>{if(!document.hidden)refreshDuration();},1000);

/* ===================== in-app keypad ===================== */
/* 세트 입력칸(.sets input)은 설정의 keypad 가 켜져 있으면 inputmode=none 으로 시스템 키보드를 막고,
   포커스 시 화면 하단에 앱 키패드를 띄운다. 키패드 버튼은 pointerdown/mousedown 을 preventDefault 해
   입력칸의 포커스를 뺏지 않는다. 값 변경은 input 이벤트를 다시 쏴서 기존 저장 로직을 그대로 탄다. */
const KP={el:null,fresh:false};
const isSetInput=el=>!!(el&&el.matches&&el.matches('.sets input'));
function kpSteps(col){return col==='reps'?[1,5]:col==='kg'?[2.5,5]:[1,5];}
function kpInputs(){return [...document.querySelectorAll('.sets input')].filter(i=>i.offsetParent!==null);}
function showKeypad(el){
  KP.el=el;KP.fresh=true;
  document.body.classList.add('has-keypad');
  renderKeypad();
  setTimeout(()=>{try{el.scrollIntoView({block:'center',behavior:'smooth'});}catch(e){el.scrollIntoView();}},30);
}
function hideKeypad(){
  if(!KP.el)return;KP.el=null;
  $('#keypad').hidden=true;document.body.classList.remove('has-keypad');
  refreshDuration();
}
function renderKeypad(){
  const el=KP.el;if(!el)return;
  const col=el.dataset.col||'kg',[a,b]=kpSteps(col),unit=col==='kg'?'kg':col==='reps'?'회':col==='min'?'분':col==='dist'?'km·레벨':'';
  const list=kpInputs(),i=list.indexOf(el),isLast=i===list.length-1;
  const info=`<span class="kp-info">${kpInfoHtml()}</span>`;
  $('#keypad').innerHTML=`<div class="kp-top"><button class="nav" data-kp="prev" ${i<=0?'disabled':''} aria-label="이전 칸">${I.up}</button><button class="nav" data-kp="next" ${isLast?'disabled':''} aria-label="다음 칸">${I.down}</button>${info}<button class="nav" data-kp="sys" aria-label="시스템 키보드">${I.keyboard}</button><button class="nav" data-kp="hide" aria-label="키패드 닫기">${I.kpHide}</button></div>
    <button class="k" data-kp="1">1</button><button class="k" data-kp="2">2</button><button class="k" data-kp="3">3</button><button class="k fn" data-kp="-${a}">−${a}</button><button class="k fn" data-kp="+${a}">+${a}</button>
    <button class="k" data-kp="4">4</button><button class="k" data-kp="5">5</button><button class="k" data-kp="6">6</button><button class="k fn" data-kp="-${b}">−${b}</button><button class="k fn" data-kp="+${b}">+${b}</button>
    <button class="k" data-kp="7">7</button><button class="k" data-kp="8">8</button><button class="k" data-kp="9">9</button><button class="k fn sm span2" data-kp="copy" title="위 세트 값 복사">위 세트와 같게</button>
    <button class="k" data-kp=".">.</button><button class="k" data-kp="0">0</button><button class="k" data-kp="bs" aria-label="지우기">${I.backspace}</button><button class="k go span2 ${isLast?'done':''}" data-kp="${isLast?'ok':'next'}">${isLast?'완료':'다음'}${unit?` <small style="opacity:.75;font-weight:600">${unit}</small>`:''}</button>`;
  $('#keypad').hidden=false;
}
function kpInfoHtml(){
  return esc(KP.el?KP.el.getAttribute('aria-label')||'':'');
}
function kpSet(val){const el=KP.el;if(!el)return;el.value=cleanNum(val);el.dispatchEvent(new Event('input',{bubbles:true}));}
function kpPress(key){
  const el=KP.el;if(!el)return;
  if(key==='hide'){el.blur();hideKeypad();return;}
  if(key==='sys'){el.setAttribute('inputmode','decimal');KP.sysEl=el;hideKeypad();el.blur();el.focus();return;}
  if(key==='prev'||key==='next'||key==='ok'){const list=kpInputs(),i=list.indexOf(el);
    if(key==='ok'){el.blur();hideKeypad();return;}
    const n=key==='prev'?list[i-1]:list[i+1];if(n){n.focus();}return;}
  if(key==='bs'){kpSet(KP.fresh?'':el.value.slice(0,-1));KP.fresh=false;return;}
  if(key==='copy'){const list=kpInputs(),i=list.indexOf(el);const same=list.slice(0,i).reverse().find(x=>x.dataset.col===el.dataset.col&&x.closest('section')===el.closest('section'));if(same&&same.value!==''){kpSet(same.value);KP.fresh=false;}else toast('위 세트에 값이 없어요');return;}
  if(key[0]==='+'||key[0]==='-'){const cur=num(el.value),d=parseFloat(key);let v=Math.max(0,Math.round((cur+d)*100)/100);kpSet(String(v));KP.fresh=false;return;}
  if(key==='.'){if(KP.fresh){kpSet('0.');KP.fresh=false;return;}if(!el.value.includes('.'))kpSet(el.value+'.');return;}
  if(/^\d$/.test(key)){kpSet(KP.fresh?key:el.value+key);KP.fresh=false;if(el.value.length>=6)KP.fresh=false;return;}
}
document.addEventListener('focusin',e=>{
  const t=e.target;if(!isSetInput(t))return;
  if(KP.sysEl===t){KP.sysEl=null;return;}
  if(S.settings.keypad){if(t.getAttribute('inputmode')!=='none')t.setAttribute('inputmode','none');showKeypad(t);}
});
document.addEventListener('focusout',e=>{
  if(!isSetInput(e.target))return;
  setTimeout(()=>{const a=document.activeElement;if(!isSetInput(a)||a.getAttribute('inputmode')!=='none')hideKeypad();},10);
});
const kpEl=$('#keypad');
['pointerdown','mousedown','touchstart'].forEach(ev=>kpEl.addEventListener(ev,e=>{if(ev!=='touchstart')e.preventDefault();},{passive:ev==='touchstart'}));
kpEl.addEventListener('click',e=>{const b=e.target.closest('[data-kp]');if(b&&!b.disabled)kpPress(b.dataset.kp);});

/* ===================== sample data ===================== */
function makeSample(){
  const find=n=>S.exercises.find(e=>e.name===n).id;
  const plans=[
    ['등·팔',[['랫풀다운',[[40,12],[45,10],[45,10],[50,8]]],['시티드 케이블 로우',[[40,12],[45,12],[50,10]]],['케이블 풀오버',[[20,15],[25,12],[25,12]]],['바벨 컬',[[20,12],[25,10],[25,10]]]]],
    ['하체',[['레그 프레스',[[100,12],[120,10],[140,8],[140,8]]],['레그 익스텐션',[[40,15],[45,12],[50,12]]],['레그 컬',[[35,12],[40,12],[40,10]]],['계단 오르기',[[15,'']]]]],
    ['가슴·어깨',[['벤치 프레스',[[50,10],[60,8],[65,6],[65,6]]],['인클라인 덤벨 프레스',[[18,12],[20,10],[22,8]]],['사이드 레터럴 레이즈',[[8,15],[10,12],[10,12]]],['트라이셉스 푸시다운',[[25,15],[30,12],[30,12]]]]]
  ];
  const t=todayKey();let p=0;
  for(let d=27;d>=1;d--){const k=addDays(t,-d);const dow=parse(k).getDay();if(dow===0||dow===3)continue;
    const plan=plans[p%3];const wk=Math.floor((27-d)/7);p++;
    const w={date:k,startedAt:parse(k).getTime()+19*3600000,finishedAt:parse(k).getTime()+20*3600000+10*60000,durationMs:70*60000,resumedAt:null,items:[],sample:true};
    plan[1].forEach(ex=>{const id=find(ex[0]);const bump=modeOf(exById(id))==='weight'?(wk*2.5):0;
      w.items.push({id:uid(),exId:id,memo:'',sets:ex[1].map(s=>({kg:s[0]?s[0]+bump:s[0],reps:s[1],done:true,warm:false}))});});
    S.workouts[k]=w;}
  ['랫풀다운','시티드 케이블 로우','케이블 풀오버','바벨 컬','레그 프레스','레그 익스텐션','벤치 프레스','사이드 레터럴 레이즈'].forEach(n=>{S.exercises.find(e=>e.name===n).bookmark=true;});
  plans.forEach(pl=>S.routines.push({id:uid(),name:pl[0]+' (샘플)',createdAt:Date.now(),lastUsed:null,items:pl[1].map(ex=>({exId:find(ex[0]),sets:ex[1].map(s=>({kg:s[0],reps:s[1],warm:false}))}))}));
  save();
}


function fmtSync(ts){const d=new Date(ts);const k=dkey(d);return (k===todayKey()?'':fmtShort(k)+' ')+pad(d.getHours())+':'+pad(d.getMinutes());}
function renderSyncCard(){
  const st={off:'설정 안 됨',nolib:'모듈 로드 실패',signedout:'로그인 필요',idle:'대기 중',syncing:'동기화 중…',ok:'동기화됨',error:'오류'}[C.status]||C.status;
  let h=`<div class="card"><div class="field"><label>클라우드 동기화 · Supabase</label></div>`;
  if(C.status==='nolib')return h+`<p class="muted" style="margin:0;font-size:13px;line-height:1.5">동기화 모듈을 불러오지 못했어요. 인터넷에 연결된 상태에서 앱을 다시 열어주세요.</p></div>`;
  if(!C.url||!C.anon){
    h+=`<p class="muted" style="margin:0 0 10px;font-size:13px;line-height:1.5">Supabase 프로젝트의 URL과 anon key를 넣으면 기록이 서버에 저장되고, 다른 기기에서도 같은 계정으로 이어집니다. 저장소의 <b>supabase.json</b>에 넣어 빌드하면 이 입력을 건너뛸 수 있어요.</p>
      <div class="field"><label>Project URL</label><input type="text" id="sb-url" placeholder="https://xxxx.supabase.co" autocapitalize="none" autocorrect="off" spellcheck="false"></div>
      <div class="field" style="margin-top:8px"><label>anon public key</label><input type="text" id="sb-anon" placeholder="eyJhbGciOi…" autocapitalize="none" autocorrect="off" spellcheck="false"></div>
      <div style="margin-top:10px"><button class="btn sm primary block" data-act="sync-connect">연결</button></div>`;
  }else if(!cloud.syncUser){
    h+=`<div class="set-row"><div><div class="t">${esc(C.url.replace(/^https?:\/\//,''))}</div><div class="d">${C.status==='error'?'오류: '+esc(C.error):'연결됨 · 로그인하면 동기화가 시작돼요'}</div></div>${window.LIFTLOG_SUPABASE&&window.LIFTLOG_SUPABASE.url===C.url?'':'<button class="btn sm" data-act="sync-disconnect">해제</button>'}</div>
      <div class="field" style="margin-top:10px"><label>이메일</label><input type="email" id="sb-email" autocomplete="username" inputmode="email" autocapitalize="none"></div>
      <div class="field" style="margin-top:8px"><label>비밀번호</label><input type="password" id="sb-pw" autocomplete="current-password"></div>
      <div class="row" style="margin-top:10px"><button class="btn sm primary grow" data-act="sync-login">로그인</button><button class="btn sm grow" data-act="sync-signup">회원가입</button></div>
      <p class="muted" style="margin:10px 0 0;font-size:12px;line-height:1.5">처음 로그인하면 서버 기록이 우선 적용되고, 이 기기에만 있던 기록은 서버로 올라갑니다.</p>`;
  }else{
    h+=`<div class="set-row"><div><div class="t">${esc(cloud.syncUser.email||'')}</div><div class="d">${st}${C.lastSyncAt?' · 마지막 '+fmtSync(C.lastSyncAt):''}${C.status==='error'&&C.error?'<br>'+esc(C.error):''}</div></div><button class="btn sm" data-act="sync-now" ${C.status==='syncing'?'disabled':''}>지금 동기화</button></div>
      <div style="margin-top:10px"><button class="btn sm block" data-act="sync-logout">로그아웃</button></div>`;
  }
  return h+'</div>';
}
async function syncAuth(kind){
  const email=($('#sb-email').value||'').trim(),pw=$('#sb-pw').value||'';
  if(!email||!pw){toast('이메일과 비밀번호를 입력하세요');return;}
  if(pw.length<6){toast('비밀번호는 6자 이상이어야 해요');return;}
  try{
    if(kind==='login'){const {error}=await cloud.sb.auth.signInWithPassword({email,password:pw});if(error)throw error;toast('로그인했어요');}
    else{const {data,error}=await cloud.sb.auth.signUp({email,password:pw});if(error)throw error;
      if(!data.session)toast('확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인하세요');else toast('가입했어요');}
  }catch(e){toast((e.message||'실패').replace('Invalid login credentials','이메일 또는 비밀번호가 틀렸어요'));}
}

/* ===================== events ===================== */
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-act],[data-done],[data-setopt],[data-rsetopt],[data-tab]');if(!b)return;
  if(b.dataset.tab){V.tab=b.dataset.tab;render();return;}
  const w=S.workouts[V.date];
  const itemEl=b.closest('[data-item]');const it=itemEl&&w?w.items.find(x=>x.id===itemEl.dataset.item):null;
  if(b.dataset.setopt!=null&&it){setOptionsBox({ex:exById(it.exId),sets:it.sets,j:+b.dataset.setopt,full:true,beforeKey:V.date,onChange:()=>{save();render();}});return;}
  if(b.dataset.rsetopt!=null&&RE){const i=+b.closest('[data-ri]').dataset.ri,ri=RE.items[i];setOptionsBox({ex:exById(ri.exId),sets:ri.sets,j:+b.dataset.rsetopt,full:false,onChange:()=>renderRoutineEditor()});return;}
  if(b.dataset.done!=null&&it){const j=+b.dataset.done,s=it.sets[j];const ex=exById(it.exId);
    if(!s.done){
      const empty=modeOf(ex)==='reps'?s.reps==='':(s.kg===''&&s.reps==='');
      if(empty&&j>0){s.kg=it.sets[j-1].kg;s.reps=it.sets[j-1].reps;}
      const wasPR=isItemPR(it,V.date);
      s.done=true;
      if(!wasPR&&!s.warm&&isItemPR(it,V.date))toast('🎉 최고 기록 경신! ('+ex.name+')');
    }else{s.done=false;}
    save();render();return;}
  const act=b.dataset.act,v=b.dataset.v;
  switch(act){
    case 'art-credits':modal(`<h3>운동 일러스트 출처</h3><div class="artwork-note"><p>기본 운동 120종 중 112종에 일러스트를 제공합니다. 8종과 사용자 정의 운동은 부위·기구 대체 타일입니다.</p><p><a href="https://github.com/everkinetic/data/tree/446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6" target="_blank" rel="noopener noreferrer">Everkinetic</a>: 65종. <a href="https://github.com/bryllim/workout-guide/tree/aac599224bb9780305239607ef98540b7e0ce389" target="_blank" rel="noopener noreferrer">Workout Guide / Bryl Lim</a>: 47종. 일부 Workout Guide 원본 자세도 Everkinetic에서 파생되었습니다.</p><p>그림 및 변경본: <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>. 저작자·출처를 표시하고 변경 사항을 명시하며, 변경본은 같은 라이선스로 배포합니다.</p><p>변경: 흰 배경 제거, 표시 영역·크기 정규화, 테마 색상, 썸네일 윤곽선 0.45px 보강. 기구·자세 형상은 수정하지 않았습니다. 각 종목 상세에서 원본 링크와 기구·자세 변형을 확인할 수 있습니다.</p><p><a href="artwork/manifest.json" target="_blank" rel="noopener noreferrer">전체 대응표·원본 메타데이터</a> · <a href="artwork/LICENSE-EVERKINETIC.md" target="_blank" rel="noopener noreferrer">Everkinetic 라이선스 전문</a> · <a href="artwork/LICENSE-WORKOUT-GUIDE.md" target="_blank" rel="noopener noreferrer">Workout Guide 라이선스</a></p></div><button class="btn block" data-act="modal-close">닫기</button>`);break;
    case 'stat-range':if([0,7,28,84].includes(+v)){V.statRange=+v;render();}break;
    case 'stat-trend':if(['sets','volume','days'].includes(v)){V.statTrend=v;render();}break;
    case 'stat-metric':V.statMetric=v;render();break;
    case 'stat-day':goDate(b.dataset.date);V.tab='today';render();window.scrollTo(0,0);break;
    case 'day-prev':goDate(addDays(V.date,-1));render();break;
    case 'day-next':goDate(addDays(V.date,1));render();break;
    case 'go-today':goDate(todayKey());render();break;
    case 'open-cal':case 'cal-toggle':{const toMonth=S.settings.calView!=='month';S.settings.calView=toMonth?'month':'week';goDate(V.date);save();render();}break;
    case 'cal-prev':case 'cal-next':{const d=act==='cal-next'?1:-1;if(S.settings.calView==='month')V.calMonth=addMonths(V.calMonth,d);else V.weekAnchor=addDays(V.weekAnchor,7*d);render();}break;
    case 'pick-day':goDate(b.dataset.date);render();break;
    case 'open-picker':if(w&&w.finishedAt){w.finishedAt=null;save();}openPicker('day',v?{tab:v}:null);break;
    case 'sample':confirmBox('샘플 데이터 넣기','최근 4주치 가상 기록과 루틴 3개가 추가돼요. 설정에서 언제든 지울 수 있어요.','넣기',()=>{makeSample();render();toast('샘플 데이터를 넣었어요');});break;
    case 'session-start':if(w&&(V.date===todayKey()||w.startedAt)&&startSession(w)){flushSave();render();}break;
    case 'session-pause':if(w){pauseSession(w);flushSave();render();}break;
    case 'duration-edit':if(w)durationBox(w);break;
    case 'finish':if(!w)break;if(w.finishedAt){w.finishedAt=null;}else{pauseSession(w);w.finishedAt=Date.now();toast('수고했어요! '+(w.durationMs!=null?fmtDuration(w.durationMs)+' · ':'')+(hasWeightItem(w)?fmtKg(dayVolume(w))+' 들었어요':'운동을 마쳤어요'));window.scrollTo(0,0);}flushSave();render();break;
    case 'day-menu':menuBox(fmtDay(V.date),[
      {label:'루틴으로 저장',icon:I.tabRoutine,fn:()=>saveRoutineBox(w)},
      {label:'이 날 기록 전체 삭제',icon:I.trash,danger:true,fn:()=>confirmBox('기록 삭제',fmtDay(V.date)+' 운동 기록을 모두 지울까요?','삭제',()=>{delete S.workouts[V.date];save();render();},true)}]);break;
    case 'item-menu':if(!it)break;{const i=w.items.indexOf(it);menuBox(exById(it.exId).name,[
      {label:'위로 이동',icon:I.up,fn:()=>{if(i>0){w.items.splice(i,1);w.items.splice(i-1,0,it);save();render();}}},
      {label:'아래로 이동',icon:I.down,fn:()=>{if(i<w.items.length-1){w.items.splice(i,1);w.items.splice(i+1,0,it);save();render();}}},
      ...(modeOf(exById(it.exId))==='weight'?[{label:'다음 운동 목표 설정',icon:I.edit,fn:()=>progressionBox(exById(it.exId))}]:[]),
      {label:'다른 운동으로 교체',icon:I.swap,fn:()=>openPicker('replace',{replaceId:it.id})},
      ...(exById(it.exId).custom?[{label:'운동 정보 수정 (부위·기록 방식)',icon:I.edit,fn:()=>customExBox(exById(it.exId))}]:[]),
      {label:'운동 삭제',icon:I.trash,danger:true,fn:()=>{w.items.splice(i,1);save();render();}}]);}break;
    case 'progression-apply':if(it){if(!applyProgression(it,V.date))toast('현재 세트 구성을 확인해주세요');render();}break;
    case 'progression-undo':if(it){if(!undoProgression(it,V.date))toast('입력이 변경되어 되돌릴 수 없어요');render();}break;
    case 'item-load-last':if(it){const lr=lastRecord(it.exId,V.date);if(!lr){toast('지난 기록이 없어요');break;}
      const apply=()=>{it.sets=lr.sets.map(s=>copySet(s));save();render();toast(fmtDay(lr.date)+' 기록을 불러왔어요');};
      if(it.sets.some(s=>s.done))confirmBox('지난 기록 불러오기',fmtDay(lr.date)+' 기록으로 세트를 바꿀까요? 완료 체크는 풀려요.','불러오기',apply);else apply();}break;
    case 'set-add':if(it){const l=it.sets[it.sets.length-1];it.sets.push({kg:l?l.kg:'',reps:l?l.reps:'',done:false,warm:false,type:''});save();render();}break;
    case 'set-del':if(it&&it.sets.length>1){it.sets.pop();save();render();}break;
    /* picker */
    case 'picker-close':closePicker();break;
    case 'picker-tab':P.tab=v;renderPicker();break;
    case 'picker-part':P.part=v;P.q='';renderPicker();break;
    case 'picker-equipment':if(v==='all')P.equipment=[];else P.equipment=P.equipment.includes(v)?P.equipment.filter(x=>x!==v):[...P.equipment,v];renderPicker();break;
    case 'picker-reset':P.part='전체';P.equipment=[];P.q='';renderPicker();break;
    case 'picker-sort':P.sort=v;renderPicker();break;
    case 'picker-sel':{const id=b.dataset.id;if(P.isReplace)P.selected=[id];else{const i=P.selected.indexOf(id);if(i>=0)P.selected.splice(i,1);else P.selected.push(id);}updatePickerSelection();}break;
    case 'ex-info':exInfoBox(exById(b.dataset.id));break;
    case 'bookmark':{e.stopPropagation();const ex=exById(b.dataset.id);ex.bookmark=!ex.bookmark;save();renderPicker();}break;
    case 'picker-confirm':{
      if(P.mode==='day'){const n=P.selected.length;addExercises(V.date,P.selected);closePicker();render();toast(n+'개 운동을 추가했어요');}
      else if(P.mode==='replace'){const id=P.selected[0];const tgt=w.items.find(x=>x.id===P.replaceId);if(tgt){const lr=lastRecord(id,V.date);tgt.exId=id;tgt.sets=lr?lr.sets:blankSets(tgt.sets.length);save();}closePicker();render();}
      else if(P.mode==='rreplace'){const id=P.selected[0],i=P.replaceIdx,ri=RE.items[i];if(ri){const lr=lastRecord(id);ri.exId=id;ri.sets=lr?lr.sets.map(s=>copySet(s)):blankSets(ri.sets.length);}P=null;$('#overlay').innerHTML='';RE.scrollTo=i;renderRoutineEditor();}
      else if(P.mode==='routine'){const first=RE.items.length;P.selected.forEach(id=>{const lr=lastRecord(id);RE.items.push({exId:id,sets:lr?lr.sets.map(s=>({kg:s.kg,reps:s.reps,warm:!!s.warm})):[{kg:'',reps:'',warm:false},{kg:'',reps:'',warm:false},{kg:'',reps:'',warm:false}]});});P=null;RE.scrollTo=first;renderRoutineEditor();}
    }break;
    case 'picker-routine':{const r=S.routines.find(x=>x.id===b.dataset.id);loadRoutine(V.date,r);closePicker();render();toast('"'+r.name+'" 루틴을 불러왔어요');}break;
    case 'picker-expand':P.expanded=P.expanded===v?null:v;renderPicker();break;
    case 'picker-past':loadDay(V.date,S.workouts[v]);closePicker();render();toast(fmtDay(v)+' 운동을 불러왔어요');break;
    case 'custom-new':customExBox();break;
    case 'custom-edit':{const ex=S.exercises.find(x=>x.id===b.dataset.id);if(ex)customExBox(ex);}break;
    /* routines (events) */
    case 'routine-starters':starterBox();break;
    case 'starter-preview':{const r=starterRoutine(b.dataset.plan,+b.dataset.index);if(r){$('#modal').innerHTML='';P=null;openRoutineEditor(r);RE.isNew=true;renderRoutineEditor();}}break;
    case 'routine-new':openRoutineEditor(null);break;
    case 'routine-load':{const r=S.routines.find(x=>x.id===b.closest('[data-routine]').dataset.routine);loadRoutine(V.date,r);V.tab='today';render();toast('"'+r.name+'" 루틴을 불러왔어요');}break;
    case 'routine-edit':openRoutineEditor(S.routines.find(x=>x.id===b.closest('[data-routine]').dataset.routine));break;
    case 'routine-menu':{const r=S.routines.find(x=>x.id===b.closest('[data-routine]').dataset.routine);menuBox(r.name,[
      {label:'편집',icon:I.swap,fn:()=>openRoutineEditor(r)},
      {label:'복제',icon:I.plus,fn:()=>{const c=JSON.parse(JSON.stringify(r));c.id=uid();c.name=r.name+' 복사';c.lastUsed=null;S.routines.unshift(c);save();render();}},
      {label:'삭제',icon:I.trash,danger:true,fn:()=>confirmBox('루틴 삭제','"'+r.name+'" 루틴을 지울까요? 운동 기록은 남아요.','삭제',()=>{S.routines=S.routines.filter(x=>x!==r);save();render();},true)}]);}break;
    case 're-close':RE=null;$('#overlay').innerHTML='';syncHistory();break;
    case 're-add':openPicker('routine');break;
    case 're-menu':{const i=+b.closest('[data-ri]').dataset.ri,ri=RE.items[i];menuBox(exById(ri.exId).name,[
      {label:'위로 이동',icon:I.up,fn:()=>{if(i>0){RE.items.splice(i,1);RE.items.splice(i-1,0,ri);RE.scrollTo=i-1;renderRoutineEditor();}}},
      {label:'아래로 이동',icon:I.down,fn:()=>{if(i<RE.items.length-1){RE.items.splice(i,1);RE.items.splice(i+1,0,ri);RE.scrollTo=i+1;renderRoutineEditor();}}},
      {label:'다른 운동으로 교체',icon:I.swap,fn:()=>openPicker('rreplace',{replaceIdx:i})},
      {label:'루틴에서 빼기',icon:I.trash,danger:true,fn:()=>{RE.items.splice(i,1);renderRoutineEditor();}}]);}break;
    case 're-set-add':case 're-set-del':{const i=+b.closest('[data-ri]').dataset.ri,ri=RE.items[i];
      if(act==='re-set-add'){const l=ri.sets[ri.sets.length-1];ri.sets.push({kg:l?l.kg:'',reps:l?l.reps:'',warm:false,type:''});}
      else if(ri.sets.length>1)ri.sets.pop();
      renderRoutineEditor();}break;
    case 're-save':{RE.name=($('#re-name').value||'').trim();if(!RE.name){toast('루틴 이름을 입력하세요');$('#re-name').focus();break;}if(!RE.items.length){toast('운동을 하나 이상 추가하세요');break;}
      const idx=S.routines.findIndex(x=>x.id===RE.id);const clean={id:RE.id,name:RE.name,createdAt:RE.createdAt,lastUsed:RE.lastUsed,items:RE.items};
      if(idx>=0)S.routines[idx]=clean;else S.routines.unshift(clean);RE=null;$('#overlay').innerHTML='';syncHistory();save();V.tab='routines';render();toast('루틴을 저장했어요');}break;
    /* settings */
    case 'set-fill':S.settings.routineFill=v;save();render();break;
    case 'set-bar':S.settings.barKg=+v;save();render();break;
    case 'toggle':S.settings[b.dataset.k]=!S.settings[b.dataset.k];save();render();break;
    case 'custom-del':{const ex=exById(b.dataset.id);confirmBox('운동 삭제','"'+ex.name+'"을 목록에서 지울까요? 이미 기록된 날의 데이터는 남아요.','삭제',()=>{S.exercises=S.exercises.filter(x=>x.id!==ex.id);save();render();},true);}break;
    case 'storage-retry':if(flushSave())toast('저장했어요');break;
    case 'storage-raw':try{exportBox(storage.raw()||'저장된 원본이 없어요');}catch(error){storageError(error);}break;
    case 'storage-backup':try{const backup=storage.backup();if(backup)exportBox(JSON.stringify(backup));else toast('복구 사본이 없어요');}catch(error){storageError(error);}break;
    case 'storage-recover':confirmBox('복구 사본 복원','현재 화면의 내용을 먼저 내보내세요. 복구 사본으로 기록을 교체하며, 로그인되어 있으면 서버에도 동기화됩니다.','복원',()=>{try{S=storage.recover();normalize();dirty=true;if(flushSave()){render();toast('복원했어요');}}catch(error){storageError(error);}});break;
    case 'export':exportBox();break;
    case 'import':importBox();break;
    case 'sample-del':confirmBox('샘플 데이터 삭제','샘플로 표시된 기록과 "(샘플)" 루틴을 지울까요?','삭제',()=>{Object.keys(S.workouts).forEach(k=>{if(S.workouts[k].sample)delete S.workouts[k];});S.routines=S.routines.filter(r=>!/\(샘플\)$/.test(r.name));save();render();},true);break;
    case 'wipe':confirmBox('모든 기록 삭제','현재 기록을 복구 사본으로 남긴 뒤 운동 기록, 루틴, 사용자 운동을 지웁니다.','전체 삭제',()=>{if(!replaceState(emptyState()))return;V.tab='today';render();toast('모두 지웠어요');},true);break;
    /* sync */
    case 'sync-connect':{const u=($('#sb-url').value||'').trim().replace(/\/+$/,''),a=($('#sb-anon').value||'').trim();if(!/^https:\/\/.+/.test(u)||a.length<20){toast('URL과 anon key를 확인하세요');break;}C.url=u;C.anon=a;C.last={};saveSync();initClient();render();}break;
    case 'sync-disconnect':confirmBox('연결 해제','서버 연결 정보를 지울까요? 이 기기의 기록은 그대로 남아요.','해제',async()=>{try{await cloud.disconnect();render();}catch(e){toast(e.message);}});break;
    case 'sync-login':syncAuth('login');break;
    case 'sync-signup':syncAuth('signup');break;
    case 'sync-now':sync();break;
    case 'sync-logout':confirmBox('로그아웃','로그아웃해도 이 기기의 기록은 남아요. 다시 로그인하면 서버와 다시 맞춰집니다.','로그아웃',async()=>{try{await cloud.logout();render();}catch(e){toast(e.message);}});break;
    case 'modal-bg':if(e.target===b)closeModal();break;
    case 'modal-close':closeModal();break;
  }
});
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.dataset.act==='stat-search'){
    const q=t.value.trim().toLocaleLowerCase(),select=$('#statEx');
    if(!select._statsOptions)select._statsOptions=Array.from(select.options,o=>({value:o.value,text:o.textContent}));
    const matches=select._statsOptions.filter(o=>o.text.toLocaleLowerCase().includes(q)),count=matches.length;
    const selected=matches.some(o=>o.value===V.statEx);
    select.innerHTML=(selected?'':`<option value="" disabled selected>${count?'검색 결과에서 종목 선택':'검색 결과 없음'}</option>`)+matches.map(o=>`<option value="${esc(o.value)}" ${o.value===V.statEx?'selected':''}>${esc(o.text)}</option>`).join('');
    select.disabled=!count;
    $('#statSearchStatus').textContent=q?(count?`${count}개 검색됨 · 아래에서 종목을 선택하세요`:'검색 결과가 없어요. 다른 이름이나 부위를 입력하세요.'):'';
    return;
  }
  if(t.dataset.kg!=null||t.dataset.reps!=null){const w=S.workouts[V.date];const itemEl=t.closest('[data-item]');const it=w&&w.items.find(x=>x.id===itemEl.dataset.item);if(!it)return;
    const j=+(t.dataset.kg!=null?t.dataset.kg:t.dataset.reps);const val=cleanNum(t.value);if(val!==t.value)t.value=val;
    if(t.dataset.kg!=null)it.sets[j].kg=val;else it.sets[j].reps=val;save();refreshVolumes();return;}
  if(t.dataset.memo){const w=S.workouts[V.date];const it=w&&w.items.find(x=>x.id===t.dataset.memo);if(it){it.memo=t.value;save();}t.style.height='auto';t.style.height=t.scrollHeight+'px';return;}
  if(t.dataset.dnote){const w=S.workouts[t.dataset.dnote];if(w){w.note=t.value;if(!w.note)delete w.note;save();}t.style.height='auto';t.style.height=t.scrollHeight+'px';return;}
  if(t.dataset.rkg!=null||t.dataset.rreps!=null){const i=+t.closest('[data-ri]').dataset.ri,j=+(t.dataset.rkg!=null?t.dataset.rkg:t.dataset.rreps);const val=cleanNum(t.value);if(val!==t.value)t.value=val;if(t.dataset.rkg!=null)RE.items[i].sets[j].kg=val;else RE.items[i].sets[j].reps=val;return;}
  if(t.dataset.act==='picker-q'){P.q=t.value;const pl=$('#picker-list');if(pl)pl.innerHTML=pickerAddList();else{P.focusQ=true;renderPicker();}return;}
  if(t.dataset.act==='re-name'){RE.name=t.value;return;}
});
document.addEventListener('change',e=>{if(e.target.dataset.act==='stat-ex'){V.statEx=e.target.value;V.statMetric=null;render();}});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.thumb[data-act="ex-info"]')){e.preventDefault();exInfoBox(exById(e.target.dataset.id));return;}if(e.key==='Enter'&&e.target.matches('.sets input')){e.preventDefault();const inputs=[...document.querySelectorAll('.sets input')];const i=inputs.indexOf(e.target);if(i>=0&&i<inputs.length-1)inputs[i+1].focus();else e.target.blur();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(dirty||saveT)flushSave();}else{refreshDuration();if(Date.now()-cloud.lastSyncTick>30000)sync();}updateWakeLock();});
window.addEventListener('pagehide',()=>{if(dirty||saveT)flushSave();});
window.addEventListener('online',()=>sync());
window.addEventListener('liftlog-sdk-ready',()=>initClient());

/* ===================== boot ===================== */
load();
loadSync();
renderStorageAlert();
render();
initClient();
window.__liftlog={get S(){return S;},set S(v){S=v;},C,sync,save,persist,load,markLocalChanges,sortedDates,todayKey,KEY};
try{if(window.claude&&window.claude.hot&&window.claude.hot.snapshot)window.claude.hot.snapshot(()=>({tab:V.tab,date:V.date}));}catch(e){}
})();
