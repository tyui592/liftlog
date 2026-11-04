const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
async function fixture(){
  const ctx={window:{},console,Date,setTimeout:()=>1,clearTimeout(){}};vm.createContext(ctx);
  for(const file of ['catalog','storage','sync'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/js/'+file+'.js'),'utf8'),ctx);
  let state={version:1,settings:{},exercises:[],routines:[],workouts:{'2026-11-03':{items:[],note:'original'}}};
  const pull=deferred(),push=deferred(),uploads=[],statuses=[];let requests=0,failSave=false,failMeta=false,failCheckpoint=false;
  const client={auth:{getSession:async()=>({data:{session:{user:{id:'test-user'}}}}),onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};}},from(){return {select(){return {eq(){requests++;return pull.promise;}};},upsert(rows){uploads.push(rows);return push.promise;}};}};
  const cloud=ctx.window.Liftlog.createSync({getState:()=>state,storage:{readJSON:()=>null,writeJSON(){if(failMeta)throw new Error('metadata full');}},normalize(){},persist:()=>!failSave,
    flushLocal(){if(failSave)return false;cloud.markLocalChanges();return true;},
    commitRemote(next){if(failCheckpoint)throw new Error('checkpoint full');state=next;},
    notify(){},onStatus:()=>statuses.push(cloud.C.status),onData(){},getConfig:()=>({url:'https://example.test',anon:'public'}),getSDK:()=>({createClient:()=>client})});
  cloud.loadSync();
  const start=async()=>{const promise=cloud.initClient();await tick();return {promise};};
  return {cloud,start,pull,push,uploads,statuses,get state(){return state;},get requests(){return requests;},failSave:()=>failSave=true,failMeta:()=>failMeta=true,failCheckpoint:()=>failCheckpoint=true};
}
test('unsaved local state blocks cloud reads and writes',async()=>{
  const f=await fixture();f.failSave();await f.start();await tick();
  assert.equal(f.requests,0);assert.equal(f.cloud.C.status,'error');
});
test('edit while fetching cannot be replaced by a newer remote row',async()=>{
  const f=await fixture();await f.start();f.state.workouts['2026-11-03'].note='typed during fetch';
  f.pull.resolve({data:[{key:'w:2026-11-03',value:{items:[],note:'remote'},updated_at:'2099-01-01T00:00:00Z'}]});await tick();
  assert.equal(f.state.workouts['2026-11-03'].note,'typed during fetch');
  assert.equal(f.uploads[0].find(r=>r.key==='w:2026-11-03').value.note,'typed during fetch');f.push.resolve({});
});
test('uploads own their values and in-flight edits remain pending',async()=>{
  const f=await fixture();await f.start();f.pull.resolve({data:[]});await tick();
  const sent=f.uploads[0].find(r=>r.key==='w:2026-11-03');assert.equal(sent.value.note,'original');
  f.state.workouts['2026-11-03'].note='typed during upload';f.cloud.markLocalChanges();
  assert.equal(sent.value.note,'original');f.push.resolve({});await tick();
  assert.notEqual(f.cloud.C.last['w:2026-11-03'],f.cloud.C.cur['w:2026-11-03']);assert.notEqual(f.cloud.C.status,'ok');
});
test('failed recovery checkpoint aborts a remote replacement',async()=>{
  const f=await fixture();f.failCheckpoint();await f.start();
  f.pull.resolve({data:[{key:'w:2026-11-03',value:{items:[],note:'remote'},updated_at:'2099-01-01T00:00:00Z'}]});await tick();
  assert.equal(f.state.workouts['2026-11-03'].note,'original');assert.equal(f.uploads.length,0);assert.equal(f.cloud.C.status,'error');
});
test('malformed cloud data is rejected without changing the current record',async()=>{
  const f=await fixture();await f.start();f.pull.resolve({data:[{key:'w:2026-11-03',value:{items:[null]},updated_at:'2099-01-01T00:00:00Z'}]});await tick();
  assert.equal(f.state.workouts['2026-11-03'].note,'original');assert.equal(f.cloud.C.status,'error');
});
test('metadata persistence failure never reports successful synchronization',async()=>{
  const f=await fixture();await f.start();f.pull.resolve({data:[]});await tick();f.failMeta();f.push.resolve({});await tick();
  assert.equal(f.cloud.C.status,'error');assert.ok(!f.statuses.includes('ok'));
});
test('first login still accepts existing server records older than app startup',async()=>{
  const f=await fixture();await f.start();
  f.pull.resolve({data:[{key:'w:2026-11-03',value:{items:[],note:'existing server record'},updated_at:'2020-01-01T00:00:00Z'}]});await tick();
  assert.equal(f.state.workouts['2026-11-03'].note,'existing server record');f.push.resolve({});
});
