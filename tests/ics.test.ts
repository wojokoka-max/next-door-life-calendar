import { buildEventIcs, icsFileName } from '../lib/ics.ts';
import type { EventRecord } from '../lib/store.ts';

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = '') =>
  cond ? pass++ : fails.push(`  x ${name}${detail ? ' -> ' + detail : ''}`);

const base: EventRecord = {
  id: 'event-1',
  title: 'Lekarz, kontrola',
  notes: null,
  date: '2026-07-27',
  time: '09:30',
  durationMinutes: 60,
  timezone: 'Europe/Warsaw',
  rrule: null,
  skipped: [],
  seriesId: null,
  reminders: [30],
  weight: 1,
  tags: [],
  completedAt: null,
  pinnedAt: null,
  archivedAt: null,
  deletedAt: null,
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z',
};

{
  const ics = buildEventIcs(base, new Date('2026-07-01T12:00:00Z'));
  ok('BEGIN:VCALENDAR', ics.includes('BEGIN:VCALENDAR'));
  ok('timed DTSTART with TZID', ics.includes('DTSTART;TZID=Europe/Warsaw:20260727T093000'));
  ok('timed DTEND', ics.includes('DTEND;TZID=Europe/Warsaw:20260727T103000'));
  ok('escaped comma', ics.includes('SUMMARY:Lekarz\\, kontrola'));
  ok('VALARM present', ics.includes('BEGIN:VALARM') && ics.includes('TRIGGER:-PT30M'));
}

{
  const allDay = { ...base, time: null, durationMinutes: null, reminders: [] };
  const ics = buildEventIcs(allDay);
  ok('all-day DTSTART', ics.includes('DTSTART;VALUE=DATE:20260727'));
  ok('all-day exclusive DTEND', ics.includes('DTEND;VALUE=DATE:20260728'));
  ok('all-day no alarm', !ics.includes('BEGIN:VALARM'));
}

{
  const recurring = { ...base, rrule: 'FREQ=WEEKLY' };
  const ics = buildEventIcs(recurring);
  ok('RRULE preserved', ics.includes('RRULE:FREQ=WEEKLY'));
}

ok('safe filename', icsFileName(base) === '2026-07-27-lekarz-kontrola.ics', icsFileName(base));

console.log(`\n${pass}/${pass + fails.length} testow przechodzi\n`);
if (fails.length) console.log(fails.join('\n') + '\n');
