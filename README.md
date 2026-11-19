# Giełda plotek

Gra na zajęcia z Technologii Blockchain (PWr): sala dostaje 14 newsów o fikcyjnym tokenie MUALA z różnych źródeł (prawdziwe, fałszywe konta, literówki w domenach, reklamy, plotki, stare newsy) i na telefonach decyduje: kup, trzymaj albo sprzedaj. Rynek reaguje na news od pierwszej sekundy: kto szybciej trafnie zareaguje, kupi taniej albo sprzeda drożej (cena transakcji przesuwa się w stronę nowej ceny z każdą sekundą, do 70% ruchu na koniec czasu). Każda transakcja kosztuje 2% prowizji. Po każdym newsie telefon pokazuje werdykt i wynik gracza, a ekran prowadzącego podświetla, na co trzeba było patrzeć. Jedna plotka ma losowy wynik. Wygrywa najwyższa wartość portfela.

Token, giełda, portale, konta i osoby w grze są fikcyjne.

## Pliki

- `host.html` – ekran prowadzącego (rzutnik): kod QR, newsy, wykres ceny, ranking
- `index.html` – strona dla telefonów (otwiera się z kodu QR)
- `news.js` – treść newsów (tu można je zmieniać)
- `lib/` – biblioteki MQTT i kodu QR (bez internetowych CDN)

Komunikacja idzie przez publiczny serwer MQTT (HiveMQ, w razie awarii EMQX lub Mosquitto). Nie trzeba niczego instalować ani zakładać kont poza GitHubem.

## Wystawienie na GitHub Pages

1. Na github.com kliknij **New repository**, nazwa np. `gielda-plotek`, ustaw **Public**, kliknij **Create repository**.
2. Kliknij **uploading an existing file**, przeciągnij całą zawartość folderu (razem z folderem `lib`), kliknij **Commit changes**.
3. Wejdź w **Settings → Pages**. W **Branch** wybierz `main` i folder `/ (root)`, kliknij **Save**.
4. Po 1–2 minutach strona będzie pod adresem `https://TWOJ-LOGIN.github.io/gielda-plotek/`.
5. Ekran prowadzącego: `https://TWOJ-LOGIN.github.io/gielda-plotek/host.html`

## Na zajęciach

1. Otwórz `host.html` na komputerze podpiętym do rzutnika (najlepiej F11, pełny ekran).
2. Sala skanuje kod QR i wpisuje nicki. Lista graczy pojawia się na ekranie.
3. **Start gry**. Każdy news ma 15 sekund na decyzję (dwa newsy PILNE: 8 i 10 sekund), potem wynik pojawia się sam.
4. Spacja albo strzałka w prawo: następny krok (odkrycie albo kolejny news).
5. Po 14 newsach podium i zwycięzca (cała gra około 7 minut). **Zakończ grę** kończy wcześniej.

Opcje w adresie `host.html`:

- `?t=20` – 20 sekund na decyzję zamiast 15
- `?local=1` – próba na jednym komputerze w kilku kartach przeglądarki, bez internetu

## Przed zajęciami

Zrób próbę w sali albo na tej samej sieci Wi-Fi: otwórz `host.html` na laptopie i dołącz z dwóch telefonów. Jeśli sieć uczelni blokuje połączenie (napis „Brak połączenia z serwerem gry”), podłącz laptop do hotspotu z telefonu. Telefony graczy mogą być na danych komórkowych.

Odświeżenie ekranu prowadzącego nie kasuje gry (stan trzyma się 3 godziny). **Nowy pokój** albo **Nowa gra** zaczyna od zera, więc po próbie przed zajęciami kliknij **Nowy pokój**.
