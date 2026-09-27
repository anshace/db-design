// page.mjs — the document shell: design tokens, collapsible sidebar, page JS.
// Everything here is inlined into the output; the generated HTML has zero external requests.
import { esc } from "./model.mjs";

export function page({ title, meta, nav, sections, footer, stats }) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
${CSS}
</style>
</head>
<body>
<a class="skip" href="#content">Skip to content</a>
<aside id="sb" class="sb" aria-label="Sections">
  <div class="sb-top">
    <span class="sb-mark" aria-hidden="true">${MARK}</span>
    <span class="sb-name">${esc(title)}</span>
    <button id="collapse" class="icon-btn" title="Collapse sidebar" aria-label="Collapse sidebar">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M10 3 5 8l5 5"/></svg>
    </button>
  </div>
  <nav class="sb-nav">${nav}</nav>
</aside>
<button id="expand" class="expand-btn icon-btn" title="Expand sidebar" aria-label="Expand sidebar" hidden>
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 3l5 5-5 5"/></svg>
</button>
<div class="shell">
  <header class="top">
    <div class="top-in">
      <h1>${esc(title)}</h1>
      <div class="stats-inline">${stats}</div>
      <div class="spacer"></div>
      <div class="seg" role="group" aria-label="Theme">
        <button data-th="light" class="icon-btn seg-b" title="Light">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="3.4"/><path d="M8 .8v2M8 13.2v2M.8 8h2M13.2 8h2M2.9 2.9l1.4 1.4M11.7 11.7l1.4 1.4M13.1 2.9l-1.4 1.4M4.3 11.7l-1.4 1.4"/></svg>
        </button>
        <button data-th="dark" class="icon-btn seg-b" title="Dark">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13.5 9.5A6 6 0 1 1 6.5 2.5a5 5 0 0 0 7 7Z"/></svg>
        </button>
      </div>
    </div>
  </header>
  <main id="content">${sections}</main>
  <footer>${esc(footer)}</footer>
</div>
<script>
${PAGE_JS}
</script>
</body>
</html>`;
}

const MARK = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
<ellipse cx="8" cy="3.4" rx="5.6" ry="2.4"/><path d="M2.4 3.4v9.2c0 1.3 2.5 2.4 5.6 2.4s5.6-1.1 5.6-2.4V3.4"/>
<path d="M2.4 8c0 1.3 2.5 2.4 5.6 2.4s5.6-1.1 5.6-2.4"/></svg>`;

const CSS = `
:root{
  --bg:#f6f8fb; --surface:#ffffff; --surface2:#eef2f8; --border:#dbe3ee; --border-soft:#e8edf5;
  --text:#141e2b; --muted:#5a6b82; --accent:#2f6ae0; --accent-soft:#e5eefc; --accent-deep:#1e4fb8;
  --pk:#8a6d00; --fk:#0b6e80; --uk:#5b41c7; --warn:#ad5320; --edge:#7d90a9;
  --r-sm:6px; --r-md:9px; --r-lg:14px;
  --mono:ui-monospace,"Cascadia Code","JetBrains Mono",Consolas,monospace;
  --shadow-sm:0 1px 2px rgba(14,19,26,.06),0 2px 8px rgba(14,19,26,.05);
  --shadow-md:0 2px 4px rgba(14,19,26,.06),0 12px 32px rgba(14,19,26,.10);
  --sb-w:264px;
}
[data-theme="dark"]{
  --bg:#0d141f; --surface:#161f2d; --surface2:#1d2839; --border:#2b3a52; --border-soft:#223047;
  --text:#e2e9f4; --muted:#93a4bc; --accent:#5b9bf8; --accent-soft:#1c2d4d; --accent-deep:#a9c9fb;
  --pk:#d6b94c; --fk:#4cc7dd; --uk:#a78bfa; --warn:#f0925f; --edge:#63799a;
  --shadow-sm:0 1px 2px rgba(0,0,0,.4);
  --shadow-md:0 2px 6px rgba(0,0,0,.4),0 16px 40px rgba(0,0,0,.35);
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
body{margin:0;background:var(--bg);color:var(--text);
  font:15px/1.65 system-ui,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
::selection{background:var(--accent-soft);color:var(--accent-deep)}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline;color:var(--accent-deep)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}
::-webkit-scrollbar{width:11px;height:11px}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:6px;border:3px solid var(--bg)}
::-webkit-scrollbar-thumb:hover{background:var(--muted)}
code,.mono{font-family:var(--mono);font-size:.87em}
.skip{position:absolute;left:-40vw;top:8px;background:var(--surface);padding:8px 14px;border-radius:var(--r-md);z-index:99}
.skip:focus{left:12px}

/* ---------- sidebar ---------- */
.sb{position:fixed;inset:0 auto 0 0;width:var(--sb-w);z-index:50;display:flex;flex-direction:column;
  background:var(--surface);border-right:1px solid var(--border-soft);transition:transform .28s cubic-bezier(.2,.8,.25,1)}
.sb.collapsed{transform:translateX(calc(-1 * var(--sb-w) + 52px))}
.sb-top{display:flex;align-items:center;gap:9px;padding:16px 14px 12px;border-bottom:1px solid var(--border-soft)}
.sb-mark{display:grid;place-items:center;width:26px;height:26px;border-radius:7px;background:var(--accent-soft);color:var(--accent);flex:none}
.sb-name{font:650 13px/1.3 var(--mono);letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
.icon-btn{display:inline-grid;place-items:center;background:transparent;border:1px solid transparent;color:var(--muted);
  border-radius:var(--r-sm);width:26px;height:26px;cursor:pointer;transition:background .18s,color .18s,border-color .18s}
.icon-btn:hover{background:var(--surface2);color:var(--text);border-color:var(--border);text-decoration:none}
.icon-btn:active{transform:scale(.94)}
.sb-nav{flex:1;overflow-y:auto;padding:12px 10px 30px;font-size:13.2px}
.sb-nav .grp{margin:14px 6px 5px;font:700 10px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--muted);opacity:.75}
.sb-nav a{display:flex;justify-content:space-between;align-items:baseline;gap:8px;color:var(--text);
  padding:5px 10px;border-radius:var(--r-sm);transition:background .15s,color .15s}
.sb-nav a:hover{background:var(--surface2);text-decoration:none}
.sb-nav a .n{font:500 10.5px var(--mono);color:var(--muted)}
.sb-nav a.sub{padding-left:24px;font-size:12px;font-family:var(--mono);color:var(--muted)}
.sb-nav a.active{background:var(--accent-soft);color:var(--accent-deep);font-weight:600}
.expand-btn{position:fixed;left:10px;top:10px;z-index:55;background:var(--surface);border:1px solid var(--border);width:32px;height:32px;box-shadow:var(--shadow-sm)}
.sb::-webkit-scrollbar,.sb-nav::-webkit-scrollbar{width:8px}

/* ---------- shell / header ---------- */
.shell{margin-left:var(--sb-w);min-height:100dvh;display:flex;flex-direction:column}
body.sb-closed .shell{margin-left:52px}
.top{position:sticky;top:0;z-index:40;height:56px;background:color-mix(in srgb,var(--surface) 86%,transparent);
  backdrop-filter:blur(14px) saturate(1.4);-webkit-backdrop-filter:blur(14px);
  border-bottom:1px solid var(--border-soft)}
.top-in{display:flex;align-items:center;gap:18px;height:56px;padding:0 28px;flex-wrap:nowrap;overflow:hidden}
.top h1{margin:0;font-size:16px;font-weight:700;letter-spacing:-.015em;white-space:nowrap;flex:none}
.top h1::before{content:"";display:inline-block;width:8px;height:8px;border-radius:2.5px;
  background:var(--accent);margin-right:10px;vertical-align:1px}
.stats-inline{display:flex;align-items:baseline;gap:0;flex:none}
.stat{display:flex;align-items:baseline;gap:6px;padding:0 13px;border-left:1px solid var(--border-soft)}
.stat:first-child{border-left:0}
.stat b{font:700 13.5px var(--mono);letter-spacing:-.02em;color:var(--text)}
.stat span{font-size:9px;text-transform:uppercase;letter-spacing:.11em;color:var(--muted);font-weight:650}
.prov{display:flex;gap:8px;align-items:center;margin:0 0 16px;min-width:0}
.prov .chip{max-width:52ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chip{display:inline-flex;align-items:center;gap:5px;padding:2.5px 10px;border-radius:999px;font-size:11.5px;
  background:var(--surface2);border:1px solid var(--border-soft);color:var(--muted);white-space:nowrap}
.chip.mono{font-family:var(--mono);font-size:10.5px;max-width:360px;overflow:hidden;text-overflow:ellipsis}
.chip b{font-family:var(--mono);font-weight:650;color:var(--text)}
.chip.accent{background:var(--accent-soft);border-color:transparent;color:var(--accent-deep);font-weight:650}
.chip.pk{color:var(--pk)}.chip.fk{color:var(--fk)}.chip.uk{color:var(--uk)}.chip.warn{color:var(--warn)}
.spacer{flex:1}
.seg{display:flex;border:1px solid var(--border);border-radius:var(--r-md);overflow:hidden;background:var(--surface2)}
.seg .seg-b{border-radius:0;width:34px;height:30px}
.seg .seg-b.on{background:var(--surface);box-shadow:var(--shadow-sm);color:var(--accent)}

/* ---------- content ---------- */
main{flex:1;padding:34px 30px 110px;max-width:1500px;width:100%}
section{margin:0 0 66px;scroll-margin-top:118px}
h2{font-size:21px;font-weight:680;letter-spacing:-.018em;margin:0 0 6px;display:flex;align-items:center;gap:10px}
h2 .tag{font:650 10.5px/1 var(--mono);color:var(--accent-deep);background:var(--accent-soft);padding:6px 9px;border-radius:var(--r-sm);letter-spacing:.02em}
h3{font-size:11.5px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);margin:34px 0 12px;font-weight:700}
.desc{color:var(--muted);max-width:80ch;margin:0 0 18px}
.note{background:var(--surface);border:1px solid var(--border-soft);border-radius:var(--r-md);padding:12px 16px;
  color:var(--muted);font-size:13px;margin:0 0 18px;box-shadow:var(--shadow-sm)}
.note .lab{font:700 10px/1.8 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--accent);margin-right:10px}
.legend pre{font-family:var(--mono);font-size:12.3px;white-space:pre-wrap;margin:0;color:var(--muted)}

/* ---------- figures ---------- */
.figure{background:var(--surface);border:1px solid var(--border-soft);border-radius:var(--r-lg);
  margin:0 0 20px;overflow:hidden;box-shadow:var(--shadow-md)}
.figure .bar{display:flex;gap:8px;align-items:center;padding:9px 14px;border-bottom:1px solid var(--border-soft);
  background:var(--surface2)}
.figure .bar .cap{font:700 10.5px/1.5 var(--mono);letter-spacing:.09em;text-transform:uppercase;color:var(--muted);flex:1}
.figure .bar button{border:1px solid var(--border);background:var(--surface);color:var(--text);
  min-width:26px;height:24px;border-radius:var(--r-sm);cursor:pointer;font:600 12px var(--mono);padding:0 8px;
  transition:border-color .15s,color .15s,transform .06s}
.figure .bar button:hover{border-color:var(--accent);color:var(--accent)}
.figure .bar button:active{transform:translateY(1px)}
.hint{font-size:10.5px;color:var(--muted);opacity:.8}
.canvas{overflow:hidden;cursor:grab;position:relative;background:
  radial-gradient(circle,var(--border-soft) 1px,transparent 1.4px) 0 0/24px 24px}
.canvas.tall{max-height:78vh}
.canvas.panning{cursor:grabbing}
.canvas svg{display:block}

/* ---------- tables & cards ---------- */
table.grid{width:100%;border-collapse:separate;border-spacing:0;background:var(--surface);
  border:1px solid var(--border-soft);border-radius:var(--r-md);overflow:hidden;font-size:13.3px;box-shadow:var(--shadow-sm)}
table.grid th{background:var(--surface2);text-align:left;font-size:10px;letter-spacing:.1em;
  text-transform:uppercase;color:var(--muted);padding:9px 13px;font-weight:700}
table.grid td{padding:7px 13px;border-top:1px solid var(--border-soft);vertical-align:top}
table.grid tr:hover td{background:color-mix(in srgb,var(--accent-soft) 30%,transparent)}
td.mono{font-family:var(--mono);font-size:12.4px;white-space:nowrap}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(480px,1fr));gap:20px}
.card{background:var(--surface);border:1px solid var(--border-soft);border-radius:var(--r-lg);overflow:hidden;
  box-shadow:var(--shadow-sm);scroll-margin-top:120px;transition:box-shadow .2s,transform .2s}
.card:hover{box-shadow:var(--shadow-md)}
.card>h4{margin:0;padding:12px 16px 0;font:700 13.5px var(--mono);letter-spacing:-.01em;display:flex;gap:8px;align-items:center}
.card .cnote{margin:4px 16px 10px;font-size:12px;line-height:1.5;color:var(--muted)}
.card table{width:100%;border-collapse:collapse;font-size:12.7px}
.card thead th{font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);
  text-align:left;padding:7px 16px 5px;font-weight:700;border-top:1px solid var(--border-soft);border-bottom:1px solid var(--border-soft)}
.card td{padding:5px 16px;vertical-align:top}
.card tbody tr.crow td{border-top:1px solid transparent}
.card tbody tr.crow.alt td,.card tbody tr.nrow.alt td{background:color-mix(in srgb,var(--surface2) 45%,transparent)}
.card td.cn{font-family:var(--mono);white-space:nowrap;font-weight:600}
.card td.ct{font-family:var(--mono);color:var(--muted);white-space:nowrap}
.card td.cflags{text-align:right;font-size:10.5px;white-space:normal}
.card tbody tr.nrow td{padding:0 16px 7px;border-top:0;color:var(--muted);font-size:11.8px;line-height:1.45}
.card .idx{padding:10px 16px;border-top:1px dashed var(--border);color:var(--muted);
  font-family:var(--mono);font-size:11.5px;white-space:pre-wrap;line-height:1.6}
.card .idx b{display:block;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:4px}

/* ---------- facets ---------- */
.fgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(440px,1fr));gap:20px}
.fcard{background:var(--surface);border:1px solid var(--border-soft);border-radius:var(--r-lg);
  padding:16px 18px;box-shadow:var(--shadow-sm);scroll-margin-top:120px;transition:box-shadow .2s}
.fcard:hover{box-shadow:var(--shadow-md)}
.fcard h4{margin:0 0 12px;font-size:15.5px;font-weight:680;display:flex;align-items:center;gap:10px;letter-spacing:-.01em}
.fk-kind{font:700 9.5px/1 var(--mono);text-transform:uppercase;letter-spacing:.08em;padding:6px 9px;border-radius:var(--r-sm)}
.fk-kind.k-queue,.fk-kind.k-scheduler{background:#e2f2e8;color:#1c6b40}
.fk-kind.k-cache,.fk-kind.k-ttl{background:#f7ecdb;color:#8f5a12}
.fk-kind.k-vector,.fk-kind.k-graph{background:#eae6f8;color:#54409e}
.fk-kind.k-journal,.fk-kind.k-pubsub{background:#e0f0f6;color:#0c6473}
.fk-kind.k-documents,.fk-kind.k-filesystem{background:#edf1e5;color:#4f6629}
.fk-kind.k-analytics{background:#f2e9f2;color:#7a3d8f}
.fk-kind.k-external,.fk-kind.k-custom,.fk-kind.k-documents{background:var(--surface2);color:var(--muted)}
[data-theme="dark"] .fk-kind.k-queue,[data-theme="dark"] .fk-kind.k-scheduler{background:#152b1e;color:#7ee2a8}
[data-theme="dark"] .fk-kind.k-cache,[data-theme="dark"] .fk-kind.k-ttl{background:#2d2213;color:#f0b463}
[data-theme="dark"] .fk-kind.k-vector,[data-theme="dark"] .fk-kind.k-graph{background:#221b3a;color:#b9a5f5}
[data-theme="dark"] .fk-kind.k-journal,[data-theme="dark"] .fk-kind.k-pubsub{background:#0f272e;color:#67d2ec}
[data-theme="dark"] .fk-kind.k-documents,[data-theme="dark"] .fk-kind.k-filesystem{background:#1e2618;color:#b5d494}
[data-theme="dark"] .fk-kind.k-analytics{background:#2a1e30;color:#d8b4e2}
.frow{display:grid;grid-template-columns:80px 1fr;gap:12px;margin:7px 0;align-items:start}
.frow .fl{font:700 9.5px/1.9 var(--mono);letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}
.frow p{margin:0;font-size:13.2px}
.frow ul{margin:2px 0;padding-left:18px;font-size:13.2px}
.frow .chip{margin:0 4px 4px 0}

/* ---------- prose & code ---------- */
.prose{max-width:88ch}
.prose h4{font-size:14.5px;margin:22px 0 6px}
.prose p{margin:9px 0}
.prose ul{margin:9px 0;padding-left:22px}
.prose li{margin:4px 0}
details.ddl{margin:0 0 16px}
details.ddl summary{cursor:pointer;font-size:12.5px;color:var(--accent);padding:7px 2px;font-weight:600}
details.ddl summary:hover{color:var(--accent-deep)}
.codewrap{position:relative}
.codewrap pre{background:#0d1420;color:#c6d5ea;border-radius:var(--r-lg);padding:16px;overflow:auto;
  font:12.3px/1.65 var(--mono);max-height:480px;box-shadow:var(--shadow-md)}
.copybtn{position:absolute;top:8px;right:8px;background:#1d2a3e;color:#9db3d2;border:1px solid #2d415c;
  border-radius:var(--r-sm);padding:3px 10px;font:600 10.5px var(--mono);cursor:pointer;opacity:0;transition:opacity .15s}
.codewrap:hover .copybtn,.copybtn:focus-visible{opacity:1}
.copybtn:hover{color:#fff;border-color:var(--accent)}
footer{border-top:1px solid var(--border-soft);color:var(--muted);font-size:12px;padding:18px 30px;
  display:flex;gap:14px;justify-content:center}
footer .mono{font-family:var(--mono)}

/* ---------- authored entrance motion ---------- */
@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
section{animation:rise .5s cubic-bezier(.16,1,.3,1) backwards}
section:nth-of-type(2){animation-delay:.06s}section:nth-of-type(3){animation-delay:.12s}
section:nth-of-type(n+4){animation-delay:.16s}
@media(prefers-reduced-motion:reduce){section{animation:none}}
@media(max-width:860px){
  .shell{margin-left:0}.sb{transform:translateX(-100%)}
  .cards,.fgrid{grid-template-columns:1fr}main{padding:24px 16px 90px}
}
`;

const PAGE_JS = `
// ---- sidebar: collapse + scroll-spy ----
const sb=document.getElementById("sb"),exp=document.getElementById("expand");
function setSb(closed){document.body.classList.toggle("sb-closed",closed);sb.classList.toggle("collapsed",closed);
  exp.hidden=!closed;document.getElementById("collapse").title=closed?"Expand sidebar":"Collapse sidebar";}
setSb(localStorage.getItem("dbd-sb")==="closed");
document.getElementById("collapse").addEventListener("click",()=>{
  const closed=!document.body.classList.contains("sb-closed");setSb(closed);localStorage.setItem("dbd-sb",closed?"closed":"open");});
const spy=new IntersectionObserver(es=>{
  for(const e of es){if(e.isIntersecting){
    document.querySelectorAll(".sb-nav a").forEach(a=>a.classList.toggle("active",a.getAttribute("href")==="#"+e.target.id));}}
},{rootMargin:"-25% 0px -65% 0px"});
document.querySelectorAll("section[id]").forEach(s=>spy.observe(s));

// ---- pan/zoom on inline SVG diagrams ----
function wire(cv){
  const svg=cv.querySelector("svg"),g=svg&&svg.querySelector(".pan");if(!g||cv.dataset.wired)return;cv.dataset.wired="1";
  const fitK=parseFloat(cv.dataset.fit||"1");
  let s=fitK,tx=0,ty=0,drag=null;const minS=fitK*.3;
  const apply=()=>g.setAttribute("transform","translate("+tx+" "+ty+") scale("+s+")");
  const zoomAt=(ns,px,py)=>{ns=Math.min(7,Math.max(minS,ns));tx=px-(px-tx)*(ns/s);ty=py-(py-ty)*(ns/s);s=ns;apply();};
  cv.addEventListener("wheel",e=>{if(!(e.ctrlKey||e.metaKey))return;e.preventDefault();
    const r=cv.getBoundingClientRect();zoomAt(s*(e.deltaY<0?1.15:.87),e.clientX-r.left,e.clientY-r.top);},{passive:false});
  cv.addEventListener("dblclick",e=>{const r=cv.getBoundingClientRect();zoomAt(s*1.5,e.clientX-r.left,e.clientY-r.top);});
  cv.addEventListener("mousedown",e=>{if(e.target.closest("a"))return;drag={x:e.clientX-tx,y:e.clientY-ty};cv.classList.add("panning");});
  window.addEventListener("mousemove",e=>{if(drag){tx=e.clientX-drag.x;ty=e.clientY-drag.y;apply();}});
  window.addEventListener("mouseup",()=>{drag=null;cv.classList.remove("panning");});
  const fig=cv.closest(".figure");
  fig.querySelector("[data-z='+']").addEventListener("click",()=>{const r=cv.getBoundingClientRect();zoomAt(s*1.25,r.width/2,r.height/2);});
  fig.querySelector("[data-z='-']").addEventListener("click",()=>{const r=cv.getBoundingClientRect();zoomAt(s/1.25,r.width/2,r.height/2);});
  fig.querySelector("[data-z='0']").addEventListener("click",()=>{s=fitK;tx=0;ty=0;apply();});
  apply();
}
document.querySelectorAll(".canvas").forEach(cv=>{
  const svg=cv.querySelector("svg");if(!svg)return;
  const w=+svg.getAttribute("width");
  svg.style.width=Math.min(w||0,100000)+"px"; svg.style.maxWidth="100%"; svg.style.height="auto";
  cv.dataset.fit=1;
  wire(cv);
});

// ---- copy buttons on code blocks ----
document.querySelectorAll("details pre").forEach(pre=>{
  const wrap=document.createElement("div");wrap.className="codewrap";
  pre.parentNode.insertBefore(wrap,pre);wrap.appendChild(pre);
  const b=document.createElement("button");b.className="copybtn";b.textContent="copy";
  b.addEventListener("click",()=>{navigator.clipboard.writeText(pre.textContent);b.textContent="copied";
    setTimeout(()=>b.textContent="copy",1200);});
  wrap.appendChild(b);
});

// ---- theme ----
const rootEl=document.documentElement;
function setTheme(t){rootEl.dataset.theme=t;localStorage.setItem("dbd-theme",t);
  document.querySelectorAll(".seg-b").forEach(b=>b.classList.toggle("on",b.dataset.th===t));}
setTheme(localStorage.getItem("dbd-theme")||(matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light"));
document.querySelectorAll(".seg-b").forEach(b=>b.addEventListener("click",()=>setTheme(b.dataset.th)));
`;
