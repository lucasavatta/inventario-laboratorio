# Inventario Officina

Web app per l'inventario del laboratorio: rilievo con foto e dettatura, **Foto Lotto** (una foto per scatola, pezzi segnati o ritagliati), composizione delle scatole, ricerca, **tag NFC** sulle scatole, export per PC e AI.

**App:** https://lucasavatta.github.io/inventario-laboratorio/

- Il codice sta qui su GitHub; **i dati restano sul dispositivo** (IndexedDB del browser). Nessun server, nessun account.
- Funziona anche offline, dopo la prima apertura.

## iPhone — prima configurazione (una volta sola)

1. Apri il link dell'app in **Safari**.
2. Tasto **Condividi** → **Aggiungi a schermata Home** → **disattiva "Apri come web app"** → Aggiungi.
   L'icona apre l'app dentro Safari: così l'icona e i tag NFC vedono **lo stesso archivio**.
   (Con "Apri come web app" attivo l'app è a tutto schermo ma ha un archivio separato da Safari, e i tag NFC aprirebbero l'archivio sbagliato.)
3. Installa l'app gratuita **NFC Tools** (App Store) per scrivere i tag.

## Flusso di lavoro

1. **Rilievo** (telefono) — Scatta: pezzo singolo o Foto Lotto.
2. **Componi** — marchi o ritagli i pezzi nei lotti, metti i pezzi sciolti nelle scatole.
3. **Tag NFC delle scatole** — Scatole → **NFC** sulla scatola → **Copia link** → in NFC Tools: Scrivi → Aggiungi record → **URL/URI** → incolla → Scrivi → avvicina il tag.
   Da quel momento: avvicini l'iPhone sbloccato al tag → tocchi la notifica → si apre l'elenco di quella scatola.
4. **Backup / passaggio al PC** — Scatole → **Esporta archivio ZIP** → Condividi → *Salva su File* (iCloud Drive o Google Drive) oppure AirDrop al Mac.
   Il badge in alto ti ricorda se ci sono modifiche non salvate.
5. **Sul Mac** — apri lo stesso link nel browser → Scatole → **Importa archivio…** → scegli lo ZIP. Navighi il magazzino a schermo largo.
   L'import **sostituisce** l'archivio di quel browser: il telefono è l'archivio principale.

## Contenuto dello ZIP (per l'AI)

| File | Uso |
|---|---|
| `inventario.md` | elenco per scatola, il più comodo da dare a Claude |
| `inventario.json` | database completo (schema in `LEGGIMI.md`) |
| `inventario.csv` | Excel / Fogli |
| `foto/pezzi/*.jpg`, `foto/lotti/*.jpg` | foto, nominate con l'ID del pezzo/lotto |

Per interrogarlo: scompatta lo ZIP in una cartella fissa sul Mac (es. `Documenti/Inventario`) e chiedi a Claude, oppure carica `inventario.md` nel Progetto Claude "Inventario Laboratorio".

## Note importanti

- **Safari può cancellare i dati** dei siti non aperti per 7 giorni di utilizzo di Safari. L'app chiede la protezione dell'archivio al browser, ma il paracadute vero è l'**export ZIP regolare**.
- Su iPhone le pagine web non possono scrivere i tag NFC direttamente: per questo si usa NFC Tools. Su Android (Chrome) l'app scrive il tag da sola.
- I link dei tag contengono l'indirizzo dell'app: se rinomini il repository, i tag già scritti vanno riscritti.

## Struttura

```
index.html            app (HTML/CSS/JS in un file)
sw.js                 service worker (funzionamento offline)
manifest.webmanifest  icona e nome
jszip.min.js          creazione/lettura ZIP (MIT, vedi jszip-LICENSE.md)
icon-*.png            icone
```

Aggiornare l'app: modificare i file e fare push; GitHub Pages pubblica in 1–2 minuti. Alzare `VERSION` in `sw.js` a ogni rilascio.
