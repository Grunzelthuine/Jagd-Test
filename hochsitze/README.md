# Hochsitze · Jagdgemeinschaft Thuine

Eigenständige Test-App (PWA), die später in die App „Jagd Thuine“ einfließen soll.

**Link:** https://grunzelthuine.github.io/Hochsitze/

## Funktionen (v1.0.0)
- Karte mit allen Hochsitzen: Luftbild (Esri), topografische Karte (BKG TopPlusOpen), OpenStreetMap. Symbol je Art, gelber Kegel = Blickrichtung, Ring gelb = Mängel, rot = gesperrt.
- Erfassen am Sitz (nur voller Zugang): GPS wird laufend gemessen und gemittelt (Genauigkeit sichtbar), Punkt von Hand verschiebbar. Name, Art, Zustand, Bemerkung, Blickrichtung (Kompass oder antippen), Foto und Handy-Panorama.
- Steht man beim Erfassen ≤ 30 m neben einem vorhandenen Sitz, fragt die App, ob dieser umgestellt wurde.
- Umstellen: neue GPS-Position, Datum, optional neue Fotos/Richtung. Der alte Standort bleibt mit Zeitraum, Fotos und Panorama im Verlauf. Karte: Uhr-Knopf blendet alte Standorte (gestrichelt) ein.
- Liste mit Suche und Sortierung nach Name, Entfernung oder Art.
- Offline: Änderungen ohne Netz landen in einer Warteschlange und werden automatisch hochgeladen. Angesehene Kartenkacheln und Fotos bleiben auf dem Gerät.

## Neu in v1.1.0
- **Salzlecken:** „+ Erfassen“ → Salzlecke (GPS, Name, Bemerkung, Foto, „Heute bestückt“). Eigenes Symbol auf der Karte (blaues Quadrat).
- **Wartungsbuch:** Liste → Reiter „Salzlecken“, sortiert nach „am längsten nicht bestückt“. ✓ hakt als bestückt ab (Datum änderbar, Notiz optional). Dazu „Kontrolliert“ und „Repariert“. Kein Intervall.
- **Freifläche:** Beim Hochsitz „Freifläche ablaufen“: am Rand entlang gehen und an jeder Ecke „Ecke hier setzen“ tippen. Die Ecken lassen sich ziehen, die Fläche wird in m²/ha berechnet. Gelb auf der Karte.
- **Kirrung:** Ein Punkt (an der eigenen Position oder in der Karte angetippt) mit Entfernung und Richtung vom Sitz.

## Neu in v1.2.0
- **Entfernung messen** (Lineal-Knopf rechts auf der Karte, für alle, nichts wird gespeichert): Start ist der Hochsitz, an dem man sitzt (≤ 25 m per GPS), sonst die eigene Position oder ein angetippter Punkt. Jedes Antippen setzt ein Ziel mit Entfernung und Richtung; Ringe bei 50/100/150/200 m. Ziel antippen = entfernen, Start ist ziehbar.

## Neu in v1.3.0
- **Wind** oben links auf der Karte: Richtung (Pfeil zeigt, wohin der Wind weht; Text „aus SW“), Geschwindigkeit und Böen in km/h. Quelle: Deutscher Wetterdienst – aktuelle Messung der nächsten DWD-Station und MOSMIX-Vorhersage über [Bright Sky](https://brightsky.dev); falls nicht erreichbar: DWD-Modell ICON über [Open-Meteo](https://open-meteo.com). Aktualisierung alle 10 Minuten.
- Antippen: Vorhersage für die nächsten 12 Stunden und Wind an allen Sitzen mit Blickrichtung (von vorn = günstig, im Rücken = ungünstig, Seitenwind). Dieselbe Bewertung steht im Hochsitz-Detail.

## Neu in v1.4.0
- **Windanimation** über der Karte: feine weiße Linien ziehen in Windrichtung, Tempo nach Windstärke, leichte Böen-Schübe. Knopf mit Windsymbol rechts schaltet sie ein/aus (wird gemerkt). Läuft nur, wenn die Karte sichtbar ist (pausiert bei offenen Fenstern, auf der Liste und im Hintergrund).

## Neu in v1.5.0
- **Witterungsfahnen:** An jedem Hochsitz zeigt ein oranger Kegel, wohin die Witterung zieht (Richtung = Wind, Länge 80–350 m und Öffnung 12–40° je nach Windstärke; unter 4 km/h gestrichelter Kreis „kann umlaufen“). Ein/aus im Wind-Fenster (Wind-Kachel antippen).
- Liegen Kirrung oder Freifläche in der Fahne, zeigen Hochsitz-Detail und Wind-Fenster „⚠ Witterung zieht über die Kirrung/Freifläche“.

## Neu in v1.6.0
- **Reviergrenze:** Einstellungen → „Reviergrenze importieren“ (nur voller Zugang). Liest KML/KMZ (z. B. Export aus Google My Maps) und GeoJSON, zeigt eine Vorschau mit allen Flächen/Linien zum Anhaken und die Größe in ha. Die Grenze erscheint orange auf der Karte, „Alle zeigen“ und der Wind-Ort richten sich danach. Gespeichert verschlüsselt als `revier` {name, polys, m2, quelle, datum}.

## Neu in v1.7.0
- **Karte drehen** mit zwei Fingern (Erweiterung [leaflet-rotate](https://github.com/Raruto/leaflet-rotate) 0.2.8, MIT, angepasst: Drehen erst ab 12° Fingerdrehung, damit beim Zoomen nichts verdreht). Am PC: Umschalt + Mausrad.
- Kompass-Knopf oben rechts: roter Pfeil zeigt nach Norden, roter Rand = Karte ist gedreht, Antippen = wieder nach Norden.
- Blickrichtungs-Kegel, Windlinien, Windpfeil und Nordpfeil drehen mit; Entfernungen/Richtungen beim Messen bleiben echte Kompassrichtungen.

## Neu in v1.8.0
- **Karte nach Handy-Kompass ausrichten:** Nordpfeil-Knopf antippen, wenn die Karte nach Norden zeigt → Knopf wird blau, die Karte dreht mit dem Handy (oben = Richtung, in die das Handy zeigt). Nochmal tippen = zurück nach Norden. Selbst mit zwei Fingern drehen beendet das Mitdrehen. Ist die Karte gedreht, richtet der erste Tipp sie nach Norden aus.

## Neu in v1.9.0
- Kartenknöpfe oben rechts lassen sich mit dem Pfeil-Knopf ein- und ausklappen (wird gemerkt). Eingeklappt bleibt der Nordpfeil sichtbar, wenn die Karte gedreht ist oder mit dem Kompass dreht.

## Neu in v1.10.0
- **Sonne & Mond** (Kachel oben links unter dem Wind): Sonnenauf-/-untergang, erstes/letztes Büchsenlicht, Mondsymbol mit aktueller Phase; Hinweis „Büchsenlicht in …“ bzw. „noch … Büchsenlicht“ in den letzten 3 Stunden.
- Antippen: Tabelle Heute/Morgen/Übermorgen (Büchsenlicht, Sonnenzeiten, Nachtzeit nach § 19 BJagdG), Mond heute (Phase, % beleuchtet, Auf-/Untergang, nächster Vollmond), nächste Hauptphasen und Mondkalender für 14 Tage.
- Alles auf dem Gerät berechnet (ohne Internet), Formeln nach SunCalc (Vladimir Agafonkin, BSD-2-Clause). Abgeglichen mit der Python-Bibliothek astral: Sonne ±2 Min., Mond-Auf/Untergang ±15 Min., Phasen auf den Tag.

## Neu in v1.11.0
- Sonnen-Kachel neu gestaltet: Sonne, ↑ Aufgang / ↓ Untergang und Fadenkreuz-Symbole für erstes (✓) / letztes (✕) Büchsenlicht, obere Zeile hell, untere dunkel.
- Büchsenlicht fest = bürgerliche Dämmerung (Sonne 6° unter dem Horizont); Auswahl entfällt.

## Daten
- `data/hochsitze.json`: verschlüsselt (AES-GCM, PBKDF2-SHA256 150.000), gleiches Format wie `strecke.json` in Jagd Thuine.
- `data/fotos/*.bin`: verschlüsselte JPEGs (Format „SBE1“ wie die Dokumente in Jagd Thuine), jeweils mit Vorschaubild `-t.bin`.
- Modell: `sitze: [{id, name, art (kanzel|leiter|drueckjagd|erdsitz|sonst), zustand (gut|maengel|gesperrt), bemerkung, lat, lng, acc, richtung (Grad|null), foto {f,t,w,h}, pano {f,t,w,h}, seit, erstellt, geaendert, verlauf: [{lat, lng, acc, richtung, von, bis, foto, pano}], flaeche: {pts: [[lat,lng]…], m2, datum} | null, kirrung: {lat, lng, datum} | null}]`.
- `lecken: [{id, name, bemerkung, lat, lng, acc, foto, erstellt, geaendert, wartung: [{id, datum, art (bestueckt|kontrolliert|repariert), notiz, zeit}]}]`.

## Zugang
- Lesen: alle mit dem Passwort der Jagdgemeinschaft.
- Schreiben: Einstellungen → „Voller Zugang“ + fine-grained Token mit Contents: Read & Write auf dieses Repo.
