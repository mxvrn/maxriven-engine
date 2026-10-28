# MAXRIVEN ENGINE — raport

Aplikacja w przeglądarce, która gra realistyczny dźwięk silnika spalinowego sterowany prędkością auta z GPS.
Zaprojektowana pod ekran Tesli (1920×1200, dotyk), działa też na Macu z wbudowanym symulatorem jazdy.

Stan na 28.10.2026: opublikowana na **https://mxvrn.github.io/maxriven-engine/** (GitHub Pages, repo `mxvrn/maxriven-engine`).
Każda poprawka = commit + push na `main`; strona odświeża się po ok. minucie.

---

## 1. Jak uruchomić (bez Terminala)

**Na Macu**
1. Otwórz folder `MAXRIVEN-Engine` na Biurku.
2. Kliknij dwa razy plik **`index.html`**. Otworzy się w przeglądarce.
   Najlepiej w **Google Chrome** — w nim wszystko jest sprawdzone. Jeśli otwiera się w innej przeglądarce:
   prawy klik na `index.html` → *Otwórz za pomocą* → *Google Chrome*.
3. Wybierz silnik (karta) i dotknij **START**. Dźwięk startuje dopiero po tym dotknięciu — tak wymagają przeglądarki.
4. Na Macu włącz u góry **SYMULATOR** i jedź suwakami albo gotowymi scenariuszami.

**W Tesli** — wymaga publikacji strony pod adresem `https://…` (przeglądarka Tesli nie otworzy pliku z dysku,
a GPS w przeglądarkach działa tylko na stronach https). To ustalamy w kolejnym etapie.

**Podgląd projektów ekranu** — plik `podglad.html` pokazuje wszystkie 5 wariantów zegarów (A–E) obok siebie.

---

## 2. Co potrafi

### Ekran 1 — wybór silnika
Sześć dużych kart, zaznaczona ma fioletową obwódkę. Wybór jest zapamiętywany. Pod spodem przycisk **START**.

### Ekran 2 — jazda (zegary w stylu 991 GT3 RS z żółtymi tarczami)
- **Obrotomierz** pośrodku: czerwone pole dopasowane do silnika, pomarańczowa wskazówka,
  okienko z biegiem, wskaźnik P R N D, cyfrowa prędkość w dolnym pasku, trójkąt zmiany biegu (zapala się przy czerwonym polu).
- **Prędkościomierz** z lewej (do 350 km/h) z licznikiem przejazdu i średnią prędkością z tej jazdy.
- **Ekran danych** z prawej: gaz, woda (albo doładowanie w R6 Turbo), olej, ciśnienie oleju, godzina.
- **GPS / SYMULATOR** — przełącznik źródła prędkości. Status GPS w prawym górnym rogu (np. „GPS ±5 M”).
- **DŹWIĘK** — głośność, bas (−6…+9 dB), korekcja pod głośniki kabiny. Ustawienia są zapamiętywane.
- **TRZYMAJ, ABY PRZEGAZOWAĆ** — na postoju: trzymasz = gaz w podłogę, puszczasz = obroty opadają z realną bezwładnością,
  przy odpuszczeniu z wysokich obrotów strzela z wydechu. W ruchu przycisk jest wyszarzony.
- **STOP** — wycisza i wraca do wyboru silnika.
- Ekran nie gaśnie podczas jazdy (Wake Lock), a dźwięk sam wraca po uśpieniu karty lub przełączeniu aplikacji.

### Symulator (do testów bez jazdy)
- Suwak **prędkości docelowej** (0–250 km/h) i suwak **gazu** (jak mocno auto do niej dąży).
- Scenariusze: **0–100 ostro**, **Spokojne miasto**, **Autostrada 120**, **Hamowanie do zera**, oraz **Postój**.
- **Test GPS 1 Hz** — zamiast idealnej prędkości symulator podaje „zaszumiony GPS raz na sekundę”,
  żeby było słychać, jak filtr wygładza dane z prawdziwego GPS.

---

## 3. Silniki (presety)

| Silnik | Budowa | Czerwone pole | Skrzynia | Brzmienie |
|---|---|---|---|---|
| **Bokser REAL** ⭐ | **prawdziwe nagranie**: płaska czwórka 2.0 (Scion FR-S) na hamowni | 7 400 | 6 manualna | Nie syntezator — oryginalny dźwięk silnika od ok. 1 800 do 7 500 obr., odtwarzany według obrotów. |
| **V12** | 60°, 6.5 l, wolnossący, zapłon co 60° | 8 900 | 7 DCT | Gładki, gęsty, „śpiewający”. Jedwab na dole, wysoki chór na górze. |
| **V8 Flat-plane** | płaski wał, 4.5 l, zapłon równy na rząd | 9 000 | 7 DCT | Wysoki, metaliczny wrzask, ostry jak brzytwa. |
| **V8 Muscle** | krzyżowy wał, 6.2 l, kolejność 1-8-7-2-6-5-4-3 | 6 500 | 6 manualna | Niski bulgot („bububu”) z nierównych impulsów na rząd, lopujący jałowy, dłuższe zmiany biegów jak w manualu. |
| **R6 Turbo** | rzędowa szóstka 3.0, turbo | 7 000 | 8 automat | Gładki, jedwabisty rząd; gwizd turbiny rośnie z doładowaniem, syk blow-off po zdjęciu nogi z gazu. |
| **B6 Bokser** | płaska szóstka 4.0, wolnossąca | 9 000 | 7 DCT | Metaliczny, mechaniczny, chrapliwy dolot, bardzo szybko wkręca się na obroty. |
| **V10** | 90°, 5.2 l, równy zapłon co 72° | 9 400 | 6 DCT | Ostry, przenikliwy krzyk, najbliżej bolidu z dawnej F1. |

---

## 4. Jak to działa (w skrócie)

**Dźwięk** powstaje na żywo (AudioWorklet), bez nagrań:
- **Zapłony cylindrów** zgodnie z prawdziwą kolejnością i kątami wału — stąd różnica między płaskim a krzyżowym V8.
  Każdy cylinder ma lekko inny charakter, a każdy cykl drobną losowość (żywy silnik, nie maszyna).
- **Wydech**: kolektory każdego rzędu, rura i tłumik jako rezonatory (falowody + filtry formantowe), stereo jak dwie końcówki.
- **Dolot**: rezonans puszki powietrza i szum zasysania pulsujący w rytm cylindrów.
- **Mechanika**: zawory, łańcuch rozrządu, szum rosnący z obrotami.
- **Obciążenie**: przy gazie pełniej i agresywniej, bez gazu ciszej i „pusto”.
- **Strzały z wydechu** przy odpuszczaniu i zmianach biegów — losowe, nigdy zapętlone.
- **Turbo** (R6): doładowanie z opóźnieniem, gwizd zależny od obrotów turbiny, blow-off.
- **Ogranicznik**: odcina zapłon, obroty skaczą przy limicie. **Jałowy** lekko faluje.
- Wszystkie parametry zmieniają się płynnie — bez trzasków. Na wyjściu: filtr 28 Hz, bas, korekcja kabiny,
  limiter i miękkie ograniczenie szczytów (nie przesterowuje).

**Prędkość z GPS**: przeglądarka daje pozycję ok. raz na sekundę. Filtr Kalmana przewiduje prędkość 60 razy na sekundę,
a korekty z GPS rozkłada w czasie, więc obroty nie skaczą schodkami. Gdy GPS nie podaje prędkości, liczona jest z kolejnych pozycji.
Z przyspieszenia szacowany jest „gaz”: przyspieszanie = gaz, stała jazda = lekki gaz, zwalnianie/rekuperacja = hamowanie silnikiem.

**Wirtualna skrzynia**: przełożenia i przełożenie główne dla każdego silnika, ruszanie na półsprzęgle,
zmiana w górę wcześnie przy spokojnej jeździe i pod czerwonym polem przy ostrej, krótkie odcięcie zapłonu przy zmianie,
redukcja z przegazówką, kickdown przy wciśnięciu gazu.

---

### Bokser REAL — silnik z prawdziwego nagrania

Pozostałe silniki są w całości syntezowane i dlatego brzmią trochę „elektronicznie”. Bokser REAL gra **prawdziwe nagranie**:
- Źródło: Freesound #183654 „DynoJet Scion FR-S” (autor dezoris), licencja **CC0** — wolno go używać i publikować.
  Z nagrania wycięty jest odcinek wkręcania pod pełnym obciążeniem (`js/samples.js`, MP3 osadzone w pliku, ok. 0,5 MB).
- Obroty w nagraniu zmierzyłem z harmonicznych silnika (co 20 ms; dopasowanie z błędem ok. 30 obr/min).
- W czasie jazdy co ok. 18 ms startuje krótki (70 ms) „ziarenko” nagrania z miejsca, w którym silnik miał dokładnie takie obroty,
  jakie ma teraz wirtualny silnik. Ziarenka nakładają się płynnie — to synteza granularna, tak jak w grach wyścigowych.
- Bez gazu dźwięk ciemnieje i cichnie (hamowanie silnikiem), na jałowym silnik nadal „pali”.

Ograniczenia: poniżej ~1 800 obr. (jałowy) nagranie jest odtwarzane wolniej, więc brzmi niżej i trochę „taśmowo”;
odpuszczenie gazu to to samo nagranie przyciemnione (brak osobnego nagrania hamowania silnikiem); brak strzałów z wydechu.
Lepszy efekt da nagranie konkretnego auta (np. Porsche) — wtedy wystarczy podmienić plik i mapę obrotów (`tools/embed-sample.js`).

---

## 5. Co sprawdziłem

Automatyczny test (`tools/selftest.js`) otwiera `index.html` **z dysku (file://) w prawdziwym Chrome na Macu**
i klika jak człowiek. Wynik: **43/43 testów OK, 0 błędów w konsoli**. Sprawdza m.in.:
- że prawdziwe nagranie (Bokser REAL) dekoduje się i gra (poziom na wyjściu ok. −14 dBFS w jeździe),
- start dźwięku i to, że w syntezie gra **właściwy** silnik po każdej zmianie,
- przegazówkę na postoju dla każdego silnika, 0–100 dla każdego silnika (biegi, obroty, prędkość),
- rozkręcanie turbo w R6, poziom sygnału na wyjściu (jałowy ok. −47 dBFS, jazda ok. −15 dBFS),
- wszystkie scenariusze, panel dźwięku z zapamiętywaniem, test GPS 1 Hz (płynność),
- tryb GPS z podstawioną jazdą 72 km/h (prędkość liczona z pozycji), wznowienie dźwięku po uśpieniu.

Dodatkowo `tools/render.js` renderuje próbki każdego silnika offline i mierzy poziomy, szczyty i NaN (wszystkie czyste).

Błędy znalezione i naprawione w trakcie:
- Chrome z pliku (file://) **blokuje worklet z Blob URL**. Kod workletu jest teraz ładowany jako `data:` URL, z Blobem jako zapasem —
  efekt ten sam: działa po dwukliku, bez serwera.
- Po STOP i START z innym silnikiem synteza potrafiła zostać na poprzednim — naprawione i pilnowane testem.
- Korekty GPS dawały skoki ok. 7 km/h — po wygładzeniu wyjścia filtra ok. 3 km/h na 0,3 s, czyli tyle, ile wynosi samo przyspieszenie.

---

## 6. Znane ograniczenia

- **Brzmienia nie ocenia test** — mierzy poziomy i poprawność, ale „czy brzmi jak prawdziwy V12” ocenia tylko ucho. Czekam na uwagi.
- **Tesla nieprzetestowana** — strona jest już na https. Do sprawdzenia na miejscu: czy przeglądarka Tesli gra dźwięk strony
  w czasie jazdy, czy pozwala na GPS i Wake Lock, i jak głośno wychodzi z głośników kabiny.
- **Safari nieprzetestowane** automatycznie (test działa w Chrome). Powinno działać, ale pewne jest tylko w Chrome.
- **GPS z pliku na Macu** — Chrome może pytać o zgodę na lokalizację lub jej odmówić dla plików z dysku; w aucie i tak będzie https.
- **Gaz jest szacowany** z przyspieszenia GPS, więc reaguje z opóźnieniem ok. 0,3–1 s i nie wie o górkach.
- **Temperatury i ciśnienie oleju na zegarach to atrapy** wyliczane z symulacji (Tesla ich nie podaje). Gaz, obroty, bieg i prędkość są prawdziwe.
- **Font**: na Macu jest Avenir Next; w Tesli przeglądarka użyje swojego bezszeryfowego fontu (logo Ethnocentric jest wbudowane).
- Zegary są **w stylu** 991 GT3 RS — bez logo i herbu Porsche.

---

## 7. Propozycje ulepszeń

1. **Tryb aplikacji (PWA)**: pełny ekran w Tesli, działanie offline, ikonka na ekranie.
2. **Strojenie brzmienia** według Twoich uwag (osobne pokrętła: strzały, dolot, turbo, „lope” jałowego).
3. **Wbudowany font geometryczny** (licencja OFL, np. Jost), żeby Tesla wyglądała identycznie jak Mac.
4. **Więcej silników**: rotary (Wankel), V6 biturbo, R5 turbo, boxer 4 turbo z „bulgotem”.
5. **Pogłos/akustyka kabiny** (krótka odpowiedź impulsowa) i tryb „zewnętrzny” (słychać jak z zewnątrz auta).
6. **Kolory tarcz** do wyboru: Racing Yellow, czarne z żółtymi wskazówkami, białe, czerwone.
7. **Lepsze szacowanie gazu** z dodatkowych danych (np. czujnik ruchu urządzenia, jeśli przeglądarka Tesli go udostępni).

---

## 8. Dla programisty — pliki

| Plik | Co robi |
|---|---|
| `index.html`, `css/app.css`, `js/app.js` | aplikacja: wybór silnika, ekran jazdy, panel dźwięku |
| `js/worklet.js` | synteza silnika (AudioWorklet, jedna funkcja ładowana jako moduł z `data:`/Blob URL) + odtwarzanie granularne nagrań |
| `js/audio.js` | kontekst audio, tor wyjściowy (HP, EQ, limiter), wznawianie, Wake Lock |
| `js/presets.js` | 7 silników: kolejność zapłonu, rezonanse, skrzynia (Bokser REAL: nagranie + skrzynia) |
| `js/samples.js`, `tools/embed-sample.js` | prawdziwe nagranie (MP3 w base64) z mapą obrotów; generator wycinka z nagrania źródłowego |
| `js/drive.js` | skrzynia biegów, obroty, odcięcie, szacowanie gazu |
| `js/gps.js` | GPS + filtr Kalmana z wygładzonym wyjściem |
| `js/sim.js` | symulator auta i scenariusze |
| `js/controller.js` | pętla 60 Hz łącząca wszystko |
| `js/cluster.js` | zegary w stylu 991 GT3 RS (SVG) |
| `podglad.html`, `js/podglad.js`, `css/podglad.css` | podgląd 5 wariantów ekranu |
| `tools/selftest.js` | autotest w Chrome przez file:// (`node tools/selftest.js`, `--show` = widoczne okno) |
| `tools/render.js` | próbki WAV offline + pomiary (`node tools/render.js`) |
| `tools/serve.js`, `tools/embed-font.js` | lokalny serwer testowy, osadzanie fontu logo |

Bez frameworków i bez CDN, zwykłe skrypty (moduły ES nie działają z file://).
