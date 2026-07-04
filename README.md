# AstroAway

Aplikacja WebXR: stoisz nocą na plaży pod **astronomicznie dokładnym niebem**
(prawdziwe pozycje gwiazd dla Twojej lokalizacji i bieżącego czasu), wybierasz
oznaczoną gwiazdę — w MVP **Arktur** (Arcturus) — przelatujesz przez sekwencję
warp i lądujesz na świecie Arkturian z panelem wiedzy o tej rasie.

Aplikacja jest jednocześnie uporządkowaną, rozszerzalną bazą wiedzy o rasach,
światach i wymiarach: każdy świat to plik JSON, dodawany bez zmian w kodzie.

## Szybki start

```bash
npm install
npm run dev          # http://localhost:5173
```

Sterowanie (desktop): przeciągnij myszą — rozglądanie; kliknij oznaczoną
gwiazdę — podróż; **WASD** — chodzenie po planecie.

Parametry URL: `?lat=52.23&lon=21.01` (lokalizacja), `?time=2026-07-03T22:00:00Z`
(zamrożony czas), `?scene=beach|travel|arcturus`, `?yaw=245&pitch=35`
(początkowy kierunek patrzenia, azymut/wysokość w stopniach).

## VR (Meta Quest)

Aplikacja używa WebXR — na goglach otwórz adres aplikacji w przeglądarce Quest
i naciśnij **ENTER VR**. Uwaga: WebXR wymaga **HTTPS** (lub `localhost`).
Najprościej: opublikuj build (`npm run build` → katalog `dist/`) na dowolnym
hostingu statycznym (GitHub Pages, Vercel, Netlify) i otwórz URL na goglach.
Przy pracy lokalnej z Questem po USB: `adb reverse tcp:5173 tcp:5173`
i otwórz `http://localhost:5173` na goglach.

Wskazujesz kontrolerem (promień), spust = wybór. Podczas warpa działa
winieta komfortu ograniczająca chorobę symulatorową.

## Dodawanie nowych światów (np. Tjehoobe)

1. Skopiuj `public/data/worlds/arcturus.json` jako `public/data/worlds/tjehoobe.json`.
2. Zmień `id`, `name`, dane gwiazdy (`star`), opis rasy (`race.lore`) i wygląd
   sceny (`scene`: paleta, niebo, teren, kryształy, mgła).
3. Dopisz plik do `public/data/index.json`.

Po odświeżeniu nowy cel pojawia się na niebie nad plażą, a scena planety
generuje się proceduralnie z parametrów — zero zmian w kodzie.

### Własne modele 3D (Blender → glTF)

Zrób model w Blenderze (albo pobierz `.glb` np. ze Sketchfab), wrzuć do
`public/models/` i dopisz w sekcji `scene.models` świata:

```json
"models": [
  { "file": "models/arcturian-temple.glb", "position": [0, 0, -20], "rotationYDeg": 45, "scale": 2 }
]
```

## Weryfikacja / testy

```bash
npm test             # matematyka astro vs astronomy-engine + walidacja schematu
npm run verify:sky   # pozycje gwiazd w przeglądarce vs wyrocznia (< 0.2°)
npm run verify:shots # screenshoty scen + pełny przelot E2E (klik → warp → powrót)
```

Skrypty weryfikacyjne używają headless Chromium (SwiftShader); zrzuty lądują
w `shots/`.

## Regeneracja katalogu gwiazd

Skompilowany katalog (`public/data/stars.bin`, ~2 900 gwiazd do mag 5,5 +
`stars-index.json` z nazwanymi gwiazdami) jest commitowany. Aby zbudować od nowa:

```bash
npm run stars:fetch  # pobiera HYG CSV do data-src/
npm run stars:build  # kompiluje do public/data/
```

## Architektura (skrót)

- `src/astro/` — czysta matematyka: czas gwiazdowy, RA/Dec→Alt/Az, kwaternion
  orientacji całej sfery niebieskiej (jeden obrót na klatkę, jeden draw call
  na całe niebo). Testowana przeciwko `astronomy-engine`.
- `src/sky/` — pole gwiazd (THREE.Points + shader: jasność z magnitudo, barwa
  z indeksu B–V), kopuła nieba, picking kątowy celów.
- `src/scenes/` — plaża / warp / generyczny świat obcych (w pełni z JSON).
- `src/input/` — wspólna abstrakcja promienia i wyboru dla myszy i kontrolerów XR.
- `src/data/` — schemat i loader bazy wiedzy.

## Atrybucja

Katalog gwiazd: [HYG Database](https://github.com/astronexus/HYG-Database)
(David Nash, licencja **CC BY-SA**). Pozycje J2000; pominięto precesję
(~0,35° w latach 2020-tych — niezauważalne gołym okiem).

Treści o Arkturianach mają charakter kulturowo-ezoteryczny (Edgar Cayce,
Norma J. Milanovich „We, the Arcturians”); nie są twierdzeniami naukowymi.
