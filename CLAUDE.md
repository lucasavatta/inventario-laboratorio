# CLAUDE.md — Inventario Officina

Istruzioni per Claude Code. Leggile prima di toccare il codice.

## Cos'è

Web app personale per inventariare il laboratorio (elettronica, droni, ferramenta, falegnameria): sapere cosa si ha, in quale scatola e in che quantità, per non comprare doppioni e trovare ispirazione per nuovi progetti. L'inventario deve poter essere interrogato da un'AI ("ho ancora una batteria 4S? dove?").

- **App online:** https://lucasavatta.github.io/inventario-laboratorio/ (GitHub Pages dal branch `main`, cartella radice)
- **Dati:** repository **privato** `lucasavatta/inventario-dati`, aggiornato dall'app. **Mai** dati o chiavi in questo repo, che è pubblico.
- **Utente:** usa iPhone (Chrome e Safari) per il rilievo in officina e un Mac (Chrome) per consultare. Parla italiano e spesso detta a voce. Tutta l'interfaccia, i messaggi e i commit sono **in italiano**.

## Modo di lavorare

- Iterazioni piccole e verificabili. Una modifica → test → commit → push → controllo online.
- Niente dati inventati e niente metriche "creative". Se qualcosa non è verificabile, dillo.
- Prima di ogni push: `cd tests && npm test` deve essere tutto verde.
- A ogni rilascio **alza la versione in due punti**: `VERSION` in `sw.js` e il testo `vX.Y.Z ·` in `<div class="sub">` di `index.html`. Dopo il push (1–2 minuti) verifica con:
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

Niente framework e niente dipendenze a runtime oltre JSZip. Mantieni l'app in un solo file finché è gestibile.

## Modello dati (IndexedDB locale)

Database `inventario-officina`, object store `kv` (chiave → valore), con wrapper `store.get/set/delete/keys/clear`.

| Chiave | Contenuto |
|---|---|
| `inventory-index` | JSON `{items, lots, deleted}` |
| `photo-<id>` | data URL JPEG (pezzo: max 700 px, q 0.62 · lotto: max 1100 px, q 0.68 · ritaglio: q 0.72) |
| `meta` | `{lastChange, lastExport, changeSeq, pushedSeq, remoteHead, dirtyPhotos[], lastSync}` |
| `sync-cfg` | `{repo, token, branch}`: chiave GitHub del dispositivo |
| `draft` | bozza del modulo in corso (testo, tag, quantità, foto), ripristinata alla riapertura |

- **item:** `id, box (null = da sistemare), cat, desc, tags[], qty, state, hasPhoto, nfc, lotId, light, marker{x,y}, ts, upd`
  - `light=true` → pezzo **segnato** sulla foto del lotto (niente foto propria, segue la scatola del lotto)
  - ritaglio → pezzo autonomo con foto propria, `box=null` finché non viene composto
- **lot:** `id, title, box, ts, upd`
- **deleted:** `{id: ms}`: tombstone per propagare le cancellazioni
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

- **iOS non ha Web NFC.** Il tag contiene un **link** `…/inventario-laboratorio/#b=CODICE` (scatola) o `#p=ID` (pezzo), letto da `handleHash()`. Si scrive con l'app NFC Tools (wakdev, gratuita), record URL. NFC Tools aggiunge già `https://`: per questo "Copia link" copia l'indirizzo **senza** schema. Su Android il tag si scrive direttamente con `NDEFReader`.
- **I tag letti da iPhone aprono sempre Safari**, anche se il browser predefinito è Chrome. Ogni browser e ogni icona Home ha **un archivio locale separato**, quindi ciascuno va collegato alla sincronizzazione. C'è il tasto "Copia la chiave" per farlo senza rigenerarla.
- **Riconoscimento vocale della pagina su iOS:** si bloccava. Su iOS il 🎤 porta il cursore nel campo e si usa la dettatura della tastiera (`IOS` in `bindMic`).
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

- `app.test.js`: rilievo, Foto Lotto, segna/ritaglia, composizione, NFC (link copiato, apertura `#b=`), export/import ZIP, bozza, scheda di recupero.
- `sync.test.js`: due dispositivi (iPhone e Mac simulati) contro un **finto GitHub** in `helpers.js`: invio, ricezione, foto scaricate quando servono, offline con coda, conflitti, nessun commit inutile.
- Ogni bug corretto va coperto da un controllo nei test. Usa `tap()` per i pulsanti che possono finire sotto la barra fissa.

## Limiti noti

- Le foto cancellate restano nel repo dati (file orfani, innocui). Le tombstone non vengono mai ripulite.
- Il conflitto si risolve per record intero (ultima modifica vince), non per singolo campo.
- `showDetail` usa ancora `alert()`, e alcune conferme usano `confirm()`/`prompt()`.

## Idee in coda (da concordare con l'utente prima di farle)

- Componenti con **varianti e quantità** (es. resistenze: valore → pezzi), ricercabili per valore.
- Stampa di **etichette QR** per le scatole (alternativa economica ai tag NFC).
- Copia dell'archivio in una **cartella sul Mac** (File System Access API, solo Chrome desktop).
- Esperimento: tag con `googlechromes://` per aprire Chrome invece di Safari (non verificato).
- Pulizia delle foto orfane nel repo dati.
- Licenza del codice da decidere (al momento nessuna = tutti i diritti riservati). L'utente ha valutato di distribuire o vendere l'app.
- Versione "cantiere" (magazzini di cantiere, geolocalizzazione, mezzi per targa, più sedi): **parcheggiata**, prima si finisce la versione di casa.
