import type { EventRecord } from './store';

const CRLF = '\r\n';

const pad = (n: number) => String(n).padStart(2, '0');

function compactDate(date: string) {
  return date.replaceAll('-', '');
}

function compactDateTime(date: string, time: string) {
  return `${compactDate(date)}T${time.replace(':', '')}00`;
}

function utcStamp(d = new Date()) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function addMinutes(date: string, time: string, minutes: number) {
  const d = new Date(`${date}T${time}:00`);
  d.setMinutes(d.getMinutes() + minutes);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function addDays(date: string, days: number) {
  const [y, m, d] = date.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + days));
  return x.toISOString().slice(0, 10);
}

function esc(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  out.push(rest);
  return out;
}

export function icsFileName(e: Pick<EventRecord, 'title' | 'date'>) {
  const title = e.title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 48) || 'wydarzenie';
  return `${e.date}-${title}.ics`;
}

export function buildEventIcs(e: EventRecord, now = new Date()) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Next Door Life Calendar//PL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${esc(e.id)}@next-door-life-calendar`,
    `DTSTAMP:${utcStamp(now)}`,
    `SUMMARY:${esc(e.title)}`,
  ];

  if (e.notes) lines.push(`DESCRIPTION:${esc(e.notes)}`);

  if (e.time) {
    const end = addMinutes(e.date, e.time, e.durationMinutes ?? 60);
    const zone = e.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    lines.push(`DTSTART;TZID=${zone}:${compactDateTime(e.date, e.time)}`);
    lines.push(`DTEND;TZID=${zone}:${compactDateTime(end.date, end.time)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${compactDate(e.date)}`);
    lines.push(`DTEND;VALUE=DATE:${compactDate(addDays(e.date, 1))}`);
  }

  if (e.rrule) lines.push(`RRULE:${e.rrule}`);

  if (e.reminders.length && e.time) {
    for (const minutes of e.reminders) {
      lines.push('BEGIN:VALARM');
      lines.push(`TRIGGER:${minutes === 0 ? 'PT0M' : `-PT${minutes}M`}`);
      lines.push('ACTION:DISPLAY');
      lines.push(`DESCRIPTION:${esc(e.title)}`);
      lines.push('END:VALARM');
    }
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.flatMap(fold).join(CRLF) + CRLF;
}
