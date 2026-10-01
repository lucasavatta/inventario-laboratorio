// Funzioni locali (senza sincronizzazione): rilievo, lotti, NFC, export/import ZIP, bozza, recupero,
// schermo stretto, dettatura, archivi, scatole, temi
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startServer, launch, device, tap, checker, IMG, dlgText, dlgOk, dlgChoice, overflow, goSet } = require('./helpers');

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

module.exports = async function(){
  const srv = await startServer(); const b = await launch(); const C = checker();
  const zipPath = path.join(os.tmpdir(), 'inventario-test.zip');
  try{
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
