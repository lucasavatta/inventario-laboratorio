// Utilità comuni ai test: server statico della app, avvio Chromium, finto GitHub (Git Data API)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const IMG = path.join(__dirname, 'fixtures', 'test.jpg');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.webmanifest':'application/manifest+json', '.png':'image/png', '.jpg':'image/jpeg', '.md':'text/markdown' };

function startServer(){
  return new Promise(res=>{
    const srv = http.createServer((req,rsp)=>{
      let p = decodeURIComponent(new URL(req.url,'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f)) { rsp.writeHead(404); return rsp.end('404'); }
      rsp.writeHead(200, {'content-type': MIME[path.extname(f)] || 'application/octet-stream'});
      fs.createReadStream(f).pipe(rsp);
    }).listen(0, ()=>res({ url:'http://localhost:'+srv.address().port+'/', close:()=>srv.close() }));
  });
}

// CHROMIUM_PATH opzionale (es. ambienti dove Playwright non scarica i browser)
const launch = () => chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

const UA = {
  iPhone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1',
  Mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
};

// Finto GitHub: repo "luca/dati", chiave "tok". Implementa solo ciò che usa l'app.
function mockGitHub(){
  const G = { blobs:{}, trees:{}, commits:{}, ref:null, calls:0, patches:0, offline:new Set() };
  const h = s => crypto.createHash('sha1').update(s).digest('hex');
  const putBlob = buf => { const sha=h(buf); G.blobs[sha]=buf; return sha; };
  const t = { 'README.md': putBlob(Buffer.from('# dati\n')) }; const ts=h(JSON.stringify(t)); G.trees[ts]=t;
  const cs=h('c0'); G.commits[cs]={tree:ts,parents:[],message:'Initial commit'}; G.ref=cs;
  const treeOf = sha => G.trees[G.commits[sha].tree];
  const json = (status,obj) => ({ status, headers:{'content-type':'application/json','access-control-allow-origin':'*'}, body: obj===null?'':JSON.stringify(obj) });
  G.handler = dev => async route => {
    const req=route.request(); const u=new URL(req.url()); G.calls++;
    if (G.offline.has(dev)) return route.abort('internetdisconnected');
    if (req.headers()['authorization']!=='Bearer tok') return route.fulfill(json(401,{message:'Bad credentials'}));
    const p=u.pathname.replace(/^\/repos\/luca\/dati/,''); const m=req.method(); const body=req.postData()?JSON.parse(req.postData()):null;
    if (p==='' && m==='GET') return route.fulfill(json(200,{private:true,permissions:{push:true},default_branch:'main'}));
    if (p==='/git/ref/heads/main') return route.fulfill(json(200,{object:{sha:G.ref}}));
    if (p.startsWith('/contents/')){
      const fp=decodeURIComponent(p.slice(10)); const ref=u.searchParams.get('ref'); const tr=treeOf(ref==='main'?G.ref:ref);
      if(!tr[fp]) return route.fulfill(json(404,{message:'Not Found'}));
      return route.fulfill({status:200, headers:{'access-control-allow-origin':'*','content-type':'application/octet-stream'}, body:G.blobs[tr[fp]]});
    }
    if (p.startsWith('/git/commits/') && m==='GET'){ const sha=p.split('/').pop(); return route.fulfill(json(200,{sha,tree:{sha:G.commits[sha].tree}})); }
    if (p==='/git/blobs' && m==='POST') return route.fulfill(json(201,{sha:putBlob(Buffer.from(body.content, body.encoding==='base64'?'base64':'utf8'))}));
    if (p==='/git/trees' && m==='POST'){
      const nt={...G.trees[body.base_tree]};
      for(const e of body.tree){ if(e.sha===null) delete nt[e.path]; else nt[e.path]=e.sha||putBlob(Buffer.from(e.content,'utf8')); }
      const sha=h(JSON.stringify(nt)); G.trees[sha]=nt; return route.fulfill(json(201,{sha}));
    }
    if (p==='/git/commits' && m==='POST'){ const sha=h(JSON.stringify(body)+Math.random()); G.commits[sha]={tree:body.tree,parents:body.parents,message:body.message}; return route.fulfill(json(201,{sha})); }
    if (p==='/git/refs/heads/main' && m==='PATCH'){
      if(!G.commits[body.sha].parents.includes(G.ref)) return route.fulfill(json(422,{message:'Update is not a fast forward'}));
      G.ref=body.sha; G.patches++; return route.fulfill(json(200,{object:{sha:body.sha}}));
    }
    return route.fulfill(json(404,{message:'mock: '+m+' '+p}));
  };
  G.remoteJson = () => JSON.parse(G.blobs[treeOf(G.ref)['inventario.json']].toString());
  G.remoteFiles = () => Object.keys(treeOf(G.ref)).sort();
  return G;
}

async function device(b, base, name, opts={}){
  const ctx = await b.newContext({ viewport: name==='Mac'?{width:1440,height:900}:{width:393,height:852}, serviceWorkers:'block', userAgent:UA[name], ...opts });
  if (opts.github) await ctx.route('https://api.github.com/**', opts.github.handler(name));
  const p = await ctx.newPage(); p.errs=[];
  p.on('pageerror', e=>p.errs.push(e.message));
  p.native=0;   // l'app non deve più usare alert/confirm/prompt nativi
  p.on('dialog', d=>{ p.native++; d.accept(d.type()==='prompt' ? (opts.promptValue||'B01') : undefined); });
  if (opts.init) await p.addInitScript(opts.init);
  await p.goto(base); await p.waitForTimeout(400);
  return p;
}
// click su elementi che possono finire sotto la barra di navigazione fissa
const tap = async (p,sel) => { await p.locator(sel).first().evaluate(e=>e.scrollIntoView({block:'center'})); await p.click(sel); };
const dlgText = async (p,text) => { await p.waitForSelector('#dlgBg.show'); await p.fill('#dlgInput',text); await p.click('#dlgOk'); await p.waitForTimeout(250); };
const dlgOk = async p => { await p.waitForSelector('#dlgBg.show'); await p.click('#dlgOk'); await p.waitForTimeout(250); };
const dlgChoice = async (p,label) => { await p.waitForSelector('#dlgBg.show'); await p.click('#dlgChoices button:has-text("'+label+'")'); await p.waitForTimeout(250); };
// nessun elemento più largo dello schermo (niente scorrimento laterale)
const overflow = p => p.evaluate(()=>{
  const W=innerWidth, out=[];
  if(document.documentElement.scrollWidth>W) out.push('pagina '+document.documentElement.scrollWidth+'>'+W);
  // le righe a scorrimento orizzontale (data-hscroll) possono avere figli oltre il bordo: è voluto
  for(const e of document.querySelectorAll('body *')){ if(e.parentElement && e.parentElement.closest('[data-hscroll]')) continue; const r=e.getBoundingClientRect(); if(r.width && r.height && r.right>W+1 && getComputedStyle(e).visibility!=='hidden') out.push((e.id||e.className||e.tagName)+' '+Math.round(r.right)); }
  return out.slice(0,5);
});
// scheda Opzioni con tutte le sezioni aperte (di norma sono chiuse e si aprono con un tocco)
const goSet = async p => { await p.click('nav button[data-v=v-set]'); await p.evaluate(()=>document.querySelectorAll('#v-set details').forEach(d=>d.open=true)); await p.waitForTimeout(100); };
const waitSync = async p => { await p.waitForTimeout(300); await p.waitForFunction(()=>!/Sincronizzo|in invio/.test(document.getElementById('bkpBadge').textContent),null,{timeout:20000}); };

// finta scelta della cartella (Chrome sul Mac): al posto della Scrivania una cartella privata del browser (OPFS)
const FAKE_DIR = () => { window.showDirectoryPicker = async () => { if(window.__dirCancel) throw Object.assign(new Error('annullato'),{name:'AbortError'});
  return (await navigator.storage.getDirectory()).getDirectoryHandle('Scrivania',{create:true}); }; };
// legge un file dalla finta Scrivania; null se non c'è. Con size:true restituisce i byte
const dirRead = (p, rel, size) => p.evaluate(async ([rel,size])=>{ try{ let d=await (await navigator.storage.getDirectory()).getDirectoryHandle('Scrivania');
  const parts=rel.split('/'), name=parts.pop(); for(const seg of parts) d=await d.getDirectoryHandle(seg);
  const f=await (await d.getFileHandle(name)).getFile(); return size ? f.size : await f.text(); }catch(e){ return null; } }, [rel,size]);

function checker(){
  let failed=0;
  const check=(c,msg)=>{ console.log((c?'  ✓ ':'  ✗ ')+msg); if(!c) failed++; };
  return { check, get failed(){ return failed; } };
}

module.exports = { startServer, launch, mockGitHub, device, tap, waitSync, checker, IMG, dlgText, dlgOk, dlgChoice, overflow, goSet, FAKE_DIR, dirRead };
