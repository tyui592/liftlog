const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function fixture(initial){
  const values=new Map(initial?Object.entries(initial):[]);
  let failKey=null;
  const storage={getItem:k=>values.get(k)??null,setItem(k,v){if(k===failKey)throw new Error('QuotaExceededError');values.set(k,v);}};
  const ctx={window:{},console};vm.createContext(ctx);
  const file=path.join(__dirname,'../src/js/storage.js');
  if(fs.existsSync(file))vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
  assert.equal(typeof ctx.window.Liftlog?.createStorage,'function','storage adapter must be independently usable');
  const create=()=>ctx.window.Liftlog.createStorage({storage,key:'liftlog.v1'});
  return {values,create,fail:k=>failKey=k};
}
const state=()=>({version:1,exercises:[{id:'cx',name:'내 운동',part:'등',custom:true}],routines:[],settings:{},workouts:{'2026-11-03':{items:[{exId:'cx',sets:[{kg:'30',reps:'10',done:true}]}]}}});
test('legacy records load without any migration writes',()=>{
  const raw=JSON.stringify(state()),f=fixture({'liftlog.v1':raw}),s=f.create();
  assert.equal(JSON.stringify(s.load()),raw);assert.equal(f.values.size,1);
});
test('missing state differs from malformed, unsupported and inaccessible state',()=>{
  assert.equal(fixture().create().load(),null);
  for(const raw of ['{',JSON.stringify({...state(),version:99}),JSON.stringify({...state(),workouts:null}),JSON.stringify({...state(),exercises:[null]})]){
    const f=fixture({'liftlog.v1':raw}),s=f.create();
    assert.throws(()=>s.load());assert.throws(()=>s.save(state()));assert.equal(f.values.get('liftlog.v1'),raw);
  }
});
test('failed primary write retains the last committed workout and can be retried',()=>{
  const original=JSON.stringify(state()),f=fixture({'liftlog.v1':original}),s=f.create();s.load();
  const next=state();next.workouts['2026-11-03'].note='new';f.fail('liftlog.v1');
  assert.throws(()=>s.save(next));assert.equal(f.values.get('liftlog.v1'),original);
  f.fail(null);s.save(next);assert.equal(JSON.parse(f.values.get('liftlog.v1')).workouts['2026-11-03'].note,'new');
});
test('replacement requires a durable checkpoint and recovery returns the old state',()=>{
  const original=JSON.stringify(state()),f=fixture({'liftlog.v1':original}),s=f.create();s.load();
  const next=state();next.workouts={};f.fail('liftlog.v1.backup');
  assert.throws(()=>s.save(next,{checkpoint:true}));assert.equal(f.values.get('liftlog.v1'),original);
  f.fail(null);s.save(next,{checkpoint:true});assert.equal(JSON.stringify(s.backup()),original);
  assert.equal(JSON.stringify(s.recover()),original);assert.equal(f.values.get('liftlog.v1'),original);
});
test('corrupt primary is preserved before explicit recovery',()=>{
  const original=JSON.stringify(state()),f=fixture({'liftlog.v1':'bad','liftlog.v1.backup':original}),s=f.create();
  assert.throws(()=>s.load());assert.equal(JSON.stringify(s.backup()),original);
  s.recover();assert.equal(f.values.get('liftlog.v1.corrupt'),'bad');assert.equal(f.values.get('liftlog.v1'),original);
});
test('a stale tab cannot overwrite a newer tab, including on recovery',()=>{
  const f=fixture({'liftlog.v1':JSON.stringify(state())}),a=f.create(),b=f.create();a.load();b.load();
  const next=state();next.workouts['2026-11-03'].note='other tab';a.save(next,{checkpoint:true});
  assert.throws(()=>b.save(state()));assert.throws(()=>b.recover());
  assert.equal(JSON.parse(f.values.get('liftlog.v1')).workouts['2026-11-03'].note,'other tab');
});
test('a valid imported backup can repair unreadable storage while preserving its raw bytes',()=>{
  const f=fixture({'liftlog.v1':'bad'}),s=f.create();assert.throws(()=>s.load());
  assert.equal(typeof s.replace,'function');s.replace(state());
  assert.equal(f.values.get('liftlog.v1.corrupt'),'bad');assert.equal(JSON.stringify(s.load()),JSON.stringify(state()));
});
test('an inaccessible storage provider remains blocked without wiping anything',()=>{
  const f=fixture(),ctx={window:{}};vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/js/storage.js'),'utf8'),ctx);
  let writes=0;const s=ctx.window.Liftlog.createStorage({storage:{getItem(){throw new Error('SecurityError');},setItem(){writes++;}}});
  assert.throws(()=>s.load());assert.throws(()=>s.save(state()));assert.equal(writes,0);
});
