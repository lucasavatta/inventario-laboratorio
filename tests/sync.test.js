// Sincronizzazione iPhone ↔ Mac con finto GitHub: invio, ricezione, offline, conflitti, niente commit inutili
const { startServer, launch, mockGitHub, device, tap, waitSync, checker, IMG, goSet, dlgOk, dlgChoice, FAKE_DIR, dirRead } = require('./helpers');

module.exports = async function(){
  const srv = await startServer(); const b = await launch(); const G = mockGitHub(); const C = checker();
  const st = p => p.evaluate(()=>({items:index.map(i=>i.desc+'|'+(i.box||'-')+'|'+i.qty).sort(), lots:lots.length, badge:document.getElementById('bkpBadge').textContent}));
  const connect = async p => { await goSet(p); await p.fill('#syncRepo','luca/dati'); await p.fill('#syncToken','tok'); await tap(p,'#syncConnect'); };
  try{
    console.log('sync · 1. iPhone: rilievo, poi collega e invia');
    const ph = await device(b, srv.url, 'iPhone', {github:G});
    await ph.setInputFiles('#photoInput',IMG); await ph.waitForTimeout(200);
    await ph.fill('#desc','Batteria LiPo 4S 1500mAh'); await tap(ph,'#saveBtn'); await ph.waitForTimeout(200);
    await ph.fill('#desc','Viti M3x10'); await ph.fill('#qty','50'); await tap(ph,'#saveBtn'); await ph.waitForTimeout(200);
    await ph.click('#segLot'); await ph.setInputFiles('#lotInput',IMG); await ph.waitForTimeout(200);
    await ph.fill('#lotTitle','Cassetto ESC'); await ph.selectOption('#lotBoxSel','__new'); await ph.fill('#lotNewBox','B02'); await tap(ph,'#saveLotBtn'); await ph.waitForTimeout(200);
    await ph.click('nav button[data-v=v-comp]'); await ph.click('.lotcard'); await ph.waitForTimeout(200);
    await ph.click('#modeMark'); const bb=await ph.locator('#lotPhotoWrap').boundingBox();
    await ph.mouse.click(bb.x+bb.width*0.2, bb.y+bb.height*0.45); await ph.fill('#mDesc','ESC 30A'); await ph.click('#mSave'); await ph.waitForTimeout(200);
    await ph.click('#lotBack');
    await connect(ph); await waitSync(ph);
    const r=G.remoteJson();
    C.check(r.items.length===3 && r.lots.length===1, 'repo: 3 voci, 1 lotto');
    C.check(G.remoteFiles().filter(f=>f.startsWith('foto/')).length===2, 'repo: 2 foto (pezzo + lotto)');
    C.check(G.remoteFiles().includes('inventario.md') && G.remoteFiles().includes('LEGGIMI.md'), 'repo: inventario.md e LEGGIMI.md');
    C.check(/Sincronizzato/.test((await st(ph)).badge), 'badge iPhone sincronizzato');

    console.log('sync · 2. Mac vuoto collega e riceve');
    const mac = await device(b, srv.url, 'Mac', {github:G});
    await connect(mac); await waitSync(mac);
    C.check((await st(mac)).items.length===3, 'Mac riceve le 3 voci');
    await mac.click('nav button[data-v=v-search]'); await mac.waitForTimeout(1500);
    C.check(await mac.locator('#results .thumb.ok').count()===2, 'Mac scarica le foto quando servono');
    const before=G.patches; await mac.evaluate(()=>sync()); await waitSync(mac); await ph.evaluate(()=>sync()); await waitSync(ph);
    C.check(G.patches===before, 'nessun commit se non cambia nulla');

    console.log('sync · 3. modifiche incrociate con iPhone offline');
    await mac.evaluate(async()=>{ index.find(x=>x.desc.startsWith('Batteria')).qty=2; await saveIndex(); });
    G.offline.add('iPhone');
    await ph.evaluate(async()=>{ index=index.filter(x=>!x.desc.startsWith('Viti')); await saveIndex(); });
    await ph.evaluate(async()=>{ index.find(x=>x.desc==='ESC 30A').desc='ESC 30A BLHeli_S'; await saveIndex(); });
    await waitSync(mac); await ph.waitForTimeout(3500);
    C.check(/Offline/.test((await st(ph)).badge), 'iPhone mostra Offline con modifiche in coda');
    G.offline.delete('iPhone'); await ph.evaluate(()=>sync()); await waitSync(ph); await mac.evaluate(()=>sync()); await waitSync(mac);
    const a=await st(ph), m=await st(mac);
    C.check(JSON.stringify(a.items)===JSON.stringify(m.items), 'iPhone e Mac convergono');
    C.check(a.items.some(x=>x.startsWith('Batteria')&&x.endsWith('|2')) && !a.items.some(x=>x.startsWith('Viti')) && a.items.some(x=>x.startsWith('ESC 30A BLHeli_S')), 'tutte e tre le modifiche presenti');

    console.log('sync · 4. stesso pezzo modificato su due dispositivi');
    await mac.evaluate(async()=>{ index.find(x=>x.desc.startsWith('Batteria')).box='B09'; await saveIndex(); });
    await ph.waitForTimeout(50);
    await ph.evaluate(async()=>{ index.find(x=>x.desc.startsWith('Batteria')).box='B07'; await saveIndex(); });
    await waitSync(mac); await waitSync(ph); await mac.evaluate(()=>sync()); await waitSync(mac); await ph.evaluate(()=>sync()); await waitSync(ph);
    const a2=await st(ph), m2=await st(mac);
    C.check(JSON.stringify(a2.items)===JSON.stringify(m2.items) && a2.items.some(x=>x.includes('|B07|')), 'vince la modifica più recente (B07)');

    console.log('sync · 5. ricarica: dati e collegamento restano');
    await ph.reload(); await ph.waitForTimeout(800); await waitSync(ph);
    C.check((await st(ph)).items.length===2 && /Sincronizzato/.test((await st(ph)).badge), 'dopo ricarica tutto a posto');
    console.log('sync · 6. archivi e scatole con nome passano da un dispositivo all\'altro');
    await ph.evaluate(async()=>{ archs.push({id:'armadio-x', ...TPL.armadio, ts:Date.now()}); boxMeta.push({id:'lab/B02',arch:'lab',code:'B02',name:'Elettronica',place:'Garage',ts:Date.now()});
      index.unshift({id:'mx1',arch:'armadio-x',box:'A1',cat:'Inverno',desc:'Maglioni',tags:[],qty:3,state:'Da tenere',hasPhoto:false,nfc:false,lotId:null,light:false,marker:null,ts:Date.now()}); await saveIndex(); });
    await waitSync(ph); await mac.evaluate(()=>sync()); await waitSync(mac);
    C.check(await mac.evaluate(()=>getArchs().some(a=>a.name==='Armadio') && boxInfo('B02')?.place==='Garage' && allBoxes('armadio-x').join()==='A1'), 'il Mac riceve l\'archivio Armadio e il posto della scatola');
    C.check(await mac.evaluate(()=>items().every(i=>(i.arch||'lab')==='lab')), 'sul Mac il laboratorio non mostra i vestiti');
    C.check(/Archivio: Armadio[\s\S]*Scatola A1/.test(G.blobs[(()=>{ const c=G.commits[G.ref]; return G.trees[c.tree]['inventario.md']; })()].toString()), 'inventario.md diviso per archivio');
    const p2=G.patches; await mac.evaluate(()=>sync()); await waitSync(mac); await ph.evaluate(()=>sync()); await waitSync(ph);
    C.check(G.patches===p2, 'nessun commit inutile anche con archivi e scatole');
    console.log('sync · 7. link d\'invito: chi lo apre si collega da solo');
    await goSet(ph); await tap(ph,'#invOpen'); await ph.fill('#invRepo','luca/dati'); await ph.fill('#invToken','tok'); await ph.click('#invMake');
    await dlgOk(ph);                                   // avviso: è il tuo stesso deposito
    await ph.waitForSelector('#invDone:not([hidden])');
    const link = await ph.evaluate(()=>invUrl);
    C.check(/#join=[\w-]+$/.test(link) && !link.includes('tok'), 'link creato dopo la verifica della chiave');
    await ph.click('#invClose');
    const nRemote = G.remoteJson().items.length;
    const guest = await device(b, srv.url, 'iPhone', {github:G});
    await guest.goto(link); await guest.waitForTimeout(2500);
    C.check(await guest.evaluate(n=>!!cfg && cfg.repo==='luca/dati' && index.length===n, nRemote), 'dispositivo nuovo: collegato e con tutti i dati, senza inserire chiavi');
    C.check(await guest.evaluate(()=>location.hash==='' ), 'la chiave sparisce dalla barra dell\'indirizzo');
    await guest.reload(); await guest.waitForTimeout(800);
    C.check(await guest.evaluate(n=>!!cfg && index.length===n, nRemote), 'resta collegato dopo la riapertura');
    // dispositivo già collegato a un ALTRO inventario: non si mescolano, i dati locali vengono tolti
    const other = await device(b, srv.url, 'iPhone', {github:G});
    await other.evaluate(async()=>{ index.unshift({id:'solo-mio',box:null,cat:'Vario',desc:'Cosa di un altro inventario',tags:[],qty:1,state:'Nuovo',hasPhoto:false,nfc:false,lotId:null,light:false,marker:null,ts:Date.now()});
      await saveIndex(); cfg={repo:'luca/altro',token:'tok',branch:'main'}; await store.set('sync-cfg',cfg); meta.pushedSeq=meta.changeSeq; await saveMeta(); });
    await other.goto(link); await dlgOk(other); await other.waitForTimeout(2500);
    C.check(await other.evaluate(n=>cfg.repo==='luca/dati' && index.length===n && !index.some(i=>i.id==='solo-mio'), nRemote), 'passando a un altro inventario i due non si mescolano');
    C.check(!G.remoteJson().items.some(i=>i.id==='solo-mio'), 'e nel deposito non finisce niente dell\'altro');
    // deposito nuovo e vuoto: benvenuto e scelta di cosa inventariare
    const G2 = mockGitHub();
    const fresh = await device(b, srv.url, 'iPhone', {github:G2});
    await fresh.goto(link); await fresh.waitForTimeout(1800);
    C.check(await fresh.locator('#dlgBg.show').count()===1 && /Collegato/.test(await fresh.textContent('#dlgTitle')), 'deposito vuoto: messaggio di benvenuto');
    await dlgOk(fresh); await dlgChoice(fresh,'Armadio'); await fresh.click('#archEdSave'); await fresh.waitForTimeout(400);
    C.check(await fresh.evaluate(()=>arch().name==='Armadio'), 'e si parte subito dall\'archivio scelto (Armadio)');
    await guest.goto(srv.url+'#join=robaccia'); await guest.waitForTimeout(500);
    C.check(await guest.evaluate(n=>cfg.repo==='luca/dati' && index.length===n, nRemote), 'un link non valido non cambia niente');
    C.check(guest.errs.length===0 && other.errs.length===0 && fresh.errs.length===0, 'nessun errore JavaScript negli inviti '+JSON.stringify([...guest.errs,...other.errs,...fresh.errs]));
    console.log('sync · 8. Mac con la cartella sul computer: riceve dal telefono e la tiene aggiornata');
    const mac2 = await device(b, srv.url, 'Mac', {github:G, init:FAKE_DIR});
    await connect(mac2); await waitSync(mac2);
    await tap(mac2,'#dirPick'); await mac2.waitForFunction(()=>dirSt.state==='ok',null,{timeout:15000});
    const nPh = await mac2.evaluate(()=>index.filter(i=>i.hasPhoto).length+lots.length);
    C.check(await mac2.evaluate(n=>dirSt.photos===n && dirSt.miss===0, nPh) && nPh>=2, 'le foto fatte col telefono vengono scaricate e copiate nella cartella ('+nPh+')');
    const lotId = await mac2.evaluate(()=>lots[0].id);
    C.check((await dirRead(mac2,'Inventario/foto/lotti/'+lotId+'.jpg',true))>500 && (await dirRead(mac2,'Inventario/inventario.md')).includes('Batteria LiPo 4S'), 'cartella completa: elenco e foto del lotto');
    await ph.evaluate(async()=>{ index.unshift({id:'nuovo-tel',box:'B02',cat:'Vario',desc:'Cavetto JST dal telefono',tags:['jst'],qty:4,state:'Nuovo',hasPhoto:false,nfc:false,lotId:null,light:false,marker:null,ts:Date.now()}); await saveIndex(); });
    await waitSync(ph); await mac2.evaluate(()=>sync()); await waitSync(mac2);
    await mac2.waitForFunction(()=>dirSt.state==='ok' && dirSt.items===index.length && index.some(i=>i.id==='nuovo-tel'),null,{timeout:8000}); await mac2.waitForTimeout(600);
    C.check((await dirRead(mac2,'Inventario/inventario.md')).includes('Cavetto JST dal telefono'), 'un pezzo aggiunto dal telefono arriva nella cartella del Mac senza fare niente');
    C.check(mac2.errs.length===0, 'nessun errore JavaScript con la cartella '+JSON.stringify(mac2.errs));
    C.check(ph.errs.length===0 && mac.errs.length===0, 'nessun errore JavaScript '+JSON.stringify([...ph.errs,...mac.errs]));
  } finally { await b.close(); srv.close(); }
  return C.failed;
};
if (require.main === module) module.exports().then(f=>process.exit(f?1:0));
