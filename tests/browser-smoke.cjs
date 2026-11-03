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
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(err,data)=>{
    if(err){res.writeHead(404).end();return;}
    const type={'.html':'text/html; charset=utf-8','.js':'application/javascript','.webmanifest':'application/manifest+json','.png':'image/png','.webp':'image/webp'}[path.extname(file)]||'application/octet-stream';
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
    // Wait until the real service worker controls the page before going offline.
    await page.evaluate(()=>Promise.race([(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));})(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Service worker did not take control')),10000))]));
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
(async()=>{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  base=`http://127.0.0.1:${server.address().port}`;
  try{
    for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
      const browser=await engine.launch({headless:true});
      try{for(const scheme of ['light','dark']){await flow(browser,name,scheme);console.log(`PASS ${name} ${scheme}`);await analysisFlow(browser,name,scheme);console.log(`PASS ${name} ${scheme} analysis`);}await migrationAndOffline(browser,name);console.log(`PASS ${name} migration/offline`);}
      finally{await browser.close();}
    }
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
    console.log(`PASS ${results.length} browser scenarios; screenshots and report: ${out}`);
  }finally{await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,error:e.stack},null,2));console.error(`Artifacts: ${out}`);process.exitCode=1;server.close();});
