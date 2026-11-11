# Konten-Server einrichten (Cloudflare, kostenlos)

Dauer: etwa 20–30 Minuten, am besten am PC. Die Bezeichnungen bei GitHub, Cloudflare und Anthropic können leicht abweichen.

## Checkliste

- [ ] 1. GitHub-Token erstellen (nur für `Jagd-Test`)
- [ ] 2. Cloudflare-Konto anlegen
- [ ] 3. Worker `jagd-test` anlegen und Code einfügen
- [ ] 4. KV-Speicher anlegen und als `DB` verbinden
- [ ] 5. Secret `GH_TOKEN` hinterlegen
- [ ] 6. Claude-Schlüssel erstellen und als Secret `ANTHROPIC_KEY` hinterlegen
- [ ] 7. Adresse prüfen und an Claude schicken
- [ ] 8. (nach Claudes Rückmeldung) Als Erster ein Konto anlegen = Haupt-Admin
- [ ] 9. Startseite `jg-thuine` bei Cloudflare Pages anlegen (unabhängig von 1–8, geht jederzeit)

**Tipp:** Token und Schlüssel werden jeweils nur einmal angezeigt. Am besten sofort in Cloudflare einfügen und nirgends sonst speichern (nicht in Chat, Mail oder WhatsApp).

---

## 1. GitHub-Token für den Server

1. github.com → oben rechts Profilbild → **Settings** → links ganz unten **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. **Token name:** `Jagd-Test Server`
3. **Expiration:** so lang wie möglich (vor Ablauf erneuern – dann geht Schreiben nicht mehr, Lesen schon).
4. **Repository access:** *Only select repositories* → `Grunzelthuine/Jagd-Test`.
5. **Permissions → Repository permissions → Contents:** *Read and write* (Metadata „Read-only“ kommt automatisch dazu).
6. **Generate token** → Token kopieren (beginnt mit `github_pat_`).

## 2. Cloudflare-Konto

1. **dash.cloudflare.com** → *Sign up* → E-Mail und Passwort → E-Mail bestätigen.
2. Empfohlen: unter *Profil → Authentication* die **Zwei-Faktor-Anmeldung** einschalten.
3. Es wird keine Domain und keine Zahlungsart gebraucht. Fragen nach „Website hinzufügen“ einfach überspringen.

## 3. Worker anlegen und Code einfügen

1. Links **Workers & Pages** (evtl. unter *Compute*) → **Create application** → **Start with Hello World!** → **Get started**.
2. Name: **`jagd-test`** → **Deploy**.
3. **Edit Code** → im Editor alles markieren und löschen.
4. Den Code von hier kopieren: <https://raw.githubusercontent.com/Grunzelthuine/Jagd-Test/main/server/worker.js> (Seite öffnen, Strg+A, Strg+C) → im Editor einfügen.
5. Oben rechts **Deploy** (bzw. Pfeil neben Deploy → *Save and deploy*).

## 4. Speicher (KV) anlegen und verbinden

1. Links **Storage & Databases → Workers KV** → **Create instance** → Name `jagd-test` → **Create**.
2. Zurück zu **Workers & Pages** → Worker `jagd-test` öffnen → Reiter **Bindings** → **Add binding** → **KV namespace** → **Add binding**.
   - **Variable name:** `DB` (genau so, Großbuchstaben)
   - **KV namespace:** `jagd-test`
   - **Add binding**.

## 5. GitHub-Token hinterlegen

Worker `jagd-test` → **Settings** → **Variables and Secrets** → **Add**:
- **Type:** *Secret*
- **Variable name:** `GH_TOKEN`
- **Value:** der Token aus Schritt 1
- **Deploy** (bzw. Speichern).

## 6. Claude-Schlüssel für die Foto-Auswertung

1. **console.anthropic.com** → **Settings → Workspaces** → **Create Workspace** → Name `Jagd Thuine`.
2. Im Workspace **Limits** → monatliches Ausgabenlimit setzen (z. B. 5 €) – das ist die feste Obergrenze.
3. **API Keys** → **Create Key** → Workspace `Jagd Thuine` wählen, Name `Jagd-Test Server` → Schlüssel kopieren (beginnt mit `sk-ant-`).
4. Cloudflare: Worker `jagd-test` → **Settings** → **Variables and Secrets** → **Add** → Type *Secret*, Name **`ANTHROPIC_KEY`**, Value = der Schlüssel → **Deploy**.

Danach braucht kein Admin mehr einen eigenen Schlüssel. Der Server erlaubt nur die Auswertung der Erlegerliste (Claude Opus 5.5, begrenzte Antwortlänge, 20 Auswertungen pro Admin und Tag, 60 gesamt) und schreibt jede Auswertung ins Protokoll.

## 7. Prüfen und Adresse schicken

1. Die Adresse des Workers steht auf der Übersichtsseite des Workers unter *Domains & Routes*, z. B. `https://jagd-test.DEINNAME.workers.dev`.
2. Im Browser öffnen. Es muss ein Text erscheinen mit:
   - `"name":"Jagd Thuine – TEST"`
   - `"ersterNutzer":true`
   - `"ki":true`
3. Erscheint `KV-Speicher „DB“ ist nicht verbunden` → Schritt 4 prüfen. Fehlt `"ki":true` → Schritt 6 prüfen.
4. Die Adresse an Claude schicken – sie wird dann in beiden Test-Apps eingetragen.

## 8. Erstes Konto = Haupt-Admin

Sobald Claude die Adresse eingetragen hat:
1. <https://grunzelthuine.github.io/Jagd-Test/thuine/> öffnen (ggf. neu laden).
2. **Mit Konto anmelden** → **Das erste Konto wird automatisch Haupt-Admin** – also selbst als Erster registrieren.
3. Einmal das Passwort der Jagdgemeinschaft eingeben – es wird im Server hinterlegt.
4. Dasselbe in der Hochsitze-Test-App (dort ist man schon angemeldet, nur das Passwort einmal eingeben).

## 9. Startseite jg-thuine (Cloudflare Pages)

Unabhängig von den Schritten oben – kann auch zuerst oder später erledigt werden.

1. Cloudflare → **Workers & Pages** → **Create application** → Reiter/Auswahl **Pages** → **Connect to Git**.
2. **GitHub** wählen, anmelden und Cloudflare den Zugriff erlauben – dabei *Only select repositories* → **`Startseiten`** auswählen → **Install & Authorize**.
3. Repo `Startseiten` wählen → **Begin setup**.
4. Einstellungen:
   - **Project name:** `jg-thuine` (das wird die Adresse `jg-thuine.pages.dev`)
   - **Production branch:** `main`
   - **Framework preset:** *None* (kein Framework)
   - **Build command:** `exit 0`
   - **Build output directory:** `jagd`
   - **Root directory:** leer lassen
5. **Save and Deploy** → nach etwa einer Minute ist die Seite unter **https://jg-thuine.pages.dev** erreichbar.
6. Falls der Name schon vergeben ist, hängt Cloudflare etwas an – dann die tatsächliche Adresse an Claude schicken.

Änderungen an der Startseite veröffentlicht Cloudflare danach automatisch, sobald Claude sie ins Repo `Startseiten` schreibt.
