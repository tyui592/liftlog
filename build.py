"""src/app.html(프래그먼트) → dist/ (호스팅용 완성 PWA) 로 빌드.
실행: python3 build.py
"""
import re, shutil, pathlib, hashlib, json

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src" / "app.html"
DIST = ROOT / "dist"
DIST.mkdir(exist_ok=True)

frag = SRC.read_text(encoding="utf-8")
# Content-addressed files prevent old HTML from loading a different release's code.
app_files = []
def emit_asset(match):
    source = match.group(1)
    data = (ROOT / "src" / source).read_bytes()
    relative = pathlib.Path(source)
    name = relative.stem + "." + hashlib.sha256(data).hexdigest()[:16] + relative.suffix
    target = relative.with_name(name)
    (DIST / target).parent.mkdir(parents=True, exist_ok=True)
    (DIST / target).write_bytes(data)
    app_files.append("./" + target.as_posix())
    return match.group(0).replace("./" + source, "./" + target.as_posix())
frag = re.sub(r'(?:src|href)="\./([^" ]+\.(?:js|css))"', emit_asset, frag)
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
__SUPABASE_CONFIG__<style>
:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
[hidden]{display:none!important}
</style>
"""
tail = """
<script>
if ('serviceWorker' in navigator) {
  window.addEventListener('DOMContentLoaded', function () {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  });
}
</script>
</body>
</html>
"""
# supabase.json 이 있으면 URL/anon key 를 주입 (anon key 는 RLS 전제의 공개 키)
cfg_path = ROOT / "supabase.json"
cfg_tag = ""
if cfg_path.exists():
    import json
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    if cfg.get("url") and cfg.get("anon"):
        cfg_tag = "<script>window.LIFTLOG_SUPABASE=" + json.dumps({"url": cfg["url"].rstrip("/"), "anon": cfg["anon"]}) + ";</script>\n"
        print("supabase config: injected", cfg["url"])
head = head.replace("__SUPABASE_CONFIG__", cfg_tag)

# <title>…<link> 등 head 요소는 프래그먼트 앞부분에 있으므로 body 시작 전에 분리
m = re.search(r'<div id="(?:storage-alert|app)"', frag)
head_part, body_part = frag[: m.start()], frag[m.start():]
out = head + head_part + "</head>\n<body>\n" + body_part + tail
(DIST / "index.html").write_text(out, encoding="utf-8")

(DIST / "manifest.webmanifest").write_text("""{
  "name": "리프트로그",
  "short_name": "리프트로그",
  "description": "헬스 운동 기록 — 세트별 무게·횟수, 루틴, 전체 운동 시간, 분석",
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

# A complete release shell is installed atomically. Workers wait for old tabs to close.
shell = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-512.png', *app_files]
worker = (ROOT / 'src' / 'sw.js').read_text(encoding='utf-8')
release_hash = hashlib.sha256()
for content in [out.encode(), worker.encode(), (DIST / 'manifest.webmanifest').read_bytes(),
                *((ROOT / 'assets' / name).read_bytes() for name in ('icon-180.png', 'icon-512.png'))]:
    release_hash.update(hashlib.sha256(content).digest())
release = release_hash.hexdigest()[:16]
worker = worker.replace('__RELEASE__', release).replace('__SHELL_FILES__', json.dumps(shell))
(DIST / 'sw.js').write_text(worker, encoding='utf-8')

for name in ("icon-180.png", "icon-512.png"):
    p = ROOT / "assets" / name
    if p.exists():
        shutil.copy(p, DIST / name)

# 운동 사진 (assets/ex/*.webp → dist/img/). 출처: free-exercise-db (Unlicense)
img_dir = DIST / "img"
img_dir.mkdir(exist_ok=True)
n = 0
for p in (ROOT / "assets" / "ex").glob("*.webp"):
    shutil.copy(p, img_dir / p.name)
    n += 1
print("exercise images:", n)

# Source notices and full attribution accompany the inline artwork in index.html.
# SVG geometry is already inline, so thumbnails need no additional network request.
artwork_out = DIST / "artwork"
artwork_out.mkdir(exist_ok=True)
for name in ("manifest.json", "LICENSE-EVERKINETIC.md", "LICENSE-WORKOUT-GUIDE.md", "ATTRIBUTION-WORKOUT-GUIDE.md"):
    shutil.copy(ROOT / "assets" / "artwork" / name, artwork_out / name)

print("built:", sorted(x.name for x in DIST.iterdir()))
