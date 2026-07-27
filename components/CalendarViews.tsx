'use client';

import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { buildEventIcs, icsFileName } from '@/lib/ics';
import { holidayMap, type Holiday, type HolidayCountry } from '@/lib/holidays';
import { isoWeekOf } from '@/lib/iso-week';
import {
  all as loadEvents,
  create,
  put,
  purgeOldTrash,
  saveSettings,
  settings as loadSettings,
  type EventRecord,
  type Weight,
} from '@/lib/store';

type View = 'day' | 'week' | 'month' | 'year';
type Repeat = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
type ReminderMode = 'panel' | 'system' | 'both';
type ThemeName = 'granat' | 'lazur' | 'atrament' | 'porcelana' | 'nokturn' | 'petrol';

interface Occurrence {
  id: string;
  title: string;
  day: Date;
  date: string;
  time: string | null;
  durationMinutes: number | null;
  rrule: string | null;
  reminders: number[];
  reminderMode: ReminderMode;
  weight: Weight;
}

interface ReminderNotice {
  key: string;
  title: string;
  when: string;
  dueAt: number;
  mode: ReminderMode;
}

const HOUR_PX = 46;
const DOW = ['pon', 'wt', 'sr', 'czw', 'pt', 'sob', 'nd'];
const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];
const REMINDER_TAG_PREFIX = 'reminder-mode:';
const THEMES: { id: ThemeName; label: string; swatch: string }[] = [
  { id: 'granat', label: 'Granat', swatch: '#8FB8D9' },
  { id: 'lazur', label: 'Lazur', swatch: '#2C5D8F' },
  { id: 'atrament', label: 'Atrament', swatch: '#C7A868' },
  { id: 'porcelana', label: 'Porcelana', swatch: '#1F5B63' },
  { id: 'nokturn', label: 'Nokturn', swatch: '#B7A2CE' },
  { id: 'petrol', label: 'Petrol', swatch: '#E3A24A' },
];
const MONTH_YEAR = new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const DAY_LONG = new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const D_SHORT = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const D_FULL = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const U = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const iso = (d: Date) => d.toISOString().slice(0, 10);
const todayCivil = () => {
  const n = new Date();
  return U(n.getFullYear(), n.getMonth(), n.getDate());
};
const addD = (d: Date, n: number) => {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
};
const addM = (d: Date, n: number) => {
  const x = new Date(d);
  const day = x.getUTCDate();
  x.setUTCDate(1);
  x.setUTCMonth(x.getUTCMonth() + n);
  const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(day, last));
  return x;
};
const civil = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return U(y, m - 1, d);
};
const isoDow = (d: Date) => (d.getUTCDay() + 6) % 7;
const mondayOf = (d: Date) => addD(d, -isoDow(d));
const wk = (d: Date) => isoWeekOf(d).week;

function startDateTime(o: Occurrence): Date | null {
  if (!o.time) return null;
  return new Date(`${o.date}T${o.time}:00`);
}

function activeRecords(records: EventRecord[]) {
  return records.filter(r => !r.deletedAt && !r.archivedAt);
}

function repLabel(rr: string) {
  const f = /FREQ=(\w+)/.exec(rr)?.[1];
  if (f === 'DAILY') return 'codziennie';
  if (f === 'WEEKLY') return 'co tydzien';
  if (f === 'MONTHLY') return 'co miesiac';
  return 'co roku';
}

function repeatFromRule(rrule: string | null): Repeat {
  const freq = /FREQ=(\w+)/.exec(rrule ?? '')?.[1];
  return freq === 'DAILY' || freq === 'WEEKLY' || freq === 'MONTHLY' || freq === 'YEARLY' ? freq : 'NONE';
}

function reminderModeFromTags(tags: string[] = []): ReminderMode {
  const tag = tags.find(t => t.startsWith(REMINDER_TAG_PREFIX));
  const mode = tag?.slice(REMINDER_TAG_PREFIX.length);
  return mode === 'panel' || mode === 'system' || mode === 'both' ? mode : 'both';
}

function tagsWithReminderMode(tags: string[] = [], mode: ReminderMode) {
  return [...tags.filter(t => !t.startsWith(REMINDER_TAG_PREFIX)), `${REMINDER_TAG_PREFIX}${mode}`];
}

function splitTime(value: string | null) {
  const [hour = '09', minute = '00'] = (value ?? '09:00').split(':');
  return { hour: hour.padStart(2, '0'), minute: minute.padStart(2, '0') };
}

function isTheme(value: string): value is ThemeName {
  return THEMES.some(t => t.id === value);
}

function isHolidayCountry(value: string | undefined): value is HolidayCountry {
  return value === 'PL' || value === 'DE';
}

function holidayTitle(holidays: Holiday[]) {
  return holidays.map(h => `${h.name}${h.regions?.length ? ` - ${h.regions.join(', ')}` : ''}`).join(', ');
}

function holidayShortName(holiday: Holiday, max = 18) {
  const suffix = holiday.regions?.length ? ` ${holiday.regions.join('/')}` : '';
  const clean = `${holiday.name.replace(/\s*\(regional\)/i, '').trim()}${suffix}`;
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}...`;
}

function downloadTextFile(name: string, type: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function occurrenceFromRecord(e: EventRecord, day: Date): Occurrence {
  return {
    id: e.id,
    title: e.title,
    day,
    date: iso(day),
    time: e.time,
    durationMinutes: e.durationMinutes,
    rrule: e.rrule,
    reminders: e.reminders,
    reminderMode: reminderModeFromTags(e.tags),
    weight: e.weight,
  };
}

function occurrences(records: EventRecord[], from: Date, to: Date): Occurrence[] {
  const out: Occurrence[] = [];
  for (const e of activeRecords(records)) {
    const start = civil(e.date);
    if (!e.rrule) {
      if (start >= from && start <= to) out.push(occurrenceFromRecord(e, start));
      continue;
    }

    const freq = /FREQ=(\w+)/.exec(e.rrule)?.[1] ?? 'DAILY';
    for (let n = 0; n < 800; n++) {
      const day =
        freq === 'DAILY' ? addD(start, n) :
        freq === 'WEEKLY' ? addD(start, 7 * n) :
        freq === 'MONTHLY' ? addM(start, n) :
        addM(start, 12 * n);
      if (day > to) break;
      if (day >= from && !e.skipped.includes(iso(day))) out.push(occurrenceFromRecord(e, day));
    }
  }

  return out.sort((a, b) =>
    +a.day - +b.day ||
    (a.time === null ? -1 : b.time === null ? 1 : 0) ||
    (a.time ?? '').localeCompare(b.time ?? '') ||
    b.weight - a.weight);
}

function reminderScan(records: EventRecord[], now = new Date()): ReminderNotice[] {
  const from = addD(todayCivil(), -1);
  const to = addD(todayCivil(), 14);
  const notices: ReminderNotice[] = [];
  for (const o of occurrences(records, from, to)) {
    const start = startDateTime(o);
    if (!start) continue;
    for (const minutes of o.reminders) {
      const dueAt = start.getTime() - minutes * 60_000;
      if (dueAt <= now.getTime() && start.getTime() > now.getTime() - 24 * 60 * 60_000) {
        notices.push({
          key: `${o.id}:${o.date}:${minutes}`,
          title: o.title,
          when: `${o.date} ${o.time}`,
          dueAt,
          mode: o.reminderMode,
        });
      }
    }
  }
  return notices.sort((a, b) => b.dueAt - a.dueAt).slice(0, 5);
}

export default function CalendarViews() {
  const [today, setToday] = useState<Date | null>(null);
  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState(() => U(2026, 6, 26));
  const [selected, setSelected] = useState(() => U(2026, 6, 26));
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeName>('granat');
  const [holidayCountry, setHolidayCountry] = useState<HolidayCountry>('PL');
  const [notices, setNotices] = useState<ReminderNotice[]>([]);
  const fired = useRef(new Set<string>());
  const scroller = useRef<HTMLDivElement>(null);

  const refresh = async () => {
    setEvents(await loadEvents());
  };

  useEffect(() => {
    const t = todayCivil();
    setToday(t);
    setCursor(t);
    setSelected(t);
    let cancelled = false;
    (async () => {
      await purgeOldTrash();
      const [records, prefs] = await Promise.all([loadEvents(), loadSettings()]);
      if (cancelled) return;
      const nextTheme = isTheme(prefs.theme) ? prefs.theme : 'granat';
      const nextHolidayCountry = isHolidayCountry(prefs.holidayCountry) ? prefs.holidayCountry : 'PL';
      setEvents(records);
      setTheme(nextTheme);
      setHolidayCountry(nextHolidayCountry);
      document.documentElement.dataset.theme = nextTheme;
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const tick = () => {
      const due = reminderScan(events).filter(n => !fired.current.has(n.key));
      if (!due.length) return;
      const panelDue = due.filter(n => n.mode !== 'system');
      if (panelDue.length) setNotices(prev => [...panelDue, ...prev].slice(0, 5));
      for (const n of due) {
        fired.current.add(n.key);
        if (n.mode !== 'panel' && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('Przypomnienie', { body: `${n.title} - ${n.when}` });
        }
      }
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [events]);

  useEffect(() => {
    if (view === 'month' || view === 'year' || !scroller.current) return;
    const from = view === 'day' ? cursor : mondayOf(cursor);
    const timed = occurrences(events, from, view === 'day' ? cursor : addD(from, 6)).filter(e => e.time);
    const min = timed.length
      ? Math.min(...timed.map(e => {
          const [h, m] = e.time!.split(':').map(Number);
          return h * 60 + m;
        }))
      : 7 * 60;
    scroller.current.scrollTop = Math.max(0, (min / 60) * HOUR_PX - HOUR_PX);
  }, [view, cursor, events]);

  const label = useMemo(() => {
    if (view === 'day') {
      return {
        main: new Intl.DateTimeFormat('pl-PL', { weekday: 'long', timeZone: 'UTC' }).format(cursor),
        sub: `${new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(cursor)} - tydz. ${wk(cursor)}`,
      };
    }
    if (view === 'month') {
      const [mo, yr] = MONTH_YEAR.format(cursor).split(' ');
      return { main: mo, sub: yr };
    }
    if (view === 'year') {
      return { main: String(cursor.getUTCFullYear()), sub: 'widok roku z numerami tygodni' };
    }
    const mon = mondayOf(cursor);
    return { main: `Tydzien ${wk(mon)}`, sub: `${D_SHORT.format(mon)} - ${D_FULL.format(addD(mon, 6))}` };
  }, [view, cursor]);

  const step = (n: number) =>
    setCursor(c => view === 'year' ? addM(c, 12 * n) : view === 'month' ? addM(c, n) : addD(c, view === 'week' ? 7 * n : n));

  const startAdd = () => {
    setEditingId(null);
    setFormOpen(true);
  };

  const startEdit = (id: string) => {
    setEditingId(id);
    setFormOpen(true);
  };

  const editingEvent = editingId ? events.find(e => e.id === editingId) ?? null : null;

  const changeTheme = async (next: ThemeName) => {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    await saveSettings({ theme: next });
  };

  const changeHolidayCountry = async (next: HolidayCountry) => {
    setHolidayCountry(next);
    await saveSettings({ holidayCountry: next });
  };

  return (
    <main className="mx-auto max-w-[620px] px-[14px] pt-[18px] pb-12">
      <header className="mb-4 flex items-start gap-2">
        <h1 className="m-0 min-w-0 flex-1 font-display text-[18px] font-medium capitalize leading-tight">
          {label.main}
          <small className="mt-px block font-sans text-[12.5px] font-normal normal-case" style={{ color: 'var(--dim)' }}>
            {loading ? 'wczytywanie...' : label.sub}
          </small>
        </h1>
        <button onClick={startAdd}
                className="h-9 rounded-[10px] border px-3 text-[13px] font-semibold"
                style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--on-accent)' }}>
          Dodaj
        </button>
        <button onClick={() => { if (!today) return; setCursor(today); setSelected(today); setView('day'); }}
                className="h-9 rounded-[10px] border px-3 text-[13px]"
                style={{ background: 'var(--surface)', borderColor: 'var(--line)', color: 'var(--muted)' }}>
          Dzis
        </button>
        <div className="flex flex-none gap-1.5">
          {(['<', '>'] as const).map((ch, i) => (
            <button key={ch} onClick={() => step(i === 0 ? -1 : 1)} aria-label={i === 0 ? 'Poprzedni' : 'Nastepny'}
                    className="grid h-9 w-9 place-items-center rounded-[10px] border"
                    style={{ background: 'var(--surface)', borderColor: 'var(--line)', color: 'var(--muted)' }}>
              {ch}
            </button>
          ))}
        </div>
      </header>

      <ReminderPanel notices={notices} onClear={() => setNotices([])} />

      <ThemePicker theme={theme} onChange={changeTheme} />
      <HolidayCountryPicker country={holidayCountry} onChange={changeHolidayCountry} />

      <nav className="mb-3.5 flex gap-1.5">
        {([['day', 'Dzien'], ['week', 'Tydzien'], ['month', 'Miesiac'], ['year', 'Rok']] as const).map(([v, t]) => (
          <button key={v} onClick={() => setView(v)} aria-pressed={view === v}
                  className="flex-1 rounded-[10px] border py-2.5 text-sm"
                  style={{
                    background: view === v ? 'var(--raised)' : 'var(--surface)',
                    borderColor: view === v ? 'var(--accent-line)' : 'var(--line)',
                    color: view === v ? 'var(--text)' : 'var(--dim)',
                    fontWeight: view === v ? 600 : 400,
                  }}>
            {t}
          </button>
        ))}
      </nav>

      {view === 'month' && (
        <MonthView events={events} cursor={cursor} today={today} selected={selected}
                   holidayCountry={holidayCountry}
                   onPick={d => { if (+d === +selected) { setCursor(d); setView('day'); } else setSelected(d); }}
                   onWeek={d => { setCursor(d); setView('week'); }}
                   onEdit={startEdit} />
      )}
      {view === 'year' && (
        <YearView events={events} cursor={cursor} today={today}
                  holidayCountry={holidayCountry}
                  onMonth={d => { setCursor(d); setSelected(d); setView('month'); }}
                  onDay={d => { setCursor(d); setSelected(d); setView('day'); }}
                  onWeek={d => { setCursor(d); setView('week'); }} />
      )}
      {view === 'week' && <WeekView events={events} cursor={cursor} today={today} holidayCountry={holidayCountry} scroller={scroller} onEdit={startEdit} />}
      {view === 'day' && <DayView events={events} cursor={cursor} today={today} holidayCountry={holidayCountry} scroller={scroller} onEdit={startEdit} />}

      <footer className="mt-6 text-xs leading-relaxed" style={{ color: 'var(--dim)' }}>
        Dane zapisuja sie lokalnie w tej przegladarce. Przypomnienia dzialaja, kiedy aplikacja jest otwarta;
        systemowe powiadomienia wymagaja zgody przegladarki.
      </footer>

      {formOpen && (
        <EventDialog
          initialDate={iso(selected)}
          event={editingEvent}
          onClose={() => {
            setFormOpen(false);
            setEditingId(null);
          }}
          onSaved={async d => {
            await refresh();
            setSelected(civil(d));
            setCursor(civil(d));
            setView('day');
            setFormOpen(false);
            setEditingId(null);
          }}
        />
      )}
    </main>
  );
}

function ThemePicker({ theme, onChange }: { theme: ThemeName; onChange: (theme: ThemeName) => void | Promise<void> }) {
  return (
    <section className="mb-3 flex flex-wrap gap-1.5">
      {THEMES.map(t => (
        <button key={t.id} type="button" onClick={() => onChange(t.id)} aria-pressed={theme === t.id}
                className="flex h-8 items-center gap-1.5 rounded-[8px] border px-2 text-[12px]"
                style={{
                  background: theme === t.id ? 'var(--raised)' : 'var(--surface)',
                  borderColor: theme === t.id ? 'var(--accent-line)' : 'var(--line)',
                  color: theme === t.id ? 'var(--text)' : 'var(--muted)',
                  fontWeight: theme === t.id ? 600 : 400,
                }}>
          <span className="h-3.5 w-3.5 rounded-full border" style={{ background: t.swatch, borderColor: 'rgba(128,128,128,.35)' }} />
          {t.label}
        </button>
      ))}
    </section>
  );
}

function HolidayCountryPicker({ country, onChange }: {
  country: HolidayCountry;
  onChange: (country: HolidayCountry) => void | Promise<void>;
}) {
  return (
    <section className="mb-3 flex items-center gap-2 text-xs">
      <span style={{ color: 'var(--muted)' }}>Swieta</span>
      {([['PL', 'Polska'], ['DE', 'Niemcy']] as const).map(([id, label]) => (
        <button key={id} type="button" onClick={() => onChange(id)} aria-pressed={country === id}
                className="rounded-[8px] border px-2.5 py-1.5"
                style={{
                  background: country === id ? 'var(--raised)' : 'var(--surface)',
                  borderColor: country === id ? 'var(--accent-line)' : 'var(--line)',
                  color: country === id ? 'var(--text)' : 'var(--muted)',
                  fontWeight: country === id ? 600 : 400,
                }}>
          {label}
        </button>
      ))}
    </section>
  );
}

function ReminderPanel({ notices, onClear }: { notices: ReminderNotice[]; onClear: () => void }) {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');

  useEffect(() => {
    setPermission(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  }, []);

  const request = async () => {
    if (typeof Notification === 'undefined') return;
    setPermission(await Notification.requestPermission());
  };

  return (
    <section className="mb-3 rounded-[8px] border p-3 text-sm" style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}>
      <div className="flex items-center gap-2">
        <strong className="flex-1">Przypomnienia</strong>
        {permission === 'default' && (
          <button onClick={request} className="rounded-[8px] px-2 py-1 text-xs"
                  style={{ background: 'var(--raised)', color: 'var(--text)' }}>
            Wlacz powiadomienia
          </button>
        )}
        {notices.length > 0 && (
          <button onClick={onClear} className="rounded-[8px] px-2 py-1 text-xs"
                  style={{ background: 'var(--raised)', color: 'var(--muted)' }}>
            Wycisz
          </button>
        )}
      </div>
      {notices.length ? (
        <ul className="m-0 mt-2 grid list-none gap-1 p-0">
          {notices.map(n => <li key={n.key}>{n.title} <span style={{ color: 'var(--dim)' }}>({n.when})</span></li>)}
        </ul>
      ) : (
        <p className="m-0 mt-1 text-xs" style={{ color: 'var(--dim)' }}>
          Brak zaleglych przypomnien.
        </p>
      )}
    </section>
  );
}

function EventDialog({ initialDate, event, onClose, onSaved }: {
  initialDate: string;
  event: EventRecord | null;
  onClose: () => void;
  onSaved: (date: string) => void | Promise<void>;
}) {
  const [title, setTitle] = useState(event?.title ?? '');
  const [date, setDate] = useState(event?.date ?? initialDate);
  const [allDay, setAllDay] = useState(event ? event.time === null : false);
  const initialTime = splitTime(event?.time ?? null);
  const [hour, setHour] = useState(initialTime.hour);
  const [minute, setMinute] = useState(initialTime.minute);
  const [duration, setDuration] = useState(event?.durationMinutes ?? 60);
  const [repeat, setRepeat] = useState<Repeat>(repeatFromRule(event?.rrule ?? null));
  const [reminderWhen, setReminderWhen] = useState(event ? String(event.reminders[0] ?? 'none') : '30');
  const [reminderMode, setReminderMode] = useState<ReminderMode>(reminderModeFromTags(event?.tags ?? []));
  const [weight, setWeight] = useState<Weight>(event?.weight ?? 1);
  const [saving, setSaving] = useState(false);
  const isEditing = Boolean(event);

  const draftRecord = (): EventRecord | null => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return null;
    const hasReminder = reminderWhen !== 'none' && !allDay;
    const now = new Date().toISOString();
    return {
      ...(event ?? {
        id: typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        createdAt: now,
        updatedAt: now,
        skipped: [],
        seriesId: null,
        completedAt: null,
        pinnedAt: null,
        archivedAt: null,
        deletedAt: null,
      }),
      title: cleanTitle,
      notes: event?.notes ?? null,
      date,
      time: allDay ? null : `${hour}:${minute}`,
      durationMinutes: allDay ? null : duration,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      rrule: repeat === 'NONE' ? null : `FREQ=${repeat}`,
      reminders: hasReminder ? [Number(reminderWhen)] : [],
      weight,
      tags: tagsWithReminderMode(event?.tags ?? [], reminderMode),
    };
  };

  const downloadIcs = () => {
    const draft = draftRecord();
    if (!draft) return;
    downloadTextFile(icsFileName(draft), 'text/calendar;charset=utf-8', buildEventIcs(draft));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget as HTMLFormElement);
    const cleanTitle = String(data.get('title') ?? '').trim();
    const formDate = String(data.get('date') ?? initialDate);
    const formAllDay = data.has('allDay');
    const formHour = String(data.get('hour') ?? '09').padStart(2, '0');
    const formMinute = String(data.get('minute') ?? '00').padStart(2, '0');
    const formTime = `${formHour}:${formMinute}`;
    const formDuration = Number(data.get('duration') ?? 60);
    const formReminderWhen = String(data.get('reminderWhen') ?? 'none');
    const formReminderMode = String(data.get('reminderMode') ?? 'both') as ReminderMode;
    const formRepeat = String(data.get('repeat') ?? 'NONE') as Repeat;
    const formWeight = Number(data.get('weight') ?? 1) as Weight;
    if (!cleanTitle) return;
    setSaving(true);
    const input = {
      title: cleanTitle,
      notes: event?.notes ?? null,
      date: formDate,
      time: formAllDay ? null : formTime,
      durationMinutes: formAllDay ? null : formDuration,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      rrule: formRepeat === 'NONE' ? null : `FREQ=${formRepeat}`,
      reminders: formReminderWhen === 'none' || formAllDay ? [] : [Number(formReminderWhen)],
      weight: formWeight,
      tags: tagsWithReminderMode(event?.tags ?? [], formReminderMode),
    };
    if (event) {
      await put({ ...event, ...input });
    } else {
      await create(input);
    }
    await onSaved(formDate);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/50 p-3 sm:place-items-center">
      <form onSubmit={submit}
            className="w-full max-w-[520px] rounded-[8px] border p-4 shadow-xl"
            style={{ background: 'var(--bg)', borderColor: 'var(--line)' }}>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="m-0 flex-1 text-base font-semibold">{isEditing ? 'Edytuj wydarzenie' : 'Dodaj wydarzenie'}</h2>
          <button type="button" onClick={onClose} className="rounded-[8px] border px-3 py-1 text-sm"
                  style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>
            Zamknij
          </button>
        </div>

        <label className="mb-3 block text-sm">
          Tytul
          <input name="title" value={title} onChange={e => setTitle(e.target.value)} autoFocus
                 className="mt-1 w-full rounded-[8px] border px-3 py-2"
                 style={{ background: 'var(--surface)', borderColor: 'var(--line)', color: 'var(--text)' }} />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            Data
            <input name="date" type="date" value={date} onChange={e => setDate(e.target.value)}
                   className="mt-1 w-full rounded-[8px] border px-3 py-2"
                   style={{ background: 'var(--surface)', borderColor: 'var(--line)', color: 'var(--text)' }} />
          </label>
          <fieldset className="m-0 block border-0 p-0 text-sm">
            Godzina
            <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <select name="hour" value={hour} disabled={allDay} onChange={e => setHour(e.target.value)}
                      aria-label="Godzina"
                      className="w-full rounded-[8px] border px-3 py-2 text-center font-mono disabled:opacity-40"
                      style={{ background: 'var(--surface)', borderColor: 'var(--line)', color: 'var(--text)' }}>
                {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
              <span className="font-mono text-base" style={{ color: 'var(--dim)' }}>:</span>
              <select name="minute" value={minute} disabled={allDay} onChange={e => setMinute(e.target.value)}
                      aria-label="Minuty"
                      className="w-full rounded-[8px] border px-3 py-2 text-center font-mono disabled:opacity-40"
                      style={{ background: 'var(--surface)', borderColor: 'var(--line)', color: 'var(--text)' }}>
                {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </fieldset>
          <label className="block text-sm">
            Czas trwania
            <select name="duration" value={duration} disabled={allDay} onChange={e => setDuration(Number(e.target.value))}
                    className="mt-1 w-full rounded-[8px] border px-3 py-2 disabled:opacity-40"
                    style={{ background: 'var(--surface)', borderColor: 'var(--line)', color: 'var(--text)' }}>
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={60}>1 godz.</option>
              <option value={90}>1,5 godz.</option>
              <option value={120}>2 godz.</option>
            </select>
          </label>
          <label className="block text-sm">
            Kiedy przypomniec
            <select name="reminderWhen" value={reminderWhen} disabled={allDay} onChange={e => setReminderWhen(e.target.value)}
                    className="mt-1 w-full rounded-[8px] border px-3 py-2 disabled:opacity-40"
                    style={{ background: 'var(--surface)', borderColor: 'var(--line)', color: 'var(--text)' }}>
              <option value="none">Bez przypomnienia</option>
              <option value="0">O czasie</option>
              <option value="5">5 min przed</option>
              <option value="15">15 min przed</option>
              <option value="30">30 min przed</option>
              <option value="60">1 godz. przed</option>
              <option value="1440">Dzien przed</option>
            </select>
          </label>
          <label className="block text-sm">
            Rodzaj przypomnienia
            <select name="reminderMode" value={reminderMode} disabled={allDay || reminderWhen === 'none'}
                    onChange={e => setReminderMode(e.target.value as ReminderMode)}
                    className="mt-1 w-full rounded-[8px] border px-3 py-2 disabled:opacity-40"
                    style={{ background: 'var(--surface)', borderColor: 'var(--line)', color: 'var(--text)' }}>
              <option value="both">W aplikacji i systemowe</option>
              <option value="panel">Tylko w aplikacji</option>
              <option value="system">Tylko powiadomienie</option>
            </select>
          </label>
          <label className="block text-sm">
            Powtarzanie
            <select name="repeat" value={repeat} onChange={e => setRepeat(e.target.value as Repeat)}
                    className="mt-1 w-full rounded-[8px] border px-3 py-2"
                    style={{ background: 'var(--surface)', borderColor: 'var(--line)', color: 'var(--text)' }}>
              <option value="NONE">Nie powtarzaj</option>
              <option value="DAILY">Codziennie</option>
              <option value="WEEKLY">Co tydzien</option>
              <option value="MONTHLY">Co miesiac</option>
              <option value="YEARLY">Co rok</option>
            </select>
          </label>
          <label className="block text-sm">
            Waga
            <select name="weight" value={weight} onChange={e => setWeight(Number(e.target.value) as Weight)}
                    className="mt-1 w-full rounded-[8px] border px-3 py-2"
                    style={{ background: 'var(--surface)', borderColor: 'var(--line)', color: 'var(--text)' }}>
              <option value={0}>Lekka</option>
              <option value={1}>Normalna</option>
              <option value={2}>Wazna</option>
            </select>
          </label>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm">
          <input name="allDay" type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} />
          Caly dzien
        </label>

        <button disabled={!title.trim() || saving}
                className="mt-4 w-full rounded-[10px] px-4 py-3 font-semibold disabled:opacity-40"
                style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
          {saving ? 'Zapisywanie...' : isEditing ? 'Zapisz zmiany' : 'Zapisz'}
        </button>

        <button type="button" onClick={downloadIcs} disabled={!title.trim()}
                className="mt-2 w-full rounded-[10px] border px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
                style={{ background: 'var(--surface)', borderColor: 'var(--line)', color: 'var(--text)' }}>
          Pobierz do kalendarza (.ics)
        </button>
      </form>
    </div>
  );
}

function MonthView({ events, cursor, today, selected, holidayCountry, onPick, onWeek, onEdit }: {
  events: EventRecord[];
  cursor: Date;
  today: Date | null;
  selected: Date;
  holidayCountry: HolidayCountry;
  onPick: (d: Date) => void;
  onWeek: (d: Date) => void;
  onEdit: (id: string) => void;
}) {
  const first = U(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1);
  const grid = mondayOf(first);
  const map = new Map<string, Occurrence[]>();
  const holidays = holidayMap(iso(grid), iso(addD(grid, 41)), undefined, holidayCountry);
  for (const o of occurrences(events, grid, addD(grid, 41))) {
    const k = iso(o.day);
    map.set(k, [...(map.get(k) ?? []), o]);
  }
  const dayEvents = occurrences(events, selected, selected);
  const selectedHolidays = holidays.get(iso(selected)) ?? [];

  return (
    <>
      <div className="grid gap-0.5" style={{ gridTemplateColumns: '26px repeat(7,1fr)' }}>
        <div />
        {DOW.map(d => (
          <div key={d} className="pb-2 pt-1.5 text-center text-[10.5px] font-semibold uppercase tracking-wider"
               style={{ color: 'var(--muted)' }}>{d}</div>
        ))}
        {Array.from({ length: 6 }, (_, r) => {
          const rowStart = addD(grid, r * 7);
          return (
            <div key={r} className="contents">
              <button onClick={() => onWeek(rowStart)} title={`Tydzien ${wk(rowStart)}`}
                      className="grid place-items-center rounded-md font-mono text-[10.5px]"
                      style={{ color: 'var(--dim)' }}>{wk(rowStart)}</button>
              {Array.from({ length: 7 }, (_, c) => {
                const d = addD(rowStart, c);
                const evs = map.get(iso(d)) ?? [];
                const hols = holidays.get(iso(d)) ?? [];
                const out = d.getUTCMonth() !== cursor.getUTCMonth();
                const isToday = today && +d === +today;
                return (
                  <button key={c} onClick={() => onPick(d)} title={hols.length ? holidayTitle(hols) : undefined}
                          className="flex min-h-[54px] flex-col items-center gap-1 rounded-[9px] border px-1 pb-1 pt-[5px]"
                          style={{
                            background: out ? 'transparent' : +d === +selected ? 'var(--raised)' : hols.length ? 'var(--all-day-bg)' : 'var(--surface)',
                            borderColor: +d === +selected ? 'var(--accent-line)' : 'transparent',
                            opacity: out ? .45 : 1,
                          }}>
                    <span className="text-sm leading-none tabular-nums"
                          style={isToday ? {
                            background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 600,
                            width: 23, height: 23, borderRadius: '50%',
                            display: 'grid', placeItems: 'center',
                          } : undefined}>{d.getUTCDate()}</span>
                    <span className="flex flex-wrap justify-center gap-[3px]">
                      {evs.slice(0, 4).map(e => (
                        <i key={`${e.id}:${e.date}`} className="h-[5px] w-[5px] rounded-full"
                           style={{ background: `var(--w${e.weight + 1})` }} />
                      ))}
                      {hols.length > 0 && <i className="h-[5px] w-[5px] rounded-full" style={{ background: 'var(--accent)' }} />}
                    </span>
                    {evs.length > 4 && <span className="text-[9.5px] leading-none" style={{ color: 'var(--dim)' }}>+{evs.length - 4}</span>}
                    {hols.length > 0 && (
                      <span className="max-w-full truncate text-[8.5px] leading-none" style={{ color: 'var(--muted)' }}>
                        {holidayShortName(hols[0], 12)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      <section className="mt-[18px]">
        <h2 className="mb-2.5 flex items-baseline justify-between text-[11.5px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--muted)' }}>
          {DAY_LONG.format(selected)}
          <span className="font-mono normal-case tracking-normal" style={{ color: 'var(--dim)' }}>tydz. {wk(selected)}</span>
        </h2>
        <HolidayList holidays={selectedHolidays} />
        {dayEvents.length ? <AgendaList events={dayEvents} onEdit={onEdit} /> : !selectedHolidays.length && <p className="m-0 text-sm" style={{ color: 'var(--dim)' }}>Nic zaplanowanego.</p>}
      </section>
    </>
  );
}

function YearView({ events, cursor, today, holidayCountry, onMonth, onDay, onWeek }: {
  events: EventRecord[];
  cursor: Date;
  today: Date | null;
  holidayCountry: HolidayCountry;
  onMonth: (d: Date) => void;
  onDay: (d: Date) => void;
  onWeek: (d: Date) => void;
}) {
  const year = cursor.getUTCFullYear();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: 12 }, (_, month) => (
        <YearMonth
          key={month}
          events={events}
          year={year}
          month={month}
          today={today}
          holidayCountry={holidayCountry}
          onMonth={onMonth}
          onDay={onDay}
          onWeek={onWeek}
        />
      ))}
    </div>
  );
}

function HolidayList({ holidays }: { holidays: Holiday[] }) {
  if (!holidays.length) return null;
  return (
    <ul className="m-0 mb-2 grid list-none gap-[6px] p-0">
      {holidays.map(h => (
        <li key={`${h.date}:${h.name}`}
            className="rounded-[8px] border-l-[3px] px-2.5 py-2 text-[12.5px]"
            style={{
              background: 'var(--all-day-bg)',
              borderLeftColor: h.free ? 'var(--accent)' : 'var(--muted)',
              boxShadow: 'inset 0 0 0 1px var(--all-day-line)',
              color: 'var(--text)',
            }}>
          <strong className="font-medium">{h.name}</strong>
          <span style={{ color: 'var(--dim)' }}>
            {h.regions?.length ? ` - ${h.regions.join(', ')}` : ''}
            {h.free ? ' - wolne' : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

function YearMonth({ events, year, month, today, holidayCountry, onMonth, onDay, onWeek }: {
  events: EventRecord[];
  year: number;
  month: number;
  today: Date | null;
  holidayCountry: HolidayCountry;
  onMonth: (d: Date) => void;
  onDay: (d: Date) => void;
  onWeek: (d: Date) => void;
}) {
  const first = U(year, month, 1);
  const grid = mondayOf(first);
  const map = new Map<string, Occurrence[]>();
  const holidays = holidayMap(iso(grid), iso(addD(grid, 41)), undefined, holidayCountry);
  for (const o of occurrences(events, grid, addD(grid, 41))) {
    const k = iso(o.day);
    map.set(k, [...(map.get(k) ?? []), o]);
  }
  const label = new Intl.DateTimeFormat('pl-PL', { month: 'long', timeZone: 'UTC' }).format(first);

  return (
    <section>
      <button type="button" onClick={() => onMonth(first)}
              className="mb-1.5 w-full rounded-[8px] border px-2 py-1.5 text-left text-[12px] font-semibold capitalize"
              style={{ background: 'var(--surface)', borderColor: 'var(--line)', color: 'var(--text)' }}>
        {label}
      </button>
      <div className="grid gap-0.5" style={{ gridTemplateColumns: '24px repeat(7,1fr)' }}>
        <div className="text-center font-mono text-[8.5px]" style={{ color: 'var(--dim)' }}>tydz.</div>
        {DOW.map(d => (
          <div key={d} className="pb-1 text-center text-[8.5px] font-semibold uppercase" style={{ color: 'var(--muted)' }}>{d}</div>
        ))}
        {Array.from({ length: 6 }, (_, r) => {
          const rowStart = addD(grid, r * 7);
          return (
            <div key={r} className="contents">
              <button type="button" onClick={() => onWeek(rowStart)} title={`Tydzien ${wk(rowStart)}`}
                      className="grid min-h-[24px] place-items-center rounded-[5px] font-mono text-[9px]"
                      style={{ color: 'var(--dim)' }}>
                {wk(rowStart)}
              </button>
              {Array.from({ length: 7 }, (_, c) => {
                const d = addD(rowStart, c);
                const evs = map.get(iso(d)) ?? [];
                const hols = holidays.get(iso(d)) ?? [];
                const out = d.getUTCMonth() !== month;
                const isToday = today && +d === +today;
                return (
                  <button key={c} type="button" onClick={() => onDay(d)} title={hols.length ? holidayTitle(hols) : undefined}
                          className="grid min-h-[24px] place-items-center rounded-[5px] text-[10.5px] tabular-nums"
                          style={{
                            background: evs.length && !out ? 'var(--raised)' : hols.length && !out ? 'var(--all-day-bg)' : 'transparent',
                            color: isToday ? 'var(--on-accent)' : out ? 'var(--dim)' : 'var(--text)',
                            opacity: out ? .42 : 1,
                          }}>
                    <span style={isToday ? {
                      background: 'var(--accent)',
                      borderRadius: '999px',
                      display: 'grid',
                      height: 20,
                      placeItems: 'center',
                      width: 20,
                    } : undefined}>
                      {d.getUTCDate()}
                    </span>
                    {hols.length > 0 && !out && (
                      <span className="max-w-[28px] truncate text-[7.5px] leading-none" style={{ color: 'var(--muted)' }}>
                        {holidayShortName(hols[0], 8)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AgendaList({ events, onEdit }: { events: Occurrence[]; onEdit: (id: string) => void }) {
  return (
    <ul className="m-0 grid list-none gap-[7px] p-0">
      {events.map(e => (
        <li key={`${e.id}:${e.date}`}>
          <button type="button" onClick={() => onEdit(e.id)}
                  className="grid w-full items-center gap-[11px] overflow-hidden rounded-[10px] py-[11px] pr-[13px] text-left"
                  style={{
                    gridTemplateColumns: '52px 3px 1fr',
                    background: e.time ? 'var(--surface)' : 'var(--all-day-bg)',
                    boxShadow: e.time ? undefined : 'inset 0 0 0 1px var(--all-day-line)',
                    color: 'var(--text)',
                  }}>
          <span className="pl-[11px] text-right font-mono text-[13px]" style={{ color: 'var(--dim)' }}>
            {e.time ?? '-'}
          </span>
          <span className="self-stretch rounded-sm" style={{ background: `var(--w${e.weight + 1})` }} />
          <span>
            <span className="text-[15px]">{e.title}</span>
            <br />
            <span className="text-[11.5px]" style={{ color: 'var(--dim)' }}>
              {e.rrule ? repLabel(e.rrule) : 'jednorazowe'}
              {e.reminders.length ? ` - przypomnienie ${e.reminders[0]} min przed` : ''}
            </span>
          </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function HourGutter() {
  return (
    <div className="grid">
      {Array.from({ length: 24 }, (_, h) => (
        <div key={h} className="-translate-y-1.5 border-t pr-1.5 text-right font-mono text-[10.5px]"
             style={{ height: HOUR_PX, borderColor: 'var(--line)', color: 'var(--dim)' }}>
          {String(h).padStart(2, '0')}
        </div>
      ))}
    </div>
  );
}

function Lines() {
  return (
    <div className="absolute inset-0">
      {Array.from({ length: 24 }, (_, i) => (
        <div key={i} className="border-t" style={{ height: HOUR_PX, borderColor: 'var(--line)' }} />
      ))}
    </div>
  );
}

function NowLine({ show }: { show: boolean }) {
  const [top, setTop] = useState<number | null>(null);
  useEffect(() => {
    if (!show) return;
    const t = () => {
      const n = new Date();
      setTop((n.getHours() * 60 + n.getMinutes()) / 60 * HOUR_PX);
    };
    t();
    const id = setInterval(t, 60_000);
    return () => clearInterval(id);
  }, [show]);
  if (!show || top === null) return null;
  return (
    <div className="absolute left-0 right-0 z-10 h-[1.5px]" style={{ top, background: 'var(--accent)' }}>
      <span className="absolute -left-[3px] -top-[3px] h-[7px] w-[7px] rounded-full" style={{ background: 'var(--accent)' }} />
    </div>
  );
}

function Block({ e, wide, onEdit }: { e: Occurrence; wide?: boolean; onEdit: (id: string) => void }) {
  if (!e.time) return null;
  const [hh, mm] = e.time.split(':').map(Number);
  const top = (hh * 60 + mm) / 60 * HOUR_PX;
  const h = Math.max(wide ? 24 : 18, (e.durationMinutes ?? 60) / 60 * HOUR_PX - 2);
  return (
    <button type="button" onClick={() => onEdit(e.id)}
            className="absolute left-px right-px overflow-hidden rounded-[5px] border-l-[3px] text-left"
         style={{
           top, height: h, background: 'var(--raised)', borderLeftColor: `var(--w${e.weight + 1})`, color: 'var(--text)',
           padding: wide ? '5px 9px' : '3px 4px', fontSize: wide ? 13 : 10.5, lineHeight: 1.25,
         }}>
      <b className="block truncate font-medium">{e.title}</b>
      {h > (wide ? 34 : 28) && (
        <i className="font-mono not-italic" style={{ fontSize: wide ? 11 : 9, color: 'var(--dim)' }}>
          {e.time}{e.rrule && wide ? ` - ${repLabel(e.rrule)}` : ''}
        </i>
      )}
    </button>
  );
}

function WeekView({ events, cursor, today, holidayCountry, scroller, onEdit }: {
  events: EventRecord[];
  cursor: Date;
  today: Date | null;
  holidayCountry: HolidayCountry;
  scroller: React.RefObject<HTMLDivElement | null>;
  onEdit: (id: string) => void;
}) {
  const mon = mondayOf(cursor);
  const evs = occurrences(events, mon, addD(mon, 6));
  const holidays = holidayMap(iso(mon), iso(addD(mon, 6)), undefined, holidayCountry);
  const cols = 'repeat(7,1fr)';
  return (
    <>
      <div className="mb-1 grid gap-0.5" style={{ gridTemplateColumns: `38px ${cols}` }}>
        <div />
        {Array.from({ length: 7 }, (_, i) => {
          const d = addD(mon, i);
          const isToday = today && +d === +today;
          return (
            <div key={i} className="pb-1 text-center text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              {DOW[i]}
              <b className="block text-[15px] font-medium normal-case tracking-normal tabular-nums"
                 style={{ color: isToday ? 'var(--accent)' : 'var(--text)' }}>{d.getUTCDate()}</b>
            </div>
          );
        })}
      </div>

      <div className="mb-1.5 grid gap-0.5" style={{ gridTemplateColumns: `38px ${cols}` }}>
        <div className="grid place-items-center text-center text-[9.5px]" style={{ color: 'var(--dim)' }}>caly<br />dzien</div>
        {Array.from({ length: 7 }, (_, i) => {
          const d = addD(mon, i);
          const hols = holidays.get(iso(d)) ?? [];
          return (
            <div key={i} className="grid min-h-[20px] content-start gap-0.5">
              {hols.map(h => (
                <div key={`${h.date}:${h.name}`}
                     className="truncate rounded-[3px] border-l-2 px-[3px] py-[2px] text-[9.5px]"
                     title={h.name}
                     style={{
                       background: 'var(--all-day-bg)',
                       borderLeftColor: h.free ? 'var(--accent)' : 'var(--muted)',
                       boxShadow: 'inset 0 0 0 1px var(--all-day-line)',
                       color: 'var(--text)',
                     }}>
                  {holidayShortName(h, 22)}
                  {h.regions?.length ? ` - ${h.regions.join(', ')}` : ''}
                </div>
              ))}
              {evs.filter(e => !e.time && +e.day === +d).map(e => (
                <button type="button" key={`${e.id}:${e.date}`} onClick={() => onEdit(e.id)}
                        className="truncate rounded-[3px] border-l-2 px-[3px] py-[2px] text-left text-[9.5px]"
                        style={{
                          background: 'var(--all-day-bg)',
                          borderLeftColor: `var(--w${e.weight + 1})`,
                          boxShadow: 'inset 0 0 0 1px var(--all-day-line)',
                          color: 'var(--text)',
                        }}>{e.title}</button>
              ))}
            </div>
          );
        })}
      </div>

      <div ref={scroller} className="max-h-[58vh] overflow-y-auto border-t" style={{ borderColor: 'var(--line)' }}>
        <div className="relative grid gap-0.5" style={{ gridTemplateColumns: `38px ${cols}` }}>
          <HourGutter />
          {Array.from({ length: 7 }, (_, i) => {
            const d = addD(mon, i);
            const isToday = Boolean(today && +d === +today);
            return (
              <div key={i} className="relative border-l"
                   style={{ borderColor: 'var(--line)', background: isToday ? 'rgba(143,184,217,.05)' : undefined }}>
                <Lines />
                {evs.filter(e => e.time && +e.day === +d).map(e => <Block key={`${e.id}:${e.date}`} e={e} onEdit={onEdit} />)}
                <NowLine show={isToday} />
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function DayView({ events, cursor, today, holidayCountry, scroller, onEdit }: {
  events: EventRecord[];
  cursor: Date;
  today: Date | null;
  holidayCountry: HolidayCountry;
  scroller: React.RefObject<HTMLDivElement | null>;
  onEdit: (id: string) => void;
}) {
  const evs = occurrences(events, cursor, cursor);
  const allDay = evs.filter(e => !e.time);
  const holidays = holidayMap(iso(cursor), iso(cursor), undefined, holidayCountry).get(iso(cursor)) ?? [];
  const isToday = Boolean(today && +cursor === +today);
  return (
    <>
      <div className="mb-1.5 grid gap-0.5" style={{ gridTemplateColumns: '44px 1fr' }}>
        <div className="grid place-items-center text-center text-[9.5px]" style={{ color: 'var(--dim)' }}>caly<br />dzien</div>
        <div className="grid min-h-[22px] content-start gap-[3px]">
          <HolidayList holidays={holidays} />
          {allDay.length ? allDay.map(e => (
            <button type="button" key={`${e.id}:${e.date}`} onClick={() => onEdit(e.id)}
                    className="rounded-[5px] border-l-[3px] px-[9px] py-1.5 text-left text-[12.5px]"
                    style={{
                      background: 'var(--all-day-bg)',
                      borderLeftColor: `var(--w${e.weight + 1})`,
                      boxShadow: 'inset 0 0 0 1px var(--all-day-line)',
                      color: 'var(--text)',
                    }}>{e.title}</button>
          )) : !holidays.length && <div className="pl-0.5 pt-1 text-xs" style={{ color: 'var(--dim)' }}>-</div>}
        </div>
      </div>

      <div ref={scroller} className="max-h-[58vh] overflow-y-auto border-t" style={{ borderColor: 'var(--line)' }}>
        <div className="relative grid gap-0.5" style={{ gridTemplateColumns: '44px 1fr' }}>
          <HourGutter />
          <div className="relative border-l" style={{ borderColor: 'var(--line)' }}>
            <Lines />
            {evs.filter(e => e.time).map(e => <Block key={`${e.id}:${e.date}`} e={e} wide onEdit={onEdit} />)}
            <NowLine show={isToday} />
          </div>
        </div>
      </div>
    </>
  );
}
