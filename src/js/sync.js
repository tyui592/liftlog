/* Liftlog: sync. Private implementation; explicit public interface. */
(function(namespace){
'use strict';
function createSync({getState,storage,normalize,persist,flushLocal,commitRemote,notify,onStatus,onData,getConfig,getSDK}){
const {DEFAULTS}=namespace.catalog;
/* ===================== cloud sync (Supabase) ===================== */
/* 키 단위 last-write-wins 동기화. 로컬이 1차 저장소, 서버 테이블 liftlog_kv(user_id,key,value,deleted,updated_at).
   키: settings | exercises | routines | w:<YYYY-MM-DD>. 삭제는 deleted=true 행(tombstone)으로 전파. */
const SYNC_KEY='liftlog.sync';
const C={url:'',anon:'',meta:{},last:{},cur:{},lastSyncAt:null,status:'off',error:''};
let sb=null,syncUser=null,pushT=null,syncing=false,pendingSync=false,lastSyncTick=0,epoch=0,subscription=null,loadError=null;
function canon(v){if(Array.isArray(v))return '['+v.map(canon).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}';return JSON.stringify(v===undefined?null:v);}
function hash(v){const s=canon(v);let h=5381;for(let i=0;i<s.length;i++)h=((h*33)^s.charCodeAt(i))>>>0;return h.toString(36)+'.'+s.length.toString(36);}
function loadSync(){
  try{
    const d=storage.readJSON(SYNC_KEY);
    if(!d)C.cur=Object.fromEntries(Object.entries(snapshot()).map(([key,value])=>[key,hash(value)]));
    if(d){
      if(typeof d!=='object'||Array.isArray(d))throw new Error('동기화 정보 형식이 올바르지 않아요');
      for(const key of ['meta','last','cur'])if(d[key]!=null&&(typeof d[key]!=='object'||Array.isArray(d[key])))throw new Error('동기화 정보 형식이 올바르지 않아요');
      ['url','anon','meta','last','cur','lastSyncAt'].forEach(key=>{if(d[key]!=null)C[key]=d[key];});
    }
  }catch(error){loadError=error;C.status='error';C.error='동기화 정보를 읽지 못했어요. 저장 원본을 백업해주세요';}
  const cfg=getConfig();if((!C.url||!C.anon)&&cfg&&cfg.url&&cfg.anon){C.url=cfg.url;C.anon=cfg.anon;}
}
function saveSync(){storage.writeJSON(SYNC_KEY,{url:C.url,anon:C.anon,meta:C.meta,last:C.last,cur:C.cur,lastSyncAt:C.lastSyncAt});}
function snapshot(){const m={settings:getState().settings,exercises:getState().exercises,routines:getState().routines};Object.keys(getState().workouts).forEach(k=>{m['w:'+k]=getState().workouts[k];});return m;}
function markLocalChanges(){
  if(loadError)throw loadError;
  const snap=snapshot();let changed=false;
  const stamp=key=>new Date(Math.max(Date.now(),(Date.parse(C.meta[key])||0)+1)).toISOString();
  for(const key in snap){const value=hash(snap[key]);if(C.cur[key]!==value){C.cur[key]=value;C.meta[key]=stamp(key);changed=true;}}
  for(const key in C.cur){if(!(key in snap)){delete C.cur[key];C.meta[key]=stamp(key);changed=true;}}
  // Retry metadata persistence even if an earlier attempt already updated memory.
  saveSync();
  if(changed){if(syncing)pendingSync=true;clearTimeout(pushT);pushT=setTimeout(()=>sync(),2000);}
  return changed;
}
function applyRemote(key,value,target=getState()){
  if(key==='settings')target.settings=Object.assign({},DEFAULTS,value&&typeof value==='object'?value:{});
  else if(key==='exercises'){
    if(!Array.isArray(value))return false;
    const localCustoms=target.exercises.filter(e=>e.custom);
    const localBm=new Set(target.exercises.filter(e=>e.bookmark).map(e=>e.id));
    target.exercises=value;
    if(!C.last[key]){
      const have=new Set(target.exercises.map(e=>e.id));
      localCustoms.forEach(e=>{if(!have.has(e.id))target.exercises.push(e);});
      target.exercises.forEach(e=>{if(localBm.has(e.id))e.bookmark=true;});
    }
  }
  else if(key==='routines'){
    const remote=Array.isArray(value)?value:[];
    if(!C.last[key]&&target.routines.length){
      const have=new Set(remote.map(r=>r.id));
      target.routines=[...remote,...target.routines.filter(r=>!have.has(r.id))];
    }else target.routines=remote;
  }
  else if(key.startsWith('w:')){const d=key.slice(2);if(value==null)delete target.workouts[d];else target.workouts[d]=value;}
  else return false;
  return true;
}
function setStatus(st,err){const prev=C.status;C.status=st;C.error=err||'';
  if(st==='error'&&prev!=='error')notify('동기화 실패: '+(err||'네트워크를 확인하세요'));
  onStatus();}
async function initClient(){
  const generation=++epoch;
  if(subscription)subscription.unsubscribe();subscription=null;sb=null;syncUser=null;
  if(loadError){setStatus('error',C.error);return;}
  if(!C.url||!C.anon){C.status='off';return;}
  if(!getSDK()){setStatus('nolib');return;}
  try{
    sb=getSDK().createClient(C.url,C.anon,{auth:{persistSession:true,autoRefreshToken:true,storageKey:'liftlog.auth'}});
    const client=sb,{data,error}=await client.auth.getSession();if(error)throw error;
    if(generation!==epoch)return;
    syncUser=data&&data.session?data.session.user:null;
    const listener=client.auth.onAuthStateChange((event,session)=>{
      if(sb!==client)return;
      const user=session?session.user:null,changed=user?.id!==syncUser?.id;
      if(changed)epoch++;syncUser=user;
      if(changed&&user)setTimeout(()=>sync(),0);else onStatus();
    });
    subscription=listener?.data?.subscription||null;
    C.status=syncUser?'idle':'signedout';onStatus();
    if(syncUser)return sync();
  }catch(error){setStatus('error',error.message||String(error));}
}
async function sync(){
  if(!sb||!syncUser)return;
  if(syncing){pendingSync=true;return;}
  syncing=true;pendingSync=false;lastSyncTick=Date.now();setStatus('syncing');
  const client=sb,user=syncUser,generation=epoch;
  const current=()=>client===sb&&user.id===syncUser?.id&&generation===epoch;
  try{
    if(loadError)throw loadError;
    if(!flushLocal())throw new Error('이 기기에 먼저 저장한 뒤 동기화할 수 있어요');
    const beforePull=Object.fromEntries(Object.entries(snapshot()).map(([key,value])=>[key,hash(value)]));
    const {data:rows,error}=await client.from('liftlog_kv').select('key,value,deleted,updated_at').eq('user_id',user.id);
    if(!current())return;if(error)throw error;
    if(!flushLocal())throw new Error('변경한 기록을 저장하지 못했어요');
    const local=snapshot(),draft=JSON.parse(JSON.stringify(getState()));
    const metadata=JSON.parse(JSON.stringify({meta:C.meta,cur:C.cur,last:C.last}));
    let applied=false;
    for(const row of rows||[]){
      if(!['settings','exercises','routines'].includes(row.key)&&!/^w:\d{4}-\d{2}-\d{2}$/.test(row.key))continue;
      const remoteTime=Date.parse(row.updated_at);if(!Number.isFinite(remoteTime))throw new Error('서버 기록의 수정 시각이 올바르지 않아요');
      const localTime=Date.parse(C.meta[row.key])||0,remoteHash=row.deleted?null:hash(row.value);
      const nowHash=row.key in local?hash(local[row.key]):undefined;
      if(nowHash!==beforePull[row.key]){
        // The user edited while the request was in flight: keep that edit, including deletion.
        metadata.meta[row.key]=new Date(Math.max(Date.now(),remoteTime+1,localTime)).toISOString();
        if(row.deleted)delete metadata.last[row.key];else metadata.last[row.key]=remoteHash;
        continue;
      }
      if(remoteTime>localTime){
        if(!applyRemote(row.key,row.deleted?undefined:row.value,draft))throw new Error('서버 기록 형식이 올바르지 않아요');
        applied=true;
        const value=row.key.startsWith('w:')?draft.workouts[row.key.slice(2)]:draft[row.key];
        const valueHash=value===undefined?null:hash(value);
        metadata.meta[row.key]=valueHash===remoteHash?new Date(remoteTime).toISOString():new Date(Math.max(Date.now(),remoteTime+1)).toISOString();
        if(value===undefined)delete metadata.cur[row.key];else metadata.cur[row.key]=valueHash;
        if(row.deleted)delete metadata.last[row.key];else metadata.last[row.key]=remoteHash;
      }else if(remoteTime===localTime){if(row.deleted)delete metadata.last[row.key];else metadata.last[row.key]=remoteHash;}
    }
    if(applied){namespace.validateState(draft);commitRemote(draft);}
    Object.assign(C,metadata);
    if(applied){markLocalChanges();onData();}
    // Freeze values before awaiting the request: a live object would acknowledge unsent edits.
    const snap=JSON.parse(JSON.stringify(snapshot())),up=[],now=new Date().toISOString();
    for(const key in snap)if(C.last[key]!==hash(snap[key]))up.push({user_id:user.id,key,value:snap[key],deleted:false,updated_at:C.meta[key]||now});
    for(const key in C.last)if(!(key in snap))up.push({user_id:user.id,key,value:null,deleted:true,updated_at:C.meta[key]||now});
    if(up.length){
      const {error:uploadError}=await client.from('liftlog_kv').upsert(up,{onConflict:'user_id,key'});
      if(!current())return;if(uploadError)throw uploadError;
      for(const row of up){if(row.deleted)delete C.last[row.key];else C.last[row.key]=hash(row.value);if(!C.meta[row.key])C.meta[row.key]=row.updated_at;}
    }
    if(!flushLocal())throw new Error('변경한 기록을 저장하지 못했어요');
    const latest=snapshot();
    pendingSync=Object.keys(latest).some(key=>hash(latest[key])!==C.last[key])||Object.keys(C.last).some(key=>!(key in latest));
    const completed=new Date().toISOString(),previous=C.lastSyncAt;C.lastSyncAt=completed;
    try{saveSync();}catch(error){C.lastSyncAt=previous;throw error;}
    setStatus(pendingSync?'idle':'ok');
  }catch(error){pendingSync=false;if(current())setStatus('error',error.message||String(error));}
  finally{
    syncing=false;
    if(pendingSync){pendingSync=false;clearTimeout(pushT);pushT=setTimeout(()=>sync(),0);}
  }
}

async function logout(){epoch++;clearTimeout(pushT);if(sb){const {error}=await sb.auth.signOut();if(error)throw error;}syncUser=null;C.last={};C.status='signedout';saveSync();onStatus();}
async function disconnect(){await logout();C.url='';C.anon='';sb=null;C.status='off';saveSync();onStatus();}

return {C,loadSync,saveSync,snapshot,markLocalChanges,applyRemote,setStatus,initClient,sync,get sb(){return sb;},get syncUser(){return syncUser;},get lastSyncTick(){return lastSyncTick;},disconnect,logout};
}
Object.assign(namespace, {createSync});
})(window.Liftlog=window.Liftlog||{});
