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

### Workflow Blendera (własne sceny, modele, postacie)

Aplikacja renderuje z ACES tone mappingiem, bloomem (desktop) i nocnym IBL —
Twoje assety PBR z Blendera wyglądają w niej jak w silniku gry.

1. **Materiały**: buduj na **Principled BSDF** (kolor, metallic, roughness,
   normal, emisja) — to przenosi się do glTF 1:1. Proceduralne node'y
   **wypiecz do tekstur** (Bake) przed eksportem.
2. **Animacje**: szkielety/keyframe'y przenoszą się; wszystkie klipy grają
   automatycznie po załadowaniu.
3. **Eksport**: File → Export → glTF 2.0 (.glb), z zaznaczonym Apply Modifiers.
4. **Podgląd 1:1** (odpowiedź na „skąd wiem, jak to wygląda naprawdę"):
   otwórz `?scene=preview` i **przeciągnij plik .glb na okno** — widzisz model
   dokładnie tak, jak wyrenderuje go aplikacja (ten sam tone mapping/bloom/IBL).
   Można też podać ścieżkę: `?scene=preview&model=models/plik.glb`.
5. **Wpięcie do świata**:
   - pojedyncze propy — sekcja `scene.models` w JSON świata:

```json
"models": [
  { "file": "models/arcturian-temple.glb", "position": [0, 0, -20], "rotationYDeg": 45, "scale": 2 }
]
```

   - **cała scena z Blendera** zamiast proceduralnego terenu — `scene.sceneFile`:

```json
"sceneFile": "models/arcturia-scene.glb"
```

   (niebo, mgła, panel wiedzy i dźwięk nadal pochodzą z JSON-a).

**Budżet Questa 2**: trzymaj sceny ≤ ~100 k trójkątów, tekstury ≤ 2K,
liczba materiałów możliwie mała (każdy materiał = draw call).

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

Tekstura normalnych wody: `waternormals.jpg` z przykładów
[three.js](https://github.com/mrdoob/three.js) (licencja MIT).
Nocne HDRI (IBL): pakiet [@pmndrs/assets](https://github.com/pmndrs/assets)
(CC0). Pozostałe tekstury i modele generowane proceduralnie w aplikacji.

Treści o Arkturianach mają charakter kulturowo-ezoteryczny (Edgar Cayce,
Norma J. Milanovich „We, the Arcturians”); nie są twierdzeniami naukowymi.
