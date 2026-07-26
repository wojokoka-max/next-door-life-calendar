/**
 * Next Door Callendar — numeracja tygodni ISO 8601
 *
 * Reguła: tydzień zaczyna się w poniedziałek, a tydzień 1 to ten,
 * który zawiera pierwszy czwartek roku. Równoważnie: ten, w którym
 * wypada 4 stycznia. Stąd 1 stycznia potrafi należeć do tygodnia 52
 * lub 53 roku POPRZEDNIEGO, a 31 grudnia do tygodnia 1 NASTĘPNEGO.
 *
 * WAŻNE: numeracja ISO jest zawsze poniedziałkowa i NIE zależy od
 * ustawienia "pierwszy dzień tygodnia" w preferencjach użytkownika.
 * To ustawienie zmienia wyłącznie układ siatki w widoku. Powiązanie
 * jednego z drugim to najczęstszy błąd w kalendarzach — u kogoś
 * z niedzielą jako pierwszym dniem numery tygodni zaczynają się
 * rozjeżdżać z resztą świata o jeden.
 *
 * Operujemy na datach cywilnych (bez strefy): numer tygodnia
 * to własność daty w kalendarzu, nie momentu w czasie.
 */

export interface IsoWeek {
  /** rok ISO — bywa inny niż rok kalendarzowy daty */
  year: number;
  /** 1–53 */
  week: number;
}

const DAY = 86_400_000;

/** "YYYY-MM-DD" → nośnik UTC. */
function toUtc(date: string | Date): Date {
  if (date instanceof Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Poniedziałek = 0 … niedziela = 6. */
const isoDow = (d: Date) => (d.getUTCDay() + 6) % 7;

/** Czwartek tygodnia, w którym leży data — kotwica całej numeracji. */
function thursdayOf(d: Date): Date {
  const t = new Date(d);
  t.setUTCDate(t.getUTCDate() - isoDow(t) + 3);
  return t;
}

export function isoWeekOf(date: string | Date): IsoWeek {
  const thu = thursdayOf(toUtc(date));
  const year = thu.getUTCFullYear();
  const firstThu = thursdayOf(new Date(Date.UTC(year, 0, 4)));
  return { year, week: 1 + Math.round((thu.getTime() - firstThu.getTime()) / (7 * DAY)) };
}

/** Liczba tygodni w roku ISO: 52 albo 53. */
export function weeksInIsoYear(year: number): number {
  return isoWeekOf(new Date(Date.UTC(year, 11, 28))).week;
}

/** Zakres dat tygodnia: poniedziałek i niedziela, jako "YYYY-MM-DD". */
export function isoWeekRange(year: number, week: number): { start: string; end: string } {
  const firstThu = thursdayOf(new Date(Date.UTC(year, 0, 4)));
  const monday = new Date(firstThu);
  monday.setUTCDate(monday.getUTCDate() - 3 + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  return { start: iso(monday), end: iso(sunday) };
}

/** Etykieta do interfejsu i wyszukiwarki: "2026-W31". */
export function isoWeekLabel(w: IsoWeek): string {
  return `${w.year}-W${String(w.week).padStart(2, '0')}`;
}

/**
 * Rozbiór tego, co użytkownik wpisze w wyszukiwarkę.
 * Przyjmuje: "31", "W31", "2026-W31", "tydzień 31", "2026/31".
 * Bez roku przyjmuje rok bieżący.
 */
export function parseWeekQuery(input: string, currentYear: number): IsoWeek | null {
  const s = input.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l');
  let m = /^(\d{4})[-/\s]?w?(\d{1,2})$/.exec(s)
       ?? /^w(\d{1,2})$/.exec(s)
       ?? /^(?:tydzien|tyg\.?)\s*(\d{1,2})$/.exec(s)
       ?? /^(\d{1,2})$/.exec(s);
  if (!m) return null;

  const hasYear = m.length === 3;
  const year = hasYear ? Number(m[1]) : currentYear;
  const week = Number(hasYear ? m[2] : m[1]);
  if (week < 1 || week > weeksInIsoYear(year)) return null;
  return { year, week };
}

/** Zakres do skopiowania: "27 lipca – 2 sierpnia 2026 (tydzień 31)". */
export function isoWeekPretty(year: number, week: number, locale = 'pl-PL'): string {
  const { start, end } = isoWeekRange(year, week);
  const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const endFmt = new Intl.DateTimeFormat(locale, {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
  return `${fmt.format(toUtc(start))} – ${endFmt.format(toUtc(end))} (tydzień ${week})`;
}
