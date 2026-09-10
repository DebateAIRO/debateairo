#!/usr/bin/env python3
"""make-pages.py <reports-dir> <out-dir> <port> — writes nodes.html and full.html into out-dir from
<reports-dir>/mission-graph-{nodes,full}.mmd (graph.sh output). Serve out-dir with
`python3 serve.py <port> <out-dir>` (it also receives the POSTed SVG/PNG), navigate the harness's browser
pane (a NEW tab, never V's) to http://127.0.0.1:<port>/nodes.html then /full.html, wait ~6 s / ~10 s until
document.title starts with DONE; the PNGs land in out-dir. Send them with SendUserFile (display: render).
Why a browser page: headless Chrome hangs on this machine (2026-09-10) and V cannot open .mmd files."""
import pathlib,sys,shutil
R=pathlib.Path(sys.argv[1]); O=pathlib.Path(sys.argv[2]); PORT=sys.argv[3]; O.mkdir(parents=True,exist_ok=True)
shutil.copy(pathlib.Path(__file__).parent/'mermaid.min.js', O/'mermaid.min.js')
for name in ('nodes','full'):
    mm=(R/f'mission-graph-{name}.mmd').read_text()
    page=f"""<!doctype html><html><head><meta charset="utf-8"><title>{name}</title>
<style>body{{margin:0;background:#fff;font-family:-apple-system,Helvetica,Arial,sans-serif}} #g svg{{display:block}} #st{{position:fixed;top:4px;left:4px;font:12px monospace;background:#ffd}}</style></head>
<body><div id="st">rendering…</div><div id="g"></div>
<script src="./mermaid.min.js"></script>
<script>
const st=(m)=>{{document.getElementById('st').textContent=m; document.title=m;}};
mermaid.initialize({{startOnLoad:false, securityLevel:'loose', flowchart:{{useMaxWidth:false, htmlLabels:false, nodeSpacing:28, rankSpacing:48}}, maxTextSize:900000, maxEdges:2000}});
const src = {mm!r};
(async () => {{
  try {{
    const {{svg}} = await mermaid.render('m1', src);
    document.getElementById('g').innerHTML = svg;
    const s=document.querySelector('#g svg'); const r=s.getBoundingClientRect(); const W=Math.ceil(r.width), H=Math.ceil(r.height);
    s.setAttribute('width',W); s.setAttribute('height',H); s.setAttribute('xmlns','http://www.w3.org/2000/svg');
    let xml=new XMLSerializer().serializeToString(s); xml=xml.replace(/@import[^;]*;/g,'').replace(/<foreignObject[\\s\\S]*?<\\/foreignObject>/g,'');
    await fetch('http://127.0.0.1:{PORT}/mission-graph-{name}.svg',{{method:'POST',body:xml}});
    const sc = Math.max(W,H) > 6000 ? 1 : 2;
    const img=new Image(); const url=URL.createObjectURL(new Blob([xml],{{type:'image/svg+xml;charset=utf-8'}}));
    await new Promise((ok,err)=>{{img.onload=ok; img.onerror=err; img.src=url;}});
    const c=document.createElement('canvas'); c.width=W*sc; c.height=H*sc; const ctx=c.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,c.width,c.height); ctx.drawImage(img,0,0,W*sc,H*sc);
    const blob=await new Promise(ok=>c.toBlob(ok,'image/png'));
    const resp=await fetch('http://127.0.0.1:{PORT}/mission-graph-{name}.png',{{method:'POST',body:blob}});
    st('DONE W'+W+'H'+H+' sc'+sc+' png'+blob.size+' '+resp.status);
  }} catch(e) {{ st('ERR '+e.message); }}
}})();
</script></body></html>"""
    (O/f'{name}.html').write_text(page)
print('pages written for port',PORT)
