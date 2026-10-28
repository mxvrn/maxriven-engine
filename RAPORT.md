# MAXRIVEN ENGINE — raport

Aplikacja w przeglądarce, która gra realistyczny dźwięk silnika spalinowego sterowany prędkością auta z GPS.
Zaprojektowana pod ekran Tesli (1920×1200, dotyk), działa też na Macu z wbudowanym symulatorem jazdy.

Stan na 28.10.2026: kod w repo `mxvrn/maxriven-engine` (gałąź `main`). Strona **https://mxvrn.github.io/maxriven-engine/**
działała z GitHub Pages, ale od kiedy repo jest **prywatne**, zwraca 404 — darmowe konto GitHub nie publikuje stron z prywatnych repo
(trzeba repo z powrotem upublicznić, wykupić GitHub Pro albo przenieść hosting). Każda poprawka = commit + push na `main`.

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

## Poprawki dźwięku — 28.10.2026

Dotyczy 6 silników z syntezatora (V12, V8 Flat-plane, V8 Muscle, R6 Turbo, B6 Bokser, V10).
**Bokser REAL nie był ruszany** i brzmi dokładnie tak samo jak przed zmianą (szczegóły niżej).

### Dlaczego na postoju było cicho
- Na jałowym syntezator „spalał” mało (niskie obciążenie) i przy niskich obrotach wydech daje mało impulsów na sekundę.
  Nic tego nie wyrównywało, więc postój był ok. 20 dB ciszej niż pełny gaz (w samym Chrome ok. −47 dBFS przy pomiarze tuż po starcie).
- Do tego jazda ze stałą prędkością (lekki gaz) brzmiała **jeszcze ciszej** niż postój — w 50 km/h nawet −42 dBFS.

**Co zmieniłem:**
- **Krzywa głośności silnika**: na jałowym i przy lekkim gazie silnik gra o 3–8 dB głośniej (osobno dobrane dla każdego silnika),
  a im więcej gazu i obrotów, tym ta pomoc mniejsza — przy pełnym gazie zero. Narasta powoli (0,45 s), więc zmiana biegu jej nie „pompuje”.
- **Łagodniejszy impuls wydechu przy małym obciążeniu** — dłuższy i miększy: więcej basu, mniej klikania na jałowym.
- **Lekki gaz nie brzmi słabiej niż postój** — przy jeździe ze stałą prędkością silnik pali co najmniej tyle co na jałowym.
- Pełny gaz został na tym samym poziomie (±0,5 dB), więc limiter pracuje tak jak wcześniej. Na postoju i w spokojnej jeździe
  szczyty są poniżej progu limitera — nic nie pompuje. Przegazówka na postoju działa jak przedtem (sprawdzone w teście i w próbkach).

### Skąd były szumy
Zmierzyłem każde źródło szumu osobno (wyłączałem je po kolei i patrzyłem, co znika z widma). Winowajcy:
1. **Szum zasysania (dolot)** — biały szum z wolno zmieniającą się głośnością, czyli **stała warstwa syku** od 1 do 16 kHz przy każdym gazie.
   To było główne źródło „dziwnego szumu” w jeździe. Teraz szum dolotu idzie **tylko w rytmie zapłonów cylindrów**, jest 2× cichszy
   i bez najwyższej góry.
2. **Stuk zaworów z białego szumu** — to on syczał powyżej 8 kHz na jałowym. Zastąpiony krótkim metalicznym „pyknięciem” rezonatora (bez szumu).
3. **Dwie stałe warstwy szumu** („blacha” 2,4 kHz przy odpuszczonym gazie i „syk mechaniki” 3,2 kHz) — **usunięte**, w prawdziwym silniku ich nie ma.
4. **Za jasne brzmienie** — za saturacją nie było żadnego filtra, góra spadała zbyt łagodnie. Dodałem drugi filtr dolnoprzepustowy,
   który stromo ucina pasmo powyżej brzmienia silnika.
5. Drobiazgi: szum „dmuchania” turbiny w R6 ciszej (gwizd turbiny został), szumowa część strzałów z wydechu bez najwyższej góry
   (huk został, syk przy zmianie biegu zniknął).

Sprawdziłem też podejrzenie **aliasingu z przesteru**: po zamianie przesteru na zwykłe wzmocnienie widmo zmienia się o mniej niż 0,3 dB —
przester pracuje prawie liniowo, więc to nie on szumiał i nadpróbkowanie nie było potrzebne.
Losowość na cykl (drobne różnice między zapłonami, falowanie jałowego, „lope” V8) została — to fizyczne i nie słychać jej jako szumu.

### Pomiary przed → po
Próbki renderowane offline tym samym kodem co w przeglądarce, **przez cały tor wyjściowy** (filtr, bas, EQ kabiny, głośność 75%, limiter).
Poziomy w dBFS (im bliżej zera, tym głośniej). **Syk** = ile dB energia powyżej 6 kHz jest pod całym dźwiękiem —
im bardziej ujemna liczba, tym czyściej.

| Silnik | Jałowy | Jazda 50 km/h | Pełny gaz 0–100 | Syk na jałowym | Syk w jeździe 120 | Syk na pełnym gazie |
|---|---|---|---|---|---|---|
| V12 | −36,5 → **−28,0** | −38,5 → **−26,8** | −17,3 → −16,9 | −26,4 → **−37,9** | −18,2 → **−37,5** | −15,6 → **−27,0** |
| V8 Flat-plane | −36,8 → **−27,3** | −40,0 → **−25,4** | −16,9 → −16,9 | −21,8 → **−29,9** | −14,7 → **−30,5** | −15,9 → **−23,1** |
| V8 Muscle | −34,0 → **−28,0** | −34,6 → **−25,8** | −16,7 → −16,6 | −30,0 → **−58,1** | −25,4 → **−55,8** | −23,5 → **−37,9** |
| R6 Turbo | −35,7 → **−28,0** | −37,5 → **−26,8** | −18,7 → −18,7 | −34,1 → **−52,0** | −29,3 → **−52,7** | −17,3 → **−18,2** |
| B6 Bokser | −38,6 → **−28,0** | −41,2 → **−26,2** | −17,3 → −16,9 | −17,3 → **−31,9** | −11,5 → **−36,0** | −16,2 → **−26,9** |
| V10 | −37,8 → **−28,0** | −42,3 → **−27,2** | −16,7 → −16,2 | −19,4 → **−25,6** | −13,7 → **−27,6** | −14,3 → **−20,2** |
| Bokser REAL (odniesienie) | −25,4 | −24,9 | −17,2 | −58,2 | −31,2 | −28,9 |

- Postój: z ok. −34…−39 do **−27…−28 dBFS**, czyli ok. 11 dB ciszej niż pełny gaz (było ok. 20 dB). W prawdziwym Chrome
  autotest mierzy teraz na jałowym **−27…−29 dBFS** dla każdego z 6 silników.
- Jazda 50 km/h: z −35…−42 do **−25…−27 dBFS** — już nie ciszej niż postój.
- Syk w jeździe 120 km/h: **o 14–30 dB mniej** (np. B6 Bokser: z −11,5 do −36 dB pod dźwiękiem), na pełnym gazie o 7–14 dB mniej (poza R6, niżej).
- R6 Turbo na pełnym gazie prawie bez zmiany w „syku”, bo powyżej 6 kHz jest tam **gwizd turbiny** — to dźwięk, nie szum
  (bez turbo ta wartość wynosiłaby ok. −36 dB). Sam szum dmuchania turbiny jest ciszej.
- V10 i V8 Flat-plane zostały najjaśniejsze — to ich charakter (krzyk, metal). V8 Muscle dalej bulgocze i lopuje na jałowym.

### Bokser REAL — bez zmian
Kod odtwarzania nagrania, jego preset i tor wyjściowy (`js/audio.js`) nie były ruszane. Wszystkie 5 próbek Boksera REAL
„przed” i „po” są **identyczne co do bitu** (porównanie plików), poziomy też: jałowy −25,4, jazda 50 km/h −24,9, pełny gaz −17,2 dBFS.

### Czego posłuchać najpierw (folder `probki-dzwiek/`, tylko na Macu — nie idzie na GitHuba)
W `przed/` i `po/` są te same nazwy plików, więc łatwo porównać:
1. `v12-gaz0_100.wav` — najlepiej słychać zniknięcie syku przy rozpędzaniu.
2. `b6-jazda120.wav` — stała jazda: było syczenie w tle, teraz czysty silnik.
3. `b6-jalowy.wav` i `v8cp-jalowy.wav` — postój: głośniej, pełniej, bez syku; V8 Muscle dalej „bububu”.
4. `r6t-przegazowka.wav` — przegazówka z turbo i blow-off.
5. `b4r-gaz0_100.wav` — Bokser REAL jako punkt odniesienia czystego tła.

Narzędzie: `node tools/probki.js probki-dzwiek/po` (sceny: jałowy, przegazówka, jazda 50 i 120 km/h, pełny gaz 0–100; pomiary w `pomiary.json`).

---

## 5. Co sprawdziłem

Automatyczny test (`tools/selftest.js`) otwiera `index.html` **z dysku (file://) w prawdziwym Chrome na Macu**
i klika jak człowiek. Wynik: **49/49 testów OK, 0 błędów w konsoli**. Sprawdza m.in.:
- że prawdziwe nagranie (Bokser REAL) dekoduje się i gra (poziom na wyjściu ok. −14 dBFS w jeździe),
- start dźwięku i to, że w syntezie gra **właściwy** silnik po każdej zmianie,
- przegazówkę na postoju dla każdego silnika, 0–100 dla każdego silnika (biegi, obroty, prędkość),
- rozkręcanie turbo w R6, poziom sygnału na wyjściu (jazda do ok. −14 dBFS),
- że każdy silnik z syntezatora jest wyraźnie słyszalny na postoju (po poprawkach −27…−29 dBFS),
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
- **Tesla nieprzetestowana** — strona była na https, ale przy prywatnym repo GitHub Pages jej nie serwuje (patrz góra raportu). Do sprawdzenia na miejscu: czy przeglądarka Tesli gra dźwięk strony
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
| `tools/probki.js` | próbki odsłuchowe przez cały tor wyjściowy + pomiary poziomu i syku (`node tools/probki.js probki-dzwiek/po`) |
| `tools/serve.js`, `tools/embed-font.js` | lokalny serwer testowy, osadzanie fontu logo |

Bez frameworków i bez CDN, zwykłe skrypty (moduły ES nie działają z file://).
