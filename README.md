# ⚡ ZEITSTURM

**Das 3D-Gesellschaftsspiel um die Zeitlinie** – für 1 bis 4 Spieler, online mit Freunden (Raumcode) oder gemeinsam an einem Handy. Vier Zeitreisende ringen auf einem schwebenden Archipel aus sechs Epochen-Inseln und sechs Nebeninseln um Wissen, Einfluss und Zeitfragmente. Das Brett hat **175 Felder und 19 Kreuzungen**. Wer zuerst alle Sternfarben und 5 Fragmente besitzt und das Zeitportal erreicht, gewinnt.

**Neu in Version 2:** doppelt so großes, verzweigteres Brett mit Nebeninseln (Inselhüpfen), Aussichtspfaden und Dreifach-Kreuzungen. Dazu kommen zwei Würfel mit Pasch-Bonus und die neuen Felder **Archiv** und **Zeitstrom**. Optisch neu sind das animierte Wolkenmeer, Inseln mit Gelände und Bewuchs, Wasserfälle, das Portal mit Zeituhr, Lichtspuren der Figuren, Sternschnuppen und eine Kamerafahrt zum Spielstart. Wer ein Feld antippt, sieht, was dort passiert. Gerendert wird mit Instancing, damit das große Brett auf dem Handy flüssig bleibt.

- **Mobile-first:** gebaut für Handys im Hoch- und Querformat (Touch, große Buttons, Bottom-Sheets, Vibration), läuft genauso am Desktop. Installierbar als App (PWA, Vollbild, offline spielbar für lokale Partien).
- **Reine Web-App ohne Server:** läuft auf GitHub Pages. Online-Multiplayer per WebRTC (PeerJS), der Host rechnet die Partie.
- **Alles selbst erzeugt:** 3D-Modelle, Texturen, Icons, Musik und Soundeffekte entstehen prozedural im Browser. Keine externen Assets, keine Lizenzprobleme.
- **385 geprüfte Fragen** in 6 Themen und 5 Formaten, 40 Ereignisse, 30 Anträge, 30 Karten, 3 Musik-Minispiele, 10 Feldtypen.

---

## 🚀 Schnellstart

### Lokal starten (zum Testen)
Voraussetzung: [Node.js](https://nodejs.org) ab Version 18 (es werden keine Pakete installiert).

```bash
node tools/serve.mjs
```

Dann `http://localhost:8080` öffnen. Der Server zeigt zusätzlich eine WLAN-Adresse an (z. B. `http://192.168.0.12:8080`), über die du das Spiel direkt **auf dem Handy** testen kannst.

Alternativ mit Python: `python -m http.server 8080`. Wichtig ist nur, dass die Dateien über `http://` ausgeliefert werden; ein Doppelklick auf `index.html` (`file://`) funktioniert wegen der ES-Module nicht.

### Auf dem Handy als App installieren
- **Android (Chrome):** Seite öffnen → Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“. Im Spielmenü erscheint zusätzlich der Button „Als App installieren“.
- **iPhone/iPad (Safari):** Seite öffnen → Teilen-Symbol → „Zum Home-Bildschirm“.

Danach startet ZEITSTURM im Vollbild wie eine native App. Nach dem ersten Besuch funktionieren lokale Partien auch offline.

---

## 🌍 Veröffentlichung auf GitHub Pages

1. Neues Repository auf GitHub anlegen (z. B. `zeitsturm`).
2. Den **Inhalt dieses Ordners** (`index.html` muss im Wurzelverzeichnis liegen) hochladen:
   ```bash
   git init
   git add .
   git commit -m "ZEITSTURM"
   git branch -M main
   git remote add origin https://github.com/<DEIN-NAME>/zeitsturm.git
   git push -u origin main
   ```
3. Auf GitHub: **Settings → Pages → Build and deployment**
   - *Variante A (einfach):* Source „Deploy from a branch“, Branch `main`, Ordner `/ (root)` → Save.
   - *Variante B (Actions):* Source „GitHub Actions“. Der mitgelieferte Workflow `.github/workflows/pages.yml` veröffentlicht automatisch bei jedem Push.
4. Nach ca. 1 Minute ist das Spiel unter `https://<DEIN-NAME>.github.io/zeitsturm/` erreichbar.

Die Datei `.nojekyll` sorgt dafür, dass GitHub die Dateien unverändert ausliefert. Alle Pfade sind relativ, das Spiel funktioniert daher in jedem Unterordner.

**Einladungslinks:** Der Host kann in der Lobby einen Link der Form `…/zeitsturm/?room=ABCDE` teilen. Wer ihn öffnet, landet direkt im Beitreten-Dialog.

---

## 🎮 Spielregeln

### Ziel – zwei Siegwege
1. **Portal-Sieg:** Besitze in **jeder aktiven Themenfarbe mindestens einen Wissensstern** und **5 Zeitfragmente**. Dann erreiche oder überquere das große Zeitportal in der Mitte – sofortiger Sieg.
2. **Wertungs-Sieg:** Endet die letzte Runde (Standard: Runde 30) ohne Portal-Sieg, gewinnt der höchste **Gesamtwert**:
   `Sterne × 2 + verschiedene Sternfarben × 1 + Fragmente × 5 + Einfluss ÷ 3 (abgerundet)`.
   Bei Gleichstand entscheiden Fragmente, dann Sterne, dann Einfluss.

### Ablauf eines Zuges
1. **Würfeln oder Karte spielen.** Gewürfelt wird mit **zwei Würfeln** (2–12 Felder). Ein **Pasch** bringt sofort eine Bonuskarte. Vor dem Würfeln darfst du eine Karte spielen. Zeitsprung-Karten ersetzen den Wurf.
2. **Bewegen.** Ziehe Feld für Feld in Pfeilrichtung (die Wege „fließen“ sichtbar). An **Kreuzungen** wählst du frei – per Button oder durch Antippen eines leuchtenden Felds.
3. **Feld-Aktion** des Feldes, auf dem du stehen bleibst.
4. **Verhandeln (optional):** Handel anbieten (mit Gegenangebot), Bündnis anbieten oder Verrat begehen.
5. **Zug beenden.**

**Wächter-Felder (♛)** halten dich an, solange du ihren Wächter noch nicht besiegt hast. Du musst dich der Herausforderung stellen.

### Ressourcen
| Ressource | Wofür |
|---|---|
| ⭐ **Wissenssterne** (6 Farben, jede mit Symbol: ⚖ 📜 ♪ ⚛ 🌍 🎬) | Jede Farbe einmal ist Pflicht fürs Portal; Sterne zählen in der Wertung. |
| ◆ **Einfluss** | Währung für Parlament (Stimmen), Markt, Duelle und Bestechung. |
| ⧗ **Zeitfragmente** | Gewinnbedingung (5). Nur über Wächter, Duelle, Markt und Ereignisse. |
| 🂠 **Karten** | Höchstens 5 auf der Hand. |
| ★ **Ansehen** (0–10, Start 5) | Ab 8 zählt deine Grundstimme doppelt, bei 2 oder weniger gar nicht. |

### Die Feldtypen
Neben den acht Feldtypen aus dem Auftrag gibt es zwei neue: **Archiv** und **Zeitstrom**. Wer ein Feld auf dem Brett antippt, bekommt seine Wirkung angezeigt.

| Feld | Wirkung |
|---|---|
| 📚 **Archiv** (neu) | Ziehe eine Karte und erhalte 1 Einfluss. |
| ≈ **Zeitstrom** (neu) | Liegt auf dem kurzen Fallenweg und trägt dich sofort bis zum Ausgang der Insel. Dort wird das Feld ausgeführt. |
| **Themenfeld** (6 Farben) | Quizfrage zum Thema; Schwierigkeit steigt von der Antike (leicht) bis zur Zukunft (schwer). Richtig: **Stern oder Einfluss** (1 + Schwierigkeit) nach Wahl. Danach wird immer die Erklärung eingeblendet. |
| ⚡ **Ereignisfeld** | Historisches/politisches Ereignis, das **alle** betrifft (40 verschiedene). |
| ⚔ **Duellfeld** | Fordere einen Gegner heraus: Thema und Einsatz (Einfluss oder Fragment) wählst du. Beide beantworten dieselbe Frage; bei Gleichstand entscheidet eine Schätzfrage. Verlierer zahlt; der Sieger erhält zusätzlich 2 Einfluss und eine Karte. Verbündete und Spieler mit Schild können nicht herausgefordert werden. |
| 🏛 **Parlament** | Wähle einen von zwei Anträgen, dann stimmen alle geheim ab (siehe unten). |
| ♫ **Konzert** | Musik-Minispiel: Rhythmus-Duell, Melodie-Gedächtnis oder Instrumente erkennen. Ab 75 % gibt es einen **Musik-Stern** (+1 Einfluss), ab 40 % 2 Einfluss. |
| ⇄ **Markt** | Bei der Bank: Karte (3 ◆, max. 2), Wissensstern deiner Wahl (6 ◆), Zeitfragment (10 ◆), Stern verkaufen (+3 ◆). Danach darfst du bis zu **zwei Handelsangebote** an Mitspieler machen (Karten, Sterne, Einfluss), mit **Gegenangebot**. Außerhalb des Markts ist pro Zug ein Angebot erlaubt. |
| ◎ **Zeitportal** | Abkürzung in eine Epoche deiner Wahl. Risiko beim Sprung: 1/6 Zeitsturm-Strafe (−3 Einfluss, −1 Karte), 1/6 zufälliges Ziel. |
| ♛ **Epochen-Herausforderung** | Wächter jeder Epoche mit eigenem Prüfungstyp: Wissensrennen (Antike, Weltkriegs-Ära), Reihenfolge-Rätsel (Mittelalter, Kalter Krieg), Zuordnungs-Prüfung (Industrialisierung, Zukunft). 2 von 3 richtig (Schwer: 3 von 3) → **Zeitfragment** + 2 Einfluss. Jeder Wächter kann von jedem Spieler einmal besiegt werden. |

### Das Brett: ein Archipel mit 175 Feldern
Sechs große Epochen-Inseln (Antike, Mittelalter, Industrialisierung, Weltkriegs-Ära, Kalter Krieg, Zukunft) liegen um das Zeitportal, dazwischen schweben sechs Nebeninseln. Jede Epoche hat **drei echte Entscheidungen**:
1. **Am Eingang:** der **lange Weg** über den Inselbogen mit Archiv, Wächter ♛, Markt und Parlament (Belohnung) oder der **kurze Fallenweg** mit Duell, Zeitportal, Ereignis und Zeitstrom (Risiko).
2. **Auf dem Bogen:** der **Aussichtspfad** durch das Inselinnere, ein Umweg mit Konzert, Themenfeld und Archiv.
3. **Am Ausgang (dreifach):** die **Brücke** zur nächsten Epoche, das **Inselhüpfen** über die Nebeninsel mit Handelsposten, Inselrat (Parlament), Konzert und Archiv oder die **Speiche** direkt zum Zeitportal, von dem aus jede Insel erreichbar ist.

Insgesamt gibt es 19 Kreuzungen. Das Parlament kann neue Brücken bauen (dadurch entstehen weitere Kreuzungen), Brücken und Speichen sperren oder die Themenfelder einer Epoche umfärben.

### Parlament (Politik-Mechanik)
- Alle stimmen gleichzeitig und **geheim** ab: Ja / Nein / Enthaltung, dazu ein **Gebot an Einfluss** als zusätzliche Stimmen. Gebote werden bezahlt (sie fließen in einen Fonds) und erst nach der Abstimmung aufgedeckt.
- **Stimmgewicht** = Grundstimme (abhängig vom Ansehen: 0, 1 oder 2) + Gebot.
- **Koalition:** Verbündete, die gleich abstimmen, erhalten je +1 Stimme.
- **Veto-Karten:** Veto, Super-Veto (Gebot zurück), Doppelstimme, Umkehr, Vertagung.
- Angenommene Anträge verändern das Spiel **dauerhaft** (30 Anträge): Brücken öffnen/sperren, Portalwege sperren, Themenfelder umfärben, Regeln ändern (Bildungsoffensive, Duellverbot, Wettrüsten, Kartenlimit, Grundeinkommen, Steuern, Fondsausschüttung, Amnestie, Zeitsturm früher/später, Marktliberalisierung, schwächere Wächter …). Der Antragsteller erhält bei Annahme 2 Einfluss.

### Bündnisse und Verrat
Zwei Spieler können für **5 Runden** ein Bündnis schließen. Dann gilt: Beantwortet einer eine Themenfrage richtig, erhält der Partner 1 Einfluss; Duelle untereinander sind nicht möglich; im Parlament greift der Koalitionsbonus. Endet ein Bündnis regulär, gewinnen beide 1 Ansehen. **Verrat** ist jederzeit nach der eigenen Feld-Aktion erlaubt und bringt +4 Einfluss, kostet aber −3 Ansehen.

### Karten (30 Varianten in 6 Arten)
| Art | Varianten |
|---|---|
| 🃏 **Joker** (während Fragen) | 50/50 · Fragentausch · Zweite Chance · Doppelt oder nichts · Zeitlupe (+30 s) |
| 💣 **Sabotage** | Einflussraub (bis 4) · Taschendieb · Zeitschleife (zurück an den Inselanfang) · Zeitstarre (aussetzen) · Gedächtnislücke (−1 Stern) |
| ⏩ **Zeitsprung** (statt Würfeln) | Kurzsprung (4) · Weitsprung (10) · Präzisionssprung (2–12 wählen) · Epochenwechsel · Dreifachwurf (3 Würfel) |
| 🛡 **Schutzschild** | Schutzschild · Großer Schild · Spiegelschild · Sturmanker · Bündnisschild |
| ✋ **Veto** (bei Abstimmungen) | Veto · Super-Veto · Doppelstimme · Umkehr · Vertagung |
| 🕵 **Spion** | Blick in die Karten · Kopie · Diebstahl · Aufklärung (2 Karten ziehen) · Dossier |

**Kopfgeld:** Wer mit einer Sabotage-Karte den aktuell Führenden trifft, erhält zusätzlich 3 Einfluss.

### Zeitsturm und Comeback
- Nach **zwei Dritteln der Runden** (Standard: ab Runde 21) bricht der **Zeitsturm** los. Jede Runde zerfallen 4 Felder (sie bleiben begehbar, lösen aber nichts mehr aus), Duell-Einsätze verdoppeln sich, richtige Antworten bringen +1 Einfluss, und jede zweite Runde kostet der Sturm 1 Einfluss.
- **Rückenwind:** Wer mindestens 5 Punkte hinter dem Führenden liegt, würfelt mit drei Würfeln (die besten zwei zählen) und erhält +1 Einfluss pro Zug.

### Die Themen
Politik ⚖ · Geschichte 📜 · Musik ♪ · Wissenschaft & Technik ⚛ · Geografie & Natur 🌍 · Film & Popkultur 🎬. Es gibt je 63 bis 65 Fragen, insgesamt 385. Fragenformate: Multiple Choice, Wahr/Falsch, Schätzfrage (Toleranzbereich zählt als richtig), Reihenfolge (antippen in der richtigen Reihenfolge) und Zuordnung (links und rechts antippen). Jede Frage hat Schwierigkeit 1–3, eine Epochen-Zuordnung und eine Erklärung. Fragen werden pro Partie ohne Wiederholung gezogen. Erst wenn ein Thema komplett aufgebraucht ist, wird es neu gemischt.

---

## 👆 Steuerung

| Aktion | Handy | Desktop |
|---|---|---|
| Kamera drehen | ein Finger ziehen | linke Maustaste ziehen |
| Zoomen / verschieben | zwei Finger | Mausrad / rechte Maustaste |
| Folgen ↔ Übersicht | 🎥 | 🎥 |
| Weg wählen | Button oder leuchtendes Feld antippen | ebenso |
| Feld-Info | beliebiges Feld antippen | anklicken |
| Spielerdetails | Spieler-Chip antippen | anklicken |
| Protokoll, Chat, Regeln, Menü | 📜 💬 ❔ ☰ | ebenso |

**Hot-Seat (ein Gerät):** Bei geheimen Entscheidungen (Abstimmung, Duell, Handel, Bündnis) erscheint ein Sichtschutz: „Gib das Gerät an …“.

---

## 🌐 Online-Multiplayer

- **Raum erstellen:** Der Host erhält einen 5-stelligen Raumcode (z. B. `KXQRT`) und einen Einladungslink. Mitspieler treten mit Code oder Link bei, wählen Namen, Farbe und Figur und tippen auf **„Bereit“**. Freie Plätze kann der Host mit Bots besetzen. Der Host startet die Partie, sobald mindestens 2 Plätze belegt und alle Menschen bereit sind.
- **Host-Autorität:** Nur der Host berechnet die Partie. Mitspieler senden Aktionen und erhalten den Zustand, wobei verdeckte Informationen (Handkarten, geheime Gebote, Duellantworten) gefiltert werden.
- **Reconnect:** Bricht die Verbindung ab, verbinden sich Mitspieler automatisch neu. Nach einem Neuladen gibt es im Menü „Wieder beitreten“. Ein Token im Browser sorgt dafür, dass man auf denselben Platz zurückkommt. Lädt der **Host** neu, öffnet „Partie fortsetzen“ den Raum mit demselben Code wieder, und die Mitspieler verbinden sich von selbst.
- Ist ein Mitspieler offline, läuft seine Bedenkzeit trotzdem ab (auch ohne eingestelltes Zeitlimit, dann 25 s). Danach wird automatisch eine minimale Aktion gewählt, damit die Partie nicht hängt.
- **Chat & Schnell-Reaktionen:** 💬 öffnet Chat und Emoji-Leiste; Emojis schweben über der eigenen Figur.

**Technischer Hinweis:** Für den Verbindungsaufbau nutzt PeerJS den kostenlosen öffentlichen Vermittlungsdienst (`0.peerjs.com`); die Spieldaten selbst laufen direkt zwischen den Geräten. In sehr restriktiven Netzen (manche Firmen- oder Uni-WLANs, strenge NAT) kann WebRTC ohne eigenen TURN-Server scheitern. Dann hilft meist mobiles Internet.

---

## ⚙ Einstellungen

Grafikqualität (Niedrig/Mittel/Hoch), Musik- und Effektlautstärke getrennt, Vibration, Tempo der Bots, Sprache. Pro Partie stellst du außerdem Rundenzahl (15/20/30), Zeitlimit pro Entscheidung (aus/60/90/120 s), Schwierigkeit und aktive Themen (mindestens 3) ein. Tipp: Bei 15 Runden entscheidet fast immer die Wertung. Für Portal-Siege eignen sich 20 oder 30 Runden.

Die Qualitätsstufe wird beim ersten Start automatisch gewählt (Handy: Mittel, Desktop: Hoch). Zusätzlich misst das Spiel laufend die Bildrate und senkt bei Bedarf die Render-Auflösung, damit es flüssig bleibt (Ziel 60 FPS). Retina-Displays werden bis zum Faktor 2,25 berücksichtigt.

---

## 🧪 Tests und Qualitätssicherung

```bash
node sim/simulate.mjs 1200
```

Spielt automatisiert Bot-Partien (2, 3 und 4 Spieler; jeder Stil gleich oft auf jedem Platz). Es prüft auf Abstürze, Endlosschleifen und Deadlocks und gibt Balance-Kennzahlen aus. Mit `--varied` (z. B. `node sim/simulate.mjs 600 555 --varied`) wechseln zusätzlich Rundenzahl, Schwierigkeit und aktive Themen; auch dieser Robustheitstest lief mit 600/600 Partien ohne Absturz oder Hänger.

```bash
node tools/check.mjs
```

Prüft die Syntax aller Module, fehlende Übersetzungsschlüssel, das Format aller Fragen und die Mindestmengen an Inhalten.

**Ergebnis der finalen Simulation mit dem Archipel-Brett (5 × 1.200 = 6.000 Partien, Seeds 2026/4242/999/31337/7):** alle Partien beendet, **0 Abstürze, 0 Hänger, 0 ungültige Aktionen**. Etwa 72 % enden per Portal, 28 % per Wertung; ein Portal-Sieg fällt im Schnitt in Runde 24.

| Spielstil (Bot) | Siegfaktor (1,00 = exakt fair), Mittel über 5 Seeds | Spannweite |
|---|---|---|
| Wissens-Sammler | 1,05 | 0,99–1,08 |
| Politiker | 0,97 | 0,91–1,03 |
| Saboteur | 0,98 | 0,92–1,02 |

Kein Stil dominiert, alle drei gewinnen regelmäßig. Auch der Vorteil der Startreihenfolge ist gering (Faktor 0,9–1,1).

*Wie die Balance entstand:* Ein erster Messfehler (Spielerzahl und Stil-Rotation waren gekoppelt, sodass der Saboteur nie in 2er-Partien saß) wurde korrigiert. Danach wurden Marktpreise (Stern 6, Fragment 10), Kopfgeld, Duell-Siegprämie und die Bot-Strategien in kleinen Schritten anhand von jeweils mehreren Tausend Partien justiert.

---

## 🧭 Designentscheidungen

Der Auftrag ließ einige Punkte offen. Hier ist festgehalten, wie ich sie entschieden habe:

1. **„Zug“ = Runde.** „Nach dem 30. Zug“ und „nach Runde 20“ beziehen sich auf Runden, in denen jeder Spieler einmal dran ist. Standard sind 30 Runden; der Zeitsturm beginnt nach zwei Dritteln. Kürzere Partien (15/20 Runden) sind einstellbar.
2. **Mobile-first als PWA:** Nachträglicher Wunsch: Handy zuerst. Die Oberfläche ist für Hochformat-Touch gebaut (Bottom-Sheets, Daumenzone, Buttons ≥ 52 px), mit Querformat- und Desktop-Layout als Erweiterung. Manifest und Service Worker machen das Spiel installierbar und offline spielbar. Dazu kommen Wake-Lock (der Bildschirm bleibt an), Vibration, berücksichtigte Safe-Areas (Notch) und gesperrtes Seiten-Zoomen.
3. **Kein Build-Schritt:** Reine ES-Module. Three.js (0.160.0) und PeerJS (1.5.4) kommen mit festen Versionen vom CDN (jsDelivr) und werden vom Service Worker zwischengespeichert. So lässt sich das Projekt direkt auf GitHub Pages veröffentlichen.
4. **Deterministische Regel-Engine ohne DOM** (`js/core/engine.js`): Derselbe Code läuft im Browser (Hot-Seat und Host) und in Node (Simulation). Der Zufall ist geseedet und wird im Spielzustand gespeichert. Speicherstände und Reconnects sind dadurch exakt.
5. **Gerichtetes Brett:** Man zieht nur vorwärts (die Wege zeigen ihre Richtung durch fließendes Licht). So bleiben Entscheidungen an Kreuzungen klar; Rundwege, Speichen und das Portal als Drehkreuz sorgen für Bewegungsfreiheit.
6. **Wächter halten an:** Damit Herausforderungen nicht nur per Zufall getroffen werden, stoppen Wächter-Felder die Bewegung, solange der Wächter unbesiegt ist. Der riskante Kurzweg umgeht sie.
7. **Portal-Bedingung:** Gefordert sind alle **aktiven** Themenfarben, falls Themen abgeschaltet wurden (mindestens 3 bleiben aktiv). Ist Musik abgeschaltet, geben Konzerte statt des Sterns Einfluss.
8. **Belohnung „Stern oder Einfluss“** ist eine echte Wahl (Einfluss = 1 + Schwierigkeit, plus Boni). Das macht den Politiker-Stil möglich.
9. **Schätzfragen:** Im Quiz zählt eine Antwort innerhalb einer festgelegten Toleranz als richtig, im Duell gewinnt die nähere Schätzung.
10. **Multiple Choice:** In den Daten steht die richtige Antwort immer zuerst; die Anzeige wird pro Partie zufällig gemischt. Das erleichtert die Pflege und Prüfung der Fragen.
11. **Reihenfolge und Zuordnung per Antippen** statt Ziehen: Das ist auf Touchscreens zuverlässiger und barriereärmer.
12. **Parlament:** Gebote werden immer bezahlt (auch von der Verliererseite) und fließen in einen Fonds, den Ereignisse und Anträge wieder ausschütten. Das Ansehen bestimmt die Grundstimme, Verbündete bilden automatisch eine Koalition, wenn sie gleich stimmen.
13. **Duelle:** Fair für Online-Spiel ohne Reaktionszeit-Vorteil. Beide beantworten dieselbe Frage, bei Gleichstand entscheidet eine Schätzfrage. Der Sieger erhält zusätzlich 2 Einfluss aus der Bank und eine Karte.
14. **Kopfgeld & stärkere Sabotage:** Aus der Balance-Simulation abgeleitet. Sabotage hilft sonst vor allem den Unbeteiligten; das Kopfgeld macht den Saboteur-Stil zu einem eigenständigen Siegweg.
15. **Comeback „Rückenwind“** ab 5 Punkten Rückstand, statt Gummiband-Effekten, die den Führenden bestrafen.
16. **Zeitlimit pro Entscheidung** (nicht pro ganzem Zug), mit Zusatzzeit für Konzerte, Abstimmungen, Handel und Markt. Bei Ablauf wird automatisch eine minimale Aktion gewählt (z. B. Enthaltung, „keine Antwort“), damit die Partie nie einschläft. Im Tutorial gibt es kein Zeitlimit.
17. **Online:** Öffentlicher PeerJS-Broker, Host-Autorität, Peer-ID `zeitsturm-v1-<CODE>`. Der Raum nutzt Sprache und Fragenkatalog des Hosts. Mitspieler können während einer laufenden Partie nur mit gültigem Token (Reconnect) beitreten, nicht neu.
18. **Hot-Seat-Sichtschutz** nur bei geheimen Entscheidungen, damit Partien an einem Gerät flüssig bleiben.
19. **Bots** mit drei Stilen (Wissen, Politik, Sabotage). Sie treffen Fragen mit realistischer Quote (ca. 72 %, sinkt mit der Schwierigkeit) und nutzen einen eigenen Zufallsgenerator, damit sie den Spiel-Zufall nicht beeinflussen.
20. **Musik:** Jede Epoche hat ein deterministisch „komponiertes“ Stück (eigene Tonleiter, eigenes Tempo, eigene Instrumente und Rhythmen). Bei Duellen und Herausforderungen steigt die Spannung (schneller, mehr Percussion). Während der Minispiele wird die Musik abgesenkt.
21. **Barrierearm:** Jede Themenfarbe hat zusätzlich ein Symbol, jede Spielerfarbe eine Form (● ▲ ■ ◆ ★ ✚), die Schrift ist groß (Inter), Kontraste sind hoch, und „Bewegung reduzieren“ des Systems wird respektiert.
22. **Sprachen:** Alle Texte liegen in `js/i18n/de.js`, die Fragen unter `js/data/de/`. Eine neue Sprache braucht nur eine weitere Datei mit denselben Schlüsseln und einen Fragenordner.

### Version 2 (größeres Brett und Extras)
23. **Doppeltes Brett als Archipel:** Statt die sechs Inseln nur zu vergrößern, bekommt jede Epoche einen langen und einen kurzen Weg, einen Aussichtspfad und am Ausgang eine Dreifach-Wahl. Zwischen den Epochen liegen sechs Nebeninseln zum Inselhüpfen. So entstehen 175 Felder (vorher 79) und 19 Kreuzungen (vorher 13), und die Entscheidungen bleiben echte Abwägungen zwischen Zeit, Risiko und Belohnung.
24. **Zwei Würfel:** Ein doppelt so großes Brett würde mit einem Würfel jede Partie doppelt so lang machen. Zwei Würfel halten das Tempo und führen zu mehr Kreuzungen pro Zug. Als Extra bringt ein Pasch eine Karte. Rückenwind bedeutet jetzt drei Würfel, von denen die besten zwei zählen, und die Zeitsprung-Karten wurden entsprechend skaliert.
25. **Zwei neue Feldtypen:** Das **Archiv** liefert Karten-Nachschub, besonders für Saboteure. Der **Zeitstrom** ist eine Belohnung innerhalb des Fallenwegs. Beide brauchen keine zusätzliche Entscheidung und halten das Spieltempo hoch.
26. **Inselrat:** Auf dem größeren Brett wurden Parlamentsfelder in der Simulation zu selten betreten. Deshalb hat jede Nebeninsel ein zusätzliches Parlamentsfeld, und Anträge kommen wieder etwa doppelt so oft zur Abstimmung.
27. **Umfärben** wirkt nur auf die Hauptinsel einer Epoche, damit ein einzelner Antrag nicht 11 Felder auf einmal ändert.
28. **Performance:** Alle 174 Felder werden als InstancedMesh gezeichnet (Körper, Leuchtrand und Symbol aus einem Symbol-Atlas, also 3 Draw-Calls). Statische Wege und statisches Dekor werden pro Material zusammengeführt, und die Schattenkamera folgt dem Kamerafokus (scharfe Schatten trotz großem Brett).
29. **Versionierung:** Spielstände und Online-Räume tragen die Brett-Version im Schlüssel bzw. in der Peer-ID, sodass alte Spielstände nicht mit dem neuen Brett kollidieren. Der Service Worker lädt eigene Dateien jetzt „network-first“, damit Updates sofort ankommen; offline greift weiter der Cache.

---

## 📁 Projektstruktur

```
zeitsturm/
├── index.html, manifest.webmanifest, sw.js   PWA-Hülle
├── css/style.css                             Mobile-first-Design
├── icons/                                    prozedural erzeugte App-Icons
├── js/
│   ├── main.js                               Start
│   ├── core/      engine.js (Regeln), board.js (Brett), bots.js, content.js (Karten/Ereignisse/Anträge), rng.js
│   ├── data/de/questions/                    385 Fragen in 6 Themen
│   ├── render/    world.js (Renderer, Qualität), board3d.js (Inseln), pieces.js, dice.js, effects.js, textures.js
│   ├── audio/     audio.js (Effekte, Instrumente, Epochen-Musik)
│   ├── ui/        game.js (HUD), actions.js (Entscheidungen), questions.js, minigames.js, tutorial.js, info.js, dom.js
│   ├── app/       app.js (Menüs, Lobbys), session.js (Spielablauf), prefs.js (Speicher)
│   ├── net/       net.js (PeerJS-Host/Client, Reconnect)
│   └── i18n/      de.js (alle Texte)
├── sim/           simulate.mjs (Bot-Simulation), validate.mjs (Fragenprüfung)
└── tools/         serve.mjs (Testserver), check.mjs (Qualitätsprüfung), make-icons.mjs
```

---

## 💡 Mögliche Erweiterungen

- Weitere Sprachen (z. B. Englisch) samt übersetztem Fragenkatalog.
- Eigener TURN-Server für Online-Partien in sehr restriktiven Netzwerken.
- Zuschauer-Modus und Partie-Wiederholung (der deterministische Zustand macht das einfach).
- Mehr Inhalte: zusätzliche Fragenpakete, Anträge und Ereignisse oder ein Editor dafür.
- Ranglisten und Erfolge (benötigt einen kleinen Server oder Dienst).
- Native App-Store-Pakete über Capacitor oder TWA (Trusted Web Activity), basierend auf der vorhandenen PWA.
