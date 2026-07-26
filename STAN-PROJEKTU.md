# Next Door Callendar — stan projektu

Dokument nadrzędny. **Zastępuje** `life-calendar-spec.md` i `przeglad-uzupelnien.md`,
które powstały przed kilkoma decyzjami i miejscami są już nieaktualne. Jeśli coś
się rozjeżdża, obowiązuje ten plik.

Wszystko poniżej jest gotowe do przekazania Claude Code jako kontekst startowy.

---

## Decyzje, które zapadły

Te rozstrzygnięcia zmieniają założenia z pierwotnego README. Kolejność chronologiczna.

1. **Bez AI w czasie działania aplikacji.** Żadnego zewnętrznego modelu w runtime.
   Wszystkie funkcje „inteligentne" realizowane deterministycznie. AI, jeśli kiedyś
   wróci, wyłącznie jako opcjonalny dodatek — aplikacja musi działać w pełni bez niego.

2. **Dodawanie przez listy wyboru, nie przez pisanie zdań.** Tytuł plus bębny:
   data (dzień/miesiąc/rok), powtarzanie, godzina, przypomnienie, waga.
   Parser języka naturalnego został napisany i przetestowany, ale **nie wchodzi
   do wersji pierwszej** — bęben nie pozwala wybrać niejednoznacznej godziny,
   a pisanie pozwalało.

3. **Bez kategorii.** Grupowanie opiera się na tagach (`tags text[]`), które i tak
   były w schemacie. Kategorie i kalendarze to były dwa nakładające się pojęcia.

4. **Skala: kalendarz jednej osoby, nie dziesiątki tysięcy wpisów.** Odpada podział
   na serie cykliczne i jednorazowe, cache okien i jego unieważnianie. Klient trzyma
   dane w pamięci i rozwija serie swobodnie.

5. **Usuwanie ma dwa cele: kosz albo archiwum.** Kosz znika ze wszystkiego łącznie
   z osią życia i czyści się po trzydziestu dniach. Archiwum znika z kalendarza,
   **zostaje na osi życia**, nigdy nie wygasa. Użytkownik wybiera przy każdym
   wydarzeniu, z podpowiedzią zależną od tego, czy rzecz już się odbyła.

6. **Zapis cyfrowy godziny jest zawsze 24-godzinny.** Nic nie przesuwa godziny,
   którą użytkownik zapisał. Wynikało to z parsera, ale zostaje jako zasada:
   aplikacja nie zgaduje za użytkownika w sprawach, w których pomyłka jest cicha.

7. **Numery tygodni ISO 8601 są obowiązkowe i zawsze poniedziałkowe.** Ustawienie
   „pierwszy dzień tygodnia" zmienia wyłącznie układ siatki, nigdy numerację.

8. **Kalendarz jest samodzielny.** Żadnych połączeń z innymi aplikacjami, żadnego
   wspólnego modułu czasu dla ekosystemu, żadnych pól o pochodzeniu wydarzenia.
   Wpisy powstają wyłącznie w tej aplikacji. Import i eksport ICS zostają, bo to
   wymiana plików na żądanie użytkownika, a nie stałe połączenie.

---

## Fundament: 106 testów przechodzi

| Moduł | Co robi | Testy |
|---|---|---|
| `recurrence.ts` | rozwijanie serii, wyjątki, wolne terminy, konflikty | 18/18 |
| `iso-week.ts` | numeracja tygodni ISO 8601, zakresy, wyszukiwanie | 19/19 |
| `lifecycle.ts` | kosz, archiwum, widoczność, automatyczne czyszczenie | 19/19 |
| `quick-entry.ts` | parser polskich wyrażeń czasowych — **poza wersją pierwszą** | 50/50 |

Uruchomienie: `node --experimental-strip-types <plik>.test.ts`

### Co złapały testy

Warto wiedzieć, bo to są miejsca, w których łatwo wrócić do błędu:

- **Seria przez zmianę czasu.** „Codziennie o 9:00" przez 25 października 2026 daje
  07:00Z przed zmianą i 08:00Z po, przy stałej godzinie lokalnej. Rozwijanie w UTC
  dałoby 8:00 rano przez pół roku.
- **Dryf przycinania w cyklu miesięcznym.** Seria od 31 grudnia liczona od poprzedniego
  wystąpienia gubiła się na lutym: 31 gru, 31 sty, 28 lut, **28 mar**. Każde wystąpienie
  musi być liczone od DTSTART.
- **DTSTART niezgodny z własnym RRULE.** Seria „co drugi czwartek" założona w piątek
  zaczynała się w piątek.
- **Przełom roku w numeracji ISO.** 1 stycznia 2027 należy do tygodnia **53 roku 2026**.
- **Nagrobek z `title = null`** przy trwałym usuwaniu — kolumna jest `NOT NULL`,
  zapis by się wywalił na bazie.

---

## Pliki

### Wchodzą do aplikacji

```
schema.ts        schemat Drizzle — local-first, miękkie usuwanie, rev ze wspólnej sekwencji
recurrence.ts    rozwijanie serii + wolne terminy + konflikty
iso-week.ts      numeracja tygodni ISO 8601
lifecycle.ts     kosz / archiwum / nagrobki
sync-types.ts    protokół synchronizacji
sync-route.ts    endpoint /api/sync
favicon.svg      znak: oś życia, jeden punkt bursztynowy to teraz
```

### Prototypy interfejsu

```
dodawanie.html   ekran dodawania na bębnach, sześć palet, domyślna: granat
widoki.html      dzień / tydzień / miesiąc z szyną numerów tygodni
```

To są prototypy do przepisania na komponenty, nie kod produkcyjny. Wartość jest
w układzie, zachowaniu i palecie — nie w tym konkretnym HTML-u.

### Poza wersją pierwszą

```
quick-entry.ts        parser — kompletny i przetestowany, nieużywany
stanowisko-testowe.html   stanowisko do parsera — nieaktualne
```

Zostawione świadomie. Jeśli parser kiedyś wróci jako druga droga wprowadzania,
interfejs `tekst → szkic wydarzenia` jest gotowy.

### Nieaktualne

```
life-calendar-spec.md      powstał przed decyzjami 2–5
przeglad-uzupelnien.md     konflikty 1, 2 i 5 już rozstrzygnięte
```

---

## Zastrzeżenie: synchronizacja nie była uruchomiona

`sync-route.ts` to **jedyny plik, którego nie przetestowałam** — wymaga bazy, Clerk
i zainstalowanego Drizzle. Kod jest przemyślany, ale pierwsze uruchomienie prawie
na pewno będzie wymagało poprawek w typach Drizzle. Traktuj go jak dobry szkic
kontraktu, nie jak gotowy moduł.

Rzeczy, które w nim są celowo i nie należy ich „upraszczać":

- **pull wykonuje się po push, w jednej transakcji** — klient wychodzi ze spójnym
  kursorem i autorytatywnym `rev` na własnych wierszach
- **idempotencja przez `applied_mutation`** — zerwane połączenie na mobilnym
  internecie to norma, klient ponawia całe żądanie
- **kursorem jest `rev` ze wspólnej sekwencji, nie `updated_at`** — znaczniki czasu
  remisują i podlegają przesunięciom zegara

---

## Do pierwszej migracji

```sql
CREATE SEQUENCE IF NOT EXISTS global_rev;
```

Bez tego domyślne wartości `rev` w schemacie nie zadziałają.

Do dopisania w tej samej migracji, zanim powstaną dane:

```sql
ALTER TABLE event
  ADD COLUMN series_id uuid,        -- wspólny dla rozszczepionych części serii
  ADD COLUMN pinned_at timestamptz;

CREATE INDEX event_series_idx ON event (user_id, series_id);
```

---

## Kolejność dalszej pracy

1. Migracja z powyższymi kolumnami
2. Warstwa IndexedDB i klient synchronizacji (kontrakt gotowy w `sync-types.ts`)
3. Przepisanie `widoki.html` i `dodawanie.html` na komponenty
4. Przypomnienia: `next_fire_at` + Vercel Cron + Web Push
   — **pułapka iOS:** Web Push działa w Safari wyłącznie dla aplikacji dodanej
   do ekranu głównego; bez ekranu instruującego instalację połowa użytkowników
   mobilnych nie dostanie żadnego powiadomienia i uzna to za błąd
5. Oś życia — nie wymaga osobnej struktury, to zapytanie po `active + archived`
6. Eksport ICS
7. Import ICS — **wymaga podmiany `expandRule()` na bibliotekę `rrule`**, bo Google,
   Apple i Outlook zawierają reguły spoza obsługiwanego podzbioru (`BYMONTHDAY`,
   `BYSETPOS`, `WKST`). Do czasu podmiany import musi je **odrzucać** z jasnym
   komunikatem, a nie wciągać w okrojonej postaci

---

## Otwarte, nie blokujące

- **Osobny kalendarz świąt i dni wolnych** — czy w ogóle potrzebny, skoro
  kategorie odpadły, a tagi wystarczą do odfiltrowania
- **Scalanie na poziomie pola** zamiast na poziomie wiersza — decyzja może poczekać
  do etapu współdzielenia, bo dopiero tam równoczesna edycja przestaje być teoretyczna
- **Historia zmian** (`event_revision`) — jeśli wejdzie, to wyłącznie po stronie
  serwera, poza synchronizacją
- **Załączniki** — metadane synchronizują się, treść plików pobierana na żądanie
