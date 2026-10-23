"""src/app.html(프래그먼트) → dist/ (호스팅용 완성 PWA) 로 빌드.
실행: python3 build.py
"""
import re, shutil, pathlib

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src" / "app.html"
DIST = ROOT / "dist"
DIST.mkdir(exist_ok=True)

frag = SRC.read_text(encoding="utf-8")
# 아티팩트 전용 메타는 호스팅 버전에서 제거
frag = re.sub(r'<meta name="claude:viewport-fit-sides"[^>]*>\n?', "", frag)

head = """<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1">
<meta name="theme-color" content="#EEF1F5" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0F1216" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="리프트로그">
<link rel="manifest" href="./manifest.webmanifest">
<link rel="apple-touch-icon" href="./icon-180.png">
<link rel="icon" type="image/png" sizes="512x512" href="./icon-512.png">
<style>
:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
[hidden]{display:none!important}
</style>
"""
tail = """
<script>
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  });
}
</script>
</body>
</html>
"""
# <title>…<link> 등 head 요소는 프래그먼트 앞부분에 있으므로 body 시작 전에 분리
m = re.search(r"(<div id=\"app\">)", frag)
head_part, body_part = frag[: m.start()], frag[m.start():]
out = head + head_part + "</head>\n<body>\n" + body_part + tail
(DIST / "index.html").write_text(out, encoding="utf-8")

(DIST / "manifest.webmanifest").write_text("""{
  "name": "리프트로그",
  "short_name": "리프트로그",
  "description": "헬스 운동 기록 — 세트별 무게·횟수, 루틴, 휴식 타이머, 분석",
  "lang": "ko",
  "start_url": "./index.html",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#EEF1F5",
  "theme_color": "#E8541E",
  "icons": [
    { "src": "./icon-180.png", "sizes": "180x180", "type": "image/png" },
    { "src": "./icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
""", encoding="utf-8")

(DIST / "sw.js").write_text("""// 리프트로그 서비스워커: 앱 파일을 캐시해 오프라인(헬스장 지하 등)에서도 열리게 함.
const CACHE = 'liftlog-v1';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// 네트워크 우선, 실패하면 캐시 (새 버전을 배포하면 온라인일 때 바로 반영됨)
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      if (r.ok && new URL(e.request.url).origin === location.origin) caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
""", encoding="utf-8")

for name in ("icon-180.png", "icon-512.png"):
    p = ROOT / "assets" / name
    if p.exists():
        shutil.copy(p, DIST / name)

print("built:", sorted(x.name for x in DIST.iterdir()))
