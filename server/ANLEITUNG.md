# Konten-Server einrichten (Cloudflare, kostenlos)

Dauer: etwa 20 Minuten. Die Bezeichnungen bei GitHub und Cloudflare können leicht abweichen.

## 1. GitHub-Token für den Server

1. github.com → oben rechts Profilbild → **Settings** → ganz unten **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. Name: `Jagd-Test Server`. Ablauf: so lang wie möglich (vor Ablauf erneuern).
3. **Repository access:** *Only select repositories* → `Jagd-Test`.
4. **Permissions → Repository permissions → Contents:** *Read and write*.
5. **Generate token** und den Token kopieren (er wird nur einmal angezeigt).

## 2. Cloudflare-Konto und Worker

1. Auf **dash.cloudflare.com** ein kostenloses Konto anlegen und die E-Mail bestätigen.
2. Links **Workers & Pages** (bzw. *Compute*) → **Create** → **Worker** → Vorlage „Hello World“ → Name **`jagd-test`** → **Deploy**.
3. **Edit code** → den vorhandenen Code komplett löschen → den Inhalt von [`server/worker.js`](https://raw.githubusercontent.com/Grunzelthuine/Jagd-Test/main/server/worker.js) einfügen → **Deploy**.

## 3. Speicher (KV) anlegen und verbinden

1. Links **Storage & Databases → KV** (bzw. *Workers KV*) → **Create** → Name `jagd-test` → anlegen.
2. Zurück zum Worker `jagd-test` → **Settings** → **Bindings** → **Add** → **KV namespace**.
   - Variable name: **`DB`** (genau so, Großbuchstaben)
   - KV namespace: `jagd-test`
   - Speichern / **Deploy**.

## 4. GitHub-Token hinterlegen

Worker `jagd-test` → **Settings** → **Variables and Secrets** → **Add**:
- Type: **Secret**
- Name: **`GH_TOKEN`**
- Value: der Token aus Schritt 1
- Speichern / **Deploy**.

## 5. Claude-Schlüssel für die Foto-Auswertung

1. **console.anthropic.com** → **Settings → Workspaces** → neuen Workspace `Jagd Thuine` anlegen.
2. Im Workspace unter **Limits** ein monatliches Ausgabenlimit setzen (z. B. 5 €) – das ist die feste Obergrenze.
3. **API Keys** → **Create Key** im Workspace `Jagd Thuine` → Schlüssel kopieren.
4. Worker `jagd-test` → **Settings** → **Variables and Secrets** → **Add** → Type **Secret**, Name **`ANTHROPIC_KEY`**, Value = der Schlüssel → Speichern / **Deploy**.

Danach braucht kein Admin mehr einen eigenen Schlüssel auf dem Handy. Der Server erlaubt nur die Auswertung der Erlegerliste (festes Modell, begrenzte Antwortlänge, 20 Auswertungen pro Admin und Tag, 60 gesamt) und schreibt jede Auswertung ins Protokoll. Die Werte stehen oben in `worker.js` unter `ki:`.

## 6. Prüfen und Adresse schicken

1. Die Adresse des Workers steht oben, z. B. `https://jagd-test.DEINNAME.workers.dev`.
2. Im Browser öffnen: Es muss ein Text mit `"name":"Jagd Thuine – TEST"`, `"ersterNutzer":true` und `"ki":true` erscheinen.
3. Die Adresse an Claude schicken – dann wird sie in den Test-Apps eingetragen.

## 7. Erstes Konto = Haupt-Admin

Sobald die Adresse eingetragen ist: Test-App öffnen → **Mit Konto anmelden** → Konto anlegen. **Das erste Konto wird automatisch Haupt-Admin** – also selbst als Erster registrieren. Danach einmal das Passwort der Jagdgemeinschaft eingeben; es wird dann im Server hinterlegt.
