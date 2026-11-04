/* Browser persistence boundary. Existing liftlog.v1 exports remain readable. */
(function(namespace){
'use strict';
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
function validateState(value){
  if(!object(value)||(value.version!=null&&value.version!==1)||!Array.isArray(value.exercises)||!object(value.workouts))throw new Error('지원하는 리프트로그 기록 형식이 아니에요');
  if(value.settings!=null&&!object(value.settings))throw new Error('설정 형식이 올바르지 않아요');
  if(value.routines!=null&&!Array.isArray(value.routines))throw new Error('루틴 형식이 올바르지 않아요');
  const items=list=>Array.isArray(list)&&list.every(it=>object(it)&&typeof it.exId==='string'&&(it.sets==null||(Array.isArray(it.sets)&&it.sets.every(object))));
  if(!value.exercises.every(e=>object(e)&&typeof e.id==='string'&&typeof e.name==='string'))throw new Error('운동 목록 형식이 올바르지 않아요');
  if(!Object.entries(value.workouts).every(([date,w])=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&object(w)&&items(w.items)))throw new Error('운동 기록 형식이 올바르지 않아요');
  if(!(value.routines||[]).every(r=>object(r)&&(r.items==null||items(r.items))))throw new Error('루틴 항목 형식이 올바르지 않아요');
  return value;
}
function createStorage({storage,key='liftlog.v1'}){
  let expected,loaded=false,blocked=false,checkpointMade=false;
  const decode=raw=>validateState(JSON.parse(raw));
  function assertCurrent(){
    if(!loaded)throw new Error('저장된 기록을 먼저 확인해야 해요');
    if(storage.getItem(key)!==expected)throw new Error('다른 창에서 기록이 변경됐어요. 현재 내용을 내보낸 뒤 새로고침하세요');
  }
  function load(){
    try{
      expected=storage.getItem(key);loaded=true;
      const value=expected==null?null:decode(expected);blocked=false;return value;
    }catch(e){blocked=true;throw e;}
  }
  function save(value,{checkpoint=false}={}){
    if(blocked)throw new Error('기존 기록을 읽지 못해 덮어쓰기를 중단했어요. 원본을 내보내거나 복구 사본을 확인하세요');
    assertCurrent();validateState(value);
    const next=JSON.stringify(value);
    // One startup checkpoint plus explicit checkpoints before bulk replacement.
    // A checkpoint failure aborts before the committed state is touched.
    if(expected!=null&&(checkpoint||!checkpointMade)){
      decode(expected);storage.setItem(key+'.backup',expected);
      checkpointMade=true;
    }
    if(next===expected)return;
    storage.setItem(key,next);expected=next;
  }
  function backup(){const raw=storage.getItem(key+'.backup');return raw==null?null:decode(raw);}
  function replace(value){
    assertCurrent();validateState(value);
    if(!blocked){save(value,{checkpoint:true});return;}
    const next=JSON.stringify(value);
    if(expected!=null)storage.setItem(key+'.corrupt',expected);
    storage.setItem(key,next);expected=next;blocked=false;checkpointMade=true;
  }
  function recover(){
    assertCurrent();
    const value=backup();if(!value)throw new Error('복구 사본이 없어요');
    // Preserve unreadable bytes before any explicit repair. Quota errors stop repair.
    if(blocked&&expected!=null)storage.setItem(key+'.corrupt',expected);
    const next=JSON.stringify(value);storage.setItem(key,next);
    expected=next;blocked=false;checkpointMade=true;return value;
  }
  function readJSON(name){const raw=storage.getItem(name);return raw==null?null:JSON.parse(raw);}
  function writeJSON(name,value){storage.setItem(name,JSON.stringify(value));}
  return {load,save,replace,backup,recover,readJSON,writeJSON,raw:()=>storage.getItem(key),get blocked(){return blocked;}};
}
Object.assign(namespace,{createStorage,validateState});
})(window.Liftlog=window.Liftlog||{});
