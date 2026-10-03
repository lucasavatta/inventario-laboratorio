# Inventario Officina

Web app per l'inventario del laboratorio (e non solo: armadio per il cambio di stagione, cantina…): rilievo con foto e dettatura, **Foto Lotto** (una foto per scatola, pezzi segnati o ritagliati), composizione delle scatole, ricerca, **tag NFC** sulle scatole, export per PC e AI.

**App:** https://lucasavatta.github.io/inventario-laboratorio/

- Qui c'è solo il **codice** (pubblico). **I dati non sono qui.**
- Ogni dispositivo tiene la sua copia locale (funziona offline) e, se colleghi la sincronizzazione, la allinea da solo con un **repository privato** (es. `inventario-dati`).

## iPhone — prima configurazione (una volta sola)

1. Apri il link dell'app in **Safari**.
2. Tasto **Condividi** → **Aggiungi a schermata Home** → **disattiva "Apri come web app"** → Aggiungi.
   L'icona apre l'app dentro Safari: così l'icona e i tag NFC vedono **lo stesso archivio**.
   (Con "Apri come web app" attivo l'app è a tutto schermo ma ha un archivio separato da Safari, e i tag NFC aprirebbero l'archivio sbagliato.)
3. Installa l'app gratuita **NFC Tools** (App Store) per scrivere i tag.
4. **Sincronizzazione**: Opzioni → Sincronizzazione → *Creala qui* (apre GitHub con il modulo già compilato) → **Only select repositories** → `inventario-dati` → **Generate token** → copia la chiave → incollala nell'app → **Collega**.
   Stessa cosa sul Mac (una chiave per dispositivo: se perdi il telefono revochi solo quella).

## Flusso di lavoro

1. **Rilievo** (telefono) — Scatta: pezzo singolo o Foto Lotto.
2. **Componi** — marchi o ritagli i pezzi nei lotti, metti i pezzi sciolti nelle scatole.
3. **Scatole** — scheda Scatole: ogni scatola ha un colore, l'anteprima delle foto, e (facoltativi) un **nome** e il **posto** dove sta (✏️ dalla scatola aperta).
4. **Tag NFC delle scatole** — apri la scatola → **NFC** → **Copia link** → in NFC Tools: Scrivi → Aggiungi record → **URL/URI** → incolla → Scrivi → avvicina il tag.
   Da quel momento: avvicini l'iPhone sbloccato al tag → tocchi la notifica → si apre l'elenco di quella scatola.
5. **Sincronizzazione automatica** — non devi fare niente: qualche secondo dopo ogni modifica l'app invia i dati al repository privato (un commit per volta, con lo storico). Senza rete le modifiche restano in coda e partono appena torna.
   Il badge in alto dice lo stato: ☁ Sincronizzato · Modifiche in invio · Offline · ⚠ errore.
6. **Sul Mac** — apri lo stesso link: all'apertura, quando torni sulla pagina e ogni minuto scarica le novità (foto comprese, quando servono). Puoi anche modificare dal Mac: le modifiche tornano sul telefono.
   Se lo stesso pezzo viene modificato su due dispositivi, vince la modifica più recente.
7. **Backup manuale ZIP** — facoltativo, in Opzioni → Esporta archivio ZIP.

## Chiedi a Claude: "che cos'è questo pezzo?"

Serve l'app **Claude** installata sul telefono. Non servono chiavi né abbonamenti in più.

1. Fai la foto: sopra la foto compare **✨ Cos'è?**. Toccalo.
2. Si apre "Condividi": scegli **Claude** e invia. La domanda è già scritta (se nella chat non c'è, incollala: è già copiata).
3. Quando Claude risponde, tieni premuta la risposta → **Copia**.
4. Torna nell'inventario e tocca **📋 Incolla** sopra la foto: descrizione, tag e categoria si compilano da soli. Controlla e salva.

Funziona anche sui pezzi ritagliati da una Foto Lotto. Sul Mac il pulsante copia la foto e apre claude.ai con la domanda: lì incolli la foto con ⌘V.

## L'archivio in una cartella del Mac (per farlo leggere a un'AI)

Sul Mac, con **Chrome**: Opzioni → Backup e file → **📁 Scegli la cartella…** → scegli la Scrivania → Consenti. Compare la cartella **Inventario** con `inventario.md` (l'elenco per scatola), i dati e le foto. Si aggiorna da sola ogni volta che apri l'app sul Mac. Se Chrome chiede di nuovo il permesso, tocca «Riattiva la copia» e scegli «Consenti a ogni visita».

## Archivi (laboratorio, armadio, cantina…)

Opzioni → Archivi → **Nuovo archivio**: si parte da un modello (Armadio, Cantina, vuoto) e si cambiano nome, icona, categorie e stati.
Ogni archivio ha le sue scatole; si passa dall'uno all'altro col pulsante in alto a sinistra. Il tag NFC di una scatola apre direttamente l'archivio giusto.

## Opzioni

- **Aspetto**: 5 temi pastello (Salvia, Lavanda, Pesca, Cielo, Notte), scelti per ogni dispositivo.
- **Dettatura**: *Automatica* (il 🎤 scrive mentre parli; se il telefono non lo permette passa alla dettatura della tastiera) o *Sempre tastiera*.

## Dati per l'AI (repository privato o ZIP)

| File | Uso |
|---|---|
| `inventario.md` | elenco per scatola, il più comodo da dare a Claude |
| `inventario.json` | database completo (schema in `LEGGIMI.md`) |
| `inventario.csv` | Excel / Fogli |
| `foto/pezzi/*.jpg`, `foto/lotti/*.jpg` | foto, nominate con l'ID del pezzo/lotto |

Il repository privato contiene sempre questi file aggiornati: Claude può leggerlo direttamente (con accesso al repo), oppure lo cloni sul Mac con GitHub Desktop e lo tieni in una cartella fissa.

## Note importanti

- **Safari può cancellare i dati** dei siti non aperti per 7 giorni di utilizzo di Safari. Con la sincronizzazione attiva non è un problema: ricollegando, i dati si riscaricano dal repository privato.
- La chiave d'accesso resta solo nel dispositivo su cui la incolli. Dagli permesso **solo** sul repository dei dati (Contents: Read and write). Si revoca da GitHub → Settings → Personal access tokens.
- Su iPhone le pagine web non possono scrivere i tag NFC direttamente: per questo si usa NFC Tools. Su Android (Chrome) l'app scrive il tag da sola.
- I link dei tag contengono l'indirizzo dell'app: se rinomini il repository, i tag già scritti vanno riscritti.

## Struttura

```
index.html            app (HTML/CSS/JS in un file)
sw.js                 service worker (funzionamento offline)
manifest.webmanifest  icona e nome
jszip.min.js          creazione/lettura ZIP (MIT, vedi jszip-LICENSE.md)
icon-*.png            icone
tests/                test automatici (cd tests && npm install && npm test)
CLAUDE.md             istruzioni per sviluppare il progetto con Claude Code
```

Aggiornare l'app: modificare i file e fare push; GitHub Pages pubblica in 1–2 minuti. Alzare `VERSION` in `sw.js` e la versione in `index.html` a ogni rilascio.
