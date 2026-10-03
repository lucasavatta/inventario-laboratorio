// Funzioni locali (senza sincronizzazione): rilievo, lotti, NFC, export/import ZIP, bozza, recupero,
// schermo stretto, dettatura, archivi, scatole, temi
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startServer, launch, device, tap, checker, IMG, dlgText, dlgOk, dlgChoice, overflow, goSet, FAKE_DIR, dirRead } = require('./helpers');

// finto riconoscimento vocale: "detta" una frase dopo l'avvio
const FAKE_SR = () => {
  window.SpeechRecognition = window.webkitSpeechRecognition = class {
    start(){ window.__srStarts=(window.__srStarts||0)+1; setTimeout(()=>{ this.onstart&&this.onstart();
      setTimeout(()=>{ const r=[{transcript:'motore brushless 2207', confidence:1}]; r.isFinal=true; this.onresult&&this.onresult({results:[r]}); setTimeout(()=>this.onend&&this.onend(),50); },100); },50); }
    stop(){ setTimeout(()=>this.onend&&this.onend(),10); } abort(){}
  };
};
// riconoscimento che non parte mai (come capitava su iOS)
const DEAD_SR = () => { window.SpeechRecognition = window.webkitSpeechRecognition = class { start(){} stop(){} abort(){} }; };
const NO_SR = () => { delete window.webkitSpeechRecognition; delete window.SpeechRecognition; };
// finto foglio "Condividi" del telefono: registra che cosa viene passato (in __shareAbort l'utente annulla)
const FAKE_SHARE = () => {
  window.__shared=[];
  Object.defineProperty(navigator,'canShare',{configurable:true, value:d=>!!(d&&d.files&&d.files.length)});
  Object.defineProperty(navigator,'share',{configurable:true, value:d=>{
    if(window.__shareAbort) return Promise.reject(Object.assign(new Error('annullato'),{name:'AbortError'}));
    window.__shared.push({files:(d.files||[]).map(f=>({type:f.type,size:f.size})), text:d.text}); return Promise.resolve(); }});
};

module.exports = async function(){
  const srv = await startServer(); const b = await launch(); const C = checker();
  const zipPath = path.join(os.tmpdir(), 'inventario-test.zip');
  try{
    console.log('app · 0. rilascio: service worker presente, stessa versione, app apribile senza rete');
    const swTxt=fs.readFileSync(path.join(__dirname,'..','sw.js'),'utf8'), htmlTxt=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
    const vSw=(swTxt.match(/VERSION = 'inv-v([\d.]+)'/)||[])[1], vHtml=(htmlTxt.match(/class="sub">v([\d.]+) ·/)||[])[1];
    C.check(!!vSw && vSw===vHtml, 'sw.js e index.html hanno la stessa versione (v'+vHtml+' / v'+vSw+')');
    const octx = await b.newContext({viewport:{width:393,height:852}}); const off = await octx.newPage();
    await off.goto(srv.url); await off.evaluate(()=>navigator.serviceWorker.ready); await off.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:8000}).catch(()=>{});
    await off.waitForTimeout(500); await octx.setOffline(true);
    const offOk = await off.reload().then(()=>off.evaluate(()=>!!document.getElementById('saveBtn') && typeof JSZip!=='undefined')).catch(()=>false);
    C.check(offOk, 'senza rete l\'app si riapre lo stesso (service worker)');
    await octx.close();

    console.log('app · 1. rilievo, foto lotto, segna/ritaglia, componi');
    const p = await device(b, srv.url, 'iPhone', {acceptDownloads:true, permissions:['clipboard-read','clipboard-write'], init:NO_SR});
    C.check(await p.locator('#v-cap .recover').count()===1, 'app vuota e scollegata: scheda "Collega e recupera"');
    await p.click('#v-cap .recoverGo'); await p.waitForTimeout(300);
    C.check(await p.evaluate(()=>document.getElementById('v-set').classList.contains('active') && document.activeElement.id==='syncToken'), '"Collega e recupera" porta al campo chiave');
    await p.click('nav button[data-v=v-cap]');
    await p.setInputFiles('#photoInput',IMG); await p.waitForTimeout(200);
    await p.fill('#desc','Batteria LiPo 4S'); await p.fill('#tagInput','lipo'); await p.press('#tagInput','Enter');
    await p.click('#catPick button:has-text("Ferramenta")');
    await tap(p,'#saveBtn'); await p.waitForTimeout(300);
    C.check(await p.locator('.recover').count()===0, 'dopo il primo salvataggio la scheda "Archivio vuoto" sparisce');
    C.check(await p.evaluate(()=>index[0].cat==='Ferramenta' && index[0].arch==='lab'), 'categoria scelta col pulsante');
    await p.click('#segLot'); await p.setInputFiles('#lotInput',IMG); await p.waitForTimeout(200);
    await p.fill('#lotTitle','Cassetto ESC'); await p.selectOption('#lotBoxSel','__new'); await p.fill('#lotNewBox','b02'); await tap(p,'#saveLotBtn'); await p.waitForTimeout(300);
    await p.click('nav button[data-v=v-comp]'); await p.click('.lotcard'); await p.waitForTimeout(300);
    await p.click('#modeMark'); const bb=await p.locator('#lotPhotoWrap').boundingBox();
    await p.mouse.click(bb.x+bb.width*0.2, bb.y+bb.height*0.45); await p.fill('#mDesc','ESC 30A'); await p.click('#mSave'); await p.waitForTimeout(200);
    await p.click('#modeCrop');
    await p.mouse.move(bb.x+bb.width*0.5, bb.y+bb.height*0.3); await p.mouse.down(); await p.mouse.move(bb.x+bb.width*0.7, bb.y+bb.height*0.6,{steps:5}); await p.mouse.up();
    await p.waitForTimeout(300); await p.fill('#mDesc','Motore 2207'); await p.click('#mSave'); await p.waitForTimeout(200);
    await p.click('#lotBack'); await p.waitForTimeout(200);
    for (const c of await p.locator('#compGrid .cell').all()) await c.click();
    await tap(p,'#assignBtn'); await dlgText(p,'b01');
    C.check(await p.evaluate(()=>index.length===3 && lots.length===1 && allBoxes().join()==='B01,B02'), '3 voci, 1 lotto, scatole B01 e B02');

    console.log('app · 2. NFC: link copiato senza https:// e apertura da #b=');
    await p.evaluate(()=>nfcWriteBox('B02')); await p.click('#nfcCopy'); await p.waitForTimeout(200);
    const clip = await p.evaluate(()=>navigator.clipboard.readText());
    C.check(!/^https?:/.test(clip) && clip.endsWith('#b=B02'), 'appunti: '+clip);
    await p.click('#nfcClose');
    await p.goto(srv.url+'#b=B02'); await p.waitForTimeout(600);
    C.check(await p.evaluate(()=>document.getElementById('v-search').classList.contains('active') && filters.box==='B02' && !document.getElementById('boxHead').hidden), '#b=B02 apre la scatola con la sua intestazione');

    console.log('app · 3. scatole: nome e posto, ricerca');
    await p.click('#bhEdit'); await p.fill('#boxEdName','Elettronica volo'); await p.fill('#boxEdPlace','Scaffale garage, ripiano 2'); await p.click('#boxEdSave'); await p.waitForTimeout(300);
    await p.click('nav button[data-v=v-boxes]'); await p.waitForTimeout(300);
    C.check(await p.locator('.bcard[data-b=B02]:has-text("Elettronica volo")').count()===1 && await p.locator('.bcard[data-b=B02]:has-text("ripiano 2")').count()===1, 'la scatola mostra nome e posto');
    await p.click('nav button[data-v=v-search]'); await p.click('nav button[data-v=v-search]');
    await p.fill('#q','garage esc');
    C.check(await p.locator('#results .it').count()===1, 'ricerca a più parole anche sul posto della scatola');
    await p.fill('#q','batteria lipo'); C.check(await p.locator('#results .it').count()===1, 'ricerca senza badare alle maiuscole');
    await p.fill('#q','');
    await p.locator('#results .it .acts [data-act=m]').first().click(); await dlgChoice(p,'B02');
    C.check(await p.evaluate(()=>index.filter(i=>i.box==='B02').length)===2, 'Sposta: scelta della scatola con un tocco');

    console.log('app · 4. export ZIP e import su un altro dispositivo');
    await goSet(p); await tap(p,'#expZip'); await p.waitForSelector('#zipBg.show');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#zipDl')]);
    await dl.saveAs(zipPath);
    const mac = await device(b, srv.url, 'Mac');
    await goSet(mac); await mac.setInputFiles('#impInput', zipPath); await mac.waitForTimeout(600); await dlgOk(mac); await mac.waitForTimeout(600);
    await mac.click('nav button[data-v=v-search]'); await mac.waitForTimeout(800);
    C.check(await mac.evaluate(()=>index.length)===3 && await mac.locator('#results .thumb.ok').count()===3, 'import: 3 voci con foto');
    C.check(await mac.evaluate(()=>boxInfo('B02')?.place)==='Scaffale garage, ripiano 2', 'import: nome e posto delle scatole');

    console.log('app · 5. dettatura');
    await p.click('nav button[data-v=v-cap]'); await p.click('#segSingle');
    await p.click('#micBtn'); await p.waitForTimeout(150);
    C.check(await p.evaluate(()=>document.activeElement.id)==='desc' && await p.locator('#descHint.show').count()===1, 'senza dettatura della pagina: cursore nel campo e avviso visibile (non sotto la tastiera)');
    const s1 = await device(b, srv.url, 'iPhone', {init:FAKE_SR, userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'});   // Safari su iPhone: la pagina può dettare
    await s1.fill('#desc','Ricambio'); await s1.click('#micBtn'); await s1.waitForTimeout(600);
    C.check(await s1.inputValue('#desc')==='Ricambio motore brushless 2207', 'iPhone Safari: il 🎤 scrive nel campo quello che detti');
    await s1.click('#micBtn'); await s1.waitForTimeout(600);
    C.check(await s1.evaluate(()=>window.__srStarts)===2 && /2207 motore brushless 2207$/.test(await s1.inputValue('#desc')), 'seconda dettatura di fila (prima su iOS si bloccava)');
    const s2 = await device(b, srv.url, 'iPhone', {init:DEAD_SR, userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'});
    await s2.click('#micBtn'); await s2.waitForTimeout(4400);
    C.check(await s2.evaluate(()=>!document.querySelector('.btn-mic.rec') && document.activeElement.id==='desc') && await s2.locator('#descHint.show').count()===1, 'se la dettatura non parte entro 4 s si passa alla tastiera');
    // Chrome su iPhone: il riconoscimento della pagina esiste ma si blocca → subito tastiera, senza aspettare
    const s3 = await device(b, srv.url, 'iPhone', {init:DEAD_SR});
    await s3.click('#micBtn'); await s3.waitForTimeout(300);
    C.check(await s3.evaluate(()=>!document.querySelector('.btn-mic.rec') && document.activeElement.id==='desc' && !window.__srStarts) && await s3.locator('#descHint.show').count()===1, 'Chrome su iPhone: subito dettatura da tastiera, senza attese');

    console.log('app · 6. bozza salvata se l\'app si chiude a metà');
    await p.fill('#desc','Resistenze 1/4W: 10k x20, 4k7 x15'); await p.fill('#qty','35'); await p.waitForTimeout(700);
    await p.reload(); await p.waitForTimeout(900);
    C.check(await p.inputValue('#desc')==='Resistenze 1/4W: 10k x20, 4k7 x15' && await p.inputValue('#qty')==='35', 'bozza recuperata dopo la riapertura');
    await p.fill('#desc',''); await p.waitForTimeout(500);

    console.log('app · 7. archivi separati (cambio stagione)');
    await goSet(p); await tap(p,'#archAdd'); await dlgChoice(p,'Armadio');
    await p.click('#archEdSave'); await p.waitForTimeout(300);
    C.check(await p.evaluate(()=>AID()!=='lab' && arch().name==='Armadio') && (await p.textContent('#archName'))==='Armadio', 'nuovo archivio Armadio, attivo');
    await p.click('nav button[data-v=v-cap]');
    C.check(await p.locator('#catPick button:has-text("Inverno")').count()===1, 'categorie dell\'armadio nel modulo');
    await p.fill('#desc','Maglioni di lana'); await p.click('#catPick button:has-text("Inverno")'); await tap(p,'#saveBtn'); await p.waitForTimeout(300);
    await p.click('nav button[data-v=v-search]');
    C.check(await p.locator('#results .it').count()===1, 'in Armadio si vede solo il suo contenuto');
    await p.locator('#results .it .acts [data-act=m]').first().click(); await dlgText(p,'A1');
    const armUrl = await p.evaluate(()=>boxUrl('A1'));
    C.check(/#b=A1&a=armadio-/.test(armUrl), 'il link NFC di una scatola dell\'armadio porta l\'archivio');
    await p.click('#archBtn'); await dlgChoice(p,'Laboratorio');
    C.check(await p.locator('#results .it').count()===3 && !(await p.evaluate(()=>allBoxes().includes('A1'))), 'tornando al Laboratorio, le scatole dell\'armadio non si mescolano');
    await p.goto(armUrl); await p.waitForTimeout(600);
    C.check(await p.evaluate(()=>arch().name==='Armadio' && filters.box==='A1'), 'il tag di A1 apre l\'armadio anche se ero nel laboratorio');

    console.log('app · 8. temi');
    await goSet(p); await p.click('#themePick [data-t=notte]'); await p.waitForTimeout(100);
    C.check(await p.evaluate(()=>document.documentElement.dataset.theme==='notte' && getComputedStyle(document.body).backgroundColor==='rgb(25, 28, 33)'), 'tema Notte applicato');
    await p.reload(); await p.waitForTimeout(500);
    C.check(await p.evaluate(()=>document.documentElement.dataset.theme)==='notte', 'il tema resta dopo la riapertura');

    console.log('app · 8b. Scatta in una schermata, Scatole in elenco, Opzioni a scomparsa, tag a un tocco');
    await p.setViewportSize({width:393, height:640});
    await p.evaluate(()=>setArch('lab'));
    await p.click('nav button[data-v=v-cap]'); await p.click('#segSingle'); await p.waitForTimeout(200);
    const fit = await p.evaluate(()=>({sh:document.documentElement.scrollHeight, ih:innerHeight, save:document.getElementById('saveBtn').getBoundingClientRect().bottom, nav:document.querySelector('nav').getBoundingClientRect().top}));
    C.check(fit.sh<=fit.ih && fit.save<=fit.nav, 'Scatta: nessuno scorrimento a 393×640 e Salva sopra la barra ('+JSON.stringify(fit)+')');
    await p.setInputFiles('#photoInput',IMG); await p.waitForTimeout(300);
    C.check(await p.evaluate(()=>!!document.querySelector('#photoZone .ai-btn') && document.documentElement.scrollHeight<=innerHeight && document.getElementById('saveBtn').getBoundingClientRect().bottom<=document.querySelector('nav').getBoundingClientRect().top), 'idem con la foto e il pulsante ✨ Cos\'è?');
    await p.click('#photoZone .photo-x'); await p.waitForTimeout(100);
    await p.click('#tagInput'); await p.waitForTimeout(150);
    C.check(await p.locator('#tagSugg:not([hidden]) button').count()>0, 'tag già usati proposti mentre scrivi i tag');
    await p.locator('#tagSugg button').first().dispatchEvent('pointerdown'); await p.waitForTimeout(100);
    C.check(await p.evaluate(()=>curTags.length===1), 'un tocco aggiunge il tag');
    await p.evaluate(()=>{ curTags=[]; renderTags(); saveDraft(); document.activeElement.blur(); });
    await p.click('nav button[data-v=v-boxes]'); await p.waitForTimeout(200);
    C.check(await p.evaluate(()=>{ const l=document.getElementById('boxList'), r=l.querySelector('.bcard[data-b]'); return !!r && l.getBoundingClientRect().height>=innerHeight*0.55 && r.getBoundingClientRect().height<80; }), 'Scatole: elenco a righe dentro un riquadro alto');
    await p.click('#boxList .bcard[data-b]'); await p.waitForTimeout(250);
    C.check(await p.evaluate(()=>document.getElementById('v-search').classList.contains('active')), 'toccando una scatola si apre il contenuto');
    await p.click('nav button[data-v=v-set]'); await p.waitForTimeout(150);
    C.check(await p.evaluate(()=>[...document.querySelectorAll('#v-set details')].every(d=>!d.open) && document.documentElement.scrollHeight<=innerHeight+2), 'Opzioni: sezioni chiuse, niente muro di testo');
    await p.click('#syncCard summary'); await p.waitForTimeout(100);
    C.check(await p.locator('#syncToken').isVisible(), 'la sezione si apre con un tocco');
    await p.setViewportSize({width:393, height:852});

    console.log('app · 8c. scorrimento con rotella/trackpad (Mac)');
    const big = await device(b, srv.url, 'Mac');
    await big.evaluate(async()=>{ for(let k=0;k<40;k++) index.push({id:uid()+k,box:'B01',cat:'Vario',desc:'Pezzo '+k,tags:[],qty:1,state:'Nuovo',hasPhoto:false,nfc:false,lotId:null,light:false,marker:null,ts:Date.now()}); await saveIndex(); refreshAll(); openBox('B01'); });
    await big.waitForTimeout(300); await big.mouse.move(700,450); await big.mouse.wheel(0,600); await big.waitForTimeout(400);
    C.check(await big.evaluate(()=>scrollY>300), 'scatola aperta: la rotella fa scorrere la pagina');
    C.check(await big.evaluate(()=>{ const c=getComputedStyle(document.body); return c.overflowY==='visible' && c.overscrollBehaviorY==='auto'; }), 'body non è un contenitore a scorrimento (era la causa del blocco)');

    console.log('app · 8d. Chiedi a Claude: foto e domanda condivise, risposta incollata');
    const ai = await device(b, srv.url, 'iPhone', {permissions:['clipboard-read','clipboard-write'], init:FAKE_SHARE});
    let choosers=0; ai.on('filechooser', ()=>choosers++);
    const aiBtn = sel => ai.evaluate(s=>{ const e=document.querySelector(s); return e?e.textContent:null; }, sel);
    await ai.setViewportSize({width:393, height:640});
    C.check(await aiBtn('#photoZone .ai-btn')===null, 'senza foto il pulsante non c\'è');
    const h0 = await ai.evaluate(()=>document.getElementById('capSingle').getBoundingClientRect().height);
    await ai.setInputFiles('#photoInput',IMG); await ai.waitForTimeout(500);
    C.check(/Cos/.test(await aiBtn('#photoZone .ai-btn')), 'con la foto compare ✨ Cos\'è? sopra la foto');
    C.check(await ai.evaluate(()=>document.getElementById('capSingle').getBoundingClientRect().height)===h0, 'il pulsante sta sopra la foto: il modulo non si allunga');
    await ai.fill('#desc','preso dal quad');
    await ai.evaluate(()=>{ window.__shareAbort=true; }); await ai.click('#photoZone .ai-btn'); await ai.waitForTimeout(200);
    C.check(await ai.evaluate(()=>aiWait===null && __shared.length===0), 'condivisione annullata: non cambia niente');
    await ai.evaluate(()=>{ window.__shareAbort=false; }); await ai.click('#photoZone .ai-btn'); await ai.waitForTimeout(300);
    const sh = await ai.evaluate(()=>__shared[0]);
    C.check(!!sh && sh.files.length===1 && sh.files[0].type==='image/jpeg' && sh.files[0].size>500, 'a Claude arriva la foto');
    C.check(!!sh && /Nome:/.test(sh.text) && /Categoria: una tra: Droni \/ Elettronica; Falegnameria/.test(sh.text) && /Quello che so già: preso dal quad/.test(sh.text), 'e la domanda già scritta, con le categorie dell\'archivio e quello che hai già scritto');
    C.check(await ai.evaluate(()=>navigator.clipboard.readText())===(sh&&sh.text), 'la domanda è anche negli appunti (se la chat non la riceve si incolla)');
    C.check(/Incolla/.test(await aiBtn('#photoZone .ai-btn')) && choosers===0, 'il pulsante diventa 📋 Incolla e non riapre la fotocamera');
    await ai.click('#photoZone .ai-btn'); await ai.waitForSelector('#dlgBg.show');
    C.check(/Manca la risposta/.test(await ai.textContent('#dlgTitle')), 'se negli appunti c\'è ancora la domanda, lo dice');
    await dlgOk(ai);
    await ai.reload(); await ai.waitForTimeout(700);
    C.check(/Incolla/.test(await aiBtn('#photoZone .ai-btn')), 'se la pagina si ricarica mentre sei su Claude, resta in attesa della risposta');
    await ai.evaluate(()=>navigator.clipboard.writeText('**Nome:** Connettore JST-XH 4 poli\n**Descrizione:** Cavetto con connettore JST-XH, passo 2,5 mm, 4 contatti.\n**Tag:** JST, xh, cavetto, 4 poli\n**Categoria:** Elettronica\n**Dubbio:** misura il passo, 2,0 oppure 2,5 mm'));
    await ai.click('#photoZone .ai-btn'); await ai.waitForTimeout(400);
    const got = await ai.evaluate(()=>({desc:document.getElementById('desc').value, tags:curTags.join('|'), cat:document.getElementById('catPick').dataset.v, hint:document.getElementById('descHint').textContent, shown:document.getElementById('descHint').classList.contains('show')}));
    C.check(got.desc==='Connettore JST-XH 4 poli — Cavetto con connettore JST-XH, passo 2,5 mm, 4 contatti · preso dal quad', 'la risposta riempie la descrizione e tiene quello che avevi scritto ('+got.desc+')');
    C.check(got.tags==='jst|xh|cavetto|4 poli' && got.cat==='Droni / Elettronica', 'tag e categoria compilati ('+got.tags+' · '+got.cat+')');
    C.check(got.shown && /misura il passo/.test(got.hint), 'il dubbio di Claude resta scritto sotto il campo');
    C.check(/Cos/.test(await aiBtn('#photoZone .ai-btn')), 'dopo l\'incolla il pulsante torna ✨ Cos\'è?');
    // risposta incollata direttamente nel campo, tutta su una riga: stesso risultato e niente accumulo
    await ai.evaluate(()=>{ const dt=new DataTransfer(); dt.setData('text/plain','Nome: Motore 2207 Descrizione: brushless 2400KV Tag: motore, brushless Categoria: droni');
      document.getElementById('desc').dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true})); });
    await ai.waitForTimeout(200);
    C.check(await ai.evaluate(()=>document.getElementById('desc').value==='Motore 2207 — brushless 2400KV · preso dal quad' && curTags.includes('brushless')), 'risposta incollata nel campo: compila da sola, senza accumulare la precedente');
    await ai.evaluate(()=>navigator.clipboard.writeText('un testo qualsiasi')); await ai.evaluate(()=>aiSetWait('cap')); await ai.click('#photoZone .ai-btn'); await ai.waitForSelector('#dlgBg.show');
    C.check(/Non riconosco/.test(await ai.textContent('#dlgTitle')), 'testo che non è una risposta: chiede prima di usarlo');
    await ai.click('#dlgCancel'); await ai.waitForTimeout(200);
    C.check(await ai.evaluate(()=>document.getElementById('desc').value.startsWith('Motore 2207')), 'e se annulli non tocca la descrizione');
    await ai.setViewportSize({width:320, height:640}); await ai.waitForTimeout(150);
    C.check((await overflow(ai)).length===0 && await ai.evaluate(()=>{ const e=document.querySelector('#photoZone .ai-btn'); return e.scrollWidth<=e.clientWidth; }), 'a 320 px il pulsante sta nel riquadro della foto');
    await ai.setViewportSize({width:393, height:852});
    await tap(ai,'#saveBtn'); await ai.waitForTimeout(300);
    C.check(await ai.evaluate(()=>index.length===1 && index[0].tags.includes('motore') && aiWait===null) && await aiBtn('#photoZone .ai-btn')===null, 'salvato: si riparte puliti');
    // pezzo ritagliato da una Foto Lotto
    await ai.click('#segLot'); await ai.setInputFiles('#lotInput',IMG); await ai.waitForTimeout(200);
    await ai.fill('#lotTitle','Cavetti'); await ai.selectOption('#lotBoxSel','__new'); await ai.fill('#lotNewBox','c01'); await tap(ai,'#saveLotBtn'); await ai.waitForTimeout(300);
    await ai.click('nav button[data-v=v-comp]'); await ai.click('.lotcard'); await ai.waitForTimeout(300);
    await ai.click('#modeCrop'); const cb=await ai.locator('#lotPhotoWrap').boundingBox();
    await ai.mouse.move(cb.x+cb.width*0.3, cb.y+cb.height*0.3); await ai.mouse.down(); await ai.mouse.move(cb.x+cb.width*0.7, cb.y+cb.height*0.7,{steps:5}); await ai.mouse.up(); await ai.waitForTimeout(300);
    await ai.click('#modalPrev .ai-btn'); await ai.waitForTimeout(300);
    C.check(await ai.evaluate(()=>{ const l=__shared[__shared.length-1]; return !!l && l.files[0].size>100 && /Nome:/.test(l.text) && aiWait==='modal'; }), 'ritaglio del lotto: si chiede a Claude anche da lì');
    await ai.evaluate(()=>navigator.clipboard.writeText('Nome: Cavetto JST-PH 2 poli\nDescrizione: 10 cm, passo 2 mm\nTag: jst, ph\nCategoria: Droni / Elettronica'));
    await ai.click('#modalPrev .ai-btn'); await ai.waitForTimeout(300);
    C.check(await ai.evaluate(()=>document.getElementById('mDesc').value==='Cavetto JST-PH 2 poli — 10 cm, passo 2 mm' && document.getElementById('mTags').value==='jst, ph' && document.getElementById('mCatPick').dataset.v==='Droni / Elettronica'), 'e la risposta compila il pezzo ritagliato');
    await ai.click('#mSave'); await ai.waitForTimeout(200);
    C.check(await ai.evaluate(()=>index.some(i=>i.desc.startsWith('Cavetto JST-PH') && i.tags.join()==='jst,ph')), 'pezzo ritagliato salvato con i dati di Claude');
    // Mac: niente "Condividi" → foto negli appunti e Claude aperto con la domanda
    const aim = await device(b, srv.url, 'Mac', {permissions:['clipboard-read','clipboard-write']});
    await aim.context().route('https://claude.ai/**', r=>r.fulfill({status:200, contentType:'text/html', body:'<title>finto Claude</title>'}));
    await aim.setInputFiles('#photoInput',IMG); await aim.waitForTimeout(500);
    await aim.click('#photoZone .ai-btn'); await aim.waitForSelector('#dlgBg.show');
    const [pop] = await Promise.all([aim.context().waitForEvent('page'), aim.click('#dlgOk')]);
    const pu = new URL(pop.url()); await pop.close(); await aim.bringToFront(); await aim.waitForTimeout(300);
    C.check(pu.origin==='https://claude.ai' && pu.pathname==='/new' && /Nome:/.test(pu.searchParams.get('q')||''), 'Mac: si apre claude.ai con la domanda già scritta');
    C.check(await aim.evaluate(async()=>{ try{ const it=await navigator.clipboard.read(); return it.some(i=>i.types.includes('image/png')); }catch(e){ return 'err '+e.message; } })===true, 'Mac: la foto è negli appunti, pronta da incollare');
    C.check(/Incolla/.test(await aim.evaluate(()=>document.querySelector('#photoZone .ai-btn').textContent)), 'Mac: poi si aspetta la risposta');
    C.check(ai.errs.length===0 && aim.errs.length===0 && ai.native===0 && aim.native===0, 'nessun errore JavaScript '+JSON.stringify([...ai.errs,...aim.errs]));

    console.log('app · 8e. copia in una cartella del computer (Chrome sul Mac)');
    C.check(await p.evaluate(()=>document.getElementById('dirBox').hidden), 'su iPhone la cartella sul computer non viene proposta');
    const dm = await device(b, srv.url, 'Mac', {init:FAKE_DIR});
    await dm.setInputFiles('#photoInput',IMG); await dm.waitForTimeout(300);
    await dm.fill('#desc','Scheda ESP32-S3 N16R8'); await dm.fill('#tagInput','esp32'); await dm.press('#tagInput','Enter'); await tap(dm,'#saveBtn'); await dm.waitForTimeout(300);
    await dm.evaluate(async()=>{ index[0].box='B07'; await saveIndex(); refreshAll(); });
    await goSet(dm);
    C.check(await dm.locator('#dirPick').isVisible() && !(await dm.locator('#dirNow').isVisible()), 'in Backup e file c\'è «Scegli la cartella»');
    await dm.evaluate(()=>{ window.__dirCancel=true; }); await tap(dm,'#dirPick'); await dm.waitForTimeout(200);
    C.check(await dm.evaluate(()=>dirH===null), 'scelta annullata: non cambia niente');
    await dm.evaluate(()=>{ window.__dirCancel=false; }); await tap(dm,'#dirPick'); await dm.waitForFunction(()=>dirSt.state==='ok',null,{timeout:8000});
    const md = await dirRead(dm,'Inventario/inventario.md');
    C.check(!!md && md.includes('Scheda ESP32-S3 N16R8') && md.includes('B07'), 'nella cartella c\'è Inventario/inventario.md con pezzo e scatola');
    C.check(!!(await dirRead(dm,'Inventario/inventario.json')) && !!(await dirRead(dm,'Inventario/inventario.csv')) && !!(await dirRead(dm,'Inventario/LEGGIMI.md')), 'e anche json, csv e LEGGIMI.md');
    const pid = await dm.evaluate(()=>index[0].id);
    C.check((await dirRead(dm,'Inventario/foto/pezzi/'+pid+'.jpg',true))>500, 'la foto del pezzo è in Inventario/foto/pezzi/');
    C.check(/Scrivania \/ Inventario/.test(await dm.textContent('#dirInfo')) && /1 voci, 1 foto/.test(await dm.textContent('#dirInfo')) && /cartella attiva/.test(await dm.textContent('#ssBkp')), 'la sezione dice dove sta la copia e quando è stata aggiornata');
    await dm.click('nav button[data-v=v-cap]'); await dm.fill('#desc','Viti M3x10'); await tap(dm,'#saveBtn');
    await dm.waitForFunction(()=>dirSt.state==='ok' && dirSt.items===2,null,{timeout:8000});
    C.check((await dirRead(dm,'Inventario/inventario.md')).includes('Viti M3x10'), 'ogni salvataggio aggiorna la cartella da solo');
    await dm.reload(); await dm.waitForTimeout(800);
    C.check(await dm.evaluate(()=>!!dirH && dirSt.state==='ok'), 'alla riapertura la copia resta attiva');
    await goSet(dm); await tap(dm,'#dirOff'); await dm.waitForTimeout(200);
    C.check(await dm.evaluate(()=>dirH===null) && await dm.locator('#dirPick').isVisible() && !!(await dirRead(dm,'Inventario/inventario.md')), '«Stacca» ferma la copia ma lascia i file');
    C.check(dm.errs.length===0 && dm.native===0, 'nessun errore JavaScript '+JSON.stringify(dm.errs));

    console.log('app · 9. tutto dentro lo schermo (320 px, iPhone SE)');
    await p.setViewportSize({width:320, height:640});
    const bad=[];
    for (const v of ['v-cap','v-comp','v-search','v-boxes','v-set']){ if(v==='v-set') await goSet(p); else await p.click('nav button[data-v='+v+']'); await p.waitForTimeout(250); const o=await overflow(p); if(o.length) bad.push(v+': '+o.join(', ')); }
    await p.click('nav button[data-v=v-cap]'); await p.click('#segLot'); { const o=await overflow(p); if(o.length) bad.push('lotto: '+o.join(', ')); } await p.click('#segSingle');
    await p.click('#archBtn'); await dlgChoice(p,'Laboratorio');
    await p.click('nav button[data-v=v-comp]'); await p.click('.lotcard'); await p.waitForTimeout(300); { const o=await overflow(p); if(o.length) bad.push('editor lotto: '+o.join(', ')); }
    await p.click('#lotBack');
    await p.click('nav button[data-v=v-search]'); await p.locator('#results .it').first().click(); await p.waitForTimeout(300); { const o=await overflow(p); if(o.length) bad.push('scheda pezzo: '+o.join(', ')); }
    await p.click('#detClose');
    for (const sel of ['input','select','textarea']) for (const fs of await p.$$eval(sel, es=>es.filter(e=>e.type!=='file').map(e=>parseFloat(getComputedStyle(e).fontSize)))) if(fs<16) bad.push(sel+' a '+fs+'px (iOS ingrandisce la pagina)');
    C.check(!bad.length, 'nessuno scorrimento laterale e niente zoom automatico '+JSON.stringify(bad));

    C.check(p.native===0 && mac.native===0, 'nessun alert/confirm/prompt del browser');
    C.check(p.errs.length===0 && mac.errs.length===0 && s1.errs.length===0 && s2.errs.length===0, 'nessun errore JavaScript '+JSON.stringify([...p.errs,...mac.errs,...s1.errs,...s2.errs]));
  } finally { await b.close(); srv.close(); try{ fs.unlinkSync(zipPath); }catch(e){} }
  return C.failed;
};
if (require.main === module) module.exports().then(f=>process.exit(f?1:0));
