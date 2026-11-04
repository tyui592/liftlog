"""Regenerate source-only artwork from the reviewed pinned manifest (no downloads).
Run after editing assets/artwork/manifest.json: python3 scripts/build_artwork.py
The generated block keeps src/js/artwork.js self-contained and offline capable.
"""
import json, pathlib, re, xml.etree.ElementTree as ET
ROOT=pathlib.Path(__file__).resolve().parents[1]
ASSETS=ROOT/'assets/artwork'
NS='{http://www.w3.org/2000/svg}'
ET.register_namespace('',NS[1:-1])
manifest=json.loads((ASSETS/'manifest.json').read_text())
art,meta={},{}
for entry in manifest['exercises']:
    item={key:entry[key] for key in ('kind','note','equipment') if key in entry}
    if entry['kind']=='illustration':
        key=entry['source']+':'+entry['sourceId']
        root=ET.parse(ASSETS/'original'/entry['file']).getroot()
        # Pin geometry-only SVGs: no scripts, event handlers, URLs or external resources.
        for el in root.iter():
            if el.tag not in {NS+'svg',NS+'g',NS+'path'}:
                raise ValueError('Unexpected SVG element: '+el.tag)
            if any(attr not in {'width','height','viewBox','fill','fill-rule','d'} for attr in el.attrib):
                raise ValueError('Unexpected SVG attribute: '+entry['file'])
        if entry['source']=='everkinetic':
            for child in list(root):
                if child.attrib.get('fill','').lower() in {'#fff','#ffffff','white'}:
                    root.remove(child)
        for el in root.iter():
            if 'fill' in el.attrib: el.set('fill','currentColor')
        x,y,w,h=entry.get('bounds',list(map(float,root.attrib['viewBox'].split())))
        scale=54/max(w,h)
        tx=32-(x+w/2)*scale;ty=32-(y+h/2)*scale
        shapes=''.join(ET.tostring(el,encoding='unicode') for el in root)
        shapes=re.sub(r' xmlns="[^"]+"','',shapes)
        art[key]=f'<g transform="translate({tx:.5f} {ty:.5f}) scale({scale:.7f})">{shapes}</g>'
        item.update(key=key,source=entry['source'],creator=entry['creator'],url=entry['sourceUrl'])
    meta[entry['id']]=item
assert len(meta)==120 and len(set(meta))==120
block='// BEGIN GENERATED ARTWORK — scripts/build_artwork.py\nconst EX_ART='+json.dumps(art,ensure_ascii=False,separators=(',',':'))+';\nconst ART_META='+json.dumps(meta,ensure_ascii=False,separators=(',',':'))+';\n// END GENERATED ARTWORK'
p=ROOT/'src/js/artwork.js';source=p.read_text()
if '// BEGIN GENERATED ARTWORK' in source:
    source=re.sub(r'// BEGIN GENERATED ARTWORK.*?// END GENERATED ARTWORK',lambda _:block,source,flags=re.S)
else:
    start=source.index('const EX_ART=');end=source.index('// Source-only artwork:',start)
    source=source[:start]+block+'\n\n'+source[end:]
p.write_text(source)
print('Embedded',len(art),'unique illustrations;',sum(e['kind']=='illustration' for e in meta.values()),'mapped exercises; app bytes',p.stat().st_size)
