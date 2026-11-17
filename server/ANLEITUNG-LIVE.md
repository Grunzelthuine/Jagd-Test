# Umstellung der echten App „Jagd Thuine“ auf Konten

Dauer: etwa 30 Minuten, am besten am PC und **nicht direkt vor einem Jagdtag**. Halte das Handy bereit: Gleich nach der Umstellung legst du dein Konto an.

Die Daten bleiben erhalten: Termine, Strecke, Reh-/Dam-/Schwarzwild, Wildbret-Verteilung, Freigabe, Meldungen und Dokumente. Ausgetauscht wird nur der Programmcode. Die Kameraden bleiben mit dem gemeinsamen Passwort drin und sehen den Hinweis „Bitte eigenes Konto anlegen“.

## Checkliste

- [ ] 1. Sicherung speichern
- [ ] 2. GitHub-Token für den echten Server erstellen
- [ ] 3. Worker `jagd` anlegen und Code `worker-live.js` einfügen
- [ ] 4. KV-Speicher `jagd-db` anlegen und als `DB` verbinden
- [ ] 5. Secrets `GH_TOKEN` und `ANTHROPIC_KEY` hinterlegen
- [ ] 6. Adresse prüfen und an Claude schicken → Claude stellt die App um
- [ ] 7. Sofort danach: App öffnen und **als Erster** dein Konto anlegen
- [ ] 8. Einmal das gemeinsame Passwort eingeben, Benachrichtigungen einschalten, kurz testen

---

## 1. Sicherung

In der **echten** App: Einstellungen → Datensicherung → **Sicherung speichern** und die Datei in den OneDrive-Ordner „Streckenbericht APP“ legen. Claude setzt zusätzlich in den drei Repos die Markierung `vor-konten`.

## 2. GitHub-Token

1. github.com → Profilbild → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. Name: `Jagd Thuine Server`, Laufzeit so lang wie möglich.
3. **Repository access → Only select repositories:** `Streckenbericht`, `Streckenbericht-schalenwild`, `Streckenbericht-meldungen` und `Hochsitze` (für später).
4. **Permissions → Contents: Read and write.**
5. **Generate token** und den Token kopieren. Er beginnt mit `github_pat_`.

## 3. Worker anlegen

1. dash.cloudflare.com → **Workers & Pages** → **Create application** → **Start with Hello World!**
2. Name: **`jagd`** → **Deploy**.
3. **Edit Code** → alles löschen → den kompletten Inhalt von **`server/worker-live.js`** einfügen. Den Link schickt Claude. Es ist **nicht** `worker.js`, das ist der Test-Server. Danach **Deploy**.

## 4. KV-Speicher

1. **Storage & Databases → KV** → **Create** → Name `jagd-db`.
2. Zurück zum Worker `jagd` → **Bindings** (bzw. *Settings → Bindings*) → **Add binding** → **KV namespace**.
3. Variablenname **`DB`**, Namespace `jagd-db` → speichern.

## 5. Secrets

Worker `jagd` → **Settings → Variables and Secrets** → **Add**:

- Typ **Secret**, Name **`GH_TOKEN`**, Wert = Token aus Schritt 2.
- Typ **Secret**, Name **`ANTHROPIC_KEY`**, Wert = Claude-Schlüssel. Den Schlüssel vom Test-Server kannst du nicht mehr ansehen. Lege deshalb auf platform.claude.com unter API Keys einen neuen an, z. B. „Jagd Thuine“.

Danach im Worker noch einmal **Deploy**.

## 6. Adresse prüfen

Die Adresse lautet voraussichtlich `https://jagd.sebastian-bruns.workers.dev`. Wenn du sie im Browser mit `/info` am Ende öffnest, muss oben `"name":"Jagd Thuine"` stehen. Eine neue Adresse kann einige Minuten brauchen. Dann die Adresse an Claude schicken.

## 7. Dein Konto (direkt nach Claudes Umstellung)

- Die echte App öffnen. Kommt keine Update-Meldung, oben auf ↻ tippen, sonst die App einmal schließen und wieder öffnen.
- Im Hinweis „Bitte eigenes Konto anlegen“ **Konto anlegen** tippen.
- Vorname **Sebastian**, Nachname **Bruns** eintragen und ein eigenes Passwort wählen. Nur dieser Name kann das erste Konto werden, das dann automatisch Haupt-Admin ist. Wer es vorher versucht, bekommt „Die Konten werden gerade eingerichtet“.

## 8. Danach

- Einstellungen → Konto → Benachrichtigungen einschalten.
- Wenn die App danach fragt, einmal das gemeinsame Passwort eingeben. Es wird im Server hinterlegt und an die Konten weitergegeben.
- Test: einen Termin anlegen, ändern und wieder löschen.
- Kontoanträge kommen per Push. Freigeben unter Einstellungen → Konto → **Konten verwalten**. Wer Reh-, Dam- und Schwarzwild eintragen soll, bekommt das Einzelrecht **„Reh-, Dam- und Schwarzwild eintragen“**. Die Benachrichtigung „Neue Wildmeldung“ wird dabei automatisch mit angehakt.
- Wenn alle ein Konto haben: ntfy-Kanal leeren, Schalter „Nur noch mit Konto“ setzen und das gemeinsame Passwort ändern.
