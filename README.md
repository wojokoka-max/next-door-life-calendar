# Next Door Callendar

Kalendarz całego życia — nie tylko spotkań. Wydarzenia, zadania, przypomnienia
i oś czasu, która z każdym rokiem staje się cenniejsza.

**Aplikacja osobista.** Bez kont, bez logowania, bez serwera i bez bazy w chmurze.
Wszystko zapisuje się w pamięci przeglądarki na tym urządzeniu, na którym jest
używane. Dane nigdzie nie wychodzą.

## Uruchomienie

```bash
npm install
npm run dev
```

## Wdrożenie

Podłącz repozytorium w panelu Vercel. Nie ma nic do skonfigurowania.

Na telefonie dodaj stronę do ekranu głównego — dopiero wtedy otwiera się
bez paska przeglądarki i zachowuje jak aplikacja.

## Dwie rzeczy, o których trzeba wiedzieć

### Dane żyją na urządzeniu

Nie synchronizują się między telefonem a komputerem. Zgubiony telefon,
wyczyszczona pamięć przeglądarki albo odinstalowana aplikacja oznaczają utratę
wszystkiego, czego nie ma w kopii zapasowej.

Dlatego eksport kopii to nie dodatek, tylko jedyne zabezpieczenie. Aplikacja
przypomni o nim, gdy minie czternaście dni od ostatniego. Plik jest zwykłym
JSON-em — da się go odczytać nawet bez tej aplikacji.

Wczytanie kopii **scala**, nie zastępuje: rekord zostaje nadpisany tylko wtedy,
gdy w pliku jest nowszy. Wczytanie starej kopii nie cofa nowszych zmian, a przenosiny
na nowy telefon to eksport tu, import tam.

### Przypomnienia działają tylko przy otwartej aplikacji

To jest realny koszt rezygnacji z serwera. Powiadomienie, które ma zadzwonić
o siódmej rano, wymaga czegoś, co obudzi telefon o siódmej rano — a strona
internetowa tego nie potrafi. Na iOS nie potrafi tego w ogóle.

Aplikacja pokazuje więc zaległe przypomnienia przy otwarciu i powiadamia
w trakcie działania. Jeśli któryś termin naprawdę nie może umknąć, wyeksportuj
go do pliku ICS i wczytaj do kalendarza systemowego w telefonie — tam alarmy
są obsługiwane przez system i zadzwonią niezależnie od tego, co robi przeglądarka.

## Testy

```bash
npm test
```

83 testy obejmujące moduły, w których najłatwiej o cichy błąd:

| Moduł | Zakres | Testy |
|---|---|---|
| `lib/recurrence.ts` | rozwijanie serii, wyjątki, wolne terminy, konflikty | 18 |
| `lib/iso-week.ts` | numeracja tygodni ISO 8601 | 19 |
| `lib/lifecycle.ts` | kosz, archiwum, widoczność, czyszczenie | 19 |
| `lib/holidays.ts` | święta polskie, w tym daty ruchome | 27 |

Testy pilnują między innymi tego, że:

- seria „codziennie o 9:00" zachowuje godzinę **lokalną** przez zmianę czasu,
  więc jej czas UTC przesuwa się o godzinę;
- każde wystąpienie cyklu miesięcznego liczy się od daty startu, a nie od
  poprzedniego wystąpienia — inaczej seria od 31 grudnia gubi się na lutym
  i zostaje na 28. dniu;
- 1 stycznia 2027 należy do tygodnia **53 roku 2026**;
- archiwum nigdy nie wygasa, a kosz czyści się po trzydziestu dniach;
- Wielkanoc wypada w niedzielę w każdym roku od 1900 do 2099 i mieści się
  w przedziale 22 III – 25 IV, a wszystkie daty ruchome liczą się od niej.

## Struktura

```
app/            trasy Next.js, manifest PWA, motywy
components/     widoki kalendarza
lib/store.ts    pamięć urządzenia (IndexedDB)
lib/backup.ts   eksport i import kopii
lib/holidays.ts święta — wyliczane, nie zapisywane
lib/            moduły objęte testami
prototypes/     prototypy HTML — do wglądu, poza budową
tests/          pakiety testowe
```

## Decyzje warte znajomości

- **Bez serwera i bez kont.** Aplikacja dla jednej osoby nie potrzebuje logowania.
- **Bez AI w czasie działania.** Wszystkie funkcje „inteligentne" są deterministyczne.
- **Wystąpienia serii nie są zapisywane** w pamięci. Rozwijane są przy odczycie.
- **Nic nie jest usuwane od razu.** Kosz znika ze wszystkiego i czyści się po
  trzydziestu dniach; archiwum znika z kalendarza, ale zostaje na osi życia na zawsze.
- **Święta są wyliczane, nie zapisywane.** Nie zaśmiecają danych, nie trafiają
  do kopii zapasowej ani na oś życia. Cztery zbiory do włączania osobno:
  ustawowo wolne, kościelne, zwyczajowe, rocznice i dni pamięci.
- **Numery tygodni są zawsze poniedziałkowe.** Ustawienie „pierwszy dzień tygodnia"
  zmienia wyłącznie układ siatki, nigdy numerację.
