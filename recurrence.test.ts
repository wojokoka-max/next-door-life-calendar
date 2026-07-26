import {
  expandEvents, findFreeSlots, findConflicts, civilToUtc, utcToCivil,
  type ExpandableEvent, type EventException,
} from '../lib/recurrence.ts';

const TZ = 'Europe/Warsaw';
let pass = 0, fail = 0;

function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; }
  else { fail++; console.log(`  ✗ ${name}${detail ? '\n      ' + detail : ''}`); }
}

const hhmm = (iso: string) => iso.slice(11, 16);
const ymd = (iso: string) => iso.slice(0, 10);

/* ================================================================== */
/* 1. Zmiana czasu — test, który wywraca naiwne implementacje         */
/* ================================================================== */
// W Polsce czas letni kończy się 25 października 2026.
// "Codziennie o 9:00" ma pozostać 9:00 lokalnie po obu stronach zmiany,
// co oznacza RÓŻNE godziny UTC: 07:00Z przed, 08:00Z po.
{
  const ev: ExpandableEvent = {
    id: 'e1', title: 'Podlewanie', timezone: TZ, isAllDay: false,
    dtstartUtc: civilToUtc({ y: 2026, m: 10, d: 23, h: 9, min: 0 }, TZ).toISOString(),
    durationMinutes: 30, rrule: 'FREQ=DAILY',
  };
  const occ = expandEvents([ev], [], {
    from: new Date('2026-10-23T00:00:00Z'),
    to: new Date('2026-10-28T00:00:00Z'),
  });

  check('DST: liczba wystąpień', occ.length === 5, `dostałam ${occ.length}`);
  check('DST: przed zmianą 07:00Z', hhmm(occ[0].startUtc) === '07:00', occ[0].startUtc);
  check('DST: po zmianie 08:00Z', hhmm(occ[occ.length - 1].startUtc) === '08:00', occ[occ.length - 1].startUtc);

  const localHours = occ.map((o) => utcToCivil(new Date(o.startUtc), TZ).h);
  check('DST: godzina lokalna stała', localHours.every((h) => h === 9), localHours.join(','));
}

/* ================================================================== */
/* 2. Cykl tygodniowy z interwałem                                    */
/* ================================================================== */
{
  const ev: ExpandableEvent = {
    id: 'e2', title: 'Siłownia', timezone: TZ, isAllDay: false,
    dtstartUtc: civilToUtc({ y: 2026, m: 7, d: 30, h: 18, min: 0 }, TZ).toISOString(), // czwartek
    durationMinutes: 60, rrule: 'FREQ=WEEKLY;BYDAY=TH;INTERVAL=2',
  };
  const occ = expandEvents([ev], [], {
    from: new Date('2026-07-01T00:00:00Z'),
    to: new Date('2026-09-01T00:00:00Z'),
  });
  const dates = occ.map((o) => ymd(o.startUtc));
  check('WEEKLY co 2 tyg.: daty',
    dates.join(',') === '2026-07-30,2026-08-13,2026-08-27', dates.join(','));
  check('WEEKLY: wszystkie w czwartek',
    occ.every((o) => new Date(o.startUtc).getUTCDay() === 4));
}

/* ================================================================== */
/* 3. COUNT i UNTIL                                                   */
/* ================================================================== */
{
  const base = {
    timezone: TZ, isAllDay: false as const,
    dtstartUtc: civilToUtc({ y: 2026, m: 8, d: 1, h: 10, min: 0 }, TZ).toISOString(),
    durationMinutes: 30,
  };
  const win = { from: new Date('2026-08-01T00:00:00Z'), to: new Date('2027-01-01T00:00:00Z') };

  const c = expandEvents([{ ...base, id: 'c', title: 'X', rrule: 'FREQ=DAILY;COUNT=5' }], [], win);
  check('COUNT=5', c.length === 5, `dostałam ${c.length}`);

  const u = expandEvents([{ ...base, id: 'u', title: 'Y', rrule: 'FREQ=DAILY;UNTIL=20260805T000000Z' }], [], win);
  check('UNTIL', u.length === 4, `dostałam ${u.length}: ${u.map((o) => ymd(o.startUtc)).join(',')}`);
}

/* ================================================================== */
/* 4. Miesięczny z przycięciem dnia (31 → luty)                       */
/* ================================================================== */
{
  const ev: ExpandableEvent = {
    id: 'm', title: 'Rachunek', timezone: TZ, isAllDay: true,
    startDate: '2026-12-31', rrule: 'FREQ=MONTHLY;COUNT=4',
  };
  const occ = expandEvents([ev], [], {
    from: new Date('2026-12-01T00:00:00Z'), to: new Date('2027-05-01T00:00:00Z'),
  });
  const dates = occ.map((o) => o.startDate);
  check('MONTHLY: przycięcie do końca miesiąca',
    dates.join(',') === '2026-12-31,2027-01-31,2027-02-28,2027-03-31', dates.join(','));
}

/* ================================================================== */
/* 5. Wyjątki: odwołanie i nadpisanie                                 */
/* ================================================================== */
{
  const dtstart = civilToUtc({ y: 2026, m: 8, d: 3, h: 12, min: 0 }, TZ);
  const ev: ExpandableEvent = {
    id: 'x', title: 'Lunch', timezone: TZ, isAllDay: false,
    dtstartUtc: dtstart.toISOString(), durationMinutes: 60, rrule: 'FREQ=DAILY;COUNT=4',
  };
  const second = new Date(civilToUtc({ y: 2026, m: 8, d: 4, h: 12, min: 0 }, TZ)).toISOString();
  const third = new Date(civilToUtc({ y: 2026, m: 8, d: 5, h: 12, min: 0 }, TZ)).toISOString();

  const exc: EventException[] = [
    { eventId: 'x', originalStartUtc: second, isCancelled: true },
    {
      eventId: 'x', originalStartUtc: third, isCancelled: false,
      overrideTitle: 'Lunch z Moniką',
      overrideDtstartUtc: civilToUtc({ y: 2026, m: 8, d: 5, h: 13, min: 30 }, TZ).toISOString(),
    },
  ];

  const occ = expandEvents([ev], exc, {
    from: new Date('2026-08-01T00:00:00Z'), to: new Date('2026-08-10T00:00:00Z'),
  });

  check('Wyjątek: odwołane usunięte', occ.length === 3, `dostałam ${occ.length}`);
  const over = occ.find((o) => o.isOverridden);
  check('Wyjątek: nadpisany tytuł', over?.title === 'Lunch z Moniką', over?.title);
  check('Wyjątek: nadpisana godzina',
    utcToCivil(new Date(over!.startUtc), TZ).h === 13, String(utcToCivil(new Date(over!.startUtc), TZ).h));
  check('Wyjątek: tożsamość wystąpienia zachowana', over?.originalStartUtc === third);
}

/* ================================================================== */
/* 6. Całodniowe nie przesuwa się przez strefę                        */
/* ================================================================== */
{
  const ev: ExpandableEvent = {
    id: 'b', title: 'Urodziny', timezone: 'Pacific/Auckland', isAllDay: true,
    startDate: '2027-03-15', rrule: 'FREQ=YEARLY;COUNT=2',
  };
  const occ = expandEvents([ev], [], {
    from: new Date('2027-01-01T00:00:00Z'), to: new Date('2029-01-01T00:00:00Z'),
  });
  check('Całodniowe: data stała niezależnie od strefy',
    occ.map((o) => o.startDate).join(',') === '2027-03-15,2028-03-15',
    occ.map((o) => o.startDate).join(','));
}

/* ================================================================== */
/* 7. Okno przycina, ale nie przesuwa serii                           */
/* ================================================================== */
{
  const ev: ExpandableEvent = {
    id: 'w', title: 'Raport', timezone: TZ, isAllDay: false,
    dtstartUtc: civilToUtc({ y: 2026, m: 1, d: 5, h: 9, min: 0 }, TZ).toISOString(),
    durationMinutes: 30, rrule: 'FREQ=WEEKLY;BYDAY=MO',
  };
  const occ = expandEvents([ev], [], {
    from: new Date('2026-07-01T00:00:00Z'), to: new Date('2026-08-01T00:00:00Z'),
  });
  check('Okno: tylko lipiec', occ.every((o) => ymd(o.startUtc).startsWith('2026-07')),
    occ.map((o) => ymd(o.startUtc)).join(','));
  check('Okno: wszystkie poniedziałki', occ.length === 4, `dostałam ${occ.length}`);
}

/* ================================================================== */
/* 8. Konflikty i wolne terminy                                       */
/* ================================================================== */
{
  const mk = (id: string, h: number, dur: number): ExpandableEvent => ({
    id, title: id, timezone: TZ, isAllDay: false,
    dtstartUtc: civilToUtc({ y: 2026, m: 7, d: 27, h, min: 0 }, TZ).toISOString(),
    durationMinutes: dur,
  });

  const occ = expandEvents([mk('a', 9, 60), mk('b', 9, 30), mk('c', 14, 60)], [], {
    from: new Date('2026-07-27T00:00:00Z'), to: new Date('2026-07-28T00:00:00Z'),
  });

  check('Konflikt wykryty', findConflicts(occ).length === 1, String(findConflicts(occ).length));

  const free = findFreeSlots(
    [{
      start: civilToUtc({ y: 2026, m: 7, d: 27, h: 8, min: 0 }, TZ),
      end: civilToUtc({ y: 2026, m: 7, d: 27, h: 17, min: 0 }, TZ),
    }],
    occ, 60,
  );
  const localFree = free.map((f) =>
    `${utcToCivil(f.start, TZ).h}-${utcToCivil(f.end, TZ).h}`);
  // 8:00–9:00 to pełne 60 minut przed pierwszym wydarzeniem — należy do wyniku.
  check('Wolne okna ≥60 min', localFree.join(',') === '8-9,10-14,15-17', localFree.join(','));
}

console.log(`\n${pass}/${pass + fail} testów przechodzi\n`);
if (fail) process.exitCode = 1;
