// Funzioni locali (senza sincronizzazione): rilievo, lotti, NFC, export/import ZIP, bozza, recupero
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startServer, launch, device, tap, checker, IMG } = require('./helpers');

module.exports = async function(){
  const srv = await startServer(); const b = await launch(); const C = checker();
  const zipPath = path.join(os.tmpdir(), 'inventario-test.zip');
  try{
    console.log('app · 1. rilievo, foto lotto, segna/ritaglia, componi');
    const p = await device(b, srv.url, 'iPhone', {acceptDownloads:true, permissions:['clipboard-read','clipboard-write']});
    C.check(await p.locator('#v-cap #recoverHint').count()===1, 'app vuota e scollegata: scheda "Collega e recupera"');
    await p.click('#v-cap .recoverGo'); await p.waitForTimeout(300);
    C.check(await p.evaluate(()=>document.getElementById('v-boxes').classList.contains('active') && document.activeElement.id==='syncToken'), '"Collega e recupera" porta al campo chiave');
    await p.click('nav button[data-v=v-cap]');
    await p.setInputFiles('#photoInput',IMG); await p.waitForTimeout(200);
    await p.fill('#desc','Batteria LiPo 4S'); await p.fill('#tagInput','lipo'); await p.press('#tagInput','Enter');
    await tap(p,'#saveBtn'); await p.waitForTimeout(300);
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
    await p.selectOption('#targetBox','__new'); await p.click('#assignBtn'); await p.waitForTimeout(300);
    C.check(await p.evaluate(()=>index.length===3 && lots.length===1 && allBoxes().join()==='B01,B02'), '3 voci, 1 lotto, scatole B01 e B02');

    console.log('app · 2. NFC: link copiato senza https:// e apertura da #b=');
    await p.evaluate(()=>nfcWriteBox('B02')); await p.click('#nfcCopy'); await p.waitForTimeout(200);
    const clip = await p.evaluate(()=>navigator.clipboard.readText());
    C.check(!/^https?:/.test(clip) && clip.endsWith('#b=B02'), 'appunti: '+clip);
    await p.click('#nfcClose');
    await p.goto(srv.url+'#b=B02'); await p.waitForTimeout(600);
    C.check(await p.evaluate(()=>document.getElementById('v-search').classList.contains('active') && filters.box==='B02'), '#b=B02 apre la scatola');

    console.log('app · 3. export ZIP e import su un altro dispositivo');
    await p.click('nav button[data-v=v-boxes]'); await tap(p,'#expZip'); await p.waitForSelector('#nfcBg.show');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#nfcDirect')]);
    await dl.saveAs(zipPath);
    const mac = await device(b, srv.url, 'Mac');
    await mac.click('nav button[data-v=v-boxes]'); await mac.setInputFiles('#impInput', zipPath); await mac.waitForTimeout(1200);
    await mac.click('nav button[data-v=v-search]'); await mac.waitForTimeout(800);
    C.check(await mac.evaluate(()=>index.length)===3 && await mac.locator('#results img').count()===3, 'import: 3 voci con foto');

    console.log('app · 4. bozza salvata se l\'app si chiude a metà');
    await p.click('nav button[data-v=v-cap]'); await p.click('#segSingle');
    await p.click('#micBtn'); await p.waitForTimeout(150);
    C.check(await p.evaluate(()=>document.activeElement.id)==='desc', 'iPhone: il 🎤 porta alla dettatura della tastiera');
    await p.fill('#desc','Resistenze 1/4W: 10k x20, 4k7 x15'); await p.fill('#qty','35'); await p.waitForTimeout(700);
    await p.reload(); await p.waitForTimeout(900);
    C.check(await p.inputValue('#desc')==='Resistenze 1/4W: 10k x20, 4k7 x15' && await p.inputValue('#qty')==='35', 'bozza recuperata dopo la riapertura');
    C.check(p.errs.length===0 && mac.errs.length===0, 'nessun errore JavaScript '+JSON.stringify([...p.errs,...mac.errs]));
  } finally { await b.close(); srv.close(); try{ fs.unlinkSync(zipPath); }catch(e){} }
  return C.failed;
};
if (require.main === module) module.exports().then(f=>process.exit(f?1:0));
