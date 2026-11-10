# Jagd-Test

Testumgebung für die Apps der Jagdgemeinschaft Thuine. Hier werden neue Funktionen ausprobiert, bevor sie in die echten Apps (`Streckenbericht`, `Hochsitze`) übernommen werden.

- `thuine/` – Jagd Thuine (Test), Daten unter `thuine/data/`
- `hochsitze/` – Hochsitze (Test), Daten unter `hochsitze/data/`
- `server/worker.js` – Konten-Server (Cloudflare Worker) für beide Apps
- `server/ANLEITUNG.md` – Einrichtung des Servers

Die Daten sind eine Kopie vom 10.11.2026 und mit dem Passwort der Jagdgemeinschaft verschlüsselt. Die Test-Apps speichern auf dem Gerät getrennt von den echten Apps (Präfix `test.`).

## Neu in der Testumgebung

- **Konten:** Anmelden mit Name und Passwort statt GitHub-Token. Konten werden vom Admin freigegeben; Rollen je App (kein Zugang / Ansehen / Admin) und Einzelrechte (Hochsitze: Zustand ändern, Salzlecken abhaken).
- **Kontenverwaltung** (Einstellungen → Konto → Konten verwalten): freigeben, Rechte, Startpasswort, sperren, löschen, Protokoll.
- **Daten-Passwort:** wird angemeldeten Konten automatisch übergeben. Später kann das gemeinsame Passwort abgeschaltet werden.
- **Push-Benachrichtigungen** (Jagd Thuine): neue/geänderte Termine, Damwild-Freigabe, erlegtes Damwild mit Wildbret-Gruppe, Hirschjagd-Sperre.
