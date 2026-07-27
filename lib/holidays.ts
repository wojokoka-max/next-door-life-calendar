/**
 * Next Door Callendar — święta
 *
 * Święta nie są zapisywane w pamięci urządzenia. Wyliczają się dla żądanego
 * roku przy każdym otwarciu widoku — to kilkadziesiąt pozycji, więc koszt jest
 * żaden, a zyskujemy to, że nie zaśmiecają danych użytkownika i nie trafiają
 * do kopii zapasowej ani na oś życia.
 *
 * Święta własne (rocznice, urodziny, imieniny) użytkownik dodaje jako zwykłe
 * wydarzenia całodniowe z regułą FREQ=YEARLY — nie potrzebują osobnego mechanizmu.
 *
 * Sedno modułu to daty ruchome. Wielkanoc wyznacza dziewięć innych dat w roku
 * i nie da się jej stabelaryzować — trzeba ją policzyć.
 */

export type HolidaySet = 'urzedowe' | 'koscielne' | 'zwyczajowe' | 'pamieci';
export type HolidayCountry = 'PL' | 'DE';

export interface Holiday {
  /** "YYYY-MM-DD" */
  date: string;
  name: string;
  set: HolidaySet;
  /** dzień ustawowo wolny od pracy */
  free: boolean;
  regions?: string[];
}

type FixedHolidayDef = [number, number, string, HolidaySet, boolean, string[]?];
type MovableHolidayDef = [number, string, HolidaySet, boolean, string[]?];

const MOVABLE_DE: MovableHolidayDef[] = [
  [ -2, 'Karfreitag',                  'urzedowe',   true ],
  [  0, 'Ostersonntag',                'koscielne',  false],
  [  1, 'Ostermontag',                 'urzedowe',   true ],
  [ 39, 'Christi Himmelfahrt',         'urzedowe',   true ],
  [ 49, 'Pfingstsonntag',              'koscielne',  false],
  [ 50, 'Pfingstmontag',               'urzedowe',   true ],
  [ 60, 'Fronleichnam',                'koscielne',  true, ['BW', 'BY', 'HE', 'NW', 'RP', 'SL', 'SN*', 'TH*'] ],
  [-52, 'Weiberfastnacht',             'zwyczajowe', false],
  [-48, 'Rosenmontag',                 'zwyczajowe', false],
  [-46, 'Aschermittwoch',              'koscielne',  false],
];

const FIXED_DE: FixedHolidayDef[] = [
  [ 1,  1, 'Neujahr',                                'urzedowe',   true ],
  [ 1,  6, 'Heilige Drei Konige',                    'koscielne',  true, ['BW', 'BY', 'ST'] ],
  [ 2, 14, 'Valentinstag',                           'zwyczajowe', false],
  [ 3,  8, 'Internationaler Frauentag',              'zwyczajowe', true, ['BE', 'MV'] ],
  [ 5,  1, 'Tag der Arbeit',                         'urzedowe',   true ],
  [ 8, 15, 'Maria Himmelfahrt',                      'koscielne',  true, ['BY*', 'SL'] ],
  [ 9, 20, 'Weltkindertag',                          'zwyczajowe', true, ['TH'] ],
  [10,  3, 'Tag der Deutschen Einheit',              'urzedowe',   true ],
  [10, 31, 'Reformationstag',                        'koscielne',  true, ['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH'] ],
  [11,  1, 'Allerheiligen',                          'koscielne',  true, ['BW', 'BY', 'NW', 'RP', 'SL'] ],
  [11, 11, 'Martinstag',                             'zwyczajowe', false],
  [12,  6, 'Nikolaustag',                            'zwyczajowe', false],
  [12, 24, 'Heiligabend',                            'zwyczajowe', false],
  [12, 25, 'Erster Weihnachtstag',                   'urzedowe',   true ],
  [12, 26, 'Zweiter Weihnachtstag',                  'urzedowe',   true ],
  [12, 31, 'Silvester',                              'zwyczajowe', false],
];

/* ------------------------------------------------------------------ */
/* Wielkanoc                                                           */
/* ------------------------------------------------------------------ */

/**
 * Niedziela Wielkanocna w kalendarzu gregoriańskim.
 * Algorytm Meeusa/Jonesa/Butchera — bez wyjątków i bez tablic.
 *
 * Reguła soborowa brzmi „pierwsza niedziela po pierwszej pełni księżyca
 * po równonocy wiosennej", ale liczy się ją na księżycu umownym, nie
 * astronomicznym — dlatego to arytmetyka, a nie efemerydy.
 */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);   // 3 = marzec, 4 = kwiecień
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const shift = (d: Date, n: number) => {
  const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x;
};

/** Daty liczone względem Wielkanocy: przesunięcie w dniach. */
const MOVABLE: Array<[offset: number, name: string, set: HolidaySet, free: boolean]> = [
  [-52, 'Tłusty czwartek',            'zwyczajowe', false],
  [-49, 'Ostatki',                    'zwyczajowe', false],
  [-46, 'Środa Popielcowa',           'koscielne',  false],
  [ -7, 'Niedziela Palmowa',          'koscielne',  false],
  [ -3, 'Wielki Czwartek',            'koscielne',  false],
  [ -2, 'Wielki Piątek',              'koscielne',  false],
  [ -1, 'Wielka Sobota',              'koscielne',  false],
  [  0, 'Wielkanoc',                  'urzedowe',   true ],
  [  1, 'Poniedziałek Wielkanocny',   'urzedowe',   true ],
  [ 39, 'Wniebowstąpienie Pańskie',   'koscielne',  false],
  [ 49, 'Zielone Świątki · Zesłanie Ducha Świętego', 'urzedowe', true ],
  [ 60, 'Boże Ciało',                 'urzedowe',   true ],
];

/** Daty stałe: [miesiąc 1–12, dzień, nazwa, zbiór, wolne od pracy]. */
const FIXED: Array<[number, number, string, HolidaySet, boolean]> = [
  [ 1,  1, 'Nowy Rok',                                'urzedowe',   true ],
  [ 1,  6, 'Trzech Króli',                            'urzedowe',   true ],
  [ 1, 21, 'Dzień Babci',                             'zwyczajowe', false],
  [ 1, 22, 'Dzień Dziadka',                           'zwyczajowe', false],
  [ 2, 14, 'Walentynki',                              'zwyczajowe', false],
  [ 3,  1, 'Narodowy Dzień Żołnierzy Wyklętych',      'pamieci',    false],
  [ 3,  8, 'Dzień Kobiet',                            'zwyczajowe', false],
  [ 3, 20, 'Pierwszy dzień wiosny',                   'zwyczajowe', false],
  [ 4,  2, 'Rocznica śmierci Jana Pawła II',          'pamieci',    false],
  [ 4, 13, 'Dzień Pamięci Ofiar Zbrodni Katyńskiej',  'pamieci',    false],
  [ 5,  1, 'Święto Pracy',                            'urzedowe',   true ],
  [ 5,  2, 'Dzień Flagi Rzeczypospolitej Polskiej',   'pamieci',    false],
  [ 5,  3, 'Święto Konstytucji 3 Maja',               'urzedowe',   true ],
  [ 5, 26, 'Dzień Matki',                             'zwyczajowe', false],
  [ 6,  1, 'Dzień Dziecka',                           'zwyczajowe', false],
  [ 6, 23, 'Dzień Ojca',                              'zwyczajowe', false],
  [ 8,  1, 'Godzina W — Powstanie Warszawskie',       'pamieci',    false],
  [ 8, 15, 'Wniebowzięcie NMP · Święto Wojska Polskiego', 'urzedowe', true ],
  [ 9,  1, 'Rocznica wybuchu II wojny światowej',     'pamieci',    false],
  [ 9, 30, 'Dzień Chłopaka',                          'zwyczajowe', false],
  [10, 14, 'Dzień Edukacji Narodowej',                'zwyczajowe', false],
  [11,  1, 'Wszystkich Świętych',                     'urzedowe',   true ],
  [11,  2, 'Zaduszki',                                'koscielne',  false],
  [11, 11, 'Narodowe Święto Niepodległości',          'urzedowe',   true ],
  [12,  6, 'Mikołajki',                               'zwyczajowe', false],
  [12, 13, 'Rocznica wprowadzenia stanu wojennego',   'pamieci',    false],
  [12, 24, 'Wigilia Bożego Narodzenia',               'urzedowe',   true ],
  [12, 25, 'Boże Narodzenie',                         'urzedowe',   true ],
  [12, 26, 'Drugi dzień Bożego Narodzenia',           'urzedowe',   true ],
  [12, 31, 'Sylwester',                               'zwyczajowe', false],
];

/* ------------------------------------------------------------------ */

export const ALL_SETS: HolidaySet[] = ['urzedowe', 'koscielne', 'zwyczajowe', 'pamieci'];

export const SET_LABEL: Record<HolidaySet, string> = {
  urzedowe:   'Ustawowo wolne',
  koscielne:  'Kościelne',
  zwyczajowe: 'Zwyczajowe',
  pamieci:    'Rocznice i dni pamięci',
};

/** Wszystkie święta danego roku, posortowane po dacie. */
function defsFor(country: HolidayCountry) {
  return country === 'DE'
    ? { fixed: FIXED_DE, movable: MOVABLE_DE }
    : { fixed: FIXED, movable: MOVABLE };
}

export function holidaysFor(year: number, sets: HolidaySet[] = ALL_SETS, country: HolidayCountry = 'PL'): Holiday[] {
  const easter = easterSunday(year);
  const defs = defsFor(country);
  const out: Holiday[] = [];

  for (const [m, d, name, set, free, regions] of defs.fixed) {
    if (sets.includes(set as HolidaySet)) out.push({
      date: iso(new Date(Date.UTC(year, m - 1, d as number))),
      name: name as string,
      set: set as HolidaySet,
      free: Boolean(free),
      regions,
    });
  }
  for (const [off, name, set, free, regions] of defs.movable) {
    if (sets.includes(set as HolidaySet)) out.push({
      date: iso(shift(easter, off)),
      name: name as string,
      set: set as HolidaySet,
      free: Boolean(free),
      regions,
    });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

/**
 * Święta w zakresie dat — zakres bywa na przełomie roku, więc liczymy
 * dla obu lat i filtrujemy.
 */
export function holidaysInRange(from: string, to: string, sets: HolidaySet[] = ALL_SETS, country: HolidayCountry = 'PL'): Holiday[] {
  const y1 = Number(from.slice(0, 4));
  const y2 = Number(to.slice(0, 4));
  const out: Holiday[] = [];
  for (let y = y1; y <= y2; y++) out.push(...holidaysFor(y, sets, country));
  return out.filter(h => h.date >= from && h.date <= to);
}

/** Mapa data → święta, do szybkiego sprawdzania przy rysowaniu siatki. */
export function holidayMap(from: string, to: string, sets: HolidaySet[] = ALL_SETS, country: HolidayCountry = 'PL'): Map<string, Holiday[]> {
  const m = new Map<string, Holiday[]>();
  for (const h of holidaysInRange(from, to, sets, country)) {
    m.set(h.date, [...(m.get(h.date) ?? []), h]);
  }
  return m;
}

/** Czy dzień jest ustawowo wolny — wliczając niedziele. */
export function isDayOff(date: string, country: HolidayCountry = 'PL'): boolean {
  const d = new Date(date + 'T00:00:00Z');
  if (d.getUTCDay() === 0) return true;
  return holidaysFor(d.getUTCFullYear(), ['urzedowe', 'koscielne', 'zwyczajowe'], country).some(h => h.date === date && h.free);
}
