const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
test('release cache changes for worker and icon edits, and repeated builds are deterministic',t=>{
  const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'liftlog-build-'));
  t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  fs.copyFileSync(path.join(root,'build.py'),path.join(temp,'build.py'));
  fs.cpSync(path.join(root,'src'),path.join(temp,'src'),{recursive:true});
  fs.mkdirSync(path.join(temp,'assets/artwork'),{recursive:true});
  for(const name of ['icon-180.png','icon-512.png','artwork/manifest.json','artwork/LICENSE-EVERKINETIC.md','artwork/LICENSE-WORKOUT-GUIDE.md','artwork/ATTRIBUTION-WORKOUT-GUIDE.md'])fs.copyFileSync(path.join(root,'assets',name),path.join(temp,'assets',name));
  const build=()=>{execFileSync('python3',['build.py'],{cwd:temp});return fs.readFileSync(path.join(temp,'dist/sw.js'),'utf8').match(/const CACHE=PREFIX\+'([^']+)'/)[1];};
  const first=build();assert.equal(build(),first);
  fs.appendFileSync(path.join(temp,'src/sw.js'),'\n// changed worker behavior\n');
  const second=build();assert.notEqual(second,first);
  fs.appendFileSync(path.join(temp,'assets/icon-180.png'),'changed icon');assert.notEqual(build(),second);
  const html=fs.readFileSync(path.join(temp,'dist/index.html'),'utf8'),worker=fs.readFileSync(path.join(temp,'dist/sw.js'),'utf8');
  for(const [,file] of html.matchAll(/(?:src|href)="\.\/([^\"]+\.(?:js|css))"/g)){
    assert.ok(fs.existsSync(path.join(temp,'dist',file)));assert.ok(worker.includes('./'+file),'every local module and stylesheet must be available offline');
  }
});
