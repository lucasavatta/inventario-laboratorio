# CLAUDE.md — Inventario Officina

Istruzioni per Claude Code. Leggile prima di toccare il codice.

## Cos'è

Web app personale per inventariare il laboratorio (elettronica, droni, ferramenta, falegnameria): sapere cosa si ha, in quale scatola e in che quantità, per non comprare doppioni e trovare ispirazione per nuovi progetti. L'inventario deve poter essere interrogato da un'AI ("ho ancora una batteria 4S? dove?").
Dalla v5 ci sono più **archivi** separati (Laboratorio, Armadio per il cambio di stagione, Cantina…), ognuno con scatole, categorie e stati propri.

- **App online:** https://lucasavatta.github.io/inventario-laboratorio/ (GitHub Pages dal branch `main`, cartella radice)
- **Dati:** repository **privato** `lucasavatta/inventario-dati`, aggiornato dall'app. **Mai** dati o chiavi in questo repo, che è pubblico.
- **Utente:** usa iPhone (Chrome e Safari) per il rilievo in officina e un Mac (Chrome) per consultare. Parla italiano e spesso detta a voce. Tutta l'interfaccia, i messaggi e i commit sono **in italiano**.

## Modo di lavorare

- Iterazioni piccole e verificabili. Una modifica → test → commit → push → controllo online.
- Niente dati inventati e niente metriche "creative". Se qualcosa non è verificabile, dillo.
- Prima di ogni push: `cd tests && npm test` deve essere tutto verde.
- A ogni rilascio **alza la versione in due punti**: `VERSION` in `sw.js` e il testo `vX.Y.Z ·` in `<div class="sub">` di `index.html` (scheda Opzioni → Informazioni). Dopo il push (1–2 minuti) verifica con:
  `curl -s https://lucasavatta.github.io/inventario-laboratorio/ | grep -o 'v[0-9.]* ·'`
- Le correzioni devono reggere sull'iPhone reale: quando una cosa dipende da iOS, dillo esplicitamente all'utente e fagli provare il caso concreto.

## Struttura

```
index.html            tutta l'app: HTML + CSS + JS in un unico file, niente build
sw.js                 service worker: funzionamento offline (pagina network-first con cache:'no-cache')
manifest.webmanifest  nome e icone
jszip.min.js          ZIP per export/import (MIT, jszip-LICENSE.md)
icon-*.png            icone
tests/                test end-to-end Playwright con finto GitHub (vedi sotto)
README.md             istruzioni per l'utente
```

Niente framework e niente dipendenze a runtime oltre JSZip (niente font esterni: font di sistema). Mantieni l'app in un solo file finché è gestibile.

## Interfaccia (v5)

- Schede: **Scatta · Componi · Cerca · Scatole · Opzioni**. In alto a sinistra il pulsante dell'archivio in uso, a destra lo stato della sincronizzazione.
- Tutto deve stare nella larghezza del telefono (test a 320 px): `minmax(0,1fr)`, `min-width:0` sui figli flex, testi lunghi con ellissi.
- Campi di testo e menu a **16px**: sotto quella misura iOS ingrandisce la pagina quando li tocchi.
- Temi pastello con variabili CSS (`--bg --card --ink --accent …`) ridefinite da `[data-theme=…]` su `<html>`: salvia (predefinito), lavanda, pesca, cielo, notte. Il tema è salvato in `ui` e copiato in `localStorage` per applicarlo prima del disegno.
- Ogni scatola ha una tinta presa dal codice (`hue()`): codici consecutivi hanno colori diversi.
- **Niente `alert/confirm/prompt`**: si usano `dialog()`, `confirmDlg()`, `pickBox()` (scelta scatola a un tocco o codice nuovo). I test controllano che non compaiano dialoghi nativi.
- Il toast compare **in alto**, così non finisce sotto la tastiera.

## Modello dati (IndexedDB locale)

Database `inventario-officina`, object store `kv` (chiave → valore), con wrapper `store.get/set/delete/keys/clear`.

| Chiave | Contenuto |
|---|---|
| `inventory-index` | JSON `{items, lots, archs, boxMeta, deleted}` |
| `photo-<id>` | data URL JPEG (pezzo: max 700 px, q 0.62 · lotto: max 1100 px, q 0.68 · ritaglio: q 0.72) |
| `meta` | `{lastChange, lastExport, changeSeq, pushedSeq, remoteHead, dirtyPhotos[], lastSync}` |
| `sync-cfg` | `{repo, token, branch}`: chiave GitHub del dispositivo |
| `draft` | bozza del modulo in corso (testo, tag, quantità, foto), ripristinata alla riapertura |
| `ui` | preferenze del dispositivo, non sincronizzate: `{arch, theme, mic}` |

- **item:** `id, arch, box (null = da sistemare), cat, desc, tags[], qty, state, hasPhoto, nfc, lotId, light, marker{x,y}, ts, upd` (`arch` assente = `lab`)
  - `light=true` → pezzo **segnato** sulla foto del lotto (niente foto propria, segue la scatola del lotto)
  - ritaglio → pezzo autonomo con foto propria, `box=null` finché non viene composto
- **lot:** `id, arch, title, box, ts, upd`
- **arch:** `id, name, icon, cats[], states[], ts, upd`. `lab` (Laboratorio) esiste anche senza record (`getArchs()`); il record si crea solo quando lo si modifica.
- **boxMeta:** `id ('arch/CODICE'), arch, code, name, place, ts, upd`: nome e posto della scatola, facoltativi. Una scatola esiste se ha contenuto o un record qui.
- Le scatole sono **per archivio**: `allBoxes(aid)`, `boxInfo(code, aid)`.
- **deleted:** `{id: ms}`: tombstone per propagare le cancellazioni
- Le collezioni sincronizzate sono elencate in `COLLS` (prefisso snapshot → nome): per aggiungerne una basta inserirla lì e in `stripRemote`/`setData`.
- `upd` viene assegnato **solo** da `saveIndex()`, che confronta lo stato con lo snapshot (`takeSnap`/`canon`): ogni modifica ai dati deve passare da `saveIndex()`. Le foto da `putPhoto()`, che le segna in `dirtyPhotos`.

## Sincronizzazione (funzione `sync()`)

Repo dati privato, Git Data API di GitHub, chiave fine-grained con *Contents: read/write* solo su quel repo.

1. `GET git/ref/heads/main`. Se il commit è uguale a `meta.remoteHead` e non ci sono modifiche locali, si ferma.
2. Legge `inventario.json` remoto e lo unisce con `mergeSets()`: **per record vince `upd` più recente** (a pari merito vince il locale), le tombstone eliminano i record più vecchi. Applica il risultato con `applyMerged()`, che aggiorna anche lo snapshot.
3. Se il risultato è diverso dal remoto (confronto `dataStr`/`stableStr`, a chiavi ordinate, altrimenti i commit rimbalzano all'infinito) o ci sono foto nuove, crea **un solo commit** con: blob delle foto (max 30 per giro), `inventario.json`, `inventario.md`, `inventario.csv`, `LEGGIMI.md`.
4. `PATCH ref` con `force:false`. Se riceve 422 (un altro dispositivo ha appena scritto) ricomincia dal punto 1, fino a 4 tentativi.

Quando parte: dopo ogni salvataggio (2,5 s), all'apertura, al ritorno sulla pagina, ogni 60 s se visibile, al ritorno della rete. Le foto mancanti si scaricano solo quando servono (`getPhoto`).

Layout del repo dati: `inventario.json`, `inventario.md` (per scatola, pensato per l'AI), `inventario.csv` (separatore `;`), `LEGGIMI.md`, `foto/pezzi/<id>.jpg`, `foto/lotti/<id>.jpg`.

## Vincoli di piattaforma (già scoperti a caro prezzo)

- **iOS non ha Web NFC.** Il tag contiene un **link** `…/inventario-laboratorio/#b=CODICE` (scatola, con `&a=ARCHIVIO` se non è il laboratorio) o `#p=ID` (pezzo), letto da `handleHash()`, che passa da solo all'archivio giusto. I tag vecchi senza `&a=` restano validi. Si scrive con l'app NFC Tools (wakdev, gratuita), record URL. NFC Tools aggiunge già `https://`: per questo "Copia link" copia l'indirizzo **senza** schema. Su Android il tag si scrive direttamente con `NDEFReader`.
- **I tag letti da iPhone aprono sempre Safari**, anche se il browser predefinito è Chrome. Ogni browser e ogni icona Home ha **un archivio locale separato**, quindi ciascuno va collegato alla sincronizzazione. C'è il tasto "Copia la chiave" per farlo senza rigenerarla.
- **Dettatura (`startDictation`):** un'istanza **nuova** di SpeechRecognition a ogni pressione (riusarla su iOS la bloccava), testo scritto nel campo mentre si parla, su iOS chiusura dopo 2,5 s di silenzio. Se non parte entro 4 s, se dà errore o se il browser non la offre (Chrome iOS) → cursore nel campo + avviso visibile sotto il campo per usare il 🎤 della tastiera. In Opzioni si può forzare "Sempre tastiera". **Da verificare sull'iPhone reale** (Safari e Chrome).
- **Elementi sotto la barra di navigazione fissa:** `body` usa `min-height` (non `height:100%`), altrimenti il pulsante Salva finisce sotto la barra.
- **Cache di GitHub Pages (10 min):** il service worker scarica la pagina con `cache:'no-cache'`, così gli aggiornamenti arrivano subito.
- La chiave GitHub si vede **una sola volta** quando viene creata. Se si perde, se ne genera una nuova (link precompilato in `tokenUrl()`).

## Test

```bash
cd tests
npm install
npx playwright install chromium     # oppure CHROMIUM_PATH=/percorso/chromium
npm test
```

- `app.test.js`: rilievo, Foto Lotto, segna/ritaglia, composizione, NFC (link copiato, apertura `#b=`), scatole con nome e posto, ricerca, export/import ZIP, dettatura (finto riconoscimento vocale: funzionante, bloccato, assente), bozza, archivi, temi, **niente scorrimento laterale a 320 px e campi a 16px**, nessun dialogo nativo, scheda di recupero.
- `sync.test.js`: due dispositivi (iPhone e Mac simulati) contro un **finto GitHub** in `helpers.js`: invio, ricezione, foto scaricate quando servono, offline con coda, conflitti, archivi e nomi delle scatole, nessun commit inutile.
- Helper per i dialoghi dell'app: `dlgText`, `dlgOk`, `dlgChoice`; `overflow(p)` elenca gli elementi più larghi dello schermo.
- Ogni bug corretto va coperto da un controllo nei test. Usa `tap()` per i pulsanti che possono finire sotto la barra fissa.

## Limiti noti

- Le foto cancellate restano nel repo dati (file orfani, innocui). Le tombstone non vengono mai ripulite.
- Il conflitto si risolve per record intero (ultima modifica vince), non per singolo campo.
- Un dispositivo ancora alla v4 che sincronizza perde `archs`/`boxMeta` dal JSON remoto finché non si aggiorna (i record tornano al successivo sync di un dispositivo v5). Il service worker aggiorna in pochi minuti.
- Cambiare categoria o stato a un archivio non rinomina quelli già usati dai pezzi.

## Idee in coda (da concordare con l'utente prima di farle)

- Componenti con **varianti e quantità** (es. resistenze: valore → pezzi), ricercabili per valore.
- Stampa di **etichette QR** per le scatole (alternativa economica ai tag NFC).
- Copia dell'archivio in una **cartella sul Mac** (File System Access API, solo Chrome desktop).
- Esperimento: tag con `googlechromes://` per aprire Chrome invece di Safari (non verificato).
- Pulizia delle foto orfane nel repo dati.
- Licenza del codice da decidere (al momento nessuna = tutti i diritti riservati). L'utente ha valutato di distribuire o vendere l'app.
- Versione "cantiere" (magazzini di cantiere, geolocalizzazione, mezzi per targa, più sedi): **parcheggiata**, prima si finisce la versione di casa.
