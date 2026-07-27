/**
 * Next Door Callendar — rozwijanie serii cyklicznych
 *
 * Zasada: wystąpienia NIE są materializowane w bazie. Rozwijane są
 * na odczycie, w oknie widoku.
 *
 * Sedno poprawności: reguła cykliczności działa w czasie LOKALNYM
 * wydarzenia, nie w UTC. "Codziennie o 9:00" to 9:00 czasu lokalnego —
 * przy zmianie czasu ta sama godzina lokalna to inny moment UTC.
 * Rozwijanie w UTC daje wydarzenia o 8:00 przez pół roku.
 *
 * Bez zależności zewnętrznych. Obsługiwany podzbiór RFC 5545:
 *   FREQ = DAILY | WEEKLY | MONTHLY | YEARLY
 *   INTERVAL, BYDAY (dla WEEKLY), COUNT, UNTIL
 * To dokładnie to, co produkuje parser szybkiego dodawania.
 * Przy imporcie ICS z dowolnymi regułami podmień implementację
 * expandRule() na bibliotekę `rrule` — interfejs zostaje ten sam.
 */

/* ------------------------------------------------------------------ */
/* Konwersje stref czasowych bez biblioteki                            */
/* ------------------------------------------------------------------ */

export interface Civil { y: number; m: number; d: number; h: number; min: number }

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = fmtCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    fmtCache.set(timeZone, f);
  }
  return f;
}

/** Moment w czasie → ścienny czas lokalny w danej strefie. */
export function utcToCivil(instant: Date, timeZone: string): Civil {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute') };
}

/** Przesunięcie strefy (w ms) obowiązujące w danym momencie. */
function offsetAt(instant: Date, timeZone: string): number {
  const c = utcToCivil(instant, timeZone);
  const asUtc = Date.UTC(c.y, c.m - 1, c.d, c.h, c.min);
  // sekundy pomijamy — strefy nie mają przesunięć subminutowych od 1972 r.
  return asUtc - (instant.getTime() - (instant.getTime() % 60000));
}

/**
 * Ścienny czas lokalny → moment w czasie.
 * Dwukrokowe dopasowanie przesunięcia obsługuje przejścia czasu letniego.
 * Godzina nieistniejąca (wiosenny przeskok) jest przesuwana do przodu,
 * godzina podwójna (jesienny) rozstrzygana na rzecz pierwszego wystąpienia.
 */
export function civilToUtc(c: Civil, timeZone: string): Date {
  const naive = Date.UTC(c.y, c.m - 1, c.d, c.h, c.min);
  const off1 = offsetAt(new Date(naive), timeZone);
  let ts = naive - off1;
  const off2 = offsetAt(new Date(ts), timeZone);
  if (off2 !== off1) ts = naive - off2;
  return new Date(ts);
}

/* ------------------------------------------------------------------ */
/* Arytmetyka dat cywilnych                                            */
/* ------------------------------------------------------------------ */

const carrier = (c: Civil) => new Date(Date.UTC(c.y, c.m - 1, c.d, c.h, c.min));

const fromCarrier = (d: Date): Civil => ({
  y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(),
  h: d.getUTCHours(), min: d.getUTCMinutes(),
});

function addDays(c: Civil, n: number): Civil {
  const d = carrier(c); d.setUTCDate(d.getUTCDate() + n); return fromCarrier(d);
}

function addMonths(c: Civil, n: number): Civil {
  const d = carrier(c); const day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return fromCarrier(d);
}

const weekdayOf = (c: Civil) => carrier(c).getUTCDay();

const BYDAY_NUM: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/* ------------------------------------------------------------------ */
/* Model wejścia                                                       */
/* ------------------------------------------------------------------ */

export interface ExpandableEvent {
  id: string;
  title: string;
  timezone: string;
  isAllDay: boolean;
  /** ISO, gdy !isAllDay */
  dtstartUtc?: string | null;
  /** "YYYY-MM-DD", gdy isAllDay */
  startDate?: string | null;
  durationMinutes?: number | null;
  daysCount?: number | null;
  rrule?: string | null;
  categoryId?: string | null;
  priority?: number;
}

export interface EventException {
  eventId: string;
  /** ISO — tożsamość wystąpienia w serii */
  originalStartUtc: string;
  isCancelled: boolean;
  overrideTitle?: string | null;
  overrideDtstartUtc?: string | null;
  overrideDurationMinutes?: number | null;
}

export interface Occurrence {
  eventId: string;
  title: string;
  /** tożsamość wystąpienia — klucz do tabeli wyjątków */
  originalStartUtc: string;
  startUtc: string;
  endUtc: string;
  isAllDay: boolean;
  /** "YYYY-MM-DD" dla całodniowych */
  startDate?: string;
  categoryId?: string | null;
  priority: number;
  isOverridden: boolean;
}

/* ------------------------------------------------------------------ */
/* Parsowanie reguły                                                   */
/* ------------------------------------------------------------------ */

interface Rule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  byday: number[] | null;
  count: number | null;
  until: Date | null;
}

export function parseRule(rrule: string): Rule | null {
  const kv = new Map<string, string>();
  for (const part of rrule.replace(/^RRULE:/i, '').split(';')) {
    const [k, v] = part.split('=');
    if (k && v) kv.set(k.toUpperCase(), v);
  }
  const freq = kv.get('FREQ') as Rule['freq'] | undefined;
  if (!freq || !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return null;

  let until: Date | null = null;
  const u = kv.get('UNTIL');
  if (u) {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(u);
    if (m) {
      until = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)));
    }
  }

  return {
    freq,
    interval: Math.max(1, Number(kv.get('INTERVAL') ?? 1)),
    byday: kv.get('BYDAY')?.split(',').map((d) => BYDAY_NUM[d.trim().toUpperCase()])
      .filter((n) => n !== undefined) ?? null,
    count: kv.has('COUNT') ? Number(kv.get('COUNT')) : null,
    until,
  };
}

/** Zabezpieczenie przed pętlą nieskończoną przy błędnej regule. */
const MAX_ITERATIONS = 10_000;

/**
 * Generuje początki wystąpień w czasie lokalnym wydarzenia.
 * Zwraca tylko te, które mieszczą się w oknie — ale liczy od DTSTART,
 * bo COUNT odnosi się do całej serii, nie do okna.
 */
function* expandRule(
  start: Civil,
  rule: Rule,
  timeZone: string,
  windowEnd: Date,
): Generator<Civil> {
  let emitted = 0;
  let iterations = 0;

  if (rule.freq === 'WEEKLY' && rule.byday?.length) {
    // Blok tygodniowy: początek tygodnia serii, potem co INTERVAL tygodni.
    const startDow = weekdayOf(start);
    let weekAnchor = addDays(start, -startDow); // niedziela tygodnia startowego
    const days = [...rule.byday].sort((a, b) => a - b);

    while (iterations++ < MAX_ITERATIONS) {
      let anyInWindow = false;
      for (const dow of days) {
        const cand = { ...addDays(weekAnchor, dow), h: start.h, min: start.min };
        if (carrier(cand) < carrier(start)) continue;      // przed DTSTART
        const instant = civilToUtc(cand, timeZone);
        if (rule.until && instant > rule.until) return;
        if (rule.count !== null && emitted >= rule.count) return;
        if (instant > windowEnd) { anyInWindow = false; break; }
        emitted++;
        anyInWindow = true;
        yield cand;
      }
      if (!anyInWindow && carrier(weekAnchor) > carrier(fromCarrier(new Date(windowEnd)))) return;
      weekAnchor = addDays(weekAnchor, 7 * rule.interval);
      if (civilToUtc(weekAnchor, timeZone) > windowEnd) return;
    }
    return;
  }

  // Każde wystąpienie liczone od DTSTART, nie od poprzedniego wystąpienia.
  // Inaczej przycięcie 31 → 28 lutego trwale przesuwa całą dalszą serię:
  // 31 gru, 31 sty, 28 lut, 28 mar... zamiast 31 mar.
  let n = 0;
  while (iterations++ < MAX_ITERATIONS) {
    let cur: Civil;
    switch (rule.freq) {
      case 'DAILY':   cur = addDays(start, n * rule.interval); break;
      case 'WEEKLY':  cur = addDays(start, 7 * n * rule.interval); break;
      case 'MONTHLY': cur = addMonths(start, n * rule.interval); break;
      case 'YEARLY':  cur = addMonths(start, 12 * n * rule.interval); break;
    }
    n++;

    const instant = civilToUtc(cur, timeZone);
    if (rule.until && instant > rule.until) return;
    if (rule.count !== null && emitted >= rule.count) return;
    if (instant > windowEnd) return;
    emitted++;
    yield cur;
  }
}

/* ------------------------------------------------------------------ */
/* Rozwijanie                                                          */
/* ------------------------------------------------------------------ */

export interface ExpandOptions {
  from: Date;
  to: Date;
}

export function expandEvents(
  events: ExpandableEvent[],
  exceptions: EventException[],
  { from, to }: ExpandOptions,
): Occurrence[] {
  const byEvent = new Map<string, Map<string, EventException>>();
  for (const ex of exceptions) {
    let m = byEvent.get(ex.eventId);
    if (!m) { m = new Map(); byEvent.set(ex.eventId, m); }
    m.set(new Date(ex.originalStartUtc).toISOString(), ex);
  }

  const out: Occurrence[] = [];

  for (const ev of events) {
    const exMap = byEvent.get(ev.id);

    /* --- wydarzenia całodniowe: przestrzeń dat, bez stref --------- */
    if (ev.isAllDay) {
      if (!ev.startDate) continue;
      const [y, m, d] = ev.startDate.split('-').map(Number);
      const span = Math.max(1, ev.daysCount ?? 1);
      const starts: Civil[] = [];

      if (!ev.rrule) {
        starts.push({ y, m, d, h: 0, min: 0 });
      } else {
        const rule = parseRule(ev.rrule);
        if (!rule) continue;
        for (const c of expandRule({ y, m, d, h: 0, min: 0 }, rule, 'UTC', to)) starts.push(c);
      }

      for (const c of starts) {
        const s = carrier(c);
        const e = new Date(s.getTime() + span * 86_400_000);
        if (e <= from || s >= to) continue;
        const key = s.toISOString();
        const ex = exMap?.get(key);
        if (ex?.isCancelled) continue;
        out.push({
          eventId: ev.id,
          title: ex?.overrideTitle ?? ev.title,
          originalStartUtc: key,
          startUtc: s.toISOString(),
          endUtc: e.toISOString(),
          isAllDay: true,
          startDate: `${c.y}-${String(c.m).padStart(2, '0')}-${String(c.d).padStart(2, '0')}`,
          categoryId: ev.categoryId ?? null,
          priority: ev.priority ?? 0,
          isOverridden: Boolean(ex && !ex.isCancelled),
        });
      }
      continue;
    }

    /* --- wydarzenia godzinowe ------------------------------------- */
    if (!ev.dtstartUtc) continue;
    const dtstart = new Date(ev.dtstartUtc);
    const tz = ev.timezone || 'UTC';
    const dur = (ev.durationMinutes ?? 60) * 60_000;
    const startCivil = utcToCivil(dtstart, tz);

    const starts: Date[] = [];
    if (!ev.rrule) {
      starts.push(dtstart);
    } else {
      const rule = parseRule(ev.rrule);
      if (!rule) continue;
      // Rozwijanie w czasie lokalnym, konwersja każdego wystąpienia osobno —
      // dzięki temu godzina lokalna jest stała przez zmianę czasu.
      for (const c of expandRule(startCivil, rule, tz, to)) starts.push(civilToUtc(c, tz));
    }

    for (const s of starts) {
      const key = s.toISOString();
      const ex = exMap?.get(key);
      if (ex?.isCancelled) continue;

      const actualStart = ex?.overrideDtstartUtc ? new Date(ex.overrideDtstartUtc) : s;
      const actualDur = (ex?.overrideDurationMinutes ?? ev.durationMinutes ?? 60) * 60_000;
      const e = new Date(actualStart.getTime() + actualDur);
      if (e <= from || actualStart >= to) continue;

      out.push({
        eventId: ev.id,
        title: ex?.overrideTitle ?? ev.title,
        originalStartUtc: key,
        startUtc: actualStart.toISOString(),
        endUtc: e.toISOString(),
        isAllDay: false,
        categoryId: ev.categoryId ?? null,
        priority: ev.priority ?? 0,
        isOverridden: Boolean(ex && !ex.isCancelled),
      });
    }
  }

  out.sort((a, b) => a.startUtc.localeCompare(b.startUtc) || a.eventId.localeCompare(b.eventId));
  return out;
}

/* ------------------------------------------------------------------ */
/* Konflikty i wolne terminy — zamiennik "inteligentnego planowania"   */
/* ------------------------------------------------------------------ */

export interface Interval { start: Date; end: Date }

/** Scala nakładające się przedziały. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  if (!intervals.length) return [];
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: Interval[] = [{ ...sorted[0] }];
  for (const iv of sorted.slice(1)) {
    const last = out[out.length - 1];
    if (iv.start <= last.end) {
      if (iv.end > last.end) last.end = iv.end;
    } else out.push({ ...iv });
  }
  return out;
}

/** Wystąpienia nachodzące na siebie — wykrywanie konfliktów. */
export function findConflicts(occurrences: Occurrence[]): Array<[Occurrence, Occurrence]> {
  const timed = occurrences.filter((o) => !o.isAllDay);
  const pairs: Array<[Occurrence, Occurrence]> = [];
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      if (timed[j].startUtc >= timed[i].endUtc) break;   // posortowane po starcie
      pairs.push([timed[i], timed[j]]);
    }
  }
  return pairs;
}

/**
 * Wolne okna w zadanym zakresie dostępności, dłuższe niż minMinutes.
 * Algorytm zamiatania — deterministyczny, testowalny, działa offline.
 */
export function findFreeSlots(
  availability: Interval[],
  occurrences: Occurrence[],
  minMinutes: number,
): Interval[] {
  const busy = mergeIntervals(
    occurrences.filter((o) => !o.isAllDay)
      .map((o) => ({ start: new Date(o.startUtc), end: new Date(o.endUtc) })),
  );

  const free: Interval[] = [];
  const minMs = minMinutes * 60_000;

  for (const window of availability) {
    let cursor = window.start;
    for (const b of busy) {
      if (b.end <= window.start || b.start >= window.end) continue;
      if (b.start > cursor) {
        const gap = { start: cursor, end: b.start < window.end ? b.start : window.end };
        if (gap.end.getTime() - gap.start.getTime() >= minMs) free.push(gap);
      }
      if (b.end > cursor) cursor = b.end;
    }
    if (cursor < window.end && window.end.getTime() - cursor.getTime() >= minMs) {
      free.push({ start: cursor, end: window.end });
    }
  }
  return free;
}
