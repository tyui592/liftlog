// Run against a fresh build, with Playwright installed outside the app's runtime.
// NODE_PATH=/path/to/node_modules PLAYWRIGHT_BROWSERS_PATH=/path/to/browsers node tests/browser-smoke.cjs
const {chromium,webkit,devices,expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const root=path.resolve(__dirname,'../dist');
const out=process.env.LIFTLOG_BROWSER_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'liftlog-browser-'));
fs.mkdirSync(out,{recursive:true});
let releaseTest=null;
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  if(releaseTest?.fail&&/\/js\/domain\./.test(pathname)){res.writeHead(503).end();return;}
  fs.readFile(file,(err,data)=>{
    if(err){res.writeHead(404).end();return;}
    if(releaseTest&&file.endsWith('sw.js'))data=Buffer.from(data.toString().replace(/const CACHE=PREFIX\+'([^']+)';/,(_,version)=>`const CACHE=PREFIX+'${version}-upgrade${releaseTest.version}';`));
    if(releaseTest&&file.endsWith('index.html'))data=Buffer.from(data.toString().replace('<body>',`<body data-test-release="${releaseTest.version}">`));
    const type={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.webmanifest':'application/manifest+json','.png':'image/png','.webp':'image/webp'}[path.extname(file)]||'application/octet-stream';
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache'}).end(data);
  });
});
const results=[];
let base;
async function contextFor(browser,options={}){
  const ctx=await browser.newContext({...devices['iPhone 13'],locale:'ko-KR',timezoneId:'Asia/Seoul',...options});
  // Fresh browser storage, no user profile or cloud account; external fonts/SDK are unnecessary for these local UI tests.
  await ctx.addInitScript(()=>Object.defineProperty(window,'LIFTLOG_SUPABASE',{get:()=>undefined,set:()=>{},configurable:false}));
  await ctx.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.fulfill({status:200,contentType:route.request().resourceType()==='stylesheet'?'text/css':'application/javascript',body:''}));
  return ctx;
}
async function noOverflow(page){
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'page must fit the viewport');
}
async function flow(browser,name,scheme){
  const ctx=await contextFor(browser,{colorScheme:scheme,viewport:{width:scheme==='dark'?375:390,height:844}});
  const page=await ctx.newPage();
  page.setDefaultTimeout(10000);
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  try{
    await page.goto(base);
    await expect(page.locator('[data-act="open-picker"]').first()).toBeVisible();
    assert.equal(await page.evaluate(()=>window.__liftlog.S.exercises.length),120);
    await page.locator('[data-act="open-picker"]').first().click();
    const rows=page.locator('#picker-list .item');
    await expect(rows).toHaveCount(120);
    await expect(page.locator('#picker-list .thumb svg')).toHaveCount(120);
    await expect(page.locator('#picker-list svg[data-art-kind="illustration"]')).toHaveCount(112);
    await expect(page.locator('#picker-list svg[data-art-kind="fallback"]')).toHaveCount(8);
    await expect(page.locator('#picker-list svg[data-art-source="everkinetic:0211"]')).toHaveCount(1);
    await expect(page.locator('#picker-list img')).toHaveCount(0);
    const badArt=await page.locator('#picker-list .thumb svg').evaluateAll(els=>els.filter(el=>{const b=el.getBBox();return b.width===0||b.height===0||b.x<0||b.y<0||b.x+b.width>64||b.y+b.height>64;}).length);
    assert.equal(badArt,0,'artwork must fit its SVG viewport');
    await noOverflow(page);
    await page.screenshot({path:path.join(out,`${name}-${scheme}-picker.png`)});
    for(const [part,count] of [['하체',27],['가슴',17],['등',19],['어깨',14],['팔',18],['복근',15],['유산소',10]]){
      await page.locator(`[data-act="picker-part"][data-v="${part}"]`).click();
      await expect(rows).toHaveCount(count);
    }
    await page.locator('[data-act="picker-part"][data-v="전체"]').click();
    const body=page.locator('.sheet .body');
    await body.evaluate(el=>el.scrollTop=350);
    const visibleRow=await rows.evaluateAll(els=>els.findIndex(el=>{const r=el.getBoundingClientRect();return r.top>280&&r.bottom<600;}));
    assert.ok(visibleRow>=0);
    const before=await body.evaluate(el=>el.scrollTop);
    await rows.nth(visibleRow).locator('.cb').click();
    assert.ok(Math.abs(await body.evaluate(el=>el.scrollTop)-before)<2,'selection preserves scroll');
    await rows.nth(visibleRow).locator('.cb').click();
    await page.locator('#pq').fill('고블릿 스쿼트');
    await expect(rows).toHaveCount(1);
    await rows.first().locator('.thumb').click();
    await expect(page.locator('#modal h3')).toContainText('고블릿 스쿼트');
    await expect(page.locator('#modal .ex-icon')).toBeVisible();
    await expect(page.locator('#modal img')).toHaveCount(0);
    await page.screenshot({path:path.join(out,`${name}-${scheme}-detail.png`)});
    await page.locator('#modal [data-act="modal-close"]').click();
    await expect(page.locator('[data-act="picker-confirm"]')).toBeDisabled();
    await page.locator('#pq').fill('벤치 프레스');
    const old=page.locator('.item[data-id="ex010"] .thumb');
    await old.focus();await old.press('Enter');
    await expect(page.locator('#modal img')).toHaveCount(2);
    await expect.poll(()=>page.locator('#modal img').evaluateAll(els=>els.every(el=>el.complete&&el.naturalWidth>0))).toBe(true);
    await page.locator('#modal [data-act="modal-close"]').click();
    for(const exercise of ['스미스 머신 인클라인 프레스','친업','사이드 플랭크']){
      await page.locator('#pq').fill(exercise);
      await expect(rows).toHaveCount(1);
      await rows.first().locator('.cb').click();
    }
    await page.locator('[data-act="picker-confirm"]').click();
    const cards=page.locator('section.ex');
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(0).locator('.sets.weight')).toBeVisible();
    await expect(cards.nth(1).locator('.sets.reps')).toBeVisible();
    await expect(cards.nth(1).locator('[data-kg]')).toHaveCount(0);
    await expect(cards.nth(2).locator('.sets.time')).toBeVisible();
    await noOverflow(page);
    const kg=cards.nth(0).locator('[data-kg="0"]');
    await kg.click();await expect(page.locator('#keypad')).toBeVisible();
    await page.locator('[data-kp="2"]').click();await page.locator('[data-kp="0"]').click();
    await expect(kg).toHaveValue('20');
    await page.locator('[data-kp="hide"]').click();
    await cards.nth(0).locator('[data-reps="0"]').fill('10');
    await cards.nth(0).locator('[data-done="0"]').click();
    await cards.nth(1).locator('[data-reps="0"]').fill('8');
    await page.locator('[data-kp="hide"]').click();
    await cards.nth(0).scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(out,`${name}-${scheme}-workout.png`)});
    await page.locator('[data-act="session-start"]').click();
    await expect(page.locator('[data-act="session-pause"]')).toBeVisible();
    await page.locator('[data-act="session-pause"]').click();
    await expect(page.locator('[data-act="session-start"]')).toContainText('계속하기');
    await expect.poll(()=>page.evaluate(()=>{
      const s=JSON.parse(localStorage.getItem('liftlog.v1'));return Object.values(s.workouts)[0]?.items[0]?.sets[0]?.kg;
    })).toBe('20');
    await page.reload();
    await expect(page.locator('section.ex')).toHaveCount(3);
    await expect(page.locator('section.ex').nth(0).locator('[data-kg="0"]')).toHaveValue('20');
    await expect(page.locator('section.ex').nth(1).locator('[data-reps="0"]')).toHaveValue('8');
    await page.locator('[data-act="finish"]').click();
    await expect(page.getByText('수행 운동 정보',{exact:true})).toBeVisible();
    await expect(page.locator('section.ex')).toHaveCount(0);
    await page.locator('[data-act="finish"]').click();
    await expect(page.locator('section.ex')).toHaveCount(3);
    assert.deepEqual(errors,[],'no browser errors or missing assets');
    results.push({browser:name,scheme,status:'passed',checks:['120 exercises','7 body-part filters','SVG bounds','search','scroll preservation','icon/old-photo details','keyboard access','3 recording modes','app keypad','save/reload','timer','finish/reopen','no overflow','no console errors']});
  }catch(e){await page.screenshot({path:path.join(out,`${name}-${scheme}-failure.png`),fullPage:true}).catch(()=>{});throw e;}
  finally{await ctx.close();}
}
async function migrationAndOffline(browser,name){
  const ctx=await contextFor(browser);
  const page=await ctx.newPage();
  page.setDefaultTimeout(10000);
  const legacy={version:1,exercises:[{id:'ex019',part:'등',name:'랫풀다운',mode:'weight',bookmark:true,custom:false},{id:'cxmine',name:'내 운동',part:'팔',mode:'reps',custom:true}],routines:[{id:'r1',name:'기존 루틴',items:[{exId:'ex019',sets:[{kg:45,reps:10}]}]}],workouts:{'2026-10-27':{date:'2026-10-27',items:[{id:'i1',exId:'ex010',sets:[{kg:'60',reps:'8',done:true}]}]}},settings:{}};
  await page.addInitScript(value=>{if(!localStorage.getItem('liftlog.v1'))localStorage.setItem('liftlog.v1',JSON.stringify(value));},legacy);
  try{
    await page.goto(base);
    assert.deepEqual(await page.evaluate(()=>{const s=window.__liftlog.S;return {n:s.exercises.length,bm:s.exercises.find(e=>e.id==='ex019').bookmark,custom:s.exercises.find(e=>e.id==='cxmine').mode,kg:s.workouts['2026-10-27'].items[0].sets[0].kg,routine:s.routines[0].items[0].exId};}),{n:121,bm:true,custom:'reps',kg:'60',routine:'ex019'});
    // First install activates without taking over an already open workout.
    await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
    await page.reload();
    await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
    await ctx.setOffline(true);
    await page.reload({waitUntil:'domcontentloaded'});
    await expect(page.locator('[data-act="open-picker"]').first()).toBeVisible();
    await page.locator('[data-act="open-picker"]').first().click();
    await page.locator('[data-act="picker-part"][data-v="전체"]').click();
    await expect(page.locator('#picker-list .item')).toHaveCount(121);
    await expect(page.locator('#picker-list .ex-icon')).toHaveCount(121);
    await page.locator('#pq').fill('고블릿 스쿼트');
    await page.locator('#picker-list .thumb').click();
    await expect(page.locator('#modal .ex-icon')).toBeVisible();
    await expect(page.locator('#modal img')).toHaveCount(0);
    results.push({browser:name,status:'passed',checks:['legacy records/routine/custom/bookmark migration','service-worker offline reload','offline new icons/detail']});
  }finally{await ctx.close();}
}
async function analysisFlow(browser,name,scheme){
  const ctx=await contextFor(browser,{colorScheme:scheme,viewport:{width:scheme==='dark'?320:390,height:844}});
  const page=await ctx.newPage();page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(base);await page.locator('[data-tab="stats"]').click();
    await expect(page.getByText('아직 완료한 기록이 없어요')).toBeVisible();
    await page.getByRole('button',{name:'운동 기록하기',exact:true}).click();
    await expect(page.locator('[data-act="open-picker"]').first()).toBeVisible();
    await page.evaluate(()=>{
      const a=window.__liftlog,s=a.S;
      s.exercises.push({id:'cxreps',name:'테스트 맨몸',part:'등',mode:'reps',custom:true},{id:'cxtime',name:'테스트 달리기',part:'유산소',mode:'time',custom:true});
      const key=offset=>{const d=new Date();d.setDate(d.getDate()-offset);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
      const set=(kg,reps,extra={})=>({kg,reps,done:true,...extra});
      for(let i=0;i<12;i++)s.workouts[key(i*3)]={date:key(i*3),durationMs:i===1?null:3600000,items:[
        {id:'a'+i,exId:'ex010',sets:[set(70-i,10),set(99,10,{warm:true}),set(999,10,{done:false})]},
        {id:'b'+i,exId:'ex010',sets:[set(60-i,8)]},
        {id:'c'+i,exId:'cxreps',sets:[set(999,12),set(999,8)]},
        {id:'d'+i,exId:'cxtime',sets:[set(15,''),set(10,8)]}
      ]};
      s.workouts[key(-1)]={items:[{id:'future',exId:'ex010',sets:[set(999,99)]}]};a.persist();
    });
    await page.reload();await page.locator('[data-tab="stats"]').click();
    await expect(page.locator('.stats-overview .stat').nth(0).locator('.v')).toHaveText('10일');
    await expect(page.locator('.stats-overview .stat').nth(1).locator('.v')).toHaveText('40세트');
    await expect(page.locator('.stats-page>.stats-note')).toContainText('시간 기록 9/10일');
    await expect(page.locator('#statEx option')).toHaveCount(3);
    await page.locator('[data-act="stat-range"][data-v="7"]').click();
    await expect(page.locator('.stats-overview .stat').nth(0).locator('.v')).toHaveText('3일');
    await page.locator('[data-act="stat-range"][data-v="84"]').click();
    await expect(page.locator('.stats-overview .stat').nth(0).locator('.v')).toHaveText('12일');
    await page.locator('[data-act="stat-trend"][data-v="volume"]').click();
    await expect(page.locator('[data-act="stat-trend"][data-v="volume"]')).toHaveAttribute('aria-pressed','true');
    const labels=await page.locator('.stats-bar-column>span').evaluateAll(els=>els.filter(el=>el.textContent.trim()).map(el=>({left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right})));
    for(let i=1;i<labels.length;i++)assert.ok(labels[i-1].right<=labels[i].left+1,'chart values must not overlap');
    await page.locator('[data-act="stat-metric"][data-v="e1rm"]').click();
    await expect(page.locator('.stats-line')).toHaveAttribute('aria-label',/추정 1RM/);
    await page.locator('#statSearch').fill('존재하지 않는 종목');
    await expect(page.locator('#statSearchStatus')).toContainText('검색 결과가 없어요');
    await expect(page.locator('#statEx')).toBeDisabled();
    await page.locator('#statSearch').fill('달리기');
    await expect(page.locator('#statEx option:not([disabled])')).toHaveCount(1);
    await page.locator('#statEx').selectOption('cxtime');
    await expect(page.locator('.stats-ex-summary strong').first()).toHaveText('25분');
    await expect(page.locator('[data-act="stat-metric"]')).toHaveCount(1);
    await expect(page.locator('.stats-line')).toHaveAttribute('aria-label',/총 운동 시간/);
    await page.locator('.stats-more summary').click();
    await expect(page.locator('.stats-history-row')).toHaveCount(12);
    await page.locator('#statSearch').fill('맨몸');await page.locator('#statEx').selectOption('cxreps');
    await page.locator('[data-act="stat-metric"][data-v="totalReps"]').click();
    await expect(page.locator('.stats-ex-summary strong').first()).toHaveText('20회');
    await page.locator('#statSearch').fill('벤치');await page.locator('#statEx').selectOption('ex010');
    await page.locator('[data-act="stat-metric"][data-v="volume"]').click();
    await expect(page.locator('.stats-ex-summary strong').first()).toHaveText('1,180kg');
    await noOverflow(page);
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:path.join(out,`${name}-${scheme}-analysis.png`),fullPage:true});
    const date=await page.locator('.stats-history-row').first().getAttribute('data-date');
    await page.locator('.stats-history-row').first().click();
    await expect(page.locator('[data-tab="today"]')).toHaveClass(/on/);
    assert.ok(await page.evaluate(date=>window.__liftlog.S.workouts[date].items.length===4,date));
    await page.locator('[data-tab="stats"]').click();
    // A period with no valid sets remains navigable, and all-time exposes old records.
    await page.evaluate(()=>{const s=window.__liftlog.S;s.workouts={'2020-01-01':{items:[{exId:'ex010',sets:[{kg:50,reps:10,done:true}]}]}};window.__liftlog.persist();});
    await page.reload();await page.locator('[data-tab="stats"]').click();
    await expect(page.getByText('이 기간에는 완료한 본세트가 없어요')).toBeVisible();
    await page.getByRole('button',{name:'전체 기록 보기',exact:true}).click();
    await expect(page.locator('.stats-overview .stat').nth(0).locator('.v')).toHaveText('1일');
    await expect(page.locator('.stats-line')).toBeVisible();
    await noOverflow(page);
    assert.deepEqual(errors,[]);
    results.push({browser:name,scheme,status:'passed',checks:['analysis empty/range/comparison','mode-specific metrics and duplicate items','search/history navigation','unknown duration','old records/all-time','320px overflow']});
  }finally{await ctx.close();}
}
async function scrollFlow(browser,name,scheme){
 const ctx=await contextFor(browser,{colorScheme:scheme,viewport:{width:320,height:740}});
 try{
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
 await page.evaluate(()=>{const a=window.__liftlog;const items=Array.from({length:10},(_,i)=>({exId:'ex'+String(i).padStart(3,'0'),sets:[{kg:'40',reps:'10'}]}));a.S.routines=Array.from({length:8},(_,i)=>({id:'routine'+i,name:'스크롤 테스트 '+i,items:structuredClone(items)}));a.persist();});await page.reload();
 await page.evaluate(()=>{const a=window.__liftlog;a.S.workouts[a.todayKey()]={items:Array.from({length:8},(_,i)=>({id:'scroll'+i,exId:'ex'+String(i).padStart(3,'0'),memo:'긴 운동 메모\n'.repeat(12),sets:[{kg:'40',reps:'10',done:false}]}))};a.persist();});await page.reload();
 const done=page.locator('[data-done]').last();await done.scrollIntoViewIfNeeded();const y=await page.evaluate(()=>scrollY);await done.click();await expect.poll(async()=>Math.abs(await page.evaluate(()=>scrollY)-y)).toBeLessThan(3);
 await page.locator('[data-tab="routines"]').click();await page.evaluate(()=>scrollTo(0,800));await page.locator('[data-tab="settings"]').click();
 await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
 await page.locator('[data-tab="routines"]').click();await page.locator('[data-act="routine-edit"]').first().click();
 const body=page.locator('.sheet .body');await body.evaluate(el=>el.scrollTop=el.scrollHeight);const before=await body.evaluate(el=>el.scrollTop);
 await page.locator('[data-act="re-add"]').click();await expect.poll(()=>body.evaluate(el=>el.scrollTop)).toBe(0);
 await body.evaluate(el=>el.scrollTop=400);await page.locator('[data-act="picker-close"]').click();
 await expect.poll(async()=>Math.abs(await body.evaluate(el=>el.scrollTop)-before)).toBeLessThan(3);
 const last=page.locator('[data-ri]').last().locator('input').first();await last.click();await expect(page.locator('#keypad')).toBeVisible();
 await expect.poll(async()=>last.evaluate(el=>{const r=el.getBoundingClientRect(),k=document.querySelector('#keypad').getBoundingClientRect();return r.top>=52&&r.bottom<=k.top;})).toBe(true);
 await page.locator('[data-kp="hide"]').click();await noOverflow(page);
 await page.locator('[data-act="re-add"]').click();
 await page.evaluate(()=>{const a=window.__liftlog;const d=new Date(a.todayKey()+'T12:00:00');const key=n=>{const t=new Date(d);t.setDate(t.getDate()-n);return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');};a.S.workouts={};const item=exId=>({id:exId,exId,sets:[{kg:'40',reps:'10',done:true}]});a.S.workouts[key(1)]={items:[item('ex010'),item('ex010'),item('ex012')]};a.S.workouts[key(2)]={items:[item('ex010')]};a.persist();});
 await page.locator('[data-act="picker-sort"][data-v="frequency"]').click();
 const rows=page.locator('.item[data-act="picker-sel"]');await expect(rows.first()).toHaveAttribute('data-id','ex010');await expect(rows.first()).toContainText('누적 2회');await expect(rows.nth(1)).toHaveAttribute('data-id','ex012');await expect(rows.nth(1)).toContainText('누적 1회');
 await page.locator('[data-act="picker-equipment"][data-v="dumbbell"]').click();await expect(rows.first()).toHaveAttribute('data-id','ex012');
 await noOverflow(page);await page.screenshot({path:path.join(out,`${name}-${scheme}-frequency.png`)});assert.deepEqual(errors,[]);
 results.push({browser:name,scheme,status:'passed',checks:['tab scroll reset','routine picker return position','last set visible above keypad','frequency ordering/count/filter']});
 }finally{await ctx.close();}
}
async function progressionFlow(browser,name,scheme){
 const ctx=await contextFor(browser,{colorScheme:scheme,viewport:{width:320,height:740}});
 try{
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
 await page.evaluate(()=>{const a=window.__liftlog,k=a.todayKey(),d=new Date(k+'T12:00:00');d.setDate(d.getDate()-1);const prev=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');const sets=Array.from({length:3},()=>({kg:'40',reps:'12',done:true}));a.S.workouts[prev]={finishedAt:Date.now()-86400000,items:[{id:'prev',exId:'ex000',sets}]};a.S.workouts[k]={items:[{id:'current',exId:'ex000',sets:sets.map(s=>({...s,done:false}))}]};a.persist();});
 await page.reload();await page.locator('[data-act="item-menu"]').click();await page.getByText('다음 운동 목표 설정',{exact:true}).click();await page.locator('#pg-save').click();
 await expect(page.locator('.progression')).toContainText('42.5kg');await page.locator('[data-act="progression-apply"]').click();await expect(page.locator('[data-kg="0"]')).toHaveValue('42.5');
 await page.locator('[data-act="progression-undo"]').click();await expect(page.locator('[data-kg="0"]')).toHaveValue('40');
 await page.locator('[data-act="progression-apply"]').click();await page.reload();await expect(page.locator('[data-kg="0"]')).toHaveValue('42.5');
 await noOverflow(page);await page.screenshot({path:path.join(out,`${name}-${scheme}-progression.png`)});
 await page.locator('[data-act="open-picker"]').click();await page.locator('[data-act="picker-part"][data-v="가슴"]').click();await page.locator('[data-act="picker-equipment"][data-v="dumbbell"]').click();await page.locator('#pq').fill('프레스');await expect(page.locator('.item[data-act="picker-sel"]')).toHaveCount(2);
 await page.locator('.item[data-act="picker-sel"] .cb').first().click();await page.locator('[data-act="picker-equipment"][data-v="barbell"]').click();await expect(page.locator('[data-act="picker-confirm"]')).toContainText('1개 추가');await noOverflow(page);
 await page.screenshot({path:path.join(out,`${name}-${scheme}-equipment.png`)});assert.deepEqual(errors,[]);
 results.push({browser:name,scheme,status:'passed',checks:['progression configure/apply/undo/reload','equipment combined search and selection','320px overflow']});
 }finally{await ctx.close();}
}
async function starterFlow(browser,name,scheme){
  const ctx=await contextFor(browser,{colorScheme:scheme,viewport:{width:320,height:740}});
  try{
    const page=await ctx.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);
    await page.locator('[data-act="routine-starters"]').click();
    await expect(page.locator('[data-act="starter-preview"]')).toHaveCount(8);
    await page.locator('[data-plan="full"]').click();
    await expect(page.locator('#re-name')).toHaveValue('전신 기본');
    await expect(page.locator('[data-ri]')).toHaveCount(5);
    await expect(page.locator('.routine-coverage')).toContainText('하체 5세트');
    await page.locator('[data-act="re-close"]').click();
    await page.locator('[data-tab="routines"]').click();
    await expect(page.locator('[data-routine]')).toHaveCount(0);
    await page.locator('[data-act="routine-starters"]').click();
    await page.locator('[data-plan="five"][data-index="1"]').click();
    await page.locator('#re-name').fill('내 바벨 B');
    await page.locator('[data-act="re-save"]').click();
    await expect(page.locator('[data-routine]')).toHaveCount(1);
    await expect(page.locator('[data-routine]')).toContainText('내 바벨 B');
    await noOverflow(page);
    await page.screenshot({path:path.join(out,`${name}-${scheme}-starters.png`)});
    await page.locator('[data-act="routine-load"]').click();
    await expect(page.locator('section.ex')).toHaveCount(3);
    await expect(page.locator('[data-done].on')).toHaveCount(0);
    await expect(page.locator('[data-kg]').first()).toHaveValue('');
    await expect(page.locator('[data-reps]').first()).toHaveValue('5');
    await page.reload();
    await expect(page.locator('section.ex')).toHaveCount(3);
    await noOverflow(page);
    assert.deepEqual(errors,[]);
    results.push({browser:name,scheme,status:'passed',checks:['starter preview/cancel/save','part set counts','load/reload without auto completion','320px overflow']});
  }finally{await ctx.close();}
}
async function storageSafetyFlow(browser,name){
  const ctx=await contextFor(browser),page=await ctx.newPage();page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(base);
    await page.evaluate(()=>{const a=window.__liftlog;a.S.workouts['2026-11-03']={items:[],note:'recover me'};if(!a.persist())throw new Error('initial save failed');a.S.workouts['2026-11-03'].note='current';if(!a.persist())throw new Error('second save failed');});
    await page.locator('[data-tab="settings"]').click();
    await page.locator('[data-act="import"]').click();await page.locator('#im-json').fill('{"version":1,"exercises":[],"workouts":null}');await page.locator('#im-ok').click();
    await expect(page.locator('#storage-alert')).toBeVisible();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('liftlog.v1')).workouts['2026-11-03'].note),'current');
    await page.reload();
    await page.evaluate(()=>localStorage.setItem('liftlog.v1','{broken'));
    await page.reload();await expect(page.locator('#storage-alert')).toBeVisible();
    assert.equal(await page.evaluate(()=>window.__liftlog.persist()),false);
    assert.equal(await page.evaluate(()=>localStorage.getItem('liftlog.v1')),'{broken');
    await page.locator('#tabbar [data-tab="settings"]').click();
    await page.locator('[data-act="storage-backup"]').click();
    assert.equal(JSON.parse(await page.locator('#ex-json').inputValue()).workouts['2026-11-03'].note,'recover me');
    await page.locator('#modal [data-act="modal-close"]').click();
    await page.locator('[data-act="storage-recover"]').click();await page.locator('#m-ok').click();
    await expect(page.locator('#storage-alert')).toBeHidden();
    assert.equal(await page.evaluate(()=>localStorage.getItem('liftlog.v1.corrupt')),'{broken');
    assert.equal(await page.evaluate(()=>window.__liftlog.S.workouts['2026-11-03'].note),'recover me');
    await page.evaluate(()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='liftlog.v1')throw new DOMException('full','QuotaExceededError');return window.originalSetItem.call(this,key,value);};window.__liftlog.S.workouts['2026-11-03'].note='retry me';window.__liftlog.save();});
    await expect(page.locator('#storage-alert')).toBeVisible();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('liftlog.v1')).workouts['2026-11-03'].note),'recover me');
    await page.evaluate(()=>Storage.prototype.setItem=window.originalSetItem);
    await page.locator('[data-act="storage-retry"]').click();await expect(page.locator('#storage-alert')).toBeHidden();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('liftlog.v1')).workouts['2026-11-03'].note),'retry me');
    const other=await ctx.newPage();await other.goto(base);
    await other.evaluate(()=>{window.__liftlog.S.workouts['2026-11-03'].note='other tab';window.__liftlog.persist();});
    assert.equal(await page.evaluate(()=>{window.__liftlog.S.workouts['2026-11-03'].note='stale';return window.__liftlog.persist();}),false);
    await expect(page.locator('#storage-alert')).toContainText('다른 창');
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('liftlog.v1')).workouts['2026-11-03'].note),'other tab');
    assert.deepEqual(errors,[]);
    results.push({browser:name,status:'passed',checks:['invalid import preserved','corrupt primary protected','recovery export/restore','quota failure/retry','stale tab protection']});
  }finally{await ctx.close();}
}
async function stalledSDK(browser,name){
  const ctx=await contextFor(browser),page=await ctx.newPage();
  await ctx.route('**/npm/@supabase/**',()=>{}); // Intentionally unresolved optional network request.
  try{
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:8000});
    await expect(page.locator('[data-act="open-picker"]').first()).toBeVisible({timeout:3000});
    await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
    await page.locator('[data-act="open-picker"]').first().click();
    await expect(page.locator('#picker-list .item')).toHaveCount(120);
    results.push({browser:name,status:'passed',checks:['stalled SDK cannot block local UI or offline installation']});
  }finally{await ctx.close();}
}
async function upgradeFlow(browser,name){
  releaseTest={version:1,fail:false};
  const ctx=await contextFor(browser);let page=await ctx.newPage();
  const update=()=>page.evaluate(async()=>{
    const registration=await navigator.serviceWorker.ready;
    const result=new Promise(resolve=>registration.addEventListener('updatefound',()=>{
      const worker=registration.installing;
      const check=()=>{if(['installed','redundant'].includes(worker.state))resolve(worker.state);};
      worker.addEventListener('statechange',check);check();
    },{once:true}));
    await registration.update();return result;
  });
  try{
    await page.goto(base);await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-test-release','1');
    await page.evaluate(()=>{window.__liftlog.S.workouts['2026-11-03']={items:[],note:'survives deployment'};window.__liftlog.persist();});
    releaseTest={version:2,fail:true};assert.equal(await update(),'redundant');
    await page.reload();await expect(page.locator('body')).toHaveAttribute('data-test-release','1');
    releaseTest={version:3,fail:false};assert.equal(await update(),'installed');
    await page.reload();await expect(page.locator('body')).toHaveAttribute('data-test-release','1');
    await page.close();
    // Give the browser a lifecycle turn to activate now that no controlled clients remain.
    await new Promise(resolve=>setTimeout(resolve,250));
    page=await ctx.newPage();await page.goto(base);
    await expect(page.locator('body')).toHaveAttribute('data-test-release','3');
    assert.equal(await page.evaluate(()=>window.__liftlog.S.workouts['2026-11-03'].note),'survives deployment');
    await ctx.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});
    await expect(page.locator('body')).toHaveAttribute('data-test-release','3');
    await expect(page.locator('[data-act="open-picker"]').first()).toBeVisible();
    results.push({browser:name,status:'passed',checks:['failed partial install retains release','waiting worker retains open release','next launch upgrades atomically','records and offline shell survive update']});
  }finally{await ctx.close();releaseTest=null;}
}
(async()=>{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  base=`http://127.0.0.1:${server.address().port}`;
  try{
    for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
      const browser=await engine.launch({headless:true});
      try{if(process.env.LIFTLOG_BROWSER_SUITE!=='safety')for(const scheme of ['light','dark']){await scrollFlow(browser,name,scheme);console.log(`PASS ${name} ${scheme} scroll`);await flow(browser,name,scheme);console.log(`PASS ${name} ${scheme}`);await progressionFlow(browser,name,scheme);console.log(`PASS ${name} ${scheme} progression/filters`);await starterFlow(browser,name,scheme);console.log(`PASS ${name} ${scheme} starters`);await analysisFlow(browser,name,scheme);console.log(`PASS ${name} ${scheme} analysis`);}await migrationAndOffline(browser,name);console.log(`PASS ${name} migration/offline`);await storageSafetyFlow(browser,name);console.log(`PASS ${name} storage safety`);await stalledSDK(browser,name);console.log(`PASS ${name} stalled SDK`);await upgradeFlow(browser,name);console.log(`PASS ${name} upgrade`);}
      finally{await browser.close();}
    }
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
    console.log(`PASS ${results.length} browser scenarios; screenshots and report: ${out}`);
  }finally{await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,error:e.stack},null,2));console.error(`Artifacts: ${out}`);process.exitCode=1;server.close();});
